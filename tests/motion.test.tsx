import { expect, mock, test } from 'claude-code/testing'

import type { HorusProgress } from '../types'
import { progressSvg } from '../hooks/band'
import { motionArg } from '../hooks/doctor'
import { GOD_TIERS, godSvg, poseSvg, slaveKey } from '../hooks/gods'
import type { PoseName } from '../hooks/gods'
import { motionCss, motionOn, setMotion } from '../hooks/motion'
import type { Card } from '../hooks/pane'
import { agentSvg, clockSvg } from '../hooks/pane'
import { hallSvg, roomSvg } from '../hooks/temple'
import type { Room } from '../hooks/temple'

const KEYS = [...GOD_TIERS, 'nope', slaveKey('general-purpose'), slaveKey('Explore')]
const POSES: PoseName[] = ['work', 'done', 'idle']
const RUNNING: Card = { key: 'a1', depth: 0, tier: 'careful', type: 'savvy-careful', title: 'Build', status: 'running', agentId: 'a1', ms: 65_000 }
const ROOM: Room = { id: 'a1', key: 'careful', type: 'savvy-careful', tier: 'careful', title: 'Build', status: 'running', ms: 65_000, tokens: 0 }
const FLOW: HorusProgress = { title: 'F', total: 2, done: 0, phase: '', finished: false, tasks: [{ title: 't', tier: 'medium', after: [], status: 'running' }] }
const freeze = (scope: string) => `<style>.${scope},.${scope} *{animation:none!important}</style>`

// Every animated drawing the mod builds: gods (walking, idle, seeded), poses, a running clock, a card with a sweeping
// bar, the band's flow bar, a chamber and the hall.
const fragments = () => [
  ...KEYS.flatMap(k => [godSvg(k, 0, 0, 1, true), godSvg(k, 0, 0, 1, false, false, true), godSvg(k, 0, 0, 1, false, false, true, 7)]),
  ...KEYS.flatMap(k => POSES.flatMap(p => [poseSvg(k, 0, 0, 2, p), poseSvg(k, 0, 0, 2, p, 5)])),
  clockSvg(100, 20, 12, RUNNING).svg,
  agentSvg(400, RUNNING),
  progressSvg(FLOW, 200),
  roomSvg(320, ROOM, { items: [], older: 0 }).svg,
  hallSvg(320, [{ key: 'careful', name: 'Horus', state: 'idle', color: '#fff', seed: 3 }]).svg,
]

test('motion on (the default): no reduced-motion query anywhere, the animation CSS present, no freeze', async () => {
  expect(motionOn()).toBe(true)
  for (const svg of fragments()) {
    expect(svg).not.toContain('prefers-reduced-motion')
    expect(svg).not.toContain('animation:none')
  }
  expect(godSvg('fable', 0, 0, 1, true)).toContain('@keyframes eoh-god-step')
  expect(godSvg('fable', 0, 0, 1, false, false, true)).toContain('@keyframes eoh-god-breathe')
  expect(poseSvg('fable', 0, 0, 2, 'work')).toMatch(/@keyframes eoh-wk-ra-/)
  expect(clockSvg(100, 20, 12, RUNNING).svg).toContain('animation-delay:-65s') // the ticking digit columns
  expect(agentSvg(400, RUNNING)).toContain('class="sheen"')
  expect(progressSvg(FLOW, 200)).toContain('animation:eoh-sheen')
  expect(motionCss('x')).toBe('')
})

test('motion off: every animated fragment carries the freeze, a running clock is a static readable time', async () => {
  setMotion(false)
  try {
    expect(godSvg('fable', 0, 0, 1, true)).toContain(freeze('eoh-walk'))
    expect(godSvg('fable', 0, 0, 1, false, false, true)).toContain(freeze('eoh-idle'))
    expect(godSvg('fable', 0, 0, 1, false, false, true, 7)).toContain(freeze('eoh-idle-s7'))
    expect(godSvg('fable', 0, 0, 1, false)).not.toContain('animation') // a standing god has nothing to freeze
    for (const k of KEYS)
      for (const p of ['work', 'done'] as const) {
        const svg = poseSvg(k, 0, 0, 2, p, 5)
        const scope = /class="eoh-pose ([\w-]+)"/.exec(svg)?.[1] ?? ''
        expect(svg).toContain(freeze(scope))
      }
    const clock = clockSvg(100, 20, 12, RUNNING).svg
    expect(clock).toContain('>01:05</text>')
    expect(clock).not.toContain('animation')
    // Drawings built by svgDoc (cards, chambers, the hall) freeze everything inside them.
    for (const svg of [agentSvg(400, RUNNING), roomSvg(320, ROOM, { items: [], older: 0 }).svg, hallSvg(320, []).svg]) expect(svg).toContain(freeze('eoh-svg'))
    expect(agentSvg(400, RUNNING)).toContain('>01:05</text>')
    expect(progressSvg(FLOW, 200)).toContain(freeze('eoh-sheen'))
    for (const svg of fragments()) expect(svg).not.toContain('prefers-reduced-motion')
  } finally {
    setMotion(true)
  }
})

test('motionArg: on, off, empty toggles, anything else is refused', async () => {
  expect([motionArg('on', false), motionArg(' OFF ', true), motionArg('', true), motionArg('', false), motionArg('maybe', true)]).toEqual([true, false, false, true, undefined])
})

const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const
const PANE = {
  plugin: 'eyes-of-horus',
  component: 'Pane',
  requestId: 'horus',
  props: { title: 'Gods', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

test('/horus-motion switches the drawings off and on (no argument toggles); /horus-doctor says which', async ($, on) => {
  mock.clock(on, { now: 66_000 })
  try {
    const run = async (args: string) => (await $.command.run({ ...RUN, command: 'horus-motion', args })).text
    expect(await run('')).toBe('Motion is off.')
    expect((await $.command.run({ ...RUN, command: 'horus-doctor', args: '' })).text).toContain('Motion: off (/horus-motion on)')
    // The pane's next draw reads the switch: its roster of idle gods is frozen.
    let ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    const sources = async () => (await ui.findAll({ type: 'Svg' })).map(s => String(s.props.source)).join('')
    expect(await sources()).toContain(freeze('eoh-svg'))
    await ui.unmount()
    expect(await run('maybe')).toBe('Usage: /horus-motion [on|off]')
    expect(await run('on')).toBe('Motion is on.')
    expect((await $.command.run({ ...RUN, command: 'horus-doctor', args: '' })).text).toContain('Motion: on')
    ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    expect(await sources()).not.toContain('animation:none')
    expect(await sources()).toContain('eoh-god-breathe')
    await ui.unmount()
    expect(await run('')).toBe('Motion is off.')
    expect(await run('off')).toBe('Motion is off.')
  } finally {
    setMotion(true)
  }
})
