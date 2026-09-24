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
import {
  MAX_STORED_QUALITIES,
  clearStoredQualities,
  countStoredQualities,
} from "@/lib/songQualityPrefs"
import { useT } from "@/lib/i18n"

function limitLabel(mb: number): string {
  return mb >= 1024 ? `${mb / 1024} GB` : `${mb} MB`
}

export function CacheSettings() {
  const {
    audioCache,
    maxCacheMB,
    setAudioCache,
    setMaxCacheMB,
  } = useSettingsStore()
  const t = useT()

  const [cacheSize, setCacheSize] = useState(0)
  const [clearing, setClearing] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [qualityConfirmOpen, setQualityConfirmOpen] = useState(false)
  // Seeded lazily rather than in an effect: the store is already loaded by the
  // time Settings can be opened, and an effect would render "0 remembered" for
  // one frame. Every mutation below refreshes it explicitly.
  const [qualityCount, setQualityCount] = useState(countStoredQualities)
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

  const handleClearQualities = () => {
    clearStoredQualities()
    setQualityCount(0)
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

        {/* Per-song quality choices are a separate thing from the audio cache:
            they are tiny (a few hundred KB at most), and clearing them changes
            how songs PLAY rather than what is on disk. So they get their own
            card and their own confirm.

            There is no size/limit control on purpose: an entry is ~113 bytes, so
            the cap is a constant and the only thing a user needs to see is how
            many are stored and how to clear them. */}
        <SettingsCard className="mt-3">
          <SettingRow
            title={t("cache.songQualityTitle")}
            desc={t("cache.songQualityDesc", { max: MAX_STORED_QUALITIES })}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">
                {t("cache.songQualityCount", { n: qualityCount })}
              </span>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setQualityConfirmOpen(true)}
                disabled={qualityCount === 0}
              >
                <Trash2 size={14} className="mr-2" />
                {t("cache.songQualityClear")}
              </Button>
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

      <Dialog open={qualityConfirmOpen} onOpenChange={setQualityConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("cache.songQualityClearTitle")}</DialogTitle>
            <DialogDescription>
              {t("cache.songQualityClearDesc")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setQualityConfirmOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                handleClearQualities()
                setQualityConfirmOpen(false)
              }}
            >
              {t("cache.songQualityClearConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  )
}
