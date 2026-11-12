// The Temple: a second pane. Idle gods and workers stand together in the hall; each working agent has its own
// chamber (an animated figure, its progress and the list of what it is doing); a focused chamber fills the pane.
// It opens only when the person asks: the ↗ on a Gods card (pane.tsx) or `/temple`.
import { atom, read, update } from 'claude-code'
import type { On } from 'claude-code'

import type { HorusAgent, HorusAgentStatus } from '../types'
import { fmtElapsed } from './clients/agent-clock'
import * as core from './core'
import { godGlyph, godSvg, POSE_H, POSE_W, poseSvg, slaveKey } from './gods'
import { agentFeed, focusChamber, templeModel } from './hall'
import type { FeedItem } from './hall'
import { setMotion } from './motion'
import {
  BAR_H,
  barFill,
  clockSvg,
  DESKTOP_ROW_PX,
  elapsedLabel,
  fitText,
  fmtTokens,
  GLYPH,
  OPEN_W,
  PCT_W,
  pixelBar,
  r1,
  ROW_H,
  roster,
  rowSvg,
  shortType,
  SLAVE_COLOR,
  STATUS_COLOR,
  statusMark,
  svgDoc,
  svgWidth,
  text,
  textWidth,
  tierColorOf,
  tierOf,
  whoOf,
  xml,
} from './pane'
import { stopControls } from './stop'
import * as T from './theme'

const TEMPLE = 'horus-temple'
export const TEMPLE_TITLE = 'The Temple'
export const HALL_LABEL = 'The Hall'
/** How long a finished agent celebrates in the hall before it stands idle again. */
export const CELEBRATE_MS = 6000
/** At this many columns or fewer the overview draws the chambers above the hall while anyone works. */
export const NARROW_COLS = 40
export const GONE_TEXT = 'That agent has left the Temple.'

// validate refuses `read` of an atom made in another file (its scan needs the literal ref here), so the
// refs are restated; initial values and shape tags still come from core's atoms, the one place they live.
const agents = atom({ plugin: 'eyes-of-horus', key: 'agents' } as const, core.agents.initial, { shape: core.agents.shape! })
const progress = atom({ plugin: 'eyes-of-horus', key: 'progress' } as const, core.progress.initial, { shape: core.progress.shape! })
const sessionLog = atom({ plugin: 'eyes-of-horus', key: 'sessionLog' } as const, core.sessionLog.initial, { shape: core.sessionLog.shape! })
const armedStop = atom({ plugin: 'eyes-of-horus', key: 'armedStop' } as const, core.armedStop.initial)
const chamber = atom({ plugin: 'eyes-of-horus', key: 'chamber' } as const, core.chamber.initial)
const motion = atom({ plugin: 'eyes-of-horus', key: 'motion' } as const, core.motion.initial)

/** One agent as its chamber shows it: `key` picks the sprite, `tier` the colour and the `who` line. */
export type Room = {
  id: string
  key: string
  type: string
  tier?: string
  title: string
  status: HorusAgentStatus
  ms: number
  tokens: number
  steps?: { done: number; total: number; note: string }
  /** The agent's final answer (core.ts reportOf), shown once it has ended. */
  report?: string
}
export type Feed = { items: FeedItem[]; older: number }

const accentOf = (tier: string | undefined) => (tier === undefined ? SLAVE_COLOR : tierColorOf(tier))
const cells = (s: string) => [...s].reduce((n, ch) => n + cellWidth(ch), 0)

/**
 * A figure's animation seed from an agent id: stable across redraws (a changing seed restarts the animation) and
 * spread over 1..997 so neighbouring chambers do not move in lockstep. FNV-1a, 32 bits.
 */
export const idSeed = (id: string) => {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0
  return (h % 997) + 1
}

/** `s` word-wrapped into at most `max` lines no wider than `w` by `width`; the last ends in '…' when text is left over. */
export function wrapLines(s: string, w: number, max: number, width: (t: string) => number, cut: (t: string, w: number) => string): string[] {
  const words = s.split(' ').filter(Boolean)
  const lines: string[] = []
  let i = 0
  while (i < words.length && lines.length < max) {
    let line = words[i++]!
    while (i < words.length && width(`${line} ${words[i]}`) <= w) line += ` ${words[i++]}`
    lines.push(width(line) > w ? cut(line, w) : line)
  }
  if (i < words.length && lines.length > 0) {
    let last = lines.at(-1)!
    while (last !== '' && width(last + '…') > w) last = [...last].slice(0, -1).join('') // whole code points
    lines[lines.length - 1] = last.trimEnd() + '…'
  }
  return lines
}
/** Lines of an ended agent's report a focus view shows; none while it runs or without one. */
export const REPORT_LINES = 4
const reportText = (room: Room) => (room.status !== 'running' && room.report ? room.report : '')

// --- desktop drawings. As in the Gods pane, every row is one Svg of known pixel height.

const COL = 10 // a column's width
const INSET = COL + 6 // text and figures start this far inside a drawing's edge
const CSS =
  '<style>.fl{transform-box:fill-box;transform-origin:50% 100%;animation:eoh-fl .5s ease-in-out infinite}' +
  '@keyframes eoh-fl{50%{transform:scale(.82,1.14)}}@keyframes eoh-in{from{opacity:0}}</style>'

// A stone band: slabs with a joint every 28 px, its top edge in the accent.
const slabs = (x: number, y: number, w: number, h: number, color: string) =>
  `<rect x="${x}" y="${y}" width="${r1(w)}" height="${h}" fill="${T.panelHi}"/>` +
  `<path d="M${x} ${y + h / 2}H${r1(x + w)}" stroke="${T.bg}" stroke-width="${h}" stroke-dasharray="1 27"/>` +
  `<path d="M${x} ${y + 0.5}H${r1(x + w)}" stroke="${color}" stroke-opacity=".8"/>`
// Two columns down the drawing's sides from `y` to `y + h`, each with a capital.
const columns = (W: number, y: number, h: number, color: string) =>
  [0, W - COL]
    .map(
      (x, i) =>
        `<rect x="${x + 0.5}" y="${y}" width="${COL - 1}" height="${r1(h)}" fill="${T.panelHi}" stroke="${color}" stroke-opacity=".45"/>` +
        `<path d="M${x + COL / 2} ${y + 6}V${r1(y + h - 2)}" stroke="${color}" stroke-opacity=".25"/>` +
        `<rect x="${i === 0 ? 0 : W - COL - 3}" y="${y}" width="${COL + 3}" height="4" fill="${color}" opacity=".75"/>`,
    )
    .join('')

export const TEMPLE_HEAD_H = 28
/** "The Temple" and what follows it (the counts, or the focused agent's name). */
export const templeHeadSvg = (W: number, rest: string, gridY = 0) => {
  const cut = fitText(` · ${rest}`, 12, W - textWidth(TEMPLE_TITLE, 14) - 4)
  return svgDoc(W, TEMPLE_HEAD_H, gridY, text(0, 19, 14, `<tspan fill="${T.gold}" font-weight="600">${TEMPLE_TITLE}</tspan><tspan class="s" font-size="12">${xml(cut)}</tspan>`))
}

// The hall: a frieze over two columns, and rows of figures, each row standing on its own stone floor.
/** `seed`: the figure's animation phase (0 none), so members do not breathe or celebrate in lockstep. */
export type HallCell = { key: string; name: string; color: string; state: 'idle' | 'done' | 'failed'; seed?: number }
export const HALL_SCALE = 1.25
export const HALL_CELL = 64 // an idle member's cell
export const HALL_WIDE = 128 // a finished agent's: its title needs the room
const HALL_CELEBRANTS = 6 // shortcut: more than this finishing within CELEBRATE_MS are not all drawn (the Svg's size limit)
const FRIEZE_H = 18
const HALL_TOP = FRIEZE_H + 6
const HALL_BOX_H = POSE_H * HALL_SCALE
const HALL_FLOOR_H = 6
const HALL_ROW = HALL_BOX_H + HALL_FLOOR_H + 29 // the figure, its floor, two lines of name
/** A hall name in a slot `w` px wide: one line, else broken after a hyphen or at a space, the second line cut to fit. */
export const hallName = (name: string, w: number): [string, string] => {
  if (textWidth(name, 10) <= w) return [name, '']
  let cut = 0
  for (let i = 1; i < name.length; i++) if ((name[i - 1] === '-' || name[i] === ' ') && textWidth(name.slice(0, i), 10) <= w) cut = i
  return cut === 0 ? [fitText(name, 10, w), ''] : [name.slice(0, cut), fitText(name.slice(cut).trimStart(), 10, w)]
}
/** Where each hall cell goes at width W: left to right, wrapping, each row centred between the columns. */
export function hallLayout(W: number, widths: readonly number[]) {
  const room = W - 2 * INSET
  const placed: { x: number; y: number; w: number; row: number }[] = []
  let x = 0
  let row = 0
  for (const w0 of widths) {
    const w = Math.min(w0, room)
    if (x > 0 && x + w > room) {
      row++
      x = 0
    }
    placed.push({ x, y: HALL_TOP + row * HALL_ROW, w, row })
    x += w
  }
  const ends = new Map<number, number>()
  for (const c of placed) ends.set(c.row, c.x + c.w)
  const out = placed.map(c => ({ ...c, x: r1(INSET + c.x + (room - (ends.get(c.row) ?? 0)) / 2) }))
  const rows = row + 1
  return { cells: out, rows, H: HALL_TOP + rows * HALL_ROW }
}

export function hallSvg(W: number, members: readonly HallCell[], gridY = 0) {
  const L = hallLayout(W, members.map(m => (m.state === 'idle' ? HALL_CELL : HALL_WIDE)))
  const frieze =
    `<defs><pattern id="fr" width="24" height="${FRIEZE_H}" patternUnits="userSpaceOnUse">` +
    `<path d="M3 14L9 4l6 10z" fill="${T.gold}" opacity=".85"/><path d="M20 5l3 4-3 4-3-4z" fill="${T.purple}"/></pattern></defs>` +
    `<rect width="${W}" height="${FRIEZE_H}" fill="${T.panelHi}"/><rect width="${W}" height="${FRIEZE_H}" fill="url(#fr)"/>` +
    `<path d="M0 1H${W}" stroke="${T.gold}" stroke-width="2"/><path d="M0 ${FRIEZE_H - 0.5}H${W}" stroke="${T.goldDim}"/>`
  const wall = `<rect x="${COL}" y="${FRIEZE_H}" width="${W - 2 * COL}" height="${L.H - FRIEZE_H}" fill="${T.purpleDim}" opacity=".22"/>`
  const floors = Array.from({ length: L.rows }, (_, r) => slabs(COL, HALL_TOP + r * HALL_ROW + HALL_BOX_H, W - 2 * COL, HALL_FLOOR_H, T.goldDim)).join('')
  const figures = members.map((m, i) => {
    const c = L.cells[i]!
    const mid = r1(c.x + c.w / 2)
    const bx = r1(mid - 20 * HALL_SCALE) // the sprite's own middle column is 20 of the pose box's 44
    const figure =
      m.state === 'failed'
        ? godSvg(m.key, bx + 8 * HALL_SCALE, c.y + 8 * HALL_SCALE, HALL_SCALE, false, true) + statusMark(r1(mid + 20), c.y + 14, 'failed')
        : poseSvg(m.key, bx, c.y, HALL_SCALE, m.state === 'done' ? 'done' : 'idle', m.seed ?? 0)
    const fill = m.state === 'done' ? ` fill="${T.goldBright}"` : m.state === 'failed' ? ' class="s"' : ` fill="${m.color}" opacity=".8"`
    const nameY = c.y + HALL_BOX_H + HALL_FLOOR_H + 13
    return figure + hallName(m.name, c.w - 6).map((s, k) => (s ? text(mid, nameY + k * 11, 10, xml(s), ` text-anchor="middle"${fill}`) : '')).join('')
  })
  const empty = members.length === 0 ? text(W / 2, HALL_TOP + 30, 11, 'The hall stands empty: everyone is at work.', ' class="s" text-anchor="middle"') : ''
  return { svg: svgDoc(W, L.H, gridY, CSS + frieze + wall + columns(W, FRIEZE_H, L.H - FRIEZE_H, T.goldDim) + floors + figures.join('') + empty), h: L.H }
}

// A chamber: a title strip (the ↗ Button lies over its right `corner`), then a framed room. Its upper register holds
// the figure on a ground line between two braziers; the lower one who it is, its bar and note, and what it is doing.
export const CH_MAX_W = 520
export const CH_SCALE = 2.5
const TITLE_H = 24
const LINTEL_H = 10
const FLOOR_H = 8
const BASE_H = 6
export const FEED_ROW = 16
/** The pixels of a chamber that are not feed rows, for a figure `scale` (with a step note). */
const REPORT_ROW = 14
const roomFixedH = (scale: number) => TITLE_H + LINTEL_H + 4 + POSE_H * scale + FLOOR_H + 17 + 8 + BAR_H + 14 + 8 + 6 + BASE_H
/** The figure's scale in the focus view, by the drawing's width. */
export const focusScale = (W: number) => (W >= 420 ? 4.5 : W >= 320 ? 4 : 3)

/** Where each part of a chamber goes at width W: every text is cut to its own slot. */
export function roomLayout(W: number, room: Room, feed: Feed, scale = CH_SCALE, corner = OPEN_W) {
  const boxW = POSE_W * scale
  // An ended agent's report: a "Report" line and a few wrapped lines under the title strip, above the lintel.
  const report = wrapLines(reportText(room), W - 4, REPORT_LINES, t => textWidth(t, 11), (t, w) => fitText(t, 11, w))
  const reportH = report.length > 0 ? (report.length + 1) * REPORT_ROW + 4 : 0
  const lintelY = TITLE_H + reportH
  const top = lintelY + LINTEL_H
  const poseX = r1((W - boxW) / 2)
  const poseY = top + 4
  const groundY = poseY + POSE_H * scale
  const inL = INSET
  const inR = W - INSET
  const markX = W - corner - 9
  const clockR = markX - 12
  const clock = clockSvg(clockR, 17, 12, room)
  const titleR = clockR - clock.w - 8
  const stats = room.tokens > 0 ? `${fmtTokens(room.tokens)} tokens` : ''
  const statsW = textWidth(stats, 11)
  const whoY = groundY + FLOOR_H + 17
  const barY = whoY + 8
  const note = fitText(room.steps?.note ?? '', 11, inR - inL)
  const noteY = barY + BAR_H + 14
  const feedTop = (note ? noteY : barY + BAR_H) + 8
  const lead = feed.older > 0 ? 1 : 0
  const rows = feed.items.map((it, i) => ({
    y: feedTop + (lead + i) * FEED_ROW + 12,
    label: fitText(it.label, 11, inR - inL - 16 - textWidth(it.dur, 11) - (it.dur ? 8 : 0)),
    item: it,
  }))
  return {
    boxW,
    report,
    lintelY,
    top,
    poseX,
    poseY,
    groundY,
    inL,
    inR,
    markX,
    clockR,
    clock,
    titleR,
    title: fitText(room.title || shortType(room.type), 13, titleR - 2),
    whoY,
    who: fitText(whoOf(room), 11, inR - inL - statsW - (stats ? 10 : 0)),
    stats,
    barY,
    barW: Math.max(20, inR - inL - PCT_W),
    note,
    noteY,
    feedTop,
    rows,
    H: feedTop + (lead + Math.max(1, rows.length)) * FEED_ROW + 6 + BASE_H,
  }
}

// A bronze bowl on a tripod, its flame flickering; drawn about the point its feet stand on.
const brazier = (cx: number, groundY: number, k: number) =>
  `<g transform="translate(${r1(cx)},${r1(groundY)}) scale(${r1(k)})">` +
  `<path d="M-6 0L-2 -14M6 0L2 -14M0 0V-14" stroke="${T.goldDim}" stroke-width="1.5" fill="none"/>` +
  `<path d="M-8 -18H8L5 -13H-5Z" fill="${T.goldDim}" stroke="${T.gold}" stroke-width=".8"/>` +
  `<path class="fl" d="M0 -18C-6 -23 -3 -29 0 -35C3 -29 6 -23 0 -18Z" fill="${T.warn}"/>` +
  `<path class="fl" style="animation-delay:-.25s" d="M0 -18C-3 -21 -1.5 -25 0 -28C1.5 -25 3 -21 0 -18Z" fill="${T.goldBright}"/></g>`

export function roomSvg(W: number, room: Room, feed: Feed, scale = CH_SCALE, corner = OPEN_W, gridY = 0) {
  const color = accentOf(room.tier)
  const L = roomLayout(W, room, feed, scale, corner)
  const k = scale / CH_SCALE
  const mid = W / 2
  const lintelY = L.lintelY
  const frame =
    `<rect x="${COL}" y="${L.top}" width="${W - 2 * COL}" height="${r1(L.groundY - L.top)}" fill="${T.purpleDim}" opacity=".22"/>` +
    `<rect x="${COL}" y="${r1(L.groundY + FLOOR_H)}" width="${W - 2 * COL}" height="${r1(L.H - BASE_H - L.groundY - FLOOR_H)}" fill="${T.panel}" opacity=".7"/>` +
    `<ellipse cx="${mid}" cy="${r1(L.groundY - L.boxW * 0.42)}" rx="${r1(L.boxW * 0.46)}" ry="${r1(L.boxW * 0.44)}" fill="${color}" opacity=".07"/>` +
    columns(W, L.top, L.H - BASE_H - L.top, color) +
    // The lintel, notched, a winged sun disc at its middle.
    `<rect y="${lintelY}" width="${W}" height="${LINTEL_H}" rx="1" fill="${color}"/>` +
    `<path d="M0 ${lintelY + LINTEL_H / 2}H${W}" stroke="${T.bg}" stroke-width="2" stroke-dasharray="2 10" opacity=".45"/>` +
    `<path d="M${mid - 5} ${lintelY + 2}L${mid - 28} ${lintelY + 4}L${mid - 5} ${lintelY + 8}ZM${mid + 5} ${lintelY + 2}L${mid + 28} ${lintelY + 4}L${mid + 5} ${lintelY + 8}Z" fill="${T.bg}" opacity=".7"/>` +
    `<circle cx="${mid}" cy="${lintelY + LINTEL_H / 2}" r="4" fill="${T.gold}" stroke="${T.bg}"/>` +
    slabs(COL, L.groundY, W - 2 * COL, FLOOR_H, color) +
    `<rect x="0.5" y="${r1(L.H - BASE_H)}" width="${W - 1}" height="${BASE_H - 0.5}" fill="${T.panelHi}" stroke="${color}" stroke-opacity=".45"/>`
  const fires = [L.poseX - 20 * k, L.poseX + L.boxW + 20 * k].filter(cx => cx - 10 * k >= COL + 2).map(cx => brazier(cx, L.groundY, k)).join('')
  // Running: the work motion; finished: the celebration; failed: the figure stands grey.
  const figure =
    room.status === 'failed'
      ? godSvg(room.key, L.poseX + 8 * scale, L.poseY + 8 * scale, scale, false, true)
      : poseSvg(room.key, L.poseX, L.poseY, scale, room.status === 'running' ? 'work' : 'done', idSeed(room.id))
  const feedRows =
    L.rows.length === 0
      ? text(L.inL, L.feedTop + (feed.older > 0 ? FEED_ROW : 0) + 12, 11, 'No actions yet.', ' class="s"')
      : L.rows
          .map(
            r =>
              (r.item.running ? `<rect x="${COL + 2}" y="${r.y - 12}" width="${W - 2 * COL - 4}" height="${FEED_ROW}" rx="3" fill="${color}" opacity=".14"/>` : '') +
              `<g class="mark">${statusMark(L.inL + 5, r.y - 4, r.item.status)}</g>` +
              text(L.inL + 16, r.y, 11, xml(r.label), r.item.running ? ' class="t" font-weight="600"' : ' class="s"') +
              (r.item.dur ? text(L.inR, r.y, 11, xml(r.item.dur), ' class="s" text-anchor="end" font-variant-numeric="tabular-nums"') : ''),
          )
          .join('')
  const earlier = feed.older > 0 ? text(L.inL, L.feedTop + 12, 11, `+${feed.older} earlier`, ' class="s"') : ''
  const reportBlock =
    L.report.length === 0
      ? ''
      : text(2, TITLE_H + 11, 11, 'Report', ` fill="${color}" font-weight="600"`) +
        L.report.map((s, i) => text(2, TITLE_H + 11 + (i + 1) * REPORT_ROW, 11, xml(s), ' class="t"')).join('')
  const body =
    text(2, 17, 13, xml(L.title), ' class="t" font-weight="600"') +
    reportBlock +
    L.clock.svg +
    `<g class="mark">${statusMark(L.markX, 13, room.status)}</g>` +
    frame +
    fires +
    figure +
    text(L.inL, L.whoY, 11, xml(L.who), ` fill="${color}"`) +
    (L.stats ? text(L.inR, L.whoY, 11, xml(L.stats), ' class="s" text-anchor="end" font-variant-numeric="tabular-nums"') : '') +
    pixelBar(L.inL, L.barY, L.barW, room, color) +
    (L.note ? text(L.inL, L.noteY, 11, xml(L.note), ' class="s"') : '') +
    earlier +
    feedRows
  // A chamber that just opened fades in; the negative delay keeps a redraw from replaying it.
  const isNew = room.status === 'running' && room.ms < 600
  const drawn = isNew ? `<g class="arr" style="animation:eoh-in .6s ease-out ${-r1(room.ms / 1000)}s both">${body}</g>` : body
  return { svg: svgDoc(W, L.H, gridY, CSS + drawn), h: L.H, report: L.report.join(' ') }
}

// --- terminal: bordered text rooms, measured and cut in terminal cells.
// shortcut: wide ranges and emoji by table, not the full Unicode width data; widen it if a title still shifts a border.
const WIDE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{20000}-\u{2fffd}\u{30000}-\u{3fffd}]|\p{Emoji_Presentation}/u
const ZERO = /[\p{Mn}\p{Me}​-‏︀-️]/u
/** One code point's terminal cells: East Asian Wide/Fullwidth and emoji 2, combining marks and joiners 0, else 1. */
export const cellWidth = (ch: string) => (ZERO.test(ch) ? 0 : WIDE.test(ch) ? 2 : 1)
/** `s` cut to at most `n` cells, '…' (one cell) marking a cut. */
export const cutCells = (s: string, n: number) => {
  if (n <= 0) return ''
  if (cells(s) <= n) return s
  let out = ''
  let used = 0
  for (const ch of s) {
    const w = cellWidth(ch)
    if (used + w > n - 1) break
    out += ch
    used += w
  }
  return out + '…'
}

/** `tokens` packed into lines no wider than `width` cells, a space between neighbours; a longer token is cut. */
export function wrapCells<X extends { text: string }>(tokens: readonly X[], width: number): X[][] {
  const lines: X[][] = []
  let used = 0
  for (const t0 of tokens) {
    const t = cells(t0.text) > width ? { ...t0, text: cutCells(t0.text, width) } : t0
    const n = cells(t.text)
    const last = lines.at(-1)
    if (last !== undefined && used + 1 + n <= width) {
      last.push(t)
      used += 1 + n
    } else {
      lines.push([t])
      used = n
    }
  }
  return lines
}

/** A `width`-cell progress bar as its filled and empty cell counts; nothing filled while indeterminate. */
export const termBar = (room: Pick<Room, 'status' | 'steps'>, width: number) => {
  const fill = barFill(room)
  const on = fill === undefined ? 0 : Math.round(width * fill)
  return { on, off: width - on }
}

export const registerTemple = (on: On) => {
  // core.ts holds the module's one unmatched session.start (validate refuses a second), so this hook is registered
  // under both values of a matcher key. It only adds the command: the Temple never opens by itself.
  for (const isInteractive of [true, false] as const) {
    on('session.start', { isInteractive }, async ($, e, next) => {
      const started = await next(e)
      await $.command.register({ name: 'temple', description: 'Open the Temple: the hall of idle gods and a chamber for each working agent' }).catch(() => undefined)
      return started
    })
  }

  // The person's own command, so the pane is placed at any width.
  on('command.run', { command: 'temple' }, async $ => {
    // A focus left on an agent the session no longer lists would open on the "has left" notice: start at the overview.
    const [list, focusId] = await Promise.all([read($, agents), read($, chamber)])
    if (focusId !== '' && !list.some(a => a.id === focusId)) await update($, chamber, () => '')
    const r = await $.ui
      .open({ id: TEMPLE, title: TEMPLE_TITLE })
      .catch((err: unknown) => ({ isPlaced: false as const, reason: err instanceof Error ? err.message : String(err) }))
    return { text: r.isPlaced ? `${TEMPLE_TITLE} is open.` : `${TEMPLE_TITLE} is not shown: ${r.reason}` }
  })

  // Render hooks re-run on state changes only: an agent's end starts its celebration (core, outermost, has already
  // written it), and this redraw ends it. Matched like the eye's hook: core holds the unmatched one.
  on('turn.complete', { turnId: /^/ }, async ($, e, next) => {
    if (e.agentId !== undefined) $.clock.after(CELEBRATE_MS + 50, () => $.ui.invalidate('ui.render'))
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: TEMPLE }, async ($, e, next) => {
    if (e.surface !== 'terminal' && e.surface !== 'desktop') return next(e)
    const ui = $.ui.resolve(e)
    const { Box, Text, Button, Client } = ui
    const W = Math.max(20, e.props.bodyColumns)
    const [list, flow, log, focusId, armed, moving, now] = await Promise.all([
      read($, agents),
      read($, progress),
      read($, sessionLog),
      read($, chamber),
      read($, armedStop),
      read($, motion),
      $.clock.now(),
    ])
    setMotion(moving) // before any drawing is built
    const { gods, slaves } = roster(list)
    const members = [...gods, ...slaves]
    const model = templeModel({ agents: list, progress: flow, members, tierOf, now, celebrateMs: CELEBRATE_MS })
    const working = model.chambers.length + model.more
    const counts = `${working} working · ${model.hall.idle.length} idle`
    // Narrow, the hall alone fills the first screen: working agents come first, the hall below them.
    const chambersFirst = W <= NARROW_COLS && working > 0
    const rooms: Room[] = model.chambers.map(c => ({ ...c, status: 'running', ms: Math.max(0, now - c.startedAt) }))
    // The focused agent, running or finished; its tier is its savvy-flow task's, else its type's (as templeModel).
    const roomOf = (a: HorusAgent): Room => {
      const tier = flow?.tasks.findLast(t => t.title === a.title)?.tier ?? tierOf(a.type)
      return {
        id: a.id,
        key: tierOf(a.type) ?? slaveKey(a.type),
        type: a.type,
        ...(tier === undefined ? {} : { tier }),
        title: a.title,
        status: a.status,
        ms: Math.max(0, (a.endedAt ?? now) - a.startedAt),
        tokens: a.tokens ?? 0,
        ...(a.steps === undefined ? {} : { steps: a.steps }),
        ...(a.report === undefined ? {} : { report: a.report }),
      }
    }
    const focused = focusId === '' ? undefined : list.find(a => a.id === focusId)
    // The desktop's drawing element; without it (the terminal) everything is text.
    const Svg = e.surface === 'desktop' && 'Svg' in ui ? ui.Svg : undefined
    const SW = svgWidth(W)
    const nameOf = (r: Room) => r.title || shortType(r.type)
    const stateOf = (r: Room) => (r.status === 'running' ? 'working' : r.status === 'done' ? 'finished' : 'failed')

    const { stopButton, stopAgent } = stopControls($, ui, armed, TEMPLE_TITLE)
    const focus = (agentId: string) => () => update($, chamber, cur => focusChamber(cur, agentId))
    const transcript = (agentId: string) => async () => {
      const r = await $.ui.view({ agentId })
      if (r.deny !== undefined) $.ui.toast(`${TEMPLE_TITLE}: cannot open that agent (${r.deny})`)
    }
    // The focus view's controls, a plain row above the drawing: Back, Transcript, and Stop while the agent runs.
    // No Transcript on desktop: the desktop session draws no main view, so `$.ui.view` can only refuse there.
    const controls = (a?: HorusAgent) => (
      <Box key="temple-controls" flexDirection="row">
        <Button key="temple-back" plain onPress={() => update($, chamber, () => '')}>
          <Text color={T.gold}>Back</Text>
        </Button>
        {a === undefined || e.surface === 'desktop'
          ? null
          : [
              <Text key="sep:transcript" dimColor>
                {' · '}
              </Text>,
              <Button key="temple-transcript" plain onPress={transcript(a.id)}>
                <Text color={T.gold}>Transcript</Text>
              </Button>,
            ]}
        {a?.status === 'running'
          ? [
              <Text key="sep:stop" dimColor>
                {' · '}
              </Text>,
              stopButton(`agent:${a.id}`, 'Stop', stopAgent(a.id)),
            ]
          : null}
      </Box>
    )
    const header = (rest: string) =>
      Svg ? (
        <Svg key="temple-head" source={templeHeadSvg(SW, rest)} alt={`${TEMPLE_TITLE}: ${rest}`} width={SW} height={TEMPLE_HEAD_H} />
      ) : (
        <Box key="temple-head" flexDirection="row" width={W}>
          <Text wrap="truncate-end">
            <Text bold color={T.gold}>
              {TEMPLE_TITLE}
            </Text>
            <Text dimColor>{cutCells(` · ${rest}`, Math.max(0, W - cells(TEMPLE_TITLE)))}</Text>
          </Text>
        </Box>
      )

    // --- terminal rooms: a box per chamber, its title the Button that focuses it (or, focused, lets go of it).
    const IW = W - 4
    type Part = [text: string, color?: string, bold?: boolean]
    const line = (key: string, edge: string, parts: Part[], right = '') => {
      const used = parts.reduce((n, p) => n + cells(p[0]), 0) + cells(right)
      return (
        <Box key={key} flexDirection="row">
          <Text color={edge}>│ </Text>
          {parts.map(([s, color, bold]) => (
            <Text color={color ?? T.dim} bold={bold === true}>
              {s}
            </Text>
          ))}
          <Text dimColor>{' '.repeat(Math.max(0, IW - used)) + right}</Text>
          <Text color={edge}> │</Text>
        </Box>
      )
    }
    const bottom = (key: string, edge: string) => (
      <Text key={key} color={edge}>
        {`└${'─'.repeat(W - 2)}┘`}
      </Text>
    )
    const termRoom = (r: Room, feed: Feed) => {
      const edge = accentOf(r.tier)
      const head = `${r.tier === undefined ? '⚒' : godGlyph(r.tier)} ${cutCells(nameOf(r), Math.max(1, W - 8))}`
      const who = cutCells(whoOf(r) + (r.tokens > 0 ? ` · ${fmtTokens(r.tokens)} tok` : ''), Math.max(1, IW - 2 - 8))
      const bw = Math.max(6, Math.min(24, IW - 14))
      const bar = termBar(r, bw)
      const said = r.steps && r.steps.total > 0 ? `${r.steps.done}/${r.steps.total} ${r.steps.note}`.trim() : stateOf(r)
      const report = wrapLines(reportText(r), IW, REPORT_LINES, cells, cutCells)
      return (
        <Box key={`room:${r.id}`} flexDirection="column" width={W}>
          <Box flexDirection="row">
            <Text color={edge}>┌ </Text>
            <Button key={`chamber:${r.id}`} plain onPress={focus(r.id)}>
              <Text color={T.text} bold>
                {head}
              </Text>
            </Button>
            <Text color={edge}>{` ${'─'.repeat(Math.max(0, W - 4 - cells(head)))}┐`}</Text>
          </Box>
          {report.length > 0 ? line(`report:${r.id}`, edge, [['Report', edge, true]]) : null}
          {report.map((s, i) => line(`report:${r.id}:${i}`, edge, [[s, T.text]]))}
          <Box flexDirection="row" width={W}>
            <Text color={edge}>│ </Text>
            <Text color={STATUS_COLOR[r.status]}>{GLYPH[r.status]} </Text>
            <Box flexGrow={1}>
              <Text color={edge}>{who}</Text>
            </Box>
            {r.status === 'running' ? (
              <Client key={`clock:${r.id}`} module="./clients/agent-clock.tsx" props={{ ms: r.ms, at: now, color: T.aqua }} />
            ) : (
              <Text dimColor>{elapsedLabel(r)}</Text>
            )}
            <Text color={edge}> │</Text>
          </Box>
          {line(`bar:${r.id}`, edge, [
            ['━'.repeat(bar.on), r.status === 'failed' ? T.err : edge],
            ['─'.repeat(bar.off)],
            [` ${cutCells(said, Math.max(0, IW - bw - 1))}`],
          ])}
          {feed.older > 0 ? line(`earlier:${r.id}`, edge, [[`+${feed.older} earlier`]]) : null}
          {feed.items.length === 0
            ? line(`feed:${r.id}:none`, edge, [['no actions yet']])
            : feed.items.map((it, i) =>
                line(
                  `feed:${r.id}:${i}`,
                  edge,
                  [
                    [`${GLYPH[it.status]} `, STATUS_COLOR[it.status]],
                    [cutCells(it.label, Math.max(1, IW - 2 - (it.dur ? cells(it.dur) + 1 : 0))), it.running ? T.text : T.dim, it.running],
                  ],
                  it.dur,
                ),
              )}
          {bottom(`floor:${r.id}`, edge)}
        </Box>
      )
    }

    // --- focus: one agent's chamber, large, with as much of its feed as the pane's height shows.
    if (focusId !== '') {
      if (focused === undefined) {
        // The session no longer lists that agent: say so; Back (or the next /temple) lets the stale focus go.
        return (
          <Box flexDirection="column" width={W}>
            {header('an empty chamber')}
            <Text key="temple-gone" dimColor>
              {GONE_TEXT}
            </Text>
            {controls()}
          </Box>
        )
      }
      const room = roomOf(focused)
      const scale = focusScale(SW)
      const fit = Svg
        ? Math.floor((e.props.scroll.bodyRows * DESKTOP_ROW_PX - TEMPLE_HEAD_H - DESKTOP_ROW_PX - roomFixedH(scale) - (reportText(room) ? (REPORT_LINES + 1) * REPORT_ROW + 4 : 0)) / FEED_ROW)
        : e.props.scroll.bodyRows - 8 - (reportText(room) ? REPORT_LINES + 1 : 0)
      const feed = agentFeed(log, room.id, Math.max(5, Math.min(30, fit)))
      const head = header(`${whoOf(room)} · ${stateOf(room)}`)
      if (!Svg) {
        return (
          <Box flexDirection="column" width={W}>
            {head}
            {controls(focused)}
            {termRoom(room, feed)}
          </Box>
        )
      }
      const drawn = roomSvg(SW, room, feed, scale, 0, TEMPLE_HEAD_H)
      const doing = feed.items.filter(i => i.running).map(i => i.label)
      return (
        <Box flexDirection="column" width={W}>
          {head}
          {controls(focused)}
          <Svg
            key={`room:${room.id}`}
            source={drawn.svg}
            alt={`${nameOf(room)}: ${whoOf(room)}, ${stateOf(room)}, ${elapsedLabel(room)}${doing.length > 0 ? `; doing ${doing.join(', ')}` : ''}${drawn.report ? `; report: ${drawn.report}` : ''}`}
            width={SW}
            height={drawn.h}
          />
        </Box>
      )
    }

    // --- overview, terminal: the hall as a box of names, then a box per chamber.
    if (!Svg) {
      const done = new Map(model.hall.celebrating.map(c => [c.key, c.failed] as const))
      const tokens = members.map(m => {
        const failed = done.get(m.key)
        const mark = failed === true ? '✗' : failed === false ? '✦' : m.isRunning ? '▸' : '·'
        return { text: `${mark}${m.name}`, color: failed === false ? T.goldBright : m.isRunning ? m.color : T.dim, bold: m.isRunning || failed === false }
      })
      const hallBox = [
        <Text key="hall-top" color={T.gold}>{`┌ ${HALL_LABEL} ${'─'.repeat(Math.max(0, W - 4 - cells(HALL_LABEL)))}┐`}</Text>,
        ...wrapCells(tokens, IW).map((row, i) =>
          line(
            `hall:${i}`,
            T.gold,
            row.flatMap((t, j): Part[] => [...(j > 0 ? ([[' ']] as Part[]) : []), [t.text, t.color, t.bold]]),
          ),
        ),
        bottom('hall-floor', T.gold),
      ]
      const chamberBoxes = [
        ...rooms.map(r => termRoom(r, agentFeed(log, r.id, 4))),
        model.more > 0 ? (
          <Text key="more" dimColor>
            +{model.more} more working
          </Text>
        ) : null,
      ]
      return (
        <Box flexDirection="column" width={W}>
          {header(counts)}
          {chambersFirst ? [...chamberBoxes, ...hallBox] : [...hallBox, ...chamberBoxes]}
        </Box>
      )
    }

    // --- overview, desktop: a stack of Svgs of known height down one dotted grid. A chamber's ↗ Button sits at offset
    // 0 in the top-right corner its drawing keeps clear, in a Box hugging the drawing (as the Gods cards' does).
    let y = 0
    const at = (h: number) => (y += h) - h
    const head = header(counts)
    at(TEMPLE_HEAD_H)
    const hallCells: HallCell[] = [
      ...model.hall.celebrating.slice(0, HALL_CELEBRANTS).map(c => ({
        key: c.key,
        name: c.title || shortType(c.type),
        color: accentOf(c.tier),
        state: c.failed ? ('failed' as const) : ('done' as const),
        seed: idSeed(c.id),
      })),
      ...model.hall.idle.map(m => ({ key: m.key, name: m.name, color: m.color, state: 'idle' as const, seed: members.indexOf(m) + 1 })),
    ]
    // Each drawing takes its grid offset as it is built, so the nodes are built in the order they are drawn.
    const hallNode = () => {
      const hall = hallSvg(SW, hallCells, y)
      at(hall.h)
      return <Svg key="hall" source={hall.svg} alt={hallAlt} width={SW} height={hall.h} />
    }
    const hallAlt = `${HALL_LABEL}: ${hallCells.map(c => `${c.name} ${c.state === 'idle' ? 'idle' : c.state === 'done' ? 'celebrating' : 'failed'}`).join(', ') || 'empty'}`
    const CW = Math.min(SW, CH_MAX_W)
    const chamberNode = (r: Room) => {
      const feed = agentFeed(log, r.id, 5)
      const drawn = roomSvg(CW, r, feed, CH_SCALE, OPEN_W, y)
      at(drawn.h)
      const doing = feed.items.filter(i => i.running).map(i => i.label)
      return (
        <Box key={`room:${r.id}`} flexDirection="column" alignSelf="flex-start">
          <Svg
            source={drawn.svg}
            alt={`${nameOf(r)}: ${whoOf(r)}, working, ${fmtElapsed(r.ms)}${doing.length > 0 ? `; doing ${doing.join(', ')}` : ''}`}
            width={CW}
            height={drawn.h}
          />
          <Box position="absolute" top={0} right={0}>
            {/* No `label`: a desktop draws a Button's label as its text, so the ↗ alone is drawn and names it. */}
            <Button key={`chamber:${r.id}`} plain onPress={focus(r.id)}>
              <Text color={T.gold}>↗</Text>
            </Button>
          </Box>
        </Box>
      )
    }
    const label = (key: string, s: string) => <Svg key={key} source={rowSvg(SW, s, at(ROW_H))} alt={s} width={SW} height={ROW_H} />
    const chamberNodes = () => [
      rooms.length > 0 ? label('h-chambers', `Chambers · ${working}`) : null,
      ...rooms.map(chamberNode),
      model.more > 0 ? label('more', `+${model.more} more working`) : null,
    ]
    const body = chambersFirst ? [...chamberNodes(), hallNode()] : [hallNode(), ...chamberNodes()]
    return (
      <Box flexDirection="column" width={W}>
        {head}
        {body}
      </Box>
    )
  })
}
