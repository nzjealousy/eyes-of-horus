import { expect, test } from 'claude-code/testing'

import { BURST, NORMAL, SPEECH, STRONG, beatPeriod, braille, dotY, initTrace, kick, railCells, sample, step, voiceAmp } from '../hooks/clients/prompt-rail'
import { aqua, gold, goldBright, goldDim, orbCore } from '../hooks/theme'

test('trace sampling: flat baseline between bursts, spikes within -1..1', () => {
  for (const shape of [NORMAL, BURST, STRONG]) {
    const end = shape[shape.length - 1]?.[0] ?? 0
    for (let d = 0; d <= end; d += 0.5) {
      expect(Math.abs(sample(shape, d))).toBeLessThanOrEqual(1)
    }
    // Past the burst the line is flat.
    for (let d = end; d < end + 40; d++) expect(sample(shape, d)).toBe(0)
  }
  // A normal beat: a tall R up and a deep S down.
  expect(Math.max(...Array.from({ length: 21 }, (_, d) => sample(NORMAL, d)))).toBe(1)
  expect(Math.min(...Array.from({ length: 21 }, (_, d) => sample(NORMAL, d)))).toBe(-1)
  // The written trace is flat (0) between beats.
  const tr = initTrace('idle', 200)
  const zeros = tr.a.filter(v => v === 0).length
  expect(zeros).toBeGreaterThan(200 * 0.5)
})

test('spike heights stay inside the rows', () => {
  for (const rows of [1, 2]) {
    const h = rows * 4
    for (const a of [-1, -0.5, 0, 0.4, 1]) {
      expect(dotY(a, h)).toBeGreaterThanOrEqual(0)
      expect(dotY(a, h)).toBeLessThan(h)
    }
    expect(dotY(1, h)).toBe(0)
    expect(dotY(-1, h)).toBe(h - 1)
    expect(dotY(0.4, h)).toBeLessThan(dotY(0, h))
  }
})

test('heart rate by mode: calm idle, faster thinking and tool', () => {
  expect(beatPeriod('thinking')).toBeLessThan(beatPeriod('idle'))
  expect(beatPeriod('tool')).toBeLessThan(beatPeriod('idle'))
  expect(beatPeriod('unknown')).toBe(beatPeriod('idle'))
  // Every beat fits before the next one starts.
  for (const m of ['idle', 'thinking', 'tool', 'outputting']) {
    expect(beatPeriod(m)).toBeGreaterThan(BURST[BURST.length - 1]?.[0] ?? 0)
  }
  // More beats in the same sweep while working.
  const beats = (m: string) => step(initTrace(m, 100), m, 600).n
  expect(beats('tool')).toBeGreaterThan(beats('idle') * 2)
})

test('glyph mapping: braille dots, blank is a space', () => {
  expect(braille([[], []])).toBe(' ')
  expect(braille([[0], []])).toBe('⠁')
  expect(braille([[], [3]])).toBe('⢀')
  expect(braille([[2], [2]])).toBe('⠤')
  expect(braille([[0, 1, 2, 3], [0, 1, 2, 3]])).toBe('⣿')
  // A flat trace at one row is the baseline line ⠤ in goldDim, with a gap at the cursor.
  const flat = { x: 0, ph: 0, n: 0, strong: false, a: Array(40).fill(0), k: Array(40).fill(0) }
  const [row] = railCells(flat, 'idle', 20, 1)
  expect(row).toHaveLength(20)
  expect(row?.[10]).toEqual(['⠤', goldDim])
  // The cursor has wrapped to 0: the newest cell is the bright head, the gap is just ahead of it.
  expect(row?.[19]).toEqual(['⠤', goldBright])
  expect(row?.[0]?.[0]).toBe(' ')
  // Never blocks.
  const cells = railCells(initTrace('tool', 160), 'tool', 80, 2).flat()
  expect(cells.every(([g]) => g === ' ' || (g.charCodeAt(0) >= 0x2800 && g.charCodeAt(0) <= 0x28ff))).toBe(true)
})

test('colours: gold idle, aqua working, a strong gold beat after a turn', () => {
  const idle = railCells(initTrace('idle', 180), 'idle', 90).flat()
  expect(idle.some(([, c]) => c === goldDim)).toBe(true)
  expect(idle.some(([, c]) => c === goldBright)).toBe(true)
  const work = railCells(initTrace('tool', 180), 'tool', 90).flat()
  expect(work.some(([, c]) => c === aqua)).toBe(true)
  expect(work.some(([, c]) => c === orbCore)).toBe(true)
  expect(work.some(([, c]) => c === goldDim)).toBe(false)
  // The kicked beat draws STRONG in gold tones, and only its own dots.
  const after = step(kick(initTrace('tool', 180)), 'idle', 30)
  expect(after.k.filter(v => v === 1).length).toBe((STRONG[STRONG.length - 1]?.[0] ?? 0) + 1)
  expect(railCells(after, 'idle', 90).flat().some(([, c]) => c === gold || c === goldBright)).toBe(true)
})

test('speech turns the trace into a tall, uneven wave in its own colour', () => {
  const amps = Array.from({ length: 400 }, (_, t) => voiceAmp(t))
  expect(Math.max(...amps)).toBeGreaterThan(0.8)
  expect(Math.min(...amps)).toBeLessThan(-0.8)
  for (const a of amps) expect(Math.abs(a)).toBeLessThan(1.001)
  const tr = step(initTrace('speaking', 160), 'speaking', 160)
  // Far more of the trace is off the baseline than an idle heartbeat's.
  const busy = (t: { a: number[] }) => t.a.filter(v => Math.abs(v) > 0.15).length
  expect(busy(tr)).toBeGreaterThan(3 * busy(initTrace('idle', 160)))
  const colours = railCells(tr, 'speaking', 80, 2).flat().map(([, c]) => c)
  expect(colours.some(c => c !== gold && c !== goldDim && c !== aqua)).toBe(true)
  expect(SPEECH).toMatch(/^#[0-9a-f]{6}$/)
})
