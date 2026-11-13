import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import {
  advance, BLANK, BLINK, eyeCell, eyeCells, fit, FRAME, frame, GAZES, gazeToward, H, init, lids, look, MARGIN, merge, MAX_SLACK, MAX_W, MIN_H, openness, PAD_BOTTOM, PAD_TOP, padRows, pads, point, shiftRows,
  pointIn, RAMP, redraw, RELEASE_MS, scatter, type Seg, shade, SPARK_INSET, sparkleLevel, twinkle, W,
} from '../hooks/clients/eye-view'
import { diagnose, endsReply, eyeWidth, HIDE_MS, rowId, show, speakable } from '../hooks/eye'
import { bg, gold, goldBright, orbCore, text as white } from '../hooks/theme'

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

test('the row keeps the eye up while speaking, hides during output and 3 s after a turn', () => {
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

test('the eye is 82 x 19 before layout and otherwise sized from the region width alone, in that shape', () => {
  expect(fit(0)).toEqual([W, H])
  expect([W, H, MAX_W]).toEqual([82, 19, 82])
  // The frame leaves MARGIN columns free (full size at the desktop's 84), never grows past MAX_W and its rows follow in the 82:19 shape.
  expect([fit(200), fit(84)]).toEqual([[MAX_W, H], [W, H]])
  expect([fit(42), fit(30), fit(10), fit(1)].map(f => f[0])).toEqual([40, 28, 8, 1])
  // `slack` (/horus-fit) leaves a share of the columns free too, up to MAX_SLACK; the rows follow the width.
  expect([fit(84, 0.15), fit(84, 0.2), fit(84, 0.9), fit(84, -1)]).toEqual([[69, 16], [65, 15], fit(84, MAX_SLACK), [W, H]])
  for (const slack of [0, 0.15, MAX_SLACK]) {
    for (const columns of [1, 10, 30, 60, 84, 120, 200, 400]) {
      const [w, h] = fit(columns, slack)
      expect(w + MARGIN <= Math.max(columns, 3) && w <= MAX_W && h >= MIN_H).toBe(true)
      if (w >= 2 * MIN_H * 5) expect(Math.abs(h - (w * H) / W) <= 0.5).toBe(true)
    }
  }
  // The desktop region measured live: 77 x 16 once the frame is 16 rows. Fitting to its echoed 7 rows drew the eye 23 x 7.
  const extent = (w: number, h: number) => {
    const lit = eyeCells(w, h, { ox: 0, oy: 0, open: 1, t: 0 }).map(r => r.map(s => s[0] !== BLANK))
    const xs = lit.flatMap(r => r.flatMap((on, x) => (on ? [x] : [])))
    return [Math.max(...xs) - Math.min(...xs) + 1, lit.filter(r => r.includes(true)).length]
  }
  expect(extent(W, H)).toEqual([49, 18]) // the Wedjat's tail, tear and spiral take room in the 19 rows; 49 of the 82 columns
  // The frame's shape keeps the eye inside it at every width: its lit extent never exceeds the frame.
  for (const columns of [30, 60, 84]) {
    const [w, h] = fit(columns)
    const [ew, eh] = extent(w, h)
    expect(ew <= w && eh <= h).toBe(true)
  }
  expect(extent(75, 7)).toEqual([15, 7])
  for (const [w, h] of [[82, 16], [40, 13], [24, 9], [60, 17]] as const) {
    const rows = text(frame(init('idle', rnd), w, h))
    expect(rows.length).toBe(h)
    for (const row of rows) expect([...row].length).toBe(w)
  }
  expect(eyeWidth(200)).toBe(MAX_W + MARGIN)
  expect(eyeWidth(86)).toBe(84)
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
  point(m, 81, H / 2)
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
  // A 200-column region holds its frame centred: region column `left` is the frame's left edge, `left + w` its right.
  const m = init('idle', rnd)
  const [w, h] = fit(200)
  const left = (200 - w) / 2
  const mid = pads(h)[0] + h / 2
  pointIn(m, left, mid, 200)
  expect(look(m)).toEqual([-1, 0])
  pointIn(m, 100, mid, 200) // the frame's middle
  expect(look(m)).toEqual([0, 0])
  pointIn(m, left + w, mid, 200)
  expect(look(m)).toEqual([1, 0])
  // Before the first layout (0 columns) the region is the frame plus MARGIN.
  pointIn(m, 1, PAD_TOP + H / 2, 0)
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
    tail: 9_000,
    voice: { enabled: false, speaking: false },
    surfaces: ['desktop'],
    replyChars: 0,
    place: { id: 'eye-4-end', at: 7_000, result: 'placed (r9)' },
    seen: { 'terminal placed row': { id: 'eye-4-end', what: 'none', at: 9_500 } },
  })
  expect(out).toBe(
    [
      'Horus eye: phase idle, turn 4, last reply 1.0s ago.',
      'Now showing: none (hidden 2.0s more after the reply). Voice-over off.',
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
  expect(eye?.props.props).toEqual({ mode: 'thinking', shift: 0, slack: 0 }) // the terminal's cells are as wide as its glyphs: no shift; no width held back by default
  // The region is 84 wide with no viewport; its frame's rows plus the starry rows above and below.
  const [, fh] = fit(84)
  const [padT, padB] = pads(fh)
  expect([eye?.props.width, eye?.props.height]).toEqual([84, fh + padT + padB])
  const box = await ui.find({ type: 'Box' })
  expect([box?.props.width, box?.props.flexDirection, box?.props.justifyContent]).toEqual(['100%', 'row', 'center'])
  await ui.pointer({ type: 'move', x: 81, y: 8, in: 'eye' })
  await ui.advance(400)
  const rows = (await ui.findAll({ type: 'Text', in: 'eye' })).filter(t => t.props.wrap === 'truncate-end')
  // No layout has been reported to the Client yet (0 columns), so it draws the reference frame, not the 84-column one.
  const [dw, dh] = fit(0)
  expect(rows.length).toBe(dh + pads(dh)[0] + pads(dh)[1])
  for (const r of rows) {
    expect(r.props.mono).toBe(true)
    expect([...r.text].length).toBe(dw)
  }
  await ui.unmount()
})

test('/horus-fit: the saved percent reaches the eye as a share, and the eye draws narrower rows', async ($, on) => {
  seed(on, { phase: 'idle', turnSeq: 2, tail: 0, voice: VOICE, fitSlack: 20 })
  const ui = await $.ui.mount(row('eye-2-end', 'terminal'))
  const eye = await ui.find({ type: 'Client', key: 'eye' })
  expect(eye?.props.props).toEqual({ mode: 'idle', shift: 0, slack: 0.2 })
  const [fw, fh] = fit(84, 0.2)
  expect([fw < W, eye?.props.height]).toEqual([true, fh + pads(fh)[0] + pads(fh)[1]])
  await ui.resize({ columns: 84, rows: 7, in: 'eye' })
  await ui.advance(400)
  const rows = (await ui.findAll({ type: 'Text', in: 'eye' })).filter(t => t.props.wrap === 'truncate-end')
  expect(rows.length).toBe(fh + pads(fh)[0] + pads(fh)[1])
  for (const r of rows) expect([...r.text].length).toBe(fw)
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
  const [fw, fh] = fit(columns)
  const [padT, padB] = pads(fh)
  test(`a ${columns}-column region draws rows of ${fw}, centred, each cut rather than wrapped`, async ($, on) => {
    seed(on, { phase: 'idle', turnSeq: 2, tail: 0, voice: VOICE })
    const ui = await $.ui.mount(row('eye-2-end', 'terminal'))
    // A short region (the desktop's first layout is 1 row) still gets all its rows: the desktop grows to what is drawn.
    await ui.resize({ columns, rows: 7, in: 'eye' })
    await ui.advance(400)
    const rows = (await ui.findAll({ type: 'Text', in: 'eye' })).filter(t => t.props.wrap === 'truncate-end')
    expect(rows.length).toBe(fh + padT + padB)
    for (const r of rows) expect([...r.text].length).toBe(fw)
    const [outer, frameBox] = await ui.findAll({ type: 'Box', in: 'eye' })
    // The frame's rows come from the width alone; the breathing room is starry rows above and below, not padding (the desktop ignored it).
    // The outer Box is black too, so the pad rows above and below the eye are not left as the app's own colour.
    expect([outer?.props.width, outer?.props.alignItems, outer?.props.backgroundColor]).toEqual([columns, 'center', bg])
    const blank = (await ui.findAll({ type: 'Text', in: 'eye' })).filter(t => t.props.wrap !== 'truncate-end' && t.text === ' ')
    expect(blank.length).toBe(0) // the pad rows are drawn like the frame's, as rows of runs
    // The rows are centred inside the frame too, so glyphs narrower than a laid-out cell (desktop) stay in the middle.
    expect([frameBox?.props.width, frameBox?.props.overflow, frameBox?.props.alignItems]).toEqual([fw, 'hidden', 'center'])
    await ui.unmount()
  })
}

test('the black rows above and below the frame hold twinkling stars, one glyph wide and clear of the side edges', () => {
  for (const w of [30, 82]) {
    const seen = new Set<string>()
    for (let t = 0; t < 6000; t += 250) {
      const top = padRows(PAD_TOP, w, t, 11)
      expect(top.length).toBe(PAD_TOP)
      for (const r of top) {
        const line = r.map(([s]) => s).join('')
        expect([...line].length).toBe(w)
        expect(NARROW.test(line)).toBe(true)
        expect(line.slice(0, SPARK_INSET[0]).trim()).toBe('')
        expect(line.slice(w - SPARK_INSET[0]).trim()).toBe('')
        for (const ch of line) if (ch.trim() !== '') seen.add(ch)
      }
      expect(padRows(PAD_BOTTOM, w, t, 23).length).toBe(PAD_BOTTOM)
    }
    expect(seen.size > 1).toBe(true) // they twinkle through more than one glyph
  }
})

test('the frame sits in the middle of its region: equal margins either side, one cell apart at most', () => {
  for (const columns of [17, 30, 31, 40, 41, 60, 77, 84, 85, 120, 201]) {
    const [w] = fit(columns)
    const left = Math.floor((columns - w) / 2)
    const right = columns - w - left
    expect(left >= 1 && right >= 1).toBe(true)
    // An odd slack leaves one cell over.
    expect(right - left <= 1).toBe(true)
  }
  // The pointer at the region's middle, below the top padding, is the frame's middle: the gaze stays put.
  for (const columns of [40, 41, 84, 85]) {
    const m = init('idle', rnd)
    const [, h] = fit(columns)
    pointIn(m, columns / 2 - 0.5, pads(h)[0] + h / 2 - 0.5, columns)
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
  expect((await ui.find({ type: 'Client', key: 'eye' }))?.props.props).toEqual({ mode: 'idle', shift: 2, slack: 0 }) // the desktop's cell is wider than its glyph: moved right
  // No width on either Box: the desktop app mounts no Client in a reply whose root Box has width="100%".
  const rows = (await ui.findAll({ type: 'Box' })).map(b => [b.props.width, b.props.flexDirection, b.props.justifyContent])
  expect(rows).toEqual([[undefined, 'column', undefined], [undefined, 'row', 'center']])
  await ui.unmount()

  ui = await $.ui.mount(reply('m0', 'Intro.'))
  expect(await ui.find({ type: 'Client', key: 'eye' })).toBeUndefined()
  await ui.unmount()

  const diag = (await $.command.run({ ...RUN, command: 'horus-eye', args: '' })).text
  expect(diag).toContain('Horus eye: phase idle, turn 0, last reply 3.0s ago.')
  expect(diag).toContain('Now showing: eye.')
  expect(diag).toContain('Surfaces: desktop.')
  expect(diag).toContain('last $.ui.place: eye-0-end placed (r), 3.0s ago')
  expect(diag).toContain('reply known: 23 chars')
  expect(diag).toContain('desktop reply: m1 -> eye')
})

test('shiftRows moves every row right by n cells and keeps its width; the pointer is read against the shifted drawing', () => {
  const rows: [string, string][][] = [[['abc', 'x'], ['de', 'y']], [['fghij', 'z']]]
  expect(shiftRows(rows, 0)).toBe(rows)
  const out = shiftRows(rows, 2)
  expect(out.map(r => r.map(([t]) => t).join(''))).toEqual(['  abc', '  fgh'])
  for (const r of out) expect(r.map(([t]) => [...t].length).reduce((a, b) => a + b, 0)).toBe(5)
  const m = init('idle', rnd)
  m.shift = 2
  const [w, h] = fit(80)
  pointIn(m, 40 + 2, pads(h)[0] + h / 2 - 0.5, 80)
  const centred = init('idle', rnd)
  pointIn(centred, 40 - ((80 - w) / 2 - 1) + (80 - w) / 2 - 1, pads(h)[0] + h / 2 - 0.5, 80)
  expect(look(m)).toEqual(look(centred))
})
