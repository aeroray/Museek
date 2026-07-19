import { useState, useRef, useEffect } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { Search as SearchIcon, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { TrackRow } from "@/components/common/TrackRow"
import { PlatformTabs } from "@/components/common/PlatformTabs"
import { PlaylistCard } from "@/components/common/PlaylistCard"
import { HotSearchCloud } from "@/components/search/HotSearchCloud"
import { playPlaylist } from "@/lib/playlists/play"
import { useSearchStore } from "@/stores/searchStore"
import { usePlaylistStore } from "@/stores/playlistStore"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { Playlist } from "@/lib/playlists"
import type { Source } from "@/types/music"

export function Search() {
  // Seed the input from the store so returning to the page keeps the last query
  // (and the auto-search-from-player-bar fill below stays in sync).
  const [inputValue, setInputValue] = useState(() => useSearchStore.getState().query)
  const [focused, setFocused] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const {
    results, playlistResults, isLoading, error, page, allPage, search, searchHistory,
    platform, setPlatform, scope, setScope, searchOnPlatform, removeHistoryItem, clearHistory, clearResults,
  } = useSearchStore()
  const navSearch = (useLocation().state as { searchSong?: { platform: Source; query: string } } | null)?.searchSong
  const favoritePlaylists = usePlaylistStore((s) => s.favoritePlaylists)
  const addFavoritePlaylist = usePlaylistStore((s) => s.addFavoritePlaylist)
  const removeFavoritePlaylist = usePlaylistStore((s) => s.removeFavoritePlaylist)
  const t = useT()
  const navigate = useNavigate()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const composingRef = useRef(false)

  const isPlFav = (pl: Playlist) => favoritePlaylists.some((p) => p.source === pl.source && p.id === pl.id)
  const toggleFavFor = (pl: Playlist) => {
    if (isPlFav(pl)) removeFavoritePlaylist(pl.source, pl.id)
    else addFavoritePlaylist(pl)
  }

  const scheduleSearch = (v: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (v.trim()) {
        search(v.trim())
        setFocused(false) // a search fired — hide history so it doesn't cover results
      }
    }, 900)
  }

  // Auto-search only after the user clearly stops typing — and never mid-IME
  // composition (e.g. while choosing a pinyin candidate), which used to fire a
  // search with half-typed text on a brief pause.
  const handleChange = (v: string) => {
    setInputValue(v)
    if (composingRef.current) {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      return
    }
    scheduleSearch(v)
  }

  const runSearch = (q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (q.trim()) search(q.trim())
  }

  // Arriving from the player bar's "search on another platform" action: it carries
  // the target platform + a "title artist" query — fill the box and run it.
  useEffect(() => {
    if (!navSearch) return
    setInputValue(navSearch.query)
    setFocused(false)
    searchOnPlatform(navSearch.platform, navSearch.query)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navSearch])

  const HISTORY_COLLAPSED = 15
  const shownHistory = expanded ? searchHistory : searchHistory.slice(0, HISTORY_COLLAPSED)

  // Landing state (nothing typed) → show the hot-search word cloud in the middle
  // instead of the empty placeholder. Hides as soon as the user types.
  const nothingSearched = !inputValue.trim()
  const showHotCloud =
    nothingSearched &&
    !isLoading &&
    !error &&
    (scope === "song" ? results.length === 0 : playlistResults.length === 0)

  // Only NetEase resolves an exact nickname to that user's playlists.
  const playlistSupportsUser = platform === "wy"
  const playlistPlaceholder = playlistSupportsUser
    ? "search.placeholderPlaylistUser"
    : "search.placeholderPlaylist"
  const playlistHint = playlistSupportsUser ? "search.playlistHintUser" : "search.playlistHint"

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border">
        <div className="relative">
          <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground z-10" />
          <Input
            className="pl-9 pr-9"
            placeholder={t(scope === "song" ? "search.placeholder" : playlistPlaceholder)}
            value={inputValue}
            onChange={(e) => handleChange(e.target.value)}
            onCompositionStart={() => { composingRef.current = true }}
            onCompositionEnd={(e) => {
              composingRef.current = false
              handleChange((e.target as HTMLInputElement).value)
            }}
            onFocus={() => setFocused(true)}
            onClick={() => setFocused(true)}
            onBlur={() => window.setTimeout(() => setFocused(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                runSearch(inputValue)
                setFocused(false)
              }
            }}
          />
          {inputValue && (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (debounceRef.current) clearTimeout(debounceRef.current)
                setInputValue("")
                clearResults()
                setFocused(false)
              }}
              title={t("search.clear")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 z-10 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={15} />
            </button>
          )}

          {focused && searchHistory.length > 0 && (
            <div className="absolute z-20 left-0 right-0 mt-1.5 rounded-xl border border-border bg-popover shadow-lg p-2.5">
              <div className="flex items-center justify-between px-1 pb-1.5">
                <p className="text-xs text-muted-foreground">{t("search.history")}</p>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => clearHistory()}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                >
                  {t("search.clearHistory")}
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {shownHistory.map((h) => (
                  <div
                    key={h}
                    className="flex items-center rounded-full bg-secondary text-secondary-foreground hover:bg-accent transition-colors"
                  >
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setInputValue(h)
                        setFocused(false)
                        runSearch(h)
                      }}
                      className="text-xs pl-2.5 pr-1 py-1 max-w-[14rem] truncate"
                    >
                      {h}
                    </button>
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => removeHistoryItem(h)}
                      title={t("search.removeHistory")}
                      className="pr-2 pl-0.5 py-1 text-muted-foreground/50 hover:text-destructive transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
              {searchHistory.length > HISTORY_COLLAPSED && (
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setExpanded((v) => !v)}
                  className="mt-2 w-full text-xs text-muted-foreground hover:text-foreground py-0.5"
                >
                  {expanded ? t("search.collapse") : t("search.expandAll", { count: searchHistory.length })}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Search scope (songs / playlists) + platform selector */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center gap-1 rounded-full bg-muted/70 p-1">
            {(["song", "playlist"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                  scope === s ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t(s === "song" ? "search.scopeSong" : "search.scopePlaylist")}
              </button>
            ))}
          </div>
          <PlatformTabs value={platform} onChange={setPlatform} />
        </div>
      </div>

      {showHotCloud ? (
        <HotSearchCloud
          platform={platform}
          platformLabel={t(`platform.${platform}`)}
          onSelect={(kw) => {
            setInputValue(kw)
            setFocused(false)
            runSearch(kw)
          }}
        />
      ) : scope === "playlist" ? (
        playlistResults.length === 0 && !isLoading && !error ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
            <div className="h-16 w-16 rounded-2xl bg-muted/60 flex items-center justify-center mb-4">
              <SearchIcon size={28} className="text-muted-foreground" />
            </div>
            <p className="text-base font-medium">{t("search.emptyTitlePlaylist")}</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">{t(playlistHint)}</p>
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="p-4">
              {isLoading && playlistResults.length === 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="space-y-2">
                      <Skeleton className="aspect-square w-full rounded-xl" />
                      <Skeleton className="h-3.5 w-3/4" />
                    </div>
                  ))}
                </div>
              ) : error ? (
                <div className="text-center py-12 text-destructive">{t("search.failed", { msg: error })}</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 items-start">
                  {playlistResults.map((pl) => (
                    <PlaylistCard
                      key={`${pl.source}:${pl.id}`}
                      playlist={pl}
                      onOpen={() => navigate("/hot-playlists", { state: { openPlaylist: pl } })}
                      onPlay={() => playPlaylist(pl)}
                      onToggleFavorite={() => toggleFavFor(pl)}
                      favorited={isPlFav(pl)}
                    />
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        )
      ) : results.length === 0 && !isLoading && !error ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
          <div className="h-16 w-16 rounded-2xl bg-muted/60 flex items-center justify-center mb-4">
            <SearchIcon size={28} className="text-muted-foreground" />
          </div>
          <p className="text-base font-medium">{t("search.emptyTitle")}</p>
          <p className="text-sm text-muted-foreground mt-1">{t("search.emptyHint")}</p>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="px-4 py-2">
            {isLoading && results.length === 0 && (
              <div className="space-y-1.5 py-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2">
                    <Skeleton className="h-10 w-10 rounded-md shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-1/3" />
                      <Skeleton className="h-3 w-1/4" />
                    </div>
                    <Skeleton className="h-3 w-10" />
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div className="text-center py-12 text-destructive">
                <p>{t("search.failed", { msg: error })}</p>
              </div>
            )}

            {results.map((song) => (
              <TrackRow key={song.id} song={song} />
            ))}

            {results.length > 0 && page < allPage && (
              <div className="py-4 text-center">
                <Button
                  variant="outline"
                  onClick={() => search(useSearchStore.getState().query, page + 1)}
                  disabled={isLoading}
                >
                  {isLoading ? t("search.loading") : t("search.loadMore")}
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
