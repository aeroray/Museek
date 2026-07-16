import { SkipBack, SkipForward, Play, Pause, Repeat, Repeat1, Shuffle, Loader2, Heart, ListOrdered } from "lucide-react"
import { Button } from "@/components/ui/button"
import { usePlayerStore } from "@/stores/playerStore"
import { usePlaylistStore } from "@/stores/playlistStore"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const iconSwap =
  "absolute inset-0 flex items-center justify-center transition-[opacity,filter,transform] duration-300 ease-[cubic-bezier(0.2,0,0,1)]"

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
        className="h-9 w-9 text-muted-foreground"
        onClick={cyclePlayMode}
        title={t(`playMode.${playMode}`)}
      >
        {playMode === "repeat-one" ? (
          <Repeat1 size={16} />
        ) : playMode === "shuffle" ? (
          <Shuffle size={16} />
        ) : playMode === "repeat-list" ? (
          <Repeat size={16} />
        ) : (
          <ListOrdered size={16} />
        )}
      </Button>

      <Button variant="ghost" size="icon" className="h-9 w-9" onClick={prev} disabled={!canPlay || loading}>
        <SkipBack size={18} />
      </Button>

      <Button
        variant="default"
        size="icon"
        className="h-10 w-10 rounded-full"
        onClick={togglePlay}
        disabled={!canPlay || loading}
      >
        {loading ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <span className="relative block size-[19px]">
            <span
              className={cn(
                iconSwap,
                isPlaying ? "scale-100 opacity-100 blur-0" : "scale-[0.25] opacity-0 blur-[4px]"
              )}
              aria-hidden={!isPlaying}
            >
              <Pause size={19} fill="currentColor" strokeWidth={0} />
            </span>
            <span
              className={cn(
                iconSwap,
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

      <Button variant="ghost" size="icon" className="h-9 w-9" onClick={next} disabled={!canPlay || loading}>
        <SkipForward size={18} />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className={cn("h-9 w-9", fav ? "text-red-500 hover:text-red-500" : "text-muted-foreground")}
        onClick={toggleFav}
        disabled={!currentSong}
        title={t("common.favorite")}
      >
        <Heart size={16} fill={fav ? "currentColor" : "none"} />
      </Button>
    </div>
  )
}
