import { useMemo, useRef, useState } from "react"
import {
  HardDrive,
  FolderOpen,
  FolderPlus,
  FilePlus2,
  Music,
  Pencil,
  Check,
  CheckCheck,
  Trash2,
  Search,
  Play,
  Loader2,
  ChevronDown,
  ArrowDownUp,
  Tags,
  Plus,
  TriangleAlert,
} from "lucide-react"
import { Button } from "@/components/ui/button"
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
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { CoverImage } from "@/components/common/CoverImage"
import { PlatformBadge, QualityBadge } from "@/components/common/MetaBadges"
import { bestQuality } from "@/lib/quality"
import { revealLocalFile } from "@/lib/localMusic"
import { useLocalMusicStore } from "@/stores/localMusicStore"
import { usePlayerStore } from "@/stores/playerStore"
import { useSettingsStore, type LocalSort } from "@/stores/settingsStore"
import { useUiStore } from "@/stores/uiStore"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
const SORTS: LocalSort[] = ["added", "name"]
/** all = everything; none = uncategorized; else category id */
type CategoryFilter = "all" | "none" | string

type CatDialog =
  | { mode: "create" }
  | { mode: "rename"; id: string; name: string }
  | null

export function LocalMusic() {
  const tr = useT()
  const tracks = useLocalMusicStore((s) => s.tracks)
  const categories = useLocalMusicStore((s) => s.categories)
  const importing = useLocalMusicStore((s) => s.importing)
  const importFiles = useLocalMusicStore((s) => s.importFiles)
  const importFolder = useLocalMusicStore((s) => s.importFolder)
  const remove = useLocalMusicStore((s) => s.remove)
  const removeMany = useLocalMusicStore((s) => s.removeMany)
  const addCategory = useLocalMusicStore((s) => s.addCategory)
  const renameCategory = useLocalMusicStore((s) => s.renameCategory)
  const removeCategory = useLocalMusicStore((s) => s.removeCategory)
  const setTracksCategory = useLocalMusicStore((s) => s.setTracksCategory)
  const play = usePlayerStore((s) => s.play)
  const playAll = usePlayerStore((s) => s.playAll)
  const localSort = useSettingsStore((s) => s.localSort)
  const setLocalSort = useSettingsStore((s) => s.setLocalSort)
  const notify = useUiStore((s) => s.notify)

  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all")
  const [catDialog, setCatDialog] = useState<CatDialog>(null)
  const [catName, setCatName] = useState("")
  const [assignAfterCreate, setAssignAfterCreate] = useState(false)
  const catInputRef = useRef<HTMLInputElement>(null)

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of categories) map.set(c.id, c.name)
    return map
  }, [categories])

  const displayed = useMemo(() => {
    let list = tracks
    if (categoryFilter === "none") {
      list = list.filter((t) => !t.categoryId)
    } else if (categoryFilter !== "all") {
      list = list.filter((t) => t.categoryId === categoryFilter)
    }
    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (track) =>
          track.song.name.toLowerCase().includes(q) ||
          track.song.singer.toLowerCase().includes(q) ||
          track.song.albumName.toLowerCase().includes(q)
      )
    }
    if (localSort === "name") {
      list = [...list].sort((a, b) => a.song.name.localeCompare(b.song.name, "zh"))
    } else {
      list = [...list].sort((a, b) => b.addedAt - a.addedAt)
    }
    return list
  }, [tracks, query, categoryFilter, localSort])

  const currentKeys = displayed.map((track) => track.id)
  const allSelected = currentKeys.length > 0 && currentKeys.every((k) => selected.has(k))

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
  const batchDelete = async () => {
    await removeMany([...selected])
    exitEdit()
  }
  const batchMove = (categoryId: string | null) => {
    setTracksCategory([...selected], categoryId)
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
      const cat = addCategory(name)
      if (!cat) {
        notify({ message: tr("local.categoryExists"), variant: "error" })
        return
      }
      if (assignAfterCreate && selected.size > 0) {
        setTracksCategory([...selected], cat.id)
        exitEdit()
      } else {
        setCategoryFilter(cat.id)
      }
    } else {
      renameCategory(catDialog.id, name)
    }
    setCatDialog(null)
    setAssignAfterCreate(false)
  }
  const deleteCategory = (id: string) => {
    removeCategory(id)
    if (categoryFilter === id) setCategoryFilter("all")
  }

  const onImportFiles = async () => {
    if (!isTauri) {
      notify({ message: tr("local.desktopOnly"), variant: "error" })
      return
    }
    try {
      const n = await importFiles()
      if (n > 0) notify({ message: tr("local.imported", { n }), variant: "success" })
    } catch (e) {
      notify({ message: tr("local.importFailed", { msg: String(e) }), variant: "error" })
    }
  }

  const onImportFolder = async () => {
    if (!isTauri) {
      notify({ message: tr("local.desktopOnly"), variant: "error" })
      return
    }
    try {
      const n = await importFolder()
      if (n > 0) notify({ message: tr("local.imported", { n }), variant: "success" })
    } catch (e) {
      notify({ message: tr("local.importFailed", { msg: String(e) }), variant: "error" })
    }
  }

  const openInFolder = async (filePath: string) => {
    try {
      await revealLocalFile(filePath)
    } catch (e) {
      notify({ message: tr("local.revealFailed", { msg: String(e) }), variant: "error" })
    }
  }

  const categoryFilterLabel =
    categoryFilter === "all"
      ? tr("local.categoryAll")
      : categoryFilter === "none"
        ? tr("local.categoryNone")
        : (categoryNameById.get(categoryFilter) ?? tr("local.categoryAll"))

  const activeCategory =
    categoryFilter !== "all" && categoryFilter !== "none"
      ? categories.find((c) => c.id === categoryFilter)
      : undefined

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border flex items-center gap-3">
        <HardDrive size={20} className="shrink-0" />
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-tight">{tr("local.title")}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {tracks.length === 0
              ? tr("local.summaryEmpty")
              : tr("local.summary", { n: tracks.length })}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {tracks.length > 0 && !editing && (
            <Button
              variant="secondary"
              size="sm"
              className="h-8"
              onClick={() => playAll(displayed.map((x) => x.song))}
            >
              <Play size={14} className="mr-1.5" fill="currentColor" strokeWidth={0} />
              {tr("common.playAll")}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5" disabled={importing}>
                {importing ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <FilePlus2 size={14} />
                )}
                {tr("local.import")}
                <ChevronDown size={14} className="opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={importing} onClick={() => void onImportFiles()}>
                <FilePlus2 size={14} className="mr-2" />
                {tr("local.importFiles")}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={importing} onClick={() => void onImportFolder()}>
                <FolderPlus size={14} className="mr-2" />
                {tr("local.importFolder")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {tracks.length > 0 && (
          <div className="flex h-12 min-h-12 max-h-12 shrink-0 items-center gap-2 overflow-hidden border-b border-border px-4">
            {!editing ? (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 shrink-0 gap-1.5">
                      <ArrowDownUp size={14} />
                      <span className="hidden sm:inline">{tr(`favorites.sort.${localSort}`)}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {SORTS.map((s) => (
                      <DropdownMenuItem key={s} onClick={() => setLocalSort(s)}>
                        <Check
                          size={14}
                          className={cn("mr-2", localSort === s ? "opacity-100" : "opacity-0")}
                        />
                        {tr(`favorites.sort.${s}`)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

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
                      {tr("local.categoryAll")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setCategoryFilter("none")}>
                      <Check
                        size={14}
                        className={cn("mr-2", categoryFilter === "none" ? "opacity-100" : "opacity-0")}
                      />
                      {tr("local.categoryNone")}
                    </DropdownMenuItem>
                    {categories.length > 0 && <DropdownMenuSeparator />}
                    {categories.map((cat) => (
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
                      {tr("local.categoryAdd")}
                    </DropdownMenuItem>
                    {activeCategory && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => openRenameCategory(activeCategory.id, activeCategory.name)}
                        >
                          <Pencil size={14} className="mr-2" />
                          {tr("local.categoryRename")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => deleteCategory(activeCategory.id)}
                        >
                          <Trash2 size={14} className="mr-2" />
                          {tr("local.categoryDelete")}
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                <div className="relative min-w-0 flex-1">
                  <Search
                    size={15}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    className="h-8 py-0 pl-9"
                    placeholder={tr("local.searchPlaceholder")}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <Button variant="ghost" size="sm" className="h-8 shrink-0" onClick={() => setEditing(true)}>
                  <Pencil size={14} className="mr-1.5" />
                  {tr("local.batchEdit")}
                </Button>
              </>
            ) : (
              <>
                <span className="truncate text-sm leading-8 text-muted-foreground">
                  {tr("local.selectedCount", { count: selected.size })}
                </span>
                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                  <Button variant="ghost" size="sm" className="h-8" onClick={toggleAll}>
                    <CheckCheck size={14} className="mr-1.5" />
                    {allSelected ? tr("local.deselectAll") : tr("local.selectAll")}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8" disabled={selected.size === 0}>
                        <Tags size={14} className="mr-1.5" />
                        {tr("local.batchMove")}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
                      <DropdownMenuItem onClick={() => batchMove(null)}>
                        {tr("local.categoryNone")}
                      </DropdownMenuItem>
                      {categories.length > 0 && <DropdownMenuSeparator />}
                      {categories.map((cat) => (
                        <DropdownMenuItem key={cat.id} onClick={() => batchMove(cat.id)}>
                          {cat.name}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => openCreateCategory(true)}>
                        <Plus size={14} className="mr-2" />
                        {tr("local.categoryAdd")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-destructive hover:text-destructive"
                    disabled={selected.size === 0}
                    onClick={() => void batchDelete()}
                  >
                    <Trash2 size={14} className="mr-1.5" />
                    {tr("local.batchDelete")}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8" onClick={exitEdit}>
                    {tr("common.cancel")}
                  </Button>
                </div>
              </>
            )}
          </div>
      )}

      {tracks.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
          <div className="h-16 w-16 rounded-2xl bg-muted/60 flex items-center justify-center mb-4">
            <HardDrive size={28} className="text-muted-foreground" />
          </div>
          <p className="text-base font-medium">{tr("local.empty")}</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">{tr("local.emptyHint")}</p>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="px-3 py-2">
            {displayed.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-12">{tr("local.noMatch")}</p>
            ) : (
              displayed.map((track) => {
                const sel = selected.has(track.id)
                const best = bestQuality(track.song)
                const catName = track.categoryId
                  ? categoryNameById.get(track.categoryId)
                  : undefined
                const missing = !!track.unavailable
                return (
                  <div
                    key={track.id}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-xl group cursor-pointer transition-[background-color] duration-200 hover:bg-accent/55",
                      editing && sel && "bg-primary/10",
                      missing && "opacity-80"
                    )}
                    onClick={() => {
                      if (editing) toggleOne(track.id)
                      else void play(track.song)
                    }}
                    onDoubleClick={() => {
                      if (!editing) void play(track.song)
                    }}
                  >
                    {editing && (
                      <span
                        className={cn(
                          "h-5 w-5 rounded-full border flex items-center justify-center shrink-0 transition-colors",
                          sel
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-muted-foreground/40"
                        )}
                      >
                        {sel && <Check size={13} />}
                      </span>
                    )}

                    <div className="relative h-10 w-10 shrink-0 rounded-xl overflow-hidden bg-muted shadow-[var(--shadow-border)]">
                      {track.song.meta.picUrl ? (
                        <CoverImage src={track.song.meta.picUrl} />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                          <Music size={16} />
                        </div>
                      )}
                      {missing && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/50">
                          <TriangleAlert size={16} className="text-amber-300" />
                        </span>
                      )}
                      {!editing && !missing && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            void play(track.song)
                          }}
                          className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                        >
                          <Play
                            size={16}
                            className="ml-0.5 text-white icon-play-pop"
                            fill="currentColor"
                            strokeWidth={0}
                          />
                        </button>
                      )}
                    </div>

                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <p
                          className={cn(
                            "text-sm truncate font-medium",
                            missing && "text-muted-foreground"
                          )}
                        >
                          {track.song.name}
                        </p>
                        <PlatformBadge source="local" />
                      </div>
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-xs text-muted-foreground truncate min-w-0">
                          {track.song.singer}
                        </p>
                        {!missing && best && <QualityBadge quality={best} />}
                      </div>
                    </div>

                    {missing && (
                      <span
                        className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 h-4 text-[10px] font-medium leading-none border border-amber-500/40 text-amber-700 dark:text-amber-400"
                        title={tr("local.fileMissing")}
                      >
                        <TriangleAlert size={11} />
                        {tr("local.fileMissingBadge")}
                      </span>
                    )}

                    {catName && (
                      <span className="inline-flex max-w-24 shrink-0 items-center truncate rounded px-1.5 h-4 text-[10px] font-medium leading-none bg-muted/80 text-muted-foreground">
                        {catName}
                      </span>
                    )}

                    <span className="text-xs text-muted-foreground w-12 text-right shrink-0 tabular-nums">
                      {track.song.interval}
                    </span>

                    {!editing && (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 opacity-0 group-hover:opacity-100"
                              onClick={(e) => e.stopPropagation()}
                              title={tr("local.batchMove")}
                            >
                              <Tags size={14} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="max-h-72 overflow-y-auto"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <DropdownMenuItem
                              onClick={() => setTracksCategory([track.id], null)}
                            >
                              <Check
                                size={14}
                                className={cn(
                                  "mr-2",
                                  !track.categoryId ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {tr("local.categoryNone")}
                            </DropdownMenuItem>
                            {categories.length > 0 && <DropdownMenuSeparator />}
                            {categories.map((cat) => (
                              <DropdownMenuItem
                                key={cat.id}
                                onClick={() => setTracksCategory([track.id], cat.id)}
                              >
                                <Check
                                  size={14}
                                  className={cn(
                                    "mr-2",
                                    track.categoryId === cat.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                {cat.name}
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => {
                                setSelected(new Set([track.id]))
                                openCreateCategory(true)
                              }}
                            >
                              <Plus size={14} className="mr-2" />
                              {tr("local.categoryAdd")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        {isTauri && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-0 group-hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation()
                              void openInFolder(track.filePath)
                            }}
                            title={tr("local.reveal")}
                          >
                            <FolderOpen size={14} />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation()
                            void remove(track.id)
                          }}
                          title={tr("local.remove")}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
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
          initialFocus={catInputRef}
        >
          <DialogHeader>
            <DialogTitle>
              {catDialog?.mode === "rename" ? tr("local.categoryRename") : tr("local.categoryAdd")}
            </DialogTitle>
          </DialogHeader>
          <Input
            ref={catInputRef}
            value={catName}
            onChange={(e) => setCatName(e.target.value)}
            placeholder={tr("local.categoryNamePlaceholder")}
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
              {tr("common.cancel")}
            </Button>
            <Button disabled={!catName.trim()} onClick={submitCategory}>
              {tr("common.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
