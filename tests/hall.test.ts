import { expect, test } from 'claude-code/testing'

import type { HorusAgent, HorusLogEntry, HorusProgress } from '../types'
import {
  agentFeed,
  barRuns,
  barSegments,
  disarmStop,
  focusChamber,
  hallLines,
  headLabel,
  isTurnOpen,
  matches,
  nowLine,
  pressStop,
  rowDuration,
  templeModel,
  toggleTurn,
} from '../hooks/hall'
import type { HallHead, HallLine } from '../hooks/hall'
import { railEntries, railWindow, roster, scrollOffset, tierOf } from '../hooks/pane'
import * as T from '../hooks/theme'

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
// LOG with everything that runs ended.
const ENDED = LOG.map(e => (e.status === 'running' ? { ...e, status: 'done' as const, endedAt: 18_000 } : e))
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
  // (LOG's turn 2 runs an agent, which holds it open: see the next test; here everything in it has ended.)
  expect(show(hallLines(ENDED, 'all', marks, 20_000))).toEqual(['v1', 'p1', 't1', 'r1', '>2'])
  // A closed turn stays closed when a newer turn arrives, and an opened one stays open.
  expect([isTurnOpen(2, 3, marks), isTurnOpen(1, 3, marks)]).toEqual([false, true])
  // Toggling again replaces the mark rather than stacking it.
  expect(toggleTurn(toggleTurn(marks, 1, 2), 1, 2)).toEqual([-3, 1])
  expect(toggleTurn(Array.from({ length: 100 }, (_, i) => i + 10), 1, 2).length).toBe(100) // capped
})

test('a folded turn with a running agent stays open (its Stop reachable), and folds again once the agent ends', async () => {
  const closed = toggleTurn([], 2, 2) // the newest turn folded: [-3]
  expect(show(hallLines(LOG, 'all', closed, 20_000))).toEqual(['>1', 'v2', 'p2', 'agent:a1', '  s1', '  s2', 't2'])
  // The mark is kept: the agent ends and the turn folds.
  expect(show(hallLines(ENDED, 'all', closed, 20_000))).toEqual(['>1', '>2'])
  // A running tool alone does not hold a folded turn open.
  const toolOnly = LOG.filter(e => e.kind !== 'agent')
  expect(show(hallLines(toolOnly, 'all', closed, 20_000))).toEqual(['>1', '>2'])
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

test('bar strip: segments placed by start along the turn, as wide as they ran, coloured by kind; failed red, running flagged', async () => {
  const turn2 = LOG.filter(e => e.turn === 2)
  // Turn 2 runs 10s..now (20s): 10 000 ms over 100 units. The prompt draws nothing.
  expect(barSegments(turn2, 100, 20_000)).toEqual([
    { x: 10, w: 90, color: T.violet, running: true }, // the agent, running to now
    { x: 20, w: 5, color: T.err, running: false }, // its failed tool
    { x: 30, w: 70, color: T.aqua, running: true },
    { x: 40, w: 30, color: T.aqua, running: false },
  ])
  // Turn 1 ended (1s..6s over 10 units): the reply has no duration, so it takes the one unit left at the end.
  expect(barSegments(LOG.filter(e => e.turn === 1), 10, 99_999)).toEqual([
    { x: 2, w: 6, color: T.aqua, running: false },
    { x: 9, w: 1, color: T.gold, running: false },
  ])
  expect([barSegments([], 12, 0), barSegments(turn2, 0, 0)]).toEqual([[], []])
  // Glyph runs: a cell takes the segment that started last over it, so parallel work draws over the agent.
  const runs = barRuns(barSegments(turn2, 10, 20_000), 10).map(r => (r.seg === undefined ? `-${r.n}` : `${r.seg.color}${r.seg.running ? '~' : ''}${r.n}`))
  expect(runs).toEqual(['-1', `${T.violet}~1`, `${T.err}1`, `${T.aqua}~1`, `${T.aqua}3`, `${T.aqua}~3`])
  // A header keeps the whole turn for its strip whatever the filter.
  const head = hallLines(LOG, 'agents', [], 20_000).find((l): l is HallHead => l.kind === 'head')
  expect(head?.entries.map(e => e.id)).toEqual(['p2', 'agent:a1', 's1', 's2', 't2'])
})

test('stop arming: a first press arms, the same key confirms, another key re-arms, the timer disarms only its own key', async () => {
  expect(pressStop('', 'turn')).toEqual({ armed: 'turn', fire: false })
  expect(pressStop('turn', 'turn')).toEqual({ armed: '', fire: true })
  expect(pressStop('turn', 'agent:a1')).toEqual({ armed: 'agent:a1', fire: false })
  expect(pressStop('agent:a1', 'agent:a2')).toEqual({ armed: 'agent:a2', fire: false })
  expect([disarmStop('turn', 'turn'), disarmStop('agent:a1', 'turn'), disarmStop('', 'turn')]).toEqual(['', 'agent:a1', ''])
})

test('agent feed: only that agent tools, oldest first, newest cap kept, older counted, running flagged', async () => {
  const f = agentFeed(LOG, 'a1')
  expect(f.items).toEqual([
    { id: 's1', label: 's1', status: 'failed', dur: '00:00', running: false },
    { id: 's2', label: 's2', status: 'running', dur: '…', running: true },
  ])
  expect(f.older).toBe(0)
  const many = Array.from({ length: 15 }, (_, i) => E(`x${i}`, 1, 'tool', i, { status: 'done', endedAt: i, agentId: 'b' }))
  const g = agentFeed([...LOG, ...many], 'b', 12)
  expect([g.items.length, g.items[0]?.id, g.items.at(-1)?.id, g.older]).toEqual([12, 'x3', 'x14', 3])
  expect(agentFeed(LOG, 'nobody')).toEqual({ items: [], older: 0 })
})

const A = (id: string, type: string, extra: Partial<HorusAgent> = {}): HorusAgent => ({ id, type, title: id, status: 'running', startedAt: 0, ...extra })
const temple = (agents: HorusAgent[], now = 100_000, progress: HorusProgress | null = null) => {
  const { gods, slaves } = roster(agents)
  return templeModel({ agents, progress, members: [...gods, ...slaves], tierOf, now })
}
const keys = (ms: readonly { key: string }[]) => ms.map(m => m.key)

test('temple: no agents leaves every member idle in roster order, no chambers', async () => {
  const m = temple([])
  const { gods, slaves } = roster([])
  expect(keys(m.hall.idle)).toEqual(keys([...gods, ...slaves]))
  expect(keys(m.hall.idle).slice(0, 5)).toEqual(['fable', 'heavy', 'careful', 'medium', 'light'])
  expect([m.hall.celebrating, m.chambers, m.more]).toEqual([[], [], 0])
})

test('temple: a running god gets a chamber and leaves the idle list; two of one type get two chambers, newest first', async () => {
  const one = temple([A('g1', 'savvy-flow:savvy-careful', { startedAt: 5, tokens: 1200, steps: { done: 1, total: 4, note: 'tests' } })])
  expect(one.chambers).toEqual([
    { id: 'g1', key: 'careful', type: 'savvy-flow:savvy-careful', tier: 'careful', title: 'g1', steps: { done: 1, total: 4, note: 'tests' }, startedAt: 5, tokens: 1200 },
  ])
  expect(keys(one.hall.idle).includes('careful')).toBe(false)
  expect(keys(one.hall.idle).includes('medium')).toBe(true)
  const two = temple([A('e1', 'Explore', { startedAt: 10 }), A('e2', 'Explore', { startedAt: 20 })])
  expect(two.chambers.map(c => [c.id, c.key, c.tier, c.tokens])).toEqual([
    ['e2', 'slave:Explore', undefined, 0],
    ['e1', 'slave:Explore', undefined, 0],
  ])
  expect(keys(two.hall.idle).includes('slave:Explore')).toBe(false)
})

test('temple: a finished agent celebrates for celebrateMs then stands idle; a failed one is flagged', async () => {
  const done = [A('d1', 'savvy-medium', { status: 'done', endedAt: 95_000 }), A('f1', 'Plan', { status: 'failed', endedAt: 99_000 })]
  const now = temple(done, 100_000)
  expect(now.hall.celebrating).toEqual([
    { id: 'f1', key: 'slave:Plan', type: 'Plan', title: 'f1', failed: true },
    { id: 'd1', key: 'medium', type: 'savvy-medium', tier: 'medium', title: 'd1', failed: false },
  ])
  expect(keys(now.hall.idle).some(k => k === 'medium' || k === 'slave:Plan')).toBe(false)
  expect(now.chambers).toEqual([])
  const later = temple(done, 101_000) // d1 ended 6 s ago: back in the hall; f1 still celebrates
  expect(later.hall.celebrating.map(c => c.id)).toEqual(['f1'])
  expect(keys(later.hall.idle).includes('medium')).toBe(true)
})

test('temple: at most 8 chambers, newest first, the rest counted in more', async () => {
  const many = Array.from({ length: 11 }, (_, i) => A(`a${i}`, 'general-purpose', { startedAt: i }))
  const m = temple(many)
  expect([m.chambers.length, m.chambers[0]?.id, m.chambers.at(-1)?.id, m.more]).toEqual([8, 'a10', 'a3', 3])
})

test('temple: a task tier and the agent steps carry into the chamber; an unknown type gets a slave chamber', async () => {
  const p: HorusProgress = { title: 'T', total: 1, done: 0, phase: '', finished: false, tasks: [{ title: 'Fix it', tier: 'heavy', after: [], status: 'running' }] }
  const m = temple([A('u1', 'my-plugin:odd-worker', { title: 'Fix it', steps: { done: 2, total: 3, note: 'n' } }), A('u2', 'mystery')], 100_000, p)
  expect(m.chambers.map(c => [c.id, c.key, c.tier, c.steps?.done])).toEqual([
    ['u2', 'slave:mystery', undefined, undefined],
    ['u1', 'slave:my-plugin:odd-worker', 'heavy', 2],
  ])
  // Seen unknown types join the roster as slaves and are running, so they are not idle.
  expect(keys(m.hall.idle).some(k => k === 'slave:mystery')).toBe(false)
})

test('chamber focus: open one, press it again to close, another replaces, empty clears', async () => {
  expect([focusChamber('', 'a1'), focusChamber('a1', 'a1'), focusChamber('a1', 'a2'), focusChamber('a2', ''), focusChamber('', '')]).toEqual([
    'a1',
    '',
    'a2',
    '',
    '',
  ])
})
