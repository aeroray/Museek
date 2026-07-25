import { useMemo, useState } from "react"
import { useParams } from "react-router-dom"
import { Play, Trash2, ListMusic, Pencil, CheckCheck, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { TrackRow } from "@/components/common/TrackRow"
import { usePlaylistStore } from "@/stores/playlistStore"
import { usePlayerStore } from "@/stores/playerStore"
import { useDownloadStore } from "@/stores/downloadStore"
import { useT } from "@/lib/i18n"

export function Playlist() {
  const { id } = useParams<{ id: string }>()
  const { userLists, removeSongFromPlaylist, deletePlaylist } = usePlaylistStore()
  const playAll = usePlayerStore((s) => s.playAll)
  const addToQueue = usePlayerStore((s) => s.addToQueue)
  const addTask = useDownloadStore((s) => s.addTask)
  const t = useT()

  const [editing, setEditing] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const playlist = userLists.find((p) => p.id === id)

  const downloadable = useMemo(
    () => (playlist?.songs ?? []).filter((s) => s.source !== "local"),
    [playlist?.songs],
  )
  const currentKeys = downloadable.map((s) => s.id)
  const allSelected = currentKeys.length > 0 && currentKeys.every((k) => selectedIds.has(k))

  if (!playlist) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        {t("playlist.notFound")}
      </div>
    )
  }

  const toggleOne = (songId: string) =>
    setSelectedIds((s) => {
      const n = new Set(s)
      if (n.has(songId)) n.delete(songId)
      else n.add(songId)
      return n
    })
  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(currentKeys))
  const exitEdit = () => {
    setEditing(false)
    setSelectedIds(new Set())
  }
  const batchDownload = () => {
    playlist.songs.filter((s) => selectedIds.has(s.id) && s.source !== "local").forEach((s) => addTask(s))
    exitEdit()
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <ListMusic size={20} className="shrink-0" />
          <h2 className="text-lg font-semibold truncate">{playlist.name}</h2>
          <span className="text-sm text-muted-foreground shrink-0">
            {t("playlist.count", { count: playlist.songs.length })}
          </span>
        </div>
        <div className="flex gap-2 shrink-0">
          {!editing ? (
            <>
              {playlist.songs.length > 0 && (
                <>
                  <Button variant="secondary" size="sm" onClick={() => playAll(playlist.songs)}>
                    <Play size={14} className="mr-1.5" fill="currentColor" strokeWidth={0} />
                    {t("common.playAll")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => addToQueue(playlist.songs)}>
                    {t("playlist.addToQueue")}
                  </Button>
                  {downloadable.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                      <Pencil size={14} className="mr-1.5" />
                      {t("playlist.batchEdit")}
                    </Button>
                  )}
                </>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => deletePlaylist(playlist.id)}
              >
                {t("playlist.delete")}
              </Button>
            </>
          ) : (
            <>
              <span className="text-sm text-muted-foreground tabular-nums leading-8">
                {t("playlist.selectedCount", { count: selectedIds.size })}
              </span>
              <Button variant="ghost" size="sm" onClick={toggleAll}>
                <CheckCheck size={14} className="mr-1.5" />
                {allSelected ? t("favorites.deselectAll") : t("favorites.selectAll")}
              </Button>
              <Button variant="outline" size="sm" disabled={selectedIds.size === 0} onClick={batchDownload}>
                <Download size={14} className="mr-1.5" />
                {t("playlist.batchDownload")}
              </Button>
              <Button variant="ghost" size="sm" onClick={exitEdit}>
                {t("common.cancel")}
              </Button>
            </>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-2 py-2">
          {playlist.songs.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <p>{t("playlist.empty")}</p>
            </div>
          ) : (
            playlist.songs.map((song) => (
              <div key={song.id} className="flex items-center gap-1">
                <div className="min-w-0 flex-1">
                  <TrackRow
                    song={song}
                    selectable={editing && song.source !== "local"}
                    selected={selectedIds.has(song.id)}
                    onToggleSelect={() => toggleOne(song.id)}
                  />
                </div>
                {!editing && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeSongFromPlaylist(playlist.id, song.id)}
                    title={t("playlist.removeSong")}
                  >
                    <Trash2 size={14} />
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
