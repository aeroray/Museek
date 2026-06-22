import { readData, writeData } from "@/lib/db"

// Import/export of all user config as one JSON file, so it can be synced across
// devices. Covers the db.ts JSON files (settings, sources, favorites, history,
// platform order/selection) plus the direct-localStorage prefs (language, theme,
// sidebar, lyric font). Deliberately excludes the on-disk audio/lyric cache and
// downloaded files — those are device-local and large.

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

const DB_FILES = [
  "settings.json",
  "sources.json",
  "playlists.json",
  "searchHistory.json",
  "platformOrder.json",
  "searchPlatform.json",
] as const

const LS_KEYS = [
  "museek.lang",
  "museek.theme.mode",
  "museek.theme.palette",
  "museek.sidebarCollapsed",
  "museek.lyricFontScale",
] as const

// Settings specific to THIS device that must never travel via sync: the sync
// folder path, the stored passphrase, the auto-backup flag, the last-synced
// timestamp, and the download location (Windows/macOS paths differ, so it's
// per-device). Stripped on export; preserved (not overwritten) on import.
const DEVICE_LOCAL_SETTINGS = ["syncFolder", "syncPassphrase", "autoBackupOnExit", "syncLastAt", "downloadDir"]

export interface MuseekConfig {
  app: "museek"
  version: number
  exportedAt: string
  data: Record<string, unknown>
  prefs: Record<string, string>
}

export function isValidConfig(parsed: unknown): parsed is MuseekConfig {
  return (
    !!parsed &&
    typeof parsed === "object" &&
    (parsed as MuseekConfig).app === "museek" &&
    typeof (parsed as MuseekConfig).data === "object"
  )
}

export async function gatherConfig(): Promise<MuseekConfig> {
  const data: Record<string, unknown> = {}
  for (const f of DB_FILES) {
    const v = await readData<unknown>(f, null)
    if (v === null || v === undefined) continue
    if (f === "settings.json" && typeof v === "object") {
      const clone = { ...(v as Record<string, unknown>) }
      for (const k of DEVICE_LOCAL_SETTINGS) delete clone[k]
      data[f] = clone
    } else {
      data[f] = v
    }
  }
  const prefs: Record<string, string> = {}
  for (const k of LS_KEYS) {
    const v = localStorage.getItem(k)
    if (v !== null) prefs[k] = v
  }
  return { app: "museek", version: 1, exportedAt: new Date().toISOString(), data, prefs }
}

// Write all imported data back. The caller should reload the app afterwards so
// every store re-initializes from the new data.
export async function applyConfig(config: MuseekConfig): Promise<void> {
  for (const f of DB_FILES) {
    if (!(f in config.data)) continue
    if (f === "settings.json") {
      // Merge: take the incoming settings but keep THIS device's sync-local keys
      // so a restore never adopts the source device's folder/passphrase/timestamp.
      const incoming = (config.data[f] ?? {}) as Record<string, unknown>
      const current = (await readData<Record<string, unknown>>("settings.json", {})) ?? {}
      const merged: Record<string, unknown> = { ...incoming }
      for (const k of DEVICE_LOCAL_SETTINGS) {
        if (k in current) merged[k] = current[k]
      }
      await writeData(f, merged)
    } else {
      await writeData(f, config.data[f])
    }
  }
  if (config.prefs && typeof config.prefs === "object") {
    for (const k of LS_KEYS) {
      if (k in config.prefs) localStorage.setItem(k, String(config.prefs[k]))
    }
  }
}

const FILE_NAME = "museek-config.json"

// Save the config JSON to a user-chosen location (Tauri dialog) or trigger a
// browser download.
export async function saveConfigFile(json: string): Promise<boolean> {
  if (isTauri) {
    const { save } = await import("@tauri-apps/plugin-dialog")
    const path = await save({ defaultPath: FILE_NAME, filters: [{ name: "JSON", extensions: ["json"] }] })
    if (!path) return false
    const { writeTextFile } = await import("@tauri-apps/plugin-fs")
    await writeTextFile(path, json)
    return true
  }
  const blob = new Blob([json], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = FILE_NAME
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}

// Let the user pick a config file and return its text (null if cancelled).
export async function pickConfigFile(): Promise<string | null> {
  if (isTauri) {
    const { open } = await import("@tauri-apps/plugin-dialog")
    const path = await open({ multiple: false, filters: [{ name: "JSON", extensions: ["json"] }] })
    if (typeof path !== "string") return null
    const { readTextFile } = await import("@tauri-apps/plugin-fs")
    return await readTextFile(path)
  }
  return new Promise((resolve) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "application/json,.json"
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => resolve(null)
      reader.readAsText(file)
    }
    input.click()
  })
}
