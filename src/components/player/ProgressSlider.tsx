import { Slider } from "@/components/ui/slider"
import { usePlayerStore } from "@/stores/playerStore"
import { formatDuration } from "@/lib/utils"

export function ProgressSlider() {
  const { currentTime, duration, seek } = usePlayerStore()

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="flex items-center gap-3 w-full pt-3 pb-1.5">
      <span className="text-[11px] text-muted-foreground tabular-nums w-10 text-right shrink-0">
        {formatDuration(currentTime)}
      </span>
      <Slider
        className="flex-1"
        min={0}
        max={100}
        step={0.1}
        value={[pct]}
        onValueChange={([v]) => seek((v / 100) * duration)}
      />
      <span className="text-[11px] text-muted-foreground tabular-nums w-10 shrink-0">
        {formatDuration(duration)}
      </span>
    </div>
  )
}
