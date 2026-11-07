// Pixel-art Egyptian gods, one per savvy-flow tier: a 24x32 grid emitted as an SVG fragment.
// Every god faces right in the Egyptian striding pose: animal head, broad collar, kilt, a staff
// in the front hand and an ankh (or sistrum) in the back one. Pure strings, no engine imports.
import { aqua, gold, goldBright, goldDim, orbCore, purple, text as linen, violet } from './theme'

export const GOD_TIERS = ['fable', 'heavy', 'careful', 'medium', 'light'] as const
export const GOD_W = 24
export const GOD_H = 32

const NAMES = new Map([['fable', 'Ra'], ['heavy', 'Anubis'], ['careful', 'Horus'], ['medium', 'Thoth'], ['light', 'Bastet']])
export const godName = (tier: string): string => NAMES.get(tier) ?? 'Set'

// Gardiner signs: N5 sun, E17 jackal, G5 falcon, G26a ibis, E13 cat, E20 Set-animal. One code point each;
// terminals count it as one cell (East Asian Width N) but most fonts draw it wider, so follow it with a space.
const GLYPHS = new Map([['fable', '𓇳'], ['heavy', '𓃥'], ['careful', '𓅃'], ['medium', '𓅞'], ['light', '𓃠']])
export const godGlyph = (tier: string): string => GLYPHS.get(tier) ?? '𓃩'

// Sprite palette. Theme colours where they exist; the neutrals (skin, linen shade, obsidian, feathers) are
// sprite pixel data chosen to stand out on the dark panel. H wig, X collar band, M eye marking, B beak.
const OBS = '#2a2438'
const PAL: Record<string, string> = {
  G: gold, Y: goldBright, D: goldDim, P: purple, V: violet, A: aqua, Q: orbCore, W: linen,
  w: '#b8ad94', S: '#c47a48', s: '#8f5230', K: OBS, k: '#5a4d7e', F: '#8a6038', f: '#eadcbc', E: '#120e18',
  H: purple, X: purple, M: '#120e18', B: goldBright,
}

// A part is [group, top row, rows]; rows are 24 columns wide and '.' is transparent. Groups: `la`/`lb` the two
// leg poses, `bd` the body (default), `pr` the prop (rides the body and bobs on its own), `gl` a glint that pulses.
type Part = [cls: string, y: number, rows: string[]]

const LEGS_STRIDE: Part = ['la', 25, [
  '........SS...SS',
  '........SS...SS',
  '.......SS....SS',
  '.......SS.....SS',
  '......SS......SS',
  '......SS.......SS',
  '......SSS......SSSS',
]]
const LEGS_PASS: Part = ['lb', 25, [
  '.........SSSS',
  '.........SSSS',
  '........SS.SS',
  '.......SS..SS',
  '......SS...SS',
  '.....SS....SS',
  '...........SSSS',
]]
const TORSO: Part = ['bd', 13, [
  '..........SS',
  '........GGGGGGG',
  '.......GXXXXXXXG',
  '.....SSGGGGGGGGGSS',
  '.....SS.SSSSSSS.SSS',
  '.....SS.SSSSSSS..SSSS',
  '.....SS..SSSSS.....S.S',
  '.....SS..SSSSS',
  '.....ss.GGGGGGG',
  '........WWWWGWW',
  '........WWWWGWWW',
  '.......WWWWWGWWWW',
  '.......wwwwwGwwwww',
]]
const ANKH: Part = ['pr', 20, [
  '...G',
  '..G.G',
  '...G',
  '..GGG',
  '...G',
  '...G',
  '...G',
]]
const WAS: Part = ['pr', 3, [
  '...................GG',
  '....................G',
  ...Array<string>(23).fill('....................G'),
  '...................G.G',
]]

// Falcon head in the tripartite wig (H), shared by Ra and Horus: cap F, cheek f, eye E, eye marking M, hooked beak B.
const FALCON: Part = ['bd', 5, [
  '.........FFFF',
  '.......HFFFFFF',
  '......HHFFFFFFF',
  '......HHFFFEEFFBB',
  '......HHFFFEEFBBBB',
  '......HHHFfMffBBBB',
  '......HHHffMff..BB',
  '......HHHHffff...B',
  '.......HHHSS',
]]

interface God {
  pal: Record<string, string>
  parts: Part[]
}

const GODS: Record<string, God> = {
  // Ra: gold falcon under a glowing sun disc with the aqua uraeus, purple wig.
  fable: {
    pal: { F: OBS, f: gold, M: OBS, E: goldBright, B: linen },
    parts: [
      ['bd', 0, [
        '.........GGGG',
        '........GYYGGG',
        '.......GYYGGGGG',
        '.......GYGGGGGG',
        '.......GGGGGGGG',
        '........GGGGGG',
      ]],
      FALCON,
      ['gl', 3, ['...............A', '...............AA', '...............A']],
      WAS,
      ANKH,
    ],
  },
  // Anubis: slender obsidian jackal, tall ears lined in gold, long snout, gold eye, wig striped gold.
  heavy: {
    pal: { X: OBS },
    parts: [
      ['bd', 0, [
        '.........K..K',
        '.........KG.KG',
        '.........KG.KG',
        '........KKGKKG',
        '........KKKKKK',
        '........KKKKKKk',
        '.......KKKKYKKKk',
        '......KKKKKKKKKKkkk',
        '......KKKKKKKKKKKKKk',
        '......KKKKKKKKKkk',
        '......KKKKKKKK',
        '......KKKKKKK',
        '......KKKKKK',
        '.......KKKSS',
      ]],
      ['gl', 6, ['...........Y']],
      WAS,
      ANKH,
    ],
  },
  // Horus: brown falcon with the aqua eye marking under the pschent (white hedjet rising from a purple deshret).
  careful: {
    pal: { H: OBS, X: aqua, M: aqua },
    parts: [
      FALCON,
      ['bd', 0, [
        '.......P..WW',
        '.......P.WWWW',
        '.......P.WWWW.Y',
        '.......PPWWWW.Y',
        '.......PPPWWPPY',
        '.......PPPPPPPP',
        '.......PPPPPPP',
      ]],
      WAS,
      ANKH,
    ],
  },
  // Thoth: obsidian ibis with a long curved beak, an aqua crescent moon cradling a pale disc.
  medium: {
    pal: { X: aqua, H: OBS },
    parts: [
      ['gl', 0, [
        '..........QQ',
        '.......A.QQQQ.A',
        '.......AAQQQQAA',
        '........AAQQAA',
        '.........AAAA',
      ]],
      ['bd', 5, [
        '.........KKKK',
        '........KKKKKK',
        '.......HKKKKYKk',
        '......HHKKKKKKKff',
        '......HHKKKKKKK.ff',
        '......HHHKKKKK...ff',
        '......HHHKKKK.....f',
        '......HHHHKK......f',
        '.......HHHSS',
      ]],
      WAS,
      ANKH,
    ],
  },
  // Bastet: sand cat with pointed ears, gold earring, aqua eyes and an aqua sheath dress; slim, holds a sistrum.
  light: {
    pal: { X: aqua, C: '#e2c48e', c: '#a8834e' },
    parts: [
      ['bd', 2, [
        '........C...C',
        '........CC.CCC',
        '........CcCCcCC',
        '.......CCCCCCCC',
        '.......CCCCCACC',
        '.......CCCCCCCCC',
        '.......cCCCCCCCcc',
        '.......cCCCCCCC',
        '........CCCCCC',
        '.........GCSS',
        '.........G',
      ]],
      ['bd', 21, [
        '........AAAAAAA',
        '........AAAAAAA',
        '........AAAAAAA_',
        '......._AAAAAAA__',
        '......._AAAAAAA___',
        '........AAAAAAA',
        '.......AAAAAAAAA',
      ]],
      ['pr', 9, [
        '...................GGG',
        '...................G.G',
        '...................GGG',
        '....................G',
        '....................G',
        '....................G',
        '....................G',
        '....................G',
        '....................G',
        '....................G',
      ]],
    ],
  },
}

// Set, the generic fallback: purple Set-animal with square-topped ears and a curved snout.
const SET: God = {
  pal: {},
  parts: [
    ['bd', 0, [
      '.........VV.VV',
      '..........V..V',
      '..........V..V',
      '.........VVVVV',
      '........VVVVVVV',
      '.......VVVVVVVVV',
      '.......VVVVVEVVVVV',
      '.......VVVVVVVVVVVV',
      '.......VVVVVVVV...V',
      '.......VVVVVVV',
      '........VVVVV',
      '..........VVS',
    ]],
    WAS,
    ANKH,
  ],
}

// --- Slaves: every non-god agent type is an Egyptian worker in a khat headcloth, a leather strap for the gold
// collar, and the tool of its trade. The headcloth colour is the type's own (hashed), the tool comes from its name.
const SLAVE_CLOTH = ['#c9b27c', '#2dd4bf', '#b794f6', '#f0a24b', '#5fd68a', '#e5586b', '#7aa2f7', '#e2c48e']
const SLAVE_HEAD: Part = ['bd', 4, [
  '.........CCCC',
  '........CCCCCC',
  '.......CcCCCCCC',
  '.......CCSSSSSS',
  '.......CcSSSESS',
  '.......CCSSSSSSS',
  '.......CcSSSSSS',
  '........CSSSSs',
  '.........SSSS',
]]
const TOOLS: Record<string, Part> = {
  hammer: ['pr', 10, [
    '...................KKK',
    '...................KKK',
    ...Array<string>(8).fill('....................F'),
  ]],
  scroll: ['pr', 15, ['...................fff', '...................fFf', '...................fff', '...................fFf', '...................fff']],
  basket: ['pr', 1, ['........FFFFFFF', '.......FfFfFfFF', '........FFFFFF']],
  torch: ['gl', 7, ['....................Y', '...................YQY', '...................GYG', '....................G']],
  brush: ['pr', 9, ['....................P', ...Array<string>(10).fill('....................F')]],
}
// Torch handle: the flame (`gl`) pulses on its own, the handle rides the body.
const TORCH_HANDLE: Part = ['pr', 11, Array<string>(9).fill('....................F')]
const toolOf = (type: string): string =>
  /explore/i.test(type) ? 'torch' : /plan|manager|guide/i.test(type) ? 'scroll' : /organi[sz]/i.test(type) ? 'basket' : /design/i.test(type) ? 'brush' : 'hammer'
const hash = (s: string) => [...s].reduce((h, ch) => (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0, 7)

/** The worker sprite for a non-god agent type. */
const slaveOf = (type: string): God => {
  const cloth = SLAVE_CLOTH[hash(type) % SLAVE_CLOTH.length] ?? linen
  const tool = toolOf(type)
  return {
    pal: { C: cloth, c: OBS, G: '#7a5a34', X: '#7a5a34' },
    parts: [SLAVE_HEAD, ...(tool === 'torch' ? [TORCH_HANDLE] : []), TOOLS[tool] as Part],
  }
}
/** The key `godSvg` draws a non-god agent type's worker by. */
export const slaveKey = (type: string) => `slave:${type}`

// Finished/planned gods keep their shapes and lose their colour: each fill becomes a cool grey of its luma.
const greyOf = (hex: string): string => {
  const n = parseInt(hex.slice(1), 16)
  const l = 0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)
  const v = Math.round(36 + l * 0.42)
  return `#${[v, v, v + 10].map(c => Math.min(255, c).toString(16).padStart(2, '0')).join('')}`
}

// One <path> per colour per group: runs of equal pixels in a row, stacked with the same run in the rows below,
// each become one `M x y h w v h h-w z` box (this keeps a god under 3 KB).
const paths = (pixels: Map<number, string>, isDim: boolean): string => {
  const boxes = new Map<string, [x: number, y: number, w: number, h: number]>()
  const done: [string, number, number, number, number][] = []
  for (let y = 0; y < GOD_H; y++) {
    for (let x = 0; x < GOD_W; ) {
      const c = pixels.get(y * GOD_W + x)
      let w = 1
      while (c && x + w < GOD_W && pixels.get(y * GOD_W + x + w) === c) w++
      const key = `${c}|${x}|${w}`
      const box = boxes.get(key)
      if (c && box && box[1] + box[3] === y) box[3]++
      else if (c) {
        if (box) done.push([c, ...box])
        boxes.set(key, [x, y, w, 1])
      }
      x += w
    }
  }
  for (const [key, box] of boxes) done.push([key.split('|')[0] as string, ...box])
  const byColour = new Map<string, string>()
  for (const [c, x, y, w, h] of done) byColour.set(c, `${byColour.get(c) ?? ''}M${x} ${y}h${w}v${h}h-${w}z`)
  return [...byColour].map(([c, d]) => `<path fill="${isDim ? greyOf(c) : c}" d="${d}"/>`).join('')
}

// Periods divide one second so a once-a-second redraw restarts them in phase. Legs swap between the stride and
// the passing pose; the body rises on the passing step and the prop lifts with it; glints pulse.
// The passing pose is drawn with opacity 0, so without animation (reduced motion) the god just stands in the stride.
const WALK_CSS = `<style>
.eoh-walk .eoh-god-la,.eoh-walk .eoh-god-lb{animation:eoh-god-step .5s steps(1) infinite}.eoh-walk .eoh-god-lb{animation-delay:-.25s}
.eoh-walk .eoh-god-bd,.eoh-walk .eoh-god-pr{animation:eoh-god-bob .5s steps(1) infinite}.eoh-walk .eoh-god-gl{animation:eoh-god-glow 1s ease-in-out infinite}
@keyframes eoh-god-step{0%{opacity:1}50%{opacity:0}}@keyframes eoh-god-bob{50%{transform:translateY(-1px)}}@keyframes eoh-god-glow{50%{opacity:.45}}
@media (prefers-reduced-motion:reduce){.eoh-walk *{animation:none!important}}
</style>`
// Waiting: the body breathes (a 1 px rise every 2 s), the prop sways with it, glints pulse slowly.
const IDLE_CSS = `<style>
.eoh-idle .eoh-god-bd,.eoh-idle .eoh-god-pr{animation:eoh-god-breathe 2s steps(1) infinite}.eoh-idle .eoh-god-gl{animation:eoh-god-glow 2s ease-in-out infinite}
@keyframes eoh-god-breathe{50%{transform:translateY(-1px)}}@keyframes eoh-god-glow{50%{opacity:.45}}
@media (prefers-reduced-motion:reduce){.eoh-idle *{animation:none!important}}
</style>`

const num = (v: number, fallback: number): number => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : fallback)

/**
 * SVG fragment (no <svg> wrapper) for the tier's god. The god's box is GOD_W x GOD_H grid units, its top-left corner at
 * (x, y) and each unit `scale` px, so it covers x .. x + GOD_W * scale and y .. y + GOD_H * scale. `isWalking` adds the
 * second leg pose and the scoped animation; `isDim` greys every fill (finished/planned). Unknown tiers draw Set.
 */
export const godSvg = (tier: string, x: number, y: number, scale: number, isWalking: boolean, isDim = false, isIdle = false): string => {
  const god = Object.hasOwn(GODS, tier) ? (GODS[tier] as God) : tier.startsWith('slave:') ? slaveOf(tier.slice(6)) : SET
  const pal = { ...PAL, ...god.pal }
  const groups = new Map<string, Map<number, string>>()
  const parts = [isWalking ? LEGS_PASS : null, LEGS_STRIDE, TORSO, ...god.parts]
  for (const part of parts) {
    if (!part) continue
    const [cls, top, rows] = part
    if (!groups.has(cls)) groups.set(cls, new Map())
    const px = groups.get(cls) as Map<number, string>
    rows.forEach((row, dy) =>
      [...row].forEach((ch, dx) => {
        const at = (top + dy) * GOD_W + dx
        if (ch === '_') px.delete(at) // a costume erases the part it replaces (Bastet's dress over the kilt)
        else if (pal[ch] && dx < GOD_W && top + dy < GOD_H) px.set(at, pal[ch])
      }),
    )
  }
  const group = (cls: string, inner = '', extra = ''): string => {
    const px = groups.get(cls)
    return px || inner ? `<g class="eoh-god-${cls}"${extra}>${px ? paths(px, isDim) : ''}${inner}</g>` : ''
  }
  const legs = group('la') + (isWalking ? group('lb', '', ' opacity="0"') : '')
  const body = group('bd', group('pr') + group('gl'))
  const motion = isWalking ? ' eoh-walk' : isIdle ? ' eoh-idle' : ''
  return `<g transform="translate(${num(x, 0)},${num(y, 0)}) scale(${num(scale, 1)})" shape-rendering="crispEdges">${isWalking ? WALK_CSS : isIdle ? IDLE_CSS : ''}<g class="eoh-god${motion}">${legs}${body}</g></g>`
}
