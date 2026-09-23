import type { Transition } from "motion/react"

/**
 * Spring presets for the `motion/react` icons.
 *
 * Hover poses and press feedback are CSS-only — they read the `--motion-*` and
 * `--ease-spring-*` tokens in `src/index.css`. Only the icons that need JS to
 * animate (SVG path morphs, glyph cross-fades) live here, so there is exactly
 * one place to tune each kind of motion.
 */

/**
 * The play/pause and volume SVG path morphs, deliberately softer and slower
 * than the CSS hover springs. A path morph reads as one shape *becoming*
 * another, so it wants a long, nearly critically damped settle; the snappier
 * springs that suit a scale or a pose make the morph look like it snaps.
 */
export const SPRING_MORPH = {
  type: "spring",
  stiffness: 180,
  damping: 20,
  mass: 1,
} satisfies Transition

/**
 * Hover/press scale for the primary transport button only.
 *
 * It differs from the CSS hover spring on purpose: the play button is the
 * largest control on screen, so at the same travel it moves further in absolute
 * pixels than a 36px toolbar button and needs a heavier, slower settle to feel
 * planted. Kept exactly as tuned — do not fold this into the CSS token.
 */
export const SPRING_HERO = {
  type: "spring",
  stiffness: 400,
  damping: 24,
  mass: 0.55,
} satisfies Transition

/**
 * Glyph cross-fade: a glyph arrives from a quarter scale through a 4px blur, and
 * leaves the same way. The blur is what sells the bridge — without it two
 * outline glyphs of similar weight just dissolve into each other.
 *
 * `bounce: 0` is deliberate. A glyph arriving through a blur already reads as a
 * soft focus pull; overshoot on top of that looks like the icon is jittering
 * rather than settling. Shared by `IconSwap` / `IconCycle` and the play button's
 * loading ⇄ ready swap so every glyph change in the app matches.
 */
export const ICON_SWAP_VARIANTS = {
  initial: { opacity: 0, scale: 0.25, filter: "blur(4px)" },
  animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
  exit: { opacity: 0, scale: 0.25, filter: "blur(4px)" },
}

export const ICON_SWAP_TRANSITION = {
  type: "spring",
  duration: 0.3,
  bounce: 0,
} satisfies Transition

/** Instant variant for `useReducedMotion()` users. */
export const NO_MOTION = { duration: 0 } satisfies Transition
