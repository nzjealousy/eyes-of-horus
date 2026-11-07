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
  at: number
  kind: HorusLogKind
  label: string
  agentId?: string
}

/** A main-loop tool call in flight (core-internal bookkeeping for `phase` and `terminalBusy`). */
export type HorusInflight = { id: string; tool: string }

declare module 'claude-code' {
  interface PluginState {
    'eyes-of-horus': {
      phase: HorusPhase
      phaseSince: number
      turnSeq: number
      tail: number
      agents: Shaped<HorusAgent[]>
      progress: Shaped<HorusProgress | null>
      ponytail: Shaped<HorusPonytail>
      usage: Shaped<HorusUsage>
      /** Written by the band (T3) only. */
      terminalMode: boolean
      terminalBusy: boolean
      /** Written by the eye/orb (T2) only. */
      voice: Shaped<HorusVoice>
      sessionLog: Shaped<HorusLogEntry[]>
      inflight: Shaped<HorusInflight[]>
      /** Written by the pane only: which of its sections are folded. */
      paneCollapsed: Shaped<{ session: boolean; agents: boolean }>
      /** Written by the pane only: Hall of Truth entries scrolled back from the newest (0 = follow). */
      railOffset: number
    }
  }
}
