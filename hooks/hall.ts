// The Hall of Truth's display lines, pure: the log grouped by turn (a header row per turn, a row per entry of an open
// turn), the filter, and the Now line. No engine imports, so it is unit-tested directly.
import type { HorusHallFilter, HorusLogEntry, HorusPhase } from '../types'
import { fmtElapsed } from './clients/agent-clock'

export const HALL_FILTERS: readonly HorusHallFilter[] = ['all', 'main', 'agents', 'tools']
export const FILTER_LABEL: Record<HorusHallFilter, string> = { all: 'All', main: 'Main', agents: 'Agents', tools: 'Tools' }

/** Main = the main loop's own entries; Agents = a subagent's tools and the agents themselves; Tools = every tool. */
export const matches = (e: HorusLogEntry, f: HorusHallFilter) =>
  f === 'main' ? e.agentId === undefined : f === 'agents' ? e.agentId !== undefined || e.kind === 'agent' : f === 'tools' ? e.kind === 'tool' : true

// `hallOpen` holds the user's fold marks: n >= 0 means the user opened turn n, n < 0 means the user closed turn -n-1
// (signed so turn 0 can be closed too). An unmarked turn is open only while it is the newest.
const MARKS_CAP = 100
export const isTurnOpen = (turn: number, newest: number, marks: readonly number[]) =>
  marks.includes(turn) ? true : marks.includes(-turn - 1) ? false : turn === newest
/** The marks after the user presses turn `turn`'s header: its old mark goes, the opposite of what it showed is kept. */
export const toggleTurn = (marks: readonly number[], turn: number, newest: number) => {
  const wasOpen = isTurnOpen(turn, newest, marks)
  return [...marks.filter(m => m !== turn && m !== -turn - 1), wasOpen ? -turn - 1 : turn].slice(-MARKS_CAP)
}

export const newestTurn = (log: readonly HorusLogEntry[]) => log.reduce((n, e) => Math.max(n, e.turn), -1)

export type HallHead = { kind: 'head'; turn: number; open: boolean; tools: number; agents: number; ms: number; running: boolean }
/** `sub`: a subagent's tool, drawn indented under its agent's tag; `dur`: '' (none), '…' (running) or mm:ss. */
export type HallRow = { kind: 'row'; entry: HorusLogEntry; sub: boolean; dur: string }
export type HallLine = HallHead | HallRow

export const rowDuration = (e: HorusLogEntry) => (e.status === 'running' ? '…' : e.endedAt === undefined ? '' : fmtElapsed(e.endedAt - e.at))

const plural = (n: number, one: string) => (n === 0 ? '' : `${n} ${one}${n === 1 ? '' : 's'}`)
/** A turn header's text, left of its duration (zero counts are left out). */
export const headLabel = (h: HallHead) =>
  [`${h.open ? '▾' : '▸'} turn ${h.turn}`, plural(h.tools, 'tool'), plural(h.agents, 'agent')].filter(Boolean).join(' · ')

/**
 * Every display line, oldest first. A turn with no entry passing the filter is left out; a header counts the turn's
 * tools and agents whatever the filter, and its time runs from its first entry to its last end (to `now` while
 * anything in it runs).
 */
export function hallLines(log: readonly HorusLogEntry[], filter: HorusHallFilter, marks: readonly number[], now: number): HallLine[] {
  const groups = new Map<number, HorusLogEntry[]>()
  for (const e of log) {
    const g = groups.get(e.turn)
    if (g) g.push(e)
    else groups.set(e.turn, [e])
  }
  const newest = newestTurn(log)
  const out: HallLine[] = []
  for (const [turn, all] of groups) {
    const shown = all.filter(e => matches(e, filter))
    if (shown.length === 0) continue
    const running = all.some(e => e.status === 'running')
    const end = running ? now : Math.max(...all.map(e => e.endedAt ?? e.at))
    const open = isTurnOpen(turn, newest, marks)
    const tools = all.filter(e => e.kind === 'tool').length
    const agents = all.filter(e => e.kind === 'agent').length
    out.push({ kind: 'head', turn, open, tools, agents, ms: Math.max(0, end - all[0]!.at), running })
    if (open) for (const e of shown) out.push({ kind: 'row', entry: e, sub: e.agentId !== undefined && e.kind !== 'agent', dur: rowDuration(e) })
  }
  return out
}

/**
 * What runs now: the main loop's running tool, else the running agents (`who` names one by its id), else the phase.
 * `since` is when the shown thing started (the clock's zero); none while idle.
 */
export function nowLine(
  log: readonly HorusLogEntry[],
  phase: HorusPhase,
  phaseSince: number,
  who: (agentId: string) => string | undefined,
): { text: string; since?: number } {
  if (phase !== 'idle') {
    const tool = log.findLast(e => e.kind === 'tool' && e.status === 'running' && e.agentId === undefined)
    if (tool) return { text: `◈ ${tool.label}`, since: tool.at }
  }
  const running = log.filter(e => e.kind === 'agent' && e.status === 'running')
  if (running.length > 0) {
    const names = [...new Set(running.map(e => (e.agentId === undefined ? undefined : who(e.agentId))).filter(Boolean))]
    const n = running.length
    return { text: `◈ ${n} agent${n === 1 ? '' : 's'} running${names.length > 0 ? ' · ' + names.join(', ') : ''}`, since: Math.min(...running.map(e => e.at)) }
  }
  if (phase !== 'idle') return { text: `◈ ${phase}`, since: phaseSince }
  return { text: '◈ idle' }
}
