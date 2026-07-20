import { useState, useEffect, useCallback, useRef } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { ListMusic, Play, ChevronLeft, RotateCw, Heart, Search, X, Link2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { TrackRow } from "@/components/common/TrackRow"
import { PlaylistCardSkeleton, TrackRowSkeleton } from "@/components/common/ListSkeletons"
import { VirtualList } from "@/components/common/VirtualList"
import {
  getHotPlaylists,
  getPlaylistDetail,
  getPlaylistTags,
  type Playlist,
  type PlaylistTag,
} from "@/lib/playlists"
import { parsePlaylistLink } from "@/lib/playlists/openLink"
import { playPlaylist } from "@/lib/playlists/play"
import { PlatformTabs } from "@/components/common/PlatformTabs"
import { PlaylistCard } from "@/components/common/PlaylistCard"
import { usePlayerStore } from "@/stores/playerStore"
import { usePlaylistStore } from "@/stores/playlistStore"
import { useUiStore } from "@/stores/uiStore"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { MusicInfo, OnlineSource } from "@/types/music"

export function HotPlaylists() {
  const t = useT()
  const playAll = usePlayerStore((s) => s.playAll)
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
  // Category filter: null = "全部" (platform default recommend). Hide the bar
  // when tags fail or come back empty (e.g. transient API outage).
  const [tags, setTags] = useState<PlaylistTag[]>([])
  const [tagId, setTagId] = useState<string | null>(null)
  // Keep tag state in sync with the platform tab without a one-frame stale load.
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
  const [openDialog, setOpenDialog] = useState(false)
  // Dialog platform is local so switching tabs here doesn't reload the page grid.
  const [openSource, setOpenSource] = useState<OnlineSource>(source)
  const [openInput, setOpenInput] = useState("")
  const [openBusy, setOpenBusy] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)

  // Bind the Radix viewport once mounted (needed for virtualization + scroll reset).
  useEffect(() => {
    const vp = scrollRef.current?.querySelector("[data-radix-scroll-area-viewport]")
    setViewportEl(vp instanceof HTMLElement ? vp : null)
  }, [selected, detailLoading])

  // Category chips: vertical wheel → horizontal scroll; fade when more tags exist to the right.
  useEffect(() => {
    const el = tagScrollRef.current
    if (!el || tags.length === 0) {
      setTagCanScrollRight(false)
      return
    }

    const updateFade = () => {
      setTagCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2)
    }
    updateFade()

    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return
      // Prefer converting vertical wheel to horizontal when the strip overflows.
      if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }

    el.addEventListener("wheel", onWheel, { passive: false })
    el.addEventListener("scroll", updateFade, { passive: true })
    const ro = new ResizeObserver(updateFade)
    ro.observe(el)
    return () => {
      el.removeEventListener("wheel", onWheel)
      el.removeEventListener("scroll", updateFade)
      ro.disconnect()
    }
  }, [tags])

  useEffect(() => {
    setFilter("")
  }, [selected])

  // Reset scroll to the top when drilling into a playlist or going back.
  useEffect(() => {
    if (viewportEl) viewportEl.scrollTop = 0
  }, [selected, viewportEl])

  // Load category chips for the current platform; hide bar on failure / empty.
  useEffect(() => {
    let cancelled = false
    getPlaylistTags(source)
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

  // Load the platform's hot playlists. Extracted so the retry button can re-run it.
  const loadList = useCallback(() => {
    setListLoading(true)
    setListError(null)
    setSelected(null)
    setSongs([])
    getHotPlaylists(source, 1, tagId)
      .then(setPlaylists)
      .catch((e) => setListError((e as Error).message))
      .finally(() => setListLoading(false))
  }, [source, tagId])

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

  const openByLink = async () => {
    setOpenError(null)
    setOpenBusy(true)
    try {
      const id = await parsePlaylistLink(openSource, openInput)
      setOpenDialog(false)
      setOpenInput("")
      openPlaylist({
        id,
        name: t("hotPlaylists.openName", { id }),
        img: null,
        source: openSource,
      })
    } catch (e) {
      setOpenError((e as Error).message)
    } finally {
      setOpenBusy(false)
    }
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
              <div className="flex-1" />
              <Button
                variant="outline"
                size="sm"
                className="h-8 shrink-0"
                onClick={() => {
                  setOpenSource(source)
                  setOpenError(null)
                  setOpenDialog(true)
                }}
              >
                <Link2 size={14} className="mr-1.5" />
                {t("hotPlaylists.open")}
              </Button>
            </>
          )}
        </div>

        {!selected && <PlatformTabs value={source} onChange={setSource} />}

        {!selected && tags.length > 0 && (
          <div className="relative -mx-1">
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
            <div className="px-2 py-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <TrackRowSkeleton key={i} showRank />
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
                <VirtualList
                  items={shownSongs}
                  scrollElement={viewportEl}
                  getKey={(row) => row.song.id}
                >
                  {(row) => (
                    <TrackRow song={row.song} rank={row.rank} fallbackImg={selected?.img} />
                  )}
                </VirtualList>
              )}
            </div>
          )
        ) : // --- Hot-playlist grid ---
        listLoading ? (
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 items-start">
            {Array.from({ length: 10 }).map((_, i) => (
              <PlaylistCardSkeleton key={i} />
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

      <Dialog
        open={openDialog}
        onOpenChange={(open) => {
          setOpenDialog(open)
          if (!open) {
            setOpenError(null)
            setOpenBusy(false)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("hotPlaylists.openTitle")}</DialogTitle>
            <DialogDescription>{t("hotPlaylists.openHint")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <PlatformTabs
              value={openSource}
              onChange={(s) => {
                setOpenSource(s)
                if (openError) setOpenError(null)
              }}
            />
            <div className="relative">
              <textarea
                className="flex min-h-[88px] w-full rounded-md border border-input bg-transparent px-3 py-2 pr-9 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                placeholder={t("hotPlaylists.openPlaceholder")}
                value={openInput}
                onChange={(e) => {
                  setOpenInput(e.target.value)
                  if (openError) setOpenError(null)
                }}
                disabled={openBusy}
                autoFocus
              />
              {openInput && !openBusy && (
                <button
                  type="button"
                  onClick={() => {
                    setOpenInput("")
                    if (openError) setOpenError(null)
                  }}
                  title={t("search.clear")}
                  className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {openError && <p className="text-sm text-destructive">{openError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(false)} disabled={openBusy}>
              {t("common.cancel")}
            </Button>
            <Button onClick={openByLink} disabled={openBusy || !openInput.trim()}>
              {openBusy ? (
                <>
                  <Loader2 size={14} className="mr-1.5 animate-spin" />
                  {t("hotPlaylists.openOpening")}
                </>
              ) : (
                t("hotPlaylists.openConfirm")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
