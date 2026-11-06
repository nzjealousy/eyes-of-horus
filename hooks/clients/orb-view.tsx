import type { ClientSurface } from 'claude-code'

import { aqua, aquaDim, dim, orbCore, purple, violet } from '../theme'
import { BLANK, draw, keyOf, merge, scatter, type Seg, shade, sparkle, type Sparkle } from './eye-view'

// The voice orb in the eye's ASCII shading: a lit sphere (bright orbCore highlight, aqua body, violet to purple
// terminator) in an aqua glow, star sparkles around it, the spoken sentence typed out under it.

export type OrbProps = { speaking: boolean; subtitle: string }
type OrbState = { t: number; sub: string; shown: number; speaking: boolean; rows: Seg[][]; key: string }

export const FRAME = 100
export const TAG = '[Horus]'
/** The sphere's frame, in cells, at most; narrower when the region is. */
export const W = 40
export const H = 13
const CHARS_PER_FRAME = 2

// Light from the upper left, toward the viewer.
const L = (() => {
  const v = [-0.45, -0.55, 0.7]
  const n = Math.hypot(...v)
  return v.map(x => x / n) as [number, number, number]
})()
const HALF = (() => {
  const v = [L[0], L[1], L[2] + 1]
  const n = Math.hypot(...v)
  return v.map(x => x / n) as [number, number, number]
})()

/** Luminance and colour of one point, in sphere units (`r` the radius, y in half-rows). */
export function orbCell(px: number, py: number, r: number, t: number, speaking: boolean): [number, string] {
  const d = Math.hypot(px, py) / r
  if (d > 1) {
    const lum = (speaking ? 0.22 : 0.16) * Math.exp(-(d - 1) * 4.5) * (0.85 + 0.15 * Math.sin(t / 400 + Math.atan2(py, px) * 3))
    return [lum < 0.035 ? 0 : lum, lum > 0.11 ? aqua : aquaDim]
  }
  const [nx, ny, nz] = [px / r, py / r, Math.sqrt(1 - d * d)]
  const diffuse = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2])
  const spec = Math.max(0, nx * HALF[0] + ny * HALF[1] + nz * HALF[2]) ** 18
  const pulse = speaking ? 0.95 + 0.1 * Math.sin(t / 140) : 0.9 + 0.08 * Math.sin(t / 700)
  // While speaking, rings ripple out from the core.
  const ripple = speaking ? 0.12 * Math.max(0, Math.sin(d * 9 - t / 90)) * (0.3 + diffuse) : 0
  const lum = (0.1 + 0.7 * diffuse + 0.5 * spec) * pulse + ripple
  return [lum, lum > 0.82 ? orbCore : lum > 0.55 ? aqua : lum > 0.3 ? violet : purple]
}

const sparkCache = new Map<string, Sparkle[]>()

/** The sphere's rows at time `t`, `w` x `h` cells: brighter, faster and rippling while speaking. */
export function sphere(t: number, speaking: boolean, w = W, h = H): Seg[][] {
  const r = Math.max(4, Math.min(w / 2 - 4, (h / 2 - 1.5) * 2))
  const at = (x: number, y: number): [number, number] => [x + 0.5 - w / 2, (y + 0.5 - h / 2) * 2]
  const cells = (tt: number, isSpeaking: boolean) =>
    Array.from({ length: h }, (_, y) =>
      Array.from({ length: w }, (_, x): Seg => {
        const [lum, c] = orbCell(...at(x, y), r, tt, isSpeaking)
        return [shade(lum), c]
      }),
    )
  const k = `${w}x${h}`
  let stars = sparkCache.get(k)
  if (!stars) {
    const lit = cells(0, true)
    const isDark = (x: number, y: number) => (lit[y]?.[x]?.[0] ?? BLANK) === BLANK
    stars = scatter(w, h, (x, y) => isDark(x, y) && isDark(x - 1, y) && isDark(x + 1, y), 11)
    sparkCache.set(k, stars)
  }
  const grid = cells(t, speaking)
  sparkle(grid, stars, t)
  return grid.map(merge)
}

/** Greedy word wrap to `width`; a word longer than the line is cut. */
export function wrap(text: string, width: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let w = word
    while (w.length > width) {
      if (line) lines.push(line)
      line = ''
      lines.push(w.slice(0, width))
      w = w.slice(width)
    }
    if (!w) continue
    if (!line) line = w
    else if (line.length + 1 + w.length <= width) line += ' ' + w
    else {
      lines.push(line)
      line = w
    }
  }
  if (line) lines.push(line)
  return lines
}

/** Columns a subtitle line may take in a region `columns` wide. */
export const subWidth = (columns: number) => Math.max(12, columns - 4)

/** Rows the orb takes in a region `columns` wide: the sphere and the wrapped subtitle. */
export const orbRows = (sub: string, columns: number) => H + (sub ? wrap(`${TAG} ${sub}`, subWidth(columns)).length : 0)

/**
 * The subtitle as wrapped lines, the first `shown` characters of the text revealed and the tag always shown.
 * Unrevealed cells are no-break spaces, so each centred line keeps its place while it types out.
 */
export function subtitleLines(sub: string, shown: number, width: number): string[] {
  const lines = wrap(`${TAG} ${sub}`, width)
  let left = TAG.length + 1 + shown
  return lines.map(line => {
    const part = line.slice(0, Math.max(0, left))
    left -= line.length + 1
    return part + ' '.repeat(line.length - part.length)
  })
}

/** The sphere's width in a region `columns` wide (40 before the first layout). */
export const sphereWidth = (columns: number) => Math.max(16, Math.min(W, columns || W))

export default function OrbView(props: OrbProps, surface: ClientSurface<OrbState>) {
  const { Box, Text } = surface.elements
  const sub = typeof props?.subtitle === 'string' ? props.subtitle : ''
  const speaking = props?.speaking === true
  let m = surface.state
  if (m === undefined) {
    const s: OrbState = { t: 0, sub, shown: 0, speaking, rows: sphere(0, speaking, sphereWidth(surface.columns)), key: '' }
    surface.every(FRAME, () => {
      s.t += FRAME
      s.shown = Math.min(s.sub.length, s.shown + CHARS_PER_FRAME)
      const rows = sphere(s.t, s.speaking, sphereWidth(surface.columns))
      const key = `${s.shown}|${keyOf(rows)}`
      if (key === s.key) return
      s.rows = rows
      s.key = key
      surface.setState(s)
    })
    surface.setState(s)
    m = s
  }
  if (m.sub !== sub) {
    m.sub = sub
    m.shown = 0
  }
  m.speaking = speaking
  const lines = sub ? subtitleLines(sub, m.shown, subWidth(surface.columns || 60)) : []
  return (
    <Box flexDirection="column" alignItems="center" width="100%">
      {draw(surface.elements, m.rows, sphereWidth(surface.columns))}
      {lines.map((line, i) =>
        i === 0 ? (
          <Text>
            <Text color={dim}>{line.slice(0, TAG.length)}</Text>
            <Text color={aqua}>{line.slice(TAG.length)}</Text>
          </Text>
        ) : (
          <Text color={aqua}>{line}</Text>
        ),
      )}
    </Box>
  )
}
