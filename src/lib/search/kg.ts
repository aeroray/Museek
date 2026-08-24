import { httpFetch as tauriFetch } from "@/lib/http"
import type { MusicInfo, MusicQuality, SearchResult } from "@/types/music"
import { indexQualitySizes } from "@/lib/quality"
import { formatDuration } from "@/lib/utils"

// Ported from lx-music-desktop: src/renderer/utils/musicSdk/kg/musicSearch.js
// KuGou public song_search_v2 endpoint. No signing required.

interface KgSingerRaw {
  name?: string
}

interface KgSongRaw {
  SongName: string
  AlbumName: string
  AlbumID: string
  Audioid: number | string
  Singers?: KgSingerRaw[]
  Duration: number
  FileHash: string
  FileSize: number
  HQFileHash?: string
  HQFileSize?: number
  SQFileHash?: string
  SQFileSize?: number
  ResFileHash?: string
  ResFileSize?: number
  Image?: string
  /**
   * Other album/quality versions of this hit. Do not flatten into the list:
   * they share a title, and many share `Audioid`, so one favorite would light
   * up (or appear to collect) every same-name row.
   */
  Grp?: KgSongRaw[]
}

interface KgSearchResponse {
  error_code?: number
  data?: {
    total?: number
    lists?: KgSongRaw[]
  }
}

// Mirrors common/utils/common.ts sizeFormate
function sizeFormate(size: number): string {
  if (!size) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const number = Math.floor(Math.log(size) / Math.log(1024))
  return `${(size / Math.pow(1024, Math.floor(number))).toFixed(2)} ${units[number]}`
}

// Mirrors renderer/utils/index.ts decodeName (HTML entity decode)
function decodeName(str: string | null | undefined): string {
  if (!str) return ""
  try {
    return new DOMParser().parseFromString(str, "text/html").body.textContent ?? str
  } catch {
    return str
  }
}

function formatSingers(singers: KgSingerRaw[] | undefined): string {
  if (!Array.isArray(singers)) return ""
  return decodeName(
    singers
      .map((s) => s.name)
      .filter(Boolean)
      .join("、")
  )
}

function normalizeKgSong(raw: KgSongRaw): MusicInfo {
  const qualitys: MusicQuality[] = []
  if (raw.FileSize) qualitys.push({ type: "128k", size: sizeFormate(raw.FileSize) })
  if (raw.HQFileSize) qualitys.push({ type: "320k", size: sizeFormate(raw.HQFileSize) })
  if (raw.SQFileSize) qualitys.push({ type: "flac", size: sizeFormate(raw.SQFileSize) })
  if (raw.ResFileSize) qualitys.push({ type: "flac24bit", size: sizeFormate(raw.ResFileSize) })
  if (qualitys.length === 0) qualitys.push({ type: "128k", size: null })

  const _qualitys = indexQualitySizes(qualitys)

  // songId stays Audioid (lx-music songmid). Play scripts read hash + albumId.
  // MixSongID is the per-album mix id; do not use it as MusicInfo.id (would
  // split existing favorites / cache keys).
  const songId = String(raw.Audioid)

  return {
    id: `kg_${songId}`,
    name: decodeName(raw.SongName),
    singer: formatSingers(raw.Singers),
    source: "kg",
    interval: formatDuration(raw.Duration || 0),
    albumName: decodeName(raw.AlbumName),
    meta: {
      songId,
      albumId: raw.AlbumID != null ? String(raw.AlbumID) : "",
      picUrl: raw.Image ? raw.Image.replace("{size}", "240") : null,
      hash: raw.FileHash,
      qualitys,
      _qualitys,
    },
  }
}

/** One row per Audioid. Skip `Grp` (other album cuts of the same title). */
function handleResult(rawData: KgSongRaw[]): MusicInfo[] {
  const seen = new Set<string>()
  const list: MusicInfo[] = []
  for (const item of rawData) {
    const song = normalizeKgSong(item)
    if (!song.meta.songId || seen.has(song.id)) continue
    seen.add(song.id)
    list.push(song)
  }
  return list
}

export async function searchKugou(
  query: string,
  page = 1,
  limit = 30
): Promise<SearchResult> {
  const url =
    `https://songsearch.kugou.com/song_search_v2?keyword=${encodeURIComponent(query)}` +
    `&page=${page}&pagesize=${limit}&userid=0&clientver=&platform=WebFilter` +
    `&filter=2&iscorrection=1&privilege_filter=0&area_code=1`

  const res = await tauriFetch(url, {
    method: "GET",
    headers: {
      Referer: "https://www.kugou.com/",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  })

  if (!res.ok) throw new Error(`KuGou search failed: ${res.status}`)

  const data = (await res.json()) as KgSearchResponse
  if (!data || data.error_code !== 0) throw new Error("KuGou search failed: bad response")

  const total = data.data?.total ?? 0
  const list = handleResult(data.data?.lists ?? [])

  return {
    list,
    total,
    page,
    allPage: Math.ceil(total / limit),
    limit,
  }
}
