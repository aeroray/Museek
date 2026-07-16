import { Slider } from "@/components/ui/slider"
import { usePlayerStore } from "@/stores/playerStore"
import { formatDuration } from "@/lib/utils"
import { cn } from "@/lib/utils"

export function ProgressSlider() {
  const { currentTime, duration, seek, status, currentSong } = usePlayerStore()

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0
  const disabled = !currentSong || status === "loading" || status === "idle" || status === "error"

  return (
    <div className={cn("flex items-center gap-3 w-full pt-3 pb-1.5", disabled && "opacity-50")}>
      <span className="text-[11px] text-muted-foreground tabular-nums w-10 text-right shrink-0">
        {formatDuration(currentTime)}
      </span>
      <Slider
        className={cn("flex-1", disabled && "pointer-events-none")}
        min={0}
        max={100}
        step={0.1}
        value={[pct]}
        disabled={disabled}
        onValueChange={([v]) => {
          if (disabled || duration <= 0) return
          seek((v / 100) * duration)
        }}
      />
      <span className="text-[11px] text-muted-foreground tabular-nums w-10 shrink-0">
        {formatDuration(duration)}
      </span>
    </div>
  )
}
