import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import type { HorusAgent, HorusLogEntry, HorusLogKind, HorusProgress, HorusTaskStatus, HorusUsage } from '../types'
import { fmtElapsed } from './clients/agent-clock'
import * as core from './core'
import { GOD_H, GOD_TIERS, GOD_W, godGlyph, godName, godSvg, slaveKey } from './gods'
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
const railOffset = atom({ plugin: 'eyes-of-horus', key: 'railOffset' } as const, core.railOffset.initial)

export const PANE_TITLE = 'The Field of Reeds (Aaru)'
export const GODS_LABEL = 'Gods'
export const SLAVES_LABEL = 'Slaves'
export const HALL_LABEL = 'The Hall of Truth:'

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
  steps?: { done: number; total: number; note: string }
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
  fable: 'Opus · max',
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
      ...(a.steps === undefined ? {} : { steps: a.steps }),
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

// --- desktop drawings: every row of the Gods section is one Svg of known pixel height (header, group heads,
// cards), each drawing its own patch of the dotted grid, so nothing is laid over anything but the two Buttons, which
// sit at offset 0 in corners each drawing keeps empty (offset 0 needs no cell-to-pixel guess).

const FONT = "'Segoe UI',-apple-system,BlinkMacSystemFont,sans-serif"
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

// savvy-flow's pixel bar: a rounded track edged in the accent, the filled part a 2 px checker of the accent, a tick at
// each step boundary, a "Tasks d/t" pill riding the fill's end. Running with no step report: a checker block sweeps.
/** How full a card's bar is, 0..1; undefined while running with no step report (indeterminate). */
export const barFill = (c: Pick<Card, 'status' | 'steps'>): number | undefined => {
  if (c.steps && c.steps.total > 0) return Math.min(1, Math.max(0, c.steps.done / c.steps.total))
  if (c.status === 'done' || c.status === 'failed') return 1
  return c.status === 'running' ? undefined : 0
}
export const BAR_H = 14
const pixelBar = (x: number, y: number, w: number, c: Card, color: string) => {
  const fill = barFill(c)
  const ink = c.status === 'failed' ? T.err : color
  const box = `x="${x}" y="${y}" width="${r1(w)}" height="${BAR_H}" rx="4"`
  const defs =
    `<defs><pattern id="px" x="${x}" y="${y}" width="4" height="4" patternUnits="userSpaceOnUse">` +
    `<rect width="2" height="2" fill="${ink}"/><rect x="2" y="2" width="2" height="2" fill="${ink}"/>` +
    `<rect x="2" width="2" height="2" fill="${ink}" opacity=".5"/><rect y="2" width="2" height="2" fill="${ink}" opacity=".5"/></pattern>` +
    `<clipPath id="bc"><rect ${box}/></clipPath></defs>`
  const track = `<rect ${box} fill="${T.panel}" stroke="${ink}" stroke-opacity=".35"/>`
  let body: string
  if (fill === undefined) {
    const seg = Math.round(w * 0.3)
    body =
      `<style>.sheen{animation:eoh-sheen 1.6s linear infinite}@keyframes eoh-sheen{to{transform:translateX(${r1(w + seg)}px)}}</style>` +
      `<g clip-path="url(#bc)"><rect class="sheen" x="${r1(x - seg)}" y="${y}" width="${seg}" height="${BAR_H}" fill="url(#px)"/></g>`
  } else {
    body = fill > 0 ? `<g clip-path="url(#bc)"><rect x="${x}" y="${y}" width="${r1(w * fill)}" height="${BAR_H}" fill="url(#px)"/></g>` : ''
  }
  const total = c.steps?.total ?? 0
  const ticks =
    total > 1 && total <= 40
      ? Array.from({ length: total - 1 }, (_, k) => {
          const tx = r1(x + (w * (k + 1)) / total)
          return `<line x1="${tx}" y1="${y + 2}" x2="${tx}" y2="${y + BAR_H - 2}" stroke="${T.bg}" stroke-opacity=".85"/>`
        }).join('')
      : ''
  let pill = ''
  if (c.steps && c.steps.total > 0) {
    const label = `Tasks ${c.steps.done}/${c.steps.total}`
    const pw = r1(textWidth(label, 9) + 10)
    const px = r1(Math.min(x + w - pw, Math.max(x, x + w * (fill ?? 0) - pw / 2)))
    pill =
      `<rect x="${px}" y="${y + 1}" width="${pw}" height="${BAR_H - 2}" rx="${(BAR_H - 2) / 2}" fill="${ink}"/>` +
      text(r1(px + pw / 2), y + BAR_H - 4, 9, xml(label), ` fill="${T.bg}" font-weight="600" text-anchor="middle"`)
  }
  const pct = fill === undefined ? '' : text(r1(x + w + 6), y + BAR_H - 3, 11, `${Math.round(fill * 100)}%`, ' class="s" font-variant-numeric="tabular-nums"')
  return defs + track + body + ticks + pill + pct
}

/** What a card says for its time: a refused run (failed under a second) or one with no start reads '—'. */
export const elapsedLabel = (c: Card) => (c.ms === undefined || (c.status === 'failed' && c.ms < 1000) ? '—' : fmtElapsed(c.ms))

// A running clock ticks inside its Svg (a Client cannot draw into one): each figure is a column of digits stepped by
// a CSS animation whose negative delay is the elapsed time, and each of fmtElapsed's two formats (mm:ss, h:mm:ss)
// shows in its own time window. A cell is a fixed glyph or [period in s, the glyphs it steps through].
type ClockCell = string | readonly [number, string]
const DIGITS = '0123456789'
const MMSS: ClockCell[] = [[3600, '012345'], [600, DIGITS], ':', [60, '012345'], [10, DIGITS]]
const clockGroups = (s: number): { from: number; to: number; cells: ClockCell[] }[] =>
  [
    { from: 0, to: 3600, cells: MMSS },
    // shortcut: the hour figure is fixed at render time, stale past the next hour until the pane redraws.
    { from: 3600, to: Infinity, cells: [...String(Math.max(1, Math.floor(s / 3600))), ':', ...MMSS] as ClockCell[] },
  ].filter(g => g.to > s)

/** The elapsed time `ms` right-aligned at `xr`, ticking while `running`: its markup and the widest it gets (`w`). */
export const clockSvg = (xr: number, y: number, size: number, c: Pick<Card, 'status' | 'ms'>, color: string = T.aqua) => {
  if (c.status !== 'running' || c.ms === undefined) {
    const label = elapsedLabel(c as Card)
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
      const cw = size * (glyphs === ':' ? 0.36 : 0.6)
      x -= cw
      const cx = r1(x + cw / 2)
      if (typeof cell === 'string') return `<text x="${cx}" y="${y}">${xml(cell)}</text>`
      const [period, steps] = cell
      const col = [...steps].map((ch, k) => `<text x="${cx}" y="${r1(y + k * lh)}">${ch}</text>`).join('')
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
  return { svg: `${css}${clip}<g class="clk" clip-path="url(#ck)" fill="${color}" ${attrs}>${groups.join('')}</g>`, w }
}

const tierColorOf = (tier: string | undefined) => (tier !== undefined && T.tierColor[tier]) || T.dim
/** Slaves share one accent: linen gold, so their bars read apart from the gods' tier colours. */
export const SLAVE_COLOR = '#c9b27c'
const accentOf = (c: Card) => (c.tier === undefined ? SLAVE_COLOR : tierColorOf(c.tier))
/** `savvy-flow:savvy-careful` -> `savvy-careful`, `general-purpose` stays. */
export const shortType = (type: string) => type.split(':').pop() ?? type
const whoOf = (c: Card) => (c.tier === undefined ? `Slave · ${shortType(c.type)}` : `${godName(c.tier)} · ${c.tier}`)
const spriteOf = (c: Card) => (c.tier === undefined ? slaveKey(c.type) : c.tier)

export const CARD_H = 78
const BAR_Y = 45
const PCT_W = 36 // room right of the bar for its percentage

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
  const statsW = textWidth(stats, 11)
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
    barW: Math.max(20, W - 10 - X0 - PCT_W),
    stats: fitText(stats, 11, W - 10 - X0),
    note: fitText(c.steps?.note ?? '', 11, W - 10 - X0 - statsW - 12),
  }
}

const twoParts = (x: number, y: number, who: string, color: string, meta: string, opacity = '') =>
  text(x, y, 11, `<tspan fill="${color}"${opacity}>${xml(who)}</tspan>${meta ? `<tspan class="s" dx="${SEP}">${xml(meta)}</tspan>` : ''}`)

export const agentSvg = (W: number, c: Card, gridY = 0) => {
  const color = accentOf(c)
  const L = cardLayout(W, c)
  return svgDoc(
    W,
    CARD_H,
    gridY,
    godSvg(spriteOf(c), 4, 7, 1.75, c.status === 'running', c.status !== 'running') +
      text(X0, 20, 13, xml(L.title), ' class="t" font-weight="600"') +
      L.clock.svg +
      twoParts(X0, 36, L.who, color, L.meta) +
      pixelBar(X0, BAR_Y, L.barW, c, color) +
      (L.note ? text(X0, 72, 11, xml(L.note), ' class="s"') : '') +
      (L.stats ? text(W - 10, 72, 11, xml(L.stats), ' class="s" text-anchor="end" font-variant-numeric="tabular-nums"') : '') +
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
    `<g opacity="0.5">${godSvg(spriteOf(c), 10, 3, 1.25, false)}</g>` +
      text(X0, 18, 13, xml(L.title), ' class="s" font-weight="600"') +
      twoParts(X0, 34, L.who, tierColorOf(c.tier), L.meta, ' opacity="0.7"') +
      `<g class="mark">${statusMark(W - 11, 16, 'pending')}</g>` +
      `<line class="ln" x1="0" y1="${PLAN_H - 0.5}" x2="${W}" y2="${PLAN_H - 0.5}"/>`,
  )
}

/** The session's clock: wall time since it started, else (an old value without `startedAt`) the main turns' time. */
export const sessionMs = (use: HorusUsage, now: number) => (use.startedAt ? Math.max(0, now - use.startedAt) : use.agentTimeMs)
/** The one-line summary of the collapsed section (the first picture's style). */
export const summaryLine = (cards: readonly Card[], use: HorusUsage) => {
  const n = cards.filter(c => c.agentId !== undefined)
  const run = n.filter(c => c.status === 'running').length
  return `agents ${n.length} · run ${run} · ${fmtCost(use.costUsd)} · ${fmtTokens(use.tokensTotal)}`
}

// "Gods · flow" (left of the Collapse Button's corner). Expanded: three tiles, Cost, Tokens and Time (the session's,
// the Time ticking). Collapsed: one summary line with the ticking time at its right end.
export const HEAD_FOLD_H = 44
export const headerLayout = (W: number, title: string, use: HorusUsage) => {
  const tw = (W - 12) / 3
  const values = [fmtCost(use.costUsd), fmtTokens(use.tokensTotal)].map(v => fitText(v, 15, tw - 12))
  const rest = title ? fitText(` · ${title}`, 14, W - TOGGLE_W - 8 - textWidth(GODS_LABEL, 14)) : ''
  return { tw, values, rest }
}
export const headerSvg = (W: number, title: string, use: HorusUsage, now: number, gridY = 0, folded = false, summary = '') => {
  const L = headerLayout(W, title, use)
  const ms = sessionMs(use, now)
  const ticking = { status: 'running' as const, ms }
  const head = text(0, 18, 14, `<tspan fill="${T.gold}">${GODS_LABEL}</tspan>${L.rest ? `<tspan class="s">${xml(L.rest)}</tspan>` : ''}`, ' font-weight="600"')
  if (folded) {
    const clock = clockSvg(W - 4, 37, 12, ticking, T.goldBright)
    const line = fitText(summary, 12, W - 4 - clock.w - 10)
    return svgDoc(W, HEAD_FOLD_H, gridY, head + text(0, 37, 12, xml(line), ' class="s"') + clock.svg)
  }
  const tile = (i: number, k: string, value: string) => {
    const x = Math.round(i * (L.tw + 6))
    return (
      `<rect x="${x + 0.5}" y="34.5" width="${Math.round(L.tw) - 1}" height="40" rx="8" fill="${T.panel}" stroke="${T.goldDim}" stroke-opacity="0.45"/>` +
      text(x + 9, 49, 11, k, ' class="s"') +
      value
    )
  }
  const valueAt = (i: number, v: string) =>
    text(Math.round(i * (L.tw + 6)) + 9, 68, 15, xml(v), ` fill="${T.goldBright}" font-weight="600" font-variant-numeric="tabular-nums"`)
  const w = clockSvg(0, 68, 15, ticking).w
  const time = clockSvg(Math.round(2 * (L.tw + 6)) + 9 + w, 68, 15, ticking, T.goldBright).svg
  return svgDoc(
    W,
    HEAD_H,
    gridY,
    head + tile(0, 'Cost', valueAt(0, L.values[0] ?? '')) + tile(1, 'Tokens', valueAt(1, L.values[1] ?? '')) + tile(2, 'Time', time),
  )
}

/** A one-line label row of the section ("Running · 2", "No agents yet."); `isTitle` draws it as a gold section name. */
export const rowSvg = (W: number, label: string, gridY = 0, isTitle = false) =>
  svgDoc(
    W,
    ROW_H,
    gridY,
    isTitle
      ? text(0, 17, 14, xml(fitText(label, 14, W)), ` fill="${T.gold}" font-weight="600"`)
      : text(0, 16, 12, xml(fitText(label, 12, W)), ' class="s"'),
  )

// --- the roster: every god tier and every known worker type, waiting (breathing) or running (walking).
// shortcut: the engine lists no agent types, so the workers are the types this setup has (from its agent list) plus
// any other type seen this session; add a name here when a new agent type is installed.
export const SLAVE_TYPES = [
  'general-purpose',
  'Explore',
  'Plan',
  'claude',
  'claude-code-guide',
  'statusline-setup',
  'crab-designer',
  'crab-developer',
  'crab-organizer',
  'crab-project-manager',
]
export type Member = { key: string; name: string; isRunning: boolean; color: string }
export function roster(list: readonly HorusAgent[]): { gods: Member[]; slaves: Member[] } {
  const isRunning = (f: (a: HorusAgent) => boolean) => list.some(a => a.status === 'running' && f(a))
  const gods = GOD_TIERS.map(t => ({ key: t, name: godName(t), isRunning: isRunning(a => tierOf(a.type) === t), color: tierColorOf(t) }))
  const seen = list.map(a => a.type).filter(t => tierOf(t) === undefined)
  const types = [...new Set([...SLAVE_TYPES, ...seen])]
  const slaves = types.map(t => ({ key: slaveKey(t), name: shortType(t), isRunning: isRunning(a => a.type === t), color: SLAVE_COLOR }))
  return { gods, slaves }
}

/** A strip of sprites, wrapping onto more rows when narrow; `small` (the folded view) drops the names. */
export function rosterSvg(W: number, members: readonly Member[], gridY = 0, small = false) {
  const scale = small ? 1 : 1.25
  const cellW = small ? 30 : 60
  const rowH = small ? GOD_H * scale + 4 : GOD_H * scale + 20
  const per = Math.max(1, Math.floor(W / cellW))
  const h = Math.max(1, Math.ceil(members.length / per)) * rowH
  const body = members.map((m, i) => {
    const cx = (i % per) * cellW
    const cy = Math.floor(i / per) * rowH
    const sprite = godSvg(m.key, r1(cx + (cellW - GOD_W * scale) / 2), cy + 2, scale, m.isRunning, false, !m.isRunning)
    if (small) return sprite
    const name = xml(fitText(m.name, 10, cellW - 4))
    return sprite + text(r1(cx + cellW / 2), cy + GOD_H * scale + 14, 10, name, ` text-anchor="middle" fill="${m.isRunning ? m.color : T.dim}"`)
  })
  return { svg: svgDoc(W, h, gridY, body.join('')), h }
}

// The Hall of Truth scrolls itself: a wheel over it moves `railOffset` (entries back from the newest) and the pane's
// own window stays put, so the Gods above it never move. Where it starts is kept from the last draw.
// shortcut: module state, reset by a hot reload until the next draw; a desktop row is taken as ~20 px tall.
const DESKTOP_ROW_PX = 20
const hall = { top: 0, entries: 1, total: 0 }
/** Entries the rail shows in `rows` rows (each entry after the first adds its │ connector). */
export const railEntries = (rows: number) => Math.max(1, Math.floor((rows + 1) / 2))
/** The offset after a wheel move of `by` rows (positive toward the newest), clamped to the log. */
export const scrollOffset = (offset: number, by: number, total: number, entries: number) =>
  Math.max(0, Math.min(Math.max(0, total - entries), offset - Math.round(by)))

// shortcut: whether the pane was placed is module state; a reload asks again at the next turn.
let isOpen = false
async function openPane($: EngineInterface) {
  const r = await $.ui.open({ id: PANE, title: PANE_TITLE }).catch(() => undefined)
  isOpen = r?.isPlaced ?? isOpen
}

export const registerPane = (on: On) => {
  // core.ts holds the module's one unmatched session.start (validate refuses a second), so this hook is
  // registered under both values of a matcher key, which together cover every session.
  for (const isInteractive of [true, false] as const) {
    on('session.start', { isInteractive }, async ($, e, next) => {
      // Neither may stop the session: a surface that draws no backdrop or pane answers isDrawn/isPlaced false.
      await setBackdrop($ as unknown as BackdropApi)
      await openPane($)
      return next(e)
    })
  }

  // The pane opens by itself: a session that started before a surface attached opens it at the first turn.
  on('turn.start', { turnId: /^/ }, async ($, e, next) => {
    if (e.agentId === undefined && !isOpen) await openPane($)
    return next(e)
  })

  // A wheel over the Hall of Truth scrolls it alone; over the Gods (or the scroll keys) the pane moves as usual.
  on('ui.scroll', { requestId: PANE }, async ($, e, next) => {
    if (e.origin.kind === 'plugin' || e.pointer === undefined || e.pointer.row < hall.top) return next(e)
    const off = await read($, railOffset)
    const to = scrollOffset(off, e.by, hall.total, hall.entries)
    if (to !== off) await update($, railOffset, () => to)
    return {}
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
    const [list, flow, log, use, folded, offset, now] = await Promise.all([
      read($, agents),
      read($, progress),
      read($, sessionLog),
      read($, usage),
      read($, paneCollapsed),
      read($, railOffset),
      $.clock.now(),
    ])
    const cards = buildCards(list, flow, now)
    const godCards = cards.filter(c => c.tier !== undefined)
    const slaveCards = cards.filter(c => c.tier === undefined)
    const { gods, slaves } = roster(list)
    const summary = summaryLine(cards, use)
    const fold = (k: 'session' | 'agents') => update($, paneCollapsed, p => ({ ...p, [k]: !p[k] }))

    const open = (agentId: string) => async () => {
      const r = await $.ui.view({ agentId })
      if (r.deny !== undefined) $.ui.toast(`${PANE_TITLE}: cannot open that agent (${r.deny})`)
    }
    const agentsToggle = (
      <Button key="agents-toggle" plain dimColor onPress={() => fold('agents')}>
        {folded.agents ? 'Expand' : 'Collapse'}
      </Button>
    )

    // --- Gods and Slaves, desktop: a stack of Svgs of known height (header, roster strips, group heads, cards) down
    // one dotted grid. The Buttons sit at offset 0 in the top-right corner their drawing keeps clear, each in a Box
    // hugging the drawing (alignSelf), so that corner is the drawing's own whatever a cell measures in pixels.
    const desktopTop = () => {
      if (e.surface !== 'desktop' || !('Svg' in ui)) return undefined
      const { Svg } = ui
      const SW = Math.max(240, Math.min(900, W * 8 - 8))
      let y = 0 // each drawing's offset down the section, which phases its patch of the grid
      const at = (h: number) => (y += h) - h
      const headH = folded.agents ? HEAD_FOLD_H : HEAD_H
      const header = (
        <Box key="agents-head" flexDirection="column" alignSelf="flex-start">
          <Svg
            source={headerSvg(SW, flow?.title ?? '', use, now, at(headH), folded.agents, summary)}
            alt={`${GODS_LABEL}: ${fmtCost(use.costUsd)}, ${fmtTokens(use.tokensTotal)} tokens, ${fmtElapsed(sessionMs(use, now))}`}
            width={SW}
            height={headH}
          />
          <Box position="absolute" top={0} right={0}>
            {agentsToggle}
          </Box>
        </Box>
      )
      const head = (key: string, s: string, isTitle = false) => (
        <Svg key={key} source={rowSvg(SW, s, at(ROW_H), isTitle)} alt={s} width={SW} height={ROW_H} />
      )
      const strip = (key: string, members: readonly Member[], small = false) => {
        const r = rosterSvg(SW, members, y, small)
        at(r.h)
        const alt = members.map(m => `${m.name} ${m.isRunning ? 'running' : 'waiting'}`).join(', ')
        return <Svg key={key} source={r.svg} alt={alt} width={SW} height={r.h} />
      }
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
      const planned = (c: Card) => (
        <Svg key={`plan:${c.key}`} source={plannedSvg(SW, c, at(PLAN_H))} alt={`${c.title}: ${whoOf(c)}, planned`} width={SW} height={PLAN_H} />
      )
      const g = groupCards(godCards)
      const s = groupCards(slaveCards)
      const body = folded.agents
        ? [strip('roster-all', [...gods, ...slaves], true)]
        : [
            strip('roster-gods', gods),
            ...(g.running.length > 0 ? [head('h-run', `Running · ${g.running.length}`), ...g.running.map(card)] : []),
            ...(g.finished.length > 0 ? [head('h-done', `Finished · ${g.finished.length}`), ...g.finished.map(card)] : []),
            ...(g.planned.length > 0 ? [head('h-plan', `Planned · ${g.planned.length}`), ...g.planned.map(planned)] : []),
            head('h-slaves', SLAVES_LABEL, true),
            strip('roster-slaves', slaves),
            ...s.running.map(card),
            ...s.finished.map(card),
          ]
      const rows = Math.ceil(y / DESKTOP_ROW_PX)
      return {
        rows,
        node: (
          <Box key="agents" flexDirection="column">
            {header}
            {body}
          </Box>
        ),
      }
    }

    // --- Gods and Slaves, terminal: one row each, so the section's height is the list's length.
    const terminalTop = () => {
      const elapsed = (c: Card, color: string) =>
        c.status === 'running' && c.ms !== undefined ? (
          <Client key={`clock:${c.key}`} module="./clients/agent-clock.tsx" props={{ ms: c.ms, at: now, color }} />
        ) : (
          <Text dimColor>{elapsedLabel(c)}</Text>
        )
      const terminalCard = (c: Card) => {
        const indent = '  '.repeat(Math.min(c.depth, 4))
        const room = W - 1 - indent.length - 4 - 8
        const type = trunc(c.tier ?? shortType(c.type), Math.min(14, Math.floor(room / 3)))
        const title = trunc(c.title, room - type.length - 1)
        const edge = accentOf(c)
        const label = [
          <Text color={edge}>{c.tier === undefined ? '⚒' : godGlyph(c.tier)} </Text>,
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
      const names = (members: readonly Member[], key: string) => (
        <Box key={key} flexDirection="row" width={W}>
          <Text wrap="truncate-end">
            {members.map(m => (
              <Text color={m.isRunning ? m.color : T.dim} bold={m.isRunning}>
                {`${m.isRunning ? '▸' : '·'}${m.name} `}
              </Text>
            ))}
          </Text>
        </Box>
      )
      const rows = [
        <Box key="agents-head" flexDirection="row" width={W}>
          <Box flexGrow={1}>
            <Text bold color={T.gold}>
              {trunc(`${folded.agents ? '▸' : '▾'} ${GODS_LABEL}${flow?.title ? ' · ' + flow.title : ''}`, W - 10)}
            </Text>
          </Box>
          {agentsToggle}
        </Box>,
        <Box key="agents-sum" flexDirection="row" width={W}>
          <Box flexGrow={1}>
            <Text dimColor wrap="truncate-end">
              {trunc(summary + ' · ', W - 9)}
            </Text>
          </Box>
          <Client key="clock:session" module="./clients/agent-clock.tsx" props={{ ms: sessionMs(use, now), at: now, color: T.goldBright }} />
        </Box>,
        ...(folded.agents
          ? [names([...gods, ...slaves], 'roster-all')]
          : [
              names(gods, 'roster-gods'),
              ...godCards.map(terminalCard),
              <Text key="h-slaves" bold color={T.gold}>
                {SLAVES_LABEL}
              </Text>,
              names(slaves, 'roster-slaves'),
              ...slaveCards.map(terminalCard),
            ]),
      ]
      return {
        rows: rows.length,
        node: (
          <Box key="agents" flexDirection="column">
            {rows}
          </Box>
        ),
      }
    }

    // --- The Hall of Truth: a folding header, the one-line stats, and its own window over the log.
    const top = desktopTop() ?? terminalTop()
    const railTop = top.rows + 3 // the blank row, the header and the stats line
    const entries = railEntries(Math.max(8, e.props.scroll.bodyRows - railTop))
    const off = Math.min(offset, Math.max(0, log.length - entries))
    const rail = log.slice(Math.max(0, log.length - off - entries), log.length - off)
    hall.top = railTop
    hall.entries = entries
    hall.total = log.length
    const older = log.length - off - rail.length
    const chips = trunc(
      `turns ${use.turns} · ${fmtElapsed(sessionMs(use, now))} · ctx ${Math.round(use.contextPct)}%` +
        (older > 0 ? ` · ↑${older} older` : '') +
        (off > 0 ? ` · ↓${off} newer` : ''),
      W,
    )

    return (
      <Box flexDirection="column" width={W}>
        {top.node}
        <Text> </Text>
        <Button key="session-toggle" plain onPress={() => fold('session')}>
          <Text bold color={T.gold}>
            {folded.session ? '▸' : '▾'} {HALL_LABEL}
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
