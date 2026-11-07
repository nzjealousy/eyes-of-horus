import type { ClientModule } from 'claude-code'

// `ms` elapsed as of the render at clock time `at`; the clock ticks on the surface's frame clock, no `$` traffic.
type ClockProps = { ms: number; at: number; color: string }
// `ticks` counts seconds since mount; `base` is the tick count when `at` last changed.
type ClockState = { at: number; base: number; ticks: number }

export function fmtElapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const pad = (n: number) => String(n).padStart(2, '0')
  // mm:ss, h:mm:ss past an hour (savvy-flow's clock).
  const h = Math.floor(s / 3600)
  const mm = pad(Math.floor((s % 3600) / 60))
  return h > 0 ? `${h}:${mm}:${pad(s % 60)}` : `${mm}:${pad(s % 60)}`
}

const AgentClock: ClientModule<ClockProps, ClockState> = (props, surface) => {
  const { Text } = surface.elements
  const s = surface.state
  if (s === undefined) {
    surface.every(1000, () => {
      const c = surface.state
      if (c) surface.setState({ ...c, ticks: c.ticks + 1 })
    })
    surface.setState({ at: props.at, base: 0, ticks: 0 })
  } else if (s.at !== props.at) {
    // New props (a redraw): restart the count from the fresh `ms` without a setState.
    s.at = props.at
    s.base = s.ticks
  }
  const extra = s ? (s.ticks - s.base) * 1000 : 0

  return <Text color={props.color}>{fmtElapsed(props.ms + extra)}</Text>
}

export default AgentClock
