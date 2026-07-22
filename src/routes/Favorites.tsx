import { useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Heart,
  Play,
  Trash2,
  Music,
  Download,
  Check,
  CheckCheck,
  Pencil,
  ArrowDownUp,
  ListFilter,
  Search,
  Plus,
  Tags,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { PlaylistCard } from "@/components/common/PlaylistCard"
import { PlatformBadge } from "@/components/common/MetaBadges"
import { playPlaylist } from "@/lib/playlists/play"
import { usePlaylistStore } from "@/stores/playlistStore"
import { usePlayerStore } from "@/stores/playerStore"
import { useDownloadStore } from "@/stores/downloadStore"
import { useSettingsStore } from "@/stores/settingsStore"
import { useUiStore } from "@/stores/uiStore"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { OnlineSource, Quality } from "@/types/music"

const PLATFORMS: OnlineSource[] = ["wy", "kw", "kg", "tx", "mg"]
const SORTS = ["added", "name"] as const
type CategoryFilter = "all" | "none" | string
type CatDialog =
  | { mode: "create" }
  | { mode: "rename"; id: string; name: string }
  | null

export function Favorites() {
  const favorites = usePlaylistStore((s) => s.favorites)
  const removeFromFavorites = usePlaylistStore((s) => s.removeFromFavorites)
  const favoritePlaylists = usePlaylistStore((s) => s.favoritePlaylists)
  const removeFavoritePlaylist = usePlaylistStore((s) => s.removeFavoritePlaylist)
  const favoriteCategories = usePlaylistStore((s) => s.favoriteCategories)
  const favoriteSongCategories = usePlaylistStore((s) => s.favoriteSongCategories)
  const addFavoriteCategory = usePlaylistStore((s) => s.addFavoriteCategory)
  const renameFavoriteCategory = usePlaylistStore((s) => s.renameFavoriteCategory)
  const removeFavoriteCategory = usePlaylistStore((s) => s.removeFavoriteCategory)
  const setFavoritesCategory = usePlaylistStore((s) => s.setFavoritesCategory)
  const play = usePlayerStore((s) => s.play)
  const playAll = usePlayerStore((s) => s.playAll)
  const addTask = useDownloadStore((s) => s.addTask)
  const favoritesSort = useSettingsStore((s) => s.favoritesSort)
  const favoritesPlatform = useSettingsStore((s) => s.favoritesPlatform)
  const setFavoritesSort = useSettingsStore((s) => s.setFavoritesSort)
  const setFavoritesPlatform = useSettingsStore((s) => s.setFavoritesPlatform)
  const tab = useUiStore((s) => s.favoritesTab)
  const setTab = useUiStore((s) => s.setFavoritesTab)
  const notify = useUiStore((s) => s.notify)
  const t = useT()
  const navigate = useNavigate()

  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all")
  const [catDialog, setCatDialog] = useState<CatDialog>(null)
  const [catName, setCatName] = useState("")
  const [assignAfterCreate, setAssignAfterCreate] = useState(false)
  const catInputRef = useRef<HTMLInputElement>(null)

  const isSongs = tab === "songs"

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of favoriteCategories) map.set(c.id, c.name)
    return map
  }, [favoriteCategories])

  const displayedSongs = useMemo(() => {
    let list = favoritesPlatform === "all" ? favorites : favorites.filter((f) => f.source === favoritesPlatform)
    if (categoryFilter === "none") {
      list = list.filter((f) => !favoriteSongCategories[f.id])
    } else if (categoryFilter !== "all") {
      list = list.filter((f) => favoriteSongCategories[f.id] === categoryFilter)
    }
    const q = query.trim().toLowerCase()
    if (q) list = list.filter((f) => f.name.toLowerCase().includes(q) || f.singer.toLowerCase().includes(q))
    if (favoritesSort === "name") list = [...list].sort((a, b) => a.name.localeCompare(b.name, "zh"))
    return list
  }, [
    favorites,
    favoritesPlatform,
    favoritesSort,
    query,
    categoryFilter,
    favoriteSongCategories,
  ])

  const displayedPlaylists = useMemo(() => {
    let list =
      favoritesPlatform === "all" ? favoritePlaylists : favoritePlaylists.filter((p) => p.source === favoritesPlatform)
    const q = query.trim().toLowerCase()
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q) || (p.author ?? "").toLowerCase().includes(q))
    if (favoritesSort === "name") list = [...list].sort((a, b) => a.name.localeCompare(b.name, "zh"))
    return list
  }, [favoritePlaylists, favoritesPlatform, favoritesSort, query])

  const total = isSongs ? favorites.length : favoritePlaylists.length
  const currentKeys = isSongs ? displayedSongs.map((s) => s.id) : displayedPlaylists.map((p) => `${p.source}:${p.id}`)
  const allSelected = currentKeys.length > 0 && currentKeys.every((k) => selected.has(k))

  const categoryFilterLabel =
    categoryFilter === "all"
      ? t("local.categoryAll")
      : categoryFilter === "none"
        ? t("local.categoryNone")
        : (categoryNameById.get(categoryFilter) ?? t("local.categoryAll"))

  const activeCategory =
    categoryFilter !== "all" && categoryFilter !== "none"
      ? favoriteCategories.find((c) => c.id === categoryFilter)
      : undefined

  const toggleOne = (key: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(currentKeys))
  const exitEdit = () => {
    setEditing(false)
    setSelected(new Set())
  }
  const switchTab = (id: "songs" | "playlists") => {
    setTab(id)
    setCategoryFilter("all")
    exitEdit()
  }

  const batchDownload = () => {
    favorites.filter((f) => selected.has(f.id)).forEach((f) => addTask(f))
    exitEdit()
  }
  const batchDelete = () => {
    if (isSongs) {
      selected.forEach((id) => removeFromFavorites(id))
    } else {
      favoritePlaylists
        .filter((p) => selected.has(`${p.source}:${p.id}`))
        .forEach((p) => removeFavoritePlaylist(p.source, p.id))
    }
    exitEdit()
  }
  const batchMove = (categoryId: string | null) => {
    setFavoritesCategory([...selected], categoryId)
    exitEdit()
  }

  const openCreateCategory = (assignSelected = false) => {
    setAssignAfterCreate(assignSelected)
    setCatName("")
    setCatDialog({ mode: "create" })
  }
  const openRenameCategory = (id: string, name: string) => {
    setAssignAfterCreate(false)
    setCatName(name)
    setCatDialog({ mode: "rename", id, name })
  }
  const submitCategory = () => {
    const name = catName.trim()
    if (!name || !catDialog) return
    if (catDialog.mode === "create") {
      const cat = addFavoriteCategory(name)
      if (!cat) {
        notify({ message: t("local.categoryExists"), variant: "error" })
        return
      }
      if (assignAfterCreate && selected.size > 0) {
        setFavoritesCategory([...selected], cat.id)
        exitEdit()
      } else {
        setCategoryFilter(cat.id)
      }
    } else {
      renameFavoriteCategory(catDialog.id, name)
    }
    setCatDialog(null)
    setAssignAfterCreate(false)
  }
  const deleteCategory = (id: string) => {
    removeFavoriteCategory(id)
    if (categoryFilter === id) setCategoryFilter("all")
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border flex items-center gap-3">
        <Heart size={20} className="text-red-500 fill-red-500 shrink-0" />
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-tight">{t("favorites.title")}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("favorites.summary", { songs: favorites.length, playlists: favoritePlaylists.length })}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {isSongs && favorites.length > 0 && !editing && (
            <Button variant="secondary" size="sm" className="h-8" onClick={() => playAll(displayedSongs)}>
              <Play size={14} className="mr-1.5" fill="currentColor" strokeWidth={0} />
              {t("favorites.playAll")}
            </Button>
          )}
          <div className="inline-flex items-center gap-1 rounded-full bg-muted/70 p-1">
            {(["songs", "playlists"] as const).map((id) => (
              <button
                key={id}
                onClick={() => switchTab(id)}
                className={cn(
                  "px-3 py-1 rounded-full text-sm font-medium transition-colors",
                  tab === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {id === "songs" ? t("favorites.tabSongs") : t("favorites.tabPlaylists")}
              </button>
            ))}
          </div>
        </div>
      </div>

      {total > 0 && (
        <div className="flex h-12 min-h-12 max-h-12 shrink-0 items-center gap-2 overflow-hidden border-b border-border px-4">
          {!editing ? (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 shrink-0 gap-1.5">
                    <ArrowDownUp size={14} />
                    <span className="hidden sm:inline">{t(`favorites.sort.${favoritesSort}`)}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {SORTS.map((s) => (
                    <DropdownMenuItem key={s} onClick={() => setFavoritesSort(s)}>
                      <Check size={14} className={cn("mr-2", favoritesSort === s ? "opacity-100" : "opacity-0")} />
                      {t(`favorites.sort.${s}`)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 shrink-0 gap-1.5">
                    <ListFilter size={14} />
                    <span className="hidden sm:inline">
                      {favoritesPlatform === "all" ? t("favorites.allPlatforms") : t(`platform.${favoritesPlatform}`)}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => setFavoritesPlatform("all")}>
                    <Check size={14} className={cn("mr-2", favoritesPlatform === "all" ? "opacity-100" : "opacity-0")} />
                    {t("favorites.allPlatforms")}
                  </DropdownMenuItem>
                  {PLATFORMS.map((p) => (
                    <DropdownMenuItem key={p} onClick={() => setFavoritesPlatform(p)}>
                      <Check size={14} className={cn("mr-2", favoritesPlatform === p ? "opacity-100" : "opacity-0")} />
                      {t(`platform.${p}`)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {isSongs && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 shrink-0 gap-1.5">
                      <Tags size={14} />
                      <span className="hidden sm:inline max-w-28 truncate">{categoryFilterLabel}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
                    <DropdownMenuItem onClick={() => setCategoryFilter("all")}>
                      <Check
                        size={14}
                        className={cn("mr-2", categoryFilter === "all" ? "opacity-100" : "opacity-0")}
                      />
                      {t("local.categoryAll")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setCategoryFilter("none")}>
                      <Check
                        size={14}
                        className={cn("mr-2", categoryFilter === "none" ? "opacity-100" : "opacity-0")}
                      />
                      {t("local.categoryNone")}
                    </DropdownMenuItem>
                    {favoriteCategories.length > 0 && <DropdownMenuSeparator />}
                    {favoriteCategories.map((cat) => (
                      <DropdownMenuItem key={cat.id} onClick={() => setCategoryFilter(cat.id)}>
                        <Check
                          size={14}
                          className={cn(
                            "mr-2",
                            categoryFilter === cat.id ? "opacity-100" : "opacity-0"
                          )}
                        />
                        {cat.name}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => openCreateCategory()}>
                      <Plus size={14} className="mr-2" />
                      {t("local.categoryAdd")}
                    </DropdownMenuItem>
                    {activeCategory && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => openRenameCategory(activeCategory.id, activeCategory.name)}
                        >
                          <Pencil size={14} className="mr-2" />
                          {t("local.categoryRename")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => deleteCategory(activeCategory.id)}
                        >
                          <Trash2 size={14} className="mr-2" />
                          {t("local.categoryDelete")}
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              <div className="relative min-w-0 flex-1">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  className="h-8 py-0 pl-9"
                  placeholder={t(isSongs ? "favorites.searchPlaceholder" : "favorites.searchPlaylistsPlaceholder")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>

              <Button variant="ghost" size="sm" className="h-8 shrink-0" onClick={() => setEditing(true)}>
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
                <Button variant="ghost" size="sm" className="h-8" onClick={toggleAll}>
                  <CheckCheck size={14} className="mr-1.5" />
                  {allSelected ? t("favorites.deselectAll") : t("favorites.selectAll")}
                </Button>
                {isSongs && (
                  <>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8" disabled={selected.size === 0}>
                          <Tags size={14} className="mr-1.5" />
                          {t("local.batchMove")}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
                        <DropdownMenuItem onClick={() => batchMove(null)}>
                          {t("local.categoryNone")}
                        </DropdownMenuItem>
                        {favoriteCategories.length > 0 && <DropdownMenuSeparator />}
                        {favoriteCategories.map((cat) => (
                          <DropdownMenuItem key={cat.id} onClick={() => batchMove(cat.id)}>
                            {cat.name}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => openCreateCategory(true)}>
                          <Plus size={14} className="mr-2" />
                          {t("local.categoryAdd")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
                <Button variant="ghost" size="sm" className="h-8" onClick={exitEdit}>
                  {t("common.cancel")}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {total === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
          <div className="h-16 w-16 rounded-2xl bg-muted/60 flex items-center justify-center mb-4">
            {isSongs ? (
              <Heart size={28} className="text-muted-foreground" />
            ) : (
              <Music size={28} className="text-muted-foreground" />
            )}
          </div>
          <p className="text-base font-medium">{t(isSongs ? "favorites.empty" : "favorites.emptyPlaylists")}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {t(isSongs ? "favorites.emptyHint" : "favorites.emptyPlaylistsHint")}
          </p>
        </div>
      ) : isSongs ? (
        <ScrollArea className="flex-1">
          <div className="px-4 py-2">
            {displayedSongs.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-12">{t("favorites.noMatch")}</p>
            ) : (
              displayedSongs.map((song) => {
                const sel = selected.has(song.id)
                const catId = favoriteSongCategories[song.id]
                const catName = catId ? categoryNameById.get(catId) : undefined
                return (
                  <div
                    key={song.id}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2 rounded-md group cursor-pointer hover:bg-accent/50",
                      editing && sel && "bg-primary/10"
                    )}
                    onClick={editing ? () => toggleOne(song.id) : undefined}
                    onDoubleClick={editing ? undefined : () => play(song)}
                  >
                    {editing && (
                      <span
                        className={cn(
                          "h-5 w-5 rounded-full border flex items-center justify-center shrink-0 transition-colors",
                          sel ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40"
                        )}
                      >
                        {sel && <Check size={13} />}
                      </span>
                    )}

                    <div className="relative h-10 w-10 shrink-0 rounded-xl overflow-hidden bg-muted shadow-[var(--shadow-border)]">
                      {song.meta.picUrl ? (
                        <img src={song.meta.picUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
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
                          <Play size={16} className="ml-0.5 text-white" fill="currentColor" strokeWidth={0} />
                        </button>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate font-medium">{song.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{song.singer}</p>
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
                            <DropdownMenuItem onClick={() => setFavoritesCategory([song.id], null)}>
                              <Check
                                size={14}
                                className={cn("mr-2", !catId ? "opacity-100" : "opacity-0")}
                              />
                              {t("local.categoryNone")}
                            </DropdownMenuItem>
                            {favoriteCategories.length > 0 && <DropdownMenuSeparator />}
                            {favoriteCategories.map((cat) => (
                              <DropdownMenuItem
                                key={cat.id}
                                onClick={() => setFavoritesCategory([song.id], cat.id)}
                              >
                                <Check
                                  size={14}
                                  className={cn(
                                    "mr-2",
                                    catId === cat.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                {cat.name}
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => {
                                setSelected(new Set([song.id]))
                                openCreateCategory(true)
                              }}
                            >
                              <Plus size={14} className="mr-2" />
                              {t("local.categoryAdd")}
                            </DropdownMenuItem>
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
                          <DropdownMenuContent align="end" className="min-w-[11rem]">
                            {song.meta.qualitys.map((q) => (
                              <DropdownMenuItem
                                key={q.type}
                                onClick={() => addTask(song, q.type as Quality)}
                                className="justify-between gap-8"
                              >
                                <span>{t("search.download", { quality: q.type })}</span>
                                {q.size && (
                                  <span className="text-muted-foreground text-xs tabular-nums">{q.size}</span>
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
                            e.stopPropagation()
                            removeFromFavorites(song.id)
                          }}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </ScrollArea>
      ) : (
        <ScrollArea className="flex-1">
          {displayedPlaylists.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-12">{t("favorites.noMatch")}</p>
          ) : (
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 items-start">
              {displayedPlaylists.map((pl) => {
                const key = `${pl.source}:${pl.id}`
                return (
                  <PlaylistCard
                    key={key}
                    playlist={pl}
                    onOpen={() =>
                      navigate("/hot-playlists", { state: { openPlaylist: pl, fromFavorites: true } })
                    }
                    onPlay={() => playPlaylist(pl)}
                    onRemove={() => removeFavoritePlaylist(pl.source, pl.id)}
                    selectable={editing}
                    selected={selected.has(key)}
                    onSelect={() => toggleOne(key)}
                  />
                )
              })}
            </div>
          )}
        </ScrollArea>
      )}

      <Dialog
        open={!!catDialog}
        onOpenChange={(open) => {
          if (!open) setCatDialog(null)
        }}
      >
        <DialogContent
          className="sm:max-w-sm"
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            catInputRef.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {catDialog?.mode === "rename" ? t("local.categoryRename") : t("local.categoryAdd")}
            </DialogTitle>
          </DialogHeader>
          <Input
            ref={catInputRef}
            value={catName}
            onChange={(e) => setCatName(e.target.value)}
            placeholder={t("local.categoryNamePlaceholder")}
            maxLength={32}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                submitCategory()
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatDialog(null)}>
              {t("common.cancel")}
            </Button>
            <Button disabled={!catName.trim()} onClick={submitCategory}>
              {t("common.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
