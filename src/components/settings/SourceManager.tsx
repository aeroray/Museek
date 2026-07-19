import { useEffect, useMemo, useRef, useState, type DragEvent } from "react"
import {
  Upload,
  Trash2,
  AlertCircle,
  Loader2,
  ClipboardPaste,
  GripVertical,
  X,
  QrCode,
  FileCode2,
  Link2,
  FolderOpen,
} from "lucide-react"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  defaultDropAnimationSideEffects,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DropAnimation,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { useSourceStore } from "@/stores/sourceStore"
import { useUiStore } from "@/stores/uiStore"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { SourceScript } from "@/types/source"

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

type ImportMode = "url" | "file"
type ScriptOrigin = "url" | "file" | "unknown"

function isHttpUrl(line: string): boolean {
  try {
    const u = new URL(line)
    return u.protocol === "http:" || u.protocol === "https:"
  } catch {
    return false
  }
}

function looksLikeScript(raw: string): boolean {
  return Boolean(raw.trim()) && !/^\s*</.test(raw)
}

function scriptOrigin(script: SourceScript): ScriptOrigin {
  if (!script.url) return "unknown"
  if (script.url.startsWith("local:")) return "file"
  return "url"
}

function notifyImportResult(
  added: number,
  updated: number,
  fail: number,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  const parts: string[] = []
  if (added) parts.push(t("sources.importAdded", { n: added }))
  if (updated) parts.push(t("sources.importDup", { n: updated }))
  if (fail) parts.push(t("sources.importFailed", { n: fail }))
  if (!parts.length) return
  useUiStore.getState().notify({
    message: parts.join(t("sources.importJoin")),
    variant: fail && !added && !updated ? "error" : fail ? "info" : "success",
  })
}

async function pickLocalScripts(): Promise<{ label: string; content: string }[]> {
  if (isTauri) {
    const { open } = await import("@tauri-apps/plugin-dialog")
    const selected = await open({
      multiple: true,
      filters: [{ name: "JavaScript", extensions: ["js"] }],
    })
    if (!selected) return []
    const paths = Array.isArray(selected) ? selected : [selected]
    const { readTextFile } = await import("@tauri-apps/plugin-fs")
    const out: { label: string; content: string }[] = []
    for (const path of paths) {
      out.push({ label: path, content: await readTextFile(path) })
    }
    return out
  }

  return new Promise((resolve) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".js,text/javascript"
    input.multiple = true
    input.onchange = async () => {
      const list = input.files
      if (!list?.length) return resolve([])
      const out: { label: string; content: string }[] = []
      for (const file of Array.from(list)) {
        out.push({ label: file.name, content: await file.text() })
      }
      resolve(out)
    }
    input.click()
  })
}

async function readDroppedFiles(fileList: FileList | File[]): Promise<{ label: string; content: string }[]> {
  const files = Array.from(fileList).filter(
    (f) => f.name.toLowerCase().endsWith(".js") || /javascript|ecmascript/.test(f.type),
  )
  const out: { label: string; content: string }[] = []
  for (const file of files) {
    out.push({ label: file.name, content: await file.text() })
  }
  return out
}

/** Tauri OS file-drop gives filesystem paths, not browser File objects. */
async function readScriptsFromPaths(paths: string[]): Promise<{ label: string; content: string }[]> {
  const jsPaths = paths.filter((p) => p.toLowerCase().endsWith(".js"))
  if (!jsPaths.length) return []
  if (isTauri) {
    const { readTextFile } = await import("@tauri-apps/plugin-fs")
    const out: { label: string; content: string }[] = []
    for (const path of jsPaths) {
      out.push({ label: path, content: await readTextFile(path) })
    }
    return out
  }
  return []
}

function pointInRect(x: number, y: number, el: HTMLElement | null): boolean {
  if (!el) return false
  const r = el.getBoundingClientRect()
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
}

/** Short badge label from script meta (authors often stuff changelogs into `version`). */
function versionBadgeLabel(raw: string): string {
  const s = raw.trim()
  if (!s) return "v0.0.0"
  const m = s.match(/^v*\d+(?:\.\d+){0,3}/i)
  const core = (m?.[0] ?? s).replace(/^v+/i, "v")
  const labeled = /^v/i.test(core) ? core : `v${core}`
  return labeled.length > 12 ? `${labeled.slice(0, 11)}…` : labeled
}

function GzhGuide() {
  const t = useT()
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <img
        src="/gzh/qrcode.webp"
        alt={t("sources.gzhTitle")}
        className="h-44 w-44 rounded-xl bg-white object-contain outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
      />
      <div className="space-y-1.5">
        <p className="text-sm font-semibold">{t("sources.gzhTitle")}</p>
        <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">{t("sources.gzhHint")}</p>
      </div>
    </div>
  )
}

const dropAnimation: DropAnimation = {
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: "0.45" } },
  }),
}

function OriginBadge({ origin }: { origin: ScriptOrigin }) {
  const t = useT()
  if (origin === "file") {
    return (
      <Badge variant="secondary" className="gap-1 px-1.5 py-0 text-[10px] font-medium">
        <FileCode2 size={10} />
        {t("sources.originFile")}
      </Badge>
    )
  }
  if (origin === "url") {
    return (
      <Badge variant="outline" className="gap-1 px-1.5 py-0 text-[10px] font-medium">
        <Link2 size={10} />
        {t("sources.originUrl")}
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-medium text-muted-foreground">
      —
    </Badge>
  )
}

function SortableSourceRow({
  script,
  isLoading,
  onToggle,
  onRemove,
}: {
  script: SourceScript
  isLoading: boolean
  onToggle: () => void
  onRemove: () => void
}) {
  const t = useT()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: script.id,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  const platforms = script.sources ? Object.keys(script.sources).join("、") : ""

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={cn(
        "group",
        isDragging && "relative z-10 bg-muted/80 opacity-80 shadow-sm",
      )}
      data-state={isDragging ? "selected" : undefined}
    >
      <TableCell className="w-8 px-1.5 py-1.5">
        <button
          type="button"
          className="flex size-7 cursor-grab items-center justify-center rounded-md text-muted-foreground touch-none hover:bg-muted hover:text-foreground active:cursor-grabbing"
          title={t("sources.dragHint")}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={14} />
        </button>
      </TableCell>
      <TableCell className="max-w-0 min-w-0 px-2 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate text-sm font-medium" title={script.name}>
            {script.name}
          </span>
          <Badge
            variant="outline"
            className="max-w-[5.5rem] shrink-0 truncate px-1 py-0 text-[10px] font-normal"
            title={script.version}
          >
            {versionBadgeLabel(script.version)}
          </Badge>
        </div>
        {script.author ? (
          <p
            className="mt-0.5 truncate text-[11px] text-muted-foreground"
            title={script.author}
          >
            {t("sources.author", { name: script.author })}
          </p>
        ) : null}
      </TableCell>
      <TableCell className="w-[4.5rem] px-2 py-1.5">
        <OriginBadge origin={scriptOrigin(script)} />
      </TableCell>
      <TableCell className="w-[9rem] max-w-[9rem] px-2 py-1.5">
        <span className="block truncate text-xs text-muted-foreground" title={platforms || undefined}>
          {platforms || "—"}
        </span>
      </TableCell>
      <TableCell className="w-14 px-2 py-1.5">
        <Switch checked={script.enabled} disabled={isLoading} onCheckedChange={onToggle} />
      </TableCell>
      <TableCell className="w-10 px-1.5 py-1.5">
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground opacity-70 hover:text-destructive group-hover:opacity-100"
          onClick={onRemove}
        >
          <Trash2 size={13} />
        </Button>
      </TableCell>
    </TableRow>
  )
}

function SourceDragPreview({ script }: { script: SourceScript }) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 shadow-md">
      <GripVertical size={14} className="text-muted-foreground" />
      <span className="text-sm font-medium">{script.name}</span>
      <OriginBadge origin={scriptOrigin(script)} />
    </div>
  )
}

export function SourceManager() {
  const {
    scripts,
    isLoading,
    error,
    importScript,
    importScriptFromUrl,
    removeScript,
    toggleEnabled,
    reorderScripts,
    clearError,
  } = useSourceStore()
  const t = useT()
  const enabledCount = scripts.filter((s) => s.enabled).length
  const [mode, setMode] = useState<ImportMode>("url")
  const [url, setUrl] = useState("")
  const [importingKind, setImportingKind] = useState<"url" | "file" | null>(null)
  const [getOpen, setGetOpen] = useState(false)
  const [fileDragOver, setFileDragOver] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)
  const modeRef = useRef(mode)
  const busyRef = useRef(false)
  const importLocalFilesRef = useRef<(files: { label: string; content: string }[]) => Promise<void>>(
    async () => {},
  )
  const busy = importingKind !== null
  modeRef.current = mode
  busyRef.current = busy
  const scriptIds = useMemo(() => scripts.map((s) => s.id), [scripts])
  const activeScript = activeId ? scripts.find((s) => s.id === activeId) : null

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  async function handleImportUrls() {
    const urls = url
      .split(/\r?\n/)
      .map((u) => u.trim())
      .filter(Boolean)
    if (!urls.length) return

    const invalid = urls.filter((u) => !isHttpUrl(u))
    if (invalid.length) {
      useUiStore.getState().notify({
        message:
          invalid.length === urls.length
            ? t("sources.invalidUrl")
            : t("sources.invalidUrlLines", {
                lines: invalid.map((l) => (l.length > 48 ? `${l.slice(0, 48)}…` : l)).join(" · "),
              }),
        variant: "error",
      })
      return
    }

    setImportingKind("url")
    let added = 0
    let updated = 0
    const failed: string[] = []
    try {
      for (const u of urls) {
        try {
          const result = await importScriptFromUrl(u)
          if (result === "added") added++
          else updated++
        } catch {
          failed.push(u)
        }
      }
    } finally {
      setImportingKind(null)
    }
    setUrl(failed.join("\n"))
    notifyImportResult(added, updated, failed.length, t)
  }

  async function importLocalFiles(files: { label: string; content: string }[]) {
    if (!files.length) return
    setImportingKind("file")
    try {
      let added = 0
      let updated = 0
      let fail = 0
      for (const file of files) {
        try {
          if (!looksLikeScript(file.content)) throw new Error(t("sources.err.notAScript"))
          const result = await importScript(file.content, `local:${file.label}`)
          if (result === "added") added++
          else updated++
        } catch {
          fail++
        }
      }
      notifyImportResult(added, updated, fail, t)
    } finally {
      setImportingKind(null)
    }
  }
  importLocalFilesRef.current = importLocalFiles

  // Tauri WebView intercepts OS file drops — HTML5 onDrop never fires. Use the
  // native drag-drop event and read scripts from filesystem paths instead.
  useEffect(() => {
    if (!isTauri) return
    let disposed = false
    let unlisten: (() => void) | undefined

    void (async () => {
      const { getCurrentWebview } = await import("@tauri-apps/api/webview")
      const { getCurrentWindow } = await import("@tauri-apps/api/window")
      const webview = getCurrentWebview()
      const win = getCurrentWindow()

      const toClientPoint = async (pos: { x: number; y: number }) => {
        const scale = await win.scaleFactor()
        return { x: pos.x / scale, y: pos.y / scale }
      }

      const u = await webview.onDragDropEvent(async (event) => {
        const payload = event.payload
        if (payload.type === "leave") {
          setFileDragOver(false)
          return
        }

        if (payload.type === "enter" || payload.type === "over") {
          if (modeRef.current !== "file") {
            setFileDragOver(false)
            return
          }
          const { x, y } = await toClientPoint(payload.position)
          setFileDragOver(pointInRect(x, y, dropZoneRef.current))
          return
        }

        if (payload.type !== "drop") return
        setFileDragOver(false)
        // While the file-import panel is open, accept drops anywhere in the window —
        // hit-testing the dashed zone is unreliable with Overlay title bars / DPI.
        if (modeRef.current !== "file" || busyRef.current) return

        try {
          const files = await readScriptsFromPaths(payload.paths)
          if (!files.length) {
            useUiStore.getState().notify({
              message: t("sources.dropNoJs"),
              variant: "error",
            })
            return
          }
          await importLocalFilesRef.current(files)
        } catch (err) {
          useUiStore.getState().notify({
            message: t("sources.importFileFailed", { msg: String(err) }),
            variant: "error",
          })
        }
      })

      if (disposed) {
        u()
        return
      }
      unlisten = u
    })()

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [t])

  async function handleImportFilePick() {
    let files: { label: string; content: string }[]
    try {
      files = await pickLocalScripts()
    } catch (e) {
      useUiStore.getState().notify({
        message: t("sources.importFileFailed", { msg: String(e) }),
        variant: "error",
      })
      return
    }
    await importLocalFiles(files)
  }

  async function handleFileDrop(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setFileDragOver(false)
    if (busy) return
    try {
      const files = await readDroppedFiles(e.dataTransfer.files)
      if (!files.length) {
        useUiStore.getState().notify({
          message: t("sources.dropNoJs"),
          variant: "error",
        })
        return
      }
      await importLocalFiles(files)
    } catch (err) {
      useUiStore.getState().notify({
        message: t("sources.importFileFailed", { msg: String(err) }),
        variant: "error",
      })
    }
  }

  async function handlePaste() {
    try {
      let text: string | null = null
      if (isTauri) {
        const { readText } = await import("@tauri-apps/plugin-clipboard-manager")
        text = await readText()
      } else {
        text = await navigator.clipboard.readText()
      }
      if (text?.trim()) {
        setUrl(text.trim())
        return
      }
    } catch {
      /* clipboard unavailable */
    }
    inputRef.current?.focus()
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)
    if (!over || active.id === over.id) return
    const oldIndex = scripts.findIndex((s) => s.id === active.id)
    const newIndex = scripts.findIndex((s) => s.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    reorderScripts(oldIndex, newIndex)
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex shrink-0 flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-medium">{t("sources.title")}</h3>
            {scripts.length > 0 && (
              <span className="tabular-nums text-xs text-muted-foreground">
                {t("sources.count", { total: scripts.length, enabled: enabledCount })}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{t("sources.hint")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-full bg-muted/70 p-1">
            {(["url", "file"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  mode === m
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(m === "url" ? "sources.modeUrl" : "sources.modeFile")}
              </button>
            ))}
          </div>
        </div>

        {mode === "url" ? (
          <div className="flex h-[calc(2.25rem*2+0.5rem)] items-stretch gap-2">
            <div className="relative min-h-0 flex-1">
              <textarea
                ref={inputRef}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={t("sources.urlPlaceholder")}
                disabled={busy}
                className="size-full resize-none break-all rounded-md border border-input bg-transparent px-3 py-2 pr-12 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
              <div className="absolute right-2 top-2 flex flex-col gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-7 text-muted-foreground"
                  onClick={handlePaste}
                  disabled={busy}
                  title={t("sources.paste")}
                >
                  <ClipboardPaste size={14} />
                </Button>
                {url.trim() ? (
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-7 text-muted-foreground"
                    onClick={() => setUrl("")}
                    disabled={busy}
                    title={t("sources.clear")}
                  >
                    <X size={14} />
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="flex w-36 shrink-0 flex-col gap-2">
              <Button variant="outline" onClick={() => setGetOpen(true)} className="h-9" disabled={busy}>
                <QrCode size={16} className="mr-2" />
                {t("sources.getSources")}
              </Button>
              <Button onClick={handleImportUrls} disabled={busy || !url.trim()} className="h-9">
                {importingKind === "url" ? (
                  <Loader2 size={16} className="mr-2 animate-spin" />
                ) : (
                  <Upload size={16} className="mr-2" />
                )}
                {t("sources.import")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex h-[calc(2.25rem*2+0.5rem)] items-stretch gap-2">
            <div
              ref={dropZoneRef}
              onDragEnter={(e) => {
                e.preventDefault()
                setFileDragOver(true)
              }}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = "copy"
                setFileDragOver(true)
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return
                setFileDragOver(false)
              }}
              onDrop={handleFileDrop}
              className={cn(
                "flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 rounded-md border border-dashed px-4 text-center transition-colors",
                fileDragOver
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 bg-muted/20 hover:border-muted-foreground/40",
                busy && "pointer-events-none opacity-60",
              )}
            >
              {importingKind === "file" ? (
                <Loader2 size={18} className="animate-spin text-muted-foreground" />
              ) : (
                <FileCode2 size={18} className="text-muted-foreground" />
              )}
              <p className="text-xs text-muted-foreground">{t("sources.dropHint")}</p>
            </div>
            <div className="flex w-36 shrink-0 flex-col gap-2">
              <Button variant="outline" onClick={() => setGetOpen(true)} className="h-9" disabled={busy}>
                <QrCode size={16} className="mr-2" />
                {t("sources.getSources")}
              </Button>
              <Button variant="outline" onClick={handleImportFilePick} disabled={busy} className="h-9">
                {importingKind === "file" ? (
                  <Loader2 size={16} className="mr-2 animate-spin" />
                ) : (
                  <FolderOpen size={16} className="mr-2" />
                )}
                {t("sources.browseFiles")}
              </Button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="flex shrink-0 items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span className="min-w-0 flex-1 break-words">{error}</span>
          <button
            type="button"
            onClick={clearError}
            title={t("window.close")}
            className="shrink-0 text-destructive/70 transition-colors hover:text-destructive"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {scripts.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-8">
          <GzhGuide />
        </div>
      ) : (
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-md">
          {/* Border drawn above content so sticky header bg can't clip the corner stroke. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-20 rounded-md border border-border"
          />
          <div className="min-h-0 flex-1 overflow-auto">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={() => setActiveId(null)}
            >
              {/* Plain <table> (not Table wrapper) so this scroll parent owns auto-scroll for long lists. */}
              <table className="w-full table-fixed caption-bottom text-sm">
                <TableHeader className="sticky top-0 z-[1] bg-muted/50 backdrop-blur supports-[backdrop-filter]:bg-muted/40 [&_tr]:border-border [&_th:first-child]:rounded-tl-[calc(var(--radius)-3px)] [&_th:last-child]:rounded-tr-[calc(var(--radius)-3px)]">
                  <TableRow className="border-b border-border hover:bg-transparent">
                    <TableHead className="h-8 w-8 px-1.5" />
                    <TableHead className="h-8 px-2 text-xs">{t("sources.colName")}</TableHead>
                    <TableHead className="h-8 w-[4.5rem] px-2 text-xs">{t("sources.colOrigin")}</TableHead>
                    <TableHead className="h-8 w-[9rem] px-2 text-xs">{t("sources.colPlatforms")}</TableHead>
                    <TableHead className="h-8 w-14 px-2 text-xs">{t("sources.colEnabled")}</TableHead>
                    <TableHead className="h-8 w-10 px-1.5" />
                  </TableRow>
                </TableHeader>
                <SortableContext items={scriptIds} strategy={verticalListSortingStrategy}>
                  <TableBody>
                    {scripts.map((script) => (
                      <SortableSourceRow
                        key={script.id}
                        script={script}
                        isLoading={isLoading}
                        onToggle={() => toggleEnabled(script.id)}
                        onRemove={() => removeScript(script.id)}
                      />
                    ))}
                  </TableBody>
                </SortableContext>
              </table>
              <DragOverlay dropAnimation={dropAnimation}>
                {activeScript ? <SourceDragPreview script={activeScript} /> : null}
              </DragOverlay>
            </DndContext>
          </div>
        </div>
      )}

      <Dialog open={getOpen} onOpenChange={setGetOpen}>
        <DialogContent>
          <DialogTitle className="sr-only">{t("sources.gzhTitle")}</DialogTitle>
          <div className="py-2">
            <GzhGuide />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
