import { useState } from "react"
import { RefreshCw, Heart, Loader2, Download } from "lucide-react"
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
  const [donateOpen, setDonateOpen] = useState(false)

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

  const donateCodes = [
    { src: "/donate/wechat.svg", label: t("about.wechat") },
    { src: "/donate/alipay.svg", label: t("about.alipay") },
  ]

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 pr-3 pb-4 text-sm">
        <div className="space-y-1.5">
          <p className="font-semibold text-base">{t("app.name")}</p>
          <p className="text-muted-foreground">{t("settings.about.version", { version: __APP_VERSION__ })}</p>
          <p className="text-muted-foreground">{t("settings.about.description")}</p>
          <p className="text-muted-foreground pt-2">{t("app.tagline")}</p>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={checkUpdate} disabled={checking}>
            {checking ? <Loader2 size={15} className="mr-2 animate-spin" /> : <RefreshCw size={15} className="mr-2" />}
            {t("about.checkUpdate")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDonateOpen(true)}>
            <Heart size={15} className="mr-2 text-red-500" />
            {t("about.donate")}
          </Button>
        </div>
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

      {/* Donate */}
      <Dialog open={donateOpen} onOpenChange={setDonateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("about.donateTitle")}</DialogTitle>
            <DialogDescription>{t("about.donateDesc")}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center gap-6 py-2">
            {donateCodes.map((q) => (
              <div key={q.label} className="flex flex-col items-center gap-2">
                <img src={q.src} alt={q.label} className="h-44 w-44 rounded-lg border border-border object-contain bg-white" />
                <span className="text-sm text-muted-foreground">{q.label}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  )
}
