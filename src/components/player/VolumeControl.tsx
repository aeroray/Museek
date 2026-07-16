import { Volume, Volume1, Volume2, VolumeX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { usePlayerStore } from "@/stores/playerStore"

export function VolumeControl() {
  const { volume, muted, setVolume, setMuted } = usePlayerStore()

  const pct = Math.round((muted ? 0 : volume) * 100)

  const level = muted || volume === 0 ? "mute" : volume < 0.3 ? "low" : volume < 0.7 ? "mid" : "high"
  const VolumeIcon = level === "mute" ? VolumeX : level === "low" ? Volume : level === "mid" ? Volume1 : Volume2

  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setMuted(!muted)}>
        <span key={level} className="icon-pop-in">
          <VolumeIcon size={16} />
        </span>
      </Button>
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
