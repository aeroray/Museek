import { parseBuffer } from "music-metadata"
import type { LyricInfo } from "@/types/music"

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

const LRC_TIME_RX = /\[\d{1,2}:\d{2}[.:]\d{1,3}\]/

function extOf(path: string): string {
  const base = path.split(/[/\\]/).pop() ?? ""
  const i = base.lastIndexOf(".")
  return i >= 0 ? base.slice(i + 1).toLowerCase() : ""
}

function mimeForExt(ext: string): string {
  switch (ext) {
    case "flac":
      return "audio/flac"
    case "m4a":
    case "aac":
      return "audio/mp4"
    case "ogg":
      return "audio/ogg"
    case "wav":
      return "audio/wav"
    default:
      return "audio/mpeg"
  }
}

function formatLrcTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds - m * 60
  const whole = Math.floor(s)
  const cs = Math.round((s - whole) * 100)
  return `[${String(m).padStart(2, "0")}:${String(whole).padStart(2, "0")}.${String(cs).padStart(2, "0")}]`
}

/** Convert music-metadata synchronized lyric lines into LRC text. */
function syncTextToLrc(syncText: Array<{ text: string; timestamp?: number }>): string | null {
  if (!syncText.length) return null
  // music-metadata exposes ID3 timestamps in milliseconds for common cases.
  const lines: string[] = []
  for (const row of syncText) {
    const text = row.text?.trim()
    if (!text) continue
    const seconds = (row.timestamp ?? 0) / 1000
    lines.push(`${formatLrcTime(Math.max(0, seconds))}${text}`)
  }
  return lines.length ? lines.join("\n") : null
}

type LyricsTagLike = {
  text?: string
  syncText?: Array<{ text: string; timestamp?: number }>
  timeStampFormat?: number
}

/** Prefer timed LRC / sync lyrics from tag payloads; skip untimed plain text. */
export function lyricTextFromTags(lyrics: LyricsTagLike[] | undefined): string | null {
  if (!lyrics?.length) return null

  for (const tag of lyrics) {
    const text = tag.text?.trim()
    if (text && LRC_TIME_RX.test(text)) return text
  }

  for (const tag of lyrics) {
    const synced = syncTextToLrc(tag.syncText ?? [])
    if (synced) return synced
  }

  return null
}

/** Same-name sidecar next to the audio file: `Song.flac` → `Song.lrc`. */
export async function readSiblingLrc(filePath: string): Promise<string | null> {
  if (!isTauri) return null
  try {
    const { readTextFile, exists } = await import("@tauri-apps/plugin-fs")
    const base = filePath.replace(/\.[^.\\/]+$/, "")
    const candidates = [`${base}.lrc`, `${base}.LRC`]
    for (const path of candidates) {
      if (!(await exists(path))) continue
      const text = (await readTextFile(path)).trim()
      if (text) return text
    }
  } catch {
    /* ignore */
  }
  return null
}

/** Re-read embedded timed lyrics from an audio file (for older library entries). */
export async function readEmbeddedLyric(filePath: string): Promise<string | null> {
  if (!isTauri) return null
  try {
    const ext = extOf(filePath)
    const { readFile } = await import("@tauri-apps/plugin-fs")
    const bytes = await readFile(filePath)
    const meta = await parseBuffer(
      bytes,
      { mimeType: mimeForExt(ext), size: bytes.byteLength },
      { skipCovers: true }
    )
    return lyricTextFromTags(meta.common.lyrics as LyricsTagLike[] | undefined)
  } catch {
    return null
  }
}

/**
 * Local lyric sources in priority order: sidecar .lrc → stored/embedded tags.
 * Untimed plain text is ignored so NetEase can still supply synced lines.
 */
export async function fetchLocalFileLyric(opts: {
  filePath?: string
  embeddedLyric?: string | null
}): Promise<LyricInfo | null> {
  const { filePath, embeddedLyric } = opts
  if (filePath) {
    const sidecar = await readSiblingLrc(filePath)
    if (sidecar) return { lyric: sidecar }
  }

  const fromMeta = embeddedLyric?.trim()
  if (fromMeta && LRC_TIME_RX.test(fromMeta)) return { lyric: fromMeta }

  if (filePath && !fromMeta) {
    const embedded = await readEmbeddedLyric(filePath)
    if (embedded) return { lyric: embedded }
  }

  return null
}
