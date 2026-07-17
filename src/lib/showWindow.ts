/** Reveal the main window after the first UI paint (starts visible:false). */
export async function showMainWindow(): Promise<void> {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window")
    const win = getCurrentWindow()
    // Two rAFs: commit layout/paint into the hidden webview before revealing.
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
    /* ignore — Rust fallback will show after a few seconds */
  }
}
