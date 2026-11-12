import type { Register } from 'claude-code'

import { registerBand } from './band'
import { registerCore } from './core'
import { registerEye } from './eye'
import { registerPane } from './pane'
import { registerTemple } from './temple'

// Core first: within the plugin the first registration is the outermost hook.
export const register: Register = on => {
  registerCore(on)
  registerBand(on)
  registerPane(on)
  registerTemple(on)
  registerEye(on)
}
