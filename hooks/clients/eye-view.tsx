import type { ClientSurface } from 'claude-code'

import { aqua, aquaDim, bg, dim, gold, goldBright, orbCore, purple, purpleDim, text, violet, warn } from '../theme'

// The Eye of Horus as ASCII shading: each cell's luminance comes from an analytic eye (almond lids with a blink,
// sclera, a gold iris ring, pupil, specular, brow, aqua glow) and picks a glyph from a density ramp, coloured from
// the theme; star sparkles twinkle in the empty cells around it. All motion lives here, on the frame clock.

export type EyeMode = 'idle' | 'thinking' | 'tool'
/** `shift`: cells to move the drawing right, for a surface whose cell is wider than its glyph (desktop). */
/** `slack`: the share of the region's width left free (`/horus-fit`), for a font whose rows wrap. */
export type EyeProps = { mode: EyeMode; shift?: number; slack?: number }
export type Seg = [string, string]

export type EyeState = {
  /** Cells the drawing is moved right (EyeProps.shift), clamped by the view. */
  shift?: number
  /** The share of width left free (EyeProps.slack), clamped by the view. */
  slack?: number
  mode: EyeMode
  t: number
  /** Autonomous gaze (saccades), each -1 | 0 | 1. */
  gx: number
  gy: number
  /** Pointer gaze, in force until `pointerUntil`. */
  pgx: number
  pgy: number
  pointerUntil: number
  /** The iris centre now, eased toward the gaze, in eye units. */
  ox: number
  oy: number
  nextSaccade: number
  nextBlink: number
  blinkAt: number
  nextSweep: number
  sweepAt: number
  /** The drawn frame and its text key: the module redraws only when the key changes. */
  rows: Seg[][]
  /** The starry rows above and below the frame (PAD_TOP and PAD_BOTTOM of them). */
  top: Seg[][]
  bottom: Seg[][]
  key: string
}

/** The frame's reference size in cells (the region is MARGIN wider). A wider region grows it, in this shape, up to MAX_W. */
export const W = 82
export const H = 24
export const MAX_W = 2 * W
export const MIN_H = 6
/** The most of the region's columns `/horus-fit` may leave unused (a share, 0 to this). */
export const MAX_SLACK = 0.4
export const FRAME = 90
export const RELEASE_MS = 2500
/** Columns the frame leaves free in its region, so a line a hair wider than its cells (desktop) never wraps. */
export const MARGIN = 2
/** Starry black rows above and below the frame, so the eye does not sit tight against the reply or what follows. */
export const PAD_TOP = 4
export const PAD_BOTTOM = 1
/** The starry rows above and below a frame `h` rows tall: PAD_TOP and PAD_BOTTOM at the reference height, in proportion otherwise. */
export const pads = (h: number): [number, number] => [Math.max(1, Math.round((PAD_TOP * h) / H)), Math.max(1, Math.round((PAD_BOTTOM * h) / H))]
/** Columns and rows at the frame's edge where no sparkle goes, so a star never touches the region's edge. */
export const SPARK_INSET: readonly [number, number] = [2, 1]
const SWEEP_MS = 1500
/** Lid openness on each frame of a blink. */
export const BLINK = [0.55, 0.12, 0, 0.3, 0.7]
/** How far the iris travels for a gaze of 1, in eye units (a column is 1, a row is 2). */
const REACH_X = 6
const REACH_Y = 2.5
const EASE = 0.45

/** Glyphs from empty to dense; a blank cell is a no-break space so a desktop line keeps its width. */
export const RAMP = ' .\'`^",:;Il!i~+_-?][}{1)(|tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$'
export const BLANK = ' '

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Luminance 0..1 to its ramp glyph. */
export const shade = (lum: number) => RAMP[Math.round(clamp(lum, 0, 1) * (RAMP.length - 1))] ?? BLANK

const rgb = (c: string) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16))
/** A colour `f` of the way from `a` to `b` (both theme hex). */
export const mix = (a: string, b: string, f: number) => {
  const [x, y] = [rgb(a), rgb(b)]
  return `#${x.map((v, i) => Math.round(v + ((y[i] ?? v) - v) * f).toString(16).padStart(2, '0')).join('')}`
}

// The iris gradient, pupil edge to rim: gold core to amber.
const IRIS = [goldBright, gold, mix(gold, warn, 0.5), warn]
const AMBER_DARK = mix(warn, purpleDim, 0.45)

/** Consecutive cells of one colour as one run; a blank joins whatever run it follows. */
export function merge(cells: Seg[]): Seg[] {
  const out: Seg[] = []
  for (const [s, c] of cells) {
    const last = out[out.length - 1]
    if (last && (last[1] === c || s.trim() === '')) last[0] += s
    else if (last && last[0].trim() === '') {
      last[0] += s
      last[1] = c
    } else out.push([s, c])
  }
  return out
}

// ---- sparkles -------------------------------------------------------------------------------------------------

export type Sparkle = { x: number; y: number; period: number; phase: number; hue: number }
const TWINKLE: ReadonlyArray<readonly [number, string]> = [
  [0.25, BLANK],
  [0.5, '·'],
  [0.8, '+'],
  // ASCII peak, not '✦': a mono face without it falls back to a wider glyph and the desktop row wraps.
  [1.01, '*'],
]
const HUES: ReadonlyArray<readonly [string, string]> = [
  [aqua, orbCore],
  [gold, goldBright],
  [violet, text],
]

/** How lit a sparkle is at `t`: 0 (out) to 1 (peak) and back, once per period from its own phase. */
export const sparkleLevel = (s: Pick<Sparkle, 'period' | 'phase'>, t: number) => 0.5 - 0.5 * Math.cos(2 * Math.PI * (t / s.period + s.phase))

/** A sparkle's cell at a level: dim dot, cross, star. */
export function twinkle(level: number, hue: number): Seg {
  const ch = TWINKLE.find(([at]) => level < at)?.[1] ?? '*'
  const [mid, peak] = HUES[hue % HUES.length] ?? [aqua, orbCore]
  return [ch, ch === '·' ? dim : ch === '+' ? mid : peak]
}

/** Up to about one sparkle per 48 cells, placed (seeded, so stable) only where `isEmpty` says the cell is dark. */
export function scatter(w: number, h: number, isEmpty: (x: number, y: number) => boolean, seed = 7): Sparkle[] {
  let s = seed
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648)
  const out: Sparkle[] = []
  const want = Math.round((w * h) / 48)
  for (let i = 0; i < 400 && out.length < want; i++) {
    const x = Math.floor(rnd() * w)
    const y = Math.floor(rnd() * h)
    const period = 1400 + rnd() * 2200
    const phase = rnd()
    if (!isEmpty(x, y) || out.some(o => Math.abs(o.x - x) < 3 && Math.abs(o.y - y) < 2)) continue
    out.push({ x, y, period, phase, hue: out.length })
  }
  return out
}

/** Lays sparkles over a grid of cells, in the cells still blank. */
export function sparkle(grid: Seg[][], list: readonly Sparkle[], t: number) {
  for (const s of list) {
    const row = grid[s.y]
    if (row?.[s.x]?.[0] === BLANK) row[s.x] = twinkle(sparkleLevel(s, t), s.hue)
  }
}

// ---- the eye field --------------------------------------------------------------------------------------------

export type Pose = { ox: number; oy: number; open: number; t: number }

const A = 15 // the almond's half-width
// The Wedjat's extent in eye units: brow top to the spiral's foot, the inner corner to the cosmetic tail's end
// (asymmetric, so its middle sits right of the pupil), and that middle.
const EXT_W = 41
const EXT_H = 32
const MID_X = 4.25
const MID_Y = 3
/** How much of the frame the eye fills, on its tighter axis. */
const FILL = 0.94

/** Eye units of a cell centre: x in columns, y in half-rows (a cell is about twice as tall as wide), scaled so the eye fills FILL of the frame. */
function units(x: number, y: number, w: number, h: number): [number, number] {
  const k = FILL * Math.min(w / EXT_W, (2 * h) / EXT_H)
  return [(x + 0.5 - w / 2) / k + MID_X, ((y + 0.5 - h / 2) * 2) / k + MID_Y]
}
/** Upper and lower lid heights at `px`: open, they part; at 0 they meet in one line just below the middle. */
export function lids(px: number, open: number): [number, number] {
  const f = Math.max(0, 1 - (px / A) ** 2)
  return [f * (1.5 - 9.5 * open), f * (1.5 + 4.5 * open)]
}

// The Wedjat's markings under the eye, as polylines: the teardrop falling straight from under the pupil, and the
// spiral sweeping down from under the eye's middle, out to the right and curling inward.
type Pt = readonly [number, number]
const TEAR: Pt[] = [[-2, 6.2], [-3.5, 11.5], [-5, 16.8]]
const SPIRAL: Pt[] = (() => {
  const c: Pt = [13, 12.5]
  const pts: Pt[] = [[1.5, 6.4], [4.5, 9.8]]
  for (let i = 0; i <= 48; i++) {
    const th = Math.PI - (i / 48) * 2 * Math.PI // left, down, right, up, back left
    const r = 6 - 3.6 * (i / 48)
    pts.push([c[0] + r * Math.cos(th), c[1] + r * Math.sin(th)])
  }
  return pts
})()
/** Distance from a point to a polyline. */
export function distTo(line: readonly Pt[], px: number, py: number): number {
  let best = Infinity
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1]!
    const [bx, by] = line[i]!
    const dx = bx - ax
    const dy = by - ay
    const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1)
    best = Math.min(best, Math.hypot(px - ax - t * dx, py - ay - t * dy))
  }
  return best
}

/** Luminance and colour of one point of the eye, in eye units. */
export function eyeCell(px: number, py: number, p: Pose): [number, string] {
  const [yU, yL] = lids(px, p.open)
  const isInside = Math.abs(px) < A && py > yU && py < yL
  // The kohl line on the upper lid, its tail past the outer corner, the lower lid and the brow.
  if (Math.abs(px) < A + 0.5 && Math.abs(py - yU) < 1.3) return [0.68 - 0.12 * Math.abs(py - yU), violet]
  // The cosmetic line: straight on from the outer corner, far to the right.
  if (px >= A && px < A + 9.5 && Math.abs(py - (0.4 + 0.06 * (px - A))) < 1.1) return [0.62 - 0.02 * (px - A), violet]
  if (Math.abs(px) < A && Math.abs(py - yL) < 0.8) return [0.4, purple]
  // The brow: a thick arc over the eye, thinning as it runs on past the outer corner.
  const yB = -12 + 2 * (px / A) ** 2
  if (px > -A - 0.5 && px < A + 8.5 && Math.abs(py - yB) < 2 - 0.025 * (px + A)) return [0.66 - 0.12 * Math.abs(py - yB), violet]
  if (py > 5) {
    const tear = distTo(TEAR, px, py)
    if (tear < 1.1) return [0.64 - 0.15 * tear, violet]
    const curl = distTo(SPIRAL, px, py)
    if (curl < 1.1) return [0.64 - 0.15 * curl, violet]
  }
  if (!isInside) {
    // Inside the eye's outline but not the opening: lid skin, sparse purple, darkest at the outline.
    const e = Math.hypot(px / (A + 1), py / (py < 0 ? 11 : 7.5)) - 1
    if (e < 0) return [0.08 + 0.1 * clamp(-e * 3, 0, 1), purple]
    const lum = 0.16 * Math.exp(-e * 7) * (0.85 + 0.15 * Math.sin(p.t / 500 + Math.atan2(py, px) * 2))
    return [lum < 0.035 ? 0 : lum, lum > 0.11 ? aqua : aquaDim]
  }
  const r = Math.hypot(px - p.ox, py - p.oy)
  if (Math.hypot(px - p.ox + 1.8, py - p.oy + 1.6) < 1.3) return [1, text]
  if (r < 2.4) return [0, purpleDim]
  if (r < 6.2) {
    const q = (r - 2.4) / 3.8
    const fibre = 0.07 * Math.sin(Math.atan2(py - p.oy, px - p.ox) * 9)
    const lum = 0.95 - 0.35 * q + fibre - (q > 0.85 ? 0.22 : 0)
    return [lum, q > 0.85 ? AMBER_DARK : (IRIS[Math.floor(q * IRIS.length)] ?? warn)]
  }
  // Sclera, rounder toward the middle, shaded purple under the upper lid.
  const edge = Math.min(py - yU, yL - py)
  return [0.18 + 0.14 * clamp(edge / 3, 0, 1) + 0.1 * (1 - Math.abs(px) / A), py - yU < 2 ? purple : dim]
}

/** The eye's cells, `w` x `h`, before sparkles. */
export function eyeCells(w: number, h: number, p: Pose): Seg[][] {
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x): Seg => {
      const [px, py] = units(x, y, w, h)
      const [lum, c] = eyeCell(px, py, p)
      return [shade(lum), c]
    }),
  )
}

const sparkCache = new Map<string, Sparkle[]>()
const eyeSparkles = (w: number, h: number) => {
  const k = `${w}x${h}`
  let s = sparkCache.get(k)
  if (!s) {
    const open = eyeCells(w, h, { ox: 0, oy: 0, open: 1, t: 0 })
    // Dark in the open eye, its neighbours dark too, so a star never sits against the glow.
    const isDark = (x: number, y: number) => (open[y]?.[x]?.[0] ?? BLANK) === BLANK
    const [ix, iy] = SPARK_INSET
    const isInside = (x: number, y: number) => x >= ix && x < w - ix && y >= iy && y < h - iy
    s = scatter(w, h, (x, y) => isInside(x, y) && isDark(x, y) && isDark(x - 1, y) && isDark(x + 1, y))
    sparkCache.set(k, s)
  }
  return s
}

const padCache = new Map<string, Sparkle[]>()
/** `n` blank rows of `w` cells with stars in them, for the black above and below the frame (same density and look as the frame's). */
export function padRows(n: number, w: number, t: number, seed: number): Seg[][] {
  const k = `${n}x${w}:${seed}`
  let list = padCache.get(k)
  if (!list) {
    list = scatter(w, n, x => x >= SPARK_INSET[0] && x < w - SPARK_INSET[0], seed)
    padCache.set(k, list)
  }
  const grid = Array.from({ length: n }, () => Array.from({ length: w }, (): Seg => [BLANK, bg]))
  sparkle(grid, list, t)
  return grid.map(merge)
}

// ---- motion ---------------------------------------------------------------------------------------------------

export const GAZES: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1],
]

const sign = (n: number) => (n > 0 ? 1 : n < 0 ? -1 : 0)

/** Gaze toward a pointer offset from the eye's centre, in cells: a dead zone of a tenth of the width, one row. */
export const gazeToward = (dx: number, dy: number, w = W): [number, number] => [Math.abs(dx) <= w / 10 ? 0 : sign(dx), Math.abs(dy) <= 1 ? 0 : sign(dy)]

export function init(mode: EyeMode, rnd: () => number): EyeState {
  return {
    mode, t: 0, gx: 0, gy: 0, pgx: 0, pgy: 0, pointerUntil: -1, ox: 0, oy: 0,
    nextSaccade: 1200 + rnd() * 2000,
    nextBlink: 3000 + rnd() * 4000,
    blinkAt: -1,
    nextSweep: 2000 + rnd() * 3000,
    sweepAt: -1,
    rows: [],
    top: [],
    bottom: [],
    key: '',
  }
}

/** Where the gaze points now, each -1..1: pointer, then tool scan, then the thinking sweep, then the last saccade. */
export function look(m: EyeState): [number, number] {
  if (m.t < m.pointerUntil) return [m.pgx, m.pgy]
  if (m.mode === 'tool') return [[-1, 0, 1, 0][Math.floor(m.t / 240) % 4] ?? 0, 0]
  if (m.mode === 'thinking' && m.sweepAt >= 0) return [clamp(-1 + (2 * (m.t - m.sweepAt)) / SWEEP_MS, -1, 1), -1]
  return [m.gx, m.gy]
}

/** Lid openness now: a blink sweeps them shut and open, the tool eye is narrowed. */
export function openness(m: EyeState): number {
  const stage = m.blinkAt < 0 ? -1 : Math.floor((m.t - m.blinkAt) / FRAME)
  const base = m.mode === 'tool' ? 0.55 : 1
  return base * (BLINK[stage] ?? 1)
}

/** Moves the eye one frame on (mutates `m`). */
export function advance(m: EyeState, ms: number, rnd: () => number): EyeState {
  m.t += ms
  if (m.t >= m.nextSaccade) {
    const pick = GAZES[Math.floor(rnd() * GAZES.length)] ?? [0, 0]
    m.gx = pick[0]
    m.gy = pick[1]
    m.nextSaccade = m.t + 1200 + rnd() * 2000
  }
  if (m.blinkAt >= 0 && m.t - m.blinkAt >= BLINK.length * FRAME) m.blinkAt = -1
  if (m.t >= m.nextBlink) {
    m.blinkAt = m.t
    m.nextBlink = m.t + 3000 + rnd() * 4000
  }
  if (m.sweepAt >= 0 && m.t - m.sweepAt >= SWEEP_MS) {
    m.sweepAt = -1
    m.nextSweep = m.t + 4000 + rnd() * 4000
  }
  if (m.mode === 'thinking' && m.sweepAt < 0 && m.t >= m.nextSweep) m.sweepAt = m.t
  const [gx, gy] = look(m)
  m.ox += (gx * REACH_X - m.ox) * EASE
  m.oy += (gy * REACH_Y - m.oy) * EASE
  return m
}

/** The pointer at cell (x, y) of a `w` x `h` region: the eye looks there for 2.5 s after the last move. */
export function point(m: EyeState, x: number, y: number, w = W, h = H) {
  const [gx, gy] = gazeToward(x + 0.5 - w / 2, y + 0.5 - h / 2, w)
  m.pgx = gx
  m.pgy = gy
  m.pointerUntil = m.t + RELEASE_MS
}

/** The frame, `w` x `h`, as coloured runs per row. */
export function frame(m: EyeState, w = W, h = H): Seg[][] {
  const grid = eyeCells(w, h, { ox: m.ox, oy: m.oy, open: openness(m), t: m.t })
  sparkle(grid, eyeSparkles(w, h), m.t)
  return grid.map(merge)
}

/** A frame as one string, to tell whether it changed. */
export const keyOf = (rows: Seg[][]) => rows.map(r => r.map(s => s.join('')).join('')).join('\n')

const asMode = (v: unknown): EyeMode => (v === 'thinking' || v === 'tool' ? v : 'idle')

/**
 * The frame's size in cells, from the laid-out region's width alone: `slack` (a share, 0 by default) of the columns and
 * MARGIN more left free, at most MAX_W (W before the first layout), and rows in the reference shape W:H, at least MIN_H.
 * The slack is for a font wider than the app's cell estimate, whose rows wrap (issue #1). The desktop lays a Client out
 * as tall as what it draws, not as its `height` (asked for 16, a 7-row frame measured 7), so its rows only echo the
 * frame and fitting to them locked the eye small: the height is never read.
 */
export const fit = (columns: number, slack = 0): [number, number] => {
  const w = columns > 0 ? clamp(Math.floor(columns * (1 - clamp(slack, 0, MAX_SLACK))) - MARGIN, 1, MAX_W) : W
  return [w, Math.max(MIN_H, Math.round((w * H) / W))]
}

/** The pointer at cell (x, y) of the laid-out region, `columns` wide: the frame sits centred in it, so x is moved onto the frame first. */
export function pointIn(m: EyeState, x: number, y: number, columns: number) {
  const [w, h] = fit(columns, m.slack)
  point(m, x -((columns || w + MARGIN) - w) / 2 - (m.shift ?? 0), y - pads(h)[0], w, h)
}

/** Draws the frame again; true when it changed. */
export function redraw(m: EyeState, columns: number): boolean {
  const [w, h] = fit(columns, m.slack)
  const next = frame(m, w, h)
  const [padTop, padBottom] = pads(h)
  const top = padRows(padTop, w, m.t, 11)
  const bottom = padRows(padBottom, w, m.t, 23)
  const key = keyOf([...top, ...next, ...bottom])
  if (key === m.key) return false
  m.rows = next
  m.top = top
  m.bottom = bottom
  m.key = key
  return true
}

/** The rows moved `n` cells right: `n` blanks in front, the same number cut off the end, so every row keeps its width. */
export function shiftRows(rows: Seg[][], n: number): Seg[][] {
  if (n <= 0) return rows
  return rows.map(row => {
    let cut = n
    const kept: Seg[] = []
    for (let k = row.length - 1; k >= 0; k--) {
      const [text, color] = row[k]!
      const chars = [...text]
      if (cut >= chars.length) cut -= chars.length
      else {
        kept.unshift([chars.slice(0, chars.length - cut).join(''), color])
        cut = 0
      }
    }
    return [[' '.repeat(n), bg] as Seg, ...kept]
  })
}

/**
 * Rows of runs as Text lines, mono, on black; a row that still overruns is cut, never wrapped. The rows are centred
 * in the frame: on desktop a laid-out cell is wider than a mono glyph, so left-aligned rows left all the slack on the
 * right and the eye sat about 40 px left of the reply's middle.
 */
export function draw(elements: ClientSurface['elements'], rows: Seg[][], w: number) {
  const { Box, Text } = elements
  return (
    <Box flexDirection="column" alignItems="center" width={w} overflow="hidden" backgroundColor={bg}>
      {rows.map(row => (
        <Text mono wrap="truncate-end">
          {row.map(([s, c]) => (
            <Text mono color={c}>
              {s}
            </Text>
          ))}
        </Text>
      ))}
    </Box>
  )
}

export default function EyeView(props: EyeProps, surface: ClientSurface<EyeState>) {
  let m = surface.state
  if (m === undefined) {
    const s = init(asMode(props?.mode), Math.random)
    surface.every(FRAME, () => {
      advance(s, FRAME, Math.random)
      if (redraw(s, surface.columns)) surface.setState(s)
    })
    surface.onPointer(ev => {
      if (ev.type !== 'move' && ev.type !== 'enter' && ev.type !== 'down') return
      pointIn(s, ev.x, ev.y, surface.columns)
      surface.setState(s)
    })
    redraw(s, surface.columns)
    surface.setState(s)
    m = s
  }
  m.mode = asMode(props?.mode)
  m.shift = clamp(Math.round(Number(props?.shift) || 0), 0, 4)
  m.slack = clamp(Number(props?.slack) || 0, 0, MAX_SLACK)
  const [w] = fit(surface.columns, m.slack)
  const { Box } = surface.elements
  // The frame centred in its region, the margin split either side, `pads(h)` starry rows above and below. Rows,
  // not padding: the desktop did not honour the Box's paddingTop. All in one black block, so the stars reach the top.
  return (
    <Box flexDirection="column" alignItems="center" width={surface.columns || w + MARGIN} backgroundColor={bg}>
      {draw(surface.elements, shiftRows([...m.top, ...m.rows, ...m.bottom], m.shift), w)}
    </Box>
  )
}
