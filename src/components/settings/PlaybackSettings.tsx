import { useEffect, useState } from "react"
import { Folder, RotateCcw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { SettingHeader } from "@/components/settings/SettingHeader"
import { useSettingsStore, type NamingScheme, CACHE_LIMITS_MB } from "@/stores/settingsStore"
import { getCacheBytes, clearCache, enforceLimit, formatBytes } from "@/lib/mediaCache"
import { useT } from "@/lib/i18n"
import type { Quality } from "@/types/music"

const QUALITIES: Quality[] = ["128k", "320k", "flac", "flac24bit"]
const NAMINGS: NamingScheme[] = ["singer-name", "name-singer", "name"]
const CONCURRENCY = [1, 2, 3, 4, 5]

function limitLabel(mb: number): string {
  return mb >= 1024 ? `${mb / 1024} GB` : `${mb} MB`
}

export function PlaybackSettings() {
  const {
    playQuality,
    downloadQuality,
    downloadDir,
    maxConcurrent,
    fileNaming,
    audioCache,
    maxCacheMB,
    setPlayQuality,
    setDownloadQuality,
    setDownloadDir,
    setMaxConcurrent,
    setFileNaming,
    setAudioCache,
    setMaxCacheMB,
  } = useSettingsStore()
  const t = useT()
  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

  const [cacheSize, setCacheSize] = useState(0)
  const [clearing, setClearing] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  useEffect(() => {
    getCacheBytes().then(setCacheSize)
  }, [])

  const handleClearCache = async () => {
    setClearing(true)
    await clearCache()
    setCacheSize(0)
    setClearing(false)
  }

  const handleSetLimit = (mb: number) => {
    setMaxCacheMB(mb)
    enforceLimit(mb * 1024 * 1024).then(() => getCacheBytes().then(setCacheSize))
  }

  async function chooseFolder() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog")
      const dir = await open({ directory: true, multiple: false })
      if (typeof dir === "string") setDownloadDir(dir)
    } catch {
      // dialog unavailable (e.g. browser preview)
    }
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-6 pr-3 pb-4">
        {/* Playback quality */}
        <section className="space-y-3">
          <SettingHeader title={t("playback.playQualityTitle")} desc={t("playback.playQualityDesc")} />
          <div className="flex flex-wrap gap-2">
            {QUALITIES.map((q) => (
              <Button
                key={q}
                variant={playQuality === q ? "default" : "outline"}
                size="sm"
                onClick={() => setPlayQuality(q)}
              >
                {t(`quality.${q}`)}
              </Button>
            ))}
          </div>
        </section>

        {/* Download quality */}
        <section className="space-y-3">
          <SettingHeader title={t("playback.downloadQualityTitle")} desc={t("playback.downloadQualityDesc")} />
          <div className="flex flex-wrap gap-2">
            {QUALITIES.map((q) => (
              <Button
                key={q}
                variant={downloadQuality === q ? "default" : "outline"}
                size="sm"
                onClick={() => setDownloadQuality(q)}
              >
                {t(`quality.${q}`)}
              </Button>
            ))}
          </div>
        </section>

        {/* Download location */}
        <section className="space-y-3">
          <SettingHeader title={t("download.locationTitle")} desc={t("download.locationDesc")} />
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 text-sm px-3 py-2 rounded-md border bg-muted/40 truncate" title={downloadDir ?? undefined}>
              {downloadDir || t("download.defaultLocation")}
            </div>
            <Button variant="outline" size="sm" onClick={chooseFolder} disabled={!isTauri} className="shrink-0">
              <Folder size={15} className="mr-2" />
              {t("download.choose")}
            </Button>
            {downloadDir && (
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 text-muted-foreground"
                onClick={() => setDownloadDir(null)}
                title={t("download.reset")}
              >
                <RotateCcw size={15} />
              </Button>
            )}
          </div>
        </section>

        {/* Concurrency */}
        <section className="space-y-3">
          <SettingHeader title={t("download.concurrencyTitle")} desc={t("download.concurrencyDesc")} />
          <div className="flex gap-2">
            {CONCURRENCY.map((n) => (
              <Button
                key={n}
                variant={maxConcurrent === n ? "default" : "outline"}
                size="icon"
                className="h-9 w-9 tabular-nums"
                onClick={() => setMaxConcurrent(n)}
              >
                {n}
              </Button>
            ))}
          </div>
        </section>

        {/* File naming */}
        <section className="space-y-3">
          <SettingHeader title={t("download.namingTitle")} desc={t("download.namingDesc")} />
          <div className="flex flex-wrap gap-2">
            {NAMINGS.map((n) => (
              <Button
                key={n}
                variant={fileNaming === n ? "default" : "outline"}
                size="sm"
                onClick={() => setFileNaming(n)}
              >
                {t(`naming.${n}`)}
              </Button>
            ))}
          </div>
        </section>

        {/* Cache */}
        <section className="space-y-3 border-t border-border pt-5">
          <SettingHeader title={t("cache.title")} desc={t("cache.desc")} />

          <div className="flex items-center justify-between gap-3">
            <span className="text-sm">{t("cache.audioTitle")}</span>
            <Switch checked={audioCache} onCheckedChange={setAudioCache} />
          </div>

          <div className="space-y-1.5">
            <span className="text-sm text-muted-foreground">{t("cache.maxTitle")}</span>
            <div className="flex flex-wrap gap-2">
              {CACHE_LIMITS_MB.map((mb) => (
                <Button
                  key={mb}
                  variant={maxCacheMB === mb ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleSetLimit(mb)}
                >
                  {limitLabel(mb)}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="flex-1 text-sm text-muted-foreground">
              {t("cache.current", { size: formatBytes(cacheSize) })}
            </span>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={clearing || cacheSize === 0}
            >
              <Trash2 size={14} className="mr-2" />
              {t("cache.clear")}
            </Button>
          </div>

          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("cache.clearConfirmTitle")}</DialogTitle>
                <DialogDescription>{t("cache.clearConfirmDesc")}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button
                  variant="destructive"
                  onClick={async () => {
                    await handleClearCache()
                    setConfirmOpen(false)
                  }}
                >
                  {t("cache.clearConfirm")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </section>
      </div>
    </ScrollArea>
  )
}
