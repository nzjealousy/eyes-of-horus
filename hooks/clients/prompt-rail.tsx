import type { ClientModule } from 'claude-code'

import { aqua, aquaDim, gold, goldBright, goldDim, orbCore, purple, purpleDim, violet } from '../theme'

// The prompt rail: an ECG monitor trace hugging the input. A sweep cursor writes the heartbeat into a
// ring buffer left to right; the trace behind it fades, a short gap runs ahead of it. Drawn as a thin
// line in braille (2x4 dots per cell), never blocks. The frame clock lives here, not in `$`.
export type RailProps = { mode: string; tailAgeMs: number }
type Pt = [number, number]
/** Ring buffer of the trace, one amplitude (-1 down .. 1 up) per braille dot column. */
export type Trace = { x: number; ph: number; n: number; strong: boolean; a: number[]; k: number[] }
type RailState = Trace & { t: number; mode: string; end: number }

const FRAME = 60
const SPEED = 2 // dot columns written per frame: one cell
const FLASH_MS = 1500
const GAP = 6 // blank dot columns ahead of the cursor

// Beat shapes as [dot offset, amplitude] keypoints: P bump, Q dip, tall R, deep S, T bump, then flat.
export const NORMAL: Pt[] = [[0, 0], [2, 0.4], [4, 0], [6, 0], [7, -0.3], [8, 1], [10, -1], [11, 0], [14, 0], [16, 0.45], [18, 0.45], [20, 0]]
// The longer irregular burst of several spikes (every third beat while working).
export const BURST: Pt[] = [[0, 0], [1, 0.5], [2, -0.4], [3, 1], [4, -1], [5, 0.6], [7, -0.7], [8, 0.9], [9, -0.5], [11, 0.8], [12, -1], [13, 0.4], [15, -0.6], [16, 1], [17, -0.8], [18, 0], [21, 0.35], [23, 0]]
// The single strong beat on turn completion: a wide R and S.
export const STRONG: Pt[] = [[0, 0], [2, 0.5], [4, 0], [5, -0.5], [6, 1], [7, 1], [8, -1], [9, -1], [10, 0.4], [12, 0]]

const WORKING = new Set(['thinking', 'tool', 'outputting'])
/** Speech: a voice-print pink the trace turns while anything speaks. */
export const SPEECH = '#f472b6'
/** Dot columns from one beat to the next: a calm rate idle, faster while working. */
export const beatPeriod = (mode: string) => ({ thinking: 30, tool: 26, outputting: 36, speaking: 64 })[mode] ?? 64

/** The speech wave at dot column `t`: a fast carrier under a slow, uneven envelope, so peaks and lows run high and deep. */
export const voiceAmp = (t: number) =>
  Math.sin(t * 1.3) * (0.25 + 0.75 * Math.abs(Math.sin(t * 0.09) * Math.sin(t * 0.031 + 1.2)))

/** The shape's amplitude `d` dot columns into the beat; 0 (the flat baseline) outside it. */
export function sample(shape: Pt[], d: number): number {
  for (let i = 1; i < shape.length; i++) {
    const [x0, a0] = shape[i - 1] ?? [0, 0]
    const [x1, a1] = shape[i] ?? [0, 0]
    if (d <= x1) return d < x0 ? 0 : a0 + ((a1 - a0) * (d - x0)) / (x1 - x0)
  }
  return 0
}

/** Writes `dots` more dot columns at the cursor; returns a new trace. */
export function step(tr: Trace, mode: string, dots: number): Trace {
  const a = tr.a.slice()
  const k = tr.k.slice()
  let { x, ph, n, strong } = tr
  const period = beatPeriod(mode)
  for (let i = 0; i < dots; i++) {
    const shape = strong ? STRONG : WORKING.has(mode) && n % 3 === 2 ? BURST : NORMAL
    a[x] = mode === 'speaking' && !strong ? voiceAmp(n * period + ph) : sample(shape, ph)
    // Only the strong beat's own dots flash, not the flat run after it.
    k[x] = strong && ph <= (STRONG[STRONG.length - 1]?.[0] ?? 0) ? 1 : 0
    x = (x + 1) % a.length
    if (++ph >= period) {
      ph = 0
      n++
      strong = false
    }
  }
  return { x, ph, n, strong, a, k }
}

/** A trace `width` dot columns wide, already swept once so it shows beats from the first frame. */
export const initTrace = (mode: string, width: number): Trace =>
  step({ x: 0, ph: 0, n: 0, strong: false, a: Array(width).fill(0), k: Array(width).fill(0) }, mode, width)

/** Starts the strong beat at the cursor now. */
export const kick = (tr: Trace): Trace => ({ ...tr, ph: 0, n: tr.n + 1, strong: true })

/** Dot row (0 = top) for an amplitude in a trace `h` dots tall; the baseline sits below the middle. */
export function dotY(amp: number, h: number): number {
  const b = Math.min(h - 1, Math.round(h * 0.6))
  return amp >= 0 ? b - Math.round(amp * b) : b + Math.round(-amp * (h - 1 - b))
}

// Braille dot bits by [dot row][left/right column].
const BITS = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]]
/** The braille cell for a set of lit dots, `dots[col]` holding dot rows 0..3; blank is a space. */
export function braille(dots: number[][]): string {
  let bits = 0
  dots.forEach((rows, c) => rows.forEach(r => (bits |= BITS[r]?.[c] ?? 0)))
  return bits === 0 ? ' ' : String.fromCharCode(0x2800 + bits)
}

const hex = (c: string) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16))
// Colours quantized to 6 steps so neighbouring cells share one Text run.
export function mix(a: string, b: string, t: number): string {
  const q = Math.round(Math.min(1, Math.max(0, t)) * 5) / 5
  const [x, y] = [hex(a), hex(b)]
  return '#' + x.map((v, i) => Math.round(v + ((y[i] ?? v) - v) * q).toString(16).padStart(2, '0')).join('')
}

/** `rows` lines of `cols` [glyph, colour] cells for one frame of the trace. Pure, for the tests. */
export function railCells(tr: Trace, mode: string, cols: number, rows = 1): [string, string][][] {
  const w = tr.a.length
  const h = rows * 4
  const working = WORKING.has(mode)
  const ys = tr.a.map(v => dotY(v, h))
  // Each dot column lights its own dot and the vertical run back toward the previous one, so steep spikes stay one line.
  const lit = ys.map((y, i) => {
    const py = ys[(i - 1 + w) % w] ?? y
    const run: number[] = []
    for (let r = y; r !== py; r += py > y ? 1 : -1) run.push(r)
    return run.length > 0 ? run : [y]
  })
  const out: [string, string][][] = Array.from({ length: rows }, () => [])
  for (let c = 0; c < Math.min(cols, w / 2); c++) {
    const pair = [2 * c, 2 * c + 1]
    // Dot columns since the cursor wrote it: 0 is the newest.
    const age = (tr.x - 1 - pair[1]! + w) % w
    const peak = Math.max(...pair.map(i => Math.abs(tr.a[i] ?? 0)))
    const strong = pair.some(i => tr.k[i] === 1)
    const f = age / w
    let color: string
    if (age < 2) color = mode === 'speaking' ? orbCore : working ? orbCore : goldBright
    else if (strong) color = mix(goldBright, gold, f)
    else if (mode === 'speaking') color = peak > 0.15 ? mix(mix(violet, SPEECH, peak), purple, f) : mix(violet, purpleDim, f)
    else if (working) color = peak > 0.15 ? mix(aqua, purple, f) : mix(aquaDim, purpleDim, f)
    else color = peak > 0.15 ? mix(mix(gold, goldBright, peak), goldDim, f) : goldDim
    for (let r = 0; r < rows; r++) {
      const g = age >= w - GAP ? ' ' : braille(pair.map(i => (lit[i] ?? []).filter(y => y >= 4 * r && y < 4 * r + 4).map(y => y - 4 * r)))
      out[r]!.push([g, color])
    }
  }
  return out
}

const PromptRail: ClientModule<RailProps, RailState> = (props, surface) => {
  const { Box, Text } = surface.elements
  const width = () => 2 * Math.max(1, surface.columns || 40)
  const s = surface.state
  if (s === undefined) {
    const end = props.tailAgeMs >= 0 ? -Math.round(props.tailAgeMs / FRAME) : -1e9
    surface.setState({ ...initTrace(props.mode, width()), t: 0, mode: props.mode, end })
    surface.every(FRAME, () => {
      const cur = surface.state
      if (!cur) return
      const w = width()
      const tr = cur.a.length === w ? step(cur, cur.mode, SPEED) : initTrace(cur.mode, w)
      surface.setState({ ...cur, ...tr, t: cur.t + 1 })
    })
  } else {
    // A turn that ended under FLASH_MS ago, and not the one already flashed, starts the strong beat.
    const end = s.t - Math.round(props.tailAgeMs / FRAME)
    const fresh = props.tailAgeMs >= 0 && props.tailAgeMs < FLASH_MS && Math.abs(end - s.end) > FLASH_MS / FRAME
    if (fresh) surface.setState({ ...s, ...kick(s), mode: props.mode, end })
    else if (s.mode !== props.mode) surface.setState({ ...s, mode: props.mode })
  }
  const st = s ?? { ...initTrace(props.mode, width()), mode: props.mode }
  const lines = railCells(st, props.mode, surface.columns || 40, Math.max(1, surface.rows || 1))

  return (
    <Box flexDirection="column">
      {lines.map(cells => {
        // Runs of one colour become one Text.
        const runs: { color: string; text: string }[] = []
        for (const [g, c] of cells) {
          const last = runs[runs.length - 1]
          if (last && last.color === c) last.text += g
          else runs.push({ color: c, text: g })
        }
        return (
          <Box flexDirection="row">
            {runs.map(r => (
              <Text color={r.color} wrap="truncate-end">
                {r.text}
              </Text>
            ))}
          </Box>
        )
      })}
    </Box>
  )
}

export default PromptRail
