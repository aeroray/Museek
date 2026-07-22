import { useEffect, useRef, useState } from "react"
import { subscribePlaybackTime } from "@/lib/playback/clock"
import { usePlayerStore } from "@/stores/playerStore"
import { formatDuration, cn } from "@/lib/utils"

/**
 * Playback seek bar.
 *
 * Custom track (not Radix): fill + thumb share the same %, so the range never
 * lags the thumb. Smooth time comes from the playback-clock seam.
 */
export function ProgressSlider() {
  const duration = usePlayerStore((s) => s.duration)
  const status = usePlayerStore((s) => s.status)
  const currentSong = usePlayerStore((s) => s.currentSong)
  const storeTime = usePlayerStore((s) => s.currentTime)
  const seek = usePlayerStore((s) => s.seek)

  const trackRef = useRef<HTMLDivElement>(null)
  const scrubbingRef = useRef(false)
  const scrubTimeRef = useRef<number | null>(null)
  const [scrubTime, setScrubTime] = useState<number | null>(null)
  const [displayTime, setDisplayTime] = useState(storeTime)

  const disabled = !currentSong || status === "loading" || status === "idle" || status === "error"
  const scrubbing = scrubTime !== null

  useEffect(() => {
    if (scrubbing || status === "playing") return
    setDisplayTime(storeTime)
  }, [storeTime, status, scrubbing])

  useEffect(() => {
    if (status !== "playing" || scrubbing) return
    return subscribePlaybackTime((t) => setDisplayTime(t))
  }, [status, scrubbing])

  const time = scrubTime ?? displayTime
  const pct = duration > 0 ? Math.min(100, Math.max(0, (time / duration) * 100)) : 0

  const timeFromClientX = (clientX: number) => {
    const el = trackRef.current
    if (!el || duration <= 0) return 0
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) return 0
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return ratio * duration
  }

  const beginScrub = (clientX: number) => {
    if (disabled || duration <= 0) return
    scrubbingRef.current = true
    const next = timeFromClientX(clientX)
    scrubTimeRef.current = next
    setScrubTime(next)
    seek(next)
  }

  const moveScrub = (clientX: number) => {
    if (!scrubbingRef.current || duration <= 0) return
    const next = timeFromClientX(clientX)
    scrubTimeRef.current = next
    setScrubTime(next)
    seek(next)
  }

  const endScrub = () => {
    if (!scrubbingRef.current) return
    scrubbingRef.current = false
    const t = scrubTimeRef.current
    scrubTimeRef.current = null
    if (t != null) setDisplayTime(t)
    setScrubTime(null)
  }

  return (
    <div className={cn("flex items-center gap-3 w-full px-4 pt-3 pb-1", disabled && "opacity-50")}>
      <span className="text-[11px] text-muted-foreground/80 tabular-nums w-10 text-right shrink-0 font-medium tracking-wide">
        {formatDuration(time)}
      </span>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-valuemin={0}
        aria-valuemax={Math.max(0, Math.floor(duration))}
        aria-valuenow={Math.floor(time)}
        aria-valuetext={formatDuration(time)}
        aria-label="Seek"
        aria-disabled={disabled || undefined}
        className={cn(
          "group/slider relative flex h-5 w-full flex-1 touch-none select-none items-center",
          disabled ? "cursor-not-allowed pointer-events-none" : "cursor-pointer",
        )}
        onPointerDown={(e) => {
          if (disabled) return
          e.currentTarget.setPointerCapture(e.pointerId)
          beginScrub(e.clientX)
        }}
        onPointerMove={(e) => moveScrub(e.clientX)}
        onPointerUp={endScrub}
        onPointerCancel={endScrub}
        onKeyDown={(e) => {
          if (disabled || duration <= 0) return
          const step = e.shiftKey ? 10 : 5
          if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
            e.preventDefault()
            seek(Math.max(0, time - step))
          } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
            e.preventDefault()
            seek(Math.min(duration, time + step))
          } else if (e.key === "Home") {
            e.preventDefault()
            seek(0)
          } else if (e.key === "End") {
            e.preventDefault()
            seek(duration)
          }
        }}
      >
        <div className="relative h-1.5 w-full grow overflow-visible rounded-full bg-secondary/80 transition-[height] duration-200 group-hover/slider:h-2">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-primary"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div
          className={cn(
            "pointer-events-none absolute top-1/2 z-10 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2",
            "rounded-full border-2 border-primary bg-background shadow-sm",
            "transition-transform duration-200 group-hover/slider:scale-110",
            scrubbing && "scale-110",
          )}
          style={{ left: `${pct}%` }}
        />
      </div>

      <span className="text-[11px] text-muted-foreground/80 tabular-nums w-10 shrink-0 font-medium tracking-wide">
        {formatDuration(duration)}
      </span>
    </div>
  )
}
