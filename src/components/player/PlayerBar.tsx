import { Music, ListMusic, MicVocal, Search, Maximize2, Loader2 } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Controls } from "./Controls"
import { ProgressSlider } from "./ProgressSlider"
import { VolumeControl } from "./VolumeControl"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { PlatformBadge, QualityBadge, PLATFORM_BRAND } from "@/components/common/MetaBadges"
import { PLATFORM_ORDER } from "@/components/common/PlatformTabs"
import { usePlayerStore } from "@/stores/playerStore"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { Source } from "@/types/music"

export function PlayerBar() {
  const {
    currentSong,
    currentQuality,
    currentPicUrl,
    queue,
    showQueue,
    showLyrics,
    status,
    setShowQueue,
    setShowLyrics,
  } = usePlayerStore()
  const t = useT()
  const navigate = useNavigate()

  const loading = status === "loading"
  // Prefer the resolved cover; while loading fall back to the song's own pic so
  // the art doesn't blank out — the spinner overlay still signals resolving.
  const coverSrc = currentPicUrl ?? currentSong?.meta.picUrl ?? null

  // Jump to the search page pre-filled with this song on another platform — handy
  // when the current platform's copy is VIP/unavailable.
  const searchOther = (platform: Source) => {
    if (!currentSong) return
    const query = `${currentSong.name} ${currentSong.singer}`.trim()
    navigate("/search", { state: { searchSong: { platform, query } } })
  }

  return (
    <footer
      className={cn(
        "shrink-0 flex flex-col gap-0.5 border-t border-border/50",
        "bg-player/85 backdrop-blur-xl supports-[backdrop-filter]:bg-player/70",
        "shadow-[0_-8px_24px_-16px_hsl(30_20%_10%/0.12)]"
      )}
    >
      {/* Full-width progress bar across the top — modern player layout */}
      <ProgressSlider />

      <div className="flex items-center px-4 pb-3.5 gap-4">
        {/* Left: Song info */}
        <div className="flex items-center gap-3.5 w-72 shrink-0">
          {coverSrc ? (
            <button
              type="button"
              onClick={() => !loading && setShowLyrics(true)}
              title={t("player.lyrics")}
              disabled={loading}
              // Outer owns shadow + scale; inner clips overlay so it never paints past rounded corners.
              className="group relative h-12 w-12 shrink-0 transition-transform duration-200 ease-out hover:scale-[1.03] active:scale-[0.96] disabled:pointer-events-none"
            >
              <span className="absolute inset-0 overflow-hidden rounded-xl shadow-[var(--shadow-border)]">
                <img
                  src={coverSrc}
                  alt=""
                  className={cn(
                    "h-full w-full object-cover transition-opacity duration-200",
                    loading && "opacity-60"
                  )}
                />
                {loading ? (
                  <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/45">
                    <Loader2 size={18} className="animate-spin text-white" />
                  </span>
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/45 opacity-0 transition-opacity duration-200 group-hover:opacity-100 icon-hover-maximize">
                    <Maximize2 size={15} className="text-white icon-play-pop" />
                  </span>
                )}
              </span>
            </button>
          ) : (
            <div className="relative h-12 w-12 rounded-xl bg-muted flex items-center justify-center overflow-hidden shrink-0 shadow-[var(--shadow-border)]">
              {loading ? (
                <Loader2 size={18} className="animate-spin text-muted-foreground" />
              ) : (
                <Music size={20} className="text-muted-foreground" />
              )}
            </div>
          )}
          {currentSong ? (
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-sm font-semibold tracking-tight truncate" title={currentSong.name}>
                  {currentSong.name}
                </p>
                <PlatformBadge source={currentSong.source} />
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-xs text-muted-foreground truncate min-w-0" title={currentSong.singer}>
                  {currentSong.singer}
                </p>
                <QualityBadge quality={currentQuality} />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("player.empty")}</p>
          )}
        </div>

        {/* Center: Controls */}
        <div className="flex-1 flex justify-center">
          <Controls />
        </div>

        {/* Right: Volume + Lyrics + Queue */}
        <div className="flex items-center gap-1 w-72 justify-end shrink-0">
          <VolumeControl />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 icon-hover-search"
                disabled={!currentSong}
                title={t("player.searchOther")}
              >
                <Search size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-48">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                {t("player.searchOther")}
              </DropdownMenuLabel>
              {PLATFORM_ORDER.filter((s) => s !== currentSong?.source).map((s) => (
                <DropdownMenuItem key={s} onClick={() => searchOther(s)}>
                  <span className="h-2 w-2 rounded-full mr-2 shrink-0" style={{ backgroundColor: PLATFORM_BRAND[s] }} />
                  {t(`platform.${s}`)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-9 w-9 shrink-0 icon-hover-mic", showLyrics && "text-primary")}
            onClick={() => setShowLyrics(!showLyrics)}
            disabled={!currentSong}
            title={t("player.lyrics")}
          >
            <MicVocal size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-9 w-9 shrink-0 icon-hover-list", showQueue && "text-primary")}
            onClick={() => setShowQueue(!showQueue)}
            disabled={queue.length === 0}
            title={t("player.queue")}
          >
            <ListMusic size={16} />
          </Button>
        </div>
      </div>
    </footer>
  )
}
