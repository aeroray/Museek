import { BaseDirectory, exists } from "@tauri-apps/plugin-fs"
import { readData, writeData } from "@/lib/db"

const LS_KEY = "museek.whatsNew.seenVersion"
const SEEN_FILE = "whats-new-seen.json"
const LAST_RUN_FILE = "whats-new-last-run.json"

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

type VersionFile = { version: string }

function normalize(version: string): string {
  return version.replace(/^v/i, "").trim()
}

async function readVersionFile(filename: string): Promise<string | null> {
  const data = await readData<VersionFile | null>(filename, null)
  if (data?.version && normalize(data.version)) return normalize(data.version)
  return null
}

async function writeVersionFile(filename: string, version: string): Promise<void> {
  await writeData(filename, { version: normalize(version) })
}

/** True when AppData already has user content — not a brand-new install. */
async function hasPriorUserData(): Promise<boolean> {
  if (!isTauri) return false
  try {
    if (await exists("museek/playlists.json", { baseDir: BaseDirectory.AppData })) {
      const data = await readData<{
        favorites?: unknown[]
        userLists?: unknown[]
        favoritePlaylists?: unknown[]
      } | null>("playlists.json", null)
      if (
        (data?.favorites && data.favorites.length > 0) ||
        (data?.userLists && data.userLists.length > 0) ||
        (data?.favoritePlaylists && data.favoritePlaylists.length > 0)
      ) {
        return true
      }
    }
    if (await exists("museek/sources.json", { baseDir: BaseDirectory.AppData })) {
      const scripts = await readData<unknown[]>("sources.json", [])
      if (scripts.length > 0) return true
    }
    if (await exists("museek/searchHistory.json", { baseDir: BaseDirectory.AppData })) {
      const history = await readData<unknown[]>("searchHistory.json", [])
      if (history.length > 0) return true
    }
  } catch {
    /* ignore */
  }
  return false
}

/** Last version whose What's New dialog was dismissed (device-local, not synced). */
export async function getSeenVersion(): Promise<string | null> {
  const fromDisk = await readVersionFile(SEEN_FILE)
  if (fromDisk) {
    try {
      localStorage.setItem(LS_KEY, fromDisk)
    } catch {
      /* ignore */
    }
    return fromDisk
  }

  // Migrate legacy localStorage-only marker (survives poorly across some Mac updates).
  try {
    const ls = localStorage.getItem(LS_KEY)
    if (ls && normalize(ls)) {
      const v = normalize(ls)
      await writeVersionFile(SEEN_FILE, v)
      return v
    }
  } catch {
    /* ignore */
  }
  return null
}

export async function setSeenVersion(version: string): Promise<void> {
  const v = normalize(version)
  await writeVersionFile(SEEN_FILE, v)
  await writeVersionFile(LAST_RUN_FILE, v)
  try {
    localStorage.setItem(LS_KEY, v)
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Show What's New after an upgrade.
 *
 * Uses AppData (not only localStorage) so Mac in-app updates that reset the
 * WebView store still detect the version bump via last-run / user data.
 *
 * Fresh install: quietly record the current version and stay quiet.
 * Until the user dismisses, last-run stays on the previous version so remounts
 * still show the dialog.
 */
export async function shouldShowWhatsNew(currentVersion: string): Promise<boolean> {
  const current = normalize(currentVersion)
  if (!current) return false

  let lastRun = await readVersionFile(LAST_RUN_FILE)
  const seenOnDisk = await readVersionFile(SEEN_FILE)
  const seen = await getSeenVersion()

  // First build that introduced AppData markers: seed last-run from legacy seen.
  if (!lastRun && seen) {
    // Legacy localStorage-only "seen" can be wrong after a Mac update that
    // treated the launch as a fresh install. If AppData still has user data
    // and we've never written an AppData dismiss marker, show notes once.
    if (!seenOnDisk && (await hasPriorUserData())) {
      return true
    }
    await writeVersionFile(LAST_RUN_FILE, seen)
    lastRun = seen
  }

  if (!lastRun) {
    // No markers at all. If AppData already has real user content, this is an
    // upgrade whose WebView storage was wiped — show notes. Otherwise first run.
    if (await hasPriorUserData()) {
      return seen !== current
    }
    await writeVersionFile(LAST_RUN_FILE, current)
    await setSeenVersion(current)
    return false
  }

  if (lastRun !== current) {
    // Upgrade: show until dismissed for this version.
    return seen !== current
  }

  return false
}
