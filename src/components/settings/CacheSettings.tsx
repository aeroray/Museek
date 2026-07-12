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
import { SettingsCard, SettingRow } from "@/components/settings/SettingsCard"
import { useSettingsStore, CACHE_LIMITS_MB } from "@/stores/settingsStore"
import { getCacheBytes, clearCache, enforceLimit, formatBytes } from "@/lib/mediaCache"
import { useT } from "@/lib/i18n"

function limitLabel(mb: number): string {
  return mb >= 1024 ? `${mb / 1024} GB` : `${mb} MB`
}

export function CacheSettings() {
  const { audioCache, maxCacheMB, setAudioCache, setMaxCacheMB } = useSettingsStore()
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
      <div className="pr-3 pb-4">
        <SettingsCard>
          <SettingRow
            title={t("cache.audioTitle")}
            desc={t("cache.desc")}
            control={<Switch checked={audioCache} onCheckedChange={setAudioCache} />}
          />

          <SettingRow title={t("cache.maxTitle")} desc={t("cache.maxDesc")}>
            <div className="space-y-3">
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
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">
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
            </div>
          </SettingRow>
        </SettingsCard>
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
    </ScrollArea>
  )
}
