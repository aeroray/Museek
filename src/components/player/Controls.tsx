import { SkipBack, SkipForward, Repeat, Repeat1, Shuffle, Heart, ListOrdered } from "lucide-react"
import { Button } from "@/components/ui/button"
import { IconBurst, IconCycle, IconSwap } from "@/components/common/IconSwap"
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip"
import { PlayPauseButton } from "@/components/player/PlayPauseButton"
import { usePlayerStore } from "@/stores/playerStore"
import { usePlaylistStore } from "@/stores/playlistStore"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/**
 * Play mode cycles through four states, so each change is a *swap* with its
 * neighbour rather than a remount. A map keeps every mode's glyph in one place
 * and lets the cross-fade bridge any step in the cycle.
 */
const MODE_ICON = {
  sequence: ListOrdered,
  shuffle: Shuffle,
  "repeat-list": Repeat,
  "repeat-one": Repeat1,
} as const

function modeHoverClass(playMode: string) {
  if (playMode === "shuffle") return "icon-hover-shuffle"
  if (playMode === "repeat-one" || playMode === "repeat-list") return "icon-hover-repeat"
  return "icon-hover-list"
}

export function Controls() {
  const { isPlaying, playMode, status, playPending, currentSong, togglePlay, next, prev, setPlayMode } = usePlayerStore()
  const favorites = usePlaylistStore((s) => s.favorites)
  const addToFavorites = usePlaylistStore((s) => s.addToFavorites)
  const removeFromFavorites = usePlaylistStore((s) => s.removeFromFavorites)
  const t = useT()

  const loading = status === "loading" || playPending
  const canPlay = status !== "idle"
  const isLocal = currentSong?.source === "local"
  const fav = !!currentSong && !isLocal && favorites.some((f) => f.id === currentSong.id)

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

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className={cn("h-9 w-9 text-muted-foreground", modeHoverClass(playMode))}
        onClick={cyclePlayMode}
        title={t(`playMode.${playMode}`)}
      >
        <IconCycle
          value={playMode}
          render={(mode) => {
            const Glyph = MODE_ICON[mode as keyof typeof MODE_ICON] ?? ListOrdered
            return <Glyph size={16} />
          }}
        />
      </Button>

      <ShortcutTooltip label={t("player.prev")} action="prev">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 icon-hover-skip-prev"
          onClick={prev}
          disabled={!canPlay || loading}
        >
          <SkipBack size={18} />
        </Button>
      </ShortcutTooltip>

      <ShortcutTooltip
        label={t(isPlaying ? "player.pause" : "player.play")}
        action="playPause"
      >
        <PlayPauseButton
          variant="default"
          size="icon"
          className="size-11"
          isPlaying={isPlaying}
          loading={loading}
          aria-label={t(isPlaying ? "player.pause" : "player.play")}
          onClick={togglePlay}
          disabled={!canPlay || loading}
        />
      </ShortcutTooltip>

      <ShortcutTooltip label={t("player.next")} action="next">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 icon-hover-skip-next"
          onClick={next}
          disabled={!canPlay || loading}
        >
          <SkipForward size={18} />
        </Button>
      </ShortcutTooltip>

      <Button
        variant="ghost"
        size="icon"
        className={cn("h-9 w-9 icon-hover-heart", fav ? "text-red-500 hover:text-red-500" : "text-muted-foreground")}
        onClick={toggleFav}
        disabled={!currentSong || isLocal}
        title={isLocal ? t("local.favoriteDisabled") : t("common.favorite")}
      >
        <IconBurst active={fav}>
          <IconSwap
            active={fav}
            inactive={<Heart size={16} />}
            activeNode={<Heart size={16} fill="currentColor" />}
          />
        </IconBurst>
      </Button>
    </div>
  )
}
