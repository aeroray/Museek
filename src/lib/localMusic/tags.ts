import * as md5Lib from "js-md5"
import { parseBuffer } from "music-metadata"
import { formatDuration } from "@/lib/utils"
import { indexQualitySizes } from "@/lib/quality"
import { t } from "@/lib/i18n"
import type { MusicInfo, MusicQuality, Quality } from "@/types/music"

// js-md5 CommonJS/ESM interop
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const md5 = ((md5Lib as any).default ?? md5Lib) as (str: string) => string

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

export const LOCAL_AUDIO_EXTS = new Set(["mp3", "flac", "m4a", "ogg", "wav", "aac"])

export function localTrackId(filePath: string): string {
  return `local_${md5(filePath.replace(/\\/g, "/").toLowerCase())}`
}

export function extOf(path: string): string {
  const base = path.split(/[/\\]/).pop() ?? ""
  const i = base.lastIndexOf(".")
  return i >= 0 ? base.slice(i + 1).toLowerCase() : ""
}

export function isLocalAudioPath(path: string): boolean {
  return LOCAL_AUDIO_EXTS.has(extOf(path))
}

function basenameNoExt(path: string): string {
  const base = path.split(/[/\\]/).pop() ?? path
  return base.replace(/\.[^.]+$/, "")
}

/** Guess "Artist - Title" from filename. */
export function guessFromFilename(path: string): { name: string; singer: string } {
  const raw = basenameNoExt(path).trim()
  const parts = raw.split(/\s[-–—]\s/).map((s) => s.trim()).filter(Boolean)
  if (parts.length >= 2) {
    return { singer: parts[0], name: parts.slice(1).join(" - ") }
  }
  return { name: raw || t("local.unknownTitle"), singer: "" }
}

function qualityForExt(ext: string): MusicQuality[] {
  const type: Quality = ext === "flac" ? "flac" : ext === "wav" ? "flac" : "320k"
  return [{ type, size: null }]
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

async function saveEmbeddedCover(
  id: string,
  data: Uint8Array,
  format?: string
): Promise<{ rel: string; picUrl: string } | null> {
  if (!isTauri || !data.length) return null
  try {
    const { writeFile, mkdir, BaseDirectory } = await import("@tauri-apps/plugin-fs")
    const { appDataDir, join } = await import("@tauri-apps/api/path")
    const { convertFileSrc } = await import("@tauri-apps/api/core")
    const ext = format?.includes("png") ? "png" : "jpg"
    await mkdir("museek/localCovers", { baseDir: BaseDirectory.AppData, recursive: true })
    const rel = `museek/localCovers/${id}.${ext}`
    await writeFile(rel, data, { baseDir: BaseDirectory.AppData })
    const abs = await join(await appDataDir(), rel)
    return { rel, picUrl: convertFileSrc(abs) }
  } catch {
    return null
  }
}

/** Rebuild convertFileSrc URL for a stored relative cover path. */
export async function resolveLocalCoverUrl(rel: string | undefined): Promise<string | null> {
  if (!rel || !isTauri) return null
  try {
    const { appDataDir, join } = await import("@tauri-apps/api/path")
    const { convertFileSrc } = await import("@tauri-apps/api/core")
    const { exists, BaseDirectory } = await import("@tauri-apps/plugin-fs")
    if (!(await exists(rel, { baseDir: BaseDirectory.AppData }))) return null
    return convertFileSrc(await join(await appDataDir(), rel))
  } catch {
    return null
  }
}

export interface ParsedLocalTags {
  name: string
  singer: string
  albumName: string
  interval: string
  qualitys: MusicQuality[]
  localCoverRel?: string
  picUrl?: string | null
  /** True when title/artist came from tags (not filename/placeholder). */
  hasTitleTag: boolean
  hasArtistTag: boolean
  hasAlbumTag: boolean
  hasCover: boolean
}

/**
 * Read tags from a local audio file. Falls back to filename / placeholders.
 */
export async function parseLocalFile(filePath: string, id: string): Promise<ParsedLocalTags> {
  const ext = extOf(filePath)
  const guessed = guessFromFilename(filePath)
  const qualitys = qualityForExt(ext)
  const placeholderTitle = t("local.unknownTitle")
  const placeholderArtist = t("local.unknownArtist")

  let name = ""
  let singer = ""
  let albumName = ""
  let interval = "0:00"
  let localCoverRel: string | undefined
  let picUrl: string | null = null
  let hasTitleTag = false
  let hasArtistTag = false
  let hasAlbumTag = false
  let hasCover = false

  if (isTauri) {
    try {
      const { readFile } = await import("@tauri-apps/plugin-fs")
      const bytes = await readFile(filePath)
      const meta = await parseBuffer(bytes, { mimeType: mimeForExt(ext), size: bytes.byteLength })
      const common = meta.common
      if (common.title?.trim()) {
        name = common.title.trim()
        hasTitleTag = true
      }
      const artists = (common.artists?.length ? common.artists : common.artist ? [common.artist] : [])
        .map((a) => a?.trim())
        .filter(Boolean) as string[]
      if (artists.length) {
        singer = artists.join("、")
        hasArtistTag = true
      }
      if (common.album?.trim()) {
        albumName = common.album.trim()
        hasAlbumTag = true
      }
      const dur = meta.format.duration
      if (typeof dur === "number" && dur > 0) interval = formatDuration(dur)

      const pic = common.picture?.[0]
      if (pic?.data?.length) {
        const data = pic.data instanceof Uint8Array ? pic.data : new Uint8Array(pic.data)
        const saved = await saveEmbeddedCover(id, data, pic.format)
        if (saved) {
          localCoverRel = saved.rel
          picUrl = saved.picUrl
          hasCover = true
        }
      }
    } catch {
      /* fall through to filename / placeholders */
    }
  }

  if (!name) name = guessed.name || placeholderTitle
  if (!singer) singer = guessed.singer || placeholderArtist
  if (!name.trim()) name = placeholderTitle
  if (!singer.trim()) singer = placeholderArtist

  return {
    name,
    singer,
    albumName,
    interval,
    qualitys,
    localCoverRel,
    picUrl,
    hasTitleTag,
    hasArtistTag,
    hasAlbumTag,
    hasCover,
  }
}

export function buildLocalSong(
  id: string,
  filePath: string,
  tags: ParsedLocalTags
): MusicInfo {
  const _qualitys = indexQualitySizes(tags.qualitys)
  return {
    id,
    name: tags.name,
    singer: tags.singer,
    source: "local",
    interval: tags.interval,
    albumName: tags.albumName,
    meta: {
      songId: id,
      albumId: "",
      picUrl: tags.picUrl ?? null,
      qualitys: tags.qualitys,
      _qualitys,
      filePath,
      localCoverRel: tags.localCoverRel,
    },
  }
}
