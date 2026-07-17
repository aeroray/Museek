import { Minus, Square, X } from "lucide-react"
import { useT } from "@/lib/i18n"
import { isMacOs } from "@/lib/os"
import { cn } from "@/lib/utils"

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

async function currentWindow() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window")
  return getCurrentWindow()
}

// Custom minimize / maximize / close for Windows (and Linux) frameless chrome.
// macOS uses native traffic lights via titleBarStyle: Overlay — hide these.
// Close still goes through CloseGuard (onCloseRequested).
export function WindowControls() {
  const t = useT()
  if (!isTauri || isMacOs()) return null

  const base =
    "relative inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.96]"

  return (
    <div className="flex items-center">
      <button
        className={cn(base, "hover:bg-accent hover:text-foreground")}
        title={t("window.minimize")}
        onClick={async () => (await currentWindow()).minimize()}
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
