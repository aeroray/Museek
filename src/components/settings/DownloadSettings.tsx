import { Folder, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SettingHeader } from "@/components/settings/SettingHeader"
import { useSettingsStore, type NamingScheme } from "@/stores/settingsStore"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { Quality } from "@/types/music"

const QUALITIES: Quality[] = ["128k", "320k", "flac", "flac24bit"]
const NAMINGS: NamingScheme[] = ["singer-name", "name-singer", "name"]
const CONCURRENCY = [1, 2, 3, 4, 5]

export function DownloadSettings() {
  const {
    downloadQuality,
    downloadDir,
    maxConcurrent,
    fileNaming,
    setDownloadQuality,
    setDownloadDir,
    setMaxConcurrent,
    setFileNaming,
  } = useSettingsStore()
  const t = useT()
  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

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
            <div
              className={cn(
                "flex-1 min-w-0 text-sm px-3 py-2 rounded-md border bg-muted/40 truncate",
                !downloadDir && "text-muted-foreground"
              )}
              title={downloadDir ?? undefined}
            >
              {downloadDir || t("download.notSet")}
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
                title={t("download.clearLocation")}
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
      </div>
    </ScrollArea>
  )
}
