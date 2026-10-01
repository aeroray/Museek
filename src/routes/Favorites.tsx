import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Heart,
  Play,
  Plus,
  Trash2,
  Music,
  Download,
  Check,
  CheckCheck,
  Pencil,
  ArrowDownUp,
  ListFilter,
  Loader2,
  Search,
  Tags,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PlaylistCard } from "@/components/common/PlaylistCard";
import { PlatformBadge } from "@/components/common/MetaBadges";
import { playPlaylist } from "@/lib/playlists/play";
import { playAlbum } from "@/lib/albums/play";
import { playlistFavKey, playlistKind } from "@/lib/playlists";
import { usePlaylistStore } from "@/stores/playlistStore";
import { usePlayerStore } from "@/stores/playerStore";
import { useDownloadStore } from "@/stores/downloadStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUiStore } from "@/stores/uiStore";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { MusicInfo, OnlineSource, Quality } from "@/types/music";
import {
  categoryNameMap,
  filterByCategoryId,
  labelForCategoryFilter,
  sharedCategoryId,
  type CategoryFilter,
} from "@/lib/songCategories";
import { CategoryAssignItems } from "@/components/songCategories/CategoryAssignItems";
import { CategoryAssignMenu } from "@/components/songCategories/CategoryAssignMenu";
import { CategoryFilterMenu } from "@/components/songCategories/CategoryFilterMenu";
import { CategoryNameDialog } from "@/components/songCategories/CategoryNameDialog";
import { useCategoryDialog } from "@/components/songCategories/useCategoryDialog";
import {
  LastfmLovedError,
  LastfmLovedPanel,
  LastfmLovedSkeleton,
  lovedTrackKey,
} from "@/components/favorites/LastfmLovedPanel";
import { pickLovedMatch, resolveLovedTrack } from "@/lib/lastfm/lovedPlayback";
import {
  cachedLovedFor,
  useLastfmStore,
  type LovedTrack,
} from "@/stores/lastfmStore";

const PLATFORMS: OnlineSource[] = ["wy", "kw", "kg", "tx", "mg"];
const SORTS = ["added", "name"] as const;

/** The local tabs. "lastfm" is prepended only while the integration is on. */
const LOCAL_FAVORITE_TABS = ["songs", "playlists", "albums"] as const;
type FavoriteTab = "lastfm" | (typeof LOCAL_FAVORITE_TABS)[number];

/**
 * How the loved list can be ordered.
 *
 * `recent` is the order Last.fm returns and the only one that carries
 * information the list itself does not already show — the others are for finding
 * a song you can already name.
 */
const LOVED_SORTS = ["recent", "name", "artist"] as const;
type LovedSort = (typeof LOVED_SORTS)[number];

export function Favorites() {
  const favorites = usePlaylistStore((s) => s.favorites);
  const removeFromFavorites = usePlaylistStore((s) => s.removeFromFavorites);
  const favoritePlaylists = usePlaylistStore((s) => s.favoritePlaylists);
  const removeFavoritePlaylist = usePlaylistStore(
    (s) => s.removeFavoritePlaylist,
  );
  const favoriteCategories = usePlaylistStore((s) => s.favoriteCategories);
  const favoriteSongCategories = usePlaylistStore(
    (s) => s.favoriteSongCategories,
  );
  const addFavoriteCategory = usePlaylistStore((s) => s.addFavoriteCategory);
  const renameFavoriteCategory = usePlaylistStore(
    (s) => s.renameFavoriteCategory,
  );
  const removeFavoriteCategory = usePlaylistStore(
    (s) => s.removeFavoriteCategory,
  );
  const setFavoritesCategory = usePlaylistStore((s) => s.setFavoritesCategory);
  const play = usePlayerStore((s) => s.play);
  const playAll = usePlayerStore((s) => s.playAll);
  const addToQueue = usePlayerStore((s) => s.addToQueue);
  const addTask = useDownloadStore((s) => s.addTask);
  const favoritesSort = useSettingsStore((s) => s.favoritesSort);
  const favoritesPlatform = useSettingsStore((s) => s.favoritesPlatform);
  const setFavoritesSort = useSettingsStore((s) => s.setFavoritesSort);
  const setFavoritesPlatform = useSettingsStore((s) => s.setFavoritesPlatform);
  const tab = useUiStore((s) => s.favoritesTab);
  const setTab = useUiStore((s) => s.setFavoritesTab);
  const notify = useUiStore((s) => s.notify);
  const lastfmEnabled = useLastfmStore((s) => s.enabled);
  const lastfmUsername = useLastfmStore((s) => s.username);
  const lastfmApiKey = useLastfmStore((s) => s.apiKey);
  const lovedCache = useLastfmStore((s) => s.lovedCache);
  const lovedLoading = useLastfmStore((s) => s.lovedLoading);
  const lovedError = useLastfmStore((s) => s.lovedError);
  const loadLovedTracks = useLastfmStore((s) => s.loadLovedTracks);
  const t = useT();
  const navigate = useNavigate();

  // The Last.fm tab exists only while the integration is on, but the stored tab
  // survives switching it off — so a tab that no longer exists must not render
  // an empty page. Same rule as the 足迹 page.
  const tabs: FavoriteTab[] = lastfmEnabled
    ? ["lastfm", ...LOCAL_FAVORITE_TABS]
    : [...LOCAL_FAVORITE_TABS];
  const activeTab: FavoriteTab = tabs.includes(tab) ? tab : "songs";
  const isLastfm = activeTab === "lastfm";
  const canLoadLoved = Boolean(lastfmApiKey.trim() && lastfmUsername.trim());
  const loved = cachedLovedFor(lovedCache, lastfmUsername);
  const [resolvingLoved, setResolvingLoved] = useState<string | null>(null);
  const [lovedQuery, setLovedQuery] = useState("");
  const [lovedSort, setLovedSort] = useState<LovedSort>("recent");
  const [preparingAll, setPreparingAll] = useState(false);

  /** The loved list after the tab's own search and sort. */
  const lovedDisplayed = useMemo(() => {
    const needle = lovedQuery.trim().toLowerCase();
    const rows = (loved?.tracks ?? []).filter(
      (track) =>
        !needle ||
        track.name.toLowerCase().includes(needle) ||
        track.artist.toLowerCase().includes(needle),
    );
    if (lovedSort === "name") {
      return [...rows].sort((a, b) => a.name.localeCompare(b.name));
    }
    if (lovedSort === "artist") {
      return [...rows].sort(
        (a, b) => a.artist.localeCompare(b.artist) || a.name.localeCompare(b.name),
      );
    }
    // Most recently loved first, which is the order Last.fm returns.
    return [...rows].sort((a, b) => (b.lovedAt ?? 0) - (a.lovedAt ?? 0));
  }, [loved, lovedQuery, lovedSort]);

  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const categoryDialog = useCategoryDialog({
    addCategory: addFavoriteCategory,
    renameCategory: renameFavoriteCategory,
    onExists: () =>
      notify({ message: t("local.categoryExists"), variant: "error" }),
    onCreated: (cat, assignSelected) => {
      if (assignSelected && selected.size > 0) {
        setFavoritesCategory([...selected], cat.id);
        exitEdit();
      }
    },
  });

  const isSongs = activeTab === "songs";
  const isAlbums = activeTab === "albums";

  const categoryNameById = useMemo(
    () => categoryNameMap(favoriteCategories),
    [favoriteCategories],
  );

  const displayedSongs = useMemo(() => {
    let list =
      favoritesPlatform === "all"
        ? favorites
        : favorites.filter((f) => f.source === favoritesPlatform);
    list = filterByCategoryId(
      list,
      categoryFilter,
      (song) => favoriteSongCategories[song.id],
    );
    const q = query.trim().toLowerCase();
    if (q)
      list = list.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.singer.toLowerCase().includes(q),
      );
    if (favoritesSort === "name")
      list = [...list].sort((a, b) => a.name.localeCompare(b.name, "zh"));
    return list;
  }, [
    favorites,
    favoritesPlatform,
    favoritesSort,
    query,
    categoryFilter,
    favoriteSongCategories,
  ]);

  const favoritePlaylistsOnly = useMemo(
    () => favoritePlaylists.filter((p) => playlistKind(p) === "playlist"),
    [favoritePlaylists],
  );
  const favoriteAlbumsOnly = useMemo(
    () => favoritePlaylists.filter((p) => playlistKind(p) === "album"),
    [favoritePlaylists],
  );

  const displayedLists = useMemo(() => {
    const sourceList = isAlbums ? favoriteAlbumsOnly : favoritePlaylistsOnly;
    let list =
      favoritesPlatform === "all"
        ? sourceList
        : sourceList.filter((p) => p.source === favoritesPlatform);
    const q = query.trim().toLowerCase();
    if (q)
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.author ?? "").toLowerCase().includes(q),
      );
    if (favoritesSort === "name")
      list = [...list].sort((a, b) => a.name.localeCompare(b.name, "zh"));
    return list;
  }, [
    isAlbums,
    favoriteAlbumsOnly,
    favoritePlaylistsOnly,
    favoritesPlatform,
    favoritesSort,
    query,
  ]);

  const tabTotal = isLastfm
    ? (loved?.tracks.length ?? 0)
    : isSongs
      ? favorites.length
      : isAlbums
        ? favoriteAlbumsOnly.length
        : favoritePlaylistsOnly.length;
  const currentKeys = isLastfm
    ? []
    : isSongs
      ? displayedSongs.map((s) => s.id)
      : displayedLists.map((p) => playlistFavKey(p));
  const allSelected =
    currentKeys.length > 0 && currentKeys.every((k) => selected.has(k));

  const categoryFilterLabel = labelForCategoryFilter(
    categoryFilter,
    categoryNameById,
    {
      all: t("local.categoryAll"),
      none: t("local.categoryNone"),
    },
  );

  const toggleOne = (key: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(currentKeys));
  const exitEdit = () => {
    setEditing(false);
    setSelected(new Set());
  };
  const switchTab = (id: FavoriteTab) => {
    setTab(id);
    setCategoryFilter("all");
    exitEdit();
  };

  /**
   * Play a loved track.
   *
   * Last.fm stores an artist and a title, not a playable recording, so the song
   * has to be found on a platform first. That lookup is fallible, and a wrong
   * guess plays the wrong song while the player bar shows the right one — so a
   * failure is reported rather than approximated.
   */
  const playLoved = async (track: LovedTrack) => {
    const key = lovedTrackKey(track);
    setResolvingLoved(key);
    try {
      // A song the user already favourited is the exact recording they chose, so
      // it is played directly instead of being searched for. Reported: a loved
      // track that WAS in the user's favourites still came back "not found",
      // because the search was the only path and it could not match.
      const local = pickLovedMatch(track, favorites);
      const song = local ?? (await resolveLovedTrack(track));
      if (!song) {
        notify({
          message: t("favorites.lastfm.notFound", { name: track.name }),
          variant: "error",
        });
        return;
      }
      await play(song);
    } finally {
      setResolvingLoved(null);
    }
  };

  // Fetch when the tab is first opened. The store decides whether that means a
  // request, so returning to the tab in the same run does not re-fetch.
  useEffect(() => {
    if (!isLastfm || !canLoadLoved) return;
    void loadLovedTracks();
  }, [isLastfm, canLoadLoved, loadLovedTracks]);

  /**
   * Queue the whole loved list.
   *
   * Every row has to become a playable recording first, which is why this is not
   * instant: a loved track that is already one of the user's favourites resolves
   * from the local list with no request at all, and only the rest are searched
   * for. Those are searched a few at a time rather than strictly one by one, and
   * anything that cannot be found is reported instead of being dropped in
   * silence — a "play all" that quietly plays half the list is worse than one
   * that says so.
   */
  const playAllLoved = async () => {
    if (preparingAll || lovedDisplayed.length === 0) return;
    setPreparingAll(true);
    try {
      const resolved: (MusicInfo | null)[] = lovedDisplayed.map(() => null);
      const toSearch: number[] = [];
      lovedDisplayed.forEach((track, index) => {
        const local = pickLovedMatch(track, favorites);
        if (local) resolved[index] = local;
        else toSearch.push(index);
      });

      const CONCURRENCY = 6;
      let cursor = 0;
      await Promise.all(
        Array.from(
          { length: Math.min(CONCURRENCY, toSearch.length) },
          async () => {
            while (cursor < toSearch.length) {
              const index = toSearch[cursor++];
              resolved[index] = await resolveLovedTrack(lovedDisplayed[index]);
            }
          },
        ),
      );

      const songs = resolved.filter((song): song is MusicInfo => Boolean(song));
      if (songs.length === 0) {
        notify({
          message: t("favorites.lastfm.notFoundAll"),
          variant: "error",
        });
        return;
      }
      const missing = resolved.length - songs.length;
      if (missing > 0) {
        notify({ message: t("favorites.lastfm.someMissing", { count: missing }) });
      }
      await playAll(songs);
    } finally {
      setPreparingAll(false);
    }
  };

  const batchDownload = () => {
    favorites.filter((f) => selected.has(f.id)).forEach((f) => addTask(f));
    exitEdit();
  };
  const batchDelete = () => {
    if (isSongs) {
      selected.forEach((id) => removeFromFavorites(id));
    } else {
      displayedLists
        .filter((p) => selected.has(playlistFavKey(p)))
        .forEach((p) =>
          removeFavoritePlaylist(p.source, p.id, playlistKind(p)),
        );
    }
    exitEdit();
  };
  const batchMove = (categoryId: string | null) => {
    setFavoritesCategory([...selected], categoryId);
    exitEdit();
  };

  const deleteCategory = (id: string) => {
    removeFavoriteCategory(id);
    if (categoryFilter === id) setCategoryFilter("all");
  };

  const emptyTitleKey = isSongs
    ? "favorites.empty"
    : isAlbums
      ? "favorites.emptyAlbums"
      : "favorites.emptyPlaylists";
  const emptyHintKey = isSongs
    ? "favorites.emptyHint"
    : isAlbums
      ? "favorites.emptyAlbumsHint"
      : "favorites.emptyPlaylistsHint";
  const searchPlaceholderKey = isSongs
    ? "favorites.searchPlaceholder"
    : isAlbums
      ? "favorites.searchAlbumsPlaceholder"
      : "favorites.searchPlaylistsPlaceholder";

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border flex items-center gap-3">
        <Heart size={20} className="text-red-500 fill-red-500 shrink-0" />
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-tight">
            {t("favorites.title")}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {/* The local counts say nothing about the Last.fm list, and showing
                "0 songs" beside a list of loved tracks reads as a bug. */}
            {isLastfm
              ? t(
                  (loved?.total ?? 0) > (loved?.tracks.length ?? 0)
                    ? "favorites.lastfm.summaryPartial"
                    : "favorites.lastfm.summary",
                  {
                    count: loved?.tracks.length ?? 0,
                    total: loved?.total ?? 0,
                  },
                )
              : t("favorites.summary", {
                  songs: favorites.length,
                  playlists: favoritePlaylistsOnly.length,
                  albums: favoriteAlbumsOnly.length,
                })}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {isLastfm && lovedDisplayed.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              className="h-8"
              disabled={preparingAll}
              onClick={() => void playAllLoved()}
            >
              {preparingAll ? (
                <Loader2 size={14} className="mr-1.5 animate-spin" />
              ) : (
                <Play
                  size={14}
                  className="mr-1.5"
                  fill="currentColor"
                  strokeWidth={0}
                />
              )}
              {t("favorites.playAll")}
            </Button>
          )}
          {isSongs && favorites.length > 0 && !editing && (
            <Button
              variant="secondary"
              size="sm"
              className="h-8"
              onClick={() => playAll(displayedSongs)}
            >
              <Play
                size={14}
                className="mr-1.5"
                fill="currentColor"
                strokeWidth={0}
              />
              {t("favorites.playAll")}
            </Button>
          )}
          <div className="inline-flex items-center gap-1 rounded-full bg-muted/70 p-1">
            {tabs.map((id) => (
              <button
                key={id}
                onClick={() => switchTab(id)}
                className={cn(
                  "px-3 py-1 rounded-full text-sm font-medium transition-colors",
                  activeTab === id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {id === "lastfm"
                  ? t("favorites.tabLastfm")
                  : id === "songs"
                    ? t("favorites.tabSongs")
                    : id === "albums"
                      ? t("favorites.tabAlbums")
                      : t("favorites.tabPlaylists")}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* The loved list is the account's, not this device's, so it gets its own
          bar: sort, search and refresh, in the same 12-row shape as the local
          one below so switching tabs does not move the list. */}
      {isLastfm && (loved || lovedLoading) && (
        <div className="flex h-12 min-h-12 max-h-12 shrink-0 items-center gap-2 overflow-hidden border-b border-border px-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 gap-1.5"
              >
                <ArrowDownUp size={14} />
                <span className="hidden sm:inline">
                  {t(`favorites.lastfm.sort.${lovedSort}`)}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {LOVED_SORTS.map((id) => (
                <DropdownMenuItem key={id} onSelect={() => setLovedSort(id)}>
                  {t(`favorites.lastfm.sort.${id}`)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="relative min-w-0 flex-1">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              className="h-8 py-0 pl-9"
              placeholder={t("favorites.lastfm.searchPlaceholder")}
              value={lovedQuery}
              onChange={(e) => setLovedQuery(e.target.value)}
            />
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            // Disabled while a fetch is running so a second one cannot overlap,
            // and when there is nothing to fetch with. Same affordance as the
            // 足迹 tab's refresh.
            disabled={lovedLoading || !canLoadLoved}
            onClick={() => void loadLovedTracks({ force: true })}
            title={
              loved ? t("favorites.lastfm.reload") : t("favorites.lastfm.load")
            }
          >
            <RefreshCw
              size={15}
              className={cn(lovedLoading && "animate-spin")}
            />
          </Button>
        </div>
      )}

      {/* The sort / category / search bar filters THIS device's favourites, so it
          does not apply to the Last.fm tab — that list is the account's and is
          ordered by Last.fm. */}
      {!isLastfm && tabTotal > 0 && (
        <div className="flex h-12 min-h-12 max-h-12 shrink-0 items-center gap-2 overflow-hidden border-b border-border px-4">
          {!editing ? (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 gap-1.5"
                  >
                    <ArrowDownUp size={14} />
                    <span className="hidden sm:inline">
                      {t(`favorites.sort.${favoritesSort}`)}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {SORTS.map((s) => (
                    <DropdownMenuCheckboxItem
                      key={s}
                      checked={favoritesSort === s}
                      showUncheckedIndicator
                      onCheckedChange={() => setFavoritesSort(s)}
                    >
                      {t(`favorites.sort.${s}`)}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 gap-1.5"
                  >
                    <ListFilter size={14} />
                    <span className="hidden sm:inline">
                      {favoritesPlatform === "all"
                        ? t("favorites.allPlatforms")
                        : t(`platform.${favoritesPlatform}`)}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuCheckboxItem
                    checked={favoritesPlatform === "all"}
                    showUncheckedIndicator
                    onCheckedChange={() => setFavoritesPlatform("all")}
                  >
                    {t("favorites.allPlatforms")}
                  </DropdownMenuCheckboxItem>
                  {PLATFORMS.map((p) => (
                    <DropdownMenuCheckboxItem
                      key={p}
                      checked={favoritesPlatform === p}
                      showUncheckedIndicator
                      onCheckedChange={() => setFavoritesPlatform(p)}
                    >
                      {t(`platform.${p}`)}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {isSongs && (
                <CategoryFilterMenu
                  categories={favoriteCategories}
                  filter={categoryFilter}
                  filterLabel={categoryFilterLabel}
                  onFilter={setCategoryFilter}
                  onCreate={() => categoryDialog.openCreate()}
                  onRename={categoryDialog.openRename}
                  onDelete={deleteCategory}
                  labels={{
                    all: t("local.categoryAll"),
                    none: t("local.categoryNone"),
                    add: t("local.categoryAdd"),
                    rename: t("local.categoryRename"),
                    delete: t("local.categoryDelete"),
                  }}
                />
              )}

              <div className="relative min-w-0 flex-1">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  className="h-8 py-0 pl-9"
                  placeholder={t(searchPlaceholderKey)}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="h-8 shrink-0"
                onClick={() => setEditing(true)}
              >
                <Pencil size={14} className="mr-1.5" />
                {t("favorites.batchEdit")}
              </Button>
            </>
          ) : (
            <>
              <span className="truncate text-sm leading-8 text-muted-foreground">
                {t("favorites.selectedCount", { count: selected.size })}
              </span>
              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8"
                  onClick={toggleAll}
                >
                  <CheckCheck size={14} className="mr-1.5" />
                  {allSelected
                    ? t("favorites.deselectAll")
                    : t("favorites.selectAll")}
                </Button>
                {isSongs && (
                  <>
                    <CategoryAssignMenu
                      categories={favoriteCategories}
                      disabled={selected.size === 0}
                      selectedId={sharedCategoryId(
                        [...selected].map(
                          (id) => favoriteSongCategories[id] ?? null,
                        ),
                      )}
                      onAssign={batchMove}
                      onCreate={() => categoryDialog.openCreate(true)}
                      labels={{
                        move: t("local.batchMove"),
                        none: t("local.categoryNone"),
                        add: t("local.categoryAdd"),
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      disabled={selected.size === 0}
                      onClick={() =>
                        addToQueue(favorites.filter((f) => selected.has(f.id)))
                      }
                    >
                      <Plus size={14} className="mr-1.5" />
                      {t("common.addToQueue")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      disabled={selected.size === 0}
                      onClick={batchDownload}
                    >
                      <Download size={14} className="mr-1.5" />
                      {t("favorites.batchDownload")}
                    </Button>
                  </>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-destructive hover:text-destructive"
                  disabled={selected.size === 0}
                  onClick={batchDelete}
                >
                  <Trash2 size={14} className="mr-1.5" />
                  {t("favorites.batchDelete")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8"
                  onClick={exitEdit}
                >
                  {t("common.cancel")}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {isLastfm ? (
        <ScrollArea className="flex-1">
          {loved && loved.tracks.length > 0 ? (
            lovedDisplayed.length > 0 ? (
              <LastfmLovedPanel
                tracks={lovedDisplayed}
                resolvingKey={resolvingLoved}
                onPlay={(track) => void playLoved(track)}
              />
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">
                {t("favorites.noMatch")}
              </p>
            )
          ) : lovedLoading ? (
            <LastfmLovedSkeleton />
          ) : loved ? (
            // Fetched, and the account simply has nothing loved yet.
            <LastfmLovedPanel
              tracks={[]}
              resolvingKey={null}
              onPlay={() => {}}
            />
          ) : (
            <LastfmLovedError
              message={
                lovedError ??
                (canLoadLoved
                  ? t("favorites.lastfm.empty")
                  : t("lastfm.err.notConnected"))
              }
            />
          )}
        </ScrollArea>
      ) : tabTotal === 0 ? (
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl p-4">
            <div className="flex min-h-[18rem] flex-col items-center justify-center px-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/70 text-muted-foreground">
                {isSongs ? (
                  <Heart size={28} strokeWidth={1.6} />
                ) : (
                  <Music size={28} strokeWidth={1.6} />
                )}
              </div>
              <p className="mt-4 text-sm font-medium">{t(emptyTitleKey)}</p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground text-pretty">
                {t(emptyHintKey)}
              </p>
            </div>
          </div>
        </div>
      ) : isSongs ? (
        <ScrollArea className="flex-1">
          <div className="px-4 py-2">
            {displayedSongs.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-12">
                {t("favorites.noMatch")}
              </p>
            ) : (
              displayedSongs.map((song) => {
                const sel = selected.has(song.id);
                const catId = favoriteSongCategories[song.id];
                const catName = catId ? categoryNameById.get(catId) : undefined;
                return (
                  <div
                    key={song.id}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2 rounded-md group cursor-pointer hover:bg-accent/50",
                      editing && sel && "bg-primary/10",
                    )}
                    onClick={editing ? () => toggleOne(song.id) : undefined}
                    onDoubleClick={editing ? undefined : () => play(song)}
                  >
                    {editing && (
                      <span
                        className={cn(
                          "h-5 w-5 rounded-full border flex items-center justify-center shrink-0 transition-colors",
                          sel
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-muted-foreground/40",
                        )}
                      >
                        {sel && <Check size={13} />}
                      </span>
                    )}

                    <div className="relative h-10 w-10 shrink-0 rounded-xl overflow-hidden bg-muted shadow-[var(--shadow-border)]">
                      {song.meta.picUrl ? (
                        <img
                          src={song.meta.picUrl}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                          <Music size={16} />
                        </div>
                      )}
                      {!editing && (
                        <button
                          onClick={() => play(song)}
                          className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100"
                        >
                          <Play
                            size={16}
                            className="ml-0.5 text-white"
                            fill="currentColor"
                            strokeWidth={0}
                          />
                        </button>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate font-medium">
                        {song.name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {song.singer}
                      </p>
                    </div>

                    {catName && (
                      <span className="inline-flex max-w-24 shrink-0 items-center truncate rounded px-1.5 h-4 text-[10px] font-medium leading-none bg-muted/80 text-muted-foreground">
                        {catName}
                      </span>
                    )}

                    {song.source && <PlatformBadge source={song.source} />}

                    <span className="text-xs text-muted-foreground w-12 text-right shrink-0 tabular-nums">
                      {song.interval}
                    </span>

                    {!editing && (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 icon-hover-plus"
                          onClick={(e) => {
                            e.stopPropagation();
                            addToQueue([song]);
                          }}
                          title={t("common.addToQueue")}
                        >
                          <Plus size={13} />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
                              onClick={(e) => e.stopPropagation()}
                              title={t("local.batchMove")}
                            >
                              <Tags size={13} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="max-h-72 overflow-y-auto"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <CategoryAssignItems
                              categories={favoriteCategories}
                              selectedId={catId ?? null}
                              onAssign={(categoryId) =>
                                setFavoritesCategory([song.id], categoryId)
                              }
                              onCreate={() => {
                                setSelected(new Set([song.id]));
                                categoryDialog.openCreate(true);
                              }}
                              labels={{
                                none: t("local.categoryNone"),
                                add: t("local.categoryAdd"),
                              }}
                            />
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 text-muted-foreground"
                              onClick={(e) => e.stopPropagation()}
                              title={t("common.download")}
                            >
                              <Download size={13} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="min-w-[11rem]"
                          >
                            {song.meta.qualitys.map((q) => (
                              <DropdownMenuItem
                                key={q.type}
                                onClick={() => addTask(song, q.type as Quality)}
                                className="justify-between gap-8"
                              >
                                <span>
                                  {t("search.download", { quality: q.type })}
                                </span>
                                {q.size && (
                                  <span className="text-muted-foreground text-xs tabular-nums">
                                    {q.size}
                                  </span>
                                )}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFromFavorites(song.id);
                          }}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      ) : (
        <ScrollArea className="flex-1">
          {displayedLists.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-12">
              {t("favorites.noMatch")}
            </p>
          ) : (
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 items-start">
              {displayedLists.map((pl) => {
                const key = playlistFavKey(pl);
                const isAlbum = playlistKind(pl) === "album";
                return (
                  <PlaylistCard
                    key={key}
                    playlist={pl}
                    onOpen={() =>
                      isAlbum
                        ? navigate("/hot-albums", {
                            state: {
                              openAlbum: {
                                id: pl.id,
                                name: pl.name,
                                img: pl.img,
                                author: pl.author,
                                publishTime: pl.publishTime,
                                songCount: pl.songCount,
                                source: pl.source as OnlineSource,
                              },
                              fromFavorites: true,
                            },
                          })
                        : navigate("/hot-playlists", {
                            state: {
                              openPlaylist: {
                                id: pl.id,
                                name: pl.name,
                                img: pl.img,
                                playCount: pl.playCount,
                                author: pl.author,
                                source: pl.source,
                                kind: "playlist" as const,
                              },
                              fromFavorites: true,
                            },
                          })
                    }
                    onPlay={() =>
                      isAlbum
                        ? playAlbum({
                            id: pl.id,
                            name: pl.name,
                            img: pl.img,
                            author: pl.author,
                            source: pl.source as OnlineSource,
                          })
                        : playPlaylist(pl)
                    }
                    favorited
                    onToggleFavorite={() =>
                      removeFavoritePlaylist(pl.source, pl.id, playlistKind(pl))
                    }
                    selectable={editing}
                    selected={selected.has(key)}
                    onSelect={() => toggleOne(key)}
                  />
                );
              })}
            </div>
          )}
        </ScrollArea>
      )}

      <CategoryNameDialog
        dialog={categoryDialog.catDialog}
        name={categoryDialog.catName}
        onNameChange={categoryDialog.setCatName}
        inputRef={categoryDialog.catInputRef}
        onClose={categoryDialog.close}
        onSubmit={categoryDialog.submit}
        labels={{
          add: t("local.categoryAdd"),
          rename: t("local.categoryRename"),
          placeholder: t("local.categoryNamePlaceholder"),
          cancel: t("common.cancel"),
          confirm: t("common.confirm"),
        }}
      />
    </div>
  );
}
