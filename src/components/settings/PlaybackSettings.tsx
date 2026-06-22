import { useEffect, useState } from "react"
import { Trash2 } from "lucide-react"
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
import { useSettingsStore, CACHE_LIMITS_MB } from "@/stores/settingsStore"
import { getCacheBytes, clearCache, enforceLimit, formatBytes } from "@/lib/mediaCache"
import { useT } from "@/lib/i18n"
import type { Quality } from "@/types/music"

const QUALITIES: Quality[] = ["128k", "320k", "flac", "flac24bit"]

function limitLabel(mb: number): string {
  return mb >= 1024 ? `${mb / 1024} GB` : `${mb} MB`
}

export function PlaybackSettings() {
  const {
    playQuality,
    audioCache,
    maxCacheMB,
    preventSleepWhilePlaying,
    closeBehavior,
    setPlayQuality,
    setAudioCache,
    setMaxCacheMB,
    setPreventSleepWhilePlaying,
    setCloseBehavior,
  } = useSettingsStore()
  const t = useT()

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

        {/* Prevent system sleep while playing */}
        <section className="space-y-2.5">
          <SettingHeader title={t("playback.preventSleepTitle")} desc={t("playback.preventSleepDesc")} />
          <Switch checked={preventSleepWhilePlaying} onCheckedChange={setPreventSleepWhilePlaying} />
        </section>

        {/* Close-button behavior */}
        <section className="space-y-3">
          <SettingHeader title={t("close.behaviorTitle")} desc={t("close.behaviorDesc")} />
          <div className="flex flex-wrap gap-2">
            {(["exit", "tray"] as const).map((b) => (
              <Button
                key={b}
                variant={closeBehavior === b ? "default" : "outline"}
                size="sm"
                onClick={() => setCloseBehavior(b)}
              >
                {t(`close.opt.${b}`)}
              </Button>
            ))}
          </div>
        </section>

        {/* Cache */}
        <section className="space-y-3 border-t border-border pt-5">
          <SettingHeader title={t("cache.title")} desc={t("cache.desc")} />

          <div className="space-y-2.5">
            <span className="block text-sm">{t("cache.audioTitle")}</span>
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
