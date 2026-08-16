import type { Window } from "@tauri-apps/api/window"
import type { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi"

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

type SavedChrome = {
  size: PhysicalSize
  position: PhysicalPosition
  maximized: boolean
}

/** Snapshot taken right before lyrics immersive fullscreen. */
let saved: SavedChrome | null = null
/** True while we own an immersive fullscreen session from the lyrics page. */
let sessionActive = false
/** Coalesce overlapping exits so a second close cannot skip the restore wait. */
let exitInFlight: Promise<void> | null = null

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function sizeCloseEnough(
  a: PhysicalSize,
  b: PhysicalSize,
  slop = 12,
): boolean {
  return Math.abs(a.width - b.width) <= slop && Math.abs(a.height - b.height) <= slop
}

async function waitUntil(
  predicate: () => Promise<boolean>,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return
    await sleep(32)
  }
}

async function getWin(): Promise<Window | null> {
  if (!isTauri) return null
  const { getCurrentWindow } = await import("@tauri-apps/api/window")
  return getCurrentWindow()
}

export function isLyricsFullscreenSession(): boolean {
  return sessionActive
}

/** Enter OS fullscreen after remembering the current window geometry. */
export async function enterLyricsFullscreen(): Promise<boolean> {
  const win = await getWin()
  if (!win) return false
  if (await win.isFullscreen()) {
    sessionActive = true
    return true
  }
  saved = {
    size: await win.outerSize(),
    position: await win.outerPosition(),
    maximized: await win.isMaximized(),
  }
  sessionActive = true
  await win.setFullscreen(true)
  document.documentElement.dataset.maximized = "true"
  return true
}

/**
 * Leave fullscreen and restore the pre-immersive size/position.
 * Resolves only after the window is no longer fullscreen and (when we have a
 * snapshot) after outer size matches the restored geometry — or a timeout.
 * Safe to call when not in a lyrics fullscreen session (no-op).
 */
export async function exitLyricsFullscreen(): Promise<void> {
  if (exitInFlight) return exitInFlight
  exitInFlight = doExitLyricsFullscreen().finally(() => {
    exitInFlight = null
  })
  return exitInFlight
}

async function doExitLyricsFullscreen(): Promise<void> {
  if (!sessionActive && !saved) {
    const win = await getWin()
    if (win && (await win.isFullscreen())) await win.setFullscreen(false)
    return
  }

  const win = await getWin()
  if (!win) {
    saved = null
    sessionActive = false
    return
  }

  const snapshot = saved
  saved = null
  sessionActive = false

  try {
    if (await win.isFullscreen()) {
      await win.setFullscreen(false)
      await waitUntil(async () => !(await win.isFullscreen()), 900)
    }
  } catch {
    /* ignore */
  }

  if (!snapshot) {
    document.documentElement.dataset.maximized = (await win.isMaximized()) ? "true" : "false"
    return
  }

  try {
    if (snapshot.maximized) {
      await win.maximize()
      document.documentElement.dataset.maximized = "true"
      await waitUntil(async () => await win.isMaximized(), 700)
    } else {
      // Unmaximize first in case fullscreen left us maximized-ish on some platforms.
      if (await win.isMaximized()) await win.unmaximize()
      await win.setSize(snapshot.size)
      await win.setPosition(snapshot.position)
      document.documentElement.dataset.maximized = "false"
      await waitUntil(async () => {
        if (await win.isFullscreen()) return false
        return sizeCloseEnough(await win.outerSize(), snapshot.size)
      }, 900)
    }
    await sleep(48)
  } catch {
    document.documentElement.dataset.maximized = (await win.isMaximized()) ? "true" : "false"
  }
}

/** Sync React UI when the user exits fullscreen via OS (Esc / system UI). */
export async function syncLyricsFullscreenState(): Promise<boolean> {
  const win = await getWin()
  if (!win) return false
  const fs = await win.isFullscreen()
  if (!fs && sessionActive) {
    // OS exited fullscreen — restore geometry from our snapshot.
    await exitLyricsFullscreen()
    return false
  }
  return fs && sessionActive
}
