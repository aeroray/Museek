import { useMemo, useState } from "react";
import {
  Trash2,
  X,
  Download,
  Music,
  FolderOpen,
  Search,
  Pencil,
  Check,
  CheckCheck,
  Eraser,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CoverImage } from "@/components/common/CoverImage";
import { PlatformBadge, QualityBadge } from "@/components/common/MetaBadges";
import { useDownloadStore } from "@/stores/downloadStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUiStore } from "@/stores/uiStore";
import { useT, t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// Open the download folder in the OS file manager. Uses the opener plugin —
// shell.open() validates against a URL pattern in Tauri v2 and rejects plain
// file paths, so it silently failed for folders.
async function openDownloadFolder(downloadDir: string | null) {
  if (!isTauri || !downloadDir) return;
  try {
    const { openPath } = await import("@tauri-apps/plugin-opener");
    await openPath(downloadDir);
  } catch (e) {
    console.error("Failed to open download folder:", e);
    useUiStore
      .getState()
      .notify({
        message: t("download.openFolderFailed", { msg: String(e) }),
        variant: "error",
      });
  }
}

export function Downloads() {
  const { tasks, removeTask, removeTasks, clearCompleted } = useDownloadStore();
  const downloadDir = useSettingsStore((s) => s.downloadDir);
  const t = useT();

  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  const displayed = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter(
      (task) =>
        task.song.name.toLowerCase().includes(q) ||
        task.song.singer.toLowerCase().includes(q),
    );
  }, [tasks, query]);

  const summary = useMemo(() => {
    if (tasks.length === 0) return t("downloads.summaryEmpty");
    let waiting = 0;
    let downloading = 0;
    let completed = 0;
    let error = 0;
    for (const task of tasks) {
      if (task.status === "waiting") waiting++;
      else if (task.status === "downloading") downloading++;
      else if (task.status === "completed") completed++;
      else if (task.status === "error") error++;
    }
    const parts: string[] = [];
    if (downloading)
      parts.push(t("downloads.summary.downloading", { n: downloading }));
    if (waiting) parts.push(t("downloads.summary.waiting", { n: waiting }));
    if (completed)
      parts.push(t("downloads.summary.completed", { n: completed }));
    if (error) parts.push(t("downloads.summary.error", { n: error }));
    return parts.join(" · ");
  }, [tasks, t]);

  const hasCompleted = tasks.some((task) => task.status === "completed");
  const currentKeys = displayed.map((task) => task.id);
  const allSelected =
    currentKeys.length > 0 && currentKeys.every((k) => selected.has(k));

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
  const batchDelete = () => {
    removeTasks([...selected]);
    exitEdit();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border flex items-center gap-3">
        <Download size={20} className="shrink-0" />
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-tight">
            {t("downloads.title")}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">{summary}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {isTauri && (
            <span
              className="inline-flex"
              title={downloadDir ? undefined : t("download.notSet")}
            >
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                disabled={!downloadDir}
                onClick={() => void openDownloadFolder(downloadDir)}
              >
                <FolderOpen size={14} className="mr-1.5" />
                {t("download.openFolder")}
              </Button>
            </span>
          )}
        </div>
      </div>

      {/* Match Favorites / Local toolbar: fixed h-12 both modes */}
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
              {hasCompleted && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0"
                  onClick={clearCompleted}
                >
                  <Eraser size={14} className="mr-1.5" />
                  {t("downloads.clearCompleted")}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 shrink-0"
                onClick={() => setEditing(true)}
              >
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
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8"
                  onClick={toggleAll}
                >
                  <CheckCheck size={14} className="mr-1.5" />
                  {allSelected
                    ? t("downloads.deselectAll")
                    : t("downloads.selectAll")}
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

      {tasks.length === 0 ? (
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl p-4">
            <div className="flex min-h-[18rem] flex-col items-center justify-center px-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/70 text-muted-foreground">
                <Download size={28} strokeWidth={1.6} />
              </div>
              <p className="mt-4 text-sm font-medium">{t("downloads.empty")}</p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground text-pretty">
                {t("downloads.emptyHint")}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="px-3 py-2">
            {displayed.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-12">
                {t("downloads.noMatch")}
              </p>
            ) : (
              displayed.map((task) => {
                const sel = selected.has(task.id);
                return (
                  <div
                    key={task.id}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-xl group transition-[background-color] duration-200 hover:bg-accent/55",
                      editing && "cursor-pointer",
                      editing && sel && "bg-primary/10",
                    )}
                    onClick={editing ? () => toggleOne(task.id) : undefined}
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

                    <div className="relative h-10 w-10 shrink-0 rounded-xl overflow-hidden bg-muted">
                      {task.song.meta.picUrl ? (
                        <CoverImage src={task.song.meta.picUrl} />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                          <Music size={16} />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-sm truncate font-medium">
                          {task.song.name}
                        </p>
                        <PlatformBadge source={task.song.source} />
                      </div>
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-xs text-muted-foreground truncate min-w-0">
                          {task.song.singer}
                        </p>
                        <QualityBadge quality={task.quality} />
                      </div>
                      {task.status === "downloading" && (
                        <Progress
                          value={task.progress}
                          className="h-1 mt-0.5"
                        />
                      )}
                      {task.error && (
                        <p className="text-xs text-destructive truncate">
                          {task.error}
                        </p>
                      )}
                    </div>

                    <span
                      className={cn(
                        "text-xs shrink-0 tabular-nums",
                        task.status === "completed" && "text-green-600",
                        task.status === "error" && "text-destructive",
                        task.status === "downloading" && "text-primary",
                        task.status === "waiting" && "text-muted-foreground",
                      )}
                    >
                      {task.status === "downloading"
                        ? task.progress >= 86
                          ? t("download.writingTags")
                          : `${task.progress}%`
                        : t(`downloads.status.${task.status}`)}
                    </span>

                    <span className="text-xs text-muted-foreground w-12 text-right shrink-0 tabular-nums">
                      {task.song.interval}
                    </span>

                    {!editing && (
                      <div className="flex items-center gap-0.5 shrink-0">
                        {task.status === "completed" && isTauri && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-0 group-hover:opacity-100"
                            disabled={!downloadDir}
                            onClick={(e) => {
                              e.stopPropagation();
                              void openDownloadFolder(downloadDir);
                            }}
                            title={
                              downloadDir
                                ? t("download.openFolder")
                                : t("download.notSet")
                            }
                          >
                            <FolderOpen size={14} />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeTask(task.id);
                          }}
                          title={
                            task.status === "completed" ||
                            task.status === "error"
                              ? t("downloads.batchDelete")
                              : t("common.cancel")
                          }
                        >
                          {task.status === "completed" ||
                          task.status === "error" ? (
                            <Trash2 size={14} />
                          ) : (
                            <X size={14} />
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
