import { useState, useEffect, useCallback, useRef } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { ListMusic, Play, ChevronLeft, RotateCw, Heart, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { TrackRow } from "@/components/common/TrackRow"
import { getHotPlaylists, getPlaylistDetail, type Playlist } from "@/lib/playlists"
import { playPlaylist } from "@/lib/playlists/play"
import { PlatformTabs } from "@/components/common/PlatformTabs"
import { PlaylistCard } from "@/components/common/PlaylistCard"
import { usePlayerStore } from "@/stores/playerStore"
import { usePlaylistStore } from "@/stores/playlistStore"
import { useUiStore } from "@/stores/uiStore"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { MusicInfo } from "@/types/music"

export function HotPlaylists() {
  const t = useT()
  const { playAll } = usePlayerStore()
  const favoritePlaylists = usePlaylistStore((s) => s.favoritePlaylists)
  const addFavoritePlaylist = usePlaylistStore((s) => s.addFavoritePlaylist)
  const removeFavoritePlaylist = usePlaylistStore((s) => s.removeFavoritePlaylist)
  const navState = useLocation().state as { openPlaylist?: Playlist; fromFavorites?: boolean } | null
  const openFromNav = navState?.openPlaylist
  const fromFavorites = navState?.fromFavorites
  const navigate = useNavigate()
  // Selected platform lives in the UI store so it survives leaving and returning.
  const source = useUiStore((s) => s.playlistSource)
  const setSource = useUiStore((s) => s.setPlaylistSource)
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  // Seed the detail view straight from the nav state so the very first render
  // already shows the detail skeleton (no flash of the empty grid before the
  // auto-open effect runs).
  const [selected, setSelected] = useState<Playlist | null>(openFromNav ?? null)
  const [songs, setSongs] = useState<MusicInfo[]>([])
  // Grid (hot list) and detail have SEPARATE loading/error so the cached hot-list
  // fetch can't flip the detail view out of its skeleton mid-load (which showed a
  // blank "empty" flash when opening a favorited playlist).
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(!!openFromNav)
  const [detailError, setDetailError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [filter, setFilter] = useState("")

  // Reset scroll to the top when drilling into a playlist or going back, so the
  // new view doesn't inherit the previous list's scroll offset.
  useEffect(() => {
    const vp = scrollRef.current?.querySelector("[data-radix-scroll-area-viewport]")
    if (vp) vp.scrollTop = 0
    setFilter("")
  }, [selected])

  // Load the platform's hot playlists. Extracted so the retry button can re-run it.
  const loadList = useCallback(() => {
    setListLoading(true)
    setListError(null)
    setSelected(null)
    setSongs([])
    getHotPlaylists(source)
      .then(setPlaylists)
      .catch((e) => setListError((e as Error).message))
      .finally(() => setListLoading(false))
  }, [source])

  useEffect(() => {
    loadList()
  }, [loadList])

  const openPlaylist = (pl: Playlist) => {
    setSelected(pl)
    setDetailLoading(true)
    setDetailError(null)
    setSongs([])
    // Use the playlist's own platform (so opening from Favorites works regardless
    // of the currently-selected platform tab).
    getPlaylistDetail(pl.source, pl.id)
      .then(setSongs)
      .catch((e) => setDetailError((e as Error).message))
      .finally(() => setDetailLoading(false))
  }

  // Retry the last failed action: a playlist detail if one is open, else the list.
  const retry = () => {
    if (selected) openPlaylist(selected)
    else loadList()
  }

  const isPlFav = (pl: Playlist) => favoritePlaylists.some((p) => p.source === pl.source && p.id === pl.id)
  const toggleFavFor = (pl: Playlist) => {
    if (isPlFav(pl)) removeFavoritePlaylist(pl.source, pl.id)
    else addFavoritePlaylist(pl)
  }

  // Auto-open a playlist passed from Favorites (one-time on mount).
  useEffect(() => {
    if (openFromNav) openPlaylist(openFromNav)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const playlistFav = !!selected && favoritePlaylists.some((p) => p.source === selected.source && p.id === selected.id)
  const togglePlaylistFav = () => {
    if (!selected) return
    if (playlistFav) removeFavoritePlaylist(selected.source, selected.id)
    else addFavoritePlaylist(selected)
  }

  // Filter the opened playlist's tracks (keeping each track's original rank).
  const q = filter.trim().toLowerCase()
  const shownSongs = songs
    .map((song, i) => ({ song, rank: i + 1 }))
    .filter(({ song }) => !q || `${song.name} ${song.singer}`.toLowerCase().includes(q))

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center gap-2">
          {selected ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 -ml-1"
                onClick={() => {
                  // Opened from Favorites → go back there (the 收藏的歌单 tab);
                  // opened from this page's own grid → return to the grid.
                  if (fromFavorites) {
                    navigate(-1)
                    return
                  }
                  setSelected(null)
                  setSongs([])
                }}
              >
                <ChevronLeft size={18} />
              </Button>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold truncate leading-tight">{selected.name}</h2>
                {songs.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("hotPlaylists.songCount", { count: songs.length })}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className={cn("h-8 shrink-0", playlistFav ? "text-red-500 hover:text-red-500" : "text-muted-foreground")}
                onClick={togglePlaylistFav}
                title={t(playlistFav ? "hotPlaylists.favorited" : "hotPlaylists.favorite")}
              >
                <Heart size={14} className="mr-1.5" fill={playlistFav ? "currentColor" : "none"} />
                {t(playlistFav ? "hotPlaylists.favorited" : "hotPlaylists.favorite")}
              </Button>
              {songs.length > 0 && !detailLoading && !detailError && (
                <Button variant="secondary" size="sm" className="h-8 shrink-0" onClick={() => playAll(songs)}>
                  <Play size={14} className="mr-1.5" fill="currentColor" strokeWidth={0} />
                  {t("common.playAll")}
                </Button>
              )}
            </>
          ) : (
            <>
              <ListMusic size={20} />
              <h2 className="text-lg font-semibold">{t("hotPlaylists.title")}</h2>
            </>
          )}
        </div>

        {!selected && <PlatformTabs value={source} onChange={setSource} />}

        {selected && !detailLoading && !detailError && songs.length > 0 && (
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9 pr-9 h-9"
              placeholder={t("hotPlaylists.searchInList")}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            {filter && (
              <button
                onClick={() => setFilter("")}
                title={t("search.clear")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      <ScrollArea ref={scrollRef} className="flex-1">
        {selected ? (
          // --- Playlist detail ---
          detailLoading ? (
            <div className="px-2 py-2 space-y-1.5">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2">
                  <Skeleton className="h-10 w-10 rounded-md shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-1/3" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                  <Skeleton className="h-3 w-10 shrink-0" />
                </div>
              ))}
            </div>
          ) : detailError ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3 px-4">
              <p className="text-sm text-destructive">{t("hotPlaylists.failed", { msg: detailError })}</p>
              <Button variant="outline" size="sm" onClick={retry}>
                <RotateCw size={14} className="mr-1.5" />
                {t("common.retry")}
              </Button>
            </div>
          ) : songs.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">{t("library.empty")}</div>
          ) : (
            <div className="px-2 py-2">
              {shownSongs.length === 0 ? (
                <div className="text-center py-16 text-sm text-muted-foreground">{t("hotPlaylists.noMatch")}</div>
              ) : (
                shownSongs.map(({ song, rank }) => (
                  <TrackRow key={song.id} song={song} rank={rank} fallbackImg={selected?.img} />
                ))
              )}
            </div>
          )
        ) : // --- Hot-playlist grid ---
        listLoading ? (
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 items-start">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="aspect-square w-full rounded-xl" />
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : listError ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3 px-4">
            <p className="text-sm text-destructive">{t("hotPlaylists.failed", { msg: listError })}</p>
            <Button variant="outline" size="sm" onClick={retry}>
              <RotateCw size={14} className="mr-1.5" />
              {t("common.retry")}
            </Button>
          </div>
        ) : playlists.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
            <div className="h-16 w-16 rounded-2xl bg-muted/60 flex items-center justify-center mb-4">
              <ListMusic size={28} />
            </div>
            <p className="text-sm">{t("hotPlaylists.empty")}</p>
          </div>
        ) : (
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 items-start">
            {playlists.map((pl) => (
              <PlaylistCard
                key={pl.id}
                playlist={pl}
                onOpen={() => openPlaylist(pl)}
                onPlay={() => playPlaylist(pl)}
                onToggleFavorite={() => toggleFavFor(pl)}
                favorited={isPlFav(pl)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
