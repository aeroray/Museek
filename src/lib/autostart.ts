const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

/** Sync the OS login-item / startup entry with the user preference. */
export async function syncOpenAtLogin(enabled: boolean): Promise<void> {
  if (!isTauri) return
  try {
    const { enable, disable, isEnabled } = await import("@tauri-apps/plugin-autostart")
    const currently = await isEnabled()
    if (enabled && !currently) await enable()
    else if (!enabled && currently) await disable()
  } catch {
    /* plugin missing / unsupported platform */
  }
}
