import { Trash2, X, Download, Music, FolderOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
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
  const { tasks, removeTask, clearCompleted } = useDownloadStore()
  const downloadDir = useSettingsStore((s) => s.downloadDir)
  const t = useT()

  const hasCompleted = tasks.some((task) => task.status === "completed")

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Download size={20} />
          <h2 className="text-lg font-semibold">{t("downloads.title")}</h2>
        </div>
        <div className="flex items-center gap-2">
          {isTauri && (
            <Button variant="ghost" size="sm" onClick={() => openDownloadFolder(downloadDir)}>
              <FolderOpen size={15} className="mr-1.5" />
              {t("download.openFolder")}
            </Button>
          )}
          {hasCompleted && (
            <Button variant="outline" size="sm" onClick={clearCompleted}>
              {t("downloads.clearCompleted")}
            </Button>
          )}
        </div>
      </div>

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
            {tasks.map((task) => (
              <div key={task.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent/50 group">
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
                  {task.status === "completed" || task.status === "error" ? <Trash2 size={13} /> : <X size={13} />}
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
