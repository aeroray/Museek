import { httpFetch as tauriFetch } from "@/lib/http"
import type { MusicInfo, MusicQuality } from "@/types/music"
import { formatDuration } from "@/lib/utils"
import type { ChartBoard } from "./index"

// Ported from lx-music-desktop: src/renderer/utils/musicSdk/kg/leaderboard.js
// KuGou public v3/rank/song endpoint. No signing required.
// Song normalization mirrors src/lib/search/kg.ts.

// A few well-known KuGou boards. ids/bangids match the reference's boardList.
export const kgBoards: ChartBoard[] = [
  { id: "kg__8888", name: "TOP500" },
  { id: "kg__6666", name: "酷狗飙升榜" },
  { id: "kg__23784", name: "网络红歌榜" },
  { id: "kg__52144", name: "抖音热歌榜" },
  { id: "kg__21101", name: "分享榜" },
  { id: "kg__31308", name: "内地榜" },
  { id: "kg__33165", name: "粤语金曲榜" },
  { id: "kg__33166", name: "欧美金曲榜" },
  { id: "kg__33160", name: "电音榜" },
  { id: "kg__24971", name: "DJ热歌榜" },
  { id: "kg__33161", name: "古风新歌榜" },
]

const LIMIT = 100

// Mirrors src/lib/search/kg.ts sizeFormate
function sizeFormate(size: number): string {
  if (!size) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const number = Math.floor(Math.log(size) / Math.log(1024))
  return `${(size / Math.pow(1024, Math.floor(number))).toFixed(2)} ${units[number]}`
}

// Mirrors src/lib/search/kg.ts decodeName (HTML entity decode)
function decodeName(str: string | null | undefined): string {
  if (!str) return ""
  try {
    return new DOMParser().parseFromString(str, "text/html").body.textContent ?? str
  } catch {
    return str
  }
}

interface KgAuthorRaw {
  author_name?: string
}

interface KgBangSongRaw {
  songname: string
  remark: string
  album_id: string | number
  audio_id: string | number
  hash: string
  duration: number
  filesize: number
  "320hash"?: string
  "320filesize"?: number
  sqhash?: string
  sqfilesize?: number
  hash_high?: string
  filesize_high?: number
  authors?: KgAuthorRaw[]
}

interface KgBangResponse {
  errcode?: number
  data?: {
    total?: number
    info?: KgBangSongRaw[]
  }
}

function formatSingers(authors: KgAuthorRaw[] | undefined): string {
  if (!Array.isArray(authors)) return ""
  return decodeName(
    authors
      .map((a) => a.author_name)
      .filter(Boolean)
      .join("、")
  )
}

function normalizeKgBangSong(raw: KgBangSongRaw): MusicInfo {
  const qualitys: MusicQuality[] = []
  if (raw.filesize) qualitys.push({ type: "128k", size: sizeFormate(raw.filesize) })
  if (raw["320filesize"]) qualitys.push({ type: "320k", size: sizeFormate(raw["320filesize"]) })
  if (raw.sqfilesize) qualitys.push({ type: "flac", size: sizeFormate(raw.sqfilesize) })
  if (raw.filesize_high) qualitys.push({ type: "flac24bit", size: sizeFormate(raw.filesize_high) })
  if (qualitys.length === 0) qualitys.push({ type: "128k", size: null })

  const _qualitys: MusicInfo["meta"]["_qualitys"] = {}
  for (const q of qualitys) _qualitys[q.type] = { size: q.size }

  // songId is the album_audio_id (audio_id); hash is the standard FileHash.
  const songId = String(raw.audio_id)

  return {
    id: `kg_${songId}`,
    name: decodeName(raw.songname),
    singer: formatSingers(raw.authors),
    source: "kg",
    interval: formatDuration(raw.duration || 0),
    albumName: decodeName(raw.remark),
    meta: {
      songId,
      albumId: raw.album_id != null ? String(raw.album_id) : "",
      picUrl: null,
      hash: raw.hash,
      qualitys,
      _qualitys,
    },
  }
}

export async function getKgBoardSongs(boardId: string, page = 1): Promise<MusicInfo[]> {
  const rankid = boardId.replace("kg__", "")
  const url =
    `http://mobilecdnbj.kugou.com/api/v3/rank/song?version=9108&ranktype=1&plat=0` +
    `&pagesize=${LIMIT}&area_code=1&page=${page}&rankid=${rankid}&with_res_tag=0&show_portrait_mv=1`

  const res = await tauriFetch(url, {
    method: "GET",
    headers: {
      Referer: "https://www.kugou.com/",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  })

  if (!res.ok) throw new Error(`KuGou board failed: ${res.status}`)

  const data = (await res.json()) as KgBangResponse
  if (!data || data.errcode !== 0) throw new Error("KuGou board failed: bad response")

  return (data.data?.info ?? []).map(normalizeKgBangSong)
}
