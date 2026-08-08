import { invoke } from "@tauri-apps/api/core"
import { isMacOs } from "@/lib/os"
import { hideToTray, setTrayVisible } from "@/lib/power"

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

/** Reveal the main window. Windows waits for first paint; macOS is shown from Rust. */
export async function showMainWindow(): Promise<void> {
  if (!isTauri) return
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window")
    const win = getCurrentWindow()

    // macOS: already shown in Rust setup — ensure focus + re-assert shadow after
    // first paint (transparent Overlay windows can miss the cold-start shadow).
    if (isMacOs()) {
      await win.show().catch(() => {
        /* ignore */
      })
      await win.setFocus().catch(() => {
        /* ignore */
      })
      try {
        await win.setShadow(false)
        await win.setShadow(true)
      } catch {
        /* ignore */
      }
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

/**
 * First paint: either show the main window, or stay in the tray for silent
 * login autostart (`--autostart` + startHiddenToTray).
 */
export async function revealOrHideOnLaunch(): Promise<void> {
  if (!isTauri) return
  try {
    const hidden = await invoke<boolean>("should_start_hidden")
    if (hidden) {
      setTrayVisible(true)
      const { getCurrentWindow } = await import("@tauri-apps/api/window")
      await hideToTray(getCurrentWindow())
      return
    }
  } catch {
    /* command missing in preview — fall through to show */
  }
  await showMainWindow()
}
