import { Minus, Square, X } from "lucide-react"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

async function currentWindow() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window")
  return getCurrentWindow()
}

// Custom minimize / maximize / close buttons for the frameless (decorations:false)
// window. Close goes through the normal flow — CloseGuard intercepts the window's
// onCloseRequested and applies the tray / confirm / quit behaviour. Tauri-only.
export function WindowControls() {
  const t = useT()
  if (!isTauri) return null

  const base = "inline-flex h-7 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors"

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
