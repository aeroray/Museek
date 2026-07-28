const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

/**
 * Bump when login-item argv changes (e.g. added `--autostart` for silent tray).
 * Stale installs are refreshed once on next launch — users never need to toggle.
 */
const AUTOSTART_ARGS_VERSION = 1
const ARGS_VERSION_KEY = "museek.autostartArgsVersion"

function storedArgsVersion(): number {
  const n = Number(localStorage.getItem(ARGS_VERSION_KEY) || 0)
  return Number.isFinite(n) ? n : 0
}

function markArgsVersion(): void {
  localStorage.setItem(ARGS_VERSION_KEY, String(AUTOSTART_ARGS_VERSION))
}

/**
 * Sync the OS login-item / startup entry with the user preference.
 * After an upgrade that changes startup args, re-registers once automatically.
 */
export async function syncOpenAtLogin(enabled: boolean): Promise<void> {
  if (!isTauri) return
  try {
    const { enable, disable, isEnabled } = await import("@tauri-apps/plugin-autostart")
    const currently = await isEnabled()
    const needsArgsRefresh = storedArgsVersion() < AUTOSTART_ARGS_VERSION

    if (enabled) {
      if (!currently) {
        await enable()
        markArgsVersion()
        return
      }
      // Already registered under an older build (no `--autostart`, etc.) —
      // rewrite the login item once so silent tray works without a manual toggle.
      if (needsArgsRefresh) {
        await disable()
        await enable()
        markArgsVersion()
      }
    } else if (currently) {
      await disable()
    }
  } catch {
    /* plugin missing / unsupported platform */
  }
}
