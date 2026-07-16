import { useEffect, useRef, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import type { Window } from "@tauri-apps/api/window"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { backupToFolder } from "@/lib/sync"
import { useSettingsStore } from "@/stores/settingsStore"
import { useT } from "@/lib/i18n"

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

/**
 * Single authority for window close + app quit:
 *  - Close button in "tray" mode  → hide to tray (keep running).
 *  - Close button in "exit" mode  → confirm (unless dismissed), then quit.
 *  - Tray "Quit" (a "quit-requested" event) → quit.
 * On any real quit it first backs up to the sync folder — silently when
 * auto-backup is on, or via a checkbox in the dialog when it's off.
 * Settings are read fresh on each close so the listeners never go stale.
 */
export function CloseGuard() {
  const t = useT()
  const winRef = useRef<Window | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [showDontRemind, setShowDontRemind] = useState(false)
  const [showBackupChoice, setShowBackupChoice] = useState(false)
  const [dontRemind, setDontRemind] = useState(false)
  const [backupChecked, setBackupChecked] = useState(true)

  const safeBackup = async () => {
    // Best-effort: never block quitting if the backup fails.
    try {
      await backupToFolder()
    } catch {
      /* ignore */
    }
  }

  // Decide what to do when a quit/close is requested. `fromClose` = triggered by
  // the window close button (vs. the tray Quit item).
  const handleQuit = async (fromClose: boolean) => {
    const st = useSettingsStore.getState()
    const canSync = !!st.syncFolder

    if (fromClose && st.closeBehavior === "tray") {
      await winRef.current?.hide()
      return
    }

    const needCloseConfirm = fromClose && !st.closeConfirmDismissed
    const needBackupPrompt = canSync && !st.autoBackupOnExit
    if (needCloseConfirm || needBackupPrompt) {
      setShowDontRemind(needCloseConfirm)
      setShowBackupChoice(needBackupPrompt)
      setDontRemind(false)
      setBackupChecked(true)
      setDialogOpen(true)
      return
    }

    // No prompt needed → silent auto-backup (if enabled) then quit.
    if (canSync && st.autoBackupOnExit) await safeBackup()
    await invoke("quit_app")
  }

  const onConfirmQuit = async () => {
    const st = useSettingsStore.getState()
    setDialogOpen(false)
    if (st.syncFolder) {
      if (st.autoBackupOnExit || (showBackupChoice && backupChecked)) await safeBackup()
    }
    if (showDontRemind && dontRemind) st.setCloseConfirmDismissed(true)
    await invoke("quit_app")
  }

  useEffect(() => {
    if (!isTauri) return
    let unlistenClose: (() => void) | undefined
    let unlistenQuit: (() => void) | undefined
    let disposed = false
    ;(async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window")
      const { listen } = await import("@tauri-apps/api/event")
      const win = getCurrentWindow()
      winRef.current = win
      const u1 = await win.onCloseRequested((event) => {
        event.preventDefault()
        void handleQuit(true)
      })
      // Fired by the tray "Quit" menu item (see lib.rs).
      const u2 = await listen("quit-requested", () => void handleQuit(false))
      if (disposed) {
        u1()
        u2()
      } else {
        unlistenClose = u1
        unlistenQuit = u2
      }
    })()
    return () => {
      disposed = true
      unlistenClose?.()
      unlistenQuit?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("close.confirmTitle")}</DialogTitle>
          {showDontRemind && <DialogDescription>{t("close.confirmDesc")}</DialogDescription>}
        </DialogHeader>

        {showBackupChoice && (
          <Label className="flex items-center gap-2 text-sm font-normal cursor-pointer select-none">
            <Checkbox checked={backupChecked} onCheckedChange={(v) => setBackupChecked(v === true)} />
            {t("sync.backupBeforeQuit")}
          </Label>
        )}

        <DialogFooter className="flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {showDontRemind ? (
            <Label className="flex items-center gap-2 text-xs font-normal text-muted-foreground cursor-pointer select-none mr-auto">
              <Checkbox
                className="size-4 shrink-0 rounded-sm"
                checked={dontRemind}
                onCheckedChange={(v) => setDontRemind(v === true)}
              />
              {t("close.dontRemind")}
            </Label>
          ) : (
            <span className="hidden sm:block" />
          )}
          <div className="flex w-full gap-2 sm:w-auto sm:justify-end">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={onConfirmQuit}>{t("close.exitNow")}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
