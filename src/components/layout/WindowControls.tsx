import { Minus, Square, X } from "lucide-react"
import { useT } from "@/lib/i18n"
import { isMacOs } from "@/lib/os"
import { hideToTray } from "@/lib/power"
import { useSettingsStore } from "@/stores/settingsStore"
import { cn } from "@/lib/utils"

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

async function currentWindow() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window")
  return getCurrentWindow()
}

// Custom minimize / maximize / close for Windows (and Linux) frameless chrome.
// macOS uses native traffic lights via titleBarStyle: Overlay — hide these.
// Close still goes through CloseGuard (onCloseRequested).
// In tray close-mode, the minimize button also hides to tray (matches the setting label).
//
// These three buttons are deliberately static. They are OS chrome, not app
// controls: a scale or spring here reads as the window itself wobbling, and the
// rest of the app's icon motion would draw the eye to the least interesting
// corner of the UI. Only the flat hover color changes, with no transition, so
// nothing moves. Do not add `icon-button-motion` or a hover transform here.
export function WindowControls() {
  const t = useT()
  if (!isTauri || isMacOs()) return null

  const base =
    "relative inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground"

  return (
    <div className="flex items-center">
      <button
        className={cn(base, "hover:bg-accent hover:text-foreground")}
        title={t("window.minimize")}
        onClick={async () => {
          const win = await currentWindow()
          if (useSettingsStore.getState().closeBehavior === "tray") {
            await hideToTray(win)
            return
          }
          await win.minimize()
        }}
      >
        <Minus size={16} />
      </button>
      <button
        className={cn(base, "hover:bg-accent hover:text-foreground")}
        title={t("window.maximize")}
        onClick={async () => (await currentWindow()).toggleMaximize()}
      >
        <Square size={13} />
      </button>
      <button
        className={cn(base, "hover:bg-red-500 hover:text-white")}
        title={t("window.close")}
        onClick={async () => (await currentWindow()).close()}
      >
        <X size={16} />
      </button>
    </div>
  )
}
