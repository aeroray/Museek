import { invoke } from "@tauri-apps/api/core"

// Ask the OS to keep the system awake (but allow the display to sleep / lock)
// while music is playing. Backed by the `set_prevent_sleep` Rust command
// (Windows: ES_SYSTEM_REQUIRED; macOS: `caffeinate -i`). No-ops outside the
// Tauri webview and de-dupes redundant calls so it can be invoked freely from
// the frequent audio time-update handler.

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
let lastSent: boolean | null = null

export function setPreventSleep(enabled: boolean): void {
  if (!isTauri) return
  if (lastSent === enabled) return
  lastSent = enabled
  invoke("set_prevent_sleep", { enabled }).catch(() => {
    // Best-effort: clear the dedupe so a later state change retries.
    lastSent = null
  })
}

// Show or hide the system tray icon. Only shown in "hide to tray" close mode, so
// users who pick "quit on close" don't get an unexpected tray icon. Idempotent.
export function setTrayVisible(visible: boolean): void {
  if (!isTauri) return
  invoke("set_tray_visible", { visible }).catch(() => {})
}
