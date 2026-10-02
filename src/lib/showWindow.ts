import { invoke } from "@tauri-apps/api/core"
import { isMacOs } from "@/lib/os"
import { hideToTray, setTrayVisible } from "@/lib/power"

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

/**
 * Force AppKit to rebuild the main window's shadow.
 *
 * Needed whenever the window's style mask changes — the mini-player sets
 * `decorations: false` on the way in and back on the way out, and on macOS the
 * shadow layer stops being painted across that change while `hasShadow` stays
 * true. Reopening from the tray happened to fix it because that path toggles the
 * shadow; this makes the same toggle explicit.
 *
 * It goes through Rust rather than `win.setShadow` because the toggle has to run
 * on the main thread AFTER the decorations change has been applied — tao applies
 * a style-mask change asynchronously via `DispatchQueue::main().exec_async`, so
 * a JS-side toggle issued right after `setDecorations` can run first and be
 * undone by the mask change landing afterwards.
 */
export async function refreshMainWindowShadow(): Promise<void> {
  if (!isTauri || !isMacOs()) return
  try {
    const { invoke } = await import("@tauri-apps/api/core")
    await invoke("refresh_main_window_shadow")
  } catch {
    /* the shadow is cosmetic; never fail a transition over it */
  }
}

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
      await refreshMainWindowShadow()
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
