import { useMemo, useState } from "react"
import { Trash2, X, Download, Music, FolderOpen, Search, Pencil, Check, CheckCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { useDownloadStore } from "@/stores/downloadStore"
import { useSettingsStore } from "@/stores/settingsStore"
import { useUiStore } from "@/stores/uiStore"
import { useT, t } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

// Open the download folder in the OS file manager. Uses the opener plugin —
// shell.open() validates against a URL pattern in Tauri v2 and rejects plain
// file paths, so it silently failed for folders.
async function openDownloadFolder(downloadDir: string | null) {
  if (!isTauri) return
  try {
    const { openPath } = await import("@tauri-apps/plugin-opener")
    if (downloadDir) {
      await openPath(downloadDir)
    } else {
      // Default app-data downloads folder — ensure it exists, then open it.
      const { appDataDir, join } = await import("@tauri-apps/api/path")
      const { mkdir, BaseDirectory } = await import("@tauri-apps/plugin-fs")
      await mkdir("museek/downloads", { baseDir: BaseDirectory.AppData, recursive: true })
      await openPath(await join(await appDataDir(), "museek", "downloads"))
    }
  } catch (e) {
    console.error("Failed to open download folder:", e)
    useUiStore.getState().notify({ message: t("download.openFolderFailed", { msg: String(e) }), variant: "error" })
  }
}

export function Downloads() {
  const { tasks, removeTask, removeTasks, clearCompleted } = useDownloadStore()
  const downloadDir = useSettingsStore((s) => s.downloadDir)
  const t = useT()

  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState("")

  const displayed = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return tasks
    return tasks.filter(
      (task) =>
        task.song.name.toLowerCase().includes(q) || task.song.singer.toLowerCase().includes(q)
    )
  }, [tasks, query])

  const summary = useMemo(() => {
    if (tasks.length === 0) return t("downloads.summaryEmpty")
    let waiting = 0
    let downloading = 0
    let completed = 0
    let error = 0
    for (const task of tasks) {
      if (task.status === "waiting") waiting++
      else if (task.status === "downloading") downloading++
      else if (task.status === "completed") completed++
      else if (task.status === "error") error++
    }
    const parts: string[] = []
    if (downloading) parts.push(t("downloads.summary.downloading", { n: downloading }))
    if (waiting) parts.push(t("downloads.summary.waiting", { n: waiting }))
    if (completed) parts.push(t("downloads.summary.completed", { n: completed }))
    if (error) parts.push(t("downloads.summary.error", { n: error }))
    return parts.join(" · ")
  }, [tasks, t])

  const hasCompleted = tasks.some((task) => task.status === "completed")
  const currentKeys = displayed.map((task) => task.id)
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
  const batchDelete = () => {
    removeTasks([...selected])
    exitEdit()
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border flex items-center gap-3">
        <Download size={20} className="shrink-0" />
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-tight">{t("downloads.title")}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{summary}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {isTauri && (
            <Button variant="ghost" size="sm" className="h-8" onClick={() => openDownloadFolder(downloadDir)}>
              <FolderOpen size={15} className="mr-1.5" />
              {t("download.openFolder")}
            </Button>
          )}
          {hasCompleted && !editing && (
            <Button variant="outline" size="sm" className="h-8" onClick={clearCompleted}>
              {t("downloads.clearCompleted")}
            </Button>
          )}
        </div>
      </div>

      {/* Match Favorites toolbar: fixed h-12 both modes */}
      {tasks.length > 0 && (
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
                  placeholder={t("downloads.searchPlaceholder")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <Button variant="ghost" size="sm" className="h-8 shrink-0" onClick={() => setEditing(true)}>
                <Pencil size={14} className="mr-1.5" />
                {t("downloads.batchEdit")}
              </Button>
            </>
          ) : (
            <>
              <span className="truncate text-sm leading-8 text-muted-foreground">
                {t("downloads.selectedCount", { count: selected.size })}
              </span>
              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                <Button variant="ghost" size="sm" className="h-8" onClick={toggleAll}>
                  <CheckCheck size={14} className="mr-1.5" />
                  {allSelected ? t("downloads.deselectAll") : t("downloads.selectAll")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-destructive hover:text-destructive"
                  disabled={selected.size === 0}
                  onClick={batchDelete}
                >
                  <Trash2 size={14} className="mr-1.5" />
                  {t("downloads.batchDelete")}
                </Button>
                <Button variant="ghost" size="sm" className="h-8" onClick={exitEdit}>
                  {t("common.cancel")}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {tasks.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
          <div className="h-16 w-16 rounded-2xl bg-muted/60 flex items-center justify-center mb-4">
            <Download size={28} className="text-muted-foreground" />
          </div>
          <p className="text-base font-medium">{t("downloads.empty")}</p>
          <p className="text-sm text-muted-foreground mt-1">{t("downloads.emptyHint")}</p>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="px-3 py-2 space-y-0.5">
            {displayed.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-12">{t("downloads.noMatch")}</p>
            ) : (
              displayed.map((task) => {
                const sel = selected.has(task.id)
                return (
                  <div
                    key={task.id}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent/50 group",
                      editing && "cursor-pointer",
                      editing && sel && "bg-primary/10"
                    )}
                    onClick={editing ? () => toggleOne(task.id) : undefined}
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

                    <div className="relative h-11 w-11 shrink-0 rounded-md overflow-hidden bg-muted">
                      {task.song.meta.picUrl ? (
                        <img src={task.song.meta.picUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                          <Music size={18} />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{task.song.name}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                          {task.quality}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{task.song.singer}</p>
                      {task.status === "downloading" && <Progress value={task.progress} className="h-1 mt-1.5" />}
                      {task.error && <p className="text-xs text-destructive truncate mt-0.5">{task.error}</p>}
                    </div>

                    <span
                      className={cn(
                        "text-xs shrink-0 tabular-nums",
                        task.status === "completed" && "text-green-600",
                        task.status === "error" && "text-destructive",
                        task.status === "downloading" && "text-primary",
                        task.status === "waiting" && "text-muted-foreground"
                      )}
                    >
                      {task.status === "downloading"
                        ? `${task.progress}%`
                        : t(`downloads.status.${task.status}`)}
                    </span>

                    {!editing && (
                      <>
                        {task.status === "completed" && isTauri && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                            onClick={() => openDownloadFolder(downloadDir)}
                            title={t("download.openFolder")}
                          >
                            <FolderOpen size={14} />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeTask(task.id)}
                        >
                          {task.status === "completed" || task.status === "error" ? (
                            <Trash2 size={13} />
                          ) : (
                            <X size={13} />
                          )}
                        </Button>
                      </>
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
