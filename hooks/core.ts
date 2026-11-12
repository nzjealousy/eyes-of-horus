import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, SessionContextUsage, SessionCost } from 'claude-code'

import { GOD_TIERS } from './gods'
import type {
  HorusAgent,
  HorusInflight,
  HorusLogEntry,
  HorusLogKind,
  HorusPhase,
  HorusPonytailLevel,
  HorusProgress,
  HorusUsage,
} from '../types'

// The mod's state. Other modules import these atoms (never their own copies), so shape tags stay in one place.
export const phase = atom({ plugin: 'eyes-of-horus', key: 'phase' } as const, 'idle')
export const phaseSince = atom({ plugin: 'eyes-of-horus', key: 'phaseSince' } as const, 0)
export const turnSeq = atom({ plugin: 'eyes-of-horus', key: 'turnSeq' } as const, 0)
export const turnId = atom({ plugin: 'eyes-of-horus', key: 'turnId' } as const, '')
export const tail = atom({ plugin: 'eyes-of-horus', key: 'tail' } as const, 0)
export const terminalMode = atom({ plugin: 'eyes-of-horus', key: 'terminalMode' } as const, false)
export const terminalBusy = atom({ plugin: 'eyes-of-horus', key: 'terminalBusy' } as const, false)
export const agents = atom({ plugin: 'eyes-of-horus', key: 'agents' } as const, [], { shape: 'agents-1' })
export const progress = atom({ plugin: 'eyes-of-horus', key: 'progress' } as const, null, { shape: 'progress-1' })
export const ponytail = atom({ plugin: 'eyes-of-horus', key: 'ponytail' } as const, { level: 'off' }, { shape: 'ponytail-1' })
export const usage = atom(
  { plugin: 'eyes-of-horus', key: 'usage' } as const,
  { contextPct: 0, contextUsed: 0, contextMax: 0, tokensTotal: 0, costUsd: 0, agentTimeMs: 0, turns: 0 },
  { shape: 'usage-1' },
)
export const voice = atom(
  { plugin: 'eyes-of-horus', key: 'voice' } as const,
  { enabled: false, speaking: false, subtitle: '', sentenceIndex: 0 },
  { shape: 'voice-1' },
)
// log-2: entries gained id, turn, status and endedAt; log-1 values read as absent.
export const sessionLog = atom({ plugin: 'eyes-of-horus', key: 'sessionLog' } as const, [], { shape: 'log-2' })
const inflight = atom({ plugin: 'eyes-of-horus', key: 'inflight' } as const, [], { shape: 'inflight-1' })
export const paneCollapsed = atom(
  { plugin: 'eyes-of-horus', key: 'paneCollapsed' } as const,
  { session: false, agents: false },
  { shape: 'pane-collapsed-1' },
)

/** Hall of Truth entries scrolled back from the newest; 0 follows the newest. Written by the pane. */
export const railOffset = atom({ plugin: 'eyes-of-horus', key: 'railOffset' } as const, 0)
/** The Hall of Truth's filter chip and the user's turn fold marks (see hall.ts isTurnOpen). Written by the pane. */
export const hallFilter = atom({ plugin: 'eyes-of-horus', key: 'hallFilter' } as const, 'all')
export const hallOpen = atom({ plugin: 'eyes-of-horus', key: 'hallOpen' } as const, [], { shape: 'hall-open-1' })
/** The Stop Button pressed once and awaiting its confirming press: 'turn', `agent:<agentId>`, or ''. Written by the pane. */
export const armedStop = atom({ plugin: 'eyes-of-horus', key: 'armedStop' } as const, '')
/** The agent id whose chamber the Temple focuses, '' for the overview (see hall.ts focusChamber). Written by the pane. */
export const chamber = atom({ plugin: 'eyes-of-horus', key: 'chamber' } as const, '')

export const LOG_CAP = 400
const AGENT_TOOL_CAP = 30
const SHELLS = ['Bash', 'PowerShell']
const LEVELS: readonly HorusPonytailLevel[] = ['off', 'lite', 'full', 'ultra']
const PROGRESS_TOOL = 'mcp__savvy-progress__progress'
const STEP_TOOL = 'mcp__savvy-progress__step'
// Prepended to every subagent prompt so agents read and answer tersely (the caveman skill's rules, inline:
// a subagent may not have the Skill tool).
export const CAVEMAN =
  'Caveman mode: terse. Answer first, no filler, no pleasantries, no restating the task. ' +
  'Keep every technical fact; code, paths, commands, numbers and errors exact. Final report: shortest form that is complete.\n\n'
const BLANK: HorusProgress = { title: '', total: 0, done: 0, phase: '', finished: false, tasks: [] }

type $ = EngineInterface

// Terminal control characters (ESC, OSC, CSI, newlines) are blanked: labels are model- and tool-written text drawn raw.
const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
// Credentials a label could carry (a Bearer header, token=..., user:pass@host) are masked before it is shown or kept.
const redact = (s: string) =>
  s
    .replace(/(bearer\s+|(?:token|key|secret|password|passwd|auth)[=:]\s*)\S+/gi, '$1***')
    .replace(/\/\/[^\s/:@]+:[^\s/@]+@/g, '//***@')
const firstLine = (s: string, max = 80) => redact(clean(s.trim().split('\n')[0] ?? '')).slice(0, max)
const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
// Model-written text kept as a short, control-free label.
const label = (v: unknown, max = 200) => {
  const s = str(v)
  return s === undefined ? undefined : clean(s).slice(0, max)
}
// A count from model-written input: a whole number in 0..max, else absent.
const count = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.trunc(v))) : undefined)
const MAX_TASKS = 50
const isSavvy = (type: string) => /(?:^|:)savvy-[a-z]+$/.test(type)

// A savvy-progress call's input (model-written, unvalidated) merged over what stands; fields left out keep their value.
export function mergeProgress(prev: HorusProgress | null, input: Readonly<Record<string, unknown>>): HorusProgress {
  const title = label(input.title)
  const base = prev && (title === undefined || title === prev.title) ? prev : BLANK
  const tasks = Array.isArray(input.tasks)
    ? input.tasks
        .filter((t): t is Record<string, unknown> => typeof t === 'object' && t !== null && typeof t.title === 'string')
        .slice(0, MAX_TASKS)
        .map(t => {
          const tier = str(t.tier)
          return {
            title: label(t.title) as string,
            tier: (GOD_TIERS as readonly string[]).includes(tier ?? '') ? (tier as string) : 'medium',
            after: Array.isArray(t.after) ? t.after.filter((n): n is number => typeof n === 'number').slice(0, MAX_TASKS) : [],
            status: 'pending' as const,
          }
        })
    : base.tasks
  return {
    title: title ?? base.title,
    total: count(input.total, MAX_TASKS * 4) ?? base.total,
    done: count(input.done, MAX_TASKS * 4) ?? base.done,
    phase: label(input.phase, 40) ?? base.phase,
    finished: typeof input.finished === 'boolean' ? input.finished : base.finished,
    tasks,
  }
}

// A task's status is its newest agent's: savvy-flow delegates each task with the task's title as the Agent description.
export const withStatus = (p: HorusProgress, list: readonly HorusAgent[]): HorusProgress => ({
  ...p,
  tasks: p.tasks.map(t => ({ ...t, status: list.findLast(a => a.title === t.title)?.status ?? 'pending' })),
})

const safe = (f: () => Promise<unknown>) => f().then(() => undefined, () => undefined)

async function log($: $, kind: HorusLogKind, label: string, extra: Partial<Pick<HorusLogEntry, 'id' | 'status' | 'agentId'>> = {}) {
  const at = await $.clock.now()
  const turn = await read($, turnSeq)
  const entry: HorusLogEntry = { id: `${kind}:${turn}:${at}`, at, kind, label, turn, ...extra }
  const agentId = extra.agentId
  await update($, sessionLog, list =>
    // A subagent's tools are capped per agent so one busy worker cannot flush the log.
    // shortcut: counts what the log still holds, so an agent whose entries aged out logs again; keep a counter if that shows.
    kind === 'tool' && agentId !== undefined && list.filter(l => l.kind === 'tool' && l.agentId === agentId).length >= AGENT_TOOL_CAP
      ? list
      : [...list, entry].slice(-LOG_CAP),
  )
}

// Ends the newest entry with this id; an id no longer (or never) logged changes nothing.
async function endEntry($: $, id: string, status: 'done' | 'failed') {
  const endedAt = await $.clock.now()
  await update($, sessionLog, list => {
    const i = list.findLastIndex(l => l.id === id)
    return i < 0 ? list : list.with(i, { ...(list[i] as HorusLogEntry), status, endedAt })
  })
}

async function setPhase($: $, to: HorusPhase, when: (from: HorusPhase) => boolean = () => true) {
  const from = await read($, phase)
  if (from === to || !when(from)) return
  const at = await $.clock.now()
  await update($, phase, () => to)
  await update($, phaseSince, () => at)
}

// The main loop's tools in flight drive `tool` and `terminalBusy`.
async function track($: $, change: (list: HorusInflight[]) => HorusInflight[]) {
  const list = await update($, inflight, change)
  const busy = list.some(c => SHELLS.includes(c.tool))
  if ((await read($, terminalBusy)) !== busy) await update($, terminalBusy, () => busy)
  if (list.length > 0) await setPhase($, 'tool', from => from !== 'idle')
  else await setPhase($, 'thinking', from => from === 'tool')
}

async function saveAgents($: $, change: (list: HorusAgent[]) => HorusAgent[]) {
  const list = await update($, agents, change)
  if ((await read($, progress)) !== null) await update($, progress, p => p && withStatus(p, list))
}

// Adds an agent, or marks a known one running again (a resumed agent or a woken teammate).
async function addAgent($: $, id: string, rawType: string, rawTitle: string) {
  const type = label(rawType) ?? ''
  const title = label(rawTitle) ?? ''
  const at = await $.clock.now()
  let isNew = false
  await saveAgents($, list => {
    isNew = !list.some(a => a.id === id)
    if (isNew) return [...list, { id, type, title, status: 'running', startedAt: at }]
    return list.map(a => {
      if (a.id !== id) return a
      const { endedAt: _, ...rest } = a
      return { ...rest, status: 'running' }
    })
  })
  if (isNew) await log($, 'agent', title || type, { id: `agent:${id}`, status: 'running', agentId: id })
}

async function saveContext($: $, context: SessionContextUsage, cost?: SessionCost) {
  const derived = context.tokens !== undefined && context.window > 0 ? Math.round((context.tokens / context.window) * 100) : undefined
  await update($, usage, u => ({
    ...u,
    contextPct: context.percent ?? derived ?? u.contextPct,
    contextUsed: context.tokens ?? u.contextUsed,
    contextMax: context.window,
    costUsd: cost?.usd ?? u.costUsd,
  }))
}

// ponytail keeps its live level in a flag file its own hooks write; absent = off.
// shortcut: the shared flag (last switch in any session wins), not ponytail's per-project sha256 flag; read that if two repos diverge.
async function refreshPonytail($: $) {
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
  const dir = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${home}/.claude`
  const raw = await $.fs.read(`${dir}/.ponytail-active`).then(
    t => t.trim(),
    () => 'off',
  )
  const level = LEVELS.find(l => l === raw) ?? 'off'
  if ((await read($, ponytail)).level !== level) await update($, ponytail, () => ({ level }))
}

function toolLabel(tool: string, args: Readonly<Record<string, unknown>>) {
  // A shell command can carry secrets: shells show their description only.
  const keys = SHELLS.includes(tool) ? ['description'] : ['description', 'command', 'file_path', 'pattern', 'url', 'query']
  const key = keys.find(k => str(args[k]))
  const raw = key === undefined ? undefined : str(args[key])
  // A path's start says nothing at 60 columns: a file shows its name only.
  const detail = key === 'file_path' ? raw?.split(/[\\/]/).pop() : raw
  return detail ? `${tool} · ${firstLine(detail, 60)}` : tool
}

export const registerCore = (on: On) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await refreshPonytail($)
    const u = await $.session.usage().catch(() => undefined)
    if (u) {
      await saveContext($, u.context, u.cost)
      await update($, usage, x => ({ ...x, startedAt: u.startedAt }))
    }
    return started
  })

  on('turn.start', async ($, e, next) => {
    const id = e.agentId
    if (id !== undefined) {
      // An agent whose spawn this module did not see (a teammate woken by a message) is looked up once.
      const isKnown = (await read($, agents)).some(a => a.id === id)
      const info = isKnown ? undefined : (await $.agent.list()).find(a => a.id === id)
      await addAgent($, id, info?.type ?? 'agent', info?.description ?? '')
      return next(e)
    }
    await update($, turnSeq, n => n + 1)
    await update($, turnId, () => e.turnId)
    await setPhase($, 'thinking')
    // Harness blocks (`<task-notification>`, `<system-reminder>`, ...) arrive as prompts too; they are noise in the rail.
    const text = e.text.trim()
    if (text !== '' && !text.startsWith('<')) await log($, 'prompt', firstLine(text))
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    // A subagent's call is logged under its agent but leaves the main loop's phase, inflight and terminalBusy alone.
    const agentId = e.agentId
    const call: HorusInflight = { id: e.tool_use_id, tool: String(e.tool) }
    // An Agent call is logged as the agent itself, at agent.spawn.
    const logged = call.tool !== 'Agent'
    // Bookkeeping must never stop the user's tool: a failure here is dropped and the tool still runs.
    await safe(async () => {
      if (agentId === undefined) await track($, list => [...list, call])
      if (logged) {
        const text = toolLabel(call.tool, e as unknown as Record<string, unknown>)
        await log($, 'tool', text, agentId === undefined ? { id: call.id, status: 'running' } : { id: call.id, status: 'running', agentId })
      }
    })
    let status: 'done' | 'failed' = 'failed'
    try {
      const r = await next(e)
      // Core sets isError when the tool threw, was interrupted or answered an error; a deny means it never ran.
      if (r.isError !== true && r.deny === undefined) status = 'done'
      return r
    } finally {
      await safe(async () => {
        if (agentId === undefined) await track($, list => list.filter(c => c.id !== call.id))
        if (logged) await endEntry($, call.id, status)
      })
    }
  })

  on('agent.spawn', async ($, e, next) => {
    // Only savvy-flow workers get the terse prefix; other plugins' agents (reviewers, general-purpose) keep their prompt.
    const prompt = !isSavvy(String(e.subagentType)) || e.prompt.startsWith(CAVEMAN) ? e.prompt : CAVEMAN + e.prompt
    const spawned = await next({ ...e, prompt })
    const id = spawned.agentId
    if (id !== undefined) await safe(() => addAgent($, id, e.subagentType, e.description))
    return spawned
  })

  // Every hook hears each response row (an answer without `next` cannot refuse one), so this sees savvy-progress calls
  // whichever plugin sits outermost on tool.call. Rows land per finished block, not per streamed token.
  on('session.append', { door: 'response' }, async ($, e, next) => {
    const agentId = e.agentId
    if (agentId !== undefined) {
      // A worker's own savvy-progress `step` call: its card's progress bar.
      for (const b of e.message.content) {
        if (b.type !== 'tool_use' || b.name !== STEP_TOOL || typeof b.input !== 'object' || b.input === null) continue
        const input = b.input as Record<string, unknown>
        await saveAgents($, list =>
          list.map(a => {
            if (a.id !== agentId) return a
            const prev = a.steps ?? { done: 0, total: 0, note: '' }
            return { ...a, steps: { done: count(input.done, 1000) ?? prev.done, total: count(input.total, 1000) ?? prev.total, note: label(input.note) ?? prev.note } }
          }),
        )
      }
    } else {
      const blocks = e.message.content
      if (blocks.some(b => b.type === 'text' && str(b.text)?.trim())) await setPhase($, 'outputting', from => from !== 'idle')
      for (const b of blocks) {
        if (b.type !== 'tool_use' || b.name !== PROGRESS_TOOL || typeof b.input !== 'object' || b.input === null) continue
        const input = b.input as Record<string, unknown>
        const list = await read($, agents)
        await update($, progress, prev => withStatus(mergeProgress(prev, input), list))
      }
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const at = await $.clock.now()
    const used = e.usage
    const tokens = used ? used.input_tokens + used.output_tokens + used.cache_read_input_tokens + used.cache_creation_input_tokens : 0
    const id = e.agentId
    if (id !== undefined) {
      const status = e.reason === 'answer' ? 'done' : 'failed'
      await saveAgents($, list =>
        list.map(a => (a.id === id ? { ...a, status, endedAt: at, tokens: (a.tokens ?? 0) + tokens } : a)),
      )
      await endEntry($, `agent:${id}`, status)
      await update($, usage, u => ({ ...u, tokensTotal: u.tokensTotal + tokens }))
      return next(e)
    }
    // Tools still listed here were cut off with the turn.
    await update($, inflight, () => [])
    await update($, turnId, () => '')
    if (await read($, terminalBusy)) await update($, terminalBusy, () => false)
    await setPhase($, 'idle')
    await update($, tail, () => at)
    const turns = await $.session.turns()
    await update($, usage, u => ({ ...u, tokensTotal: u.tokensTotal + tokens, agentTimeMs: u.agentTimeMs + e.durationMs, turns }))
    if (e.answer.trim() !== '') await log($, 'reply', firstLine(e.answer))
    await refreshPonytail($)
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await saveContext($, e.context, e.cost)
    return next(e)
  })

  // `/ponytail <level>` (typed, or a plugin's $.command.run) writes the flag before the command runs.
  on('command.run', { command: ['ponytail', 'ponytail:ponytail'] }, async ($, e, next) => {
    const ran = await next(e)
    await refreshPonytail($)
    return ran
  })
}
