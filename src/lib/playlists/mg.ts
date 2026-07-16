import { httpFetch as tauriFetch } from "@/lib/http"
import type { MusicInfo, MusicQuality, Quality } from "@/types/music"
import { indexQualitySizes } from "@/lib/quality"
import { formatDuration } from "@/lib/utils"
import type { Playlist } from "./index"

// Ported from lx-music-desktop: src/renderer/utils/musicSdk/mg/songList.js
// Hot playlists come from the unsigned playlist-square-recommend endpoint (the
// default recommend list, no tag). Its body has two possible shapes — a nested
// `contents` tree (filterList2) or a `contentItemList` (filterList) — both
// handled here. Detail uses the unsigned MIGUM3.0 playlist/song v2.0 endpoint,
// normalized via the V5 filter (audioFormats + singerList + img3/2/1), the same
// objectInfo-style shape as src/lib/search/mg.ts. No signing is reused.

const LIMIT_SONG = 50

// Mirrors common/utils/common.ts sizeFormate
function sizeFormate(size: number): string {
  if (!size) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const number = Math.floor(Math.log(size) / Math.log(1024))
  return `${(size / Math.pow(1024, Math.floor(number))).toFixed(2)} ${units[number]}`
}

const DEFAULT_HEADERS = {
  Referer: "https://m.music.migu.cn/",
  channel: "0146921",
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1",
}

// --- hot list ---
// filterList shape (data.contentItemList[1].itemList[])
interface MgBarRaw {
  title?: string
}
interface MgItemRaw {
  title?: string
  imageUrl?: string
  logEvent?: { contentId?: string | number }
  barList?: MgBarRaw[]
}
// filterList2 shape (data.contents[] tree, resType '2021')
interface MgContentNodeRaw {
  contents?: MgContentNodeRaw[]
  resType?: string
  resId?: string | number
  txt?: string
  img?: string
}

interface MgListResponse {
  code?: string
  info?: string
  data?: {
    contents?: MgContentNodeRaw[]
    contentItemList?: Array<{ itemList?: MgItemRaw[] }>
  }
}

function normalizeMgItem(raw: MgItemRaw): Playlist {
  const id = raw.logEvent?.contentId
  return {
    id: String(id),
    name: raw.title ?? "",
    img: raw.imageUrl || null,
    // barList[0].title is already a display string (e.g. "1234万").
    playCount: raw.barList?.[0]?.title || undefined,
    source: "mg",
  }
}

// Recursively collect resType '2021' playlist nodes (mirrors filterList2).
function collectMgNodes(
  nodes: MgContentNodeRaw[],
  out: Playlist[],
  seen: Set<string>
): void {
  for (const node of nodes) {
    if (node.contents) {
      collectMgNodes(node.contents, out, seen)
    } else if (node.resType === "2021" && node.resId != null) {
      const id = String(node.resId)
      if (seen.has(id)) continue
      seen.add(id)
      out.push({
        id,
        name: node.txt ?? "",
        img: node.img || null,
        source: "mg",
      })
    }
  }
}

export async function getMgHotPlaylists(page = 1): Promise<Playlist[]> {
  const url =
    `https://app.c.nf.migu.cn/pc/bmw/page-data/playlist-square-recommend/v1.0` +
    `?templateVersion=2&pageNo=${page}`

  const res = await tauriFetch(url, { method: "GET", headers: DEFAULT_HEADERS })

  if (!res.ok) throw new Error(`Migu hot playlists failed: ${res.status}`)

  const data = (await res.json()) as MgListResponse
  if (!data || data.code !== "000000" || !data.data) {
    throw new Error(`Migu hot playlists failed: ${data?.info ?? "bad response"}`)
  }

  if (data.data.contents) {
    const out: Playlist[] = []
    collectMgNodes(data.data.contents, out, new Set<string>())
    return out
  }
  return (data.data.contentItemList?.[1]?.itemList ?? []).map(normalizeMgItem)
}

// --- detail (V5 filter; mirrors src/lib/search/mg.ts) ---
interface MgSingerRaw {
  name?: string
}

interface MgAudioFormatRaw {
  formatType?: string
  size?: number | string
  androidSize?: number | string
}

interface MgSongRaw {
  songId?: string
  copyrightId?: string
  songName?: string
  album?: string
  albumId?: string
  duration?: number
  singerList?: MgSingerRaw[]
  audioFormats?: MgAudioFormatRaw[]
  img1?: string
  img2?: string
  img3?: string
}

interface MgDetailResponse {
  code?: string
  info?: string
  data?: {
    songList?: MgSongRaw[]
  }
}

function formatSingers(singers: MgSingerRaw[] | undefined): string {
  if (!Array.isArray(singers)) return ""
  return singers
    .map((s) => s.name)
    .filter(Boolean)
    .join("、")
}

// filterMusicInfoListV5 maps audioFormats; ZQ -> flac24bit here.
const formatTypeToQuality: Record<string, Quality> = {
  PQ: "128k",
  HQ: "320k",
  SQ: "flac",
  ZQ: "flac24bit",
}

function normalizeMgSong(raw: MgSongRaw): MusicInfo {
  const qualitys: MusicQuality[] = []
  for (const fmt of raw.audioFormats ?? []) {
    const q = fmt.formatType ? formatTypeToQuality[fmt.formatType] : undefined
    if (!q) continue
    const rawSize = fmt.size ?? fmt.androidSize
    qualitys.push({ type: q, size: sizeFormate(Number(rawSize ?? 0)) })
  }
  if (qualitys.length === 0) qualitys.push({ type: "128k", size: null })

  const _qualitys = indexQualitySizes(qualitys)

  let img = raw.img3 || raw.img2 || raw.img1 || null
  if (img && !/^https?:/.test(img)) img = "http://d.musicapp.migu.cn" + img

  const songId = String(raw.songId)

  return {
    id: `mg_${songId}`,
    name: raw.songName ?? "",
    singer: formatSingers(raw.singerList),
    source: "mg",
    interval: formatDuration(raw.duration || 0),
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

export async function getMgPlaylistDetail(id: string, page = 1): Promise<MusicInfo[]> {
  const url =
    `https://app.c.nf.migu.cn/MIGUM3.0/resource/playlist/song/v2.0` +
    `?pageNo=${page}&pageSize=${LIMIT_SONG}&playlistId=${id}`

  const res = await tauriFetch(url, { method: "GET", headers: DEFAULT_HEADERS })

  if (!res.ok) throw new Error(`Migu playlist detail failed: ${res.status}`)

  const data = (await res.json()) as MgDetailResponse
  if (!data || data.code !== "000000") {
    throw new Error(`Migu playlist detail failed: ${data?.info ?? "bad response"}`)
  }

  const seen = new Set<string>()
  const list: MusicInfo[] = []
  for (const song of data.data?.songList ?? []) {
    if (!song.songId || seen.has(song.songId)) continue
    seen.add(song.songId)
    list.push(normalizeMgSong(song))
  }
  return list
}
