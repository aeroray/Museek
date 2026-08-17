import { useEffect, useRef, useState } from "react"
import {
  Expand,
  Music,
  Loader2,
  SkipBack,
  SkipForward,
  Play,
  Pause,
  ListMusic,
  X,
  Heart,
  Repeat,
  Repeat1,
  Shuffle,
  ListOrdered,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip"
import {
  exitMiniPlayer,
  notifyMiniPointerEnter,
  notifyMiniPointerLeave,
  setMiniQueueExpanded,
  syncMiniQueueWindowSize,
} from "@/lib/miniPlayer"
import { usePlayerStore } from "@/stores/playerStore"
import { usePlaylistStore } from "@/stores/playlistStore"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

function ModeIcon({ playMode }: { playMode: string }) {
  const common = { size: 14 as const }
  if (playMode === "repeat-one") return <Repeat1 {...common} />
  if (playMode === "shuffle") return <Shuffle {...common} />
  if (playMode === "repeat-list") return <Repeat {...common} />
  return <ListOrdered {...common} />
}

function modeHoverClass(playMode: string) {
  if (playMode === "shuffle") return "icon-hover-shuffle"
  if (playMode === "repeat-one" || playMode === "repeat-list") return "icon-hover-repeat"
  return "icon-hover-list"
}

/**
 * Compact always-on-top mini bar. Docked to a screen edge it peeks as cover-only;
 * hover expands the full transport bar again.
 */
export function MiniPlayer() {
  const t = useT()
  const currentSong = usePlayerStore((s) => s.currentSong)
  const currentPicUrl = usePlayerStore((s) => s.currentPicUrl)
  const status = usePlayerStore((s) => s.status)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const playMode = usePlayerStore((s) => s.playMode)
  const setPlayMode = usePlayerStore((s) => s.setPlayMode)
  const queue = usePlayerStore((s) => s.queue)
  const queueIndex = usePlayerStore((s) => s.queueIndex)
  const miniPeek = usePlayerStore((s) => s.miniPeek)
  const miniMorphing = usePlayerStore((s) => s.miniMorphing)
  const miniDockHint = usePlayerStore((s) => s.miniDockHint)
  const togglePlay = usePlayerStore((s) => s.togglePlay)
  const playPending = usePlayerStore((s) => s.playPending)
  const next = usePlayerStore((s) => s.next)
  const prev = usePlayerStore((s) => s.prev)
  const playFromQueue = usePlayerStore((s) => s.playFromQueue)

  const favorites = usePlaylistStore((s) => s.favorites)
  const addToFavorites = usePlaylistStore((s) => s.addToFavorites)
  const removeFromFavorites = usePlaylistStore((s) => s.removeFromFavorites)

  const [queueOpen, setQueueOpen] = useState(false)
  const queueScrollTopRef = useRef(0)
  const queuePanelRef = useRef<HTMLDivElement>(null)

  const loading = status === "loading"
  const playBusy = loading || playPending
  const canPlay = status !== "idle"
  const coverSrc = currentPicUrl ?? currentSong?.meta.picUrl ?? null
  const isLocal = currentSong?.source === "local"
  const fav = !!currentSong && !isLocal && favorites.some((f) => f.id === currentSong.id)

  const saveQueueScroll = () => {
    const vp = queuePanelRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]",
    ) as HTMLElement | null
    if (vp) queueScrollTopRef.current = vp.scrollTop
  }

  const closeQueue = () => {
    setQueueOpen((open) => {
      if (!open) return open
      saveQueueScroll()
      void setMiniQueueExpanded(false)
      return false
    })
  }

  // Auto-collapse the queue when the mini window loses focus.
  useEffect(() => {
    if (!queueOpen) return
    const onBlur = () => closeQueue()
    window.addEventListener("blur", onBlur)
    let unlisten: (() => void) | undefined
    if (isTauri) {
      void (async () => {
        const { getCurrentWindow } = await import("@tauri-apps/api/window")
        unlisten = await getCurrentWindow().onFocusChanged(({ payload: focused }) => {
          if (!focused) closeQueue()
        })
      })()
    }
    return () => {
      window.removeEventListener("blur", onBlur)
      unlisten?.()
    }
  }, [queueOpen])

  // Restore the last scroll offset after the queue panel remounts.
  useEffect(() => {
    if (!queueOpen || queue.length === 0) return
    let cancelled = false
    const restore = () => {
      if (cancelled) return
      const vp = queuePanelRef.current?.querySelector(
        "[data-radix-scroll-area-viewport]",
      ) as HTMLElement | null
      if (vp) vp.scrollTop = queueScrollTopRef.current
    }
    // Double rAF: wait until Radix viewport has laid out after expand.
    const outer = requestAnimationFrame(() => {
      requestAnimationFrame(restore)
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(outer)
    }
  }, [queueOpen, queue.length])

  // Keep the mini window height in sync with queue length (1–4 rows).
  useEffect(() => {
    if (!queueOpen) return
    void syncMiniQueueWindowSize()
  }, [queueOpen, queue.length])

  const toggleFav = () => {
    if (!currentSong || isLocal) return
    if (fav) removeFromFavorites(currentSong.id)
    else addToFavorites(currentSong)
  }

  const cyclePlayMode = () => {
    const modes = ["sequence", "shuffle", "repeat-list", "repeat-one"] as const
    const idx = modes.indexOf(playMode)
    setPlayMode(modes[(idx + 1) % modes.length])
  }

  const toggleQueue = () => {
    if (queueOpen) {
      saveQueueScroll()
      setQueueOpen(false)
      void setMiniQueueExpanded(false)
    } else {
      setQueueOpen(true)
      void setMiniQueueExpanded(true)
    }
  }

  const removeAt = (i: number) => {
    const { queue: q, queueIndex: idx } = usePlayerStore.getState()
    const nextQ = [...q]
    nextQ.splice(i, 1)
    const patch: { queue: typeof nextQ; queueIndex?: number } = { queue: nextQ }
    if (i < idx) patch.queueIndex = idx - 1
    else if (i === idx) patch.queueIndex = nextQ.length === 0 ? -1 : Math.min(i, nextQ.length - 1)
    usePlayerStore.setState(patch)
  }

  const cover = miniPeek ? (
    <div
      className={cn(
        // Fixed 64px circle — stays round while the window morphs bar ↔ peek.
        "mini-vinyl relative shrink-0 overflow-hidden rounded-full",
        isPlaying && !loading ? "mini-vinyl-spin" : !miniMorphing && "mini-vinyl-enter",
      )}
      data-tauri-drag-region
    >
      <div className="mini-vinyl-grooves pointer-events-none absolute inset-0 rounded-full" aria-hidden />
      <div className="mini-vinyl-label absolute inset-[21%] overflow-hidden rounded-full bg-muted">
        {coverSrc ? (
          <img
            src={coverSrc}
            alt=""
            className={cn("h-full w-full object-cover", loading && "opacity-60")}
            draggable={false}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-600 to-neutral-900 text-white/75">
            <Music size={15} />
          </div>
        )}
      </div>
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-neutral-950 ring-[1.5px] ring-white/20"
        aria-hidden
      />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/35">
          <Loader2 size={15} className="animate-spin text-white" />
        </div>
      )}
    </div>
  ) : (
    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-muted shadow-[var(--shadow-border)]">
      {coverSrc ? (
        <img
          src={coverSrc}
          alt=""
          className={cn("h-full w-full object-cover", loading && "opacity-60")}
          draggable={false}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          <Music size={18} />
        </div>
      )}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <Loader2 size={14} className="animate-spin text-white" />
        </div>
      )}
    </div>
  )

  if (miniPeek) {
    return (
      <div
        className="flex h-full w-full items-center justify-center bg-transparent"
        data-tauri-drag-region
        onMouseEnter={() => notifyMiniPointerEnter()}
        onMouseLeave={() => notifyMiniPointerLeave()}
      >
        {cover}
      </div>
    )
  }

  return (
    <div
      className={cn(
        "relative flex h-full w-full flex-col overflow-hidden",
        "bg-player/90 backdrop-blur-xl supports-[backdrop-filter]:bg-player/75",
        miniDockHint && "mini-dock-hint",
        miniDockHint === "left" && "mini-dock-hint-left",
        miniDockHint === "right" && "mini-dock-hint-right",
        miniDockHint === "top" && "mini-dock-hint-top",
        miniDockHint === "bottom" && "mini-dock-hint-bottom",
      )}
      onMouseEnter={() => notifyMiniPointerEnter()}
      onMouseLeave={() => {
        if (queueOpen) closeQueue()
        notifyMiniPointerLeave()
      }}
    >
      {/* Transport bar */}
      <div className="flex h-[72px] shrink-0 items-center gap-2 px-2.5" data-tauri-drag-region>
        {cover}

        <div className="min-w-0 flex-1" data-tauri-drag-region>
          {currentSong ? (
            <>
              <p className="truncate text-sm font-semibold tracking-tight leading-tight" title={currentSong.name}>
                {currentSong.name}
              </p>
              <p className="truncate text-[11px] text-muted-foreground leading-tight" title={currentSong.singer}>
                {currentSong.singer}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("player.empty")}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn("h-7 w-7 text-muted-foreground", modeHoverClass(playMode))}
            title={t(`playMode.${playMode}`)}
            onClick={cyclePlayMode}
          >
            <span key={playMode} className="icon-pop-in">
              <ModeIcon playMode={playMode} />
            </span>
          </Button>
          <ShortcutTooltip label={t("player.prev")} action="prev">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground icon-hover-skip-prev"
              disabled={!canPlay || playBusy}
              onClick={() => void prev()}
            >
              <SkipBack size={15} />
            </Button>
          </ShortcutTooltip>
          <ShortcutTooltip
            label={t(isPlaying ? "player.pause" : "player.play")}
            action="playPause"
          >
            <Button
              type="button"
              variant="default"
              size="icon"
              className="h-9 w-9 rounded-full shadow-[var(--shadow-elevated)]"
              disabled={!canPlay || playBusy}
              onClick={() => togglePlay()}
            >
              {playBusy ? (
                <Loader2 size={15} className="animate-spin" />
              ) : isPlaying ? (
                <Pause size={15} fill="currentColor" strokeWidth={0} />
              ) : (
                <Play size={15} fill="currentColor" strokeWidth={0} className="ml-0.5" />
              )}
            </Button>
          </ShortcutTooltip>
          <ShortcutTooltip label={t("player.next")} action="next">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground icon-hover-skip-next"
              disabled={!canPlay || playBusy}
              onClick={() => void next()}
            >
              <SkipForward size={15} />
            </Button>
          </ShortcutTooltip>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "h-7 w-7 icon-hover-heart",
              fav ? "text-red-500 hover:text-red-500" : "text-muted-foreground",
            )}
            onClick={toggleFav}
            disabled={!currentSong || isLocal}
            title={isLocal ? t("local.favoriteDisabled") : t("common.favorite")}
          >
            <Heart
              key={fav ? "on" : "off"}
              size={14}
              fill={fav ? "currentColor" : "none"}
              className={fav ? "icon-heart-burst" : undefined}
            />
          </Button>
        </div>

        <div className="flex shrink-0 items-center gap-0.5 border-l border-border/50 pl-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn("h-7 w-7 icon-hover-list", queueOpen ? "text-primary" : "text-muted-foreground")}
            title={t("player.queue")}
            disabled={queue.length === 0 && !queueOpen}
            onClick={toggleQueue}
          >
            <ListMusic size={14} />
          </Button>
          <ShortcutTooltip label={t("player.exitMini")} action="mini">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground icon-hover-maximize"
              onClick={() => void exitMiniPlayer()}
            >
              <Expand size={14} />
            </Button>
          </ShortcutTooltip>
        </div>
      </div>

      {queueOpen && (
        <div ref={queuePanelRef} className="flex min-h-0 flex-1 flex-col border-t border-border/50">
          {queue.length === 0 ? (
            <div className="flex flex-1 items-center justify-center px-3 text-xs text-muted-foreground">
              {t("queue.empty")}
            </div>
          ) : (
            <ScrollArea
              className="h-full"
              onScrollCapture={(e) => {
                const t = e.target as HTMLElement
                if (t.getAttribute("data-radix-scroll-area-viewport") != null) {
                  queueScrollTopRef.current = t.scrollTop
                }
              }}
            >
              <ul className="flex flex-col gap-0.5 p-1.5">
                {queue.map((item, i) => {
                  const active = i === queueIndex
                  return (
                    <li key={`${item.music.id}-${i}`}>
                      <div
                        role="button"
                        tabIndex={0}
                        className={cn(
                          "group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                          active ? "bg-primary/10" : "hover:bg-accent/60",
                        )}
                        onClick={() => void playFromQueue(i)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            void playFromQueue(i)
                          }
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              "truncate text-xs font-medium leading-tight",
                              active && "text-primary",
                            )}
                            title={item.music.name}
                          >
                            {item.music.name}
                          </p>
                          <p
                            className="truncate text-[10px] leading-tight text-muted-foreground"
                            title={item.music.singer}
                          >
                            {item.music.singer}
                          </p>
                        </div>
                        <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground/80">
                          {item.music.interval || "--:--"}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className={cn(
                            "h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive",
                            "opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
                          )}
                          title={t("local.remove")}
                          onClick={(e) => {
                            e.stopPropagation()
                            removeAt(i)
                          }}
                        >
                          <X size={13} />
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </ScrollArea>
          )}
        </div>
      )}
    </div>
  )
}
