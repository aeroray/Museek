import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { X, AArrowUp, AArrowDown, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { CoverImage } from "@/components/common/CoverImage"
import { usePlayerStore } from "@/stores/playerStore"
import { hiResCover } from "@/lib/cover"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const FONT_MIN = 0.85
const FONT_MAX = 1.8
const FONT_STEP = 0.15
const LYRIC_FONT_KEY = "museek.lyricFontScale"
// Soft fade at the top & bottom of the lyric column so lines ease in/out.
const FADE = "linear-gradient(to bottom, transparent 0%, #000 16%, #000 84%, transparent 100%)"

export function LyricsPanel() {
  const currentSong = usePlayerStore((s) => s.currentSong)
  const lyricLines = usePlayerStore((s) => s.lyricLines)
  const currentLyricIndex = usePlayerStore((s) => s.currentLyricIndex)
  const showLyrics = usePlayerStore((s) => s.showLyrics)
  const lyricsLoading = usePlayerStore((s) => s.lyricsLoading)
  const currentPicUrl = usePlayerStore((s) => s.currentPicUrl)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const setShowLyrics = usePlayerStore((s) => s.setShowLyrics)
  const seek = usePlayerStore((s) => s.seek)
  const t = useT()
  const [fontScale, setFontScale] = useState(() => {
    const v = parseFloat(localStorage.getItem(LYRIC_FONT_KEY) ?? "")
    return Number.isFinite(v) ? Math.min(FONT_MAX, Math.max(FONT_MIN, v)) : 1
  })
  const [coverReady, setCoverReady] = useState(false)
  const lineRefs = useRef<(HTMLDivElement | null)[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const coverSrc = currentPicUrl
    ? (hiResCover(currentPicUrl, currentSong?.source) ?? currentPicUrl)
    : null

  // Center the active lyric line by scrolling ONLY the lyric viewport — never via
  // element.scrollIntoView(), which also scrolls scrollable ancestors and the
  // window. In the Tauri webview that window-scroll dragged the whole (fixed)
  // panel up at the last line, leaking an unblurred strip at the bottom.
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

  // Keep the active line centered as playback progresses.
  useEffect(() => {
    if (currentLyricIndex >= 0) centerActiveLine("smooth")
  }, [currentLyricIndex, centerActiveLine])

  // Jump to the current line when the panel opens or lyrics finish loading.
  // rAF waits for the lyric list to lay out.
  useEffect(() => {
    if (!showLyrics || lyricsLoading || lyricLines.length === 0) return
    const id = requestAnimationFrame(() => centerActiveLine("auto"))
    return () => cancelAnimationFrame(id)
  }, [showLyrics, lyricsLoading, lyricLines.length, centerActiveLine])

  // Close the panel with Esc.
  useEffect(() => {
    if (!showLyrics) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowLyrics(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [showLyrics, setShowLyrics])

  if (!showLyrics) return null

  const setScale = (v: number) => {
    setFontScale(v)
    localStorage.setItem(LYRIC_FONT_KEY, String(v))
  }
  const dec = () => setScale(Math.max(FONT_MIN, +(fontScale - FONT_STEP).toFixed(2)))
  const inc = () => setScale(Math.min(FONT_MAX, +(fontScale + FONT_STEP).toFixed(2)))

  return createPortal(
    <div className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-background">
      {/* Heavily-blurred album cover as the backdrop; gradient is the fallback.
          Fades in with the same timing as CoverImage so the art doesn't pop. */}
      {currentPicUrl ? (
        <div
          className={cn(
            "absolute inset-0 scale-125 bg-cover bg-center transition-opacity duration-700 ease-out",
            coverReady ? "opacity-100" : "opacity-0"
          )}
          style={{ backgroundImage: `url(${currentPicUrl})`, filter: "blur(80px) saturate(1.5)" }}
        />
      ) : null}
      <div
        className={cn(
          "absolute inset-0 bg-gradient-to-br from-primary/30 via-background to-secondary/30 transition-opacity duration-700 ease-out",
          currentPicUrl && coverReady ? "opacity-0" : "opacity-100"
        )}
      />
      {/* Scrim tint for legibility — no viewport-sized backdrop-blur (WKWebView edge bug). */}
      <div className="absolute inset-0 bg-background/65" />

      {/* Top-right controls: font size + close */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={dec}
          disabled={fontScale <= FONT_MIN}
          title={t("lyrics.fontDecrease")}
        >
          <AArrowDown size={20} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={inc}
          disabled={fontScale >= FONT_MAX}
          title={t("lyrics.fontIncrease")}
        >
          <AArrowUp size={20} />
        </Button>
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setShowLyrics(false)}>
          <X size={20} />
        </Button>
      </div>

      <div className="relative z-10 flex h-full min-h-0">
        {/* Left: song info ABOVE the cover, vertically centered */}
        <div className="w-2/5 flex flex-col items-center justify-center gap-6 p-12 shrink-0">
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
          <div
            className={cn(
              "relative w-60 h-60 rounded-2xl overflow-hidden shadow-2xl shrink-0",
              isPlaying && "lyric-cover-float"
            )}
          >
            {isPlaying && <span className="lyric-cover-beam" aria-hidden="true" />}
            <div
              className={cn(
                "absolute z-[1] overflow-hidden bg-muted",
                isPlaying ? "inset-[2px] rounded-[14px]" : "inset-0 rounded-2xl"
              )}
            >
              {coverSrc ? (
                <CoverImage src={coverSrc} alt="album" loading="eager" onLoaded={setCoverReady} />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                  {t("lyrics.noCover")}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: centered lyrics with a top/bottom fade */}
        <div className="flex-1 min-h-0" style={{ maskImage: FADE, WebkitMaskImage: FADE }}>
          <ScrollArea ref={scrollRef} className="h-full">
            {lyricsLoading ? (
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
    </div>,
    document.body,
  )
}
