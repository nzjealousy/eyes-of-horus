// `/horus-doctor`: one line per thing the mod relies on, as it stands in THIS session. Opens no pane.
// `/horus-motion [on|off]`: the mod's own animation switch (the OS reduced-motion setting is not consulted).
// `/horus-fit [0-40]`: how much of the eye's width to leave free, for a font whose rows wrap (0, full size, by default).
import { atom, read, update } from 'claude-code'
import type { On } from 'claude-code'

import * as core from './core'

// Restated with their literal refs (validate's scan needs them in the file that reads them); values live in core.
const ponytail = atom({ plugin: 'eyes-of-horus', key: 'ponytail' } as const, core.ponytail.initial, { shape: core.ponytail.shape! })
const sessionLog = atom({ plugin: 'eyes-of-horus', key: 'sessionLog' } as const, core.sessionLog.initial, { shape: core.sessionLog.shape! })
const agents = atom({ plugin: 'eyes-of-horus', key: 'agents' } as const, core.agents.initial, { shape: core.agents.shape! })
const progress = atom({ plugin: 'eyes-of-horus', key: 'progress' } as const, core.progress.initial, { shape: core.progress.shape! })
const motion = atom({ plugin: 'eyes-of-horus', key: 'motion' } as const, core.motion.initial)
const fitSlack = atom({ plugin: 'eyes-of-horus', key: 'fitSlack' } as const, core.fitSlack.initial)

export const MAX_FIT = 40
/** `/horus-fit`'s argument: a whole percent 0 to MAX_FIT ('off' is 0), '' asks for the current value; anything else is undefined. */
export const fitArg = (args: string): number | '' | undefined => {
  const a = args.trim().toLowerCase()
  if (a === '') return ''
  if (a === 'off') return 0
  return /^\d{1,3}%?$/.test(a) && parseInt(a, 10) <= MAX_FIT ? parseInt(a, 10) : undefined
}

/** `/horus-motion`'s argument against the current value: 'on', 'off', '' toggles; anything else is undefined. */
export const motionArg = (args: string, current: boolean) => {
  const a = args.trim().toLowerCase()
  return a === 'on' ? true : a === 'off' ? false : a === '' ? !current : undefined
}

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
      await $.command.register({ name: 'horus-motion', description: 'Turn the Eyes of Horus animations on or off (no argument toggles)' }).catch(() => undefined)
      await $.command.register({ name: 'horus-fit', description: 'Leave 0-40 percent of the eye\'s width free, if its rows wrap (0 is full size)', argumentHint: '[0-40]' }).catch(() => undefined)
      // The saved value comes back with the session: state is the host's, for this process only.
      const saved = await $.store.get('fitSlack').catch(() => undefined)
      if (typeof saved === 'number' && saved >= 0 && saved <= MAX_FIT) await update($, fitSlack, () => saved)
      return started
    })
  }

  on('command.run', { command: 'horus-fit' }, async ($, e) => {
    const to = fitArg(e.args)
    if (to === undefined) return { text: `Usage: /horus-fit [0-${MAX_FIT}]` }
    if (to === '') return { text: `The eye leaves ${await read($, fitSlack)}% of its width free. /horus-fit 20 leaves 20%; /horus-fit 0 is full size.` }
    await update($, fitSlack, () => to)
    await $.store.set('fitSlack', to).catch(() => undefined)
    $.ui.invalidate('ui.render') // the eye is drawn again at its new width
    return { text: `The eye leaves ${to}% of its width free.` }
  })

  on('command.run', { command: 'horus-motion' }, async ($, e) => {
    const to = motionArg(e.args, await read($, motion))
    if (to === undefined) return { text: 'Usage: /horus-motion [on|off]' }
    await update($, motion, () => to)
    $.ui.invalidate('ui.render') // every drawing is rebuilt with the new switch
    return { text: `Motion is ${to ? 'on' : 'off'}.` }
  })

  on('command.run', { command: 'horus-doctor' }, async $ => {
    const checks = await Promise.all([
      check('Surfaces', async () => (await $.session.surfaces()).join(', ') || 'none attached'),
      check('Panes', async () => {
        const panes = await $.ui.panes()
        return PANES.map(id => `${id} ${paneState(panes, id)}`).join('; ')
      }),
      check('Ponytail flag', async () => (await read($, ponytail)).level),
      check('Motion', async () => ((await read($, motion)) ? 'on' : 'off (/horus-motion on)')),
      check('Eye width free', async () => `${await read($, fitSlack)}% (/horus-fit 0-${MAX_FIT}; raise it if the eye's rows wrap)`),
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
