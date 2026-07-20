import { useMemo, useState } from "react"
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
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { useUiStore } from "@/stores/uiStore"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

export function LocalMusic() {
  const tr = useT()
  const tracks = useLocalMusicStore((s) => s.tracks)
  const importing = useLocalMusicStore((s) => s.importing)
  const importFiles = useLocalMusicStore((s) => s.importFiles)
  const importFolder = useLocalMusicStore((s) => s.importFolder)
  const remove = useLocalMusicStore((s) => s.remove)
  const removeMany = useLocalMusicStore((s) => s.removeMany)
  const play = usePlayerStore((s) => s.play)
  const playAll = usePlayerStore((s) => s.playAll)
  const notify = useUiStore((s) => s.notify)

  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState("")

  const displayed = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return tracks
    return tracks.filter(
      (track) =>
        track.song.name.toLowerCase().includes(q) ||
        track.song.singer.toLowerCase().includes(q) ||
        track.song.albumName.toLowerCase().includes(q)
    )
  }, [tracks, query])

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
                return (
                  <div
                    key={track.id}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-xl group cursor-pointer transition-[background-color] duration-200 hover:bg-accent/55",
                      editing && sel && "bg-primary/10"
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
                          sel ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40"
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
                      {!editing && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            void play(track.song)
                          }}
                          className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                        >
                          <Play size={16} className="ml-0.5 text-white icon-play-pop" fill="currentColor" strokeWidth={0} />
                        </button>
                      )}
                    </div>

                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-sm truncate font-medium">{track.song.name}</p>
                        <PlatformBadge source="local" />
                      </div>
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-xs text-muted-foreground truncate min-w-0">{track.song.singer}</p>
                        {best && <QualityBadge quality={best} />}
                      </div>
                    </div>

                    <span className="text-xs text-muted-foreground w-12 text-right shrink-0 tabular-nums">
                      {track.song.interval}
                    </span>

                    {!editing && (
                      <div className="flex items-center gap-0.5 shrink-0">
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
    </div>
  )
}
