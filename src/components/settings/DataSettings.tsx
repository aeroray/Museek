import { useState } from "react"
import { Download, Upload, Loader2, Folder } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { gatherConfig, saveConfigFile, pickConfigFile, isValidConfig, type MuseekConfig } from "@/lib/configIO"
import { backupToFolder, decryptConfig, readSyncFile, applyConfigAndReload, WrongPassphraseError } from "@/lib/sync"
import { useSettingsStore } from "@/stores/settingsStore"
import { useUiStore } from "@/stores/uiStore"
import { useT } from "@/lib/i18n"

export function DataSettings() {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<MuseekConfig | null>(null)
  const {
    syncFolder,
    setSyncFolder,
    syncPassphrase,
    setSyncPassphrase,
    autoBackupOnExit,
    setAutoBackupOnExit,
  } = useSettingsStore()
  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
  const canSync = !!syncFolder && !!syncPassphrase

  const chooseSyncFolder = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog")
      const dir = await open({ directory: true, multiple: false })
      if (typeof dir === "string") setSyncFolder(dir)
    } catch {
      // dialog unavailable (e.g. browser preview)
    }
  }

  const doBackup = async () => {
    if (!canSync) return
    setBusy(true)
    try {
      await backupToFolder()
      useUiStore.getState().notify({ message: t("sync.backupDone"), variant: "success" })
    } catch (e) {
      useUiStore.getState().notify({ message: t("data.failed", { msg: String(e) }), variant: "error" })
    } finally {
      setBusy(false)
    }
  }

  const doRestore = async () => {
    if (!canSync || !syncFolder || !syncPassphrase) return
    setBusy(true)
    try {
      const blob = await readSyncFile(syncFolder)
      if (!blob) {
        useUiStore.getState().notify({ message: t("sync.noBackup"), variant: "error" })
        return
      }
      // Decrypt + validate, then reuse the import confirmation dialog below.
      setPending(await decryptConfig(blob, syncPassphrase))
    } catch (e) {
      const msg = e instanceof WrongPassphraseError ? t("sync.wrongPass") : t("data.failed", { msg: String(e) })
      useUiStore.getState().notify({ message: msg, variant: "error" })
    } finally {
      setBusy(false)
    }
  }

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
    // Apply, mark as the synced baseline, and reload so every store re-initializes.
    await applyConfigAndReload(pending)
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

        {/* Folder-based, end-to-end-encrypted cross-device sync */}
        <section className="space-y-3 border-t border-border pt-5">
          <SettingHeader title={t("sync.title")} desc={t("sync.desc")} />

          <div className="flex items-center gap-2">
            <div
              className="flex-1 min-w-0 text-sm px-3 py-2 rounded-md border bg-muted/40 truncate"
              title={syncFolder ?? undefined}
            >
              {syncFolder || t("sync.noFolder")}
            </div>
            <Button variant="outline" size="sm" onClick={chooseSyncFolder} disabled={!isTauri} className="shrink-0">
              <Folder size={15} className="mr-2" />
              {t("sync.choose")}
            </Button>
          </div>

          <Input
            type="password"
            value={syncPassphrase ?? ""}
            onChange={(e) => setSyncPassphrase(e.target.value)}
            placeholder={t("sync.passphrasePlaceholder")}
            autoComplete="new-password"
          />

          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoBackupOnExit}
              onChange={(e) => setAutoBackupOnExit(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-[hsl(var(--primary))]"
            />
            {t("sync.autoBackupOnExit")}
          </label>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={doBackup} disabled={busy || !isTauri || !canSync}>
              {busy ? <Loader2 size={15} className="mr-2 animate-spin" /> : <Upload size={15} className="mr-2" />}
              {t("sync.backup")}
            </Button>
            <Button variant="outline" onClick={doRestore} disabled={busy || !isTauri || !canSync}>
              <Download size={15} className="mr-2" />
              {t("sync.restore")}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">{t("sync.note")}</p>
        </section>
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
