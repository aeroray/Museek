import { listen } from "@tauri-apps/api/event"
import { invoke } from "@tauri-apps/api/core"
import { t } from "@/lib/i18n"
import { notify } from "@/lib/notify"
import { extOf } from "@/lib/localMusic"
import { useLocalMusicStore } from "@/stores/localMusicStore"
import { usePlayerStore } from "@/stores/playerStore"
import type { MusicInfo } from "@/types/music"

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

let started = false
let importing = false
const pendingBatches: string[][] = []

function pathKey(filePath: string): string {
  return filePath.replace(/\\/g, "/").toLowerCase()
}

/** Resolve opened paths to library songs, preserving open order. */
function songsForPaths(paths: string[]): MusicInfo[] {
  const byPath = new Map(
    useLocalMusicStore.getState().tracks.map((t) => [pathKey(t.filePath), t])
  )
  const songs: MusicInfo[] = []
  for (const p of paths) {
    const track = byPath.get(pathKey(p))
    if (track?.song && !track.unavailable) songs.push(track.song)
  }
  return songs
}

/** Play opened files like a dedicated player: replace queue, start at the first file. */
function playOpenedSongs(songs: MusicInfo[]) {
  if (!songs.length) return
  const player = usePlayerStore.getState()
  player.clearQueue()
  player.addToQueue(songs)
  void player.play(songs[0])
}

function notifyUnsupportedPaths(paths: string[]) {
  if (!paths.length) return
  const formats = [
    ...new Set(
      paths
        .map((p) => extOf(p))
        .filter(Boolean)
        .map((e) => `.${e}`)
    ),
  ]
  notify({
    message: t("local.openUnsupported", {
      formats: formats.length ? formats.join(" / ") : t("local.openUnsupportedGeneric"),
    }),
    variant: "error",
  })
}

async function importOpenedPaths(paths: string[]) {
  if (paths.length) pendingBatches.push(paths)
  if (importing) return
  importing = true
  try {
    // One OS open = one batch. Do not flatten concurrent opens into one list —
    // otherwise "open A, then open B" would play A (first) instead of B (latest).
    while (pendingBatches.length) {
      const batch = pendingBatches.shift()!
      const unique = [...new Set(batch)]
      if (!unique.length) continue
      try {
        const n = await useLocalMusicStore.getState().importPaths(unique)
        const songs = songsForPaths(unique)
        if (songs.length) {
          playOpenedSongs(songs)
          if (n > 0) {
            notify({
              message: t("local.imported", { n }),
              variant: "success",
              actionLabel: t("nav.local"),
              actionTo: "/local",
            })
          }
        } else {
          notify({
            message: t("local.openPlayFailed"),
            variant: "error",
          })
        }
      } catch (e) {
        notify({
          message: t("local.importFailed", { msg: String(e) }),
          variant: "error",
        })
      }
    }
  } finally {
    importing = false
  }
  // Paths may arrive between the last while-check and `importing = false`.
  if (pendingBatches.length) void importOpenedPaths([])
}

/** Single source of truth: drain Rust pending queue (avoids event+take double import). */
async function drainOpenedLocalFiles() {
  try {
    const paths = await invoke<string[]>("take_opened_local_files")
    if (paths?.length) await importOpenedPaths(paths)
  } catch {
    /* command missing in browser preview */
  }
}

async function drainUnsupportedOpens() {
  try {
    const paths = await invoke<string[]>("take_opened_unsupported_files")
    if (paths?.length) notifyUnsupportedPaths(paths)
  } catch {
    /* command missing in browser preview */
  }
}

/**
 * OS "Open with Museek" / file association:
 * - single-instance forwards argv into `open-local-files`
 * - import into local library, then play (Museek as a player)
 * - unsupported extensions get an explicit toast (not a silent focus-only open)
 * - cold start may queue paths before the webview listens → drain via command
 */
export function startOpenLocalFilesListener(): () => void {
  if (!isTauri || started) return () => {}
  started = true

  let unlistenFiles: (() => void) | undefined
  let unlistenUnsupported: (() => void) | undefined
  let cancelled = false

  void listen("open-local-files", () => {
    void drainOpenedLocalFiles()
  }).then((fn) => {
    if (cancelled) {
      fn()
      return
    }
    unlistenFiles = fn
    // Emit may have arrived between the initial drain and subscribe — drain again.
    void drainOpenedLocalFiles()
  })

  void listen("open-local-unsupported", () => {
    void drainUnsupportedOpens()
  }).then((fn) => {
    if (cancelled) {
      fn()
      return
    }
    unlistenUnsupported = fn
    void drainUnsupportedOpens()
  })

  // Drain anything queued before we subscribed (first launch via double-click).
  void drainOpenedLocalFiles()
  void drainUnsupportedOpens()

  return () => {
    cancelled = true
    unlistenFiles?.()
    unlistenUnsupported?.()
    started = false
  }
}
