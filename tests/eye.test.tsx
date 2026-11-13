import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import {
  advance, BLANK, BLINK, eyeCell, eyeCells, fit, FRAME, frame, GAZES, gazeToward, H, init, lids, look, MARGIN, merge, openness, PAD_BOTTOM, PAD_TOP, point,
  pointIn, RAMP, redraw, RELEASE_MS, scatter, type Seg, shade, SPARK_INSET, sparkleLevel, twinkle, W,
} from '../hooks/clients/eye-view'
import { diagnose, endsReply, eyeWidth, HIDE_MS, rowId, show, speakable } from '../hooks/eye'
import { gold, goldBright, orbCore, text as white } from '../hooks/theme'

const rnd = () => 0.5
const text = (rows: Seg[][]) => rows.map(r => r.map(s => s[0]).join(''))

test('speakable strips code, tables, URLs and markdown, then splits sentences', () => {
  const md = [
    '# Done',
    'I fixed the **bug** in `core.ts` and ran the [tests](https://x.dev/t).',
    '```ts',
    'const a = 1. // not spoken',
    '```',
    '| a | b |',
    '|---|---|',
    '| 1 | 2 |',
    '- First item',
    '- Second item!',
    'See https://example.com/docs for more. Version 3.5 works; snake_case stays.',
  ].join('\n')
  expect(speakable(md)).toEqual([
    'Done.',
    'I fixed the bug in and ran the tests.',
    'First item.',
    'Second item!',
    'See for more.',
    'Version 3.5 works; snake_case stays.',
  ])
  expect(speakable('```\nonly code\n```')).toEqual([])
  expect(speakable('')).toEqual([])
})

test('speakable caps the text near 900 characters at a sentence end', () => {
  const md = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} is here.`).join(' ')
  const out = speakable(md)
  expect(out.join(' ').length <= 900).toBe(true)
  expect(out.at(-1)?.endsWith('.')).toBe(true)
  expect(out[0]).toBe('Sentence number 0 is here.')
})

test('the row keeps the eye up while speaking, hides during output and 8 s after a turn', () => {
  const now = 100_000
  expect(show('thinking', 0, now, false)).toBe('eye')
  expect(show('tool', now - 10, now, false)).toBe('eye')
  expect(show('outputting', 0, now, false)).toBe('none')
  expect(show('idle', now - 1000, now, false)).toBe('none')
  expect(show('idle', now - HIDE_MS, now, false)).toBe('eye')
  expect(show('idle', 0, now, false)).toBe('eye')
  expect(show('outputting', now - 10, now, true)).toBe('eye')
  expect(show('idle', now - 10, now, true)).toBe('eye')
  expect(rowId('idle', 3)).toBe('eye-3-end')
  expect(rowId('tool', 3)).toBe('eye-3')
})

test('the desktop draws under the block that ends the latest reply', () => {
  expect(endsReply('Intro.\n\nAll tests pass.\n', 'All tests pass.')).toBe(true)
  expect(endsReply('Intro.\n\nAll tests pass.', 'Intro.')).toBe(false)
  expect(endsReply('', 'Anything')).toBe(false)
  expect(endsReply('Done.', '  ')).toBe(false)
})

test('luminance maps onto the density ramp, blank to dense, clamped', () => {
  expect(shade(0)).toBe(BLANK)
  expect(shade(-1)).toBe(BLANK)
  expect(shade(1)).toBe('$')
  expect(shade(2)).toBe('$')
  expect(shade(0.5)).toBe(RAMP[Math.round(0.5 * (RAMP.length - 1))])
  const at = (l: number) => RAMP.indexOf(shade(l))
  for (let l = 0; l < 1; l += 0.05) expect(at(l + 0.05) >= at(l)).toBe(true)
  // Thin glyphs only: no block or shade characters, so the density comes from the glyph itself.
  expect(/[█▀▄▌▐░▒▓]/.test(RAMP)).toBe(false)
})

test('runs: one per colour, a blank joins its neighbour', () => {
  expect(merge([['a', 'x'], ['b', 'x'], [BLANK, 'y'], ['c', 'x'], ['d', 'z']])).toEqual([[`ab${BLANK}c`, 'x'], ['d', 'z']])
  expect(merge([[BLANK, 'y'], ['a', 'x']])).toEqual([[`${BLANK}a`, 'x']])
  const rows = frame(init('idle', rnd))
  for (const row of rows) for (let i = 1; i < row.length; i++) expect(row[i]?.[1] === row[i - 1]?.[1]).toBe(false)
  // An 82 x 16 frame is far fewer runs than cells.
  expect(rows.reduce((n, r) => n + r.length, 0) < (W * H) / 3).toBe(true)
})

test('the eye is 82 x 16 by default, fits its region across and is always 16 rows tall', () => {
  expect(fit(0)).toEqual([W, H])
  expect([W, H]).toEqual([82, 16])
  expect([fit(200), fit(84)]).toEqual([[82, 16], [82, 16]])
  // The frame keeps MARGIN columns of its region free and is never wider than it.
  expect([fit(42), fit(30), fit(10), fit(1)].map(f => f[0])).toEqual([40, 28, 8, 1])
  // The desktop region measured live: 77 x 16 once the frame is 16 rows. Fitting to its echoed 7 rows drew the eye 23 x 7.
  const extent = (w: number, h: number) => {
    const lit = eyeCells(w, h, { ox: 0, oy: 0, open: 1, t: 0 }).map(r => r.map(s => s[0] !== BLANK))
    const xs = lit.flatMap(r => r.flatMap((on, x) => (on ? [x] : [])))
    return [Math.max(...xs) - Math.min(...xs) + 1, lit.filter(r => r.includes(true)).length]
  }
  expect(extent(...fit(77))).toEqual([41, 15]) // the Wedjat's tail, tear and spiral take room in the 16 rows
  expect(extent(75, 7)).toEqual([15, 7])
  for (const [w, h] of [[82, 16], [40, 13], [24, 9], [60, 17]] as const) {
    const rows = text(frame(init('idle', rnd), w, h))
    expect(rows.length).toBe(h)
    for (const row of rows) expect([...row].length).toBe(w)
  }
  expect(eyeWidth(200)).toBe(82 + MARGIN)
  expect(eyeWidth(80)).toBe(78)
  expect(eyeWidth(30)).toBe(28)
  expect(eyeWidth(5)).toBe(16)
})

test('the open eye shows a gold iris, a dark pupil and a white highlight; the lids meet when shut', () => {
  const colours = (rows: Seg[][]) => new Set(rows.flat().map(s => s[1]))
  const open = colours(eyeCells(W, H, { ox: 0, oy: 0, open: 1, t: 0 }))
  expect([open.has(goldBright), open.has(gold), open.has(white)]).toEqual([true, true, true])
  expect(eyeCell(0, 0, { ox: 0, oy: 0, open: 1, t: 0 })[0]).toBe(0)
  const shut = colours(eyeCells(W, H, { ox: 0, oy: 0, open: 0, t: 0 }))
  expect([shut.has(goldBright), shut.has(gold), shut.has(white)]).toEqual([false, false, false])
  const [u, l] = lids(3, 0)
  expect(u).toBe(l)
  expect(lids(0, 1)).toEqual([-8, 6])
  expect(lids(20, 1).every(v => v === 0)).toBe(true)
})

test('a blink sweeps the lids shut and open over five frames; the tool eye is narrowed', () => {
  const m = init('idle', rnd)
  m.nextBlink = FRAME
  m.nextSaccade = 1e9
  const seen: number[] = []
  for (let i = 0; i < 7; i++) {
    advance(m, FRAME, rnd)
    seen.push(openness(m))
  }
  expect(seen).toEqual([...BLINK, 1, 1])
  expect(openness(init('tool', rnd))).toBe(0.55)
})

test('the gaze takes nine targets, follows the pointer and lets go 2.5 s after the last move', () => {
  expect(GAZES.length).toBe(9)
  expect(gazeToward(0, 0)).toEqual([0, 0])
  expect(gazeToward(-4, 1)).toEqual([0, 0])
  // The dead zone is a tenth of the frame width: 8.2 columns at 82.
  expect(gazeToward(-8, -2)).toEqual([0, -1])
  expect(gazeToward(-9, -2)).toEqual([-1, -1])
  expect(gazeToward(6, 3, 40)).toEqual([1, 1])

  const m = init('idle', rnd)
  m.nextSaccade = 1e9
  point(m, 81, 8)
  expect(look(m)).toEqual([1, 0])
  for (let i = 0; i < 10; i++) advance(m, FRAME, rnd)
  // The iris eases over and settles within ten frames.
  expect(Math.abs(m.ox - 6) < 0.05).toBe(true)
  expect(m.pointerUntil - m.t).toBe(RELEASE_MS - 10 * FRAME)
  m.t = m.pointerUntil - 1
  expect(look(m)).toEqual([1, 0])
  m.t = m.pointerUntil
  expect(look(m)).toEqual([0, 0])
})

test('the pointer gaze is read against the centred frame, not its wider region', () => {
  // A 200-column region holds an 82-column frame 59 columns in: region column 60 is the frame's left edge.
  const m = init('idle', rnd)
  pointIn(m, 60, PAD_TOP + 8, 200)
  expect(look(m)).toEqual([-1, 0])
  pointIn(m, 100, PAD_TOP + 8, 200) // the frame's middle
  expect(look(m)).toEqual([0, 0])
  pointIn(m, 140, PAD_TOP + 8, 200)
  expect(look(m)).toEqual([1, 0])
  // Before the first layout (0 columns) the region is the frame plus MARGIN.
  pointIn(m, 1, PAD_TOP + 8, 0)
  expect(look(m)).toEqual([-1, 0])
})

test('thinking sweeps the gaze across the top; the tool eye scans left and right', () => {
  const m = init('thinking', rnd)
  m.nextSaccade = 1e9
  m.nextSweep = FRAME
  advance(m, FRAME, rnd)
  expect(look(m)).toEqual([-1, -1])
  m.t += 750
  expect(look(m)).toEqual([0, -1])
  const t = init('tool', rnd)
  const xs = [0, 240, 480, 720].map(at => {
    t.t = at
    return look(t)[0]
  })
  expect(xs).toEqual([-1, 0, 1, 0])
})

test('sparkles twinkle dim, bright, dim on their own phase, only in the dark around the eye', () => {
  const s = { period: 2000, phase: 0 }
  expect(sparkleLevel(s, 0)).toBe(0)
  expect(sparkleLevel(s, 1000)).toBe(1)
  expect(Math.abs(sparkleLevel(s, 2000)) < 1e-9).toBe(true)
  expect(sparkleLevel({ period: 2000, phase: 0.5 }, 0)).toBe(1)
  expect(twinkle(0.1, 0)[0]).toBe(BLANK)
  expect(twinkle(0.4, 0)[0]).toBe('·')
  expect(twinkle(0.7, 0)[0]).toBe('+')
  expect(twinkle(0.95, 1)).toEqual(['*', goldBright])

  const isEmpty = (x: number, y: number) => y < 2 || y > 10
  const list = scatter(40, 13, isEmpty)
  expect(list).toEqual(scatter(40, 13, isEmpty))
  expect(list.length > 3 && list.length <= Math.round((40 * 13) / 48)).toBe(true)
  for (const a of list) {
    expect(isEmpty(a.x, a.y)).toBe(true)
    for (const b of list) if (a !== b) expect(Math.abs(a.x - b.x) >= 3 || Math.abs(a.y - b.y) >= 2).toBe(true)
  }

  // In a frame, every star cell (one the sparkles changed) is one the open eye leaves blank.
  const dark = eyeCells(W, H, { ox: 0, oy: 0, open: 1, t: 0 })
  const m = init('idle', rnd)
  let stars = 0
  for (let t = 0; t < 4000; t += 400) {
    m.t = t
    const bare = text(eyeCells(W, H, { ox: m.ox, oy: m.oy, open: openness(m), t }).map(merge))
    text(frame(m)).forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (ch === [...(bare[y] ?? '')][x]) return
        stars++
        expect(dark[y]?.[x]?.[0]).toBe(BLANK)
        // Never in the frame's outer ring: the stars keep clear of the region's edges.
        const [ix, iy] = SPARK_INSET
        expect(x >= ix && x < W - ix && y >= iy && y < H - iy).toBe(true)
      }),
    )
  }
  expect(stars > 0).toBe(true)
})

test('the eye redraws only when its frame changes', () => {
  const m = init('idle', rnd)
  expect(redraw(m, 40)).toBe(true)
  expect(redraw(m, 40)).toBe(false)
  expect(redraw(m, 30)).toBe(true)
})

test('/horus-eye explains what shows and why', () => {
  const out = diagnose({
    now: 10_000,
    phase: 'idle',
    turnSeq: 4,
    tail: 7_000,
    voice: { enabled: false, speaking: false },
    surfaces: ['desktop'],
    replyChars: 0,
    place: { id: 'eye-4-end', at: 7_000, result: 'placed (r9)' },
    seen: { 'terminal placed row': { id: 'eye-4-end', what: 'none', at: 9_500 } },
  })
  expect(out).toBe(
    [
      'Horus eye: phase idle, turn 4, last reply 3.0s ago.',
      'Now showing: none (hidden 5.0s more after the reply). Voice-over off.',
      'Surfaces: desktop.',
      'Terminal: the current row is eye-4-end; last $.ui.place: eye-4-end placed (r9), 3.0s ago.',
      'Desktop: drawn under the latest reply (the app draws no placed rows); reply known: not yet.',
      'Asked to draw:\n  terminal placed row: eye-4-end -> none, 0.5s ago',
    ].join('\n'),
  )
  const fault = { line: 'desktop AssistantMessage eye (hooks/clients/eye-view.tsx) render: boom', at: 9_000 }
  const faulted = diagnose({ now: 10_000, phase: 'idle', turnSeq: 4, tail: 0, voice: { enabled: false, speaking: false }, surfaces: [], replyChars: 0, seen: {}, fault })
  expect(faulted.endsWith(`Last Client fault: ${fault.line}, 1.0s ago`)).toBe(true)
})

// Answers state reads for the render hook; the rest falls through to the kit.
function seed(on: On, values: Record<string, unknown>) {
  on('state.get', (_, e, next) => {
    const v = values[e.key]
    if (v === undefined) return next(e)
    return { value: { value: e.key === 'voice' ? { shape: 'voice-1', value: v } : v, version: 1 } }
  })
  mock.clock(on, { now: 100_000 })
  engine(on)
}

// What the engine would draw beneath the plugin.
function engine(on: On) {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
}

const row = (id: string, surface: 'terminal' | 'desktop', plugin = 'eyes-of-horus') =>
  ({ plugin: 'eyes-of-horus', surface, component: 'Placed', requestId: id, props: { id, plugin } }) as const

const VOICE = { enabled: true, speaking: false, subtitle: '', sentenceIndex: 0 }

test('the current row draws the eye centred on the terminal, in mono rows, and takes the pointer', async ($, on) => {
  seed(on, { phase: 'thinking', turnSeq: 2, tail: 0, voice: VOICE })
  const ui = await $.ui.mount(row('eye-2', 'terminal'))
  const eye = await ui.find({ type: 'Client', key: 'eye' })
  expect(eye?.props.props).toEqual({ mode: 'thinking' })
  // 16 eye rows plus PAD_TOP empty rows above and PAD_BOTTOM below.
  expect([eye?.props.width, eye?.props.height]).toEqual([82 + MARGIN, 16 + PAD_TOP + PAD_BOTTOM])
  const box = await ui.find({ type: 'Box' })
  expect([box?.props.width, box?.props.flexDirection, box?.props.justifyContent]).toEqual(['100%', 'row', 'center'])
  await ui.pointer({ type: 'move', x: 81, y: 8, in: 'eye' })
  await ui.advance(400)
  const rows = (await ui.findAll({ type: 'Text', in: 'eye' })).filter(t => t.props.wrap === 'truncate-end')
  expect(rows.length).toBe(16)
  for (const r of rows) {
    expect(r.props.mono).toBe(true)
    expect([...r.text].length).toBe(82)
  }
  await ui.unmount()
})

// Only glyphs one cell wide in any mono face: printable ASCII, the no-break space and the middle dot.
const NARROW = /^[ -~ ·]*$/

test('every eye row is one line of exactly the frame width, in single-width glyphs', () => {
  const m = init('idle', rnd)
  for (const columns of [30, 40, 60, 84]) {
    const [w, h] = fit(columns)
    expect(w).toBe(columns - MARGIN)
    for (let t = 0; t < 4000; t += 300) {
      m.t = t
      for (const [rows, width] of [[text(frame(m, w, h)), w]] as const) {
        for (const row of rows) {
          expect([...row].length).toBe(width)
          expect(NARROW.test(row)).toBe(true)
        }
      }
    }
  }
  expect(NARROW.test(RAMP)).toBe(true)
  for (let l = 0; l <= 1; l += 0.05) expect(NARROW.test(twinkle(l, 0)[0])).toBe(true)
})

for (const columns of [30, 40, 60, 84]) {
  test(`a ${columns}-column region draws rows of ${columns - MARGIN}, centred, each cut rather than wrapped`, async ($, on) => {
    seed(on, { phase: 'idle', turnSeq: 2, tail: 0, voice: VOICE })
    const ui = await $.ui.mount(row('eye-2-end', 'terminal'))
    // A short region (the desktop's first layout is 1 row) still gets all 16 rows: the desktop grows to what is drawn.
    await ui.resize({ columns, rows: 7, in: 'eye' })
    await ui.advance(400)
    const rows = (await ui.findAll({ type: 'Text', in: 'eye' })).filter(t => t.props.wrap === 'truncate-end')
    expect(rows.length).toBe(H)
    for (const r of rows) expect([...r.text].length).toBe(columns - MARGIN)
    const [outer, frameBox] = await ui.findAll({ type: 'Box', in: 'eye' })
    // Still 16 Text rows: the breathing room is the outer Box's padding, not extra rows of the frame.
    expect([outer?.props.width, outer?.props.alignItems, outer?.props.paddingTop, outer?.props.paddingBottom]).toEqual([columns, 'center', PAD_TOP, PAD_BOTTOM])
    // The rows are centred inside the frame too, so glyphs narrower than a laid-out cell (desktop) stay in the middle.
    expect([frameBox?.props.width, frameBox?.props.overflow, frameBox?.props.alignItems]).toEqual([columns - MARGIN, 'hidden', 'center'])
    await ui.unmount()
  })
}

test('the frame sits in the middle of its region: equal margins either side, one cell apart at most', () => {
  for (const columns of [17, 30, 31, 40, 41, 60, 77, 84, 85, 120, 201]) {
    const [w] = fit(columns)
    const left = Math.floor((columns - w) / 2)
    const right = columns - w - left
    expect(left >= 1 && right >= 1).toBe(true)
    // Up to the full frame the margin is exactly MARGIN, split evenly; past it, an odd slack leaves one cell over.
    if (columns <= W + MARGIN) expect([left, right]).toEqual([MARGIN / 2, MARGIN / 2])
    else expect(right - left <= 1).toBe(true)
  }
  // The pointer at the region's middle, below the top padding, is the frame's middle: the gaze stays put.
  for (const columns of [40, 41, 84, 85]) {
    const m = init('idle', rnd)
    pointIn(m, columns / 2 - 0.5, PAD_TOP + H / 2 - 0.5, columns)
    expect(look(m)).toEqual([0, 0])
  }
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`stale, other plugins' and hidden rows draw nothing of ours (${surface})`, async ($, on) => {
    seed(on, { phase: 'idle', turnSeq: 2, tail: 99_000, voice: VOICE })
    for (const target of [row('eye-1', surface), row('eye-2', surface), row('eye-2-end', surface), row('eye-2-end', surface, 'other')]) {
      const ui = await $.ui.mount(target)
      expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
      await ui.unmount()
    }
  })
}

test('a placed row the desktop might ask for stays empty: the reply route draws there', async ($, on) => {
  seed(on, { phase: 'thinking', turnSeq: 2, tail: 0, voice: VOICE })
  const ui = await $.ui.mount(row('eye-2', 'desktop'))
  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
  await ui.unmount()
})

test('speaking keeps the eye in the row; the orb is gone', async ($, on) => {
  seed(on, { phase: 'idle', turnSeq: 2, tail: 99_000, voice: { ...VOICE, speaking: true, subtitle: 'All tests pass.' } })
  const ui = await $.ui.mount(row('eye-2-end', 'terminal'))
  expect(await ui.find({ type: 'Client', key: 'eye' })).toBeDefined()
  expect(await ui.find({ type: 'Client', key: 'orb' })).toBeUndefined()
  await ui.unmount()
})

const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const

// The engine beneath a whole turn: core's reads, the placed row, toasts, redraws.
function session(on: On, now = 1000) {
  const clock = mock.clock(on, { now })
  mock.env(on, { HOME: '/home/u' })
  on('fs.read', () => ({ deny: 'ENOENT' }))
  on('session.turns', () => ({ value: 1 }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('ui.place', () => ({ value: { isPlaced: true, requestId: 'r' } }))
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  const voices: { enabled: boolean; speaking: boolean; subtitle: string }[] = []
  on('state.set', (_, e, next) => {
    if (e.key === 'voice') voices.push((e.value as { value: (typeof voices)[number] }).value)
    return next(e)
  })
  return { clock, toasts, voices }
}

const TURN = { durationMs: 5, isAborted: false, turnId: 't', reason: 'answer' } as const

test('/voiceover toggles, and a reply is shown sentence by sentence when speech fails', async ($, on) => {
  const { clock, toasts, voices } = session(on)
  on('audio.speak', () => ({ deny: 'no synthesizer' }))

  expect((await $.command.run({ ...RUN, command: 'voiceover', args: 'on' })).text).toBe('Voice-over is on.')
  expect((await $.command.run({ ...RUN, command: 'voiceover', args: 'loud' })).text).toBe('Usage: /voiceover [on|off|test]')

  await $.turn.complete({ ...TURN, answer: 'One. Two!' })
  await clock.advance(0)
  expect(voices.at(-1)).toMatchObject({ speaking: true, subtitle: 'One.' })
  expect(toasts).toEqual(['Horus: speech is unavailable here, showing subtitles only.'])
  await clock.advance(1200)
  expect(voices.at(-1)).toMatchObject({ speaking: true, subtitle: 'Two!' })
  await clock.advance(1200)
  expect(voices.at(-1)).toMatchObject({ speaking: false, subtitle: '' })

  expect((await $.command.run({ ...RUN, command: 'voiceover', args: '' })).text).toBe('Voice-over is off.')
})

for (const works of [true, false]) {
  test(`/voiceover test speaks one line and says whether speech ${works ? 'works' : 'fails'}`, async ($, on) => {
    const { clock, voices } = session(on)
    const spoken: string[] = []
    on('audio.speak', (_, e) => {
      spoken.push(e.text)
      return works ? { value: { via: 'system' } } : { deny: 'no synthesizer' }
    })
    const ran = $.command.run({ ...RUN, command: 'voiceover', args: 'test' })
    await clock.advance(2500)
    const said = (await ran).text
    expect(spoken).toEqual(['The eye of Horus is watching.'])
    if (works) expect(said).toBe('Speech works: the system synthesizer said "The eye of Horus is watching.". Voice-over is off.')
    else expect(said).toMatch(/^Speech failed \(.*no synthesizer\): replies show as subtitles only\. Voice-over is off\.$/)
    expect(voices.at(0)).toMatchObject({ speaking: true, subtitle: 'The eye of Horus is watching.' })
    expect(voices.at(-1)).toMatchObject({ speaking: false, subtitle: '' })
  })
}

test('on the desktop the idle eye sits under the reply once the hide window ends; /horus-eye says so', async ($, on) => {
  const { clock } = session(on)
  on('session.surfaces', () => ({ value: ['desktop'] }))
  engine(on)
  await $.turn.complete({ ...TURN, answer: 'Intro.\n\nAll tests pass.' })
  const reply = (requestId: string, text: string) =>
    ({ plugin: 'eyes-of-horus', surface: 'desktop', component: 'AssistantMessage', requestId, props: { text, isFirstOfReply: false } }) as const

  let ui = await $.ui.mount(reply('m1', 'All tests pass.'))
  expect(await ui.find({ type: 'Client', key: 'eye' })).toBeUndefined()
  await ui.unmount()

  await clock.advance(HIDE_MS)
  ui = await $.ui.mount(reply('m1', 'All tests pass.'))
  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
  expect((await ui.find({ type: 'Client', key: 'eye' }))?.props.props).toEqual({ mode: 'idle' })
  // No width on either Box: the desktop app mounts no Client in a reply whose root Box has width="100%".
  const rows = (await ui.findAll({ type: 'Box' })).map(b => [b.props.width, b.props.flexDirection, b.props.justifyContent])
  expect(rows).toEqual([[undefined, 'column', undefined], [undefined, 'row', 'center']])
  await ui.unmount()

  ui = await $.ui.mount(reply('m0', 'Intro.'))
  expect(await ui.find({ type: 'Client', key: 'eye' })).toBeUndefined()
  await ui.unmount()

  const diag = (await $.command.run({ ...RUN, command: 'horus-eye', args: '' })).text
  expect(diag).toContain('Horus eye: phase idle, turn 0, last reply 8.0s ago.')
  expect(diag).toContain('Now showing: eye.')
  expect(diag).toContain('Surfaces: desktop.')
  expect(diag).toContain('last $.ui.place: eye-0-end placed (r), 8.0s ago')
  expect(diag).toContain('reply known: 23 chars')
  expect(diag).toContain('desktop reply: m1 -> eye')
})
