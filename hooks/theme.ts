// Raw hex only: theme keys are refused where a raw colour is required.
// Gold and obsidian black, with purple and aqua accents. The older names (lapis, cyan, violet) keep
// their meaning of "primary accent / secondary accent" so existing imports stay valid.
export const bg = '#07070b'
export const panel = '#0f0f16'
export const panelHi = '#17171f'
export const gold = '#e8b84a'
export const goldDim = '#8a6d2a'
export const goldBright = '#f6d77a'
export const purple = '#8b5cf6'
export const purpleDim = '#33224f'
export const violet = '#b794f6'
export const aqua = '#2dd4bf'
export const aquaDim = '#14524b'
export const orbCore = '#c9fff4'
export const ok = '#5fd68a'
export const warn = '#f0a24b'
export const err = '#e5586b'
export const text = '#ece6d6'
export const dim = '#8a84a0'
// Legacy aliases.
export const lapis = purple
export const lapisDim = purpleDim
export const cyan = aqua

// savvy-flow tier -> colour; unknown tiers fall back to `dim` at the call site.
export const tierColor: Record<string, string> = {
  fable: '#c084fc',
  heavy: '#f6d77a',
  careful: '#e8a33a',
  medium: '#2dd4bf',
  light: '#7dd3a8',
}
