import { useEffect, useRef, type ReactNode } from "react"
import {
  AnimatePresence,
  motion,
  useAnimate,
  useReducedMotion,
} from "motion/react"
import { ICON_SWAP_TRANSITION, ICON_SWAP_VARIANTS } from "@/lib/motion"
import { cn } from "@/lib/utils"

/**
 * Cross-fades between two glyphs so a state change is *bridged* rather than cut.
 *
 * `AnimatePresence` keeps the outgoing glyph mounted for the length of its exit,
 * so both glyphs animate at once and the swap reads as one object changing shape
 * instead of two icons dissolving in sequence. `mode="popLayout"` takes the
 * exiting glyph out of layout flow so the control never resizes mid-swap, and
 * because the transition is interruptible a fast double-click reverses cleanly.
 *
 * `initial={false}` matters: without it the icon would play an entrance
 * animation on first paint, so a page load would look like a state change.
 *
 * For a value that cycles through more than two states, use `IconCycle`.
 *
 * @example
 * <IconSwap
 *   active={fav}
 *   inactive={<Heart size={16} />}
 *   activeNode={<Heart size={16} fill="currentColor" />}
 * />
 */
export function IconSwap({
  active,
  inactive,
  activeNode,
  className,
}: {
  /** Whether the `active` glyph should be shown. */
  active: boolean
  /** Glyph for the resting state. */
  inactive: ReactNode
  /** Glyph for the active state. */
  activeNode: ReactNode
  className?: string
}) {
  const reduceMotion = useReducedMotion()

  return (
    // `relative` is required, not cosmetic: popLayout takes the exiting glyph
    // out of flow with `position: absolute`, and without a positioned parent it
    // would resolve against some far-away ancestor and visibly jump.
    <span className={cn("relative inline-flex", className)} aria-hidden="true">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={active ? "active" : "inactive"}
          className="inline-flex"
          {...(reduceMotion ? {} : ICON_SWAP_VARIANTS)}
          transition={ICON_SWAP_TRANSITION}
        >
          {active ? activeNode : inactive}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

/**
 * Cross-fades when a *value* changes rather than a boolean — a play mode that
 * cycles through four glyphs, a volume icon stepping through levels.
 *
 * `IconSwap` cannot express this because neither glyph is "the active one": on
 * each change the outgoing glyph simply becomes the incoming one. Keying the
 * child on the value gives every step the same enter/exit bridge, so consecutive
 * changes read as one continuous transformation rather than a series of cuts.
 *
 * @example
 * <IconCycle value={playMode} render={(mode) => <ModeGlyph mode={mode} size={16} />} />
 */
export function IconCycle<T>({
  value,
  render,
  className,
}: {
  /** Current value. Any change starts a cross-fade. */
  value: T
  /** Renders the glyph for a value. */
  render: (value: T) => ReactNode
  className?: string
}) {
  const reduceMotion = useReducedMotion()

  return (
    // See IconSwap: `relative` anchors the absolutely-positioned exiting glyph.
    <span className={cn("relative inline-flex", className)} aria-hidden="true">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={String(value)}
          className="inline-flex"
          {...(reduceMotion ? {} : ICON_SWAP_VARIANTS)}
          transition={ICON_SWAP_TRANSITION}
        >
          {render(value)}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

/**
 * One-shot emphasis for a glyph that just became true — the heart on a song you
 * just favorited.
 *
 * This is a wrapper around `IconSwap` rather than a class on it, for a specific
 * reason: `IconSwap` animates `scale`, which `motion/react` writes as an inline
 * `transform`. A CSS keyframe animation also writing `transform` on the *same*
 * element loses to that inline style, so the burst would silently never play.
 * Nesting puts them on separate elements, where the two transforms compose.
 *
 * The burst is driven imperatively rather than by toggling a class, because it
 * must fire on a *transition* into `true` and not on mount: a list where fifty
 * songs are already favorited would otherwise burst fifty hearts on page load.
 * Comparing against the previous value (rather than a "have I mounted" flag)
 * also keeps that true under StrictMode's double-invoked effects.
 */
export function IconBurst({
  active,
  children,
}: {
  /** Plays the burst each time this flips to `true`. */
  active: boolean
  children: ReactNode
}) {
  const reduceMotion = useReducedMotion()
  const [scope, animate] = useAnimate()
  const wasActive = useRef(active)

  useEffect(() => {
    const was = wasActive.current
    wasActive.current = active
    if (was || !active || reduceMotion) return
    void animate(
      scope.current,
      { scale: [1, 1.35, 0.88, 1] },
      { duration: 0.42, ease: "easeOut", times: [0, 0.3, 0.55, 1] },
    )
  }, [active, reduceMotion, animate, scope])

  return (
    <span ref={scope} className="inline-flex">
      {children}
    </span>
  )
}
