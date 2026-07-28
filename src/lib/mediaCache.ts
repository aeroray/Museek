import { looksLikeNonAudioBytes } from "@/lib/audioBytes"
import { readData, writeData } from "@/lib/db"
import type { LyricInfo, Quality, Source } from "@/types/music"

// On-disk cache for audio + lyrics, living under $APPDATA/museek/cache/. A small
// JSON index (sizes + last-used timestamps) lets us report the total size and
// evict least-recently-used audio when over the limit — without stat()ing files.
// Tauri-only: in the browser preview these are no-ops (binary disk cache isn't
// feasible via localStorage). Cover images are handled by the WebView's own HTTP
// cache, so they aren't tracked here.

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

type EntryType = "audio" | "lyric"
interface CacheEntry {
  key: string
  path: string // relative to AppData
  size: number
  lastUsed: number
  type: EntryType
}

const INDEX_FILE = "cacheIndex.json"
const AUDIO_DIR = "museek/cache/audio"
const LYRIC_DIR = "museek/cache/lyrics"

let index: CacheEntry[] = []
let loaded = false

async function ensureLoaded() {
  if (loaded) return
  index = await readData<CacheEntry[]>(INDEX_FILE, [])
  loaded = true
}
function persistIndex() {
  writeData(INDEX_FILE, index)
}
function upsert(key: string, path: string, size: number, type: EntryType) {
  const existing = index.find((e) => e.key === key)
  if (existing) {
    existing.path = path
    existing.size = size
    existing.lastUsed = Date.now()
  } else {
    index.push({ key, path, size, lastUsed: Date.now(), type })
  }
  persistIndex()
}

function safe(s: string) {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_")
}

// ---------- size / clearing ----------
export async function getCacheBytes(): Promise<number> {
  await ensureLoaded()
  return index.reduce((s, e) => s + e.size, 0)
}

export async function clearCache(): Promise<void> {
  await ensureLoaded()
  if (isTauri) {
    try {
      const { remove, exists, BaseDirectory } = await import("@tauri-apps/plugin-fs")
      if (await exists("museek/cache", { baseDir: BaseDirectory.AppData })) {
        await remove("museek/cache", { baseDir: BaseDirectory.AppData, recursive: true })
      }
    } catch {
      /* ignore */
    }
  }
  index = []
  persistIndex()
}

// Evict least-recently-used AUDIO entries until under the limit (lyrics are tiny
// and kept). Called after each audio write and on startup.
export async function enforceLimit(maxBytes: number): Promise<void> {
  if (!isTauri) return
  await ensureLoaded()
  let total = index.reduce((s, e) => s + e.size, 0)
  if (total <= maxBytes) return
  const { remove, BaseDirectory } = await import("@tauri-apps/plugin-fs")
  const evictable = index.filter((e) => e.type === "audio").sort((a, b) => a.lastUsed - b.lastUsed)
  for (const e of evictable) {
    if (total <= maxBytes) break
    try {
      await remove(e.path, { baseDir: BaseDirectory.AppData })
    } catch {
      /* file may already be gone */
    }
    index = index.filter((x) => x.key !== e.key)
    total -= e.size
  }
  persistIndex()
}

// ---------- lyrics ----------
export async function getCachedLyric(source: Source, songId: string): Promise<LyricInfo | null> {
  if (!isTauri) return null
  await ensureLoaded()
  const entry = index.find((e) => e.key === `lyric:${source}:${songId}`)
  if (!entry) return null
  try {
    const { readTextFile, BaseDirectory } = await import("@tauri-apps/plugin-fs")
    const text = await readTextFile(entry.path, { baseDir: BaseDirectory.AppData })
    entry.lastUsed = Date.now()
    persistIndex()
    return JSON.parse(text) as LyricInfo
  } catch {
    return null
  }
}

export async function putCachedLyric(source: Source, songId: string, data: LyricInfo): Promise<void> {
  if (!isTauri) return
  await ensureLoaded()
  try {
    const { writeTextFile, mkdir, BaseDirectory } = await import("@tauri-apps/plugin-fs")
    await mkdir(LYRIC_DIR, { baseDir: BaseDirectory.AppData, recursive: true })
    const path = `${LYRIC_DIR}/${source}_${safe(songId)}.json`
    const json = JSON.stringify(data)
    await writeTextFile(path, json, { baseDir: BaseDirectory.AppData })
    upsert(`lyric:${source}:${songId}`, path, json.length, "lyric")
  } catch {
    /* cache write best-effort */
  }
}

// ---------- audio ----------

async function dropCacheEntry(key: string, path: string): Promise<void> {
  try {
    const { remove, BaseDirectory } = await import("@tauri-apps/plugin-fs")
    await remove(path, { baseDir: BaseDirectory.AppData })
  } catch {
    /* file may already be gone */
  }
  index = index.filter((e) => e.key !== key)
  persistIndex()
}

/**
 * Qualities already on disk for a song (best → worst). Used when preferred
 * quality isn't cached but a higher/other tier is (e.g. flac after switching
 * play quality down to 320k).
 */
export async function listCachedAudioQualities(
  source: Source,
  songId: string,
): Promise<Quality[]> {
  if (!isTauri) return []
  await ensureLoaded()
  const prefix = `audio:${source}:${songId}:`
  const found = new Set<string>()
  for (const e of index) {
    if (e.type !== "audio" || !e.key.startsWith(prefix)) continue
    found.add(e.key.slice(prefix.length))
  }
  const ladder: Quality[] = ["flac24bit", "flac", "320k", "128k"]
  return ladder.filter((q) => found.has(q))
}

/**
 * Playable URL for a cached audio file, or null on miss.
 * Streams via asset protocol (same as local music) — no full-file IPC → Blob.
 */
export async function getCachedAudioUrl(
  source: Source,
  songId: string,
  quality: Quality,
): Promise<string | null> {
  if (!isTauri) return null
  await ensureLoaded()
  const key = `audio:${source}:${songId}:${quality}`
  const entry = index.find((e) => e.key === key)
  if (!entry) return null
  try {
    const { open, exists, BaseDirectory } = await import("@tauri-apps/plugin-fs")
    const { appDataDir, join } = await import("@tauri-apps/api/path")
    const { convertFileSrc } = await import("@tauri-apps/api/core")

    if (!(await exists(entry.path, { baseDir: BaseDirectory.AppData }))) {
      index = index.filter((e) => e.key !== key)
      persistIndex()
      return null
    }

    // Sniff head only — drop corrupt cache (e.g. HTML 403 pages stored as .mp3).
    const file = await open(entry.path, { baseDir: BaseDirectory.AppData })
    let corrupt = false
    try {
      const buf = new Uint8Array(512)
      const n = await file.read(buf)
      const head = n && n > 0 ? buf.subarray(0, n) : new Uint8Array(0)
      corrupt = looksLikeNonAudioBytes(head)
    } finally {
      await file.close().catch(() => {})
    }
    if (corrupt) {
      await dropCacheEntry(key, entry.path)
      return null
    }

    entry.lastUsed = Date.now()
    persistIndex()
    return convertFileSrc(await join(await appDataDir(), entry.path))
  } catch {
    return null
  }
}

export async function putCachedAudio(
  source: Source,
  songId: string,
  quality: Quality,
  bytes: Uint8Array,
  ext: string,
  maxBytes: number,
): Promise<void> {
  if (!isTauri) return
  await ensureLoaded()
  try {
    const { writeFile, mkdir, BaseDirectory } = await import("@tauri-apps/plugin-fs")
    await mkdir(AUDIO_DIR, { baseDir: BaseDirectory.AppData, recursive: true })
    const path = `${AUDIO_DIR}/${source}_${safe(songId)}_${quality}.${ext}`
    await writeFile(path, bytes, { baseDir: BaseDirectory.AppData })
    upsert(`audio:${source}:${songId}:${quality}`, path, bytes.length, "audio")
    await enforceLimit(maxBytes)
  } catch {
    /* cache write best-effort */
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  const units = ["KB", "MB", "GB", "TB"]
  let i = -1
  let v = n
  do {
    v /= 1024
    i++
  } while (v >= 1024 && i < units.length - 1)
  return `${v.toFixed(1)} ${units[i]}`
}
