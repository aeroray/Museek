import { useState } from "react"
import { Download, Upload, Loader2 } from "lucide-react"
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
import { SettingHeader } from "@/components/settings/SettingHeader"
import { gatherConfig, applyConfig, saveConfigFile, pickConfigFile, isValidConfig, type MuseekConfig } from "@/lib/configIO"
import { useUiStore } from "@/stores/uiStore"
import { useT } from "@/lib/i18n"

export function DataSettings() {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<MuseekConfig | null>(null)

  const doExport = async () => {
    setBusy(true)
    try {
      const json = JSON.stringify(await gatherConfig(), null, 2)
      const ok = await saveConfigFile(json)
      if (ok) useUiStore.getState().notify({ message: t("data.exportDone"), variant: "success" })
    } catch (e) {
      useUiStore.getState().notify({ message: t("data.failed", { msg: String(e) }), variant: "error" })
    } finally {
      setBusy(false)
    }
  }

  const doPickImport = async () => {
    setBusy(true)
    try {
      const text = await pickConfigFile()
      if (!text) return
      const parsed = JSON.parse(text)
      if (!isValidConfig(parsed)) {
        useUiStore.getState().notify({ message: t("data.invalid"), variant: "error" })
        return
      }
      setPending(parsed) // open confirmation
    } catch (e) {
      useUiStore.getState().notify({ message: t("data.failed", { msg: String(e) }), variant: "error" })
    } finally {
      setBusy(false)
    }
  }

  const confirmImport = async () => {
    if (!pending) return
    await applyConfig(pending)
    // Reload so every store re-initializes from the imported data.
    location.reload()
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 pr-3 pb-4">
        <SettingHeader title={t("data.title")} desc={t("data.desc")} />

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={doExport} disabled={busy}>
            {busy ? <Loader2 size={15} className="mr-2 animate-spin" /> : <Download size={15} className="mr-2" />}
            {t("data.export")}
          </Button>
          <Button variant="outline" onClick={doPickImport} disabled={busy}>
            <Upload size={15} className="mr-2" />
            {t("data.import")}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">{t("data.note")}</p>
      </div>

      <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("data.importConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("data.importConfirmDesc")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={confirmImport}>
              {t("data.importConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  )
}
