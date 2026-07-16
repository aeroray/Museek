import { httpFetch as tauriFetch } from "@/lib/http"
import type { MusicInfo, MusicQuality, Quality } from "@/types/music"
import { indexQualitySizes } from "@/lib/quality"
import type { ChartBoard } from "./index"

// Ported from lx-music-desktop: src/renderer/utils/musicSdk/mg/leaderboard.js
// Migu toplist. The reference uses a fixed boardList and fetches songs from the
// querycontentbyId.do endpoint (getUrl), reading body.columnInfo.contents[]
// .objectInfo and normalizing via mg/musicInfo.js filterMusicInfoList. That
// endpoint is unsigned (unlike search), so no signing helper is reused here.
// Song normalization mirrors mg/musicInfo.js filterMusicInfoList + search/mg.ts.

// A few well-known Migu boards. ids/bangids match the reference's boardList.
export const mgBoards: ChartBoard[] = [
  { id: "mg__27553319", name: "新歌榜" },
  { id: "mg__27186466", name: "热歌榜" },
  { id: "mg__27553408", name: "原创榜" },
  { id: "mg__75959118", name: "音乐风向榜" },
  { id: "mg__76557036", name: "彩铃分贝榜" },
  { id: "mg__76557745", name: "会员臻爱榜" },
  { id: "mg__23189800", name: "港台榜" },
  { id: "mg__23189399", name: "内地榜" },
  { id: "mg__19190036", name: "欧美榜" },
  { id: "mg__83176390", name: "国风金曲榜" },
]

// Mirrors common/utils/common.ts sizeFormate
function sizeFormate(size: number): string {
  if (!size) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const number = Math.floor(Math.log(size) / Math.log(1024))
  return `${(size / Math.pow(1024, Math.floor(number))).toFixed(2)} ${units[number]}`
}

interface MgArtistRaw {
  name?: string
}

interface MgRateFormatRaw {
  formatType?: string
  size?: number | string
  androidSize?: number | string
}

interface MgAlbumImgRaw {
  img?: string
}

// objectInfo shape returned by querycontentbyId.do (filterMusicInfoList input).
interface MgObjectInfoRaw {
  songId?: string
  copyrightId?: string
  songName?: string
  album?: string
  albumId?: string
  length?: string
  artists?: MgArtistRaw[]
  newRateFormats?: MgRateFormatRaw[]
  albumImgs?: MgAlbumImgRaw[]
}

interface MgContentRaw {
  objectInfo?: MgObjectInfoRaw
}

interface MgBoardResponse {
  code?: string
  info?: string
  columnInfo?: {
    contents?: MgContentRaw[]
  }
}

function formatSingers(singers: MgArtistRaw[] | undefined): string {
  if (!Array.isArray(singers)) return ""
  return singers
    .map((s) => s.name)
    .filter(Boolean)
    .join("、")
}

// filterMusicInfoList maps newRateFormats; note ZQ (not ZQ24) -> flac24bit here.
const formatTypeToQuality: Record<string, Quality> = {
  PQ: "128k",
  HQ: "320k",
  SQ: "flac",
  ZQ: "flac24bit",
}

// Mirrors mg/musicInfo.js: interval comes from a trailing mm:ss in `length`.
const intervalRx = /(\d\d:\d\d)$/

function normalizeMgObjectInfo(raw: MgObjectInfoRaw): MusicInfo {
  const qualitys: MusicQuality[] = []
  for (const fmt of raw.newRateFormats ?? []) {
    const q = fmt.formatType ? formatTypeToQuality[fmt.formatType] : undefined
    if (!q) continue
    const rawSize = fmt.size ?? fmt.androidSize
    qualitys.push({ type: q, size: sizeFormate(Number(rawSize ?? 0)) })
  }
  if (qualitys.length === 0) qualitys.push({ type: "128k", size: null })

  const _qualitys = indexQualitySizes(qualitys)

  const lengthMatch = raw.length ? raw.length.match(intervalRx) : null
  const interval = lengthMatch ? lengthMatch[1] : "0:00"

  const img = raw.albumImgs?.length ? raw.albumImgs[0].img ?? null : null

  const songId = String(raw.songId)

  return {
    id: `mg_${songId}`,
    name: raw.songName ?? "",
    singer: formatSingers(raw.artists),
    source: "mg",
    interval,
    albumName: raw.album ?? "",
    meta: {
      songId,
      albumId: raw.albumId != null ? String(raw.albumId) : "",
      copyrightId: raw.copyrightId,
      picUrl: img,
      qualitys,
      _qualitys,
    },
  }
}

// querycontentbyId.do returns the full board in one response, so page is
// ignored (the _ prefix keeps it strict-mode clean and matches the dispatcher).
export async function getMgBoardSongs(boardId: string, _page = 1): Promise<MusicInfo[]> {
  const bangid = boardId.replace("mg__", "")
  const url =
    `https://app.c.nf.migu.cn/MIGUM2.0/v1.0/content/querycontentbyId.do?columnId=${bangid}&needAll=0`

  const res = await tauriFetch(url, {
    method: "GET",
    headers: {
      Referer: "https://app.c.nf.migu.cn/",
      channel: "0146921",
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 5.1.1; Nexus 6 Build/LYZ28E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/59.0.3071.115 Mobile Safari/537.36",
    },
  })

  if (!res.ok) throw new Error(`Migu board failed: ${res.status}`)

  const data = (await res.json()) as MgBoardResponse
  if (!data || data.code !== "000000") {
    throw new Error(`Migu board failed: ${data?.info ?? "bad response"}`)
  }

  const seen = new Set<string>()
  const list: MusicInfo[] = []
  for (const content of data.columnInfo?.contents ?? []) {
    const info = content.objectInfo
    if (!info?.songId || seen.has(info.songId)) continue
    seen.add(info.songId)
    list.push(normalizeMgObjectInfo(info))
  }
  return list
}
