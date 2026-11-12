import type { Atom, On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import {
  CAVEMAN,
  mergeProgress,
  agents,
  phase,
  ponytail,
  progress,
  sessionLog,
  tail,
  terminalBusy,
  turnId,
  turnSeq,
  usage,
} from '../hooks/core'
import type { HorusLogEntry } from '../types'

// Nothing sits beneath the plugin: these hooks stand for the engine. A test's own hook may not read `$.state`,
// so the state is read off the writes passing down to the kit; `inTool` records it as each tool ran.
function engine(on: On, flag: string | null = 'lite\n', failKey?: string) {
  const written: Record<string, unknown> = {}
  const val = <T>(a: Atom<T>): T => (a.ref.key in written ? written[a.ref.key] : a.initial) as T
  const peek = () => ({
    phase: val(phase),
    turnSeq: val(turnSeq),
    turnId: val(turnId),
    tail: val(tail),
    terminalBusy: val(terminalBusy),
    agents: val(agents),
    progress: val(progress),
    ponytail: val(ponytail),
    usage: val(usage),
    sessionLog: val(sessionLog),
  })
  const inTool: ReturnType<typeof peek>[] = []
  on('state.set', (_, e, next) => {
    if (e.key === failKey) throw new Error('boom')
    const v = e.value as unknown
    // A key declared Shaped<T> is stored as { shape, value }.
    written[e.key] = typeof v === 'object' && v !== null && 'shape' in v && 'value' in v ? v.value : v
    return next(e)
  })
  const clock = mock.clock(on, { now: 1000 })
  mock.env(on, { HOME: '/home/u' })
  on('tool.call', async (_, e) => {
    inTool.push(peek())
    // Test-only tool names outside the typed union: compared as strings.
    if (String(e.tool) === 'Slow') await clock.advance(250)
    if (String(e.tool) === 'Boom') throw new Error('tool blew up')
    return { result: {} }
  })
  on('fs.read', () => (flag === null ? { deny: 'ENOENT' } : { value: flag }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200000, tokens: 50000 }, rateLimits: [], cost: { usd: 1.5 } },
  }))
  on('session.turns', () => ({ value: 1 }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('agent.list', () => ({ value: [] }))
  on('agent.spawn', (_, e) => {
    spawnedPrompts.push(e.prompt)
    return { model: 'm', agentId: 'a1' }
  })
  return { clock, inTool, peek, written }
}

// The typed tool-call union is too deep for tsc (TS2589); the call itself is plain.
const callTool = ($: { tool: { call: unknown } }, input: object) => (($.tool.call as (i: object) => Promise<unknown>)(input))

// What the engine beneath was asked to spawn with: the mod prefixes every prompt with the caveman rules.
const spawnedPrompts: string[] = []

const USAGE = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 80, cache_creation_input_tokens: 5, model: 'm' }

const reply = (text: string, uuid = 'r1') => ({
  message: { type: 'assistant' as const, role: 'assistant' as const, content: [{ type: 'text', text }] },
  door: 'response' as const,
  origin: { kind: 'model' as const, model: 'm' },
  uuid,
})

let rows = 0
const progressCall = (input: Record<string, unknown>, agentId?: string) => ({
  message: {
    type: 'assistant' as const,
    role: 'assistant' as const,
    content: [{ type: 'tool_use', id: 'tp', name: 'mcp__savvy-progress__progress', input }],
  },
  door: 'response' as const,
  origin: { kind: 'model' as const, model: 'm' },
  uuid: `p${++rows}`,
  ...(agentId === undefined ? {} : { agentId }),
})

test('phase runs idle -> thinking -> tool -> thinking -> outputting -> idle', async ($, on) => {
  const { clock, inTool, peek } = engine(on)

  expect(peek().phase).toBe('idle')

  await $.turn.start({ text: 'fix the bug\nplease', turnId: 't1' })
  let s = peek()
  expect(s.phase).toBe('thinking')
  expect(s.turnSeq).toBe(1)

  await callTool($, { tool: 'Read', file_path: 'a.ts' })
  expect(inTool[0]?.phase).toBe('tool')
  expect(peek().phase).toBe('thinking')

  await $.session.append(reply('Done.'))
  expect(peek().phase).toBe('outputting')

  await clock.advance(500)
  await $.turn.complete({ answer: 'Done.', durationMs: 4000, isAborted: false, turnId: 't1', reason: 'answer', usage: USAGE })
  s = peek()
  expect(s.phase).toBe('idle')
  expect(s.tail).toBe(1500)
  expect(s.usage.agentTimeMs).toBe(4000)
  expect(s.usage.tokensTotal).toBe(100)
  expect(s.usage.turns).toBe(1)
  expect(s.sessionLog.map(l => `${l.kind}:${l.label}`)).toEqual(['prompt:fix the bug', 'tool:Read · a.ts', 'reply:Done.'])
})

test('harness blocks and blank prompts stay out of the session log', async ($, on) => {
  const { peek } = engine(on)
  await $.turn.start({ text: '<task-notification>\n<task-id>x</task-id>', turnId: 't1' })
  await $.turn.start({ text: '  <system-reminder>hi</system-reminder>', turnId: 't2' })
  await $.turn.start({ text: '   \n ', turnId: 't3' })
  await $.turn.start({ text: 'a < b?', turnId: 't4' })
  const s = peek()
  expect(s.turnSeq).toBe(4) // still counted as turns
  expect(s.sessionLog.map(l => `${l.kind}:${l.label}`)).toEqual(['prompt:a < b?'])
})

test('a response row outside a turn leaves the phase idle', async ($, on) => {
  const { peek } = engine(on)
  await $.session.append(reply('stray'))
  expect(peek().phase).toBe('idle')
})

test('terminalBusy is true only while a Bash or PowerShell call runs', async ($, on) => {
  const { inTool, peek } = engine(on)
  await $.turn.start({ text: 'go', turnId: 't1' })

  await callTool($, { tool: 'Bash', command: 'npm test' })
  await callTool($, { tool: 'Read', file_path: 'a.ts' })
  await callTool($, { tool: 'PowerShell', command: 'ls' })
  expect(inTool.map(s => s.terminalBusy)).toEqual([true, false, true])
  expect(peek().terminalBusy).toBe(false)

  // A subagent's Bash is its own loop's, not the main terminal.
  await callTool($, { tool: 'Bash', command: 'ls', agentId: 'a9' })
  expect(inTool.at(-1)?.terminalBusy).toBe(false)
})

test('savvy-progress calls are captured, merged and joined with agents', async ($, on) => {
  const { peek } = engine(on)
  await $.turn.start({ text: 'plan', turnId: 't1' })

  await $.session.append(
    progressCall({
      title: 'Build Horus',
      total: 2,
      phase: 'delegate',
      tasks: [
        { title: 'Mod core', tier: 'heavy', after: [] },
        { title: 'Band', tier: 'medium', after: [1] },
        { tier: 'light' }, // no title: dropped
      ],
    }),
  )
  let p = peek().progress
  expect(p?.title).toBe('Build Horus')
  expect(p?.tasks.map(t => `${t.title}/${t.tier}/${t.status}`)).toEqual(['Mod core/heavy/pending', 'Band/medium/pending'])

  await $.agent.spawn({
    tool_use_id: 'tu1',
    prompt: 'do it',
    description: 'Mod core',
    subagentType: 'savvy-flow:savvy-heavy',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'm',
    background: true,
    fork: false,
  })
  expect(spawnedPrompts.at(-1)).toBe(CAVEMAN + 'do it')
  let s = peek()
  expect(s.agents.map(a => `${a.id}/${a.title}/${a.status}`)).toEqual(['a1/Mod core/running'])
  expect(s.progress?.tasks[0]?.status).toBe('running')
  expect(s.sessionLog.at(-1)).toEqual({ id: 'agent:a1', at: 1000, kind: 'agent', label: 'Mod core', turn: 1, status: 'running', agentId: 'a1' })

  await $.turn.complete({ answer: 'report', durationMs: 9, isAborted: false, turnId: 'ta', agentId: 'a1', reason: 'answer', usage: USAGE })
  s = peek()
  expect(s.sessionLog.at(-1)).toEqual({ id: 'agent:a1', at: 1000, kind: 'agent', label: 'Mod core', turn: 1, status: 'done', endedAt: 1000, agentId: 'a1' })
  expect(s.agents[0]?.status).toBe('done')
  expect(s.agents[0]?.tokens).toBe(100)
  expect(s.progress?.tasks[0]?.status).toBe('done')

  // Fields left out keep their value; a subagent's call is ignored.
  await $.session.append(progressCall({ done: 1 }))
  await $.session.append(progressCall({ title: 'Hijack', finished: true }, 'a1'))
  p = peek().progress
  expect(p?.title).toBe('Build Horus')
  expect(p?.done).toBe(1)
  expect(p?.finished).toBe(false)
  expect(p?.tasks.length).toBe(2)

  // A new title starts a new flow.
  await $.session.append(progressCall({ title: 'Next', total: 1 }))
  p = peek().progress
  expect(p?.tasks).toEqual([])
  expect(p?.done).toBe(0)
})

test('a flow is stamped when it turns finished, keeps that stamp, and loses it when reopened', () => {
  const run = mergeProgress(null, { title: 'F', total: 1 }, 10)
  expect(run.finishedAt).toBeUndefined()
  const fin = mergeProgress(run, { done: 1, finished: true }, 20)
  expect(fin.finishedAt).toBe(20)
  expect(mergeProgress(fin, { phase: 'x' }, 30).finishedAt).toBe(20)
  expect(mergeProgress(fin, { finished: false }, 40).finishedAt).toBeUndefined()
  // A new flow finished at once takes its own stamp, not the old flow's.
  expect(mergeProgress(fin, { title: 'G', finished: true }, 50).finishedAt).toBe(50)
})

test('/clear resets the log, agents, flow, counters and the pane marks; other session ends keep them', async ($, on) => {
  const { peek, written } = engine(on)
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.session.append(progressCall({ title: 'F', total: 1 }))
  await $.turn.complete({ answer: 'ok', durationMs: 9, isAborted: false, turnId: 't1', reason: 'answer', usage: USAGE })
  await $.session.end({ reason: 'resume', sessionId: 's0', resume: { id: 's0' } })
  expect(peek().sessionLog.length).toBe(2)

  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } })
  const s = peek()
  expect([s.sessionLog, s.agents, s.progress]).toEqual([[], [], null])
  expect(s.usage).toEqual({ contextPct: 25, contextUsed: 50000, contextMax: 200000, tokensTotal: 0, costUsd: 0, agentTimeMs: 0, turns: 0, startedAt: 0 })
  for (const [k, v] of [['railOffset', 0], ['hallFilter', 'all'], ['chamber', ''], ['armedStop', '']] as const) expect(written[k]).toBe(v)
  expect(written.hallOpen).toEqual([])
})

test('hostile savvy-progress input is clamped', () => {
  const p = mergeProgress(null, {
    title: 'T\u001b]52;c;x\u0007' + 'x'.repeat(500),
    total: 1e9,
    done: -5,
    phase: 'p'.repeat(100),
    tasks: [
      ...Array.from({ length: 80 }, () => ({ title: 'a', tier: 'constructor' })),
      { title: 'b', tier: 'heavy' },
    ],
  })
  expect(p.total).toBe(200)
  expect(p.done).toBe(0)
  expect(p.title.length).toBe(200)
  expect(p.title).not.toMatch(/[\u0000-\u001f]/)
  expect(p.phase.length).toBe(40)
  expect(p.tasks.length).toBe(50)
  expect(p.tasks[0]?.tier).toBe('medium') // an unknown tier (even `constructor`) falls back
  expect(mergeProgress(null, { total: Infinity }).total).toBe(0)
  expect(mergeProgress(null, { total: '9' }).total).toBe(0)
})

test('log labels lose control characters and credentials; shells log their description only', async ($, on) => {
  const { peek } = engine(on)
  await $.turn.start({ text: 'use \u001b[31mred\u001b[0m token=abc123 now', turnId: 't1' })
  await callTool($, { tool: 'Bash', command: 'curl -H "Authorization: Bearer sk-secret" https://x.dev' })
  await callTool($, { tool: 'Bash', command: 'ls', description: 'List files' })
  await callTool($, { tool: 'WebFetch', url: 'https://user:pw@host.dev/a' })
  const log = peek().sessionLog.map(l => `${l.kind}:${l.label}`)
  expect(log).toEqual(['prompt:use  [31mred [0m token=*** now', 'tool:Bash', 'tool:Bash · List files', 'tool:WebFetch · https://***@host.dev/a'])
})

test('a file path logs as its basename, still cleaned and redacted', async ($, on) => {
  const { peek } = engine(on)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await callTool($, { tool: 'Read', file_path: 'C:\\Users\\u\\Documents\\vault\\Projects\\Eyes of Horus\\Tasks-ToDo.md' })
  await callTool($, { tool: 'Edit', file_path: '/home/u/a very long directory name/that goes/on/token=abc\u001b.ts' })
  await callTool($, { tool: 'Grep', pattern: 'x/y/z' }) // other keys keep their whole text
  expect(peek().sessionLog.slice(1).map(l => l.label)).toEqual(['Read · Tasks-ToDo.md', 'Edit · token=*** .ts','Grep · x/y/z'])
})

test('only savvy-flow agents get the terse prompt prefix', async ($, on) => {
  engine(on)
  const spawn = (subagentType: string) =>
    $.agent.spawn({
      tool_use_id: 'tu',
      prompt: 'review it',
      description: 'Review',
      subagentType,
      provider: { plugin: 'engine', tier: 'core' },
      parentModel: 'm',
      background: true,
      fork: false,
    })
  await spawn('general-purpose')
  expect(spawnedPrompts.at(-1)).toBe('review it')
  await spawn('savvy-fable')
  expect(spawnedPrompts.at(-1)).toBe(CAVEMAN + 'review it')
})

test('a failing state write does not stop the tool call', async ($, on) => {
  const { inTool } = engine(on, 'lite\n', 'inflight')
  await callTool($, { tool: 'Read', file_path: 'a.ts' })
  expect(inTool.length).toBe(1) // the tool ran
})

// The engine also skips a throwing hook (fails open), so these pin the contract (next's answer comes back), not safe().
test('a failing state write does not block turn.start', async ($, on) => {
  engine(on, 'lite\n', 'turnSeq')
  expect(await $.turn.start({ text: 'go', turnId: 't1' })).toMatchObject({ turnId: 't1' })
})

test('a failing state write does not block turn.complete', async ($, on) => {
  engine(on, 'lite\n', 'inflight')
  await $.turn.start({ text: 'go', turnId: 't1' })
  const done = await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', usage: USAGE })
  expect(done).toMatchObject({ text: 'ok' })
})

test('sessionLog keeps the newest 400 entries', { timeoutMs: 120000 }, async ($, on) => {
  const { peek } = engine(on)
  for (let i = 0; i < 405; i++) await callTool($, { tool: 'Grep', pattern: `p${i}` })
  const log = peek().sessionLog
  expect(log.length).toBe(400)
  expect(log[0]?.label).toBe('Grep · p5')
  expect(log.at(-1)?.label).toBe('Grep · p404')
})

test('a tool entry runs, then ends done with its duration', async ($, on) => {
  const { inTool, peek } = engine(on)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await callTool($, { tool: 'Slow', file_path: 'a.ts' })
  const running = inTool[0]?.sessionLog.at(-1)
  expect(running?.status).toBe('running')
  expect(running?.endedAt).toBe(undefined)
  const { id, ...rest } = peek().sessionLog.at(-1) as HorusLogEntry
  expect(rest).toEqual({ at: 1000, kind: 'tool', label: 'Slow · a.ts', turn: 1, status: 'done', endedAt: 1250 })
  expect(id).toBe(running?.id) // the call's tool_use_id, from start to end
  expect(id === '' || id.startsWith('tool:')).toBe(false)
  // Prompt entries carry <kind>:<turn>:<at>.
  expect(peek().sessionLog[0]?.id).toBe('prompt:1:1000')
})

test('a tool that throws ends failed and still clears the main loop', async ($, on) => {
  const { peek } = engine(on)
  await $.turn.start({ text: 'go', turnId: 't1' })
  let threw = false
  await callTool($, { tool: 'Boom' }).catch(() => (threw = true))
  expect(threw).toBe(true)
  const s = peek()
  expect(s.sessionLog.at(-1)).toMatchObject({ kind: 'tool', label: 'Boom', status: 'failed', endedAt: 1000 })
  expect(s.phase).toBe('thinking')
})

test('a subagent tool call is logged under its agent and leaves the main loop alone', async ($, on) => {
  const { inTool, peek } = engine(on)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await callTool($, { tool: 'Bash', command: 'rm -rf x', description: 'Clean', agentId: 'a9' })
  expect(inTool.at(-1)?.phase).toBe('thinking')
  expect(inTool.at(-1)?.terminalBusy).toBe(false)
  const s = peek()
  expect(s.phase).toBe('thinking')
  expect(s.terminalBusy).toBe(false)
  expect(s.sessionLog.at(-1)).toMatchObject({ kind: 'tool', label: 'Bash · Clean', turn: 1, status: 'done', agentId: 'a9' })
})

test('a subagent logs at most 30 tool calls', { timeoutMs: 60000 }, async ($, on) => {
  const { peek } = engine(on)
  for (let i = 0; i < 35; i++) await callTool($, { tool: 'Grep', pattern: `p${i}`, agentId: 'a9' })
  await callTool($, { tool: 'Grep', pattern: 'other', agentId: 'a8' })
  await callTool($, { tool: 'Grep', pattern: 'main' })
  const log = peek().sessionLog
  expect(log.filter(l => l.agentId === 'a9').length).toBe(30)
  expect(log.filter(l => l.agentId === 'a9').at(-1)?.label).toBe('Grep · p29')
  expect(log.slice(-2).map(l => `${l.agentId}:${l.label}`)).toEqual(['a8:Grep · other', 'undefined:Grep · main'])
})

test('an agent entry ends failed when its turn does not answer', async ($, on) => {
  const { clock, peek } = engine(on)
  await $.turn.start({ text: 'wake', turnId: 'tb', agentId: 'b1' })
  expect(peek().sessionLog.at(-1)).toMatchObject({ id: 'agent:b1', kind: 'agent', status: 'running', agentId: 'b1' })
  await clock.advance(300)
  await $.turn.complete({ answer: '', durationMs: 9, isAborted: true, turnId: 'tb', agentId: 'b1', reason: 'aborted', usage: USAGE })
  expect(peek().sessionLog.at(-1)).toMatchObject({ id: 'agent:b1', status: 'failed', endedAt: 1300 })
})

test('turnId follows the main loop only', async ($, on) => {
  const { peek } = engine(on)
  expect(peek().turnId).toBe('')
  await $.turn.start({ text: 'go', turnId: 't7' })
  expect(peek().turnId).toBe('t7')
  await $.turn.start({ text: 'sub', turnId: 'ts', agentId: 'b1' })
  await $.turn.complete({ answer: 'r', durationMs: 1, isAborted: false, turnId: 'ts', agentId: 'b1', reason: 'answer', usage: USAGE })
  expect(peek().turnId).toBe('t7')
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't7', reason: 'answer', usage: USAGE })
  expect(peek().turnId).toBe('')
})

test('ponytail level and context usage are read at session start', async ($, on) => {
  const { peek } = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  let s = peek()
  expect(s.ponytail.level).toBe('lite')
  expect(s.usage.contextPct).toBe(25)
  expect(s.usage.contextMax).toBe(200000)
  expect(s.usage.costUsd).toBe(1.5)

  await $.session.measure({ context: { window: 200000, tokens: 90000, percent: 45 }, rateLimits: [], cost: { usd: 2 }, changed: ['context', 'cost'] })
  s = peek()
  expect(s.usage.contextPct).toBe(45)
  expect(s.usage.contextUsed).toBe(90000)
  expect(s.usage.costUsd).toBe(2)
})

for (const flag of [null, 'review']) {
  test(`a ponytail flag of ${flag} reads as off`, async ($, on) => {
    const { peek } = engine(on, flag)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    expect(peek().ponytail.level).toBe('off')
  })
}
