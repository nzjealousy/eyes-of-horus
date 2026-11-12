import { expect, test } from 'claude-code/testing'

import type { HorusLogEntry } from '../types'
import { hallLines, headLabel, isTurnOpen, matches, nowLine, rowDuration, toggleTurn } from '../hooks/hall'
import type { HallHead, HallLine } from '../hooks/hall'
import { railEntries, railWindow, scrollOffset } from '../hooks/pane'

const E = (id: string, turn: number, kind: HorusLogEntry['kind'], at: number, extra: Partial<HorusLogEntry> = {}): HorusLogEntry => ({
  id,
  at,
  kind,
  label: id,
  turn,
  ...extra,
})

// Turn 1: a prompt, a main tool, a reply. Turn 2: a prompt, an agent running with one of its tools running and one
// failed, and a main tool done.
const LOG: HorusLogEntry[] = [
  E('p1', 1, 'prompt', 1000),
  E('t1', 1, 'tool', 2000, { status: 'done', endedAt: 5000 }),
  E('r1', 1, 'reply', 6000),
  E('p2', 2, 'prompt', 10_000),
  E('agent:a1', 2, 'agent', 11_000, { status: 'running', agentId: 'a1' }),
  E('s1', 2, 'tool', 12_000, { status: 'failed', endedAt: 12_500, agentId: 'a1' }),
  E('s2', 2, 'tool', 13_000, { status: 'running', agentId: 'a1' }),
  E('t2', 2, 'tool', 14_000, { status: 'done', endedAt: 17_000 }),
]
const show = (lines: HallLine[]) => lines.map(l => (l.kind === 'head' ? `${l.open ? 'v' : '>'}${l.turn}` : `${l.sub ? '  ' : ''}${l.entry.id}`))

test('grouping: a header per turn, newest open and older folded by default, rows in log order', async () => {
  const lines = hallLines(LOG, 'all', [], 20_000)
  expect(show(lines)).toEqual(['>1', 'v2', 'p2', 'agent:a1', '  s1', '  s2', 't2'])
  const [h1, h2] = lines.filter((l): l is HallHead => l.kind === 'head')
  // Turn 1 ran 1000..6000; turn 2 still runs, so its time runs to now.
  expect([h1?.ms, h1?.running, h1?.tools, h1?.agents]).toEqual([5000, false, 1, 0])
  expect([h2?.ms, h2?.running, h2?.tools, h2?.agents]).toEqual([10_000, true, 3, 1])
  expect(headLabel(h1!)).toBe('▸ turn 1 · 1 tool')
  expect(headLabel(h2!)).toBe('▾ turn 2 · 3 tools · 1 agent')
  expect(hallLines([], 'all', [], 0)).toEqual([])
})

test('folding: marks n >= 0 open turn n, n < 0 close turn -n-1; a toggle flips what the turn showed', async () => {
  expect([isTurnOpen(2, 2, []), isTurnOpen(1, 2, []), isTurnOpen(1, 2, [1]), isTurnOpen(2, 2, [-3]), isTurnOpen(0, 2, [-1])]).toEqual([
    true,
    false,
    true,
    false,
    false,
  ])
  // Open old turn 1, then close the newest (2).
  let marks = toggleTurn([], 1, 2)
  expect(marks).toEqual([1])
  marks = toggleTurn(marks, 2, 2)
  expect(marks).toEqual([1, -3])
  expect(show(hallLines(LOG, 'all', marks, 20_000))).toEqual(['v1', 'p1', 't1', 'r1', '>2'])
  // A closed turn stays closed when a newer turn arrives, and an opened one stays open.
  expect([isTurnOpen(2, 3, marks), isTurnOpen(1, 3, marks)]).toEqual([false, true])
  // Toggling again replaces the mark rather than stacking it.
  expect(toggleTurn(toggleTurn(marks, 1, 2), 1, 2)).toEqual([-3, 1])
  expect(toggleTurn(Array.from({ length: 100 }, (_, i) => i + 10), 1, 2).length).toBe(100) // capped
})

test('filters: Main without agentId, Agents with agentId or kind agent, Tools every tool; empty turns drop', async () => {
  const ids = (f: Parameters<typeof matches>[1]) => LOG.filter(e => matches(e, f)).map(e => e.id)
  expect(ids('all').length).toBe(LOG.length)
  expect(ids('main')).toEqual(['p1', 't1', 'r1', 'p2', 't2'])
  expect(ids('agents')).toEqual(['agent:a1', 's1', 's2'])
  expect(ids('tools')).toEqual(['t1', 's1', 's2', 't2'])
  // Turn 1 has no agent entries: under Agents it is left out, header and all.
  expect(show(hallLines(LOG, 'agents', [], 20_000))).toEqual(['v2', 'agent:a1', '  s1', '  s2'])
})

test('row durations: mm:ss when ended, … while running, none for prompts and replies', async () => {
  expect(LOG.map(rowDuration)).toEqual(['', '00:03', '', '', '…', '00:00', '…', '00:03'])
})

test('scrolling counts display lines: headers and rows, folded turns as one line', async () => {
  const marks = [1] // both turns open: 2 headers + 3 + 5 rows
  const lines = hallLines(LOG, 'all', marks, 20_000)
  expect(lines.length).toBe(10)
  const n = railEntries(4)
  expect(show(railWindow(lines, n))).toEqual(['agent:a1', '  s1', '  s2', 't2'])
  const off = scrollOffset(0, -100, lines.length, n) // a big wheel up stops at the oldest
  expect(off).toBe(6)
  expect(show(railWindow(lines, n, off))).toEqual(['v1', 'p1', 't1', 'r1'])
  // The default fold leaves 1 + 6 lines, so the same wheel stops sooner.
  expect(scrollOffset(0, -100, hallLines(LOG, 'all', [], 20_000).length, n)).toBe(3)
})

test('Now line: main tool, else running agents by tag, else the phase, else idle', async () => {
  const who = (id: string) => ({ a1: 'careful', a2: 'medium', a3: 'careful' })[id]
  const tool = E('b', 3, 'tool', 4000, { status: 'running', label: 'Bash · List files' })
  expect(nowLine([tool], 'tool', 1000, who)).toEqual({ text: '◈ Bash · List files', since: 4000 })
  const agentsLog = ['a1', 'a2', 'a3'].map((a, i) => E(`agent:${a}`, 3, 'agent', 5000 + i, { status: 'running', agentId: a }))
  expect(nowLine(agentsLog, 'thinking', 1000, who)).toEqual({ text: '◈ 3 agents running · careful, medium', since: 5000 })
  // A subagent's running tool is not the main loop's.
  expect(nowLine([E('s', 3, 'tool', 1, { status: 'running', agentId: 'a1' })], 'thinking', 7000, who)).toEqual({ text: '◈ thinking', since: 7000 })
  // A stale running main tool after the turn ended does not count.
  expect(nowLine([tool], 'idle', 0, who)).toEqual({ text: '◈ idle' })
  expect(nowLine([E('agent:z', 1, 'agent', 9, { status: 'running', agentId: 'z' })], 'idle', 0, who)).toEqual({ text: '◈ 1 agent running', since: 9 })
})
