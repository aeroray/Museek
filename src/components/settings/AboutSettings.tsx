import { useState } from "react"
import { RefreshCw, Loader2, Download, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { SettingsCard } from "@/components/settings/SettingsCard"
import { useUiStore } from "@/stores/uiStore"
import { useT } from "@/lib/i18n"
import {
  checkForAppUpdate,
  installAppUpdate,
  RELEASES_URL,
  type DownloadProgress,
  type UpdateInfo,
} from "@/lib/updater"

async function openExternal(url: string): Promise<void> {
  try {
    const { open } = await import("@tauri-apps/plugin-shell")
    await open(url)
  } catch {
    window.open(url, "_blank")
  }
}

export function AboutSettings() {
  const t = useT()
  const [checking, setChecking] = useState(false)
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [installing, setInstalling] = useState(false)
  const [progress, setProgress] = useState<DownloadProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Index into update.downloadUrls for “try another mirror”. */
  const [mirrorIndex, setMirrorIndex] = useState(0)

  const checkUpdate = async () => {
    setChecking(true)
    setError(null)
    setMirrorIndex(0)
    try {
      const info = await checkForAppUpdate()
      if (info) {
        setUpdate(info)
      } else {
        useUiStore.getState().notify({ message: t("about.upToDate"), variant: "success" })
      }
    } catch (e) {
      useUiStore.getState().notify({
        message: t("about.checkFailed", { msg: String(e instanceof Error ? e.message : e) }),
        variant: "error",
      })
    } finally {
      setChecking(false)
    }
  }

  const onInstall = async () => {
    setInstalling(true)
    setError(null)
    setProgress({ percent: null, downloaded: 0, total: null })
    try {
      await installAppUpdate(setProgress)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setInstalling(false)
    }
  }

  const mirrorUrls = update?.downloadUrls?.length
    ? update.downloadUrls
    : update?.downloadUrl
      ? [update.downloadUrl]
      : [RELEASES_URL]
  const manualUrl = mirrorUrls[mirrorIndex % mirrorUrls.length] ?? RELEASES_URL
  const canCycleMirror = !update?.canInstall && mirrorUrls.length > 1

  const openMirror = () => void openExternal(manualUrl)
  const tryAnotherMirror = () => {
    const next = (mirrorIndex + 1) % mirrorUrls.length
    setMirrorIndex(next)
    void openExternal(mirrorUrls[next] ?? RELEASES_URL)
  }

  return (
    <ScrollArea className="h-full">
      <div className="pr-3 pb-4">
        <SettingsCard>
          <div className="flex items-start justify-between gap-4 p-4">
            <div className="space-y-1.5 text-sm">
              <p className="text-base font-semibold">{t("app.name")}</p>
              <p className="text-muted-foreground">{t("settings.about.version", { version: __APP_VERSION__ })}</p>
              <p className="text-muted-foreground">{t("settings.about.description")}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void checkUpdate()} disabled={checking} className="shrink-0">
              {checking ? (
                <Loader2 size={15} className="mr-2 animate-spin" />
              ) : (
                <RefreshCw size={15} className="mr-2" />
              )}
              {t("about.checkUpdate")}
            </Button>
          </div>
        </SettingsCard>

        <SettingsCard className="mt-4">
          <div className="flex flex-col items-center gap-3 p-6 text-center">
            <img
              src="/gzh/qrcode.webp"
              alt={t("about.gzhTitle")}
              className="h-40 w-40 rounded-xl bg-white object-contain outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
            />
            <div className="space-y-1">
              <p className="text-sm font-semibold">{t("about.gzhTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("about.gzhHint")}</p>
            </div>
          </div>
        </SettingsCard>
      </div>

      <Dialog
        open={!!update}
        onOpenChange={(o) => {
          if (installing) return
          if (!o) {
            setUpdate(null)
            setError(null)
            setProgress(null)
            setMirrorIndex(0)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("about.updateTitle")}</DialogTitle>
            <DialogDescription>
              {update?.canInstall
                ? t("about.updateDescInstall", { version: update.version })
                : t("about.updateDescMirror", { version: update?.version ?? "" })}
            </DialogDescription>
          </DialogHeader>
          {installing && (
            <div className="space-y-2">
              <Progress value={progress?.percent ?? undefined} className="h-2" />
              <p className="text-xs text-muted-foreground tabular-nums">
                {progress?.percent != null
                  ? t("about.updatingPercent", { percent: progress.percent })
                  : t("about.updating")}
              </p>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{t("about.updateFailed", { msg: error })}</p>}
          <DialogFooter className="gap-2 sm:gap-0 flex-wrap">
            {!installing && (
              <>
                <Button variant="ghost" size="sm" onClick={() => void openExternal(RELEASES_URL)}>
                  {t("about.openReleases")}
                </Button>
                <Button variant="outline" onClick={() => setUpdate(null)}>
                  {t("common.cancel")}
                </Button>
                {update?.canInstall ? (
                  <Button onClick={() => void onInstall()}>
                    <Download size={15} className="mr-2" />
                    {t("about.installNow")}
                  </Button>
                ) : (
                  <>
                    {canCycleMirror && (
                      <Button variant="outline" onClick={tryAnotherMirror}>
                        {t("about.tryAnotherMirror")}
                      </Button>
                    )}
                    <Button onClick={openMirror}>
                      <ExternalLink size={15} className="mr-2" />
                      {t("about.mirrorDownload")}
                    </Button>
                  </>
                )}
              </>
            )}
            {installing && (
              <Button disabled>
                <Loader2 size={15} className="mr-2 animate-spin" />
                {t("about.updating")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  )
}
