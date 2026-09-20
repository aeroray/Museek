import { motion, useReducedMotion } from "motion/react"
import { Button } from "@/components/ui/button"
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip"
import { Slider } from "@/components/ui/slider"
import { NO_MOTION, SPRING_MORPH } from "@/lib/motion"
import { usePlayerStore } from "@/stores/playerStore"
import { useT } from "@/lib/i18n"

type VolumeLevel = "mute" | "low" | "mid" | "high"

const INNER_WAVE: Record<VolumeLevel, string> = {
  mute: "M 15 9 Q 17 12 19 15",
  low: "M 15 12 Q 15 12 15 12",
  mid: "M 15 9.5 Q 17 12 15 14.5",
  high: "M 15 9.5 Q 17 12 15 14.5",
}

const OUTER_WAVE: Record<VolumeLevel, string> = {
  mute: "M 19 9 Q 17 12 15 15",
  low: "M 18 12 Q 18 12 18 12",
  mid: "M 18 12 Q 18 12 18 12",
  high: "M 17.5 7 Q 21 12 17.5 17",
}

function MorphingVolumeIcon({ level }: { level: VolumeLevel }) {
  const reduceMotion = useReducedMotion()
  // Same preset as the play/pause path morph: the two are the app's only
  // shape morphs and should settle identically.
  const transition = reduceMotion ? NO_MOTION : SPRING_MORPH

  return (
    <motion.svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-icon="inline-start"
    >
      <path d="M 11 5 L 6 9 H 2 V 15 H 6 L 11 19 Z" />
      <motion.path
        initial={false}
        animate={{ d: INNER_WAVE[level] }}
        transition={transition}
      />
      <motion.path
        initial={false}
        animate={{ d: OUTER_WAVE[level] }}
        transition={transition}
      />
    </motion.svg>
  )
}

export function VolumeControl() {
  const { volume, muted, setVolume, setMuted } = usePlayerStore()
  const t = useT()

  const pct = Math.round((muted ? 0 : volume) * 100)

  const level: VolumeLevel = muted || volume === 0 ? "mute" : volume < 0.3 ? "low" : volume < 0.7 ? "mid" : "high"

  return (
    <div className="flex items-center gap-2">
      <ShortcutTooltip
        label={t(muted ? "player.unmute" : "player.mute")}
        action="mute"
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 icon-hover-volume"
          onClick={() => setMuted(!muted)}
        >
          <MorphingVolumeIcon level={level} />
        </Button>
      </ShortcutTooltip>
      <div className="group relative flex items-center">
        {/* value bubble on hover */}
        <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 rounded bg-popover px-1.5 py-0.5 text-xs font-medium text-popover-foreground shadow border opacity-0 transition-opacity group-hover:opacity-100 tabular-nums">
          {pct}
        </span>
        <Slider
          className="w-20"
          min={0}
          max={1}
          step={0.01}
          value={[muted ? 0 : volume]}
          onValueChange={([v]) => {
            setVolume(v)
            if (muted) setMuted(false)
          }}
        />
      </div>
    </div>
  )
}
