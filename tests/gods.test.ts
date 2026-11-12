import { expect, test } from 'claude-code/testing'

import { GOD_H, GOD_TIERS, GOD_W, godGlyph, godName, godSvg, POSE_H, POSE_W, poseSvg, slaveKey } from '../hooks/gods'

// Tags open and close in order (the CSS is skipped), and every attribute holds only finite numbers, colours or names.
const checkSvg = (svg: string, W = GOD_W, H = GOD_H): void => {
  const stack: string[] = []
  for (const [, close, name, self] of svg.replace(/<style>[\s\S]*?<\/style>/g, '').matchAll(/<(\/?)([a-z]+)[^>]*?(\/?)>/g)) {
    if (close) expect(stack.pop()).toBe(name)
    else if (!self) stack.push(name as string)
  }
  expect(stack).toEqual([])
  expect(svg).not.toMatch(/NaN|Infinity|undefined|null/)
  for (const [, key, value] of svg.matchAll(/ ([a-z-]+)="([^"]*)"/g)) {
    if (key === 'fill') expect(value).toMatch(/^#[0-9a-f]{6}$/)
    else if (key === 'class' || key === 'shape-rendering') expect(value).toMatch(/^[a-zA-Z0-9 -]+$/)
    else if (key === 'd') expect(value).toMatch(/^(M\d+ \d+h\d+v\d+h-\d+z)+$/)
    else for (const n of value?.match(/-?[\d.]+/g) ?? []) expect(Number.isFinite(Number(n))).toBe(true)
  }
  // Every box stays on the grid.
  for (const [, x, y, w, h] of svg.matchAll(/M(\d+) (\d+)h(\d+)v(\d+)/g)) {
    expect(Number(x) + Number(w)).toBeLessThanOrEqual(W)
    expect(Number(y) + Number(h)).toBeLessThanOrEqual(H)
  }
}

const fills = (svg: string): string[] => [...svg.matchAll(/fill="(#[0-9a-f]{6})"/g)].map(m => m[1] as string)
const shapes = (svg: string): string[] => [...svg.matchAll(/ d="([^"]+)"/g)].map(m => m[1] as string)

test('every tier has a named god, a one-code-point glyph and a well-formed SVG under 3 KB', async () => {
  expect(GOD_TIERS.map(godName)).toEqual(['Ra', 'Anubis', 'Horus', 'Thoth', 'Bastet'])
  const svgs = new Set<string>()
  for (const tier of GOD_TIERS) {
    expect([...godGlyph(tier)].length).toBe(1)
    for (const isWalking of [false, true])
      for (const isDim of [false, true]) {
        const svg = godSvg(tier, 3, 4, 28 / GOD_W, isWalking, isDim)
        checkSvg(svg)
        expect(svg.length).toBeLessThan(3072)
        expect(svg.startsWith('<g transform="translate(3,4) scale(1.167)"')).toBe(true)
      }
    svgs.add(godSvg(tier, 0, 0, 1, false))
  }
  expect(svgs.size).toBe(GOD_TIERS.length)
  expect(new Set(GOD_TIERS.map(godGlyph)).size).toBe(GOD_TIERS.length)
})

test('an unknown tier falls back to Set', async () => {
  for (const tier of ['', 'explore', 'constructor', '__proto__']) {
    expect(godName(tier)).toBe('Set')
    expect(godGlyph(tier)).toBe('𓃩')
    expect(godSvg(tier, 0, 0, 1, false)).toBe(godSvg('nope', 0, 0, 1, false))
  }
  const set = godSvg('nope', 0, 0, 1, true)
  checkSvg(set)
  for (const tier of GOD_TIERS) expect(godSvg(tier, 0, 0, 1, true)).not.toBe(set)
})

test('walking adds the passing pose and scoped animation; standing has neither', async () => {
  for (const tier of [...GOD_TIERS, 'nope']) {
    const still = godSvg(tier, 0, 0, 1, false)
    const walk = godSvg(tier, 0, 0, 1, true)
    expect(still).not.toMatch(/<style|animation|eoh-walk|eoh-god-lb/)
    expect(walk).toMatch(/<style>[\s\S]*@keyframes eoh-god-step[\s\S]*<\/style>/)
    expect(walk).toContain('class="eoh-god eoh-walk"')
    expect(walk).toContain('<g class="eoh-god-lb" opacity="0">')
    // Every rule and keyframe name in the CSS is scoped with the eoh- prefix.
    const css = /<style>([\s\S]*)<\/style>/.exec(walk)?.[1] ?? ''
    for (const [cls] of css.matchAll(/\.[a-z][\w-]*/g)) expect(cls.startsWith('.eoh-')).toBe(true)
    for (const [, name] of css.matchAll(/@keyframes ([\w-]+)/g)) expect(name?.startsWith('eoh-')).toBe(true)
  }
})

test('dim greys every fill and keeps the shapes', async () => {
  for (const tier of [...GOD_TIERS, 'nope']) {
    const lit = godSvg(tier, 0, 0, 1, false)
    const dim = godSvg(tier, 0, 0, 1, false, true)
    expect(dim).not.toBe(lit)
    expect(shapes(dim)).toEqual(shapes(lit))
    for (const c of fills(dim)) {
      const [r, g, b] = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16))
      expect(r).toBe(g)
      expect(b).toBe(Math.min(255, (g ?? 0) + 10))
    }
    expect(fills(lit).some(c => !fills(dim).includes(c))).toBe(true)
  }
})

test('placement: translate and scale are passed through, non-finite input falls back', async () => {
  expect(godSvg('fable', 10.5, -2, 1.5, false)).toContain('transform="translate(10.5,-2) scale(1.5)"')
  expect(godSvg('fable', NaN, Infinity, NaN, false)).toContain('transform="translate(0,0) scale(1)"')
})

// --- poses. One worker type per trade (the trade comes from the type's name).
const TRADES = { hammer: 'general-purpose', scroll: 'Plan', basket: 'crab-organizer', torch: 'Explore', brush: 'crab-designer' }
const POSE_KEYS = [...GOD_TIERS, 'nope', ...Object.values(TRADES).map(slaveKey)]
const scopeOf = (svg: string) => /class="eoh-pose ([\w-]+)"/.exec(svg)?.[1] ?? ''

// The CSS is scoped: every class rule and keyframe name starts with the pose's scope, every animation it runs is defined
// right there, no OS reduced-motion rule stops it, and every group drawn hidden has a rule that shows it.
const checkPoseCss = (svg: string): void => {
  const scope = scopeOf(svg)
  expect(scope).toMatch(/^eoh-(wk-[a-z]+|done)(-s\d+)?$/)
  const css = /<style>([\s\S]*)<\/style>/.exec(svg)?.[1] ?? ''
  const rules = css.replace(/@keyframes [\w-]+\{([^{}]*\{[^}]*\})*\}/g, '')
  for (const [cls] of rules.matchAll(/\.[a-z][\w-]*/g)) expect(cls === `.${scope}` || cls.startsWith('.eoh-p-')).toBe(true)
  const frames = [...css.matchAll(/@keyframes ([\w-]+)/g)].map(m => m[1] as string)
  for (const name of frames) expect(name.startsWith(`${scope}-`)).toBe(true)
  for (const [, decl] of css.matchAll(/animation:([^;}]+)/g))
    for (const [name] of (decl as string).matchAll(/eoh-[\w-]+/g)) expect(frames).toContain(name)
  // The OS reduced-motion setting no longer freezes a pose (motion.test.ts pins the /horus-motion off-switch instead).
  expect(svg).not.toContain('prefers-reduced-motion')
  for (const [, cls] of svg.matchAll(/<g class="eoh-p-([a-z]+)" opacity="0">/g)) expect(rules).toContain(`.eoh-p-${cls}{animation`)
}

test('every god, Set and trade has its own well-formed work and done pose under 5 KB', async () => {
  const work = new Set<string>()
  const scopes = new Set<string>()
  for (const key of POSE_KEYS) {
    const w = poseSvg(key, 3, 4, 3, 'work')
    const d = poseSvg(key, 3, 4, 3, 'done')
    for (const svg of [w, d]) {
      checkSvg(svg, POSE_W, POSE_H)
      checkPoseCss(svg)
      expect(svg.length).toBeLessThan(5120)
      expect(svg.startsWith('<g transform="translate(3,4) scale(3)" shape-rendering="crispEdges"><style>')).toBe(true)
      expect(svg).not.toMatch(/eoh-walk|eoh-idle|eoh-god-/)
    }
    expect(d).not.toBe(w)
    expect(scopeOf(d)).toBe('eoh-done')
    work.add(w)
    scopes.add(scopeOf(w))
  }
  expect(work.size).toBe(POSE_KEYS.length)
  expect(scopes.size).toBe(POSE_KEYS.length)
  for (const [trade, type] of Object.entries(TRADES)) expect(scopeOf(poseSvg(slaveKey(type), 0, 0, 1, 'work'))).toBe(`eoh-wk-${trade}`)
})

test('the pose box holds the props beyond the sprite; idle is the breathing god placed in the box', async () => {
  const right = (svg: string) => Math.max(...[...svg.matchAll(/M(\d+) \d+h(\d+)/g)].map(m => Number(m[1]) + Number(m[2])))
  expect(right(poseSvg('heavy', 0, 0, 1, 'work'))).toBeGreaterThan(8 + GOD_W) // the balance stands in front of Anubis
  expect(poseSvg('fable', 0, 0, 1, 'work')).toMatch(/M\d+ [0-7]h/) // Ra's sun rises above the sprite box
  for (const key of POSE_KEYS) {
    expect(poseSvg(key, 2, 3, 2, 'idle')).toBe(godSvg(key, 18, 19, 2, false, false, true))
    expect(poseSvg(key, 0, 0, 1, 'oops' as never)).toBe(poseSvg(key, 0, 0, 1, 'idle'))
  }
  expect(poseSvg('fable', NaN, Infinity, NaN, 'work')).toContain('transform="translate(0,0) scale(1)"')
  expect(poseSvg('fable', NaN, Infinity, NaN, 'idle')).toContain('transform="translate(8,8) scale(1)"')
})

test('unknown keys pose safely: tiers as Set, any worker type as a trade', async () => {
  for (const key of ['', 'explore', 'constructor', '__proto__', 'toString']) {
    expect(poseSvg(key, 0, 0, 1, 'work')).toBe(poseSvg('nope', 0, 0, 1, 'work'))
    expect(poseSvg(key, 0, 0, 1, 'done')).toBe(poseSvg('nope', 0, 0, 1, 'done'))
  }
  for (const type of ['', 'constructor', '__proto__', 'some-new-agent']) {
    const svg = poseSvg(slaveKey(type), 0, 0, 1, 'work')
    checkSvg(svg, POSE_W, POSE_H)
    expect(scopeOf(svg)).toBe('eoh-wk-hammer')
  }
})

// --- seeds. The negative delays a fragment's CSS starts its loops at.
const delaysOf = (svg: string): string[] => (/<style>([\s\S]*)<\/style>/.exec(svg)?.[1] ?? '').match(/-[\d.]+s\b/g) ?? []
const POSES = ['work', 'done', 'idle'] as const

test('a seed starts a pose at its own phase under its own scope; seed 0 is the unseeded fragment', async () => {
  for (const key of POSE_KEYS)
    for (const pose of POSES) {
      const plain = poseSvg(key, 3, 4, 3, pose)
      for (const none of [0, -0, 0.2, 1000, NaN, Infinity]) expect(poseSvg(key, 3, 4, 3, pose, none)).toBe(plain)
      const a = poseSvg(key, 3, 4, 3, pose, 5)
      const b = poseSvg(key, 3, 4, 3, pose, 6)
      expect(a).not.toBe(plain)
      expect(a).not.toBe(b)
      expect(poseSvg(key, 3, 4, 3, pose, 5)).toBe(a) // deterministic
      expect(poseSvg(key, 3, 4, 3, pose, -5)).toBe(a) // folded to 0..999
      expect(poseSvg(key, 3, 4, 3, pose, 1005)).toBe(a)
      expect(delaysOf(a).length).toBeGreaterThan(0)
      expect(delaysOf(a)).not.toEqual(delaysOf(b))
      for (const svg of [a, b, poseSvg(key, 3, 4, 3, pose, 999)]) {
        checkSvg(svg, POSE_W, POSE_H)
        expect(svg.length).toBeLessThan(5120)
        expect(svg).not.toContain('prefers-reduced-motion') // the off-switch is /horus-motion's (motion.test.ts)
      }
      if (pose === 'idle') continue
      // Work and done: the same drawing, only the scope and the delays differ.
      checkPoseCss(a)
      expect(scopeOf(a)).toBe(`${scopeOf(plain)}-s5`)
      expect(shapes(a)).toEqual(shapes(plain))
    }
})

test('a seeded idle god breathes out of step and blinks on a long period of its own', async () => {
  for (const key of POSE_KEYS) {
    const plain = poseSvg(key, 0, 0, 2, 'idle')
    const a = poseSvg(key, 0, 0, 2, 'idle', 5)
    const b = poseSvg(key, 0, 0, 2, 'idle', 6)
    expect(a).toBe(godSvg(key, 16, 16, 2, false, false, true, 5))
    expect(plain).not.toContain('eoh-god-bk')
    expect(a).toContain('class="eoh-god eoh-idle-s5"')
    // The lid is one extra group, drawn hidden; everything else is the unseeded drawing.
    expect(a).toContain('<g class="eoh-god-bk" opacity="0">')
    expect(shapes(a).slice(0, -1)).toEqual(shapes(plain))
    const css = /<style>([\s\S]*)<\/style>/.exec(a)?.[1] ?? ''
    for (const [cls] of css.replace(/@keyframes [\w-]+/g, '').matchAll(/\.[a-z][\w-]*/g)) expect(cls === '.eoh-idle-s5' || cls.startsWith('.eoh-god-')).toBe(true)
    for (const [, name] of css.matchAll(/@keyframes ([\w-]+)/g)) expect(name?.startsWith('eoh-')).toBe(true)
    expect(css).toContain('.eoh-idle-s5 .eoh-god-bk{animation:eoh-idle-s5-k 4s steps(1) ')
    expect(css).toContain('@keyframes eoh-idle-s5-k{')
    expect(b).toContain('.eoh-idle-s6 .eoh-god-bk{animation:eoh-idle-s6-k 5s steps(1) ')
    for (const n of [1, 2, 3, 4, 997]) expect(Number(/-k (\d+)s/.exec(poseSvg(key, 0, 0, 2, 'idle', n))?.[1])).toBeGreaterThanOrEqual(4)
  }
  // Only an idle god takes a seed.
  expect(godSvg('fable', 0, 0, 1, true, false, false, 5)).toBe(godSvg('fable', 0, 0, 1, true))
  expect(godSvg('fable', 0, 0, 1, false, false, false, 5)).toBe(godSvg('fable', 0, 0, 1, false))
  expect(godSvg('fable', 0, 0, 1, false, true, true, 5)).toContain('eoh-idle-s5')
})

test('seeded unknown keys still fall back safely', async () => {
  for (const pose of POSES) {
    for (const key of ['', 'explore', 'constructor', '__proto__', 'toString']) expect(poseSvg(key, 0, 0, 1, pose, 7)).toBe(poseSvg('nope', 0, 0, 1, pose, 7))
    for (const type of ['', 'constructor', '__proto__']) checkSvg(poseSvg(slaveKey(type), 0, 0, 1, pose, 7), POSE_W, POSE_H)
  }
  expect(scopeOf(poseSvg(slaveKey('__proto__'), 0, 0, 1, 'work', 7))).toBe('eoh-wk-hammer-s7')
})
