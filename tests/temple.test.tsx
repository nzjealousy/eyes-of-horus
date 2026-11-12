import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import type { HorusAgent, HorusLogEntry } from '../types'
import { BAR_H, OPEN_W, svgWidth, textWidth } from '../hooks/pane'
import type { Feed, Room } from '../hooks/temple'
import {
  CELEBRATE_MS,
  CH_MAX_W,
  CH_SCALE,
  FEED_ROW,
  focusScale,
  GONE_TEXT,
  HALL_CELL,
  HALL_WIDE,
  hallLayout,
  hallName,
  hallSvg,
  roomLayout,
  roomSvg,
  templeHeadSvg,
  termBar,
  wrapCells,
} from '../hooks/temple'

const fits = (a: number, b: number) => expect(a).toBeLessThan(b + 0.001)
// The Temple's desktop width for 30..120 body columns (every third), as the render computes it.
const WIDTHS = [...new Set(Array.from({ length: 31 }, (_, i) => svgWidth(30 + i * 3)))]

test('hall layout: at 30..120 columns no two cells overlap, all stay between the columns, and names fit their cell', async () => {
  for (const W of WIDTHS)
    for (const widths of [[], [HALL_CELL], Array<number>(15).fill(HALL_CELL), [HALL_WIDE, HALL_WIDE, HALL_WIDE, ...Array<number>(13).fill(HALL_CELL)], [2000]]) {
      const L = hallLayout(W, widths)
      expect(L.cells.length).toBe(widths.length)
      L.cells.forEach((c, i) => {
        fits(16, c.x + 0.06) // 0.1 px rounding
        fits(c.x + c.w, W - 16 + 0.06)
        fits(c.y, L.H - 1)
        for (const d of L.cells.slice(0, i)) expect(d.y !== c.y || d.x + d.w <= c.x + 0.11).toBe(true) // 0.1 px rounding
        for (const name of ['Ra', 'crab-project-manager', 'Build the very long titled pane with many words', 'W'.repeat(40), '漢字のタイトル'.repeat(4)])
          for (const line of hallName(name, c.w - 6)) fits(textWidth(line, 10), c.w - 6)
      })
      expect(L.rows).toBeGreaterThan(0)
    }
  // Wide enough: one row; narrow: wraps onto more.
  expect(hallLayout(900, Array<number>(13).fill(HALL_CELL)).rows).toBe(1)
  expect(hallLayout(240, Array<number>(13).fill(HALL_CELL)).rows).toBe(5)
  expect(hallName('Ra', 58)).toEqual(['Ra', ''])
  expect(hallName('crab-designer', 58)).toEqual(['crab-', 'designer'])
  expect(hallName('Write the README bullet', 122)).toEqual(['Write the README', 'bullet'])
})

const item = (id: string, label: string, status: 'running' | 'done' | 'failed' = 'done') => ({
  id,
  label,
  status,
  dur: status === 'running' ? '…' : '00:02',
  running: status === 'running',
})
const FEED: Feed = { older: 0, items: [item('1', 'Read · pane.tsx'), item('2', 'Edit · <temple>.tsx', 'failed'), item('3', 'PowerShell · Run the plugin tests and read every failure', 'running')] }
const ROOM: Room = {
  id: 'a1',
  key: 'careful',
  type: 'savvy-flow:savvy-careful',
  tier: 'careful',
  title: 'Build the "Temple" & <more>',
  status: 'running',
  ms: 65_000,
  tokens: 48_200,
  steps: { done: 3, total: 7, note: 'Writing the render tests' },
}

test('chamber layout: at 30..120 columns every text stays in its slot, clear of the clock, the mark and the ↗ corner', async () => {
  const rooms: Room[] = []
  for (const title of ['x', 'Build the very long titled pane with many words in it', 'W'.repeat(80), '漢字のタイトル'.repeat(6), ''])
    for (const status of ['running', 'done', 'failed'] as const)
      for (const ms of [0, 36_000_000])
        for (const tier of ['careful', undefined])
          rooms.push({ ...ROOM, title, status, ms, tokens: tier ? 1_234_567 : 0, type: tier ? ROOM.type : 'crab-project-manager', ...(tier ? {} : { tier: undefined, steps: undefined }) } as Room)
  const long: Feed = { older: 3, items: Array.from({ length: 30 }, (_, i) => item(`f${i}`, 'W'.repeat(i * 3), i === 29 ? 'running' : 'done')) }
  const none: Feed = { items: [], older: 0 }
  for (const W of WIDTHS)
    for (const [width, scale, corner] of [[Math.min(W, CH_MAX_W), CH_SCALE, OPEN_W], [W, focusScale(W), 0]] as const)
      // Every room with a short feed and none; the full 30-row feed once per width (its rows do not depend on the room).
      for (const [room, feed] of [...rooms.flatMap(r => [[r, FEED], [r, none]] as const), [ROOM, long] as const]) {
        const L = roomLayout(width, room, feed, scale, corner)
        fits(2 + textWidth(L.title, 13), L.titleR) // title
        fits(L.titleR + 8, L.clockR - L.clock.w) // then the clock, at its widest
        fits(L.clockR, L.markX - 6) // then the status mark
        fits(L.markX + 6, width - corner) // and the ↗ Button's corner stays empty
        expect(L.title.length).toBeGreaterThan(0)
        fits(L.inL + textWidth(L.who, 11) + (L.stats ? 10 : 0) + textWidth(L.stats, 11), L.inR) // who, then tokens
        fits(textWidth(L.note, 11), L.inR - L.inL)
        fits(L.inL + L.barW + 6, L.inR) // the bar leaves its percentage room
        // The figure stands inside the frame, over the ground line; the lower register starts under it.
        fits(10, L.poseX)
        fits(L.poseX + L.boxW, width - 10)
        fits(L.groundY, L.whoY - 11)
        fits(L.barY + BAR_H, L.note ? L.noteY - 9 : L.feedTop)
        L.rows.forEach((r, i) => {
          fits(L.inL + 16 + textWidth(r.label, 11) + (r.item.dur ? 8 : 0) + textWidth(r.item.dur, 11), L.inR) // label, then its time
          fits(i === 0 ? L.feedTop + (feed.older > 0 ? FEED_ROW : 0) : L.rows[i - 1]!.y, r.y - 11) // a row under the one before
        })
        fits((L.rows.at(-1)?.y ?? L.feedTop + 12) + 4, L.H - 6)
      }
  for (const W of [240, 408, 900]) expect(roomSvg(W, ROOM, FEED, focusScale(W), 0).h).toBe(roomLayout(W, ROOM, FEED, focusScale(W), 0).H)
})

test('temple drawings: well-formed Svgs under the size limit, escaped text, poses by status', async () => {
  const run = roomSvg(320, ROOM, FEED)
  expect(run.svg.startsWith('<svg') && run.svg.endsWith('</svg>')).toBe(true)
  expect(run.svg).toContain(`height="${run.h}"`)
  expect(roomSvg(520, ROOM, FEED).svg).toContain('Build the &quot;Temple&quot; &amp; &lt;more&gt;') // escaped
  expect(run.svg).toContain('Edit · &lt;temple&gt;.tsx')
  expect(run.svg).toContain('eoh-wk-horus') // the work pose
  expect(run.svg).toContain('Horus · careful')
  expect(run.svg).toContain('48k tokens')
  expect(run.svg).toContain('Tasks 3/7')
  expect(run.svg).toContain('Writing the render tests')
  expect(run.svg).toContain('animation-delay:-65s') // the clock ticks in the Svg
  expect(run.svg).toContain('class="fl"') // braziers
  expect(run.svg).not.toContain('class="arr"')
  expect(roomSvg(320, { ...ROOM, ms: 200 }, FEED).svg).toContain('animation:eoh-in .6s ease-out -0.2s both') // a new chamber fades in, in phase
  const older = roomSvg(320, ROOM, { ...FEED, older: 4 })
  expect(older.svg).toContain('+4 earlier')
  expect(older.h).toBe(run.h + FEED_ROW)
  expect(roomSvg(320, ROOM, { items: [], older: 0 }).svg).toContain('No actions yet.')
  const done = roomSvg(320, { ...ROOM, status: 'done' }, FEED, focusScale(320), 0).svg
  expect(done).toContain('eoh-done')
  expect(done).not.toContain('eoh-wk-')
  const failed = roomSvg(320, { ...ROOM, status: 'failed' }, FEED, focusScale(320), 0).svg
  expect(failed.includes('eoh-done') || failed.includes('eoh-wk-')).toBe(false) // stands grey
  const slave = roomSvg(320, { ...ROOM, key: 'slave:Explore', type: 'Explore', tier: undefined } as unknown as Room, FEED).svg
  expect(slave).toContain('eoh-wk-torch')
  expect(slave).toContain('Slave · Explore')

  // The fullest hall: six celebrants (one failed) and every god and worker idle.
  const idle = Array.from({ length: 15 }, (_, i) => ({ key: i < 5 ? ['fable', 'heavy', 'careful', 'medium', 'light'][i]! : `slave:type-${i}`, name: `name-${i}`, color: '#c9b27c', state: 'idle' as const }))
  const cele = Array.from({ length: 6 }, (_, i) => ({ key: i % 2 ? 'medium' : 'slave:Plan', name: `Finish <task> ${i}`, color: '#2dd4bf', state: i === 5 ? ('failed' as const) : ('done' as const) }))
  for (const W of [240, 408, 900]) {
    const hall = hallSvg(W, [...cele, ...idle])
    expect(hall.svg.startsWith('<svg') && hall.svg.endsWith('</svg>')).toBe(true)
    expect(hall.svg.length).toBeLessThan(131072)
    expect(hall.svg).toContain('Finish &lt;task&gt;')
    expect(hall.svg).toContain('eoh-done')
    expect(hall.svg).toContain('eoh-idle')
    expect(hall.h).toBe(hallLayout(W, [...cele.map(() => HALL_WIDE), ...idle.map(() => HALL_CELL)]).H)
    for (const s of [run.svg, done, slave, roomSvg(W, ROOM, { older: 9, items: Array.from({ length: 30 }, (_, i) => item(`f${i}`, 'Read · some/long/file/name.tsx')) }, focusScale(W), 0).svg])
      expect(s.length).toBeLessThan(131072)
  }
  expect(hallSvg(240, []).svg).toContain('The hall stands empty')
  const head = templeHeadSvg(240, '2 working · 13 idle')
  expect(head).toContain('The Temple')
  expect(head).toContain('2 working')
})

test('terminal helpers: names wrap into lines no wider than the box; the bar fills by steps', async () => {
  const tokens = ['·Ra', '·Anubis', '▸Horus', '✦Thoth', '·Bastet', '·general-purpose', '·crab-project-manager', '·a-very-long-worker-type-name-that-goes-on'].map(text => ({ text }))
  for (let width = 16; width <= 116; width++) {
    const lines = wrapCells(tokens, width)
    for (const l of lines) fits(l.reduce((n, t) => n + [...t.text].length, 0) + l.length - 1, width)
    expect(lines.flat().length).toBe(tokens.length)
    expect(lines.flat().map(t => t.text.slice(0, 3))).toEqual(tokens.map(t => t.text.slice(0, 3))) // order kept
  }
  expect(wrapCells(tokens, 200).length).toBe(1)
  expect(wrapCells([], 20)).toEqual([])
  expect(termBar({ status: 'running', steps: { done: 3, total: 6, note: '' } }, 20)).toEqual({ on: 10, off: 10 })
  expect(termBar({ status: 'running' }, 20)).toEqual({ on: 0, off: 20 })
  expect(termBar({ status: 'done' }, 20)).toEqual({ on: 20, off: 0 })
})

// --- the pane itself.

const A = (id: string, type: string, extra: Partial<HorusAgent> = {}): HorusAgent => ({ id, type, title: `Task ${id}`, status: 'running', startedAt: 1000, ...extra })
const TOOL = (id: string, agentId: string, label: string, extra: Partial<HorusLogEntry> = {}): HorusLogEntry => ({
  id,
  at: 60_000,
  kind: 'tool',
  label,
  turn: 1,
  status: 'done',
  endedAt: 62_000,
  agentId,
  ...extra,
})

const TEMPLE = {
  plugin: 'eyes-of-horus',
  component: 'Pane',
  requestId: 'horus-temple',
  props: { title: 'The Temple', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const
const GODS = { ...TEMPLE, requestId: 'horus', props: { ...TEMPLE.props, title: 'Gods' } } as const
const SURFACES = ['terminal', 'desktop'] as const

// The state beneath the plugin: shaped keys are seeded (read-only); an unshaped key given here (chamber) is kept as
// the plugin writes it (`raw`, which a test may also set); any other key is the kit's own store. Returns the clock
// and the chamber's writes too.
function seed(on: On, values: Record<string, unknown>) {
  const shapes: Record<string, string> = { agents: 'agents-1', progress: 'progress-2', sessionLog: 'log-2', usage: 'usage-1' }
  const raw: Record<string, unknown> = { ...values }
  const focus: unknown[] = []
  let version = 1
  on('state.get', (_, e, next) => {
    const shape = shapes[e.key]
    if (shape === undefined) return e.key in raw ? { value: { value: raw[e.key], version } } : next(e)
    if (!(e.key in values)) return { value: { value: undefined, version: 0 } }
    return { value: { value: { shape, value: values[e.key] }, version: 1 } }
  })
  on('state.set', (_, e, next) => {
    if (e.key === 'chamber') focus.push(e.value)
    if (shapes[e.key] !== undefined || !(e.key in raw)) return next(e)
    raw[e.key] = e.value
    return { value: { isSet: true, version: ++version } }
  })
  return { clock: mock.clock(on, { now: 66_000 }), focus, raw }
}

const alts = async (ui: { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown> }[]> }) =>
  (await ui.findAll({ type: 'Svg' })).map(s => [String(s.props.alt), String(s.props.source)] as const)
const uniqueKeys = async (ui: { findAll: (q: object) => Promise<{ key: string | undefined }[]> }) => {
  const keys = (await ui.findAll({})).map(x => x.key).filter((k): k is string => k !== undefined)
  expect(new Set(keys).size).toBe(keys.length)
  return keys
}

test('overview with everyone idle: the hall holds every god and worker, no chambers, on both surfaces', async ($, on) => {
  seed(on, {})
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...TEMPLE, surface })
    if (surface === 'desktop') {
      const a = await alts(ui)
      expect(a.map(x => x[0])).toEqual([
        'The Temple: 0 working · 15 idle',
        expect.stringMatching(/^The Hall: Ra idle, Anubis idle, Horus idle, Thoth idle, Bastet idle, general-purpose idle.*crab-project-manager idle$/),
      ])
      expect(a[1]![1]).toContain('eoh-idle')
      expect(a[1]![1]).not.toContain('eoh-done')
      for (const [, source] of a) expect(source.length).toBeLessThan(131072)
      expect(await ui.find({ type: 'Client' })).toBeUndefined()
    } else {
      expect(await ui.find({ type: 'Svg' })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /0 working · 15 idle/ })).toBeDefined()
      expect((await ui.find({ type: 'Text', text: /^┌ The Hall/ }))?.text).toBe(`┌ The Hall ${'─'.repeat(28)}┐`)
      expect(await ui.find({ type: 'Text', text: '·Ra' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '·crab-designer' })).toBeDefined()
      expect((await ui.find({ type: 'Text', text: /^└/ }))?.text).toBe(`└${'─'.repeat(38)}┘`)
    }
    expect((await ui.findAll({ type: 'Button' })).length).toBe(0)
    await uniqueKeys(ui)
    await ui.unmount()
  }
})

const WORK = {
  agents: [A('a1', 'savvy-flow:savvy-careful', { title: 'Build the Temple', tokens: 5000, steps: { done: 2, total: 4, note: 'tests' } }), A('a2', 'Explore', { status: 'done', endedAt: 4000 })],
  sessionLog: [
    { id: 'agent:a1', at: 1000, kind: 'agent', label: 'Build the Temple', turn: 1, status: 'running', agentId: 'a1' },
    TOOL('t1', 'a1', 'Read · pane.tsx'),
    TOOL('t2', 'a1', 'Grep · poseSvg'),
    TOOL('t3', 'a1', 'Edit · temple.tsx', { status: 'failed' }),
    TOOL('t4', 'a1', 'Write · temple.test.tsx'),
    TOOL('t5', 'a1', 'Read · hall.ts'),
    TOOL('t6', 'a1', 'PowerShell · Run the tests', { status: 'running', endedAt: undefined }),
    TOOL('m1', 'zz', 'Read · other agent'),
    { id: 'tu', at: 3, kind: 'tool', label: 'Bash · main loop', turn: 1, status: 'done', endedAt: 4 },
  ],
}

test('one working agent: its chamber shows who, bar, clock, tokens and its last actions; it has left the hall', async ($, on) => {
  seed(on, WORK)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...TEMPLE, surface })
    if (surface === 'desktop') {
      const a = await alts(ui)
      expect(a.map(x => x[0])).toEqual([
        'The Temple: 1 working · 14 idle',
        expect.stringMatching(/^The Hall: Ra idle, Anubis idle, Thoth idle/),
        'Chambers · 1',
        'Build the Temple: Horus · careful, working, 01:05; doing PowerShell · Run the tests',
      ])
      expect(a[1]![0]).not.toContain('Horus')
      const room = a[3]![1]
      for (const s of ['eoh-wk-horus', 'Horus · careful', '5k tokens', 'Tasks 2/4', '50%', 'animation-delay:-65s', 'PowerShell · Run the tests', 'Read · hall.ts']) expect(room).toContain(s)
      // The last five of its own six actions; another agent's and the main loop's are not its.
      expect(room).not.toContain('Read · pane.tsx')
      expect(room).toContain('Grep · poseSvg')
      expect(room).not.toContain('other agent')
      expect(room).not.toContain('main loop')
      expect(room).toContain('+1 earlier')
      // The focus control draws only its arrow, over the corner the drawing keeps clear.
      expect((await ui.find({ key: 'chamber:a1' }))?.text).toBe('↗')
      expect(await ui.find({ type: 'Client' })).toBeUndefined()
    } else {
      expect((await ui.find({ key: 'chamber:a1' }))?.text).toBe('𓅃 Build the Temple')
      expect(await ui.find({ type: 'Text', text: 'Horus · careful · 5k tok' })).toBeDefined()
      expect((await ui.find({ type: 'Text', text: /\d\d:\d\d/, in: 'clock:a1' }))?.text).toBe('01:05')
      await ui.advance(2000)
      expect((await ui.find({ type: 'Text', text: /\d\d:\d\d/, in: 'clock:a1' }))?.text).toBe('01:07')
      expect((await ui.find({ type: 'Text', text: /^━+$/ }))?.text).toBe('━'.repeat(11)) // 2 of 4 steps of a 22-cell bar
      expect(await ui.find({ type: 'Text', text: ' 2/4 tests' })).toBeDefined()
      // The last four actions, the running one bold.
      expect(await ui.find({ type: 'Text', text: 'Grep · poseSvg' })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: 'Edit · temple.tsx' })).toBeDefined()
      expect((await ui.find({ type: 'Text', text: 'PowerShell · Run the tests' }))?.props.bold).toBe(true)
      expect(await ui.find({ type: 'Text', text: '+2 earlier' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '▸Horus' })).toBeDefined()
      // Every boxed row is exactly the pane's width.
      for (const key of ['bar:a1', 'feed:a1:0', 'feed:a1:3', 'earlier:a1', 'hall:0']) expect([...((await ui.find({ key }))?.text ?? '')].length).toBe(40)
    }
    // No Stop, Back or Transcript in the overview.
    expect((await ui.findAll({ type: 'Button' })).map(b => b.key)).toEqual(['chamber:a1'])
    await uniqueKeys(ui)
    await ui.unmount()
  }
})

test('two agents of one type get a chamber each, newest first; more than eight working are counted', async ($, on) => {
  seed(on, { agents: [A('e1', 'Explore', { startedAt: 10 }), A('e2', 'Explore', { startedAt: 20 })] })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...TEMPLE, surface })
    expect((await ui.findAll({ type: 'Button' })).map(b => b.key)).toEqual(['chamber:e2', 'chamber:e1'])
    if (surface === 'desktop') expect((await alts(ui)).filter(a => a[0].includes('Slave · Explore, working')).length).toBe(2)
    else expect((await ui.findAll({ type: 'Text', text: 'no actions yet' })).length).toBe(2)
    await uniqueKeys(ui)
    await ui.unmount()
  }
})

test('more than eight working: eight chambers, the rest counted', async ($, on) => {
  seed(on, { agents: Array.from({ length: 11 }, (_, i) => A(`g${i}`, 'general-purpose', { startedAt: i })) })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...TEMPLE, surface })
    expect((await ui.findAll({ type: 'Button' })).map(b => b.key)).toEqual(['g10', 'g9', 'g8', 'g7', 'g6', 'g5', 'g4', 'g3'].map(id => `chamber:${id}`))
    if (surface === 'desktop') {
      const a = (await alts(ui)).map(x => x[0])
      expect(a[0]).toBe('The Temple: 11 working · 14 idle')
      expect(a).toContain('Chambers · 11')
      expect(a.at(-1)).toBe('+3 more working')
    } else expect(await ui.find({ type: 'Text', text: '+3 more working' })).toBeDefined()
    await uniqueKeys(ui)
    await ui.unmount()
  }
})

test('a finished agent celebrates in the hall (a failed one stands grey), then stands idle once the window has passed', async ($, on) => {
  const { clock } = seed(on, {
    agents: [A('d1', 'savvy-medium', { title: 'Wrote it', status: 'done', endedAt: 64_000 }), A('f1', 'Plan', { title: 'Broke it', status: 'failed', endedAt: 65_000 })],
  })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...TEMPLE, surface })
    if (surface === 'desktop') {
      const hall = (await alts(ui))[1]!
      expect(hall[0]).toMatch(/^The Hall: Broke it failed, Wrote it celebrating, Ra idle/)
      expect(hall[0]).not.toContain('Thoth')
      expect(hall[1]).toContain('eoh-done')
      expect(hall[1]).toContain('Wrote it')
    } else {
      expect((await ui.find({ type: 'Text', text: '✦Thoth' }))?.props.bold).toBe(true)
      expect(await ui.find({ type: 'Text', text: '✗Plan' })).toBeDefined()
    }
    expect((await ui.findAll({ type: 'Button' })).length).toBe(0) // no chamber for a finished agent
    await ui.unmount()
  }
  await clock.advance(CELEBRATE_MS)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...TEMPLE, surface })
    if (surface === 'desktop') expect((await alts(ui))[1]![0]).toMatch(/^The Hall: Ra idle, Anubis idle, Horus idle, Thoth idle/)
    else expect(await ui.find({ type: 'Text', text: '·Thoth' })).toBeDefined()
    await ui.unmount()
  }
})

test('an agent finishing schedules the redraw that ends its celebration; a main turn does not', async ($, on) => {
  const { clock } = seed(on, {})
  mock.env(on, { HOME: '/home/u' })
  on('fs.read', () => ({ deny: 'ENOENT' }))
  on('session.turns', () => ({ value: 1 }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('ui.place', () => ({ value: { isPlaced: true, requestId: 'r' } }))
  const redraws: number[] = []
  on('ui.invalidate', (_, e, next) => {
    redraws.push(66_000)
    return next(e)
  })
  const done = { answer: '', durationMs: 5, isAborted: false, reason: 'answer' } as const
  await $.turn.complete({ ...done, turnId: 'ta', agentId: 'a1' })
  expect(redraws.length).toBe(0)
  await clock.advance(CELEBRATE_MS + 49)
  expect(redraws.length).toBe(0)
  await clock.advance(1)
  expect(redraws.length).toBe(1)
})

test('focus: ↗ on a chamber fills the pane with it (Back, Transcript, a two-click Stop); Back returns to the overview', async ($, on) => {
  const { focus } = seed(on, { ...WORK, chamber: '' })
  const viewed: unknown[] = []
  const toasts: string[] = []
  const calls: string[] = []
  on('ui.view', (_, e) => {
    viewed.push(e)
    return { value: { deny: 'no row' } }
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('tool.call', (_, e) => {
    calls.push(`${e.tool}:${(e as unknown as { task_id?: string }).task_id}`)
    return { result: { message: 'Successfully stopped task: a1' } }
  })
  for (const surface of SURFACES) {
    focus.length = 0
    viewed.length = 0
    toasts.length = 0
    calls.length = 0
    const mount = () => $.ui.mount({ ...TEMPLE, surface })
    const press = async (key: string) => {
      const ui = await mount()
      await ui.press({ key })
      await ui.unmount()
    }
    await press('chamber:a1')
    expect(focus).toEqual(['a1'])
    let ui = await mount()
    expect((await ui.findAll({ type: 'Button' })).map(b => b.key)).toEqual(
      surface === 'desktop' ? ['temple-back', 'temple-transcript', 'stop:agent:a1'] : ['temple-back', 'temple-transcript', 'stop:agent:a1', 'chamber:a1'],
    )
    expect([(await ui.find({ key: 'temple-back' }))?.text, (await ui.find({ key: 'temple-transcript' }))?.text, (await ui.find({ key: 'stop:agent:a1' }))?.text]).toEqual(['Back', 'Transcript', 'Stop'])
    if (surface === 'desktop') {
      const a = await alts(ui)
      expect(a.map(x => x[0])).toEqual(['The Temple: Horus · careful · working', 'Build the Temple: Horus · careful, working, 01:05; doing PowerShell · Run the tests'])
      // The whole feed (six of its own), the figure large, no hall.
      for (const s of ['Read · pane.tsx', 'Grep · poseSvg', 'PowerShell · Run the tests', 'eoh-wk-horus', 'scale(3)']) expect(a[1]![1]).toContain(s)
      expect(a[1]![1]).not.toContain('earlier')
      expect(a[1]![1].length).toBeLessThan(131072)
    } else {
      expect(await ui.find({ type: 'Text', text: /Horus · careful · working/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'Read · pane.tsx' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /The Hall/ })).toBeUndefined()
    }
    await uniqueKeys(ui)
    await ui.unmount()

    // Transcript opens the engine's view of the agent; a refusal is toasted.
    await press('temple-transcript')
    expect(viewed).toEqual([{ agentId: 'a1' }])
    expect(toasts).toEqual(['The Temple: cannot open that agent (no row)'])
    // Stop: the first press arms it, the second calls TaskStop.
    await press('stop:agent:a1')
    expect(calls).toEqual([])
    ui = await mount()
    expect((await ui.find({ key: 'stop:agent:a1' }))?.text).toBe('Sure?')
    await ui.unmount()
    await press('stop:agent:a1')
    expect(calls).toEqual(['TaskStop:a1'])
    expect(toasts.at(-1)).toBe('The Temple: Successfully stopped task: a1')

    await press('temple-back')
    expect(focus).toEqual(['a1', ''])
    ui = await mount()
    expect(await ui.find({ key: 'temple-back' })).toBeUndefined()
    expect(await ui.find({ key: 'chamber:a1' })).toBeDefined()
    await ui.unmount()
  }
})

test('focus on a finished agent: its done pose and time, no Stop; on the terminal its title lets go of the focus', async ($, on) => {
  const { focus, raw } = seed(on, { ...WORK, chamber: 'a2' })
  for (const surface of SURFACES) {
    raw.chamber = 'a2'
    const ui = await $.ui.mount({ ...TEMPLE, surface })
    expect(await ui.find({ key: 'stop:agent:a2' })).toBeUndefined()
    expect(await ui.find({ key: 'temple-transcript' })).toBeDefined()
    if (surface === 'desktop') {
      const room = (await alts(ui))[1]!
      expect(room[0]).toBe('Task a2: Slave · Explore, finished, 00:03')
      expect(room[1]).toContain('eoh-done')
      expect(room[1]).toContain('No actions yet.')
    } else {
      expect(await ui.find({ type: 'Client' })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: '00:03' })).toBeDefined()
      await ui.press({ key: 'chamber:a2' })
      expect(focus).toEqual([''])
    }
    await ui.unmount()
  }
})

test('a focus on an agent the session no longer lists says so, and Back clears it', async ($, on) => {
  const { focus, raw } = seed(on, { ...WORK, chamber: 'ghost' })
  for (const surface of SURFACES) {
    raw.chamber = 'ghost'
    focus.length = 0
    let ui = await $.ui.mount({ ...TEMPLE, surface })
    expect(await ui.find({ type: 'Text', text: GONE_TEXT })).toBeDefined()
    expect((await ui.findAll({ type: 'Button' })).map(b => b.key)).toEqual(['temple-back'])
    await ui.press({ key: 'temple-back' })
    await ui.unmount()
    expect(focus).toEqual([''])
    ui = await $.ui.mount({ ...TEMPLE, surface })
    expect(await ui.find({ type: 'Text', text: GONE_TEXT })).toBeUndefined()
    expect(await ui.find({ key: 'chamber:a1' })).toBeDefined()
    await ui.unmount()
  }
})

const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const

test('/temple opens the pane (and says so when it is not shown); a stale focus is let go first', async ($, on) => {
  const { focus } = seed(on, { ...WORK, chamber: 'ghost' })
  const opened: string[] = []
  let placed = true
  on('ui.open', (_, e) => {
    opened.push(`${e.id}:${e.title}`)
    return { value: placed ? { isPlaced: true } : { isPlaced: false, reason: 'no-surface' } }
  })
  expect((await $.command.run({ ...RUN, command: 'temple', args: '' })).text).toBe('The Temple is open.')
  expect(opened).toEqual(['horus-temple:The Temple'])
  expect(focus).toEqual([''])
  placed = false
  expect((await $.command.run({ ...RUN, command: 'temple', args: '' })).text).toBe('The Temple is not shown: no-surface')
  expect(focus).toEqual(['']) // nothing stale to clear the second time
})

test('↗ on a Gods card focuses that agent and opens the Temple; a refused open is toasted', async ($, on) => {
  const { focus } = seed(on, { ...WORK, chamber: '' })
  const opened: string[] = []
  const toasts: string[] = []
  let placed = true
  on('ui.open', (_, e) => {
    opened.push(`${e.id}:${e.title}`)
    return { value: placed ? { isPlaced: true } : { isPlaced: false, reason: 'no-surface' } }
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.view', () => {
    throw new Error('the card must not open the transcript view any more')
  })
  for (const surface of SURFACES) {
    opened.length = 0
    focus.length = 0
    placed = true
    let ui = await $.ui.mount({ ...GODS, surface })
    await ui.press({ key: 'agent:a1' })
    await ui.unmount()
    expect(focus).toEqual(['a1'])
    expect(opened).toEqual(['horus-temple:The Temple'])
    expect(toasts).toEqual([])
    // The Temple now shows that agent's chamber alone.
    ui = await $.ui.mount({ ...TEMPLE, surface })
    expect(await ui.find({ key: 'temple-back' })).toBeDefined()
    await ui.unmount()
    // A finished agent's card focuses it too; an open that is not placed says why.
    placed = false
    ui = await $.ui.mount({ ...GODS, surface })
    await ui.press({ key: 'agent:a2' })
    await ui.unmount()
    expect(focus).toEqual(['a1', 'a2'])
    expect(toasts).toEqual(['The Temple is not shown (no-surface)'])
    toasts.length = 0
    ui = await $.ui.mount({ ...TEMPLE, surface })
    await ui.press({ key: 'temple-back' })
    await ui.unmount()
  }
})

test('session start registers /temple and does not open the Temple', async ($, on) => {
  const opened: string[] = []
  const commands: string[] = []
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('command.register', (_, e) => {
    commands.push(e.name)
    return { value: { command: e.name } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  mock.env(on, { HOME: '/home/u' })
  mock.clock(on, { now: 1 })
  on('fs.read', () => ({ deny: 'ENOENT' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1 }, rateLimits: [] } }))
  on('session.messages', () => ({ value: [] }))
  on('ui.place', () => ({ value: { isPlaced: true, requestId: 'r' } }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(opened).toEqual(['horus'])
  expect(commands).toContain('temple')
})
