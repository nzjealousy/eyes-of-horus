export type HorusPhase = 'idle' | 'thinking' | 'tool' | 'outputting'

export type HorusAgentStatus = 'running' | 'done' | 'failed'

export type HorusAgent = {
  id: string
  type: string
  title: string
  status: HorusAgentStatus
  startedAt: number
  endedAt?: number
  tokens?: number
  /** The agent's own savvy-progress `step` report, when it sends one. */
  steps?: { done: number; total: number; note: string }
  /** The agent's final answer, cleaned, redacted and cut to 400 characters; absent until it ends with one. */
  report?: string
}

export type HorusTaskStatus = 'pending' | HorusAgentStatus

/** A savvy-flow task; `status` comes from the newest agent whose title equals the task's. */
export type HorusTask = {
  title: string
  tier: string
  after: number[]
  status: HorusTaskStatus
}

export type HorusProgress = {
  title: string
  total: number
  done: number
  phase: string
  finished: boolean
  tasks: HorusTask[]
  /** When `finished` last became true (`$.clock.now()`); absent while not finished. */
  finishedAt?: number
}

export type HorusPonytailLevel = 'off' | 'lite' | 'full' | 'ultra'

export type HorusPonytail = { level: HorusPonytailLevel }

export type HorusUsage = {
  contextPct: number
  contextUsed: number
  contextMax: number
  tokensTotal: number
  costUsd: number
  agentTimeMs: number
  turns: number
  /** When the session started (`$.session.usage().startedAt`); absent in values stored before it existed. */
  startedAt?: number
}

export type HorusVoice = {
  enabled: boolean
  speaking: boolean
  subtitle: string
  sentenceIndex: number
}

export type HorusLogKind = 'prompt' | 'tool' | 'agent' | 'reply'

export type HorusLogEntry = {
  /** A tool's tool_use_id, `agent:<agentId>` for an agent, else `<kind>:<turn>:<at>`. */
  id: string
  at: number
  kind: HorusLogKind
  label: string
  /** turnSeq when the entry was logged. */
  turn: number
  /** Tools and agents only: running until the call or the agent's turn ends. */
  status?: HorusAgentStatus
  endedAt?: number
  /** The subagent that ran the tool, or the agent the entry stands for. */
  agentId?: string
}

/** The Hall of Truth's filter chips. */
export type HorusHallFilter = 'all' | 'main' | 'agents' | 'tools'

/** A main-loop tool call in flight (core-internal bookkeeping for `phase` and `terminalBusy`). */
export type HorusInflight = { id: string; tool: string }

declare module 'claude-code' {
  interface PluginState {
    'eyes-of-horus': {
      phase: HorusPhase
      phaseSince: number
      turnSeq: number
      /** The main loop's current turn id; '' between turns. */
      turnId: string
      tail: number
      agents: Shaped<HorusAgent[]>
      progress: Shaped<HorusProgress | null>
      ponytail: Shaped<HorusPonytail>
      usage: Shaped<HorusUsage>
      terminalBusy: boolean
      /** Written by the eye/orb (T2) only. */
      voice: Shaped<HorusVoice>
      sessionLog: Shaped<HorusLogEntry[]>
      inflight: Shaped<HorusInflight[]>
      /** Written by the pane only: which of its sections (and the Gods' Running and Finished groups) are folded. */
      paneCollapsed: Shaped<{ session: boolean; agents: boolean; running: boolean; finished: boolean }>
      /** Written by `/horus-motion` (doctor.ts): whether the mod's drawings animate (default true). */
      motion: boolean
      /** Written by the pane (core resets it on /clear): the Hall of Truth's filter chip. */
      hallFilter: HorusHallFilter
      /** Written by the pane (core resets it on /clear): turns the user folded by hand; n >= 0 opened turn n, n < 0 closed turn -n-1. */
      hallOpen: Shaped<number[]>
      /** Written by the pane and the Temple (core resets it on /clear): the Stop Button awaiting its confirming press ('turn', `agent:<agentId>`), '' none. */
      armedStop: string
      /** Written by the pane (a card's ↗ or a Hall of Truth agent row), the Temple, and core on /clear: the agent id whose chamber the Temple focuses, '' for the overview. */
      chamber: string
    }
  }
}
