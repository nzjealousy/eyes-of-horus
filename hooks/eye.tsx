import { atom, read, update } from 'claude-code'
import type { ClientProps, ElementConstructor, EngineInterface, On } from 'claude-code'

import type { HorusPhase, HorusVoice } from '../types'
import { fit, GAP_TOP, MARGIN, MAX_W, pads, W as EYE_W } from './clients/eye-view'
import * as core from './core'

type $ = EngineInterface

// validate refuses `read`/`update` of an atom made in another file (its scan needs the literal ref here), so the
// refs are restated; initial values and shape tags still come from core's atoms, the one place they live.
const phase = atom({ plugin: 'eyes-of-horus', key: 'phase' } as const, core.phase.initial)
const tail = atom({ plugin: 'eyes-of-horus', key: 'tail' } as const, core.tail.initial)
const turnSeq = atom({ plugin: 'eyes-of-horus', key: 'turnSeq' } as const, core.turnSeq.initial)
const voice = atom({ plugin: 'eyes-of-horus', key: 'voice' } as const, core.voice.initial, { shape: core.voice.shape! })
const fitSlack = atom({ plugin: 'eyes-of-horus', key: 'fitSlack' } as const, core.fitSlack.initial)

const PLUGIN = 'eyes-of-horus'
export const HIDE_MS = 3000
const CAP = 900
const MS_PER_CHAR = 60
const TEST_LINE = 'The eye of Horus is watching.'
const TEST_MIN_MS = 2500

// One row per turn, placed at its start; a second at its end, so the idle eye sits below the reply.
export const rowId = (p: HorusPhase, seq: number) => (p === 'idle' ? `eye-${seq}-end` : `eye-${seq}`)

/** What the row draws: the eye, except while output shows and just after a reply (speech keeps it up; the pulse
 * above the prompt shows the voice). */
export function show(p: HorusPhase, tailAt: number, now: number, speaking: boolean): 'eye' | 'none' {
  if (speaking) return 'eye'
  if (p === 'outputting') return 'none'
  if (p === 'idle' && tailAt > 0 && now - tailAt < HIDE_MS) return 'none'
  return 'eye'
}

/** Whether an assistant block is the end of the latest main reply: the block the desktop draws the eye under. */
export const endsReply = (reply: string, block: string) => block.trim() !== '' && reply.trimEnd().endsWith(block.trimEnd())

/** A markdown reply as plain sentences to speak: code, tables, URLs and markup gone, about `cap` characters. */
export function speakable(md: string, cap = CAP): string[] {
  const lines = md
    .replace(/```[\s\S]*?(```|$)/g, '\n')
    .replace(/`[^`\n]*`/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<?https?:\/\/[^\s>)]+>?/g, '')
    .replace(/<[^>\n]+>/g, '')
    .split('\n')
    .filter(l => (l.match(/\|/g)?.length ?? 0) < 2 && !/^\s*([-*_=]\s*){3,}$/.test(l))
    .map(l =>
      l
        .replace(/^\s*(#{1,6}|>|[-*+]|\d+[.)])\s+/, '')
        .replace(/\*\*|~~|\*/g, '')
        .replace(/(?<![A-Za-z0-9])_+|_+(?![A-Za-z0-9])/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(l => /[\p{L}\p{N}]/u.test(l))
    // A heading or list item without its own stop is its own sentence.
    .map(l => (/[.!?…:;]["')\]]?$/.test(l) ? l : `${l}.`))
  let text = lines.join(' ')
  if (text.length > cap) {
    const cut = text.slice(0, cap)
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
    text = end > cap / 3 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(' '))}…`
  }
  return text
    .split(/(?<=[.!?…]["')\]]?)\s+/)
    .map(s => s.trim())
    .filter(s => /[\p{L}\p{N}]/u.test(s))
}

// Where the eye is drawn. The terminal draws `$.ui.place` rows. The desktop app (4.23118, its bundled CLI 2.1.317)
// asks the engine for every transcript component but `Placed`, so there the eye is drawn under the latest reply.
type Seen = { id: string; what: string; at: number }
export type Snapshot = {
  now: number
  phase: HorusPhase
  turnSeq: number
  tail: number
  voice: Pick<HorusVoice, 'enabled' | 'speaking'>
  surfaces: readonly string[]
  replyChars: number
  place?: { id: string; at: number; result: string }
  seen: Readonly<Record<string, Seen>>
  fault?: { line: string; at: number }
}

// shortcut: diagnostics and the latest reply live in module variables, emptied by a hot reload; session.start reads the
// reply back from the transcript, the rest refills as rows are placed and drawn.
const diag: { place?: Snapshot['place']; seen: Record<string, Seen>; fault?: Snapshot['fault'] } = { seen: {} }
let lastReply = ''

/** What `/horus-eye` answers. */
export function diagnose(s: Snapshot): string {
  const ago = (at: number) => `${((s.now - at) / 1000).toFixed(1)}s ago`
  const what = show(s.phase, s.tail, s.now, s.voice.speaking)
  const hiding = what === 'none' && s.phase === 'idle' ? ` (hidden ${((HIDE_MS - (s.now - s.tail)) / 1000).toFixed(1)}s more after the reply)` : ''
  const draws = Object.entries(s.seen).map(([where, x]) => `  ${where}: ${x.id} -> ${x.what}, ${ago(x.at)}`)
  return [
    `Horus eye: phase ${s.phase}, turn ${s.turnSeq}, ${s.tail > 0 ? `last reply ${ago(s.tail)}` : 'no reply yet'}.`,
    `Now showing: ${what}${hiding}. Voice-over ${s.voice.enabled ? 'on' : 'off'}${s.voice.speaking ? ', speaking' : ''}.`,
    `Surfaces: ${s.surfaces.join(', ') || 'none attached'}.`,
    `Terminal: the current row is ${rowId(s.phase, s.turnSeq)}; last $.ui.place: ${s.place ? `${s.place.id} ${s.place.result}, ${ago(s.place.at)}` : 'none since load'}.`,
    `Desktop: drawn under the latest reply (the app draws no placed rows); reply known: ${s.replyChars > 0 ? `${s.replyChars} chars` : 'not yet'}.`,
    draws.length > 0 ? `Asked to draw:\n${draws.join('\n')}` : 'Asked to draw: nothing since load.',
    ...(s.fault ? [`Last Client fault: ${s.fault.line}, ${ago(s.fault.at)}`] : []),
  ].join('\n')
}

// shortcut: a module flag, reset by a hot reload, so the "no speech" toast may show once more after one.
let toldNoSpeech = false

// Speaks one reply sentence by sentence; stops when a new turn starts or voice-over is switched off.
async function speakAll($: $, sentences: string[], seq: number) {
  let isSilent = false
  for (const [i, s] of sentences.entries()) {
    if ((await read($, turnSeq)) !== seq || !(await read($, voice)).enabled) return
    await update($, voice, v => ({ ...v, speaking: true, subtitle: s, sentenceIndex: i }))
    if (!isSilent) {
      try {
        await $.audio.speak(s)
        continue
      } catch {
        isSilent = true
        if (!toldNoSpeech) {
          toldNoSpeech = true
          $.ui.toast('Horus: speech is unavailable here, showing subtitles only.')
        }
      }
    }
    await $.clock.sleep(Math.max(1200, s.length * MS_PER_CHAR))
  }
  if ((await read($, turnSeq)) === seq) await update($, voice, v => ({ ...v, speaking: false, subtitle: '' }))
}

const reason = (err: unknown) => (err instanceof Error ? err.message : String(err))

// `/voiceover test`: one real utterance, with the speech wave up for at least a moment so it can be seen.
async function speechTest($: $) {
  await update($, voice, v => ({ ...v, speaking: true, subtitle: TEST_LINE, sentenceIndex: 0 }))
  const t0 = await $.clock.now()
  const said = await $.audio.speak(TEST_LINE).then(
    r => `Speech works: the ${r.via} synthesizer said "${TEST_LINE}"`,
    (err: unknown) => `Speech failed (${reason(err)}): replies show as subtitles only`,
  )
  const left = TEST_MIN_MS - ((await $.clock.now()) - t0)
  if (left > 0) await $.clock.sleep(left)
  await update($, voice, v => (v.subtitle === TEST_LINE ? { ...v, speaking: false, subtitle: '' } : v))
  return `${said}. Voice-over is ${(await read($, voice)).enabled ? 'on' : 'off'}.`
}

async function place($: $, id: string) {
  const at = await $.clock.now()
  const result = await $.ui.place({ id }).then(
    r => (r.isPlaced ? `placed (${r.requestId})` : `not placed: ${r.reason}`),
    (err: unknown) => `refused: ${reason(err)}`,
  )
  diag.place = { id, at, result }
}

const lastAssistantText = async ($: $) =>
  (await $.session.messages().catch(() => [])).findLast(m => m.role === 'assistant' && m.text.trim() !== '')?.text ?? ''

/** The eye's region width: the largest frame and its margin, narrower on a narrow surface (the frame inside follows it). */
export const eyeWidth = (columns = 80) => Math.max(16, Math.min(MAX_W + MARGIN, columns - 2))

/** Cells the desktop eye moves right of centre (about 14 px at its cell width). */
const DESKTOP_SHIFT = 2

// The eye, sized explicitly so a surface never lays the region out at zero.
// An unknown viewport gets the full size; the Client still clamps its width to the region it is laid out in.
// `shift`: cells to move the drawing right (the desktop's cell is wider than its glyph, which left the eye left of centre).
// shortcut: with no viewport (the desktop) the region is asked at the reference width, not MAX_W, since the app does not
// say how wide its pane is; raise this default to grow the desktop eye once a wider ask is known to be clamped.
// `slackPct`: percent of the width left free (`/horus-fit`), so rows do not wrap in a font wider than the app expects.
function view(Client: ElementConstructor<ClientProps>, p: HorusPhase, columns = EYE_W + MARGIN + 2, shift = 0, slackPct = 0) {
  const width = eyeWidth(columns)
  const slack = slackPct / 100
  const [, rows] = fit(width, slack)
  const [padTop, padBottom] = pads(rows)
  return (
    <Client
      key="eye"
      module="./clients/eye-view.tsx"
      props={{ mode: p === 'outputting' ? 'idle' : p, shift, slack }}
      width={width}
      height={GAP_TOP + rows + padTop + padBottom}
    />
  )
}

// The engine refuses a second unmatched hook on one event within a plugin, and core holds those; this matches every turn.
const ANY_TURN = { turnId: /^/ }

export const registerEye = (on: On) => {
  for (const isInteractive of [true, false] as const) {
    on('session.start', { isInteractive }, async ($, e, next) => {
      const started = await next(e)
      for (const c of [
        { name: 'voiceover', description: 'Read replies aloud; the pulse above the prompt becomes a speech wave', argumentHint: '[on|off|test]' },
        { name: 'horus-eye', description: 'Say where the Horus eye is drawn and why it shows or hides' },
      ]) {
        await $.command.register(c).catch(() => undefined)
      }
      // A session starts silent: a speech wave left over from a dropped run would never clear.
      await update($, voice, v => ({ ...v, speaking: false, subtitle: '' }))
      lastReply = await lastAssistantText($)
      // A reload draws the transcript again before the reply is read back: draw its last block once more.
      $.ui.invalidate('ui.render')
      await place($, rowId('idle', await read($, turnSeq)))
      return started
    })
  }

  on('command.run', { command: 'voiceover' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'test') return { text: await speechTest($) }
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: 'Usage: /voiceover [on|off|test]' }
    const v = await update($, voice, v => {
      const enabled = arg === '' ? !v.enabled : arg === 'on'
      return enabled ? { ...v, enabled } : { ...v, enabled, speaking: false, subtitle: '' }
    })
    return { text: `Voice-over is ${v.enabled ? 'on' : 'off'}.` }
  })

  on('command.run', { command: 'horus-eye' }, async $ => {
    const v = await read($, voice)
    const text = diagnose({
      now: await $.clock.now(),
      phase: await read($, phase),
      turnSeq: await read($, turnSeq),
      tail: await read($, tail),
      voice: v,
      surfaces: await $.session.surfaces().catch(() => []),
      replyChars: lastReply.length,
      place: diag.place,
      seen: diag.seen,
      fault: diag.fault,
    })
    return { text }
  })

  // Core (outermost) has already counted the turn when this runs.
  on('turn.start', ANY_TURN, async ($, e, next) => {
    if (e.agentId === undefined) {
      if ((await read($, voice)).speaking) await update($, voice, v => ({ ...v, speaking: false, subtitle: '' }))
      await place($, rowId('thinking', await read($, turnSeq)))
    }
    return next(e)
  })

  on('turn.complete', ANY_TURN, async ($, e, next) => {
    if (e.agentId === undefined) {
      const seq = await read($, turnSeq)
      if (e.answer.trim() !== '') lastReply = e.answer
      await place($, rowId('idle', seq))
      // Render hooks re-run on state changes only: now for the reply that just landed, then when the hide window ends.
      $.ui.invalidate('ui.render')
      $.clock.after(HIDE_MS + 50, () => $.ui.invalidate('ui.render'))
      const sentences = (await read($, voice)).enabled && !e.isAborted ? speakable(e.answer) : []
      if (sentences.length > 0) $.clock.after(0, () => void speakAll($, sentences, seq).catch(() => undefined))
    }
    return next(e)
  })

  // Any plugin's speech turns the pulse into the speech wave; our own sentences already did.
  on('audio.speak', async ($, e, next) => {
    const v = await read($, voice)
    if (v.speaking && v.subtitle === e.text) return next(e)
    await update($, voice, x => ({ ...x, speaking: true, subtitle: e.text, sentenceIndex: 0 }))
    try {
      return await next(e)
    } finally {
      await update($, voice, x => (x.subtitle === e.text ? { ...x, speaking: false, subtitle: '' } : x))
    }
  })

  // Terminal route: the newest placed row, the eye centred in it. Asks from any surface are noted for /horus-eye.
  on('ui.render', { component: 'Placed' }, async ($, e, next) => {
    if (e.props.plugin !== PLUGIN) return next(e)
    const p = await read($, phase)
    const seq = await read($, turnSeq)
    const isCurrent = e.props.id === rowId(p, seq)
    const v = isCurrent ? await read($, voice) : undefined
    const what = v ? show(p, await read($, tail), await $.clock.now(), v.speaking) : 'stale'
    diag.seen[`${e.surface} placed row`] = { id: e.props.id, what, at: await $.clock.now() }
    if (e.surface !== 'terminal' || v === undefined || what === 'none' || what === 'stale') return next(e)
    const { Box, Client } = $.ui.resolve(e)
    return (
      <Box width="100%" flexDirection="row" justifyContent="center">
        {view(Client, p, e.viewport?.columns, 0, await read($, fitSlack))}
      </Box>
    )
  }).catch(($, e, next) => next(e))

  // Desktop route: under the block that ends the latest main reply, the transcript's last row between turns.
  on('ui.render', { component: 'AssistantMessage', surface: 'desktop' }, async ($, e, next) => {
    if (!endsReply(lastReply, e.props.text)) return next(e)
    const p = await read($, phase)
    const v = await read($, voice)
    const what = show(p, await read($, tail), await $.clock.now(), v.speaking)
    diag.seen['desktop reply'] = { id: e.requestId, what, at: await $.clock.now() }
    if (what === 'none') return next(e)
    const { Box, Client } = $.ui.resolve(e)
    // No width here: with width="100%" on this root Box the desktop app (4.23118) mounts no Client in the reply and
    // raises no fault. A column's children stretch, so the row still spans the reply and centres the eye.
    return (
      <Box flexDirection="column">
        {await next(e)}
        <Box flexDirection="row" justifyContent="center">
          {view(Client, p, e.viewport?.columns, DESKTOP_SHIFT, await read($, fitSlack))}
        </Box>
      </Box>
    )
  }).catch(($, e, next) => next(e))

  // A Client of ours failed on a surface: noted for /horus-eye. The engine then draws the site again unasked.
  on('ui.fault', async ($, e, next) => {
    diag.fault = { line: `${e.surface} ${e.component} ${e.element} (${e.module}) ${e.phase}: ${e.reason}`, at: await $.clock.now() }
    return next(e)
  })
}
