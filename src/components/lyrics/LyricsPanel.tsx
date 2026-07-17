import { useCallback, useEffect, useRef, useState } from "react"
import { X, AArrowUp, AArrowDown, Loader2, Music, Maximize2, Minimize2, Heart, Play, Pause } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { CoverImage } from "@/components/common/CoverImage"
import { SpecularFrame } from "@/components/common/SpecularFrame"
import { usePlayerStore } from "@/stores/playerStore"
import { usePlaylistStore } from "@/stores/playlistStore"
import { hiResCover } from "@/lib/cover"
import {
  enterLyricsFullscreen,
  exitLyricsFullscreen,
  isLyricsFullscreenSession,
  syncLyricsFullscreenState,
} from "@/lib/lyricsFullscreen"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const FONT_MIN = 0.85
const FONT_MAX = 1.8
const FONT_STEP = 0.15
const LYRIC_FONT_KEY = "museek.lyricFontScale"
const SLIDE_MS = 320
const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
const FADE = "linear-gradient(to bottom, transparent 0%, #000 16%, #000 84%, transparent 100%)"

export function LyricsPanel() {
  const currentSong = usePlayerStore((s) => s.currentSong)
  const lyricLines = usePlayerStore((s) => s.lyricLines)
  const currentLyricIndex = usePlayerStore((s) => s.currentLyricIndex)
  const showLyrics = usePlayerStore((s) => s.showLyrics)
  const lyricsLoading = usePlayerStore((s) => s.lyricsLoading)
  const currentPicUrl = usePlayerStore((s) => s.currentPicUrl)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const status = usePlayerStore((s) => s.status)
  const setShowLyrics = usePlayerStore((s) => s.setShowLyrics)
  const seek = usePlayerStore((s) => s.seek)
  const togglePlay = usePlayerStore((s) => s.togglePlay)
  const fav = usePlaylistStore((s) =>
    currentSong ? s.favorites.some((f) => f.id === currentSong.id) : false,
  )
  const addToFavorites = usePlaylistStore((s) => s.addToFavorites)
  const removeFromFavorites = usePlaylistStore((s) => s.removeFromFavorites)
  const t = useT()
  const [fontScale, setFontScale] = useState(() => {
    const v = parseFloat(localStorage.getItem(LYRIC_FONT_KEY) ?? "")
    return Number.isFinite(v) ? Math.min(FONT_MAX, Math.max(FONT_MIN, v)) : 1
  })
  const [rendered, setRendered] = useState(showLyrics)
  const [entered, setEntered] = useState(false)
  const [immersive, setImmersive] = useState(false)
  const lineRefs = useRef<(HTMLDivElement | null)[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  const thumbSrc = currentPicUrl ?? currentSong?.meta.picUrl ?? null
  const heroSrc = thumbSrc ? (hiResCover(thumbSrc, currentSong?.source) ?? thumbSrc) : null
  const needsHeroUpgrade = !!heroSrc && !!thumbSrc && heroSrc !== thumbSrc

  useEffect(() => {
    if (showLyrics) {
      setRendered(true)
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setEntered(true))
      })
      return () => cancelAnimationFrame(id)
    }
    setEntered(false)
    setImmersive(false)
    void exitLyricsFullscreen()
    const timer = window.setTimeout(() => setRendered(false), SLIDE_MS)
    return () => window.clearTimeout(timer)
  }, [showLyrics])

  useEffect(() => {
    if (!showLyrics || !isTauri || !immersive) return
    let unlisten: (() => void) | undefined
    let cancelled = false
    void (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window")
      const win = getCurrentWindow()
      unlisten = await win.onResized(() => {
        void (async () => {
          const still = await syncLyricsFullscreenState()
          if (!cancelled && !still) setImmersive(false)
        })()
      })
    })()
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [showLyrics, immersive])

  const centerActiveLine = useCallback((behavior: ScrollBehavior) => {
    const idx = usePlayerStore.getState().currentLyricIndex
    const line = lineRefs.current[idx]
    const root = scrollRef.current
    if (idx < 0 || !line || !root) return
    const viewport = root.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]")
    if (!viewport) return
    const vp = viewport.getBoundingClientRect()
    const lr = line.getBoundingClientRect()
    const delta = lr.top + lr.height / 2 - (vp.top + vp.height / 2)
    viewport.scrollTo({ top: viewport.scrollTop + delta, behavior })
  }, [])

  useEffect(() => {
    if (currentLyricIndex >= 0 && entered) centerActiveLine("smooth")
  }, [currentLyricIndex, centerActiveLine, entered])

  useEffect(() => {
    if (!entered || (lyricsLoading && lyricLines.length === 0) || lyricLines.length === 0) return
    const id = requestAnimationFrame(() => centerActiveLine("auto"))
    return () => cancelAnimationFrame(id)
  }, [entered, lyricsLoading, lyricLines.length, centerActiveLine])

  useEffect(() => {
    if (!showLyrics) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (isLyricsFullscreenSession() || immersive) {
        e.preventDefault()
        void (async () => {
          await exitLyricsFullscreen()
          setImmersive(false)
        })()
        return
      }
      setShowLyrics(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [showLyrics, setShowLyrics, immersive])

  const toggleImmersive = async () => {
    if (!isTauri) return
    if (immersive || isLyricsFullscreenSession()) {
      await exitLyricsFullscreen()
      setImmersive(false)
      return
    }
    const ok = await enterLyricsFullscreen()
    setImmersive(ok)
  }

  const closeLyrics = () => {
    void exitLyricsFullscreen().finally(() => {
      setImmersive(false)
      setShowLyrics(false)
    })
  }

  if (!rendered) return null

  const setScale = (v: number) => {
    setFontScale(v)
    localStorage.setItem(LYRIC_FONT_KEY, String(v))
  }
  const dec = () => setScale(Math.max(FONT_MIN, +(fontScale - FONT_STEP).toFixed(2)))
  const inc = () => setScale(Math.min(FONT_MAX, +(fontScale + FONT_STEP).toFixed(2)))
  const showBlur = !!thumbSrc

  const coverArt = (
    <div className="group/cover relative h-full w-full bg-muted/50">
      {thumbSrc ? (
        <>
          <img
            src={thumbSrc}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            decoding="async"
          />
          {needsHeroUpgrade && (
            <CoverImage
              src={heroSrc}
              alt="album"
              loading="eager"
              className="absolute inset-0 !outline-none"
            />
          )}
        </>
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted/60 text-muted-foreground/50">
          <Music size={36} strokeWidth={1.5} className="animate-pulse" />
          <span className="text-xs">{t("lyrics.noCover")}</span>
        </div>
      )}
      {currentSong && (
        <button
          type="button"
          onClick={() => togglePlay()}
          disabled={status === "idle"}
          className={cn(
            "absolute inset-0 z-[2] flex items-center justify-center",
            "bg-black/40 opacity-0 transition-opacity duration-200 ease-out",
            "group-hover/cover:opacity-100 focus-visible:opacity-100",
            "disabled:pointer-events-none",
          )}
          title={isPlaying ? t("common.pause") : t("common.play")}
        >
          <span className="text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.55)] transition-transform duration-200 ease-out active:scale-[0.96]">
            {status === "loading" ? (
              <Loader2 size={40} className="animate-spin" strokeWidth={2} />
            ) : isPlaying ? (
              <Pause size={42} fill="currentColor" strokeWidth={0} />
            ) : (
              <Play size={42} fill="currentColor" strokeWidth={0} className="ml-1" />
            )}
          </span>
        </button>
      )}
    </div>
  )

  return (
    <div
      className={cn(
        "absolute inset-0 z-40 flex flex-col overflow-hidden bg-background",
        "transition-transform duration-[320ms] will-change-transform",
        entered ? "translate-y-0 ease-out" : "translate-y-full ease-in"
      )}
      aria-hidden={!entered}
    >
      {thumbSrc ? (
        <div
          className={cn(
            "absolute inset-0 scale-125 bg-cover bg-center transition-opacity duration-500 ease-out",
            showBlur ? "opacity-100" : "opacity-0"
          )}
          style={{ backgroundImage: `url(${thumbSrc})`, filter: "blur(80px) saturate(1.5)" }}
        />
      ) : null}
      <div
        className={cn(
          "absolute inset-0 bg-gradient-to-br from-primary/30 via-background to-secondary/30 transition-opacity duration-500 ease-out",
          showBlur ? "opacity-0" : "opacity-100"
        )}
      />
      <div className="absolute inset-0 bg-background/65" />

      <Button
        variant="ghost"
        size="icon"
        className="absolute top-4 right-4 z-20 h-9 w-9 text-muted-foreground/70 hover:text-foreground"
        onClick={closeLyrics}
      >
        <X size={20} />
      </Button>

      <div className="absolute right-4 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-1">
        {isTauri && (
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground/55 hover:text-muted-foreground"
            onClick={() => void toggleImmersive()}
            title={t(immersive ? "lyrics.exitFullscreen" : "lyrics.fullscreen")}
          >
            {immersive ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground/55 hover:text-muted-foreground"
          onClick={inc}
          disabled={fontScale >= FONT_MAX}
          title={t("lyrics.fontIncrease")}
        >
          <AArrowUp size={20} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground/55 hover:text-muted-foreground"
          onClick={dec}
          disabled={fontScale <= FONT_MIN}
          title={t("lyrics.fontDecrease")}
        >
          <AArrowDown size={20} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-9 w-9 icon-hover-heart",
            fav ? "text-red-500 hover:text-red-500" : "text-muted-foreground/55 hover:text-muted-foreground",
          )}
          onClick={() => {
            if (!currentSong) return
            if (fav) removeFromFavorites(currentSong.id)
            else addToFavorites(currentSong)
          }}
          disabled={!currentSong}
          title={t(fav ? "common.unfavorite" : "common.favorite")}
        >
          <Heart
            key={fav ? "on" : "off"}
            size={18}
            fill={fav ? "currentColor" : "none"}
            className={fav ? "icon-heart-burst" : undefined}
          />
        </Button>
      </div>

      <div className="relative z-10 flex h-full min-h-0">
        <div className="flex w-2/5 shrink-0 flex-col items-center justify-center gap-6 overflow-visible p-12">
          {currentSong && (
            <div className="text-center max-w-xs">
              <p className="text-2xl font-semibold truncate tracking-tight" title={currentSong.name}>
                {currentSong.name}
              </p>
              <p className="text-muted-foreground mt-1.5 truncate" title={currentSong.singer}>
                {currentSong.singer}
              </p>
            </div>
          )}
          {isPlaying ? (
            <div className="lyric-cover-float shrink-0">
              <SpecularFrame
                autoAnimate
                followMouse={false}
                className="h-60 w-60"
                radius={16}
                lineColor="#ffffff"
                baseColor="#9ca3af"
                intensity={1.85}
                shineSize={18}
                shineFade={28}
                thickness={0.8}
                speed={-0.5}
              >
                {coverArt}
              </SpecularFrame>
            </div>
          ) : (
            <div className="h-60 w-60 shrink-0 overflow-hidden rounded-2xl shadow-[0_20px_40px_-12px_rgba(0,0,0,0.35)]">
              {coverArt}
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0" style={{ maskImage: FADE, WebkitMaskImage: FADE }}>
          <ScrollArea ref={scrollRef} className="h-full">
            {lyricsLoading && lyricLines.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 h-full min-h-[60vh] text-muted-foreground">
                <Loader2 size={28} className="animate-spin" />
                <p className="text-sm">{t("lyrics.loading")}</p>
              </div>
            ) : lyricLines.length === 0 ? (
              <div className="flex items-center justify-center h-full min-h-[60vh] text-muted-foreground">
                {currentSong ? t("lyrics.empty") : t("lyrics.selectSong")}
              </div>
            ) : (
              <div className="py-[42vh] pl-4 pr-24 text-center animate-in fade-in duration-300">
                {lyricLines.map((line, i) => {
                  const active = i === currentLyricIndex
                  return (
                    <div
                      key={i}
                      ref={(el) => {
                        lineRefs.current[i] = el
                      }}
                      onClick={() => seek(line.time)}
                      className={cn(
                        "py-2.5 cursor-pointer transition-[color,font-size] duration-300 ease-out",
                        active
                          ? "text-primary font-semibold"
                          : "text-muted-foreground/50 hover:text-muted-foreground"
                      )}
                      style={{ fontSize: `${(active ? 1.4 : 1.05) * fontScale}rem` }}
                    >
                      <p>{line.text}</p>
                      {line.translation && (
                        <p className="mt-1 opacity-80" style={{ fontSize: `${(active ? 1.0 : 0.85) * fontScale}rem` }}>
                          {line.translation}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}
