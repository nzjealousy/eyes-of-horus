import { atom, read } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import type { HorusPonytailLevel, HorusProgress, HorusTaskStatus } from '../types'
import * as core from './core'
import { bg, dim, err, gold, goldBright, goldDim, ok, panelHi, purple, text, tierColor } from './theme'

// The scan reads state refs only off literals in this file: restate core's atoms here, initials and shape tags from core.
const phase = atom({ plugin: 'eyes-of-horus', key: 'phase' } as const, core.phase.initial)
const tail = atom({ plugin: 'eyes-of-horus', key: 'tail' } as const, core.tail.initial)
const terminalBusy = atom({ plugin: 'eyes-of-horus', key: 'terminalBusy' } as const, core.terminalBusy.initial)
const progress = atom({ plugin: 'eyes-of-horus', key: 'progress' } as const, core.progress.initial, { shape: core.progress.shape! })
const ponytail = atom({ plugin: 'eyes-of-horus', key: 'ponytail' } as const, core.ponytail.initial, { shape: core.ponytail.shape! })
const usage = atom({ plugin: 'eyes-of-horus', key: 'usage' } as const, core.usage.initial, { shape: core.usage.shape! })
const voice = atom({ plugin: 'eyes-of-horus', key: 'voice' } as const, core.voice.initial, { shape: core.voice.shape! })

const LEVELS: readonly HorusPonytailLevel[] = ['off', 'lite', 'full', 'ultra']
const FADE_MS = 10_000
// About 8 CSS px per reported column on the desktop (as savvy-progress measures it).
const PX = 8
const CTX_PX = 96
const CTX_CELLS = 8
const BAR_H = 4

export type ProgressView = 'none' | 'active' | 'done'
export type Run = { text: string; color: string; dim?: boolean }

// 266.8M, 12.3k, 950.
export function compactNumber(n: number): string {
  const units: [number, string][] = [
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'k'],
  ]
  for (const [size, unit] of units) if (n >= size) return `${(n / size).toFixed(1)}${unit}`
  return String(Math.round(n))
}

// 1h 7m, 7m 12s, 42s.
export function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}

export const dashboardVisible = (busy: boolean) => !busy

// Rows: row 1 (levels/ctx, only with the dashboard), chips, progress (2 full, 1 compact or done), the rail (2).
// Over `maxRows`, chips go first, then the progress header; the rail never does.
export function budget(maxRows: number, dash: boolean, view: ProgressView) {
  let chips = dash
  let detail = view === 'active'
  const rows = () => (dash ? 1 : 0) + (chips ? 1 : 0) + (view === 'none' ? 0 : detail ? 2 : 1) + 2
  if (rows() > maxRows) chips = false
  if (rows() > maxRows) detail = false
  return { chips, detail, rows: rows() }
}

// The ctx line's colour, savvy-progress style: gold, purple above 70 %, err above 90 %.
export const ctxColor = (pct: number) => (pct > 90 ? err : pct > 70 ? purple : gold)

const svgDoc = (w: number, h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`

// Desktop ctx bar: a thin rounded track in panelHi and a solid fill (gold -> goldBright while under 70 %).
export function ctxSvg(pct: number, w: number, h = 12): string {
  const color = ctxColor(pct)
  const fill = Math.round((w * Math.min(100, Math.max(0, pct))) / 100)
  const y = (h - BAR_H) / 2
  const grad = `<defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="${gold}"/><stop offset="1" stop-color="${goldBright}"/></linearGradient></defs>`
  return svgDoc(
    w,
    h,
    (color === gold ? grad : '') +
      `<rect y="${y}" width="${w}" height="${BAR_H}" rx="2" fill="${panelHi}"/>` +
      (fill > 0 ? `<rect y="${y}" width="${fill}" height="${BAR_H}" rx="2" fill="${color === gold ? 'url(#g)' : color}"/>` : ''),
  )
}

// Terminal ctx bar: a solid heavy line for the fill, a light one for the track.
export function ctxCells(pct: number, width: number): [string, string] {
  const filled = Math.round((width * Math.min(100, Math.max(0, pct))) / 100)
  return ['━'.repeat(filled), '─'.repeat(width - filled)]
}

type Seg = { tier: string; status: HorusTaskStatus }
const segments = (p: HorusProgress): Seg[] =>
  p.tasks.length > 0 ? p.tasks : Array.from({ length: p.total }, (_, i) => ({ tier: '', status: i < p.done ? 'done' : 'pending' }))
const segColor = (s: Seg) => (s.status === 'failed' ? err : (Object.hasOwn(tierColor, s.tier) ? (tierColor[s.tier] ?? dim) : dim))

// Terminal: one cell-run per task in `width` cells, a one-cell gap between runs when there is room.
// Done and failed are solid, running is solid but dim, pending is the light track.
export function progressRuns(p: HorusProgress, width: number): Run[] {
  const tasks = segments(p)
  if (tasks.length === 0 || width <= 0) return [{ text: '─'.repeat(Math.max(0, width)), color: dim, dim: true }]
  const shown = tasks.slice(0, width)
  const gap = width >= 2 * shown.length - 1 ? 1 : 0
  const per = Math.max(1, Math.floor((width - gap * (shown.length - 1)) / shown.length))
  const runs: Run[] = []
  shown.forEach((t, i) => {
    if (i > 0 && gap) runs.push({ text: ' ', color: dim })
    if (t.status === 'pending') runs.push({ text: '─'.repeat(per), color: dim, dim: true })
    else runs.push({ text: '━'.repeat(per), color: segColor(t), dim: t.status === 'running' })
  })
  return runs
}

// Desktop: rounded tier-coloured segments; done/failed filled, running half-filled with a moving sheen, pending track only.
export function progressSvg(p: HorusProgress, w: number, h = 10): string {
  const gap = 3
  const tasks = segments(p).slice(0, Math.max(1, Math.floor((w + gap) / (4 + gap))))
  const n = Math.max(1, tasks.length)
  const seg = (w - gap * (n - 1)) / n
  const y = (h - BAR_H) / 2
  const sheen = Math.max(6, Math.round(seg * 0.4))
  const r = (x: number, width: number, fill: string, extra = '') =>
    `<rect x="${x.toFixed(1)}" y="${y}" width="${width.toFixed(1)}" height="${BAR_H}" rx="2" fill="${fill}"${extra}/>`
  const clips: string[] = []
  const body = tasks.map((t, i) => {
    const x = i * (seg + gap)
    const track = r(x, seg, panelHi)
    if (t.status === 'pending') return track
    if (t.status !== 'running') return track + r(x, seg, segColor(t))
    clips.push(`<clipPath id="c${i}">${r(x, seg, panelHi)}</clipPath>`)
    return `${track}${r(x, seg, segColor(t), ' opacity="0.45"')}<g clip-path="url(#c${i})">${r(x - sheen, sheen, 'url(#s)', ' class="eoh-sheen"')}</g>`
  })
  const style =
    `<style>.eoh-sheen{animation:eoh-sheen 1.6s linear infinite}@keyframes eoh-sheen{to{transform:translateX(${(seg + sheen).toFixed(1)}px)}}` +
    `@media (prefers-reduced-motion: reduce){.eoh-sheen{animation:none}}</style>`
  const defs = `<defs><linearGradient id="s" x1="0" x2="1"><stop offset="0" stop-color="${goldBright}" stop-opacity="0"/><stop offset="0.5" stop-color="${goldBright}" stop-opacity="0.8"/><stop offset="1" stop-color="${goldBright}" stop-opacity="0"/></linearGradient>${clips.join('')}</defs>`
  return svgDoc(w, h, style + defs + body.join(''))
}

const clip = (s: string, max: number) => (s.length > max ? s.slice(0, Math.max(1, max - 1)) + '…' : s)

// The finishedAt whose fade-out redraw is scheduled, so each render in the window does not add another timer.
let fading = -1

// A finished flow shows its "done" line for FADE_MS from core's finishedAt (kept in state, so a reload keeps it).
export function progressView($: EngineInterface, p: HorusProgress | null, now: number): ProgressView {
  if (p === null || (p.total === 0 && p.tasks.length === 0 && p.title === '')) return 'none'
  if (!p.finished) return 'active'
  const left = FADE_MS - (now - (p.finishedAt ?? 0))
  if (left <= 0) return 'none'
  if (fading !== p.finishedAt) {
    fading = p.finishedAt ?? 0
    $.clock.after(left, () => $.ui.invalidate('ui.render'))
  }
  return 'done'
}

async function setLevel($: EngineInterface, level: HorusPonytailLevel) {
  if ((await read($, ponytail)).level === level) return
  // ponytail's own band switches the same way; core re-reads the flag after the command.
  await $.command.run({ command: 'ponytail:ponytail', args: level }).catch(() => $.ui.toast(`Horus: could not switch ponytail to ${level}`))
}

export const registerBand = (on: On) => {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' && e.surface !== 'desktop') return next(e)
    const ph = await read($, phase)
    const tl = await read($, tail)
    const speaking = (await read($, voice)).speaking
    const now0 = await $.clock.now()
    const { Client, Box: Column } = $.ui.resolve(e)
    // The pulse is always drawn: under a survey too, and as the speech wave while anything speaks.
    const pulse = (
      <Client
        key="horus:rail"
        module="./clients/prompt-rail.tsx"
        props={{ mode: speaking ? 'speaking' : ph, tailAgeMs: tl > 0 ? now0 - tl : -1 }}
        width={e.props.bodyColumns}
        height={2}
      />
    )
    if (e.props.hasSurvey)
      return (
        <Column flexDirection="column">
          {await next(e)}
          {pulse}
        </Column>
      )
    const busy = await read($, terminalBusy)
    const p = await read($, progress)
    const now = await $.clock.now()
    const cols = e.props.bodyColumns
    const dash = dashboardVisible(busy)
    const view = progressView($, p, now)
    const fit = budget(e.props.maxRows, dash, view)

    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    // The terminal's table may carry an Svg that draws nothing: test the surface too.
    const Svg = e.surface === 'desktop' && 'Svg' in ui ? ui.Svg : null
    // bodyColumns counts terminal cells; a desktop draws Buttons wider, so rows there are left to flex.
    const width = e.surface === 'terminal' ? cols : undefined
    let row1 = null
    let chips = null
    if (dash) {
      const level = (await read($, ponytail)).level
      const u = await read($, usage)
      const pct = Math.round(u.contextPct)
      const [fill, rest] = ctxCells(pct, CTX_CELLS)
      row1 = (
        <Box flexDirection="row" alignItems="center" gap={1} width={width}>
          {LEVELS.map(l => (
            <Button key={`ph:level:${l}`} plain onPress={() => setLevel($, l)}>
              {l === level ? (
                <Text backgroundColor={gold} color={bg} bold>
                  {` ${l} `}
                </Text>
              ) : (
                <Text color={goldDim}>{` ${l} `}</Text>
              )}
            </Button>
          ))}
          <Text color={dim}>ctx</Text>
          {Svg ? (
            <Svg source={ctxSvg(pct, CTX_PX)} alt={`context ${pct}% used`} width={CTX_PX} height={12} />
          ) : (
            <Text>
              <Text color={ctxColor(pct)}>{fill}</Text>
              <Text color={dim} dimColor>
                {rest}
              </Text>
            </Text>
          )}
          <Text color={text}>{`${pct}%`}</Text>
        </Box>
      )
      if (fit.chips) {
        const chip = (label: string, value: string) => (
          <Text>
            <Text color={dim}>{`${label} `}</Text>
            <Text color={text}>{value}</Text>
          </Text>
        )
        chips = (
          <Box flexDirection="row" gap={2} width={width}>
            {chip('cost', `$${u.costUsd.toFixed(2)}`)}
            {chip('tokens', compactNumber(u.tokensTotal))}
            {chip('agent', duration(u.agentTimeMs))}
            {chip('turns', String(u.turns))}
          </Box>
        )
      }
    }

    let flow = null
    if (p !== null && view === 'done') {
      flow = (
        <Text color={ok} wrap="truncate-end">
          {`✓ ${p.title || 'savvy-flow'} · done ${p.done}/${p.total}`}
        </Text>
      )
    } else if (p !== null && view === 'active') {
      const count = `${p.done}/${p.total}`
      const bar = (barCells: number) =>
        Svg ? (
          <Svg
            source={progressSvg(p, Math.min(1600, barCells * PX))}
            alt={`savvy-flow ${count} done`}
            width={Math.min(1600, barCells * PX)}
            height={10}
          />
        ) : (
          <Box flexDirection="row">
            {progressRuns(p, barCells).map(r => (
              <Text color={r.color} dimColor={r.dim}>
                {r.text}
              </Text>
            ))}
          </Box>
        )
      if (fit.detail) {
        flow = (
          <Box flexDirection="column" width={width}>
            <Text wrap="truncate-end">
              <Text color={gold} bold>{`◈ ${p.title || 'savvy-flow'}`}</Text>
              <Text color={dim}> · </Text>
              <Text color={text}>{count}</Text>
              <Text color={dim}>{p.phase ? ` · ${p.phase}` : ''}</Text>
            </Text>
            {bar(Math.max(4, cols - 2))}
          </Box>
        )
      } else {
        const title = clip(p.title || 'savvy-flow', 20)
        const used = title.length + count.length + p.phase.length + 6
        flow = (
          <Box flexDirection="row" alignItems="center" gap={1} width={width}>
            <Text color={gold}>{`◈ ${title}`}</Text>
            <Text color={text}>{count}</Text>
            {bar(Math.max(4, cols - used))}
            <Text color={dim}>{p.phase}</Text>
          </Box>
        )
      }
    }

    return (
      <Box flexDirection="column" width={width}>
        {row1}
        {chips}
        {flow}
        {pulse}
      </Box>
    )
  }).catch(($, e, next) => next(e))

  // The terminal keeps the engine's hint and adds a dim tail; no other surface draws `tail` yet.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    const mine = `◈ horus · ${await read($, phase)}`
    return next({ ...e, props: { ...e.props, tail: e.props.tail ? `${e.props.tail} ${mine}` : mine } })
  }).catch(($, e, next) => next(e))
}
