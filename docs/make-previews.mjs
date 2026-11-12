// Draws the README's demo pictures into docs/img/ from the mod's real drawing code, with made-up sample data.
// Run from the repo root:
//   deno run --config docs/previews.json --sloppy-imports --allow-read --allow-write=docs/img docs/make-previews.mjs
// (the config maps the engine's 'claude-code' module to docs/claude-code-stub.mjs). Not part of the plugin or its tests.
import { GOD_TIERS, godName, POSE_H, POSE_W, poseSvg, slaveKey } from '../hooks/gods.ts'
import { hallLines, headLabel, nowLine, FILTER_LABEL, HALL_FILTERS } from '../hooks/hall.ts'
import { agentFeed } from '../hooks/hall.ts'
import { agentSvg, buildCards, CARD_H, GLYPH, HEAD_H, headerSvg, KIND, ROW_H, rowSvg, SLAVE_COLOR, STATUS_COLOR, tierColorOf, tierOf, shortType, trunc, xml } from '../hooks/pane.tsx'
import { hallSvg, roomSvg, TEMPLE_HEAD_H, templeHeadSvg } from '../hooks/temple.tsx'
import { fmtElapsed } from '../hooks/clients/agent-clock.tsx'
import { advance, frame, H as EYE_H, init, MARGIN, PAD_Y, W as EYE_W } from '../hooks/clients/eye-view.tsx'
import * as T from '../hooks/theme.ts'

const OUT = new URL('./img/', import.meta.url)
await Deno.mkdir(OUT, { recursive: true })
const NOW = 10_000_000
const s = n => n * 1000

// --- composing: each helper returns a whole <svg>; it is nested at (x, y) with its ids suffixed so pieces do not clash.
let uid = 0
const nest = (svg, x, y) => {
  const k = `-${++uid}`
  // keyframes too: in the app each drawing is its own document, here one name (the clock's, sized per drawing) would win
  const names = [...new Set([...svg.matchAll(/@keyframes ([\w-]+)/g)].map(m => m[1]))]
  for (const n of names) svg = svg.replace(new RegExp(`(?<![\\w-])${n}(?![\\w-])`, 'g'), n + k)
  return svg
    .replace(/id="([^"]+)"/g, `id="$1${k}"`)
    .replace(/url\(#([^)]+)\)/g, `url(#$1${k})`)
    .replace(/^<svg /, `<svg x="${x}" y="${y}" `)
}
const doc = (W, H, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
  `<rect width="${W}" height="${H}" rx="10" fill="${T.bg}"/>${body}</svg>\n`
const FONT = "'Segoe UI',-apple-system,BlinkMacSystemFont,sans-serif"
const MONO = "ui-monospace,'Cascadia Mono',Consolas,Menlo,monospace"
const write = async (name, svg) => {
  await Deno.writeTextFile(new URL(name, OUT), svg)
  console.log(`${name}: ${(svg.length / 1024).toFixed(1)} KB`)
}

// --- sample data (all made up)
const agent = (id, type, title, status, startS, endS, extra = {}) => ({
  id, type, title, status, startedAt: NOW - s(startS), ...(endS === undefined ? {} : { endedAt: NOW - s(endS) }), ...extra,
})
const AGENTS = [
  agent('a1', 'savvy-flow:savvy-heavy', 'Refactor the parser', 'running', 83, undefined, { tokens: 41200, steps: { done: 3, total: 5, note: 'Splitting the tokenizer' } }),
  agent('a2', 'Explore', 'Find every caller of parse()', 'running', 31),
  agent('a3', 'savvy-flow:savvy-medium', 'Write tests', 'done', 240, 4, { tokens: 18900, steps: { done: 4, total: 4, note: 'All green' } }),
]
const entry = (id, turn, kind, label, atS, endS, status, agentId) => ({
  id, turn, kind, label, at: NOW - s(atS), ...(endS === undefined ? {} : { endedAt: NOW - s(endS) }), ...(status ? { status } : {}), ...(agentId ? { agentId } : {}),
})
const LOG = [
  entry('p1', 1, 'prompt', 'Add a --strict flag to the CLI', 420),
  entry('t1', 1, 'tool', 'Read src/cli.ts', 418, 417, 'done'),
  entry('t2', 1, 'tool', 'Edit src/cli.ts', 410, 408, 'done'),
  entry('t3', 1, 'tool', 'Run the test suite', 406, 380, 'done'),
  entry('r1', 1, 'reply', 'Added --strict and a test for it.', 378),
  entry('p2', 2, 'prompt', 'Refactor the parser and cover it with tests', 250),
  entry('agent:a3', 2, 'agent', 'Write tests', 240, 4, 'done', 'a3'),
  entry('t4', 2, 'tool', 'Write tests/parser.test.ts', 200, 199, 'done', 'a3'),
  entry('t5', 2, 'tool', 'Run the test suite', 60, 52, 'failed', 'a3'),
  entry('t6', 2, 'tool', 'Run the test suite', 20, 6, 'done', 'a3'),
  entry('agent:a1', 2, 'agent', 'Refactor the parser', 83, undefined, 'running', 'a1'),
  entry('t7', 2, 'tool', 'Read src/parser.ts', 80, 79, 'done', 'a1'),
  entry('t8', 2, 'tool', 'Edit src/parser.ts', 50, 48, 'done', 'a1'),
  entry('t9', 2, 'tool', 'Write src/tokenizer.ts', 30, 28, 'done', 'a1'),
  entry('t10', 2, 'tool', 'Run the type checker', 9, undefined, 'running', 'a1'),
  entry('agent:a2', 2, 'agent', 'Find every caller of parse()', 31, undefined, 'running', 'a2'),
  entry('t11', 2, 'tool', 'Search for parse(', 25, 24, 'done', 'a2'),
]
const USAGE = { contextPct: 38, contextUsed: 76000, contextMax: 200000, tokensTotal: 312000, costUsd: 1.84, agentTimeMs: s(700), turns: 2, startedAt: NOW - s(1325) }
const PROGRESS = {
  title: 'Parser refactor', total: 3, done: 1, phase: 'delegate', finished: false,
  tasks: [
    { title: 'Write tests', tier: 'medium', after: [], status: 'done' },
    { title: 'Refactor the parser', tier: 'heavy', after: [1], status: 'running' },
    { title: 'Update the docs', tier: 'light', after: [2], status: 'pending' },
  ],
}
const TRADES = [['general-purpose', 'hammer'], ['Explore', 'torch'], ['Plan', 'scroll'], ['organizer', 'basket'], ['designer', 'brush']]

// (a) every god and worker trade at work
{
  const scale = 2
  const cw = 132
  const ch = POSE_H * scale + 44
  const W = cw * 5 + 24
  const cell = (key, name, sub, color, i, row) => {
    const x = 12 + i * cw
    const y = 12 + row * ch
    return (
      poseSvg(key, x + (cw - POSE_W * scale) / 2, y + 4, scale, 'work', 11 + i + row * 5) +
      `<text x="${x + cw / 2}" y="${y + POSE_H * scale + 22}" font-family="${FONT}" font-size="13" font-weight="600" fill="${color}" text-anchor="middle">${xml(name)}</text>` +
      `<text x="${x + cw / 2}" y="${y + POSE_H * scale + 37}" font-family="${FONT}" font-size="11" fill="${T.dim}" text-anchor="middle">${xml(sub)}</text>`
    )
  }
  const gods = GOD_TIERS.map((t, i) => cell(t, godName(t), `savvy-${t}`, tierColorOf(t), i, 0))
  const slaves = TRADES.map(([type, tool], i) => cell(slaveKey(type), type, tool, SLAVE_COLOR, i, 1))
  await write('sprites.svg', doc(W, 24 + 2 * ch, gods.join('') + slaves.join('')))
}

// (b) the Temple hall: everyone idle, one agent celebrating
{
  const W = 560
  const cells = [
    ...GOD_TIERS.filter(t => t !== 'medium').map((t, i) => ({ key: t, name: godName(t), color: tierColorOf(t), state: 'idle', seed: 3 + i * 7 })),
    { key: 'medium', name: 'Write tests', color: tierColorOf('medium'), state: 'done', seed: 5 },
    ...TRADES.map(([type], i) => ({ key: slaveKey(type), name: type, color: SLAVE_COLOR, state: 'idle', seed: 41 + i * 13 })),
  ]
  const head = templeHeadSvg(W - 24, '0 working · 11 in the hall')
  const hall = hallSvg(W - 24, cells, TEMPLE_HEAD_H)
  await write('temple-hall.svg', doc(W, 24 + TEMPLE_HEAD_H + hall.h, nest(head, 12, 12) + nest(hall.svg, 12, 12 + TEMPLE_HEAD_H)))
}

// (c) two working agents' chambers
{
  const CW = 300
  const room = (a, tier) => ({
    id: a.id, key: tier ?? slaveKey(a.type), type: a.type, ...(tier ? { tier } : {}), title: a.title, status: a.status,
    ms: NOW - a.startedAt, tokens: a.tokens ?? 0, ...(a.steps ? { steps: a.steps } : {}),
  })
  const r1 = roomSvg(CW, room(AGENTS[0], 'heavy'), agentFeed(LOG, 'a1', 4))
  const r2 = roomSvg(CW, room(AGENTS[1]), agentFeed(LOG, 'a2', 4))
  const H = Math.max(r1.h, r2.h)
  const head = templeHeadSvg(2 * CW + 12, '2 working · 9 in the hall')
  await write(
    'temple-chamber.svg',
    doc(2 * CW + 36, 24 + TEMPLE_HEAD_H + H, nest(head, 12, 12) + nest(r1.svg, 12, 12 + TEMPLE_HEAD_H) + nest(r2.svg, 24 + CW, 12 + TEMPLE_HEAD_H)),
  )
}

// (d) the Gods pane: header, running and finished cards
{
  const W = 420
  const cards = buildCards(AGENTS, PROGRESS, NOW).filter(c => c.agentId !== undefined)
  const running = cards.filter(c => c.status === 'running')
  const finished = cards.filter(c => c.status !== 'running')
  const parts = [
    [headerSvg(W, PROGRESS.title, USAGE, NOW), HEAD_H],
    [rowSvg(W, `Running · ${running.length}`, 0, false), ROW_H],
    ...running.map(c => [agentSvg(W, c), CARD_H]),
    [rowSvg(W, `Finished · ${finished.length}`, 0, false), ROW_H],
    ...finished.map(c => [agentSvg(W, c), CARD_H]),
  ]
  let y = 12
  const body = parts.map(([svg, h]) => {
    // each drawing phases its dot grid by its offset in the section, as the pane does
    const out = nest(svg.replace(/<pattern id="d" y="[^"]*"/, `<pattern id="d" y="${-((y - 12) % 16)}"`), 12, y)
    y += h
    return out
  })
  await write('gods-pane.svg', doc(W + 24, y + 12, body.join('')))
}

// (e) the Hall of Truth: a mock of the pane's text rows, laid out as pane.tsx does, in its colours
{
  const COLS = 64
  const CW = 7.8
  const LH = 19
  const W = Math.round(COLS * CW) + 32
  const tagOf = id => {
    const a = AGENTS.find(x => x.id === id)
    return a ? (tierOf(a.type) ?? shortType(a.type)) : undefined
  }
  const tagColor = id => {
    const t = tierOf(AGENTS.find(x => x.id === id)?.type ?? '')
    return t === undefined ? SLAVE_COLOR : tierColorOf(t)
  }
  const rows = []
  const line = (spans, right, button) => rows.push({ spans, right, button })
  line([['▾ The Hall of Truth:', T.gold, true]])
  const now = nowLine(LOG, 'tool', NOW - s(9), tagOf)
  line([[`${now.text} · ${fmtElapsed(NOW - now.since)}`, T.aqua]], undefined, 'Stop turn')
  line(HALL_FILTERS.flatMap((f, i) => [...(i ? [[' · ', T.dim]] : []), [FILTER_LABEL[f], f === 'all' ? T.gold : T.dim, f === 'all']]))
  line([[`turns ${USAGE.turns} · ${fmtElapsed(NOW - USAGE.startedAt)} · ctx ${USAGE.contextPct}%`, T.dim]])
  for (const l of hallLines(LOG, 'all', [], NOW)) {
    if (l.kind === 'head') {
      line([[headLabel(l), T.gold]], fmtElapsed(l.ms))
      continue
    }
    const x = l.entry
    const [glyph, color] = KIND[x.kind]
    const tag = l.sub && x.agentId ? tagOf(x.agentId) : undefined
    const lead = l.sub ? '  ' : ''
    const status = x.status ? `${GLYPH[x.status]} ` : ''
    const tagText = tag ? `${trunc(tag, 10)} ` : ''
    const stop = x.kind === 'agent' && x.status === 'running'
    const room = COLS - lead.length - 2 - status.length - tagText.length - (l.dur ? l.dur.length + 1 : 0) - (stop ? 6 : 0)
    line(
      [[`${lead}${glyph} `, color], ...(status ? [[status, STATUS_COLOR[x.status]]] : []), ...(tagText ? [[tagText, tagColor(x.agentId)]] : []), [trunc(x.label, room), T.text]],
      l.dur || undefined,
      stop ? 'Stop' : undefined,
    )
  }
  const H = rows.length * LH + 28
  const right = 16 + COLS * CW
  const body = rows.map((r, i) => {
    const y = 20 + i * LH + 12
    const spans = r.spans.map(([t, c, b]) => `<tspan fill="${c}"${b ? ' font-weight="700"' : ''}>${xml(t)}</tspan>`).join('')
    const bw = r.button ? r.button.length * CW + 12 : 0
    const btn = r.button
      ? `<rect x="${right - bw}" y="${y - 13}" width="${bw}" height="17" rx="4" fill="${T.panelHi}" stroke="${T.err}" stroke-opacity=".6"/>` +
        `<text x="${right - bw / 2}" y="${y}" fill="${T.err}" text-anchor="middle">${r.button}</text>`
      : ''
    const dur = r.right ? `<text x="${right - (bw ? bw + 8 : 0)}" y="${y}" fill="${T.dim}" text-anchor="end">${xml(r.right)}</text>` : ''
    return `<text x="16" y="${y}" xml:space="preserve">${spans}</text>${dur}${btn}`
  })
  await write('hall-of-truth.svg', doc(W, H, `<g font-family="${MONO}" font-size="13">${body.join('')}</g>`))
}

// (f) the Eye of Horus: real frames (centre, glances, a blink), shown in turn, centred with the mod's padding
{
  const CW = 7.2
  const LH = 13
  const PADX = MARGIN / 2 + 3
  const W = Math.round((EYE_W + 2 * PADX) * CW)
  const H = (EYE_H + 2 * (PAD_Y + 1)) * LH
  const m = init('idle', () => 0.5)
  m.nextSaccade = m.nextBlink = m.nextSweep = Infinity
  const settle = (gx, gy) => {
    m.gx = gx
    m.gy = gy
    for (let i = 0; i < 40; i++) advance(m, 90, () => 0.5)
    return frame(m)
  }
  const shot = (gx, gy) => settle(gx, gy)
  const blink = k => {
    m.blinkAt = m.t - 90 * k
    return frame(m)
  }
  const centre = shot(0, 0)
  const half = blink(1)
  const shut = blink(2)
  m.blinkAt = -1
  const left = shot(-1, 0)
  const right = shot(1, 1)
  // [frame, seconds shown] over one loop
  const seq = [[centre, 2.2], [half, 0.09], [shut, 0.09], [half, 0.09], [centre, 1.4], [left, 1.6], [centre, 0.8], [right, 1.6]]
  const total = seq.reduce((n, [, d]) => n + d, 0)
  const frames = [...new Set(seq.map(([f]) => f))]
  const pct = n => ((n / total) * 100).toFixed(2)
  let at = 0
  const shows = frames.map(() => [])
  for (const [f, d] of seq) {
    shows[frames.indexOf(f)].push([at, at + d])
    at += d
  }
  const css = frames
    .map((_, i) => {
      const stops = shows[i].flatMap(([a, b]) => [`${pct(a)}%{opacity:1}`, `${pct(b)}%{opacity:0}`]).join('')
      return `.f${i}{opacity:0;animation:eye${i} ${total.toFixed(2)}s step-end infinite}@keyframes eye${i}{0%{opacity:0}${stops}}`
    })
    .join('')
  const y0 = (PAD_Y + 1) * LH
  const body = frames.map((rows, i) => {
    const lines = rows.map((row, r) => {
      const spans = row.map(([t, c]) => `<tspan fill="${c}">${xml(t)}</tspan>`).join('')
      return `<text x="${W / 2}" y="${y0 + r * LH + 10}" text-anchor="middle" textLength="${(EYE_W * CW).toFixed(1)}" lengthAdjust="spacing" xml:space="preserve">${spans}</text>`
    })
    return `<g class="f${i}">${lines.join('')}</g>`
  })
  await write('eye.svg', doc(W, H, `<style>${css}</style><g font-family="${MONO}" font-size="12">${body.join('')}</g>`))
}
