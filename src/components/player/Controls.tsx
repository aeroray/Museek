import { SkipBack, SkipForward, Play, Pause, Repeat, Repeat1, Shuffle, Loader2, Heart, ListOrdered } from "lucide-react"
import { Button } from "@/components/ui/button"
import { usePlayerStore } from "@/stores/playerStore"
import { usePlaylistStore } from "@/stores/playlistStore"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

function ModeIcon({ playMode }: { playMode: string }) {
  const common = { size: 16 as const }
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

export function Controls() {
  const { isPlaying, playMode, status, currentSong, togglePlay, next, prev, setPlayMode } = usePlayerStore()
  const favorites = usePlaylistStore((s) => s.favorites)
  const addToFavorites = usePlaylistStore((s) => s.addToFavorites)
  const removeFromFavorites = usePlaylistStore((s) => s.removeFromFavorites)
  const t = useT()

  const loading = status === "loading"
  const canPlay = status !== "idle"
  const fav = !!currentSong && favorites.some((f) => f.id === currentSong.id)

  const toggleFav = () => {
    if (!currentSong) return
    if (fav) removeFromFavorites(currentSong.id)
    else addToFavorites(currentSong)
  }

  const cyclePlayMode = () => {
    const modes = ["sequence", "shuffle", "repeat-list", "repeat-one"] as const
    const idx = modes.indexOf(playMode)
    setPlayMode(modes[(idx + 1) % modes.length])
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className={cn("h-9 w-9 text-muted-foreground", modeHoverClass(playMode))}
        onClick={cyclePlayMode}
        title={t(`playMode.${playMode}`)}
      >
        <span key={playMode} className="icon-pop-in">
          <ModeIcon playMode={playMode} />
        </span>
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 icon-hover-skip-prev"
        onClick={prev}
        disabled={!canPlay || loading}
      >
        <SkipBack size={18} />
      </Button>

      <Button
        variant="default"
        size="icon"
        className="h-11 w-11 rounded-full shadow-[var(--shadow-elevated)] hover:scale-[1.04] transition-transform duration-200"
        onClick={togglePlay}
        disabled={!canPlay || loading}
      >
        {loading ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <span className="relative block size-[19px]">
            <span
              className={cn(
                "icon-swap",
                isPlaying ? "scale-100 opacity-100 blur-0" : "scale-[0.25] opacity-0 blur-[4px]"
              )}
              aria-hidden={!isPlaying}
            >
              <Pause size={19} fill="currentColor" strokeWidth={0} />
            </span>
            <span
              className={cn(
                "icon-swap",
                !isPlaying ? "scale-100 opacity-100 blur-0" : "scale-[0.25] opacity-0 blur-[4px]"
              )}
              aria-hidden={isPlaying}
            >
              {/* Optical shift: play triangles read left-heavy when geometrically centered. */}
              <Play size={19} fill="currentColor" strokeWidth={0} className="ml-0.5" />
            </span>
          </span>
        )}
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 icon-hover-skip-next"
        onClick={next}
        disabled={!canPlay || loading}
      >
        <SkipForward size={18} />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className={cn("h-9 w-9 icon-hover-heart", fav ? "text-red-500 hover:text-red-500" : "text-muted-foreground")}
        onClick={toggleFav}
        disabled={!currentSong}
        title={t("common.favorite")}
      >
        <Heart
          key={fav ? "on" : "off"}
          size={16}
          fill={fav ? "currentColor" : "none"}
          className={fav ? "icon-heart-burst" : undefined}
        />
      </Button>
    </div>
  )
}
