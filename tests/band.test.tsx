import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { budget, compactNumber, ctxCells, ctxColor, ctxSvg, dashboardVisible, duration, progressRuns, progressSvg } from '../hooks/band'
import { aqua, err, gold, goldBright, panelHi, purple, purpleDim } from '../hooks/theme'
import type { HorusProgress } from '../types'

const BAND = (bodyColumns = 80, maxRows = 12) =>
  ({
    plugin: 'eyes-of-horus',
    component: 'AbovePrompt',
    requestId: 'above-prompt',
    props: { hasSurvey: false, isWorking: false, maxRows, bodyColumns, scroll: { offset: 0, bodyRows: maxRows - 1 }, view: {} },
  }) as const

const flow = (over: Partial<HorusProgress> = {}): HorusProgress => ({
  title: 'Build',
  total: 3,
  done: 1,
  phase: 'delegate',
  finished: false,
  tasks: [
    { title: 'a', tier: 'heavy', after: [], status: 'done' },
    { title: 'b', tier: 'medium', after: [], status: 'running' },
    { title: 'c', tier: 'light', after: [], status: 'pending' },
  ],
  ...over,
})

// Stands for the engine beneath the plugin (core's hooks run too: the ponytail flag, the clock, commands).
function engine(on: On, isCommandRefused = false) {
  const commands: string[] = []
  const toasts: string[] = []
  const clock = mock.clock(on, { now: 100_000 })
  mock.env(on, { HOME: '/home/u' })
  on('fs.read', () => ({ deny: 'ENOENT' }))
  on('command.run', (_, e) => {
    if (isCommandRefused) throw new Error('ponytail is not installed')
    commands.push(`${e.command} ${e.args}`)
    return { text: '' }
  })
  on('ui.toast', (_, e) => {
    toasts.push(String(e.text))
    return { value: undefined }
  })
  return { clock, commands, toasts }
}

let rows = 0
const progressCall = (input: Record<string, unknown>) => ({
  message: {
    type: 'assistant' as const,
    role: 'assistant' as const,
    content: [{ type: 'tool_use', id: 'tp', name: 'mcp__savvy-progress__progress', input }],
  },
  door: 'response' as const,
  origin: { kind: 'model' as const, model: 'm' },
  uuid: `band-p${++rows}`,
})

test('compact numbers and durations', () => {
  expect(compactNumber(266_800_000)).toBe('266.8M')
  expect(compactNumber(12_345)).toBe('12.3k')
  expect(compactNumber(950)).toBe('950')
  expect(compactNumber(2_500_000_000)).toBe('2.5B')
  expect(duration(4_020_000)).toBe('1h 7m')
  expect(duration(432_000)).toBe('7m 12s')
  expect(duration(42_000)).toBe('42s')
  expect(duration(-5)).toBe('0s')
})

test('row budget drops chips, then the progress header, never the rail', () => {
  expect(budget(10, true, 'active')).toEqual({ chips: true, detail: true, rows: 6 })
  expect(budget(5, true, 'active')).toEqual({ chips: false, detail: true, rows: 5 })
  expect(budget(4, true, 'active')).toEqual({ chips: false, detail: false, rows: 4 })
  // Past the minimum the tree scrolls; the rail row is still counted.
  expect(budget(1, true, 'active').rows).toBe(4)
  expect(budget(2, false, 'none')).toEqual({ chips: false, detail: false, rows: 2 })
  expect(budget(4, true, 'done')).toEqual({ chips: false, detail: false, rows: 4 })
})

test('a running shell hides the dashboard', () => {
  expect(dashboardVisible(false)).toBe(true)
  expect(dashboardVisible(true)).toBe(false)
})

test('progress segments: one run per task, gaps when there is room', () => {
  const runs = progressRuns(flow(), 11)
  expect(runs.map(r => r.text)).toEqual(['━━━', ' ', '━━━', ' ', '───'])
  expect(runs[0]?.color).toBe('#f6d77a')
  expect(runs[0]?.dim).toBe(false)
  expect(runs[2]?.dim).toBe(true)
  expect(runs[4]?.dim).toBe(true)
  // No room for gaps: one cell each.
  expect(progressRuns(flow(), 4).map(r => r.text)).toEqual(['━', '━', '─'])
  // More tasks than cells: cut to the width.
  expect(progressRuns(flow(), 2).map(r => r.text).join('')).toBe('━━')
  // No task list: cells from done/total.
  expect(progressRuns(flow({ tasks: [], total: 2, done: 1 }), 3).map(r => r.text)).toEqual(['━', ' ', '─'])
  // A failed task is solid err.
  expect(progressRuns(flow({ tasks: [{ title: 'a', tier: 'light', after: [], status: 'failed' }] }), 3)[0]?.color).toBe(err)
})

test('progress svg: rounded segments, sheen only on running', () => {
  const s = progressSvg(flow(), 300)
  expect(s.startsWith('<svg') && s.endsWith('</svg>')).toBe(true)
  expect((s.match(/class="eoh-sheen"/g) ?? []).length).toBe(1)
  expect(s).toContain('rx="2"')
  expect(s).not.toMatch(/NaN|Infinity/)
  // Pending gets only its track: three tracks, two fills (done + running).
  expect((s.match(new RegExp(`fill="${panelHi}"`, 'g')) ?? []).length).toBe(4) // 3 tracks + the running clip rect
})

test('ctx bar: colour thresholds, svg fill, terminal cells', () => {
  expect(ctxColor(0)).toBe(gold)
  expect(ctxColor(70)).toBe(gold)
  expect(ctxColor(71)).toBe(purple)
  expect(ctxColor(90)).toBe(purple)
  expect(ctxColor(91)).toBe(err)
  const low = ctxSvg(50, 96)
  expect(low).toContain('url(#g)')
  expect(low).toContain(goldBright)
  expect(low).toContain('width="48"')
  expect(ctxSvg(95, 96)).toContain(`fill="${err}"`)
  // Empty: the track alone.
  expect((ctxSvg(0, 96).match(/<rect/g) ?? []).length).toBe(1)
  expect(ctxCells(50, 8)).toEqual(['━━━━', '────'])
  expect(ctxCells(150, 8)).toEqual(['━━━━━━━━', ''])
  expect(ctxCells(-5, 4)).toEqual(['', '────'])
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`band on ${surface}: dashboard, level press, no terminal button, rail`, async ($, on) => {
    const { commands } = engine(on)
    const ui = await $.ui.mount({ ...BAND(), surface })

    expect(await ui.find({ key: 'ph:level:off' })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /266|cost/ }))?.text).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'ctx' })).toBeDefined()
    // The ctx bar: one Svg on the desktop, a solid text line on the terminal.
    if (surface === 'desktop') expect(await ui.find({ type: 'Svg' })).toBeDefined()
    else expect(await ui.find({ type: 'Text', text: /─/ })).toBeDefined()
    // The terminal button is gone.
    expect(await ui.find({ key: 'ph:terminal' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: ' >_ ' })).toBeUndefined()
    expect((await ui.findAll({ type: 'Text', in: 'horus:rail' })).length).toBeGreaterThan(0)

    // The active level is not run again; another one runs ponytail's command.
    await ui.press({ key: 'ph:level:off' })
    await ui.press({ key: 'ph:level:lite' })
    expect(commands).toEqual(['ponytail:ponytail lite'])

    await ui.unmount()
  })

  test(`progress row on ${surface}: active, then done, then collapsed`, async ($, on) => {
    const { clock } = engine(on)
    const title = `Flow ${surface}`
    await $.session.append(progressCall({ title, total: 2, done: 1, phase: 'delegate', tasks: [{ title: 'x', tier: 'heavy' }, { title: 'y', tier: 'light' }] }))
    let ui = await $.ui.mount({ ...BAND(), surface })
    expect(await ui.find({ type: 'Text', text: `◈ ${title}` })).toBeDefined()
    await ui.unmount()

    await $.session.append(progressCall({ done: 2, finished: true }))
    ui = await $.ui.mount({ ...BAND(), surface })
    expect((await ui.find({ type: 'Text', text: /done 2\/2/ }))?.text).toBe(`✓ ${title} · done 2/2`)
    await ui.unmount()

    await clock.advance(10_001)
    ui = await $.ui.mount({ ...BAND(), surface })
    expect(await ui.find({ type: 'Text', text: /done 2\/2|◈/ })).toBeUndefined()
    await ui.unmount()
  })

  test(`a survey takes the band on ${surface}`, async ($, on) => {
    engine(on)
    on('ui.render', ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>engine</Text>
    })
    const base = BAND()
    const ui = await $.ui.mount({ ...base, props: { ...base.props, hasSurvey: true }, surface })
    expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
    await ui.unmount()
  })
}

test('a refused level switch shows a toast', async ($, on) => {
  const { toasts } = engine(on, true)
  const ui = await $.ui.mount({ ...BAND(), surface: 'terminal' })
  await ui.press({ key: 'ph:level:full' })
  expect(toasts).toEqual(['Horus: could not switch ponytail to full'])
  await ui.unmount()
})

test('the prompt hint gets a horus tail on the terminal only', async ($, on) => {
  engine(on)
  const seen: (string | undefined)[] = []
  on('ui.render', ($, e) => {
    if (e.component === 'PromptHint') seen.push((e.props as { tail?: string }).tail)
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const hint = { isDraft: false, isWorking: false, hint: '? for shortcuts' }
  await $.ui.render({ component: 'PromptHint', surface: 'terminal', requestId: 'hint', props: hint })
  await $.ui.render({ component: 'PromptHint', surface: 'desktop', requestId: 'hint', props: hint })
  expect(seen).toEqual(['◈ horus · idle', undefined])
})
