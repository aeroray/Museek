import { isMacOs } from "@/lib/os"

/** Reveal the main window. Windows waits for first paint; macOS is shown from Rust. */
export async function showMainWindow(): Promise<void> {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window")
    const win = getCurrentWindow()

    // macOS: already shown in Rust setup — just ensure focus, no paint gate.
    if (isMacOs()) {
      await win.show().catch(() => {
        /* ignore */
      })
      await win.setFocus().catch(() => {
        /* ignore */
      })
      return
    }

    // Windows: two rAFs so layout/paint land before revealing (avoids white flash).
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve())
      })
    })
    await win.show()
    await win.setFocus().catch(() => {
      /* ignore */
    })
  } catch {
    /* ignore — Rust fallback will show after a few seconds on Windows */
  }
}
