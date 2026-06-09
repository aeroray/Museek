import { useEffect, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useSettingsStore } from "@/stores/settingsStore"
import { useT } from "@/lib/i18n"

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

/**
 * Intercepts the window close button and applies the user's close-behavior
 * setting: hide to tray, exit immediately, or (default, until dismissed) ask
 * for confirmation with a "don't remind again" checkbox. Reads settings fresh
 * from the store on each close so the listener never goes stale.
 */
export function CloseGuard() {
  const t = useT()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [dontRemind, setDontRemind] = useState(false)

  useEffect(() => {
    if (!isTauri) return
    let unlisten: (() => void) | undefined
    let disposed = false
    ;(async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window")
      const win = getCurrentWindow()
      const fn = await win.onCloseRequested(async (event) => {
        const { closeBehavior, closeConfirmDismissed } = useSettingsStore.getState()
        if (closeBehavior === "tray") {
          event.preventDefault()
          await win.hide()
          return
        }
        // "exit" behavior: quit explicitly (a tray icon would otherwise keep the
        // process alive after a plain window close).
        if (closeConfirmDismissed) {
          event.preventDefault()
          await invoke("quit_app")
          return
        }
        // Not yet dismissed → show the in-app confirmation.
        event.preventDefault()
        setDontRemind(false)
        setConfirmOpen(true)
      })
      if (disposed) fn()
      else unlisten = fn
    })()
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  const confirmExit = async () => {
    if (dontRemind) useSettingsStore.getState().setCloseConfirmDismissed(true)
    setConfirmOpen(false)
    await invoke("quit_app")
  }

  return (
    <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("close.confirmTitle")}</DialogTitle>
          <DialogDescription>{t("close.confirmDesc")}</DialogDescription>
        </DialogHeader>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={dontRemind}
            onChange={(e) => setDontRemind(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-[hsl(var(--primary))]"
          />
          {t("close.dontRemind")}
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirmOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={confirmExit}>{t("close.exitNow")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
