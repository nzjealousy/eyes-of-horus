// The mod's own motion switch (`/horus-motion`), in place of the OS reduced-motion setting, which on some machines
// (Windows with "animation effects" off) froze every drawing. The render hooks set it from the `motion` atom before
// they build drawings; the drawing functions read it. Pure: no engine imports.
let on = true

export const setMotion = (value: boolean) => {
  on = value
}
export const motionOn = () => on
/** '' while motion is on; off, a style that stops every animation under `.scope` (each drawing keeps its first frame). */
export const motionCss = (scope: string) => (on ? '' : `<style>.${scope},.${scope} *{animation:none!important}</style>`)
