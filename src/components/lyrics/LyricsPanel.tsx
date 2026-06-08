import { useEffect, useRef, useState } from "react"
import { X, AArrowUp, AArrowDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { usePlayerStore } from "@/stores/playerStore"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const FONT_MIN = 0.85
const FONT_MAX = 1.8
const FONT_STEP = 0.15
const LYRIC_FONT_KEY = "museek.lyricFontScale"
// Soft fade at the top & bottom of the lyric column so lines ease in/out.
const FADE = "linear-gradient(to bottom, transparent 0%, #000 16%, #000 84%, transparent 100%)"

export function LyricsPanel() {
  const { currentSong, lyricLines, currentLyricIndex, showLyrics, currentPicUrl, isPlaying, setShowLyrics, seek } =
    usePlayerStore()
  const t = useT()
  const [fontScale, setFontScale] = useState(() => {
    const v = parseFloat(localStorage.getItem(LYRIC_FONT_KEY) ?? "")
    return Number.isFinite(v) ? Math.min(FONT_MAX, Math.max(FONT_MIN, v)) : 1
  })
  const lineRefs = useRef<(HTMLDivElement | null)[]>([])

  // Keep the active line centered as playback progresses.
  useEffect(() => {
    if (currentLyricIndex >= 0) {
      lineRefs.current[currentLyricIndex]?.scrollIntoView({ behavior: "smooth", block: "center" })
    }
  }, [currentLyricIndex])

  // The panel stays mounted (it only toggles visibility), so opening it mid-song
  // wouldn't re-trigger the scroll above. Jump straight to the current line when
  // the panel opens — instantly, not a slow scroll from the top. rAF waits for
  // the lyric list to lay out; read the index fresh in case it advanced.
  useEffect(() => {
    if (!showLyrics) return
    const id = requestAnimationFrame(() => {
      const idx = usePlayerStore.getState().currentLyricIndex
      if (idx >= 0) {
        lineRefs.current[idx]?.scrollIntoView({ behavior: "auto", block: "center" })
      }
    })
    return () => cancelAnimationFrame(id)
  }, [showLyrics])

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

  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-background">
      {/* Heavily-blurred album cover as the backdrop (premium look); the gradient
          is the fallback when the track has no cover. A scrim keeps text legible. */}
      {currentPicUrl ? (
        <div
          className="absolute inset-0 scale-125 bg-cover bg-center"
          style={{ backgroundImage: `url(${currentPicUrl})`, filter: "blur(64px) saturate(1.5)" }}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-background to-secondary/30" />
      )}
      <div className="absolute inset-0 bg-background/55 backdrop-blur-2xl" />

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
              <p className="text-2xl font-bold truncate" title={currentSong.name}>
                {currentSong.name}
              </p>
              <p className="text-muted-foreground mt-1.5 truncate" title={currentSong.singer}>
                {currentSong.singer}
              </p>
            </div>
          )}
          <div
            className={cn(
              "w-60 h-60 rounded-2xl bg-muted overflow-hidden shadow-2xl shrink-0",
              isPlaying && "lyric-cover-float"
            )}
          >
            {currentPicUrl ? (
              <img src={currentPicUrl} alt="album" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                {t("lyrics.noCover")}
              </div>
            )}
          </div>
        </div>

        {/* Right: centered lyrics with a top/bottom fade */}
        <div className="flex-1 min-h-0" style={{ maskImage: FADE, WebkitMaskImage: FADE }}>
          <ScrollArea className="h-full">
            {lyricLines.length === 0 ? (
              <div className="flex items-center justify-center h-full min-h-[60vh] text-muted-foreground">
                {currentSong ? t("lyrics.empty") : t("lyrics.selectSong")}
              </div>
            ) : (
              <div className="py-[42vh] px-10 text-center">
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
                        "py-2.5 cursor-pointer transition-all duration-300",
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
