import { useNavigate } from "react-router-dom"
import {
  ArrowLeft,
  ArrowRight,
  Captions,
  CaptionsOff,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { WindowControls } from "./WindowControls"
import { useUiStore } from "@/stores/uiStore"
import { usePlayerStore } from "@/stores/playerStore"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/** Current lyric line for the top bar — opens the full lyrics panel on click. */
function TopBarLyrics() {
  const t = useT()
  const enabled = useUiStore((s) => s.topBarLyrics)
  const currentSong = usePlayerStore((s) => s.currentSong)
  const lyricLines = usePlayerStore((s) => s.lyricLines)
  const currentLyricIndex = usePlayerStore((s) => s.currentLyricIndex)
  const lyricsLoading = usePlayerStore((s) => s.lyricsLoading)
  const showLyrics = usePlayerStore((s) => s.showLyrics)
  const setShowLyrics = usePlayerStore((s) => s.setShowLyrics)

  if (!enabled) {
    return <div className="mx-2 min-w-0 flex-1" aria-hidden />
  }

  let text = ""
  let muted = true
  if (!currentSong) {
    text = ""
  } else if (lyricsLoading && lyricLines.length === 0) {
    text = t("lyrics.loading")
  } else if (lyricLines.length === 0) {
    text = currentSong.name
  } else {
    const idx = Math.max(0, currentLyricIndex)
    text = lyricLines[idx]?.text?.trim() || currentSong.name
    muted = false
  }

  if (!text) {
    return <div className="mx-2 min-w-0 flex-1" aria-hidden />
  }

  return (
    <button
      type="button"
      onClick={() => setShowLyrics(!showLyrics)}
      disabled={!currentSong}
      title={t("player.lyrics")}
      className={cn(
        "pointer-events-auto group relative mx-2 min-w-0 flex-1",
        "flex h-7 items-center justify-center rounded-md px-3",
        "transition-[background-color,color] duration-200 ease-out",
        "hover:bg-accent/60 disabled:pointer-events-none disabled:opacity-50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        showLyrics && "bg-primary/10",
      )}
    >
      <span
        key={`${currentSong?.id ?? "none"}-${currentLyricIndex}-${text}`}
        className={cn(
          "block max-w-full truncate text-center text-sm tracking-tight",
          "animate-in fade-in duration-300",
          muted ? "text-muted-foreground/70 font-normal" : "text-primary font-medium",
        )}
      >
        {text}
      </span>
    </button>
  )
}

/**
 * Slim top toolbar: sidebar toggle, top-bar lyrics toggle, live lyrics, nav + chrome.
 */
export function TopBar() {
  const navigate = useNavigate()
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const topBarLyrics = useUiStore((s) => s.topBarLyrics)
  const toggleTopBarLyrics = useUiStore((s) => s.toggleTopBarLyrics)
  const t = useT()

  return (
    <div
      data-tauri-drag-region
      className="h-10 shrink-0 flex items-center gap-0.5 border-b border-border/50 pl-2 pr-1"
    >
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground icon-hover-panel"
        onClick={toggleSidebar}
        title={sidebarCollapsed ? t("sidebar.expand") : t("sidebar.collapse")}
      >
        <span key={sidebarCollapsed ? "open" : "close"} className="icon-pop-in">
          {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </span>
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground icon-hover-captions"
        onClick={toggleTopBarLyrics}
        title={topBarLyrics ? t("topBar.lyricsHide") : t("topBar.lyricsShow")}
      >
        <span key={topBarLyrics ? "on" : "off"} className="icon-pop-in inline-flex">
          {topBarLyrics ? <Captions size={18} strokeWidth={2} /> : <CaptionsOff size={18} strokeWidth={2} />}
        </span>
      </Button>

      <TopBarLyrics />

      <div className="flex shrink-0 items-center gap-1">
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground icon-hover-arrow-left"
            onClick={() => navigate(-1)}
            title={t("nav.back")}
          >
            <ArrowLeft size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground icon-hover-arrow-right"
            onClick={() => navigate(1)}
            title={t("nav.forward")}
          >
            <ArrowRight size={16} />
          </Button>
        </div>
        <WindowControls />
      </div>
    </div>
  )
}
