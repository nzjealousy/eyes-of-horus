// Pixel-art Egyptian gods, one per savvy-flow tier: a 24x32 grid emitted as an SVG fragment.
// Every god faces right in the Egyptian striding pose: animal head, broad collar, kilt, a staff
// in the front hand and an ankh (or sistrum) in the back one. Pure strings, no engine imports.
import { aqua, err, gold, goldBright, goldDim, ok, orbCore, purple, text as linen, violet } from './theme'

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
// R (heart, fruit) and L (leaves) only appear in the work poses.
const OBS = '#2a2438'
const PAL: Record<string, string> = {
  G: gold, Y: goldBright, D: goldDim, P: purple, V: violet, A: aqua, Q: orbCore, W: linen,
  w: '#b8ad94', S: '#c47a48', s: '#8f5230', K: OBS, k: '#5a4d7e', F: '#8a6038', f: '#eadcbc', E: '#120e18',
  H: purple, X: purple, M: '#120e18', B: goldBright, R: err, L: ok,
}

// A part is [group, top row, rows, left column]; rows are 24 columns wide and '.' is transparent. Groups: `la`/`lb`
// the two leg poses, `bd` the body (default), `pr` the prop (rides the body and bobs on its own), `gl` a glint that
// pulses. The left column (default 0) and a negative top only matter to the poses, whose box is wider than the sprite.
type Part = [cls: string, y: number, rows: string[], x?: number]

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

// `lid` covers the eye in the face's own colour: a seeded idle god blinks with it.
interface God {
  pal: Record<string, string>
  parts: Part[]
  lid: Part
}
const FALCON_LID: Part = ['bk', 8, ['FF', 'FF'], 11]

// Ra's sun disc and its uraeus, and Bastet's sistrum: the work poses move them on their own.
const RA_DISC: Part = ['bd', 0, [
  '.........GGGG',
  '........GYYGGG',
  '.......GYYGGGGG',
  '.......GYGGGGGG',
  '.......GGGGGGGG',
  '........GGGGGG',
]]
const RA_URAEUS: Part = ['gl', 3, ['...............A', '...............AA', '...............A']]
const BASTET_SISTRUM: Part = ['pr', 9, [
  '...................GGG',
  '...................G.G',
  '...................GGG',
  ...Array<string>(7).fill('....................G'),
]]

const GODS: Record<string, God> = {
  // Ra: gold falcon under a glowing sun disc with the aqua uraeus, purple wig.
  fable: {
    pal: { F: OBS, f: gold, M: OBS, E: goldBright, B: linen },
    parts: [RA_DISC, FALCON, RA_URAEUS, WAS, ANKH],
    lid: FALCON_LID,
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
    lid: ['bk', 6, ['K'], 11],
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
    lid: FALCON_LID,
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
    lid: ['bk', 7, ['K'], 12],
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
      BASTET_SISTRUM,
    ],
    lid: ['bk', 6, ['C'], 12],
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
  lid: ['bk', 6, ['V'], 12],
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
    lid: ['bk', 8, ['S'], 12],
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

// Each group's pixels, keyed y * cols + x in a cols x rowsN grid whose (0, 0) is sprite cell (-ox, -oy); a group
// paints in the order it first appears. '_' erases what the group drew there before (Bastet's dress over the kilt).
const pixelsOf = (parts: (Part | null)[], pal: Record<string, string>, cols: number, rowsN: number, ox = 0, oy = 0) => {
  const groups = new Map<string, Map<number, string>>()
  for (const part of parts) {
    if (!part) continue
    const [cls, top, rows, left = 0] = part
    if (!groups.has(cls)) groups.set(cls, new Map())
    const px = groups.get(cls) as Map<number, string>
    rows.forEach((row, dy) =>
      [...row].forEach((ch, dx) => {
        const gx = ox + left + dx
        const gy = oy + top + dy
        if (gx < 0 || gx >= cols || gy < 0 || gy >= rowsN) return
        if (ch === '_') px.delete(gy * cols + gx)
        else if (pal[ch]) px.set(gy * cols + gx, pal[ch])
      }),
    )
  }
  return groups
}

// One <path> per colour per group: runs of equal pixels in a row, stacked with the same run in the rows below,
// each become one `M x y h w v h h-w z` box (this keeps a god under 3 KB).
const paths = (pixels: Map<number, string>, isDim: boolean, cols = GOD_W, rowsN = GOD_H): string => {
  const boxes = new Map<string, [x: number, y: number, w: number, h: number]>()
  const done: [string, number, number, number, number][] = []
  for (let y = 0; y < rowsN; y++) {
    for (let x = 0; x < cols; ) {
      const c = pixels.get(y * cols + x)
      let w = 1
      while (c && x + w < cols && pixels.get(y * cols + x + w) === c) w++
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

// --- Seeds: a hall of agents drawn from the same strings moves in lockstep, so a caller may pass each agent a seed.
// It is folded to 0..999; 0 (also the default and any non-finite seed) is the unseeded drawing, byte for byte.
const seedOf = (seed: number): number => (Number.isFinite(seed) ? Math.abs(Math.round(seed)) % 1000 : 0)
/** Where in a loop of `period` s seed `n` starts; golden-ratio steps spread neighbouring seeds far apart. */
const phase = (n: number, period: number, step = 0.618034): number => num(((n * step) % 1) * period, 0)
// Every animation in `css` starts `d` s into its loop, so the groups of one figure stay in step with each other.
// It relies on each animation ending `<timing function> [delay] infinite`, as all of them here do.
const shift = (css: string, d: number): string =>
  css
    .replace(/( -?[\d.]+s)? infinite/g, (_, t = '0') => ` ${num(parseFloat(t) - d, 0)}s infinite`)
    .replace(/animation-delay:(-?[\d.]+)s/g, (_, t) => `animation-delay:${num(Number(t) - d, 0)}s`)
// A seeded idle god breathes from its own phase under its own scope class, and every 4 to 8 s (by seed) it blinks:
// the lid (drawn hidden, so reduced motion keeps the eye open) shows for 4% of that period.
const idleCss = (n: number): string => {
  if (!n) return IDLE_CSS
  const scope = `eoh-idle-s${n}`
  const every = 4 + (n % 5)
  const blink = `.${scope} .eoh-god-bk{animation:${scope}-k ${every}s steps(1) ${-phase(n, every, 0.754878)}s infinite}@keyframes ${scope}-k{0%{opacity:1}4%{opacity:0}}`
  return shift(IDLE_CSS, phase(n, 2)).replaceAll('eoh-idle', scope).replace('@media', `${blink}\n@media`)
}

/**
 * SVG fragment (no <svg> wrapper) for the tier's god. The god's box is GOD_W x GOD_H grid units, its top-left corner at
 * (x, y) and each unit `scale` px, so it covers x .. x + GOD_W * scale and y .. y + GOD_H * scale. `isWalking` adds the
 * second leg pose and the scoped animation; `isDim` greys every fill (finished/planned). Unknown tiers draw Set.
 * A non-zero `seed` gives an idle god its own breathing phase and an occasional blink (see `idleCss`).
 */
const godOf = (key: string): God =>
  Object.hasOwn(GODS, key) ? (GODS[key] as God) : key.startsWith('slave:') ? slaveOf(key.slice(6)) : SET

export const godSvg = (tier: string, x: number, y: number, scale: number, isWalking: boolean, isDim = false, isIdle = false, seed = 0): string => {
  const god = godOf(tier)
  const n = isIdle && !isWalking ? seedOf(seed) : 0
  const groups = pixelsOf([isWalking ? LEGS_PASS : null, LEGS_STRIDE, TORSO, ...god.parts, n ? god.lid : null], { ...PAL, ...god.pal }, GOD_W, GOD_H)
  const group = (cls: string, inner = '', extra = ''): string => {
    const px = groups.get(cls)
    return px || inner ? `<g class="eoh-god-${cls}"${extra}>${px ? paths(px, isDim) : ''}${inner}</g>` : ''
  }
  const legs = group('la') + (isWalking ? group('lb', '', ' opacity="0"') : '')
  const body = group('bd', group('pr') + group('gl') + group('bk', '', ' opacity="0"'))
  const motion = isWalking ? ' eoh-walk' : isIdle ? (n ? ` eoh-idle-s${n}` : ' eoh-idle') : ''
  return `<g transform="translate(${num(x, 0)},${num(y, 0)}) scale(${num(scale, 1)})" shape-rendering="crispEdges">${isWalking ? WALK_CSS : isIdle ? idleCss(n) : ''}<g class="eoh-god${motion}">${legs}${body}</g></g>`
}

// --- Poses: the Temple view shows each agent at work in its own chamber, and celebrating once it is done. A pose box
// is POSE_W x POSE_H grid units with the 24x32 sprite at cell (8, 8), so its feet stand on the box's bottom edge and
// props have 8 columns on its left, 12 on its right and 8 rows above it. Part rows are still in sprite cells.
export const POSE_W = 44
export const POSE_H = 40
const OX = 8
const OY = 8
export type PoseName = 'work' | 'done' | 'idle'

// A pose: its parts (paint order is the order a group first appears), the groups drawn hidden (alternate frames the
// animation reveals; reduced motion keeps the default frame) and its CSS. In the CSS `$x` is the pose's group `x`
// and `~` starts a keyframe name; both come out under the pose's own scope class so poses never clash on one page.
// Periods divide one second, like the walk, so a once-a-second redraw restarts them in phase.
interface Pose {
  scope: string
  parts: Part[]
  hide?: string[]
  css: string
}
const style = (scope: string, css: string): string =>
  `<style>${css.replaceAll('$', `.${scope} .eoh-p-`).replaceAll('~', `${scope}-`)}@media (prefers-reduced-motion:reduce){.${scope} *{animation:none!important}}</style>`
/** `part` moved to group `cls`, `dy` rows lower. */
const regroup = (part: Part, cls: string, dy = 0): Part => [cls, part[1] + dy, part[2], part[3]]
// Two-frame toggle: shown for the first half of the period (or, delayed by half a period, the second half).
const TOGGLE = '@keyframes ~t{0%{opacity:1}50%{opacity:0}}'

// Props held in the hands; the poses that raise their arms put them down.
const HELD = new Set<Part>([WAS, ANKH, BASTET_SISTRUM, TORCH_HANDLE, ...Object.values(TOOLS)])
// TORSO's arms below the shoulders, erased for poses that draw their own.
const NO_BACK_ARM: Part = ['bd', 17, Array<string>(5).fill('.....__')]
const NO_FRONT_ARM: Part = ['bd', 17, ['................___', '.................____', '...................___']]
// The grip around the staff, closed into a fist.
const FIST: Part = ['bd', 19, ['....................S']]
// Both arms raised in the ka pose: elbows out at the shoulders, forearms up beside the head.
const ARMS_UP: Part = ['ar', 10, [
  '..ss................ss',
  ...Array<string>(5).fill('..SS................SS'),
  '..SSS.............SSSS',
]]

const WORK: Record<string, Pose> = {
  // Ra lifts the sun: both arms reach high and the disc rises off his head in a pulsing halo with twinkling rays;
  // then arms and disc sink 2 rows and rise again. The halo (translucent, behind everything) is 2 cells wider.
  fable: {
    scope: 'eoh-wk-ra',
    parts: [
      ['dg', -6, [
        '.........YYYY',
        '.......YYYYYYYY',
        '......YYYYYYYYYY',
        ...Array<string>(4).fill('.....YYYYYYYYYYYY'),
        '......YYYYYYYYYY',
        '.......YYYYYYYY',
        '.........YYYY',
      ]],
      LEGS_STRIDE, TORSO, NO_BACK_ARM, NO_FRONT_ARM, FALCON,
      regroup(RA_DISC, 'dk', -4), regroup(RA_URAEUS, 'dk', -4),
      ['ra', -8, ['..........YY', '', '', '', '', '', '', '..YY..............YY']],
      ['rb', -7, ['...Y..............Y', '....Y............Y']],
      ['ah', 7, [
        '..ss................ss',
        ...Array<string>(5).fill('..SS................SS'),
        '..SSS..............SSS',
        '...SSS............SSS',
        '....SSS..........SSS',
      ]],
      regroup(ARMS_UP, 'al'),
    ],
    hide: ['rb', 'al'],
    css:
      '$ah{animation:~t 1s steps(1) infinite}$al{animation:~t 1s steps(1) -.5s infinite}$dk{animation:~l 1s steps(1) infinite}' +
      '$dg{opacity:.45;animation:~l 1s steps(1) infinite,~g .5s ease-in-out infinite}$ra{animation:~l 1s steps(1) infinite,~t .5s steps(1) infinite}' +
      '$rb{animation:~l 1s steps(1) infinite,~t .5s steps(1) -.25s infinite}' +
      `${TOGGLE}@keyframes ~l{50%{transform:translateY(2px)}}@keyframes ~g{50%{opacity:.15}}`,
  },
  // Anubis weighs the heart: a standing balance in front of him, the heart pan and the feather pan see-sawing while
  // his fist steadies the heart's pan.
  heavy: {
    scope: 'eoh-wk-anubis',
    parts: [
      LEGS_STRIDE, TORSO, FIST, ...(GODS.heavy as God).parts.filter(p => p !== WAS),
      ['st', 12, [
        '............................Y',
        '............................G',
        '',
        ...Array<string>(15).fill('............................G'),
        '...........................GGG',
        '..........................DDDDD',
      ]],
      // Heart down, feather up.
      ['pa', 13, [
        '...............................GGG',
        '..........................GGGGG.D',
        '.......................GGG.....DWD',
        '........................D.....D.W.D',
        '.......................D.D....D.WwD',
        '......................DR.RD...GGGGG',
        '......................DRRRD....GGG',
        '......................GGGGG',
        '.......................GGG',
      ]],
      // Heart up, feather down.
      ['pb', 13, [
        '.......................GGG',
        '........................D.GGGGG',
        '.......................D.D.....GGG',
        '......................DR.RD.....D',
        '......................DRRRD....DWD',
        '......................GGGGG...D.W.D',
        '.......................GGG....D.WwD',
        '..............................GGGGG',
        '...............................GGG',
      ]],
    ],
    hide: ['pb'],
    css: `$pa{animation:~t 1s steps(1) infinite}$pb{animation:~t 1s steps(1) -.5s infinite}$gl{animation:~g 1s ease-in-out infinite}${TOGGLE}@keyframes ~g{50%{opacity:.45}}`,
  },
  // Horus keeps watch: the falcon head scans forward and back with a gleaming eye while the back wing slowly beats.
  careful: {
    scope: 'eoh-wk-horus',
    parts: [
      LEGS_STRIDE, TORSO, NO_BACK_ARM, ...(GODS.careful as God).parts.filter(p => !HELD.has(p)).map(p => regroup(p, 'hd')), WAS,
      ['ey', 8, ['............Q']],
      // The back wing (from 8 columns left of the sprite): an aqua wing arm from the shoulder with brown and cream
      // flight feathers hanging under it in stripes, their tips ragged. Raised and spread, then lowered along the back.
      ['wa', 8, [
        'AA',
        'AAAA',
        'FfAAAA',
        'FfFfAAAA',
        'FfFfFfAAAA',
        'F.FfFfFfAAAA',
        '..FfFfFfFfAAA',
        '..F.FfFfFfFFF',
        '....FfFfFfFf',
        '....F.FfFfF',
        '......F.Ff',
        '........F',
      ], -8],
      ['wb', 15, [
        '..........AAA',
        '........AAAAF',
        '......AAAAFfF',
        '....AAAAFfFfF',
        '..AAAAFfFfFfF',
        '.AAAFfFfFfFf',
        '.FfFfFfFfFfF',
        '.FfFfFfFfF.F',
        '.F.FfFfFf',
        '...F.FfF',
        '.....F',
      ], -8],
    ],
    hide: ['wb'],
    css:
      '$hd{animation:~s 1s steps(1) infinite}$ey{animation:~s 1s steps(1) infinite,~t .5s steps(1) infinite}' +
      '$wa{animation:~t 1s steps(1) infinite}$wb{animation:~t 1s steps(1) -.5s infinite}' +
      `${TOGGLE}@keyframes ~s{25%{transform:translateX(1px)}50%{transform:none}75%{transform:translateX(-1px)}}`,
  },
  // Thoth writes: a papyrus hangs before him and unrolls a line at a time while his reed scratches and his head dips.
  medium: {
    scope: 'eoh-wk-thoth',
    parts: [
      LEGS_STRIDE, TORSO, FIST, ...(GODS.medium as God).parts.filter(p => !HELD.has(p)).map(p => regroup(p, 'hd')), ANKH,
      ['rd', 20, ['......................f', '.......................f', '........................E']],
      // Top rod and the first line; the next three lines unroll below it, the bottom rod moving down with them.
      ['sh', 13, ['.......................GDDDDDDDDG', '........................ffffffff', '........................fEEfEEEf', '........................ffffffff']],
      ['sb', 17, ['........................ffffffff', '........................fEfEEfEf', '........................ffffffff']],
      ['sc', 20, ['........................ffffffff', '........................fEEEfEEf', '........................ffffffff']],
      ['sd', 23, ['........................ffffffff', '........................fEfEEEff', '........................ffffffff']],
      ['rl', 26, ['.......................GDDDDDDDDG']],
    ],
    css:
      '$hd{animation:~d .5s steps(1) infinite}$rd{animation:~w .25s steps(1) infinite}$rl{animation:~r 1s steps(1) infinite}' +
      '$sb{animation:~b 1s steps(1) infinite}$sc{animation:~c 1s steps(1) infinite}$sd{animation:~e 1s steps(1) infinite}' +
      '@keyframes ~d{50%{transform:translate(1px,1px)}}@keyframes ~w{50%{transform:translate(1px,-1px)}}' +
      '@keyframes ~b{0%{opacity:0}25%{opacity:1}}@keyframes ~c{0%,25%{opacity:0}50%{opacity:1}}@keyframes ~e{0%,50%{opacity:0}75%{opacity:1}}' +
      '@keyframes ~r{0%{transform:translateY(-9px)}25%{transform:translateY(-6px)}50%{transform:translateY(-3px)}75%{transform:none}}',
  },
  // Bastet plays: the sistrum rattles (its jingle bar flashing) and three sound arcs ripple outward from it.
  light: {
    scope: 'eoh-wk-bastet',
    parts: [
      LEGS_STRIDE, TORSO, ...(GODS.light as God).parts.filter(p => !HELD.has(p)),
      regroup(BASTET_SISTRUM, 'si'), ['si', 10, ['....................Y']],
      ['wa', 9, ['.......................A', '........................A', '.......................A']],
      ['wb', 8, ['.........................A', '..........................A', '..........................A', '..........................A', '.........................A']],
      ['wc', 7, [
        '...........................A',
        '............................A',
        ...Array<string>(3).fill('.............................A'),
        '............................A',
        '...........................A',
      ]],
    ],
    css: `$si{animation:~s .25s steps(1) infinite}$wa,$wb,$wc{animation:~t 1s steps(1) infinite}$wb{animation-delay:-.75s}$wc{animation-delay:-.5s}${TOGGLE}@keyframes ~s{50%{transform:translate(1px,-1px)}}`,
  },
}
// Set, for an unknown tier: works his staff up and down against a bobbing body.
const SET_WORK: Pose = {
  scope: 'eoh-wk-set',
  parts: [LEGS_STRIDE, TORSO, ...SET.parts],
  css: '$pr{animation:~h .5s steps(1) infinite}$bd{animation:~h .5s steps(1) -.25s infinite}@keyframes ~h{50%{transform:translateY(-1px)}}',
}

// Each worker trade (from `toolOf`); the slave's head and cloth colour stay its own.
const TRADE_WORK: Record<string, Pose> = {
  // The smith raises a bronze hammer, then strikes the anvil in a burst of sparks.
  hammer: {
    scope: 'eoh-wk-hammer',
    parts: [
      LEGS_STRIDE, TORSO, NO_FRONT_ARM, SLAVE_HEAD,
      ['an', 24, [
        '.....................wwwwwwwww',
        '......................kkkkkkkk',
        ...Array<string>(3).fill('........................kkkk'),
        '.......................kkkkkk',
        '......................kkkkkkkk',
        '......................kkkkkkkk',
      ]],
      ['ha', 5, [
        '...................DDD',
        '...................DDD',
        ...Array<string>(5).fill('....................F'),
        '...................SSS',
        '..................SS',
        '.................SS',
        '................SS',
      ]],
      ['hb', 17, [
        '................SSS',
        '.................SSSS',
        '...................SSS',
        '......................F',
        '.......................F',
        '......................DDDD',
        '......................DDDD',
      ]],
      ['sk', 19, ['...........................Y', '..........................Q..Y', '............................Y']],
    ],
    hide: ['ha'],
    css: `$ha{animation:~t 1s steps(1) infinite}$hb,$sk{animation:~t 1s steps(1) -.5s infinite}${TOGGLE}`,
  },
  // The scribe holds an open scroll, nodding as each line of marks appears.
  scroll: {
    scope: 'eoh-wk-scroll',
    parts: [
      LEGS_STRIDE, TORSO, regroup(SLAVE_HEAD, 'hd'),
      ['os', 13, [
        '....................F.......F',
        ...Array<string>(8).fill('....................wfffffffw'),
        '....................F.......F',
      ]],
      ['ma', 15, ['......................EE.EE']],
      ['mb', 17, ['......................E.EEE']],
      ['mc', 19, ['......................EEE.E']],
    ],
    css:
      '$hd{animation:~d 1s steps(1) infinite}$ma{animation:~b 1s steps(1) infinite}$mb{animation:~c 1s steps(1) infinite}$mc{animation:~e 1s steps(1) infinite}' +
      '@keyframes ~d{50%{transform:translateY(1px)}}' +
      '@keyframes ~b{0%{opacity:0}25%{opacity:1}}@keyframes ~c{0%,25%{opacity:0}50%{opacity:1}}@keyframes ~e{0%,50%{opacity:0}75%{opacity:1}}',
  },
  // The porter treads in place with a basket of bread and fruit on his head, the load bouncing a beat behind him.
  basket: {
    scope: 'eoh-wk-basket',
    parts: [
      LEGS_PASS, LEGS_STRIDE, TORSO, FIST, SLAVE_HEAD, regroup(TOOLS.basket as Part, 'bk'),
      ['bk', -1, ['..........Y.L', '.........RYYLR']],
    ],
    hide: ['lb'],
    css: '$la,$lb{animation:~t .5s steps(1) infinite}$lb{animation-delay:-.25s}$bd{animation:~b .5s steps(1) infinite}$bk{animation:~b .5s steps(1) -.25s infinite}' +
      `${TOGGLE}@keyframes ~b{50%{transform:translateY(-1px)}}`,
  },
  // The scout sweeps the torch from beside him out to arm's length and back, its flame tip flickering.
  torch: {
    scope: 'eoh-wk-torch',
    parts: [
      LEGS_STRIDE, TORSO, NO_FRONT_ARM, SLAVE_HEAD,
      ['ta', 7, [
        '...................YQY',
        '..................YYQYY',
        '..................GYQYG',
        '...................GYG',
        '....................G',
        ...Array<string>(5).fill('....................F'),
        '................SSS.F',
        '.................SSSF',
        '...................SFS',
      ]],
      ['xa', 6, ['....................Y']],
      ['tb', 4, [
        '.......................YQY',
        '......................YYQYY',
        '......................GYQYG',
        '.......................GYG',
        '........................G',
        ...Array<string>(6).fill('........................F'),
        '.....................SSSFS',
        '..................SSSS..F',
      ]],
      ['xb', 3, ['........................Y']],
    ],
    hide: ['tb', 'xb'],
    css:
      '$ta{animation:~t 1s steps(1) infinite}$tb{animation:~t 1s steps(1) -.5s infinite}' +
      '$xa{animation:~t 1s steps(1) infinite,~f .25s steps(1) infinite}$xb{animation:~t 1s steps(1) -.5s infinite,~f .25s steps(1) infinite}' +
      `${TOGGLE}@keyframes ~f{50%{transform:translateX(1px)}}`,
  },
  // The painter strokes a limestone panel high and low; a purple, then an aqua stroke appears.
  brush: {
    scope: 'eoh-wk-brush',
    parts: [
      LEGS_STRIDE, TORSO, NO_FRONT_ARM, SLAVE_HEAD,
      ['pn', 10, ['........................wwwwwwww', ...Array<string>(21).fill('........................wffffffw')]],
      ['ba', 14, ['.....................SSGGP', '...................SS', '..................SS']],
      ['bb', 17, ['................SSSS', '...................SSS', '.....................SSGGA']],
      ['ka', 14, ['..........................PPPP']],
      ['kb', 19, ['..........................AAAA']],
    ],
    hide: ['bb'],
    css:
      '$ba{animation:~t .5s steps(1) infinite}$bb{animation:~t .5s steps(1) -.25s infinite}$ka{animation:~c 1s steps(1) infinite}$kb{animation:~e 1s steps(1) infinite}' +
      `${TOGGLE}@keyframes ~c{0%{opacity:0}50%{opacity:1}}@keyframes ~e{0%{opacity:0}75%{opacity:1}}`,
  },
}

// Done: every god and worker drops what it held, throws both arms up and hops before a pulsing sun-disc glow while
// four sparkles rise around it. It loops gently (a once-a-second redraw would replay a one-shot anyway).
const doneOf = (god: God): Pose => ({
  scope: 'eoh-done',
  parts: [
    ['gw', -2, [
      '..........YYYY',
      '........YYYYYYYY',
      '......YYYYYYYYYYYY',
      '.....YYYYYYYYYYYYYY',
      '....YYYYYYYYYYYYYYYY',
      ...Array<string>(2).fill('...YYYYYYYYYYYYYYYYYY'),
      ...Array<string>(7).fill('..YYYYYYYYYYYYYYYYYYYY'),
      ...Array<string>(2).fill('...YYYYYYYYYYYYYYYYYY'),
      '....YYYYYYYYYYYYYYYY',
      '.....YYYYYYYYYYYYYY',
      '......YYYYYYYYYYYY',
      '........YYYYYYYY',
      '..........YYYY',
    ]],
    LEGS_STRIDE, TORSO, NO_BACK_ARM, NO_FRONT_ARM, ...god.parts.filter(p => !HELD.has(p)), ARMS_UP,
    ['sa', 8, ['.Y.', 'YQY', '.Y.'], -1],
    ['sb', 6, ['.Y.', 'YQY', '.Y.'], 22],
    ['sc', 0, ['.Y.', 'YQY', '.Y.'], 4],
    ['sd', 2, ['.Y.', 'YQY', '.Y.'], 17],
  ],
  css:
    '$gw{opacity:.35;animation:~g 1s ease-in-out infinite}$la,$bd,$gl,$ar{animation:~h 1s steps(1) infinite}' +
    '$sa,$sb,$sc,$sd{animation:~r 1s linear infinite}$sb{animation-delay:-.25s}$sc{animation-delay:-.5s}$sd{animation-delay:-.75s}' +
    '@keyframes ~g{50%{opacity:.15}}@keyframes ~h{50%{transform:translateY(-1px)}}@keyframes ~r{to{transform:translateY(-6px);opacity:0}}',
})

const workOf = (key: string): Pose =>
  Object.hasOwn(WORK, key)
    ? (WORK[key] as Pose)
    : key.startsWith('slave:')
      ? (TRADE_WORK[toolOf(key.slice(6))] as Pose)
      : SET_WORK

/**
 * SVG fragment (no <svg> wrapper) for `key` (a tier, or `slaveKey(type)`) in a pose: 'work' (its looping work motion
 * with its prop), 'done' (the celebration) or 'idle' (godSvg's breathing). The pose box is POSE_W x POSE_H grid units,
 * its top-left corner at (x, y) and each unit `scale` px; the sprite sits in it at (8, 8), feet on the bottom edge.
 * Unknown tiers draw Set; any worker type draws a trade (hammer by default).
 * `seed` (optional, e.g. the agent's index or a hash of its id) keeps agents out of lockstep: a non-zero seed starts
 * the pose's loop at its own phase under its own scope (`<scope>-s<n>`), and an idle god also blinks every 4 to 8 s.
 * Seed 0, the default, is the unseeded fragment.
 */
export const poseSvg = (key: string, x: number, y: number, scale: number, pose: PoseName, seed = 0): string => {
  const [px, py, s] = [num(x, 0), num(y, 0), num(scale, 1)]
  if (pose !== 'work' && pose !== 'done') return godSvg(key, px + OX * s, py + OY * s, s, false, false, true, seed)
  const god = godOf(key)
  const n = seedOf(seed)
  const base = pose === 'done' ? doneOf(god) : workOf(key)
  const p = n ? { ...base, scope: `${base.scope}-s${n}`, css: shift(base.css, phase(n, 1)) } : base
  const groups = pixelsOf(p.parts, { ...PAL, ...god.pal }, POSE_W, POSE_H, OX, OY)
  const body = [...groups].map(([cls, g]) => `<g class="eoh-p-${cls}"${p.hide?.includes(cls) ? ' opacity="0"' : ''}>${paths(g, false, POSE_W, POSE_H)}</g>`)
  return `<g transform="translate(${px},${py}) scale(${s})" shape-rendering="crispEdges">${style(p.scope, p.css)}<g class="eoh-pose ${p.scope}">${body.join('')}</g></g>`
}
