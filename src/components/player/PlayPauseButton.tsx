import { Loader2 } from "lucide-react"
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "motion/react"
import { Button, type ButtonProps } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const PLAY_PATH =
  "M 6 4.6 L 12.1 8.3 L 12.1 15.7 L 6 19.4 Z M 12.1 8.3 L 19 12 L 12.1 15.7 L 12.1 8.3 Z"
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
        transition={
          reduceMotion
            ? { duration: 0 }
            : {
                type: "spring",
                stiffness: 180,
                damping: 20,
                mass: 1,
              }
        }
      />
    </motion.svg>
  )
}

const contextualIconMotion = {
  initial: { opacity: 0, scale: 0.25, filter: "blur(4px)" },
  animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
  exit: { opacity: 0, scale: 0.25, filter: "blur(4px)" },
  transition: { type: "spring" as const, duration: 0.3, bounce: 0 },
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
      transition={{
        scale: { type: "spring", stiffness: 400, damping: 24, mass: 0.55 },
      }}
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
