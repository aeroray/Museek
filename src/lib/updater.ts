import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater"
import { relaunch } from "@tauri-apps/plugin-process"

export type UpdateInfo = {
  version: string
  currentVersion: string
  body?: string
}

export type DownloadProgress = {
  /** 0–100 while known; null while total size is unknown */
  percent: number | null
  downloaded: number
  total: number | null
}

let cached: Update | null = null

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

function toInfo(update: Update): UpdateInfo {
  return {
    version: update.version,
    currentVersion: update.currentVersion,
    body: update.body,
  }
}

/** Check GitHub latest.json via tauri-plugin-updater. Returns null when up to date. */
export async function checkForAppUpdate(): Promise<UpdateInfo | null> {
  if (!isTauri()) return null
  // Drop a previous handle so we don't leak resources across checks.
  if (cached) {
    try {
      await cached.close()
    } catch {
      /* ignore */
    }
    cached = null
  }
  const update = await check()
  if (!update) return null
  cached = update
  return toInfo(update)
}

function progressFromEvents(
  onProgress?: (p: DownloadProgress) => void,
): (event: DownloadEvent) => void {
  let downloaded = 0
  let total: number | null = null
  return (event) => {
    if (event.event === "Started") {
      total = event.data.contentLength ?? null
      downloaded = 0
    } else if (event.event === "Progress") {
      downloaded += event.data.chunkLength
    } else if (event.event === "Finished") {
      if (total != null) downloaded = total
    }
    onProgress?.({
      downloaded,
      total,
      percent: total && total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : null,
    })
  }
}

/** Download, verify signature, install, then relaunch. Uses the last check() result. */
export async function installAppUpdate(
  onProgress?: (p: DownloadProgress) => void,
): Promise<void> {
  if (!isTauri()) throw new Error("Updater is only available in the desktop app")
  const update = cached ?? (await check())
  if (!update) throw new Error("No update available")
  cached = update
  await update.downloadAndInstall(progressFromEvents(onProgress))
  await relaunch()
}

export const RELEASES_URL = "https://github.com/aeroray/Museek/releases/latest"
