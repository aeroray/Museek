import { useParams } from "react-router-dom"
import { Play, Trash2, ListMusic } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { usePlaylistStore } from "@/stores/playlistStore"
import { usePlayerStore } from "@/stores/playerStore"
import { useT } from "@/lib/i18n"

export function Playlist() {
  const { id } = useParams<{ id: string }>()
  const { userLists, removeSongFromPlaylist, deletePlaylist } = usePlaylistStore()
  const play = usePlayerStore((s) => s.play)
  const addToQueue = usePlayerStore((s) => s.addToQueue)
  const t = useT()

  const playlist = userLists.find((p) => p.id === id)

  if (!playlist) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        {t("playlist.notFound")}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListMusic size={20} />
          <h2 className="text-lg font-semibold">{playlist.name}</h2>
          <span className="text-sm text-muted-foreground">{t("playlist.count", { count: playlist.songs.length })}</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => addToQueue(playlist.songs)}>
            {t("playlist.addToQueue")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => deletePlaylist(playlist.id)}
          >
            {t("playlist.delete")}
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-4 py-2">
          {playlist.songs.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <p>{t("playlist.empty")}</p>
            </div>
          ) : (
            playlist.songs.map((song) => (
              <div
                key={song.id}
                className="flex items-center gap-3 px-4 py-2 hover:bg-accent/50 rounded-md group cursor-pointer"
                onDoubleClick={() => play(song)}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 shrink-0"
                  onClick={() => play(song)}
                >
                  <Play size={14} />
                </Button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate font-medium">{song.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{song.singer}</p>
                </div>
                <span className="text-xs text-muted-foreground">{song.interval}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                  onClick={(e) => { e.stopPropagation(); removeSongFromPlaylist(playlist.id, song.id) }}
                >
                  <Trash2 size={12} />
                </Button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
