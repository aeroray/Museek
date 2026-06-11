import { Music, ListMusic, MicVocal, Search } from "lucide-react"
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
  const { currentSong, currentQuality, currentPicUrl, showQueue, showLyrics, setShowQueue, setShowLyrics } =
    usePlayerStore()
  const t = useT()
  const navigate = useNavigate()

  // Jump to the search page pre-filled with this song on another platform — handy
  // when the current platform's copy is VIP/unavailable.
  const searchOther = (platform: Source) => {
    if (!currentSong) return
    const query = `${currentSong.name} ${currentSong.singer}`.trim()
    navigate("/search", { state: { searchSong: { platform, query } } })
  }

  return (
    <footer className="border-t border-border bg-card shrink-0 flex flex-col gap-1">
      {/* Full-width progress bar across the top — modern player layout */}
      <ProgressSlider />

      <div className="flex items-center px-4 pb-3 gap-4">
        {/* Left: Song info */}
        <div className="flex items-center gap-4 w-72 shrink-0">
          <div className="h-12 w-12 rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0">
            {currentPicUrl ? (
              <img src={currentPicUrl} alt="album art" className="h-full w-full object-cover" />
            ) : (
              <Music size={20} className="text-muted-foreground" />
            )}
          </div>
          {currentSong ? (
            <div className="min-w-0 space-y-1.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <p className="text-sm font-medium truncate" title={currentSong.name}>
                  {currentSong.name}
                </p>
                <PlatformBadge source={currentSong.source} />
              </div>
              <div className="flex items-center gap-2.5 min-w-0">
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
                className="h-8 w-8 shrink-0"
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
            className={cn("h-8 w-8 shrink-0", showLyrics && "text-primary")}
            onClick={() => setShowLyrics(!showLyrics)}
            disabled={!currentSong}
            title={t("player.lyrics")}
          >
            <MicVocal size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8 shrink-0", showQueue && "text-primary")}
            onClick={() => setShowQueue(!showQueue)}
            title={t("player.queue")}
          >
            <ListMusic size={16} />
          </Button>
        </div>
      </div>
    </footer>
  )
}
