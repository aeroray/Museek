import { Loader2 } from "lucide-react"
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "motion/react"
import { Button, type ButtonProps } from "@/components/ui/button"
import {
  ICON_SWAP_TRANSITION,
  ICON_SWAP_VARIANTS,
  NO_MOTION,
  SPRING_HERO,
  SPRING_MORPH,
} from "@/lib/motion"
import { cn } from "@/lib/utils"

// The two paths must share the same geometric centre, or the glyph visibly
// jumps sideways during the morph. Their bounding boxes are deliberately NOT
// the same size (a triangle reads larger than two bars), but both must be
// centred on the 24x24 viewBox centre (12, 12):
//   play  x=[5.5,18.5] y=[4.6,19.4] -> centre (12, 12)
//   pause x=[6,18]     y=[5,19]     -> centre (12, 12)
// The play path used to start at x=6, giving it a centre of (12.5, 12) and a
// half-pixel shift on every play/pause toggle.
const PLAY_PATH =
  "M 5.5 4.6 L 11.6 8.3 L 11.6 15.7 L 5.5 19.4 Z M 11.6 8.3 L 18.5 12 L 11.6 15.7 L 11.6 8.3 Z"
const PAUSE_PATH =
  "M 6 5 L 10 5 L 10 19 L 6 19 Z M 14 5 L 18 5 L 18 19 L 14 19 Z"

interface PlayPauseButtonProps extends Omit<ButtonProps, "children"> {
  isPlaying: boolean
  loading?: boolean
  iconSize?: number
}

function MorphingPlayPauseIcon({
  isPlaying,
  size,
}: {
  isPlaying: boolean
  size: number
}) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      data-icon="inline-start"
      className="block overflow-visible"
    >
      <motion.path
        animate={{ d: isPlaying ? PAUSE_PATH : PLAY_PATH }}
        initial={false}
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="0.7"
        strokeLinejoin="round"
        transition={reduceMotion ? NO_MOTION : SPRING_MORPH}
      />
    </motion.svg>
  )
}

/** Loading ⇄ ready swap. Shares the app-wide glyph cross-fade. */
const contextualIconMotion = {
  ...ICON_SWAP_VARIANTS,
  transition: ICON_SWAP_TRANSITION,
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

  return (
    <motion.span
      className="inline-flex"
      whileHover={
        reduceMotion || disabled ? undefined : { scale: 1.04 }
      }
      whileTap={
        reduceMotion || disabled ? undefined : { scale: 0.96 }
      }
      transition={{ scale: SPRING_HERO }}
    >
      <Button
        {...props}
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
        <AnimatePresence initial={false} mode="popLayout">
          {loading ? (
            <motion.span
              key="loading"
              className="inline-flex"
              {...(reduceMotion ? {} : contextualIconMotion)}
            >
              <Loader2
                data-icon="inline-start"
                size={iconSize}
                className="animate-spin motion-reduce:animate-none"
              />
            </motion.span>
          ) : (
            <motion.span
              key="ready"
              className="inline-flex"
              {...(reduceMotion ? {} : contextualIconMotion)}
            >
              <MorphingPlayPauseIcon isPlaying={isPlaying} size={iconSize} />
            </motion.span>
          )}
        </AnimatePresence>
      </Button>
    </motion.span>
  )
}
