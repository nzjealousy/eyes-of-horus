import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import {
  advance, BLANK, BLINK, eyeCell, eyeCells, fit, FRAME, frame, GAP_TOP, GAZES, gazeToward, H, init, lids, look, MARGIN, leftOf, merge, MAX_SLACK, MAX_W, MIN_H, openness, PAD_BOTTOM, PAD_TOP, pads, point, shiftRows,
  pointIn, RAMP, redraw, RELEASE_MS, type Seg, shade, SKIN_BG, STRETCH_X, usable, W,
} from '../hooks/clients/eye-view'
import { diagnose, endsReply, eyeWidth, HIDE_MS, rowId, show, speakable } from '../hooks/eye'
import { dim, gold, goldBright, text as white } from '../hooks/theme'

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
  // The frame is far fewer runs than cells, though every cell is shaded.
  expect(rows.reduce((n, r) => n + r.length, 0) < (W * H) / 3).toBe(true)
})

test('the eye is 82 x 32 before layout and otherwise sized from the region width alone, in that shape', () => {
  expect(fit(0)).toEqual([W, H])
  expect([W, H, MAX_W]).toEqual([82, 32, 82])
  // The frame leaves MARGIN columns free (full size at the desktop's 84), never grows past MAX_W and its rows follow in the 82:32 shape.
  expect([fit(200), fit(84)]).toEqual([[MAX_W, H], [W, H]])
  expect([fit(42), fit(30), fit(10), fit(1)].map(f => f[0])).toEqual([40, 28, 8, 1])
  // `slack` (/horus-fit) leaves a share of the columns free too, up to MAX_SLACK; the rows follow the width.
  expect([fit(84, 0.15), fit(84, 0.2), fit(84, 0.9), fit(84, -1)]).toEqual([[69, 27], [65, 25], fit(84, MAX_SLACK), [W, H]])
  for (const slack of [0, 0.15, MAX_SLACK]) {
    for (const columns of [1, 10, 30, 60, 84, 120, 200, 400]) {
      const [w, h] = fit(columns, slack)
      expect(w + MARGIN <= Math.max(columns, 3) && w <= MAX_W && h >= MIN_H).toBe(true)
      if (w >= 2 * MIN_H * 5) expect(Math.abs(h - (w * H) / W) <= 0.5).toBe(true)
    }
  }
  // Skin fills the whole frame now, so the eye's size is read off its opening: the cells in the sclera's colours.
  const extent = (w: number, h: number) => {
    const lit = eyeCells(w, h, { ox: 0, oy: 0, open: 1 }).map(r => r.map(s => s[0] !== BLANK && (s[1] === white || s[1] === dim)))
    const xs = lit.flatMap(r => r.flatMap((on, x) => (on ? [x] : [])))
    return [Math.max(...xs) - Math.min(...xs) + 1, lit.filter(r => r.includes(true)).length]
  }
  expect(extent(W, H)).toEqual([54, 9]) // the almond between its kohl lines: about 3:1 on screen, a cell being twice as tall as wide
  // The frame's shape keeps the eye inside it at every width: its opening never reaches the frame's edge.
  for (const columns of [30, 60, 84]) {
    const [w, h] = fit(columns)
    const [ew, eh] = extent(w, h)
    expect(ew < w && eh < h).toBe(true)
  }
  expect(extent(75, 7)).toEqual([10, 1]) // the old bug: fitting to an echoed 7 rows drew a tiny eye
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

test('the eye is drawn STRETCH_X wider, but its iris stays round on screen', () => {
  const pose = { ox: 0, oy: 0, open: 1 }
  const colour = (px: number, py: number, p = pose) => eyeCell(px, py, p)[1]
  // 4.5 screen units from the pupil's middle is the iris's gold band, across (x, scaled by the stretch) as well as up and down.
  expect([colour(4.5 / STRETCH_X, 0), colour(-4.5 / STRETCH_X, 0), colour(0, 4.5), colour(0, -4.5)]).toEqual([gold, gold, gold, gold])
  // Unscaled, 4.5 units across is already past that band, and 5.5 is the sclera: the iris is narrower in units than it is tall.
  expect(colour(4.5, 0) === gold).toBe(false)
  expect(colour(5.5, 0)).toBe(white)
  // The iris travels with the gaze in eye units, so it still sits inside the lids at the largest reach.
  expect(colour(6 + 4.5 / STRETCH_X, 0, { ...pose, ox: 6 })).toBe(gold)
})

test('lashes stand above the open upper lid in a row of dark strokes and fold away when the eye shuts', () => {
  // Along the lid, 3 units above its line (just over the kohl), the lash strokes are dark and the lid's skin shows between them.
  const above = (open: number) => Array.from({ length: 100 }, (_, i) => eyeCell(-8 + i * 0.2, lids(-8 + i * 0.2, open)[0] - 3, { ox: 0, oy: 0, open })[0])
  const row = above(1)
  const strokes = row.filter((l, i) => l === 0 && row[i - 1] !== 0).length
  expect(strokes >= 4).toBe(true)
  expect(row.filter(l => l > 0.4).length > strokes).toBe(true)
  // Shut, there are none: only skin.
  expect(above(0).every(l => l > 0.4)).toBe(true)
})

test('skin fills the whole frame, shaded darker toward its corners', () => {
  const pose = { ox: 0, oy: 0, open: 1 }
  for (const columns of [30, 60, 84]) {
    const [w, h] = fit(columns)
    const cells = eyeCells(w, h, pose)
    // Only the dark strokes (kohl, lashes, brow, markings) and the pupil leave a cell empty: under a quarter, even at 28 columns where a stroke is a whole row thick.
    expect(cells.flat().filter(s => s[0] !== BLANK).length > 0.75 * w * h).toBe(true)
    for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]] as const) expect(cells[y]?.[x]?.[0] === BLANK).toBe(false)
  }
  // The cheek is brighter than the frame's corner, and the brow is a dark band on the skin above the eye.
  const cheek = eyeCell(-10, 12, pose)[0]
  expect([cheek > 0.5, eyeCell(-18, 22, pose)[0] < cheek, eyeCell(6, -20, pose)[0] < 0.4, eyeCell(6, -15, pose)[0] > 0.5]).toEqual([true, true, true, true])
})

test('the kohl is a dark line on the bright skin: heavy on the upper lid, winged past the outer corner, with the lower lid, teardrop and spiral drawn too', () => {
  for (const open of [1, 0.55, 0]) {
    const pose = { ox: 0, oy: 0, open }
    const [yU, yL] = lids(0, open)
    // Empty cells (luminance 0) on both lid lines, the wing (4 units past the outer corner at 15), the teardrop and the spiral.
    expect([eyeCell(0, yU - 0.4, pose)[0], eyeCell(0, yL + 0.2, pose)[0], eyeCell(19, -1.12, pose)[0], eyeCell(-3.5, 11.5, pose)[0], eyeCell(4.5, 9.8, pose)[0]]).toEqual([0, 0, 0, 0, 0])
    // The upper line is thicker toward the outer corner than toward the inner one.
    const thickness = (px: number) => Array.from({ length: 80 }, (_, i) => eyeCell(px, lids(px, open)[0] - 4.4 + i * 0.1, pose)[0]).filter(l => l === 0).length
    expect(thickness(9) > thickness(-9)).toBe(true)
  }
  // The wing thins to its tip and the skin beyond it is bright again.
  const pose = { ox: 0, oy: 0, open: 1 }
  const wing = (px: number) => Array.from({ length: 120 }, (_, i) => eyeCell(px, -9 + i * 0.1, pose)[0]).filter(l => l === 0).length
  expect([wing(16) > wing(20), wing(20) > wing(24), wing(26)]).toEqual([true, true, 0])
})

test('the open eye shows a gold iris, a dark pupil and a white highlight; the lids meet when shut', () => {
  const colours = (rows: Seg[][]) => new Set(rows.flat().map(s => s[1]))
  const open = colours(eyeCells(W, H, { ox: 0, oy: 0, open: 1 }))
  expect([open.has(goldBright), open.has(gold), open.has(white)]).toEqual([true, true, true])
  expect(eyeCell(0, 0, { ox: 0, oy: 0, open: 1 })[0]).toBe(0)
  const shut = colours(eyeCells(W, H, { ox: 0, oy: 0, open: 0 }))
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
  const mid = GAP_TOP + pads(h)[0] + h / 2
  pointIn(m, left, mid, 200)
  expect(look(m)).toEqual([-1, 0])
  pointIn(m, 100, mid, 200) // the frame's middle
  expect(look(m)).toEqual([0, 0])
  pointIn(m, left + w, mid, 200)
  expect(look(m)).toEqual([1, 0])
  // Before the first layout (0 columns) the region is the frame plus MARGIN.
  pointIn(m, 1, GAP_TOP + PAD_TOP + H / 2, 0)
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

test('the eye redraws only when its size or pose changes', () => {
  const m = init('idle', rnd)
  m.nextSaccade = m.nextBlink = 1e9
  expect(redraw(m, 40)).toBe(true)
  expect(redraw(m, 40)).toBe(false)
  expect(redraw(m, 30)).toBe(true)
  // A settled eye is not drawn again; a glance and a blink are, each with a different picture.
  advance(m, FRAME, rnd)
  expect(redraw(m, 30)).toBe(false)
  const still = text(m.rows).join('\n')
  m.gx = 1
  advance(m, FRAME, rnd)
  expect(redraw(m, 30)).toBe(true)
  const glance = text(m.rows).join('\n')
  expect(glance === still).toBe(false)
  m.nextBlink = m.t
  advance(m, FRAME, rnd)
  expect(redraw(m, 30)).toBe(true)
  expect(text(m.rows).join('\n') === glance).toBe(false)
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
  // The region is 84 wide with no viewport; the gap above, its frame's rows and the rows of skin above and below.
  const [, fh] = fit(84)
  const [padT, padB] = pads(fh)
  expect([eye?.props.width, eye?.props.height]).toEqual([84, GAP_TOP + fh + padT + padB])
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
    expect([...r.text].length).toBe(dw + MARGIN) // the skin runs across the whole region, the margin included
  }
  await ui.unmount()
})

test('/horus-fit: the saved percent reaches the eye as a share, and the eye draws narrower rows', async ($, on) => {
  seed(on, { phase: 'idle', turnSeq: 2, tail: 0, voice: VOICE, fitSlack: 20 })
  const ui = await $.ui.mount(row('eye-2-end', 'terminal'))
  const eye = await ui.find({ type: 'Client', key: 'eye' })
  expect(eye?.props.props).toEqual({ mode: 'idle', shift: 0, slack: 0.2 })
  const [fw, fh] = fit(84, 0.2)
  expect([fw < W, eye?.props.height]).toEqual([true, GAP_TOP + fh + pads(fh)[0] + pads(fh)[1]])
  await ui.resize({ columns: 84, rows: 7, in: 'eye' })
  await ui.advance(400)
  const rows = (await ui.findAll({ type: 'Text', in: 'eye' })).filter(t => t.props.wrap === 'truncate-end')
  expect(rows.length).toBe(fh + pads(fh)[0] + pads(fh)[1])
  // The picture uses only the share of the region that is left (so a wide font's rows do not wrap), the frame inside it.
  for (const r of rows) expect([...r.text].length).toBe(usable(84, fw, 0.2))
  expect(usable(84, fw, 0.2) < 84).toBe(true)
  await ui.unmount()
})

// Only glyphs one cell wide in any mono face: printable ASCII, the no-break space and the middle dot.
const NARROW = /^[ -~ ·]*$/

test('every eye row is one line of exactly the frame width, in single-width glyphs', () => {
  for (const columns of [30, 40, 60, 84]) {
    const [w, h] = fit(columns)
    expect(w).toBe(columns - MARGIN)
    const [padT, padB] = pads(h)
    // Every pose, the rows above and below the frame included.
    for (const [ox, oy, open] of [[0, 0, 1], [6, 2.5, 1], [-6, -2.5, 0.55], [0, 0, 0.12], [0, 0, 0]] as const) {
      const rows = text(eyeCells(w, h, { ox, oy, open }, -padT, h + padB))
      expect(rows.length).toBe(padT + h + padB)
      for (const row of rows) {
        expect([...row].length).toBe(w)
        expect(NARROW.test(row)).toBe(true)
      }
    }
  }
  expect(NARROW.test(RAMP)).toBe(true)
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
    // Region-wide rows: the skin runs to the region's edges, with the frame (fw wide) sitting in the middle of them.
    for (const r of rows) expect([...r.text].length).toBe(columns)
    const [outer, pictureBox] = await ui.findAll({ type: 'Box', in: 'eye' })
    // The frame's rows come from the width alone; above and below it are more rows of skin, not padding (the desktop ignored it).
    // The outer Box carries the blank gap rows and is not black: only the picture is (so the gap is the app's own colour).
    expect([outer?.props.width, outer?.props.alignItems, outer?.props.backgroundColor]).toEqual([columns, 'center', undefined])
    const blank = (await ui.findAll({ type: 'Text', in: 'eye' })).filter(t => t.props.wrap !== 'truncate-end' && t.text === ' ')
    expect(blank.length).toBe(GAP_TOP) // the gap above the picture; the pad rows are drawn like the frame's, as rows of runs
    expect(fw <= columns - MARGIN).toBe(true)
    // The picture is region-wide and black behind its glyphs.
    expect([pictureBox?.props.width, pictureBox?.props.overflow, pictureBox?.props.backgroundColor]).toEqual([columns, 'hidden', SKIN_BG])
    await ui.unmount()
  })
}

test('the skin runs across the whole region: rows as wide as it, the frame in the middle, the same picture throughout', () => {
  for (const [columns, shift] of [[30, 0], [84, 0], [84, 2], [200, 0], [200, 2]] as const) {
    const m = init('idle', rnd)
    m.shift = shift
    redraw(m, columns)
    const [w, h] = fit(columns)
    const left = leftOf(columns, w, shift)
    expect([m.top.length, m.rows.length, m.bottom.length]).toEqual([pads(h)[0], h, pads(h)[1]])
    for (const line of text([...m.top, ...m.rows, ...m.bottom])) {
      // Never wider than the region: the desktop wraps an overlong row instead of clipping it.
      expect([...line].length).toBe(columns)
      expect(NARROW.test(line)).toBe(true)
    }
    // Beside the frame there is skin, not a black strip: the cells right next to it are shaded (not blank).
    for (const line of text([...m.top, ...m.rows, ...m.bottom])) {
      expect(line.slice(Math.max(0, left - 2), left).includes(BLANK)).toBe(false)
      expect(line.slice(left + w, left + w + 2).includes(BLANK)).toBe(false)
    }
    // One picture: the frame's cells are the same as drawing the frame alone, whatever lies beside it.
    const whole = text(eyeCells(w, h, { ox: 0, oy: 0, open: 1 }, -pads(h)[0], h + pads(h)[1], -left, columns - left).map(merge))
    expect(text([...m.top, ...m.rows, ...m.bottom])).toEqual(whole)
    const alone = text(frame(m, w, h))
    expect(text(m.rows).map(r => r.slice(left, left + w))).toEqual(alone)
  }
  expect([PAD_TOP, PAD_BOTTOM, pads(H)]).toEqual([1, 0, [1, 0]])
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
    pointIn(m, columns / 2 - 0.5, GAP_TOP + pads(h)[0] + h / 2 - 0.5, columns)
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
  pointIn(m, 40 + 2, GAP_TOP + pads(h)[0] + h / 2 - 0.5, 80)
  const centred = init('idle', rnd)
  pointIn(centred, 40 - ((80 - w) / 2 - 1) + (80 - w) / 2 - 1, GAP_TOP + pads(h)[0] + h / 2 - 0.5, 80)
  expect(look(m)).toEqual(look(centred))
})
