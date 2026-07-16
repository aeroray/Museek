import { useState } from "react"
import { RefreshCw, Loader2, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
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
import { httpFetch } from "@/lib/http"
import { useUiStore } from "@/stores/uiStore"
import { useT } from "@/lib/i18n"

const REPO = "aeroray/Museek"
const RELEASES_URL = `https://github.com/${REPO}/releases/latest`

// Compare dotted versions (x.y.z); true when `latest` is strictly newer.
function isNewer(latest: string, current: string): boolean {
  const a = latest.split(".").map((n) => parseInt(n, 10) || 0)
  const b = current.split(".").map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0)
  }
  return false
}

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
  const [update, setUpdate] = useState<{ version: string; url: string } | null>(null)

  const checkUpdate = async () => {
    setChecking(true)
    try {
      const res = await httpFetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "Museek" },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const tag = String(data.tag_name || "").replace(/^v/, "")
      if (tag && isNewer(tag, __APP_VERSION__)) {
        setUpdate({ version: tag, url: data.html_url || RELEASES_URL })
      } else {
        useUiStore.getState().notify({ message: t("about.upToDate"), variant: "success" })
      }
    } catch (e) {
      useUiStore.getState().notify({ message: t("about.checkFailed", { msg: String(e) }), variant: "error" })
    } finally {
      setChecking(false)
    }
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
              <p className="pt-2 text-muted-foreground">{t("app.tagline")}</p>
            </div>
            <Button variant="outline" size="sm" onClick={checkUpdate} disabled={checking} className="shrink-0">
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

      {/* Update available */}
      <Dialog open={!!update} onOpenChange={(o) => !o && setUpdate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("about.updateTitle")}</DialogTitle>
            <DialogDescription>{t("about.updateDesc", { version: update?.version ?? "" })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpdate(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => {
                if (update) void openExternal(update.url)
                setUpdate(null)
              }}
            >
              <Download size={15} className="mr-2" />
              {t("about.download")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  )
}
