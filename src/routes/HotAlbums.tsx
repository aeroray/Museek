import { useState, useEffect, useCallback, useRef } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { Disc3, Play, ChevronLeft, RotateCw, Heart, Search, X, Pencil, CheckCheck, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { TrackRow } from "@/components/common/TrackRow"
import { PlaylistCardSkeleton, TrackRowSkeleton } from "@/components/common/ListSkeletons"
import { VirtualList } from "@/components/common/VirtualList"
import { getHotAlbums, getAlbumTags, getAlbumDetail, type Album, type AlbumTag } from "@/lib/albums"
import { playAlbum } from "@/lib/albums/play"
import { playlistKind, type Playlist } from "@/lib/playlists"
import { PlatformTabs } from "@/components/common/PlatformTabs"
import { PlaylistCard } from "@/components/common/PlaylistCard"
import { usePlayerStore } from "@/stores/playerStore"
import { usePlaylistStore } from "@/stores/playlistStore"
import { useDownloadStore } from "@/stores/downloadStore"
import { useUiStore } from "@/stores/uiStore"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { MusicInfo } from "@/types/music"

function albumToPlaylist(album: Album): Playlist {
  return {
    id: album.id,
    name: album.name,
    img: album.img,
    author: album.author,
    publishTime: album.publishTime,
    songCount: album.songCount,
    source: album.source,
    kind: "album",
  }
}

export function HotAlbums() {
  const t = useT()
  const playAll = usePlayerStore((s) => s.playAll)
  const addTask = useDownloadStore((s) => s.addTask)
  const favoritePlaylists = usePlaylistStore((s) => s.favoritePlaylists)
  const addFavoritePlaylist = usePlaylistStore((s) => s.addFavoritePlaylist)
  const removeFavoritePlaylist = usePlaylistStore((s) => s.removeFavoritePlaylist)
  const navState = useLocation().state as {
    openAlbum?: Album
    fromFavorites?: boolean
    fromSearch?: boolean
  } | null
  const openAlbumFromNav = navState?.openAlbum
  const fromFavorites = navState?.fromFavorites
  const fromSearch = navState?.fromSearch
  const navigate = useNavigate()
  const source = useUiStore((s) => s.albumSource)
  const setSource = useUiStore((s) => s.setAlbumSource)

  const [albums, setAlbums] = useState<Album[]>([])
  const [selected, setSelected] = useState<Playlist | null>(
    openAlbumFromNav ? albumToPlaylist(openAlbumFromNav) : null,
  )
  const [songs, setSongs] = useState<MusicInfo[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(!!openAlbumFromNav)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [tags, setTags] = useState<AlbumTag[]>([])
  const [tagId, setTagId] = useState<string | null>(null)
  const [tagSource, setTagSource] = useState(source)
  if (tagSource !== source) {
    setTagSource(source)
    setTagId(null)
    setTags([])
  }
  const scrollRef = useRef<HTMLDivElement>(null)
  const tagScrollRef = useRef<HTMLDivElement>(null)
  const [tagCanScrollRight, setTagCanScrollRight] = useState(false)
  const [viewportEl, setViewportEl] = useState<HTMLElement | null>(null)
  const [filter, setFilter] = useState("")
  const [editing, setEditing] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const vp = scrollRef.current?.querySelector("[data-radix-scroll-area-viewport]")
    setViewportEl(vp instanceof HTMLElement ? vp : null)
  }, [selected, detailLoading])

  useEffect(() => {
    const el = tagScrollRef.current
    if (!el || tags.length === 0) {
      setTagCanScrollRight(false)
      return
    }
    const update = () => setTagCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
    update()
    el.addEventListener("scroll", update, { passive: true })
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        el.scrollLeft += e.deltaY
        e.preventDefault()
      }
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener("scroll", update)
      el.removeEventListener("wheel", onWheel)
      ro.disconnect()
    }
  }, [tags, source])

  useEffect(() => {
    let cancelled = false
    getAlbumTags(source)
      .then((list) => {
        if (!cancelled) setTags(list)
      })
      .catch(() => {
        if (!cancelled) setTags([])
      })
    return () => {
      cancelled = true
    }
  }, [source])

  const loadList = useCallback(() => {
    setListLoading(true)
    setListError(null)
    setSelected(null)
    setSongs([])
    getHotAlbums(source, 1, tagId)
      .then(setAlbums)
      .catch((e) => setListError((e as Error).message))
      .finally(() => setListLoading(false))
  }, [source, tagId])

  useEffect(() => {
    loadList()
  }, [loadList])

  const openAlbum = (album: Album) => {
    const pl = albumToPlaylist(album)
    setSelected(pl)
    setDetailLoading(true)
    setDetailError(null)
    setSongs([])
    getAlbumDetail(album.source, album.id)
      .then(({ info, list }) => {
        setSelected((prev) =>
          prev && prev.source === pl.source && prev.id === pl.id
            ? {
                ...prev,
                name: info.name || prev.name,
                img: info.img ?? prev.img,
                author: info.author ?? prev.author,
              }
            : prev,
        )
        setSongs(list)
      })
      .catch((e) => setDetailError((e as Error).message))
      .finally(() => setDetailLoading(false))
  }

  const retry = () => {
    if (selected && selected.source !== "local") {
      openAlbum({
        id: selected.id,
        name: selected.name,
        img: selected.img,
        author: selected.author,
        publishTime: selected.publishTime,
        songCount: selected.songCount,
        source: selected.source,
      })
    } else loadList()
  }

  const isPlFav = (pl: Playlist) =>
    favoritePlaylists.some(
      (p) => p.source === pl.source && p.id === pl.id && playlistKind(p) === "album",
    )
  const toggleFavFor = (pl: Playlist) => {
    if (isPlFav(pl)) removeFavoritePlaylist(pl.source, pl.id, "album")
    else addFavoritePlaylist({ ...pl, kind: "album" })
  }

  useEffect(() => {
    if (openAlbumFromNav) openAlbum(openAlbumFromNav)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const albumFav = !!selected && isPlFav(selected)
  const toggleAlbumFav = () => {
    if (!selected) return
    toggleFavFor(selected)
  }

  const q = filter.trim().toLowerCase()
  const shownSongs = songs
    .map((song, i) => ({ song, rank: i + 1 }))
    .filter(({ song }) => !q || `${song.name} ${song.singer}`.toLowerCase().includes(q))

  const downloadableShown = shownSongs.filter(({ song }) => song.source !== "local")
  const currentKeys = downloadableShown.map(({ song }) => song.id)
  const allSelected = currentKeys.length > 0 && currentKeys.every((k) => selectedIds.has(k))

  const toggleOne = (id: string) =>
    setSelectedIds((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(currentKeys))
  const exitEdit = () => {
    setEditing(false)
    setSelectedIds(new Set())
  }
  const batchDownload = () => {
    songs.filter((s) => selectedIds.has(s.id) && s.source !== "local").forEach((s) => addTask(s))
    exitEdit()
  }

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
                  if (fromFavorites || fromSearch) {
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
                className={cn(
                  "h-8 shrink-0",
                  albumFav ? "text-red-500 hover:text-red-500" : "text-muted-foreground",
                )}
                onClick={toggleAlbumFav}
                title={t(albumFav ? "hotPlaylists.favorited" : "hotPlaylists.favoriteAlbum")}
              >
                <Heart size={14} className="mr-1.5" fill={albumFav ? "currentColor" : "none"} />
                {t(albumFav ? "hotPlaylists.favorited" : "hotPlaylists.favoriteAlbum")}
              </Button>
              {songs.length > 0 && !detailLoading && !detailError && !editing && (
                <Button variant="secondary" size="sm" className="h-8 shrink-0" onClick={() => playAll(songs)}>
                  <Play size={14} className="mr-1.5" fill="currentColor" strokeWidth={0} />
                  {t("common.playAll")}
                </Button>
              )}
            </>
          ) : (
            <>
              <Disc3 size={20} />
              <h2 className="text-lg font-semibold">{t("hotAlbums.title")}</h2>
              <div className="flex-1" />
            </>
          )}
        </div>

        {!selected && <PlatformTabs value={source} onChange={setSource} />}

        {/* Always reserve the chip row (至少「全部」) so platform switches don't collapse height. */}
        {!selected && (
          <div className="relative -mx-1 min-h-[28px]">
            <div
              ref={tagScrollRef}
              className="flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <button
                type="button"
                onClick={() => setTagId(null)}
                className={cn(
                  "shrink-0 rounded-md px-2.5 py-1 text-xs transition-colors",
                  tagId == null
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {t("hotPlaylists.tagAll")}
              </button>
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => setTagId(tag.id)}
                  className={cn(
                    "shrink-0 rounded-md px-2.5 py-1 text-xs transition-colors",
                    tagId === tag.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {tag.name}
                </button>
              ))}
            </div>
            {tagCanScrollRight && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent"
              />
            )}
          </div>
        )}

        {selected && !detailLoading && !detailError && songs.length > 0 && (
          <div className="flex h-9 min-h-9 max-h-9 items-center gap-2 overflow-hidden">
            {!editing ? (
              <>
                <div className="relative min-w-0 flex-1">
                  <Search
                    size={15}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    className="h-8 py-0 pl-9 pr-9"
                    placeholder={t("hotAlbums.searchInList")}
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
                <Button variant="ghost" size="sm" className="h-8 shrink-0" onClick={() => setEditing(true)}>
                  <Pencil size={14} className="mr-1.5" />
                  {t("playlist.batchEdit")}
                </Button>
              </>
            ) : (
              <>
                <span className="truncate text-sm leading-8 text-muted-foreground">
                  {t("playlist.selectedCount", { count: selectedIds.size })}
                </span>
                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                  <Button variant="ghost" size="sm" className="h-8" onClick={toggleAll}>
                    <CheckCheck size={14} className="mr-1.5" />
                    {allSelected ? t("favorites.deselectAll") : t("favorites.selectAll")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    disabled={selectedIds.size === 0}
                    onClick={batchDownload}
                  >
                    <Download size={14} className="mr-1.5" />
                    {t("playlist.batchDownload")}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8" onClick={exitEdit}>
                    {t("common.cancel")}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <ScrollArea ref={scrollRef} className="flex-1">
        {selected ? (
          detailLoading ? (
            <div className="px-2 py-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <TrackRowSkeleton key={i} showRank />
              ))}
            </div>
          ) : detailError ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3 px-4">
              <p className="text-sm text-destructive">{t("hotAlbums.failed", { msg: detailError })}</p>
              <Button variant="outline" size="sm" onClick={retry}>
                <RotateCw size={14} className="mr-1.5" />
                {t("common.retry")}
              </Button>
            </div>
          ) : songs.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">{t("hotAlbums.albumEmpty")}</div>
          ) : (
            <div className="px-2 py-2">
              {shownSongs.length === 0 ? (
                <div className="text-center py-16 text-sm text-muted-foreground">{t("hotAlbums.noMatch")}</div>
              ) : (
                <VirtualList
                  items={shownSongs}
                  scrollElement={viewportEl}
                  getKey={(row) => row.song.id}
                >
                  {(row) => (
                    <TrackRow
                      song={row.song}
                      rank={row.rank}
                      fallbackImg={selected?.img}
                      selectable={editing && row.song.source !== "local"}
                      selected={selectedIds.has(row.song.id)}
                      onToggleSelect={() => toggleOne(row.song.id)}
                    />
                  )}
                </VirtualList>
              )}
            </div>
          )
        ) : listLoading ? (
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 items-start">
            {Array.from({ length: 10 }).map((_, i) => (
              <PlaylistCardSkeleton key={i} />
            ))}
          </div>
        ) : listError ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3 px-4">
            <p className="text-sm text-destructive">{t("hotAlbums.failed", { msg: listError })}</p>
            <Button variant="outline" size="sm" onClick={retry}>
              <RotateCw size={14} className="mr-1.5" />
              {t("common.retry")}
            </Button>
          </div>
        ) : albums.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
            <div className="h-16 w-16 rounded-2xl bg-muted/60 flex items-center justify-center mb-4">
              <Disc3 size={28} />
            </div>
            <p className="text-sm">{t("hotAlbums.empty")}</p>
          </div>
        ) : (
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 items-start">
            {albums.map((album) => {
              const pl = albumToPlaylist(album)
              return (
                <PlaylistCard
                  key={`${album.source}:${album.id}`}
                  playlist={pl}
                  onOpen={() => openAlbum(album)}
                  onPlay={() => playAlbum(album)}
                  onToggleFavorite={() => toggleFavFor(pl)}
                  favorited={isPlFav(pl)}
                />
              )
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
