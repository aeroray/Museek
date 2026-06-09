import { Play, Plus, Heart, Download, Music } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { usePlayerStore } from "@/stores/playerStore"
import { usePlaylistStore } from "@/stores/playlistStore"
import { useDownloadStore } from "@/stores/downloadStore"
import { QualityBadge } from "@/components/common/MetaBadges"
import { bestQuality } from "@/lib/quality"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { MusicInfo, Quality } from "@/types/music"

/**
 * Shared song row for the Search / Charts / Hot-playlist lists. Hover reveals
 * the play overlay + queue/download actions; the favorite heart stays visible
 * once a song is favorited so the state is obvious at a glance.
 */
export function TrackRow({
  song,
  rank,
  fallbackImg,
}: {
  song: MusicInfo
  rank?: number
  /** Shown when the song itself has no cover (e.g. kw/kg playlist songs inherit
   *  the playlist's cover). Display only — never written back to the song. */
  fallbackImg?: string | null
}) {
  const { play, addToQueue } = usePlayerStore()
  const { addToFavorites, removeFromFavorites, isFavorite } = usePlaylistStore()
  const { addTask } = useDownloadStore()
  const t = useT()
  const fav = isFavorite(song.id)
  const thumb = song.meta.picUrl || fallbackImg
  const best = bestQuality(song)

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 hover:bg-accent/50 rounded-md group cursor-pointer"
      onDoubleClick={() => play(song)}
    >
      {rank != null && (
        <span className="w-6 text-center text-sm text-muted-foreground tabular-nums shrink-0">{rank}</span>
      )}

      <div className="relative h-10 w-10 shrink-0 rounded overflow-hidden bg-muted">
        {thumb ? (
          <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-muted-foreground">
            <Music size={16} />
          </div>
        )}
        <button
          onClick={() => play(song)}
          className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Play size={16} className="text-white" />
        </button>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm truncate font-medium">{song.name}</p>
        <p className="text-xs text-muted-foreground truncate">{song.singer}</p>
      </div>

      {song.albumName && (
        <p className="text-xs text-muted-foreground truncate max-w-32 hidden lg:block">{song.albumName}</p>
      )}

      {best && <QualityBadge quality={best} />}

      <span className="text-xs text-muted-foreground w-12 text-right shrink-0 tabular-nums">{song.interval}</span>

      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 opacity-0 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation()
            addToQueue([song])
          }}
          title={t("common.addToQueue")}
        >
          <Plus size={13} />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className={cn("h-7 w-7 transition-opacity", fav ? "opacity-100" : "opacity-0 group-hover:opacity-100")}
          onClick={(e) => {
            e.stopPropagation()
            if (fav) removeFromFavorites(song.id)
            else addToFavorites(song)
          }}
          title={t(fav ? "common.unfavorite" : "common.favorite")}
        >
          <Heart size={13} className={fav ? "fill-red-500 text-red-500" : ""} />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
              onClick={(e) => e.stopPropagation()}
              title={t("common.download")}
            >
              <Download size={13} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[11rem]">
            {song.meta.qualitys.map((q) => (
              <DropdownMenuItem
                key={q.type}
                onClick={() => addTask(song, q.type as Quality)}
                className="justify-between gap-8"
              >
                <span>{t("search.download", { quality: q.type })}</span>
                {q.size && <span className="text-muted-foreground text-xs tabular-nums">{q.size}</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
