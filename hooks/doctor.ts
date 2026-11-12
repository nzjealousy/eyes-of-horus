// `/horus-doctor`: one line per thing the mod relies on, as it stands in THIS session. Opens no pane.
import { atom, read } from 'claude-code'
import type { On } from 'claude-code'

import * as core from './core'

// Restated with their literal refs (validate's scan needs them in the file that reads them); values live in core.
const ponytail = atom({ plugin: 'eyes-of-horus', key: 'ponytail' } as const, core.ponytail.initial, { shape: core.ponytail.shape! })
const sessionLog = atom({ plugin: 'eyes-of-horus', key: 'sessionLog' } as const, core.sessionLog.initial, { shape: core.sessionLog.shape! })
const agents = atom({ plugin: 'eyes-of-horus', key: 'agents' } as const, core.agents.initial, { shape: core.agents.shape! })
const progress = atom({ plugin: 'eyes-of-horus', key: 'progress' } as const, core.progress.initial, { shape: core.progress.shape! })

const PANES = ['horus', 'horus-temple']
const PROBE_ID = 'horus-doctor-probe'
const CUT = 120

/** One check: its name and what it found, or the error it hit. */
export type Check = readonly [name: string, outcome: string | Error]
type ProbeResult = { deny?: string; isError?: true; text?: string; result?: { message?: string } }

const cut = (s: string) => (s.length > CUT ? s.slice(0, CUT - 1) + '…' : s)
const why = (err: unknown) => (err instanceof Error ? err : new Error(String(err)))

/** What `/horus-doctor` answers: one line per check; a failed check is a line, never a throw. */
export const formatDoctor = (checks: readonly Check[]) =>
  ['Horus doctor (this session):', ...checks.map(([name, o]) => `${name}: ${o instanceof Error ? `check failed (${cut(o.message)})` : o}`)].join('\n')

/** Where one pane stands in `$.ui.panes()`' list. */
export const paneState = (panes: readonly { id: string; isPlaced: boolean }[], id: string) => {
  const p = panes.find(x => x.id === id)
  return p === undefined ? 'not open' : p.isPlaced ? 'open, placed' : 'open, waiting undrawn'
}

/** The TaskStop probe's answer: an answer on a fake id (even "not found") means a plugin can call the tool. */
export const probeLine = (r: ProbeResult | Error) => {
  const said =
    r instanceof Error ? `rejected: ${r.message}` : r.deny !== undefined ? `denied: ${r.deny}` : r.isError ? `error: ${r.text ?? 'no text'}` : `answered: ${r.result?.message ?? r.text ?? 'ok'}`
  return `${cut(said)} ("not found" means the call itself works)`
}

const check = (name: string, f: () => Promise<string>): Promise<Check> => f().then(o => [name, o] as const, err => [name, why(err)] as const)

export const registerDoctor = (on: On) => {
  // core.ts holds the module's one unmatched session.start, so this is registered under both values of a matcher key.
  for (const isInteractive of [true, false] as const) {
    on('session.start', { isInteractive }, async ($, e, next) => {
      const started = await next(e)
      await $.command.register({ name: 'horus-doctor', description: 'Say which parts of Eyes of Horus work in this session' }).catch(() => undefined)
      return started
    })
  }

  on('command.run', { command: 'horus-doctor' }, async $ => {
    const checks = await Promise.all([
      check('Surfaces', async () => (await $.session.surfaces()).join(', ') || 'none attached'),
      check('Panes', async () => {
        const panes = await $.ui.panes()
        return PANES.map(id => `${id} ${paneState(panes, id)}`).join('; ')
      }),
      check('Ponytail flag', async () => (await read($, ponytail)).level),
      check('Log entries', async () => String((await read($, sessionLog)).length)),
      check('Agents', async () => String((await read($, agents)).length)),
      check('Progress', async () => {
        const p = await read($, progress)
        return p === null ? 'none stored' : `${p.done}/${p.total}${p.title ? ` (${p.title})` : ''}`
      }),
      check('TaskStop from a plugin', async () =>
        probeLine(
          // @ts-ignore TS2589: the typed tool-call union is too deep for tsc (raised at whichever such call it checks first).
          await ($.tool.call({ tool: 'TaskStop', task_id: PROBE_ID } as never) as Promise<unknown> as Promise<ProbeResult>).catch(why),
        ),
      ),
    ])
    return { text: formatDoctor(checks) }
  })
}
