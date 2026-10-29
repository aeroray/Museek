import { Loader2, Pause, Play } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Button, type ButtonProps } from "@/components/ui/button"
import { ICON_SWAP_TRANSITION, ICON_SWAP_VARIANTS } from "@/lib/motion"
import { cn } from "@/lib/utils"

/*
 * Play and pause are two glyphs that cross-fade, not one path that morphs.
 *
 * This used to be a single <path> whose `d` was animated between a hand-drawn
 * triangle and two bars. The paths were tuned so their bounding boxes shared the
 * geometric centre (12, 12) — and measuring the interpolation confirmed the box
 * centre really does stay at x=12 for every t. It still looked like the icon
 * slid sideways when pressed, because a triangle and two bars do not read as the
 * same object: the triangle's mass sits toward its flat edge, the bars are
 * symmetric. A morph asserts "this is one shape becoming another", and that
 * assertion is what fails here, not the coordinates.
 *
 * Cross-fading two optically-balanced glyphs sidesteps the problem entirely and
 * matches how every other state glyph in the app changes (see IconSwap). The
 * loading ⇄ ready change rides the same mechanism, so the button has one motion
 * behaviour rather than two.
 *
 * Both layers are absolutely positioned in a fixed-size box, so the entering and
 * exiting glyphs occupy identical geometry for the whole transition and the
 * button never resizes between a wide triangle and narrow bars.
 */
interface PlayPauseButtonProps extends Omit<ButtonProps, "children"> {
  isPlaying: boolean
  loading?: boolean
  iconSize?: number
}

export function PlayPauseButton({
  isPlaying,
  loading = false,
  iconSize = 19,
  className,
  disabled,
  "aria-label": ariaLabel,
  ...props
}: PlayPauseButtonProps) {
  const reduceMotion = useReducedMotion()

  // Loading takes precedence so a slow track change does not flash pause first.
  const glyphKey = loading ? "loading" : isPlaying ? "pause" : "play"

  return (
    <Button
      {...props}
      // This button deliberately opts out of the shared icon motion. It is the
      // largest, most prominent control on screen and it changes its own glyph
      // on every click, so a hover lift plus a press shrink on top of that reads
      // as the button wobbling while it switches. The glyph cross-fade below is
      // the feedback; nothing else moves.
      //
      // `static` suppresses the class that the Button component would otherwise
      // add, and no `icon-motion` is re-added here. The hover ring is a colour
      // change only, so the control still reads as interactive.
      static
      aria-label={ariaLabel}
      aria-pressed={isPlaying}
      disabled={disabled}
      className={cn(
        "relative overflow-hidden rounded-full shadow-[var(--shadow-elevated)]",
        "after:pointer-events-none after:absolute after:inset-px after:rounded-full after:ring-1 after:ring-primary-foreground/0 after:transition-colors after:duration-150",
        "hover:after:ring-primary-foreground/20",
        className,
      )}
    >
      <span
        className="relative inline-flex items-center justify-center"
        style={{ width: iconSize, height: iconSize }}
      >
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={glyphKey}
            className="absolute inset-0 inline-flex items-center justify-center"
            {...(reduceMotion ? {} : ICON_SWAP_VARIANTS)}
            transition={ICON_SWAP_TRANSITION}
          >
            {loading ? (
              <Loader2
                data-icon="inline-start"
                size={iconSize}
                className="animate-spin motion-reduce:animate-none"
              />
            ) : isPlaying ? (
              <Pause data-icon="inline-start" size={iconSize} fill="currentColor" />
            ) : (
              <Play data-icon="inline-start" size={iconSize} fill="currentColor" />
            )}
          </motion.span>
        </AnimatePresence>
      </span>
    </Button>
  )
}
