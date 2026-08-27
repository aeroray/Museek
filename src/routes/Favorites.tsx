import { useMemo, useState } from "react";
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
  Search,
  Tags,
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
import type { OnlineSource, Quality } from "@/types/music";
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

const PLATFORMS: OnlineSource[] = ["wy", "kw", "kg", "tx", "mg"];
const SORTS = ["added", "name"] as const;

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
  const t = useT();
  const navigate = useNavigate();

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

  const isSongs = tab === "songs";
  const isAlbums = tab === "albums";

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

  const tabTotal = isSongs
    ? favorites.length
    : isAlbums
      ? favoriteAlbumsOnly.length
      : favoritePlaylistsOnly.length;
  const currentKeys = isSongs
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
  const switchTab = (id: "songs" | "playlists" | "albums") => {
    setTab(id);
    setCategoryFilter("all");
    exitEdit();
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
            {t("favorites.summary", {
              songs: favorites.length,
              playlists: favoritePlaylistsOnly.length,
              albums: favoriteAlbumsOnly.length,
            })}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
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
            {(["songs", "playlists", "albums"] as const).map((id) => (
              <button
                key={id}
                onClick={() => switchTab(id)}
                className={cn(
                  "px-3 py-1 rounded-full text-sm font-medium transition-colors",
                  tab === id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {id === "songs"
                  ? t("favorites.tabSongs")
                  : id === "albums"
                    ? t("favorites.tabAlbums")
                    : t("favorites.tabPlaylists")}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tabTotal > 0 && (
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

      {tabTotal === 0 ? (
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
                            state: { openPlaylist: pl, fromFavorites: true },
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
