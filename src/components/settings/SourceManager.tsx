import { useState, useRef } from "react"
import { Upload, Trash2, AlertCircle, Loader2, ClipboardPaste, GripVertical } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useSourceStore } from "@/stores/sourceStore"
import { SettingHeader } from "@/components/settings/SettingHeader"
import { useDragSort } from "@/hooks/useDragSort"
import { useFlip } from "@/hooks/useFlip"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export function SourceManager() {
  const { scripts, isLoading, error, importScriptFromUrl, removeScript, toggleEnabled, reorderScripts } =
    useSourceStore()
  const t = useT()
  const enabledCount = scripts.filter((s) => s.enabled).length
  const [url, setUrl] = useState("")
  const [importing, setImporting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const drag = useDragSort(reorderScripts)
  const flipRef = useFlip(scripts.map((s) => s.id).join(","))

  async function handleImport() {
    const trimmed = url.trim()
    if (!trimmed) return
    setImporting(true)
    try {
      await importScriptFromUrl(trimmed)
      setUrl("")
    } catch {
      // failure is surfaced once via the store's `error` state
    } finally {
      setImporting(false)
    }
  }

  async function handlePaste() {
    try {
      let text: string | null = null
      if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
        // Tauri: read via the clipboard plugin (capability-gated, no permission prompt).
        const { readText } = await import("@tauri-apps/plugin-clipboard-manager")
        text = await readText()
      } else {
        // Browser preview: the web Clipboard API (may be blocked without permission).
        text = await navigator.clipboard.readText()
      }
      if (text?.trim()) {
        setUrl(text.trim())
        return
      }
    } catch {
      // clipboard unavailable / blocked
    }
    // Fallback: focus the field so the user can paste manually with Ctrl+V.
    inputRef.current?.focus()
  }

  return (
    <div className="flex flex-col h-full space-y-4">
      <div className="space-y-3 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <SettingHeader title={t("sources.title")} desc={t("sources.hint")} />
          {scripts.length > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {t("sources.count", { total: scripts.length, enabled: enabledCount })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Input
              ref={inputRef}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleImport()
              }}
              placeholder={t("sources.urlPlaceholder")}
              disabled={importing}
              className="pr-9"
            />
            <Button
              variant="outline"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground"
              onClick={handlePaste}
              disabled={importing}
              title={t("sources.paste")}
            >
              <ClipboardPaste size={14} />
            </Button>
          </div>
          <Button onClick={handleImport} disabled={importing || !url.trim()}>
            {importing ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Upload size={16} className="mr-2" />}
            {t("sources.import")}
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-3 shrink-0">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {scripts.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>{t("sources.empty")}</p>
          <p className="text-sm mt-1">{t("sources.emptyHint")}</p>
        </div>
      ) : (
        <ScrollArea className="flex-1 min-h-0">
          <div ref={flipRef} className="space-y-2 pr-3">
            {scripts.map((script, index) => (
              <div
                key={script.id}
                data-drag-index={index}
                data-flip-id={script.id}
                className={cn(
                  "flex items-center gap-3 p-4 rounded-lg border bg-card transition-all",
                  drag.dragIndex === index && "opacity-40",
                  drag.overIndex === index && drag.dragIndex !== index && "border-primary"
                )}
              >
                <div
                  className="shrink-0 text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
                  onPointerDown={drag.onPointerDown(index)}
                  onPointerMove={drag.onPointerMove}
                  onPointerUp={drag.onPointerUp}
                >
                  <GripVertical size={16} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{script.name}</span>
                    <Badge variant="outline" className="text-xs shrink-0">
                      v{script.version}
                    </Badge>
                  </div>
                  {script.author && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{t("sources.author", { name: script.author })}</p>
                  )}
                  {script.sources && (
                    <p className="text-xs text-muted-foreground truncate">
                      {t("sources.platforms", { list: Object.keys(script.sources).join("、") })}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Switch
                    checked={script.enabled}
                    disabled={isLoading}
                    onCheckedChange={() => toggleEnabled(script.id)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => removeScript(script.id)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
