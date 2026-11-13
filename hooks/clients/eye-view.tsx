import type { ClientSurface } from 'claude-code'

import { bg, dim, err, gold, goldBright, purple, purpleDim, text, violet, warn } from '../theme'

// The Eye of Horus as a photo-like ASCII crop: every cell of the frame is shaded. Its luminance comes from an analytic
// picture (skin lit from the upper left, almond lids with a blink, sclera, a gold iris, pupil, catchlights, and kohl,
// lashes, brow and the Wedjat's markings as dark strokes) and picks a glyph from a density ramp, coloured from the
// theme. All motion lives here, on the frame clock.

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
  /** The drawn frame and the pose it was drawn for (`key`): the module redraws only when the pose changes. */
  rows: Seg[][]
  /** The rows of skin above and below the frame (`pads` of them), part of the same picture. */
  top: Seg[][]
  bottom: Seg[][]
  key: string
}

/** The frame's reference size in cells (the region is MARGIN wider), and its largest: a narrower region shrinks it in this shape. */
export const W = 82
export const H = 32
export const MAX_W = W
export const MIN_H = 6
/** The most of the region's columns `/horus-fit` may leave unused (a share, 0 to this). */
export const MAX_SLACK = 0.4
export const FRAME = 90
export const RELEASE_MS = 2500
/** Columns the frame leaves free in its region, so a line a hair wider than its cells (desktop) never wraps. */
export const MARGIN = 2
/** Rows of skin above and below the frame: the picture runs on into them (more forehead, a little more cheek). */
export const PAD_TOP = 1
export const PAD_BOTTOM = 0
/** The rows above and below a frame `h` rows tall: PAD_TOP and PAD_BOTTOM at the reference height, in proportion otherwise. */
export const pads = (h: number): [number, number] => [Math.max(1, Math.round((PAD_TOP * h) / H)), Math.round((PAD_BOTTOM * h) / H)]
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
const CARUNCLE = mix(err, violet, 0.4)
// Skin, shadow to highlight: the theme's purples, warming where the light falls.
const SKIN = [mix(purpleDim, purple, 0.55), purple, mix(purple, violet, 0.55), violet, mix(violet, goldBright, 0.4)]
const KOHL = purpleDim
const BROW = mix(purpleDim, purple, 0.5)

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

// ---- the eye field --------------------------------------------------------------------------------------------

/** `row`: a cell's height in eye units (set by `eyeCells`), so a line thinner than a row is still drawn on one. */
export type Pose = { ox: number; oy: number; open: number; row?: number }

const A = 15 // the almond's half-width
// The Wedjat's extent in eye units: brow top to the spiral's foot, the inner corner to the wing's tip (asymmetric, so
// its middle sits right of the pupil and above it), and that middle.
const EXT_W = 41
const EXT_H = 42.2
const MID_X = 4.25
const MID_Y = -1.4
/** The brow's height at its arch, the crease's over the middle, the lashes' spacing, the wing's length past the outer corner, and the pupil's and iris's radii (all in eye units). */
const BROW_Y = -20
const CREASE = 13.5
const LASH_GAP = 2.4
const WING = 10
const PUPIL_R = 3
const IRIS_R = 7.2
/** How much of the frame the Wedjat fills, on its tighter axis, and how strong the skin's grain is. */
const FILL = 0.96
const GRAIN = 0.07

/** How much wider than its natural shape the eye is drawn (x only), for more glyph detail across: the iris, pupil and highlight are kept round. */
export const STRETCH_X = 1.35

/** Upper and lower lid heights at `px`: open, they part; at 0 they meet in one line just below the middle. */
export function lids(px: number, open: number): [number, number] {
  // An exponent under 1 rounds the corners and fills the lid out, leaving the middle height as it was.
  const f = Math.max(0, 1 - (px / A) ** 2) ** 0.75
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

/** 0 at and below `a`, 1 at and above `b`, eased between. */
const smooth = (v: number, a: number, b: number) => {
  const t = clamp((v - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
/** A soft bump: 1 at 0, gone a few `s` away. */
const bump = (d: number, s: number) => Math.exp(-((d / s) ** 2))
/** Film grain, 0..1, fixed per point. */
const grain = (px: number, py: number) => {
  const n = Math.sin(px * 12.9898 + py * 78.233) * 43758.5453
  return n - Math.floor(n)
}

/**
 * Skin luminance outside the eye's opening, lit softly from the upper left and falling off toward the frame's corners
 * like a photo: the brow bone, the lid's dome and its crease, the socket's shadow by the nose, the hollow under the
 * eye and the cheek. `f` is the almond's profile at `px` (1 in the middle, 0 at and past the corners), `yU` the upper lid.
 */
function skin(px: number, py: number, f: number, yU: number): number {
  const vx = (px - MID_X) / 30
  const vy = (py - MID_Y) / 36
  let l = 0.7 - 0.26 * (vx * vx + vy * vy) + 0.13 * bump(px - 7, 11) * bump(py + 15.5, 2.4) - 0.16 * bump(px + 18, 6) * bump(py + 4, 9) + 0.1 * bump(px - 3, 13) * bump(py - 15, 6)
  if (f > 0 && py <= yU) {
    const yC = -3 - (CREASE - 3) * f ** 0.6
    if (py > yC) l += 0.13 * Math.sin((Math.PI * (py - yC)) / (yU - yC)) - 0.03
    l -= 0.3 * Math.sqrt(f) * bump(py - yC, 0.9)
  } else if (f > 0) l -= 0.17 * f * bump(py - 6 * f - 2.6, 1.8)
  return l
}

/** Luminance and colour of one point of the picture, in eye units: the eyeball inside the lids, skin everywhere else, then the dark strokes (kohl, wing, lashes, brow, teardrop, spiral) inked over both. */
export function eyeCell(px: number, py: number, p: Pose): [number, string] {
  const f = Math.max(0, 1 - (px / A) ** 2) ** 0.75
  const yU = f * (1.5 - 9.5 * p.open)
  const yL = f * (1.5 + 4.5 * p.open)
  const u = (px + A) / (2 * A) // 0 at the inner corner, 1 at the outer
  let lum: number
  let c: string
  if (py > yU && py < yL) {
    // The iris and pupil are round on screen: an x distance is scaled back by the stretch.
    const dx = (px - p.ox) * STRETCH_X
    const dy = py - p.oy
    const r = Math.hypot(dx, dy)
    // The upper lid's shadow on the eyeball.
    const lit = 0.6 + 0.4 * smooth(py - yU, 1.5, 5)
    // Two catchlights: a big one up and left, a small one opposite.
    if (Math.hypot(dx + 2.4, dy + 2.2) < 1.8 || Math.hypot(dx - 2.8, dy - 3) < 0.9) {
      lum = 1
      c = text
    } else if (r < PUPIL_R) {
      lum = 0
      c = KOHL
    } else if (r < IRIS_R) {
      const q = (r - PUPIL_R) / (IRIS_R - PUPIL_R)
      // Radial fibres, a soft ring, and the dark limbal edge.
      lum = q > 0.8 ? 0.13 * lit : (0.7 - 0.2 * q + 0.12 * Math.sin(Math.atan2(dy, dx) * 14) + 0.06 * Math.cos(q * Math.PI * 3)) * lit
      c = q > 0.8 ? AMBER_DARK : (IRIS[Math.floor(q * 5)] ?? warn)
    } else if (Math.hypot((px + A - 2.4) * STRETCH_X, py - 0.5) < 2.1) {
      // The caruncle: a small pink blob in the inner corner.
      lum = 0.5
      c = CARUNCLE
    } else {
      // Sclera: brightest by the iris, darker toward both corners, under the upper lid and along the lower one.
      lum = (0.93 - 0.28 * (px / A) ** 2 - 0.003 * py * py + 0.05 * (grain(px, py) - 0.5)) * lit * (0.8 + 0.2 * smooth(yL - py, 0.5, 2.5))
      c = lum > 0.62 ? text : dim
    }
  } else {
    const l = skin(px, py, f, yU)
    lum = l + GRAIN * (grain(px, py) - 0.5)
    c = SKIN[l < 0.4 ? 0 : l < 0.52 ? 1 : l < 0.63 ? 2 : l < 0.74 ? 3 : 4]!
  }
  let ink = 0
  // The least half-thickness of a line that must not fall between two rows: half a row, less what its soft edge covers.
  const thin = (p.row ?? 0) / 2 - 0.3
  if (f > 0) {
    // The kohl: a heavy line on the upper lid, thickening toward the outer corner, and a thinner one lining the lower lid.
    const tU = Math.max(thin, 0.5 + 1.3 * u)
    const tL = Math.max(thin, 0.25 + 0.6 * u)
    ink = Math.max(1 - smooth(Math.abs(py - yU + 0.4), tU, tU + 0.7), 1 - smooth(Math.abs(py - yL - 0.2), tL, tL + 0.6))
    // Lashes fanning up from the open upper lid: longer toward the outer corner, leaning in at the inner end and out at the outer.
    const h = yU - 0.4 - tU - py
    if (p.open > 0.3 && h > 0 && u > 0.08) {
      const ph = (px - 0.9 * (u - 0.35) * h) / LASH_GAP
      const n = Math.floor(ph)
      // Each lash has its own length, so their tips are ragged.
      const len = (2 + 3.5 * u) * p.open * (0.7 + 0.6 * grain(n, 0))
      if (h < len && Math.abs(ph - n - 0.5) < 0.24 - 0.13 * (h / len)) ink = 1
    }
  } else if (px >= A && px < A + WING) {
    // The wing: the kohl's bold tail past the outer corner, flicking up and thinning to its tip.
    const s = px - A
    const tW = 2.3 * (1 - s / WING) ** 0.6
    ink = 1 - smooth(Math.abs(py - 0.2 + 0.25 * s + 0.02 * s * s), tW - 0.25, tW + 0.35)
  }
  if (ink < 1 && py < -8 && px > -A - 4 && px < A + 9) {
    // The brow: a thick arc of hair over the eye, arching past the middle and thinning down to its tail.
    const yB = BROW_Y + (px < 6 ? 0.008 : 0.03) * (px - 6) ** 2
    const tB = 2.5 * smooth(px, -A - 4, -A) * clamp((A + 9 - px) / (2 * A + 9), 0, 1) ** 0.6
    ink = Math.max(ink, (1 - smooth(Math.abs(py - yB), tB * 0.55, tB + 0.2)) * (0.66 + 0.14 * Math.sin(px * 2.6 + py * 1.3)))
    if (ink > 0.5) return [lum * (1 - ink), BROW]
  }
  if (ink < 1 && py > 5.2 && py < 20) {
    // The Wedjat's teardrop (swelling toward its foot) and spiral, drawn in kohl on the cheek.
    const tT = Math.max(thin, 0.45 + 0.05 * (py - 6))
    const tS = Math.max(thin, 0.7)
    if (px > -8 && px < 0) ink = Math.max(ink, 1 - smooth(distTo(TEAR, px, py), tT, tT + 0.5))
    else if (px > 0 && px < 21) ink = Math.max(ink, 1 - smooth(distTo(SPIRAL, px, py), tS, tS + 0.5))
  }
  return ink > 0.5 ? [lum * (1 - ink), KOHL] : [lum * (1 - ink), c]
}

/**
 * The picture's cells, `w` wide: rows `y0` up to `y1` of a frame `h` rows tall (rows outside 0..h are the skin above and
 * below the frame). A cell centre in eye units: x in columns (STRETCH_X columns to a unit's width), y in half-rows (a
 * cell is about twice as tall as wide), scaled so the Wedjat fills FILL of the frame.
 */
export function eyeCells(w: number, h: number, p: Pose, y0 = 0, y1 = h): Seg[][] {
  const k = FILL * Math.min(w / (EXT_W * STRETCH_X), (2 * h) / EXT_H)
  const pose = { ...p, row: 2 / k }
  return Array.from({ length: y1 - y0 }, (_, i) =>
    Array.from({ length: w }, (_, x): Seg => {
      const [lum, c] = eyeCell((x + 0.5 - w / 2) / (k * STRETCH_X) + MID_X, ((y0 + i + 0.5 - h / 2) * 2) / k + MID_Y, pose)
      return [shade(lum), c]
    }),
  )
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
  return eyeCells(w, h, { ox: m.ox, oy: m.oy, open: openness(m) }).map(merge)
}

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
  const [padTop, padBottom] = pads(h)
  const open = openness(m)
  // The picture depends on the size and the pose alone, so a settled eye is not shaded again.
  const key = `${w}x${h}:${m.ox.toFixed(2)},${m.oy.toFixed(2)},${open}`
  if (key === m.key) return false
  const all = eyeCells(w, h, { ox: m.ox, oy: m.oy, open }, -padTop, h + padBottom).map(merge)
  m.top = all.slice(0, padTop)
  m.rows = all.slice(padTop, padTop + h)
  m.bottom = all.slice(padTop + h)
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
  // The frame centred in its region, the margin split either side, `pads(h)` rows of skin above and below it (rows,
  // not padding: the desktop did not honour the Box's paddingTop), all in one black block.
  return (
    <Box flexDirection="column" alignItems="center" width={surface.columns || w + MARGIN} backgroundColor={bg}>
      {draw(surface.elements, shiftRows([...m.top, ...m.rows, ...m.bottom], m.shift), w)}
    </Box>
  )
}
