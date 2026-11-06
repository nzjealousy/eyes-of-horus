import { atom, read, update } from 'claude-code'
import type { On } from 'claude-code'

import type { HorusAgent, HorusLogEntry, HorusLogKind, HorusProgress, HorusTaskStatus, HorusUsage } from '../types'
import { fmtElapsed } from './clients/agent-clock'
import * as core from './core'
import { GOD_TIERS, godGlyph, godName, godSvg } from './gods'
import * as T from './theme'

const PANE = 'horus'

// validate refuses `read` of an atom made in another file (its scan needs the literal ref here), so the
// refs are restated; initial values and shape tags still come from core's atoms, the one place they live.
const agents = atom({ plugin: 'eyes-of-horus', key: 'agents' } as const, core.agents.initial, { shape: core.agents.shape! })
const progress = atom({ plugin: 'eyes-of-horus', key: 'progress' } as const, core.progress.initial, { shape: core.progress.shape! })
const sessionLog = atom({ plugin: 'eyes-of-horus', key: 'sessionLog' } as const, core.sessionLog.initial, { shape: core.sessionLog.shape! })
const usage = atom({ plugin: 'eyes-of-horus', key: 'usage' } as const, core.usage.initial, { shape: core.usage.shape! })
const paneCollapsed = atom({ plugin: 'eyes-of-horus', key: 'paneCollapsed' } as const, core.paneCollapsed.initial, {
  shape: core.paneCollapsed.shape!,
})

export type Card = {
  key: string
  depth: number
  tier?: string
  type: string
  title: string
  status: HorusTaskStatus
  agentId?: string
  ms?: number
  tokens?: number
}

export const trunc = (s: string, n: number) => (n <= 0 ? '' : s.length <= n ? s : s.slice(0, n - 1) + '…')

export const railWindow = (log: readonly HorusLogEntry[], n: number) => log.slice(-Math.max(1, n))

// `savvy-careful` or `savvy-flow:savvy-careful` -> `careful`; anything else has no tier.
export const tierOf = (type: string): string | undefined => {
  const t = /(?:^|:)savvy-([a-z]+)$/.exec(type)?.[1]
  return t !== undefined && (GOD_TIERS as readonly string[]).includes(t) ? t : undefined
}

// What each savvy-flow tier runs on (its agent definitions), for the `tier · model · effort` line.
const TIER_MODEL: Record<string, string> = {
  fable: 'Fable · high',
  heavy: 'Opus · xhigh',
  careful: 'Opus · high',
  medium: 'Opus · medium',
  light: 'Opus · low',
}

export const fmtTokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${Math.round(n)}`)
export const fmtCost = (usd: number) => `≈$${usd < 10 ? usd.toFixed(2) : usd.toFixed(1)}`

// Agents joined with savvy-flow tasks: a task sits under its latest earlier dependency (`after` is 1-based);
// forward or self references are ignored, so there are no cycles. Agents matching no task follow, flat.
export function buildCards(list: readonly HorusAgent[], p: HorusProgress | null, now: number): Card[] {
  const fromAgent = (a: HorusAgent, depth: number, taskTier?: string): Card => {
    const tier = taskTier ?? tierOf(a.type)
    return {
      key: a.id,
      depth,
      ...(tier === undefined ? {} : { tier }),
      type: a.type,
      title: a.title,
      status: a.status,
      agentId: a.id,
      ms: Math.max(0, (a.endedAt ?? now) - a.startedAt),
      ...(a.tokens === undefined ? {} : { tokens: a.tokens }),
    }
  }
  const tasks = p?.tasks ?? []
  if (tasks.length === 0) return list.map(a => fromAgent(a, 0))
  const parent = tasks.map((t, i) => Math.max(-1, ...t.after.map(n => n - 1).filter(j => j >= 0 && j < i)))
  const used = new Set<string>()
  const out: Card[] = []
  const visit = (i: number, depth: number) => {
    const t = tasks[i]!
    const a = list.findLast(x => x.title === t.title && !used.has(x.id))
    if (a) {
      used.add(a.id)
      out.push(fromAgent(a, depth, t.tier))
    } else {
      out.push({ key: `task:${i}`, depth, tier: t.tier, type: t.tier, title: t.title, status: t.status })
    }
    parent.forEach((pi, j) => pi === i && visit(j, depth + 1))
  }
  parent.forEach((pi, i) => pi < 0 && visit(i, 0))
  return [...out, ...list.filter(a => !used.has(a.id)).map(a => fromAgent(a, 0))]
}

/** Desktop groups: running agents, finished ones newest first, and planned tasks no agent has taken yet. */
export const groupCards = (cards: readonly Card[]) => ({
  running: cards.filter(c => c.agentId !== undefined && c.status === 'running'),
  finished: cards.filter(c => c.agentId !== undefined && c.status !== 'running').reverse(),
  planned: cards.filter(c => c.agentId === undefined),
})

const GLYPH: Record<HorusTaskStatus, string> = { running: '●', done: '✓', failed: '✗', pending: '○' }
const STATUS_COLOR: Record<HorusTaskStatus, string> = { running: T.aqua, done: T.ok, failed: T.err, pending: T.dim }
const KIND: Record<HorusLogKind, [string, string]> = {
  prompt: ['❯', T.gold],
  tool: ['⚙', T.aqua],
  agent: ['◈', T.violet],
  reply: ['✦', T.orbCore],
}

// Obsidian -> deep purple, with a faint gold Wedjat (eye of Horus).
const BACKDROP_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">' +
  '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
  `<stop offset="0" stop-color="${T.bg}"/><stop offset="0.55" stop-color="${T.panel}"/><stop offset="1" stop-color="${T.purpleDim}"/></linearGradient></defs>` +
  '<rect width="100" height="100" fill="url(#g)"/>' +
  '<svg x="20" y="20" width="60" height="60" viewBox="0 0 120 80" preserveAspectRatio="xMidYMid meet">' +
  `<g fill="none" stroke="${T.gold}" stroke-width="2.5" stroke-linecap="round" opacity="0.08">` +
  '<path d="M10 18 Q60 0 110 14"/>' +
  '<path d="M14 38 Q60 6 106 38 Q60 62 14 38 Z"/>' +
  `<circle cx="60" cy="36" r="11" fill="${T.gold}"/>` +
  '<path d="M52 50 L46 74"/>' +
  '<path d="M72 48 Q92 62 84 72 Q76 78 72 70"/>' +
  '</g></svg></svg>'

// The spec's obsidian-purple glass; no theme key holds this tint.
const BACKDROP = { id: 'horus', glass: { blur: 18, tint: '#0c0816', opacity: 0.78 } }
type Backdrop = typeof BACKDROP
// 2.1.319 replaced $.ui.backdrop(b) with $.theme.set({ backdrop: b }); the desktop app still runs 2.1.317.
// Either call may be missing from the types and the engine at hand, hence this narrow local view of `$`. The loader
// refuses reading a noun of `$` as a value, so nothing is probed: the new call is tried, then the old one.
export type BackdropApi = {
  theme: { set: (a: { backdrop: Backdrop }) => Promise<unknown> }
  ui: { backdrop: (b: Backdrop) => Promise<unknown> }
}
export async function setBackdrop($: BackdropApi): Promise<void> {
  try {
    try {
      await $.theme.set({ backdrop: BACKDROP })
    } catch {
      await $.ui.backdrop(BACKDROP)
    }
  } catch {
    // A surface that draws no backdrop, or an engine without either call, must not stop the session.
  }
}

// --- desktop drawings: every row of the Agents section is one Svg of known pixel height (header, group heads,
// cards), each drawing its own patch of the dotted grid, so nothing is laid over anything but the two Buttons, which
// sit at offset 0 in corners each drawing keeps empty (offset 0 needs no cell-to-pixel guess).

const FONT = "'Segoe UI',-apple-system,BlinkMacSystemFont,sans-serif"
export const CARD_H = 66
export const PLAN_H = 46
export const HEAD_H = 78
export const ROW_H = 24
const GRID_STEP = 16
export const X0 = 54 // text starts right of the god (drawn 4..46)
export const OPEN_W = 40 // top-right corner of a card kept clear for the ↗ Button laid over it
export const TOGGLE_W = 96 // top-right corner of the header kept clear for the Collapse/Expand Button
const SEP = 6 // gap between the god/tier and the model/effort parts of the second line

const xml = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)
// Advance of UI text in em: each class takes the widest of its glyphs in Segoe UI (regular or semibold, measured),
// plus 6% for other UI fonts and hinting, so a fitted string never reaches the next slot.
const em = (ch: string) => {
  const cp = ch.codePointAt(0) ?? 0
  if (/[&…✗%→○mM@W—Ææ×÷]/.test(ch)) return 1
  if (/[VAÄ+<=>G^~≈UÜDHOQNw✓↗À-ÖØ-Þ]/.test(ch)) return 0.78
  if (/[()[\]{}ftr\-J\\/_*s"?zc]/.test(ch)) return 0.48
  if (/[\s.,:;·'ijl|I`!]/.test(ch)) return 0.32
  return cp > 0xffff ? 1.4 : cp >= 0x2000 ? 1.05 : 0.63
}
export const textWidth = (s: string, size: number) => [...s].reduce((w, ch) => w + size * em(ch), 0) * 1.06
/** `s`, cut with an ellipsis to at most `maxW` px by textWidth; '' when not even the ellipsis fits. */
export const fitText = (s: string, size: number, maxW: number) => {
  if (textWidth(s, size) <= maxW) return s
  const room = maxW - textWidth('…', size)
  if (room < 0) return ''
  let out = ''
  let w = 0
  for (const ch of s) {
    w += textWidth(ch, size)
    if (w > room) break
    out += ch
  }
  return out.trimEnd() + '…'
}

const CSS =
  `<style>.t{fill:${T.text}}.s{fill:${T.dim}}.k{fill:${T.panelHi}}.ln{stroke:${T.panelHi}}` +
  '.live{animation:eoh-live 1.6s ease-in-out infinite}@keyframes eoh-live{50%{opacity:.3}}' +
  '@media (prefers-reduced-motion:reduce){.live,.sheen{animation:none}}</style>'
// The dot pattern is phased by the drawing's offset in the section, so stacked drawings continue one grid.
const dots = (W: number, H: number, gridY: number) =>
  `<defs><pattern id="d" y="${-(gridY % GRID_STEP)}" width="${GRID_STEP}" height="${GRID_STEP}" patternUnits="userSpaceOnUse">` +
  `<circle cx="${GRID_STEP / 2}" cy="${GRID_STEP / 2}" r="1" fill="${T.goldDim}" opacity="0.4"/></pattern></defs>` +
  `<rect width="${W}" height="${H}" fill="url(#d)"/>`
const svgDoc = (W: number, H: number, gridY: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${CSS}${dots(W, H, gridY)}${body}</svg>`
const text = (x: number, y: number, size: number, body: string, attrs = '') =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}"${attrs}>${body}</text>`
const r1 = (n: number) => Math.round(n * 10) / 10

const statusMark = (x: number, y: number, status: HorusTaskStatus) => {
  if (status === 'running') return `<circle class="live" cx="${x}" cy="${y}" r="3.5" fill="${T.aqua}"/>`
  if (status === 'done')
    return `<path d="M${x - 5} ${y}l3.5 3.5 6.5-7" fill="none" stroke="${T.ok}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`
  if (status === 'failed') return `<path d="M${x - 4} ${y - 4}l8 8M${x + 4} ${y - 4}l-8 8" stroke="${T.err}" stroke-width="1.8" stroke-linecap="round"/>`
  return `<circle cx="${x}" cy="${y}" r="5" fill="none" stroke="${T.dim}" stroke-width="1.4"/><path d="M${x} ${y - 2.5}v2.8l1.8 1.2" fill="none" stroke="${T.dim}" stroke-width="1.4" stroke-linecap="round"/>`
}

// Thin rounded progress line: full in the tier colour when done, `err` when failed, a sliding sheen while running.
const progressLine = (x: number, y: number, w: number, status: HorusTaskStatus, color: string) => {
  const box = `x="${x}" y="${y}" width="${w}" height="3" rx="1.5"`
  const track = `<rect class="k" ${box}/>`
  if (status === 'done' || status === 'failed') return `${track}<rect ${box} fill="${status === 'done' ? color : T.err}"/>`
  if (status !== 'running') return track
  const seg = Math.round(w * 0.3)
  return (
    `<style>.sheen{animation:eoh-sheen 1.6s linear infinite}@keyframes eoh-sheen{to{transform:translateX(${w + seg}px)}}</style>` +
    `${track}<clipPath id="pc"><rect ${box}/></clipPath>` +
    `<g clip-path="url(#pc)"><rect class="sheen" x="${x - seg}" y="${y}" width="${seg}" height="3" rx="1.5" fill="${color}"/></g>`
  )
}

/** What a card says for its time: a refused run (failed under a second) or one with no start reads '—'. */
export const elapsedLabel = (c: Card) => (c.ms === undefined || (c.status === 'failed' && c.ms < 1000) ? '—' : fmtElapsed(c.ms))

// A running card's clock ticks inside its Svg (a Client cannot draw into one): each figure is a column of digits
// stepped by a CSS animation whose negative delay is the elapsed time, and each of fmtElapsed's three formats shows
// in its own time window. A cell is a fixed glyph or [period in s, the glyphs it steps through].
type ClockCell = string | readonly [number, string]
const DIGITS = '0123456789'
const clockGroups = (s: number): { from: number; to: number; cells: ClockCell[] }[] =>
  [
    { from: 0, to: 60, cells: [[60, ' 12345'], [10, DIGITS], 's'] as ClockCell[] },
    { from: 60, to: 3600, cells: [[3600, ' 12345'], [600, DIGITS], 'm', [60, '012345'], [10, DIGITS], 's'] as ClockCell[] },
    // shortcut: the hour figure is fixed at render time, stale past the next hour until the pane redraws; fine for agents.
    { from: 3600, to: Infinity, cells: [...String(Math.max(1, Math.floor(s / 3600))), 'h', [3600, '012345'], [600, DIGITS], 'm'] as ClockCell[] },
  ].filter(g => g.to > s)

/** The card's elapsed time right-aligned at `xr`: its markup and the widest it can get (`w`), for the title's slot. */
export const clockSvg = (xr: number, y: number, size: number, c: Card) => {
  if (c.status !== 'running' || c.ms === undefined) {
    const label = elapsedLabel(c)
    return { svg: text(xr, y, size, xml(label), ' class="s" text-anchor="end" font-variant-numeric="tabular-nums"'), w: textWidth(label, size) }
  }
  const s = c.ms / 1000
  const lh = size * 2
  let w = 0
  const groups = clockGroups(s).map(g => {
    let x = xr
    const cells = [...g.cells].reverse().map(cell => {
      const glyphs = typeof cell === 'string' ? cell : cell[1]
      // Segoe UI's own advances (tabular digits ≤ 0.58 em), rounded up: wider cells would leave gaps between figures.
      const cw = size * (glyphs === 'm' ? 0.9 : glyphs === 's' ? 0.45 : 0.6)
      x -= cw
      const cx = r1(x + cw / 2)
      if (typeof cell === 'string') return `<text x="${cx}" y="${y}">${xml(cell)}</text>`
      const [period, steps] = cell
      const col = [...steps].map((ch, k) => (ch === ' ' ? '' : `<text x="${cx}" y="${r1(y + k * lh)}">${ch}</text>`)).join('')
      return `<g style="animation:eoh-k${steps.length} ${period}s steps(${steps.length}) infinite;animation-delay:${-r1(s)}s">${col}</g>`
    })
    w = Math.max(w, xr - x)
    const from = r1(g.from - s)
    const to = r1(g.to - s)
    const body = Number.isFinite(to) ? `<g style="animation:eoh-off 1s ${to}s forwards">${cells.join('')}</g>` : cells.join('')
    return from > 0 ? `<g style="animation:eoh-off ${from}s">${body}</g>` : body
  })
  const css =
    `<style>@keyframes eoh-off{from,to{opacity:0}}@keyframes eoh-k10{to{transform:translateY(-${10 * lh}px)}}` +
    `@keyframes eoh-k6{to{transform:translateY(-${6 * lh}px)}}</style>`
  const clip = `<clipPath id="ck"><rect x="${r1(xr - w - 2)}" y="${y - size}" width="${r1(w + 4)}" height="${r1(size * 1.4)}"/></clipPath>`
  const attrs = `font-family="${FONT}" font-size="${size}" font-variant-numeric="tabular-nums" text-anchor="middle"`
  return { svg: `${css}${clip}<g class="clk" clip-path="url(#ck)" fill="${T.aqua}" ${attrs}>${groups.join('')}</g>`, w }
}

const tierColorOf = (tier: string | undefined) => (tier !== undefined && T.tierColor[tier]) || T.dim
const whoOf = (c: Card) => `${godName(c.tier ?? '')} · ${c.tier ?? c.type}`

/** Where each part of a card goes at width W: every text is cut to its own slot, none reaching the next one. */
export const cardLayout = (W: number, c: Card) => {
  const right = W - OPEN_W // the ↗ Button's corner starts here
  const markX = right - 9 // status mark, ±6 px
  const clockR = markX - 12
  const clock = clockSvg(clockR, 20, 12, c)
  const titleR = clockR - clock.w - 8
  const lineW = right - X0
  const who = fitText(whoOf(c), 11, lineW * 0.6)
  const meta = [c.tier === undefined ? '' : TIER_MODEL[c.tier], c.status === 'failed' ? 'failed' : ''].filter(Boolean).join(' · ')
  // ctx and cost per agent are not in state; tokens are, once the agent finishes a turn.
  const stats = c.tokens ? `${fmtTokens(c.tokens)} tokens` : ''
  return {
    right,
    markX,
    clockR,
    clock,
    titleR,
    title: fitText(c.title || c.type, 13, titleR - X0),
    lineW,
    who,
    meta: meta ? fitText(meta, 11, lineW - textWidth(who, 11) - SEP) : '',
    stats: fitText(stats, 11, W - 10 - X0),
  }
}

const twoParts = (x: number, y: number, who: string, color: string, meta: string, opacity = '') =>
  text(x, y, 11, `<tspan fill="${color}"${opacity}>${xml(who)}</tspan>${meta ? `<tspan class="s" dx="${SEP}">${xml(meta)}</tspan>` : ''}`)

export const agentSvg = (W: number, c: Card, gridY = 0) => {
  const color = tierColorOf(c.tier)
  const L = cardLayout(W, c)
  return svgDoc(
    W,
    CARD_H,
    gridY,
    godSvg(c.tier ?? '', 4, 5, 1.75, c.status === 'running', c.status !== 'running') +
      text(X0, 20, 13, xml(L.title), ' class="t" font-weight="600"') +
      L.clock.svg +
      twoParts(X0, 37, L.who, color, L.meta) +
      (L.stats ? text(W - 10, 52, 11, xml(L.stats), ' class="s" text-anchor="end" font-variant-numeric="tabular-nums"') : '') +
      progressLine(X0, 57, W - X0 - 10, c.status, color) +
      `<g class="mark">${statusMark(L.markX, 16, c.status)}</g>` +
      `<line class="ln" x1="0" y1="${CARD_H - 0.5}" x2="${W}" y2="${CARD_H - 0.5}"/>`,
  )
}

// A planned task: smaller, faded, a grey ("hollow") god that does not walk. No Button lies over it.
export const plannedLayout = (W: number, c: Card) => {
  const lineW = W - 10 - X0
  const who = fitText(whoOf(c), 11, lineW * 0.6)
  const meta = [c.tier === undefined ? '' : TIER_MODEL[c.tier], 'planned'].filter(Boolean).join(' · ')
  return { lineW, title: fitText(c.title, 13, W - 26 - X0), who, meta: fitText(meta, 11, lineW - textWidth(who, 11) - SEP) }
}
export const plannedSvg = (W: number, c: Card, gridY = 0) => {
  const L = plannedLayout(W, c)
  return svgDoc(
    W,
    PLAN_H,
    gridY,
    `<g opacity="0.5">${godSvg(c.tier ?? '', 10, 3, 1.25, false)}</g>` +
      text(X0, 18, 13, xml(L.title), ' class="s" font-weight="600"') +
      twoParts(X0, 34, L.who, tierColorOf(c.tier), L.meta, ' opacity="0.7"') +
      `<g class="mark">${statusMark(W - 11, 16, 'pending')}</g>` +
      `<line class="ln" x1="0" y1="${PLAN_H - 0.5}" x2="${W}" y2="${PLAN_H - 0.5}"/>`,
  )
}

// "Agents · flow" (left of the Collapse Button's corner) and three tiles: Cost, Tokens, Time (the session's, from `usage`).
export const headerLayout = (W: number, title: string, use: HorusUsage) => {
  const tw = (W - 12) / 3
  const values = [fmtCost(use.costUsd), fmtTokens(use.tokensTotal), fmtElapsed(use.agentTimeMs)].map(v => fitText(v, 15, tw - 12))
  const rest = title ? fitText(` · ${title}`, 14, W - TOGGLE_W - 8 - textWidth('Agents', 14)) : ''
  return { tw, values, rest }
}
export const headerSvg = (W: number, title: string, use: HorusUsage, gridY = 0) => {
  const L = headerLayout(W, title, use)
  const tile = (i: number, k: string) => {
    const x = Math.round(i * (L.tw + 6))
    return (
      `<rect x="${x + 0.5}" y="34.5" width="${Math.round(L.tw) - 1}" height="40" rx="8" fill="${T.panel}" stroke="${T.goldDim}" stroke-opacity="0.45"/>` +
      text(x + 9, 49, 11, k, ' class="s"') +
      text(x + 9, 68, 15, xml(L.values[i] ?? ''), ` fill="${T.goldBright}" font-weight="600" font-variant-numeric="tabular-nums"`)
    )
  }
  const head = `<tspan fill="${T.gold}">Agents</tspan>${L.rest ? `<tspan class="s">${xml(L.rest)}</tspan>` : ''}`
  return svgDoc(W, HEAD_H, gridY, text(0, 18, 14, head, ' font-weight="600"') + tile(0, 'Cost') + tile(1, 'Tokens') + tile(2, 'Time'))
}

/** A one-line label row of the section ("Running · 2", "No agents yet."). */
export const rowSvg = (W: number, label: string, gridY = 0) => svgDoc(W, ROW_H, gridY, text(0, 16, 12, xml(fitText(label, 12, W)), ' class="s"'))

export const registerPane = (on: On) => {
  // core.ts holds the module's one unmatched session.start (validate refuses a second), so this hook is
  // registered under both values of a matcher key, which together cover every session.
  for (const isInteractive of [true, false] as const) {
    on('session.start', { isInteractive }, async ($, e, next) => {
      // Neither may stop the session: a surface that draws no backdrop or pane answers isDrawn/isPlaced false.
      await setBackdrop($ as unknown as BackdropApi)
      await $.ui.open({ id: PANE, title: 'Gods' }).catch(() => undefined)
      return next(e)
    })
  }

  // Bottom-anchored rail: follow each new log entry.
  on('state.set', { plugin: 'eyes-of-horus', key: 'sessionLog' }, async ($, e, next) => {
    const r = await next(e)
    void $.ui.scroll({ in: PANE, to: 'end' }).catch(() => undefined)
    return r
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if (e.surface !== 'desktop' || e.props.plugin !== 'eyes-of-horus') return next(e)
    const { Svg } = $.ui.resolve(e)
    return <Svg source={BACKDROP_SVG} alt="Obsidian to deep purple gradient with a faint gold Eye of Horus" />
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    if (e.surface !== 'terminal' && e.surface !== 'desktop') return next(e)
    const ui = $.ui.resolve(e)
    const { Box, Text, Button, Client } = ui
    const W = Math.max(20, e.props.bodyColumns)
    const [list, flow, log, use, folded, now] = await Promise.all([
      read($, agents),
      read($, progress),
      read($, sessionLog),
      read($, usage),
      read($, paneCollapsed),
      $.clock.now(),
    ])
    const cards = buildCards(list, flow, now)
    const counts = (s: HorusTaskStatus) => cards.filter(c => c.status === s).length
    const summary = `${counts('running')} run · ${counts('done')} ok · ${counts('failed')} fail`
    const fold = (k: 'session' | 'agents') => update($, paneCollapsed, p => ({ ...p, [k]: !p[k] }))

    const open = (agentId: string) => async () => {
      const r = await $.ui.view({ agentId })
      if (r.deny !== undefined) $.ui.toast(`Gods: cannot open that agent (${r.deny})`)
    }
    // Terminal only: the desktop card draws its clock inside its Svg.
    const elapsed = (c: Card, color: string) =>
      c.status === 'running' && c.ms !== undefined ? (
        <Client key={`clock:${c.key}`} module="./clients/agent-clock.tsx" props={{ ms: c.ms, at: now, color }} />
      ) : (
        <Text dimColor>{elapsedLabel(c)}</Text>
      )
    const agentsToggle = (
      <Button key="agents-toggle" plain dimColor onPress={() => fold('agents')}>
        {folded.agents ? 'Expand' : 'Collapse'}
      </Button>
    )

    // --- Agents, desktop: savvy-flow's panel, a stack of Svgs of known height (header tiles, group heads, one per card)
    // down one dotted grid. The two Buttons sit at offset 0 in the top-right corner their drawing keeps clear, each in a
    // Box hugging the drawing (alignSelf), so that corner is the drawing's own whatever a cell measures in pixels.
    const desktopAgents = () => {
      if (e.surface !== 'desktop' || !('Svg' in ui)) return undefined
      const { Svg } = ui
      const SW = Math.max(240, Math.min(900, W * 8 - 8))
      const { running, finished, planned } = groupCards(cards)
      let y = 0 // each drawing's offset down the section, which phases its patch of the grid
      const at = (h: number) => (y += h) - h
      const header = (
        <Box key="agents-head" flexDirection="column" alignSelf="flex-start">
          <Svg
            source={headerSvg(SW, flow?.title ?? '', use, at(HEAD_H))}
            alt={`Agents: ${fmtCost(use.costUsd)}, ${fmtTokens(use.tokensTotal)} tokens, ${fmtElapsed(use.agentTimeMs)}`}
            width={SW}
            height={HEAD_H}
          />
          <Box position="absolute" top={0} right={0}>
            {agentsToggle}
          </Box>
        </Box>
      )
      const head = (key: string, s: string) => <Svg key={key} source={rowSvg(SW, s, at(ROW_H))} alt={s} width={SW} height={ROW_H} />
      const card = (c: Card) => {
        const agentId = c.agentId
        const state = c.status === 'running' ? 'running' : c.status === 'done' ? 'finished' : 'failed'
        return (
          <Box key={`card:${c.key}`} flexDirection="column" alignSelf="flex-start">
            <Svg source={agentSvg(SW, c, at(CARD_H))} alt={`${c.title || c.type}: ${whoOf(c)}, ${state}, ${elapsedLabel(c)}`} width={SW} height={CARD_H} />
            {agentId !== undefined && (
              <Box position="absolute" top={0} right={0}>
                {/* No `label`: a desktop draws a Button's label as its text, so the ↗ alone is drawn and names it. */}
                <Button key={`agent:${agentId}`} plain onPress={open(agentId)}>
                  <Text color={T.gold}>↗</Text>
                </Button>
              </Box>
            )}
          </Box>
        )
      }
      const body = folded.agents
        ? [head('h-sum', `${summary} · ${planned.length} planned`)]
        : [
            ...(cards.length === 0 ? [head('h-empty', 'No agents yet.')] : []),
            ...(running.length > 0 ? [head('h-run', `Running · ${running.length}`), ...running.map(card)] : []),
            ...(finished.length > 0 ? [head('h-done', `Finished · ${finished.length}`), ...finished.map(card)] : []),
            ...(planned.length > 0
              ? [
                  head('h-plan', `Planned · ${planned.length}`),
                  ...planned.map(c => (
                    <Svg key={`plan:${c.key}`} source={plannedSvg(SW, c, at(PLAN_H))} alt={`${c.title}: ${whoOf(c)}, planned`} width={SW} height={PLAN_H} />
                  )),
                ]
              : []),
          ]
      return (
        <Box key="agents" flexDirection="column">
          {header}
          {body}
        </Box>
      )
    }

    // --- Agents, terminal: text rows with the tier's god glyph.
    const terminalCard = (c: Card) => {
      const indent = '  '.repeat(Math.min(c.depth, 4))
      const room = W - 1 - indent.length - 4 - 8
      const type = trunc(c.tier ?? c.type, Math.min(12, Math.floor(room / 3)))
      const title = trunc(c.title, room - type.length - 1)
      const edge = tierColorOf(c.tier)
      const label = [
        <Text color={edge}>{godGlyph(c.tier ?? '')} </Text>,
        <Text color={STATUS_COLOR[c.status]}>{GLYPH[c.status]} </Text>,
        <Text color={edge}>{type}</Text>,
        <Text color={c.agentId === undefined ? T.dim : T.text}> {title}</Text>,
      ]
      const agentId = c.agentId
      return (
        <Box key={`card:${c.key}`} flexDirection="row" width={W}>
          <Text color={edge}>▌{indent}</Text>
          <Box flexGrow={1} flexDirection="row">
            {agentId === undefined ? (
              label
            ) : (
              <Button key={`agent:${agentId}`} plain onPress={open(agentId)}>
                {label}
              </Button>
            )}
          </Box>
          {elapsed(c, T.aqua)}
        </Box>
      )
    }
    const terminalAgents = () => (
      <Box key="agents" flexDirection="column">
        <Box flexDirection="row" width={W}>
          <Box flexGrow={1}>
            <Text bold color={T.gold}>
              {trunc(`Agents${flow?.title ? ' · ' + flow.title : ''}`, W - 10)}
            </Text>
          </Box>
          {agentsToggle}
        </Box>
        {cards.length === 0 ? (
          <Text dimColor>No agents yet.</Text>
        ) : folded.agents ? (
          <Text dimColor>{trunc(summary, W)}</Text>
        ) : (
          <Box flexDirection="column">
            <Box flexDirection="row">
              {cards.slice(0, Math.max(0, W - summary.length - 1)).map(c => (
                <Text color={STATUS_COLOR[c.status]}>▮</Text>
              ))}
              <Text dimColor> {summary}</Text>
            </Box>
            {cards.map(terminalCard)}
          </Box>
        )}
      </Box>
    )

    // --- Session: a folding header, the one-line stats, and the rail.
    const rail = railWindow(log, Math.max(8, e.props.scroll.bodyRows))
    const chips = trunc(`turns ${use.turns} · agents ${fmtElapsed(use.agentTimeMs)} · ctx ${Math.round(use.contextPct)}%`, W)

    return (
      <Box flexDirection="column" width={W}>
        {desktopAgents() ?? terminalAgents()}
        <Text> </Text>
        <Button key="session-toggle" plain onPress={() => fold('session')}>
          <Text bold color={T.gold}>
            {folded.session ? '▸' : '▾'} Session
          </Text>
        </Button>
        <Text dimColor>{chips}</Text>
        {folded.session ? null : rail.length === 0 ? (
          <Text dimColor>Nothing yet: send a prompt.</Text>
        ) : (
          rail.flatMap((r, i) => {
            const [glyph, color] = KIND[r.kind]
            const node = (
              <Box flexDirection="row">
                <Text color={color}>{glyph} </Text>
                <Text color={T.text}>{trunc(r.label, W - 2)}</Text>
              </Box>
            )
            return i === 0 ? [node] : [<Text color={T.purple}>│</Text>, node]
          })
        )}
      </Box>
    )
  })
}
