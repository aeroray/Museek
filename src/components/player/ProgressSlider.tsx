import { useEffect, useRef, useState } from "react";
import { usePlaybackTime } from "@/lib/playback/clock";
import { usePlayerStore } from "@/stores/playerStore";
import { useT } from "@/lib/i18n";
import { formatDuration, cn } from "@/lib/utils";

/**
 * Playback seek bar.
 *
 * Custom track (not Radix): fill + thumb share the same %, so the range never
 * lags the thumb. Smooth time comes from the playback-clock seam.
 *
 * `compact` is for a tight parent (no player-bar padding).
 * `flush` pins the track to the window bottom (lyrics overlay).
 * The thumb matches the track height so it is not clipped.
 */
export function ProgressSlider({
  className,
  compact = false,
  flush = false,
}: {
  className?: string;
  compact?: boolean;
  flush?: boolean;
}) {
  const duration = usePlayerStore((s) => s.duration);
  const status = usePlayerStore((s) => s.status);
  const currentSong = usePlayerStore((s) => s.currentSong);
  const sourceReady = usePlayerStore((s) => s.sourceReady);
  // A same-song quality switch re-attaches the source, which really does reset
  // the element to 0:00 before the store seeks back. Showing that would snap the
  // bar to the start for a switch that does not change the track's position.
  const reloadingCurrentTrack = usePlayerStore((s) => s.reloadingCurrentTrack);
  const seek = usePlayerStore((s) => s.seek);
  const playbackTime = usePlaybackTime();
  const t = useT();

  const trackRef = useRef<HTMLDivElement>(null);
  const scrubbingRef = useRef(false);
  const scrubTimeRef = useRef<number | null>(null);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [displayTime, setDisplayTime] = useState(playbackTime);
  const [hover, setHover] = useState(false);
  const [hoverX, setHoverX] = useState(0);

  const disabled =
    !currentSong ||
    !sourceReady ||
    status === "loading" ||
    status === "idle" ||
    status === "error";
  const scrubbing = scrubTime !== null;

  useEffect(() => {
    if (scrubbing || status === "playing") return;
    // Keep the last position across a quality reload instead of jumping to 0.
    if (status === "loading" && reloadingCurrentTrack) return;
    setDisplayTime(
      status === "loading" || status === "idle" ? 0 : playbackTime,
    );
  }, [playbackTime, status, scrubbing, reloadingCurrentTrack]);

  const time = scrubTime ?? (status === "playing" ? playbackTime : displayTime);
  const pct =
    duration > 0 ? Math.min(100, Math.max(0, (time / duration) * 100)) : 0;

  const ratioFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };

  const timeFromClientX = (clientX: number) => {
    if (duration <= 0) return 0;
    return ratioFromClientX(clientX) * duration;
  };

  const beginScrub = (clientX: number) => {
    if (disabled || duration <= 0) return;
    scrubbingRef.current = true;
    const next = timeFromClientX(clientX);
    scrubTimeRef.current = next;
    setScrubTime(next);
    seek(next);
  };

  const moveScrub = (clientX: number) => {
    if (!scrubbingRef.current || duration <= 0) return;
    const next = timeFromClientX(clientX);
    scrubTimeRef.current = next;
    setScrubTime(next);
    seek(next);
  };

  const endScrub = () => {
    if (!scrubbingRef.current) return;
    scrubbingRef.current = false;
    const t = scrubTimeRef.current;
    scrubTimeRef.current = null;
    if (t != null) setDisplayTime(t);
    setScrubTime(null);
  };

  return (
    <div
      className={cn(
        "flex w-full items-center",
        flush
          ? "absolute inset-x-0 bottom-0 z-30 px-0 py-0"
          : compact
            ? "gap-2 px-0 py-0"
            : "gap-3 px-4 pb-1 pt-3",
        className,
        disabled && "opacity-50",
      )}
    >
      {!flush && (
        <span className="w-10 shrink-0 text-right text-[11px] font-medium tabular-nums tracking-wide text-muted-foreground/80">
          {formatDuration(time)}
        </span>
      )}

      <div
        ref={trackRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-valuemin={0}
        aria-valuemax={Math.max(0, Math.floor(duration))}
        aria-valuenow={Math.floor(time)}
        aria-valuetext={formatDuration(time)}
        aria-label={t("player.seek")}
        aria-disabled={disabled || undefined}
        className={cn(
          "group/slider relative flex w-full flex-1 touch-none select-none",
          flush ? "h-10 items-end" : "h-5 items-center",
          // Suppress the default outline. The focus ring is drawn on the bar
          // itself (below) because this element is a tall hit area — 40px in the
          // lyrics overlay with the bar pinned to its bottom edge — so an outline
          // here wrapped the whole box and appeared as a stray horizontal bar
          // floating above the progress line.
          "focus-visible:outline-none",
          disabled
            ? "cursor-not-allowed pointer-events-none"
            : "cursor-pointer",
        )}
        onPointerEnter={(e) => {
          setHover(true);
          setHoverX(ratioFromClientX(e.clientX));
        }}
        onPointerLeave={() => {
          if (!scrubbingRef.current) setHover(false);
        }}
        onPointerDown={(e) => {
          if (disabled) return;
          // A mouse drag must not move keyboard focus here. This element is a
          // `role="slider"`, and `isShortcutBlockedTarget` deliberately ignores
          // shortcuts typed inside a slider (so arrow keys can seek). Leaving it
          // focused meant that after scrubbing, Space no longer toggled playback
          // — the slider swallowed it — and the user had to click elsewhere
          // before the keyboard worked again. `preventDefault` keeps focus where
          // it was; keyboard users still reach the slider via Tab.
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          setHoverX(ratioFromClientX(e.clientX));
          beginScrub(e.clientX);
        }}
        onPointerMove={(e) => {
          setHoverX(ratioFromClientX(e.clientX));
          moveScrub(e.clientX);
        }}
        onPointerUp={endScrub}
        onPointerCancel={endScrub}
        onKeyDown={(e) => {
          if (disabled || duration <= 0) return;
          const step = e.shiftKey ? 10 : 5;
          if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
            e.preventDefault();
            seek(Math.max(0, time - step));
          } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
            e.preventDefault();
            seek(Math.min(duration, time + step));
          } else if (e.key === "Home") {
            e.preventDefault();
            seek(0);
          } else if (e.key === "End") {
            e.preventDefault();
            seek(duration);
          }
        }}
      >
        {flush && (hover || scrubbing) && !disabled && duration > 0 && (
          <span
            className="pointer-events-none absolute bottom-3.5 z-10 -translate-x-1/2 rounded-md bg-background/70 px-1.5 py-0.5 font-sans text-[11px] font-medium tabular-nums tracking-wide text-foreground/85 shadow-sm backdrop-blur-sm"
            style={{ left: `${hoverX * 100}%` }}
          >
            {formatDuration(hoverX * duration)}
          </span>
        )}
        <div
          className={cn(
            "relative w-full grow overflow-visible bg-secondary/80 transition-[height] duration-200",
            flush ? "rounded-none" : "rounded-full",
            // Ring on the bar, so the keyboard focus cue hugs the line the user
            // is actually moving instead of the tall invisible hit area.
            "group-focus-visible/slider:ring-2 group-focus-visible/slider:ring-ring group-focus-visible/slider:ring-offset-1 group-focus-visible/slider:ring-offset-background",
            flush
              ? hover || scrubbing
                ? "h-2"
                : "h-1.5"
              : compact
                ? "h-1 group-hover/slider:h-2"
                : "h-1.5 group-hover/slider:h-2",
          )}
        >
          <div
            className={cn(
              "absolute inset-y-0 left-0 bg-primary",
              flush ? "rounded-none" : "rounded-full",
            )}
            style={{ width: `${pct}%` }}
          />
          <div
            className={cn(
              "pointer-events-none absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full",
              flush
                ? "h-full aspect-square bg-white"
                : cn(
                    "border-2 border-primary bg-background shadow-sm",
                    "transition-transform duration-200 group-hover/slider:scale-110",
                    compact ? "h-3 w-3" : "h-3.5 w-3.5",
                    scrubbing && "scale-110",
                  ),
            )}
            style={{
              left: `${pct}%`,
              ...(flush
                ? {
                    boxShadow:
                      hover || scrubbing
                        ? "0 0 0 1.5px hsl(var(--primary)), 0 0 10px 2px hsl(var(--primary) / 0.55), 0 1px 3px rgb(0 0 0 / 0.35)"
                        : "0 0 0 1.5px hsl(var(--primary)), 0 0 6px 1px hsl(var(--primary) / 0.4), 0 1px 2px rgb(0 0 0 / 0.28)",
                  }
                : null),
            }}
          />
        </div>
      </div>

      {!flush && (
        <span className="w-10 shrink-0 text-[11px] font-medium tabular-nums tracking-wide text-muted-foreground/80">
          {formatDuration(duration)}
        </span>
      )}
    </div>
  );
}
