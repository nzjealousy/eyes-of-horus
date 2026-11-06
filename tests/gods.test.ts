import { expect, test } from 'claude-code/testing'

import { GOD_H, GOD_TIERS, GOD_W, godGlyph, godName, godSvg } from '../hooks/gods'

// Tags open and close in order (the CSS is skipped), and every attribute holds only finite numbers, colours or names.
const checkSvg = (svg: string): void => {
  const stack: string[] = []
  for (const [, close, name, self] of svg.replace(/<style>[\s\S]*?<\/style>/g, '').matchAll(/<(\/?)([a-z]+)[^>]*?(\/?)>/g)) {
    if (close) expect(stack.pop()).toBe(name)
    else if (!self) stack.push(name as string)
  }
  expect(stack).toEqual([])
  expect(svg).not.toMatch(/NaN|Infinity|undefined|null/)
  for (const [, key, value] of svg.matchAll(/ ([a-z-]+)="([^"]*)"/g)) {
    if (key === 'fill') expect(value).toMatch(/^#[0-9a-f]{6}$/)
    else if (key === 'class' || key === 'shape-rendering') expect(value).toMatch(/^[a-zA-Z -]+$/)
    else if (key === 'd') expect(value).toMatch(/^(M\d+ \d+h\d+v\d+h-\d+z)+$/)
    else for (const n of value?.match(/-?[\d.]+/g) ?? []) expect(Number.isFinite(Number(n))).toBe(true)
  }
  // Every box stays on the grid.
  for (const [, x, y, w, h] of svg.matchAll(/M(\d+) (\d+)h(\d+)v(\d+)/g)) {
    expect(Number(x) + Number(w)).toBeLessThanOrEqual(GOD_W)
    expect(Number(y) + Number(h)).toBeLessThanOrEqual(GOD_H)
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
