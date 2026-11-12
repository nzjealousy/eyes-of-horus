// The two-click Stop Buttons, shared by the Gods pane (Hall of Truth) and the Temple.
import { atom, update } from 'claude-code'
import type { ButtonProps, ElementConstructor, EngineInterface, TextProps } from 'claude-code'

import * as core from './core'
import { disarmStop, pressStop, STOP_ARM_MS } from './hall'
import * as T from './theme'

// Restated with its literal ref (validate's scan needs it in the file that updates it); the value lives in core.
const armedStop = atom({ plugin: 'eyes-of-horus', key: 'armedStop' } as const, core.armedStop.initial)

// The disarm timer of the armed Stop Button; a press cancels it, so only the newest arming disarms.
// shortcut: module state, lost on a hot reload (which cancels the timer too); the atom is the truth either way.
let disarmTimer: ReturnType<EngineInterface['clock']['after']> | undefined
type StopResult = { deny?: string; isError?: true; text?: string; result?: { message?: string } }

/**
 * The Stop controls of the pane titled `title` (its toasts' prefix). `armed` is the caller's own read of `armedStop`,
 * so its drawing follows the arming. A first press arms the Button's key (it reads Sure?), a second within
 * STOP_ARM_MS runs `run`; a press on another Stop arms that one instead.
 */
export function stopControls(
  $: EngineInterface,
  ui: { Button: ElementConstructor<ButtonProps>; Text: ElementConstructor<TextProps> },
  armed: string,
  title: string,
) {
  const { Button, Text } = ui
  const stopButton = (key: string, label: string, run: () => Promise<unknown>) => (
    <Button
      key={`stop:${key}`}
      plain
      onPress={async () => {
        let fire = false
        await update($, armedStop, a => {
          const r = pressStop(a, key)
          fire = r.fire
          return r.armed
        })
        disarmTimer?.cancel()
        disarmTimer = fire ? undefined : $.clock.after(STOP_ARM_MS, () => void update($, armedStop, a => disarmStop(a, key)))
        if (fire) await run()
      }}
    >
      <Text color={T.err} bold={armed === key}>
        {armed === key ? 'Sure?' : label}
      </Text>
    </Button>
  )
  // An agent stops through the TaskStop tool, as the model would stop it. The typed tool-call union is too deep for
  // tsc (TS2589), so the input is cast; the loader wants the call spelled $.tool.call(...) at its site.
  const stopAgent = (agentId: string) => async () => {
    // @ts-ignore TS2589 (see above), raised at whichever such call tsc checks first, so not @ts-expect-error.
    const r = await ($.tool.call({ tool: 'TaskStop', task_id: agentId } as never) as Promise<unknown> as Promise<StopResult>).catch(
      (err: unknown): StopResult => ({ deny: err instanceof Error ? err.message : String(err) }),
    )
    const why = r.deny ?? (r.isError ? (r.text ?? 'error') : undefined)
    const cut = why !== undefined && why.length > 120 ? why.slice(0, 119) + '…' : why
    $.ui.toast(cut === undefined ? `${title}: ${r.result?.message ?? 'agent stopped'}` : `${title}: cannot stop that agent (${cut})`)
  }
  return { stopButton, stopAgent }
}
