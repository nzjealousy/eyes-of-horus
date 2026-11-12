// The Hall of Truth's display lines, pure: the log grouped by turn (a header row per turn, a row per entry of an open
// turn), the filter, and the Now line. No engine imports, so it is unit-tested directly.
import type { HorusAgent, HorusAgentStatus, HorusHallFilter, HorusLogEntry, HorusPhase, HorusProgress } from '../types'
import { fmtElapsed } from './clients/agent-clock'
import { slaveKey } from './gods'
import * as T from './theme'

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

/** `entries`: every entry of the turn, whatever the filter (its bar strip is drawn from them). */
export type HallHead = {
  kind: 'head'
  turn: number
  open: boolean
  tools: number
  agents: number
  ms: number
  running: boolean
  entries: readonly HorusLogEntry[]
}
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
    out.push({ kind: 'head', turn, open, tools, agents, ms: Math.max(0, end - all[0]!.at), running, entries: all })
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

/** One segment of a turn's bar strip, in units of the strip's width (cells or pixels). */
export type BarSeg = { x: number; w: number; color: string; running: boolean }
const SEG_COLOR: Record<string, string> = { tool: T.aqua, agent: T.violet, reply: T.gold }

/**
 * A turn's mini timeline `width` units wide: a segment per tool, agent and reply, placed by its start along the turn's
 * span (its first entry to its last end, to `now` while anything runs) and as wide as it ran, one unit at least.
 * Ordered by start, so one drawn later lies over an earlier one it overlaps (parallel agents).
 */
export function barSegments(entries: readonly HorusLogEntry[], width: number, now: number): BarSeg[] {
  if (entries.length === 0 || width < 1) return []
  const t0 = Math.min(...entries.map(e => e.at))
  const running = entries.some(e => e.status === 'running')
  const span = Math.max(1, (running ? now : Math.max(...entries.map(e => e.endedAt ?? e.at))) - t0)
  const units = (ms: number) => (ms / span) * width
  return entries
    .filter(e => e.kind !== 'prompt')
    .sort((a, b) => a.at - b.at)
    .map(e => {
      const x = Math.min(width - 1, Math.max(0, Math.floor(units(e.at - t0))))
      const end = e.status === 'running' ? now : (e.endedAt ?? e.at)
      const w = Math.min(width - x, Math.max(1, Math.round(units(end - e.at))))
      return { x, w, color: e.status === 'failed' ? T.err : (SEG_COLOR[e.kind] ?? T.dim), running: e.status === 'running' }
    })
}

/** The strip as runs of cells for a glyph bar: a cell takes the last segment over it; a run with no `seg` is a gap. */
export function barRuns(segs: readonly BarSeg[], width: number): { seg?: BarSeg; n: number }[] {
  const cells: (BarSeg | undefined)[] = Array.from({ length: width }, () => undefined)
  for (const s of segs) cells.fill(s, s.x, s.x + s.w)
  const same = (a?: BarSeg, b?: BarSeg) => a === b || (a !== undefined && b !== undefined && a.color === b.color && a.running === b.running)
  const runs: { seg?: BarSeg; n: number }[] = []
  for (const c of cells) {
    const last = runs.at(-1)
    if (last !== undefined && same(last.seg, c)) last.n++
    else runs.push(c === undefined ? { n: 1 } : { seg: c, n: 1 })
  }
  return runs
}

// The two-step Stop Buttons: `armedStop` holds the key armed ('turn' or `agent:<agentId>`), '' when none.
export const STOP_ARM_MS = 3000
/** A press on `key`: on the armed key it confirms (`fire`, and nothing stays armed); on any other it arms that key. */
export const pressStop = (armed: string, key: string) => (armed === key ? { armed: '', fire: true } : { armed: key, fire: false })
/** What stays armed when `key`'s disarm timer runs out: nothing if `key` is still the one armed, else what is. */
export const disarmStop = (armed: string, key: string) => (armed === key ? '' : armed)

// --- the Temple's data: a hall of idle and just-finished members, a chamber per running agent, a feed per agent.

export type FeedItem = { id: string; label: string; status: HorusAgentStatus; dur: string; running: boolean }
/** An agent's own tool entries, oldest first, the newest `cap` only; `older` counts the ones left out. */
export function agentFeed(log: readonly HorusLogEntry[], agentId: string, cap = 12): { items: FeedItem[]; older: number } {
  const own = log.filter(e => e.kind === 'tool' && e.agentId === agentId)
  const kept = cap > 0 ? own.slice(-cap) : []
  const items = kept.map(e => ({ id: e.id, label: e.label, status: e.status ?? 'done', dur: rowDuration(e), running: e.status === 'running' }))
  return { items, older: own.length - kept.length }
}

/** `key`: the roster member the agent belongs to (its god tier, else `slave:<type>`), for its sprite. */
export type Chamber = {
  id: string
  key: string
  type: string
  tier?: string
  title: string
  steps?: { done: number; total: number; note: string }
  startedAt: number
  tokens: number
}
export type Celebrant = { id: string; key: string; type: string; tier?: string; title: string; failed: boolean }
export type TempleInput<M extends { key: string; isRunning: boolean }> = {
  agents: readonly HorusAgent[]
  progress: HorusProgress | null
  /** The roster, gods first in tier order, then slaves (pane.tsx `roster`). */
  members: readonly M[]
  tierOf: (type: string) => string | undefined
  now: number
  celebrateMs?: number
  maxChambers?: number
}

/**
 * The Temple: running agents get a chamber (newest first, `maxChambers` at most, `more` the rest); agents that ended
 * within `celebrateMs` celebrate in the hall (newest first); every other member stands idle, in roster order.
 * A chamber's tier is its savvy-flow task's, else its type's (as buildCards); hall membership uses the type's alone (as roster).
 */
export function templeModel<M extends { key: string; isRunning: boolean }>(input: TempleInput<M>) {
  const { agents, progress, members, tierOf, now, celebrateMs = 6000, maxChambers = 8 } = input
  const keyOf = (type: string) => tierOf(type) ?? slaveKey(type)
  const tierPart = (tier: string | undefined) => (tier === undefined ? {} : { tier })
  const celebrating: Celebrant[] = agents
    .filter(a => a.status !== 'running' && a.endedAt !== undefined && now - a.endedAt < celebrateMs)
    .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
    .map(a => ({ id: a.id, key: keyOf(a.type), type: a.type, ...tierPart(tierOf(a.type)), title: a.title, failed: a.status === 'failed' }))
  const busy = new Set(celebrating.map(c => c.key))
  const idle = members.filter(m => !m.isRunning && !busy.has(m.key))
  const running = agents
    .filter(a => a.status === 'running')
    .reverse() // equal starts: the later-listed (newer) agent first, the sort being stable
    .sort((a, b) => b.startedAt - a.startedAt)
  const tasks = progress?.tasks ?? []
  const chambers: Chamber[] = running.slice(0, Math.max(0, maxChambers)).map(a => ({
    id: a.id,
    key: keyOf(a.type),
    type: a.type,
    ...tierPart(tasks.findLast(t => t.title === a.title)?.tier ?? tierOf(a.type)),
    title: a.title,
    ...(a.steps === undefined ? {} : { steps: a.steps }),
    startedAt: a.startedAt,
    tokens: a.tokens ?? 0,
  }))
  return { hall: { idle, celebrating }, chambers, more: running.length - chambers.length }
}

/** The Temple's focus after a press on `agentId`'s chamber: the open one closes, another replaces it, '' clears. */
export const focusChamber = (current: string, agentId: string) => (agentId === current ? '' : agentId)
