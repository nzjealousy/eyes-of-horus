import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import type { HorusAgent, HorusLogEntry, HorusProgress } from '../types'
import { fmtElapsed } from '../hooks/clients/agent-clock'
import type { BackdropApi, Card } from '../hooks/pane'
import {
  agentSvg,
  barFill,
  buildCards,
  railEntries,
  roster,
  scrollOffset,
  cardLayout,
  clockSvg,
  elapsedLabel,
  fitText,
  fmtCost,
  fmtTokens,
  groupCards,
  headerLayout,
  OPEN_W,
  plannedLayout,
  plannedSvg,
  railWindow,
  rowSvg,
  setBackdrop,
  textWidth,
  tierOf,
  TOGGLE_W,
  trunc,
  X0,
} from '../hooks/pane'

const A = (id: string, title: string, status: HorusAgent['status'] = 'running', endedAt?: number, type = 'worker'): HorusAgent => ({
  id,
  type,
  title,
  status,
  startedAt: 1000,
  ...(endedAt === undefined ? {} : { endedAt }),
})

const flow = (tasks: { title: string; after?: number[]; tier?: string }[]): HorusProgress => ({
  title: 'Flow',
  total: tasks.length,
  done: 0,
  phase: 'delegate',
  finished: false,
  tasks: tasks.map(t => ({ title: t.title, tier: t.tier ?? 'medium', after: t.after ?? [], status: 'pending' })),
})

test('cards: plain list without tasks, elapsed from startedAt/endedAt', async () => {
  const cards = buildCards([A('a1', 'one'), A('a2', 'two', 'done', 4000)], null, 11000)
  expect(cards.map(c => [c.key, c.depth, c.ms])).toEqual([
    ['a1', 0, 10000],
    ['a2', 0, 3000],
  ])
})

test('cards: tasks joined with agents, tree by after, strays last', async () => {
  const p = flow([{ title: 'T1' }, { title: 'T2', after: [1] }, { title: 'T3' }, { title: 'T4', after: [1, 2] }, { title: 'T5', after: [9, 5] }])
  const cards = buildCards([A('a1', 'T1', 'done', 2000), A('a2', 'T2'), A('x', 'other')], p, 5000)
  expect(cards.map(c => `${c.depth}:${c.title}:${c.agentId ?? '-'}:${c.status}`)).toEqual([
    '0:T1:a1:done',
    '1:T2:a2:running',
    '2:T4:-:pending',
    '0:T3:-:pending',
    '0:T5:-:pending', // forward/self/out-of-range refs are ignored
    '0:other:x:running',
  ])
  expect(cards[0]?.tier).toBe('medium')
})

test('tiers come from savvy-flow agent types; groups split running, finished (newest first) and planned', async () => {
  expect([tierOf('savvy-flow:savvy-careful'), tierOf('savvy-heavy'), tierOf('savvy-flow:savvy-nope'), tierOf('Explore'), tierOf('careful')]).toEqual([
    'careful',
    'heavy',
    undefined,
    undefined,
    undefined,
  ])
  const list = [A('a1', 'one', 'done', 2000, 'savvy-flow:savvy-light'), A('a2', 'two', 'failed', 3000), A('a3', 'three')]
  const cards = buildCards(list, flow([{ title: 'one', tier: 'fable' }, { title: 'later' }]), 5000)
  expect(cards.find(c => c.key === 'a1')?.tier).toBe('fable') // the task's tier wins over the type's
  expect(buildCards(list, null, 5000)[0]?.tier).toBe('light')
  const g = groupCards(cards)
  expect([g.running.map(c => c.key), g.finished.map(c => c.key), g.planned.map(c => c.title)]).toEqual([['a3'], ['a2', 'a1'], ['later']])
})

test('formatting: elapsed, tokens, cost, truncation, rail window', async () => {
  expect([fmtElapsed(-5), fmtElapsed(42_900), fmtElapsed(187_000), fmtElapsed(3_725_000)]).toEqual(['00:00', '00:42', '03:07', '1:02:05'])
  expect([fmtTokens(950), fmtTokens(12_400), fmtTokens(2_500_000)]).toEqual(['950', '12k', '2.5M'])
  expect([fmtCost(1.5), fmtCost(12.34)]).toEqual(['≈$1.50', '≈$12.3'])
  expect([trunc('abcdef', 4), trunc('abc', 4), trunc('abc', 0)]).toEqual(['abc…', 'abc', ''])
  const log: HorusLogEntry[] = Array.from({ length: 10 }, (_, i) => ({ at: i, kind: 'tool', label: `t${i}` }))
  expect(railWindow(log, 3).map(r => r.label)).toEqual(['t7', 't8', 't9'])
  expect(railWindow([], 3)).toEqual([])
  const c = (status: Card['status'], ms?: number): Card => ({ key: 'k', depth: 0, type: 'x', title: 't', status, ...(ms === undefined ? {} : { ms }) })
  // A refused run (failed in under a second) and a card with no start read '—'.
  expect([elapsedLabel(c('failed', 0)), elapsedLabel(c('failed', 1500)), elapsedLabel(c('done', 0)), elapsedLabel(c('pending'))]).toEqual(['—', '00:01', '00:00', '—'])
})

// The pane's desktop width for 30..60 body columns, as the render computes it.
const WIDTHS = Array.from({ length: 31 }, (_, i) => Math.max(240, Math.min(900, (30 + i) * 8 - 8)))
const fits = (a: number, b: number) => expect(a).toBeLessThan(b + 0.001)

test('fitText cuts to the width with an ellipsis, or to nothing when even that does not fit', async () => {
  expect(fitText('short', 12, 200)).toBe('short')
  for (const s of ['Build the very long titled pane', 'W'.repeat(40), '漢字'.repeat(20)])
    for (const w of [10, 40, 90, 160]) {
      const out = fitText(s, 13, w)
      fits(textWidth(out, 13), w)
      expect(out === '' || out.endsWith('…')).toBe(true)
    }
  expect(fitText('abc', 13, 2)).toBe('')
})

test('card layout: at 30..60 columns every text stays in its slot, clear of the clock, the mark and the ↗ corner', async () => {
  const cases: Card[] = []
  for (const title of ['x', 'Build the very long titled pane with many words in it', 'W'.repeat(80), '漢字のタイトル'.repeat(6), ''])
    for (const status of ['running', 'done', 'failed'] as const)
      for (const ms of [0, 42_000, 263_000, 3_725_000, 36_000_000])
        for (const tier of ['careful', 'fable', undefined])
          cases.push({ key: 'k', depth: 0, ...(tier ? { tier } : {}), type: 'savvy-flow:savvy-careful', title, status, agentId: 'a', ms, tokens: 1_234_567 })
  for (const W of WIDTHS)
    for (const c of cases) {
      const L = cardLayout(W, c)
      fits(X0 + textWidth(L.title, 13), L.titleR) // title
      fits(L.titleR + 8, L.clockR - L.clock.w) // then the clock, at its widest
      fits(L.clockR, L.markX - 6) // then the status mark
      fits(L.markX + 6, W - OPEN_W) // and the ↗ Button's corner stays empty
      expect(L.title.length).toBeGreaterThan(0)
      fits(textWidth(L.who, 11) + 6 + textWidth(L.meta, 11), L.lineW) // second line, short of the corner too
      fits(X0 + textWidth(L.stats, 11), W - 10) // tokens, under the corner
    }
  for (const W of WIDTHS) {
    const p = plannedLayout(W, { key: 'p', depth: 0, tier: 'medium', type: 'medium', title: 'A planned task with a fairly long title that goes on', status: 'pending' })
    fits(X0 + textWidth(p.title, 13), W - 26)
    fits(textWidth(p.who, 11) + 6 + textWidth(p.meta, 11), p.lineW)
    const use = { contextPct: 0, contextUsed: 0, contextMax: 0, tokensTotal: 123_456_789, costUsd: 1234.5, agentTimeMs: 3_599_000, turns: 1 }
    const h = headerLayout(W, 'Gods pane overlap fix for the Eyes of Horus mod', use)
    fits(textWidth('Gods', 14) + textWidth(h.rest, 14), W - TOGGLE_W - 8) // left of the Collapse corner
    for (const v of h.values) fits(textWidth(v, 15), h.tw - 12)
  }
})

test('the running clock ticks inside the Svg: digit columns delayed by the elapsed time, each format in its window', async () => {
  const run = (ms: number): Card => ({ key: 'k', depth: 0, type: 'x', title: 't', status: 'running', ms })
  const fresh = clockSvg(100, 20, 12, run(42_000)).svg
  expect(fresh).toContain('animation-delay:-42s')
  expect(fresh).toContain('animation:eoh-off 1s 3558s forwards') // the mm:ss form leaves at an hour
  expect(fresh).toContain('<g style="animation:eoh-off 3558s">') // and the h:mm:ss form arrives then
  const later = clockSvg(100, 20, 12, run(263_000))
  expect(later.svg).not.toContain('eoh-off 1s -') // no window already past
  expect(later.svg).toContain('animation:eoh-off 1s 3337s forwards')
  expect(later.w).toBeGreaterThan(clockSvg(100, 20, 12, { ...run(0), status: 'done' }).w)
  expect(clockSvg(100, 20, 12, { ...run(0), status: 'failed' }).svg).toContain('>—<')
  // Each drawing phases its patch of the dotted grid by its offset down the section.
  expect(rowSvg(240, 'Running · 1', 40)).toContain('<pattern id="d" y="-8"')
})

test('card drawings: one well-formed Svg each, walking only while running, escaped titles', async () => {
  const [run, done] = buildCards(
    [{ ...A('a1', 'Fix <the> "bug" & more', 'running', undefined, 'savvy-careful'), tokens: 12_400 }, A('a2', 'Done', 'done', 4000, 'savvy-heavy')],
    null,
    9000,
  )
  const r = agentSvg(320, run!)
  expect(r.startsWith('<svg') && r.endsWith('</svg>')).toBe(true)
  expect(agentSvg(900, run!)).toContain('Fix &lt;the&gt; &quot;bug&quot; &amp; more') // escaped
  expect(r).toContain('Fix &lt;the&gt;') // and cut to its slot when narrow
  expect(r).toContain('eoh-walk') // the god walks
  expect(r).toContain('class="sheen"') // and the progress line runs
  expect(r).toContain('Horus · careful')
  expect(r).toContain('Opus · high')
  expect(r).toContain('12k tokens')
  expect(r).toContain('height="78"')
  const d = agentSvg(320, done!)
  expect(d).not.toContain('eoh-walk')
  expect(d).not.toContain('class="sheen"')
  expect(d).toContain('Anubis · heavy')
  expect(d).not.toContain('tokens') // none known
  const p = plannedSvg(320, { key: 'task:0', depth: 0, tier: 'light', type: 'light', title: 'Later', status: 'pending' })
  expect(p).toContain('Bastet · light')
  expect(p).toContain('planned')
  expect(p).not.toContain('eoh-walk')
  for (const s of [r, d, p]) expect(s.length).toBeLessThan(131072)
})

test('setBackdrop takes whichever call the engine has and never throws', async () => {
  const seen: string[] = []
  // As on 2.1.317: no theme noun, $.ui.backdrop works.
  const old = async (b: { glass: { tint: string; opacity: number } }) => void seen.push(`ui:${b.glass.tint}:${b.glass.opacity}`)
  await setBackdrop({ ui: { backdrop: old } } as unknown as BackdropApi)
  // As on 2.1.319: theme.set works, $.ui.backdrop is gone.
  const set = async (a: { backdrop: { id: string } }) => void seen.push(`theme:${a.backdrop.id}`)
  await setBackdrop({ ui: {}, theme: { set } } as unknown as BackdropApi)
  // Neither, or both refuse: nothing escapes.
  await setBackdrop({ ui: {} } as unknown as BackdropApi)
  await setBackdrop({ theme: { set: () => Promise.reject(new Error('no surface')) }, ui: {} } as unknown as BackdropApi)
  expect(seen).toEqual(['ui:#0c0816:0.78', 'theme:horus'])
})

const PANE = {
  plugin: 'eyes-of-horus',
  component: 'Pane',
  requestId: 'horus',
  props: {
    title: 'Gods',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

// The state beneath the plugin: seeded values (unwrapped); any other key (the pane's folds) is the kit's own store.
function seed(on: On, values: Record<string, unknown>) {
  const shapes: Record<string, string> = { agents: 'agents-1', progress: 'progress-1', sessionLog: 'log-1', usage: 'usage-1' }
  on('state.get', (_, e, next) => {
    const shape = shapes[e.key]
    if (shape === undefined) return next(e)
    if (!(e.key in values)) return { value: { value: undefined, version: 0 } }
    return { value: { value: { shape, value: values[e.key] }, version: 1 } }
  })
  mock.clock(on, { now: 66_000 })
}

const SEEDED = {
  agents: [
    { ...A('a1', 'Build the very long titled pane with many words', 'running', undefined, 'savvy-flow:savvy-careful'), tokens: 5000 },
    A('a2', 'Done task', 'done', 4000),
  ],
  progress: flow([{ title: 'Done task' }, { title: 'Planned task', tier: 'light' }]),
  sessionLog: [
    { at: 1, kind: 'prompt', label: 'make it so' },
    { at: 2, kind: 'tool', label: 'Read · a.ts' },
    { at: 3, kind: 'reply', label: 'ok' },
  ],
  usage: { contextPct: 41.6, contextUsed: 0, contextMax: 0, tokensTotal: 12_400, costUsd: 0.42, agentTimeMs: 125_000, turns: 3 },
}

test('the pane draws cards and the rail, and a press opens the agent, on every surface', async ($, on) => {
  seed(on, SEEDED)
  const viewed: unknown[] = []
  const toasts: string[] = []
  on('ui.view', (_, e) => {
    viewed.push(e)
    return { value: { deny: 'no row' } }
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /turns 3 · 02:05 · ctx 42%/ }))?.text).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'make it so' })).toBeDefined()
    expect((await ui.findAll({ type: 'Text', text: '│' })).length).toBe(2)
    if (surface === 'terminal') {
      expect((await ui.find({ type: 'Text', text: /^00:03$/ }))?.text).toBe('00:03')
      // Running card ticks in its Client: 65s at render, then +2 ticks.
      expect((await ui.find({ type: 'Text', text: /01:05/, in: 'clock:a1' }))?.text).toBe('01:05')
      await ui.advance(2000)
      expect((await ui.find({ type: 'Text', text: /01:0\d/, in: 'clock:a1' }))?.text).toBe('01:07')
    } else {
      // The desktop card's clock is in its Svg (CSS-stepped from 65s), the time in its alt; no Text lies over the card.
      const alts = (await ui.findAll({ type: 'Svg' })).map(s => [String(s.props.alt), String(s.props.source)] as const)
      expect(alts.find(([a]) => a.startsWith('Done task'))?.[0]).toContain(', 00:03')
      expect(alts.find(([a]) => a.startsWith('Build the very long'))?.[1]).toContain('animation-delay:-65s')
      expect(await ui.find({ type: 'Text', text: /^\d\d:\d\d$/ })).toBeUndefined()
      expect(await ui.find({ type: 'Client' })).toBeUndefined()
    }
    // The open control draws only its arrow (a desktop draws a Button's label as text).
    const button = (await ui.find({ key: 'agent:a1' }))?.text ?? ''
    if (surface === 'desktop') expect(button).toBe('↗')
    else expect(button.length).toBeLessThan(40)
    await ui.press({ key: 'agent:a1' })
    await ui.unmount()
  }
  expect(viewed).toEqual([{ agentId: 'a1' }, { agentId: 'a1' }])
  expect(toasts.length).toBe(2)
})

test('desktop: header tiles, grid, one Svg per card, groups and a planned card; terminal: god glyphs', async ($, on) => {
  seed(on, SEEDED)
  const desk = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const svgs = await desk.findAll({ type: 'Svg' })
  const alts = svgs.map(s => String(s.props.alt))
  expect(String(svgs[0]?.props.source)).toContain('<pattern id="d"') // the header's patch of the grid
  expect(alts).toContain('Gods: ≈$0.42, 12k tokens, 02:05')
  expect(alts).toContain('Slaves')
  expect(alts.some(a => a.startsWith('Ra waiting') && a.includes('Horus running'))).toBe(true)
  expect(alts.some(a => a.includes('crab-designer waiting'))).toBe(true)
  expect(alts.some(a => a.startsWith('Build the very long') && a.includes('Horus · careful, running'))).toBe(true)
  expect(alts.some(a => a.startsWith('Done task') && a.includes('finished'))).toBe(true)
  expect(alts).toContain('Planned task: Bastet · light, planned')
  for (const s of svgs) expect(String(s.props.source).length).toBeLessThan(131072)
  for (const label of ['Running · 1', 'Finished · 1', 'Planned · 1']) expect(alts).toContain(label)
  // Rows stack down one grid: each drawing's pattern is phased by the heights above it (header 78, roster 60, head 24, card 78, plan 46).
  expect(svgs.map(s => /<pattern id="d" y="(-?\d+)"/.exec(String(s.props.source))?.[1])).toEqual(['0', '-14', '-10', '-2', '0', '-8', '-6', '-14', '-12', '-4'])
  await desk.unmount()

  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await term.find({ type: 'Svg' })).toBeUndefined()
  expect(await term.find({ type: 'Text', text: '𓅃 ' })).toBeDefined() // Horus for the careful agent
  expect(await term.find({ type: 'Text', text: ' Planned task' })).toBeDefined()
  await term.unmount()
})

test('The Hall of Truth and Gods fold and unfold', async ($, on) => {
  seed(on, SEEDED)
  // Each step mounts afresh, so the check reads what the press wrote without leaning on redraw timing.
  for (const surface of ['terminal', 'desktop'] as const) {
    const press = async (key: string) => {
      const ui = await $.ui.mount({ ...PANE, surface })
      await ui.press({ key })
      await ui.unmount()
      return $.ui.mount({ ...PANE, surface })
    }
    let ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ key: 'session-toggle' }))?.text).toBe('▾ The Hall of Truth:')
    expect((await ui.find({ key: 'agents-toggle' }))?.text).toBe('Collapse')
    await ui.unmount()

    ui = await press('session-toggle')
    expect((await ui.find({ key: 'session-toggle' }))?.text).toBe('▸ The Hall of Truth:')
    expect(await ui.find({ type: 'Text', text: /turns 3/ })).toBeDefined() // the one-line stats stay
    expect(await ui.find({ type: 'Text', text: 'make it so' })).toBeUndefined()
    await ui.unmount()

    ui = await press('agents-toggle')
    expect((await ui.find({ key: 'agents-toggle' }))?.text).toBe('Expand')
    expect(await ui.find({ key: 'agent:a1' })).toBeUndefined()
    // Folded: the summary line and one strip of every sprite.
    if (surface === 'desktop') expect((await ui.findAll({ type: 'Svg' })).some(s => String(s.props.source).includes('agents 2 · run 1'))).toBe(true)
    else expect(await ui.find({ type: 'Text', text: /agents 2 · run 1/ })).toBeDefined()
    if (surface === 'desktop') expect((await ui.findAll({ type: 'Svg' })).some(s => String(s.props.alt).startsWith('Ra waiting') && String(s.props.alt).includes('crab-designer'))).toBe(true)
    await ui.unmount()

    // Back open for the next surface.
    await (await press('session-toggle')).unmount()
    ui = await press('agents-toggle')
    expect(await ui.find({ type: 'Text', text: 'make it so' })).toBeDefined()
    expect(await ui.find({ key: 'agent:a1' })).toBeDefined()
    await ui.unmount()
  }
})

test('empty state, and other panes and backdrops go to the engine', async ($, on) => {
  seed(on, {})
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    // No agents yet: the roster still shows every god and worker, waiting.
    if (surface === 'desktop') expect((await ui.findAll({ type: 'Svg' })).some(s => String(s.props.alt).startsWith('Ra waiting'))).toBe(true)
    else expect(await ui.find({ type: 'Text', text: '·Ra ' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Nothing yet/ })).toBeDefined()
    await ui.unmount()
    const other = await $.ui.mount({ ...PANE, requestId: 'other', surface })
    expect((await other.find({ type: 'Text' }))?.text).toBe('engine')
    await other.unmount()
  }
  const glass = { blur: 18, tint: '#0c0816', opacity: 0.78 }
  const mine = await $.ui.mount({ plugin: 'eyes-of-horus', component: 'Backdrop', requestId: 'backdrop', surface: 'desktop', props: { id: 'horus', plugin: 'eyes-of-horus', glass } })
  expect(await mine.find({ type: 'Svg' })).toBeDefined()
  await mine.unmount()
  const theirs = await $.ui.mount({ plugin: 'eyes-of-horus', component: 'Backdrop', requestId: 'backdrop', surface: 'desktop', props: { id: 'x', plugin: 'other', glass } })
  expect((await theirs.find({ type: 'Text' }))?.text).toBe('engine')
  await theirs.unmount()
})

// This engine (2.1.319) sets the backdrop with theme.set; the 2.1.317 path ($.ui.backdrop) is covered by the setBackdrop test.
test('session start sets the backdrop and opens the pane, and survives refusals', async ($, on) => {
  const calls: string[] = []
  // The 2.1.317 types (still laid by the desktop app) have no theme.set: a narrow cast keeps tsc clean under both.
  type OnThemeSet = (event: 'theme.set', hook: (_: unknown, e: { backdrop: { id: string; glass?: false | { tint?: string } } }) => unknown) => void
  ;(on as unknown as OnThemeSet)('theme.set', (_, e) => {
    calls.push(`backdrop:${e.backdrop.id}:${e.backdrop.glass === false ? '' : e.backdrop.glass?.tint}`)
    return { value: { isDrawn: false, reason: 'no-surface' } }
  })
  on('ui.open', (_, e) => {
    calls.push(`open:${e.id}:${e.title}`)
    return { deny: 'nope' }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  // core's own session.start needs these answered too.
  mock.env(on, { HOME: '/home/u' })
  mock.clock(on, { now: 1 })
  on('fs.read', () => ({ deny: 'ENOENT' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1 }, rateLimits: [] } }))
  const r = await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(r.cwd).toBe('/')
  expect(calls).toEqual(['backdrop:horus:#0c0816', 'open:horus:The Field of Reeds (Aaru)'])
})

test('bars fill from step reports; the Hall of Truth scrolls within the log; the roster lists every god and worker', async () => {
  expect([
    barFill({ status: 'running', steps: { done: 3, total: 7, note: '' } }),
    barFill({ status: 'running' }),
    barFill({ status: 'done' }),
    barFill({ status: 'pending' }),
  ]).toEqual([3 / 7, undefined, 1, 0])
  const [c] = buildCards([{ ...A('a1', 'Tune', 'running', undefined, 'savvy-careful'), steps: { done: 5, total: 7, note: 'Rewriting BALANCE.md' } }], null, 9000)
  const svg = agentSvg(400, c!)
  expect(svg).toContain('Tasks 5/7')
  expect(svg).toContain('71%')
  expect(svg).toContain('Rewriting BALANCE.md')
  expect(railEntries(9)).toBe(5)
  // A wheel up (negative) goes back in time, never past the oldest; down returns to following the newest.
  expect([scrollOffset(0, -3, 20, 5), scrollOffset(14, -3, 20, 5), scrollOffset(2, 5, 20, 5), scrollOffset(0, -3, 4, 5)]).toEqual([3, 15, 0, 0])
  const r = roster([A('x', 'look', 'running', undefined, 'Explore'), A('y', 'odd', 'done', 2, 'my-plugin:helper')])
  expect(r.gods.map(m => m.name)).toEqual(['Ra', 'Anubis', 'Horus', 'Thoth', 'Bastet'])
  expect(r.slaves.find(m => m.name === 'Explore')?.isRunning).toBe(true)
  expect(r.slaves.some(m => m.name === 'helper')).toBe(true) // a type seen this session joins the workers
})
