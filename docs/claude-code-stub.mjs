// Stand-in for the engine's 'claude-code' module, so make-previews.mjs can import the mod's drawing code outside the app.
// Only module-level calls run at import (atom refs); the drawing helpers never touch the engine.
export const atom = (ref, initial, opts) => ({ ...ref, initial, ...(opts?.shape ? { shape: opts.shape } : {}) })
export const read = () => undefined
export const update = () => undefined
