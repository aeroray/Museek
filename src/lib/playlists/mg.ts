import { httpFetch as tauriFetch } from "@/lib/http"
import type { MusicInfo, MusicQuality, Quality } from "@/types/music"
import { indexQualitySizes } from "@/lib/quality"
import { formatDuration } from "@/lib/utils"
import type { Playlist, PlaylistDetail, PlaylistDetailInfo, PlaylistTag } from "./index"

// Ported from lx-music-desktop: src/renderer/utils/musicSdk/mg/songList.js
// Default recommend uses getMusicData (contentItemList + barList play counts).
// Category filtering uses musiclistplaza-taglist + musiclistplaza-listbytag.
// Fallback still accepts the older square-recommend `contents` tree (no plays).
// Detail uses the unsigned MIGUM3.0 playlist/song v2.0 endpoint,
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
// filterList shape (data.contentItemList[].itemList[])
interface MgBarRaw {
  title?: string
}
interface MgItemRaw {
  title?: string
  subTitle?: string
  imageUrl?: string
  actionUrl?: string
  logEvent?: { contentId?: string | number }
  barList?: MgBarRaw[]
}
// filterList2 shape (data.contents[] tree, resType '2021') — no play count
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

const MG_ACTION_ID_RX = /[?&]id=(\d+)/

function mgPlaylistId(raw: MgItemRaw): string | null {
  if (raw.logEvent?.contentId != null) return String(raw.logEvent.contentId)
  const m = raw.actionUrl?.match(MG_ACTION_ID_RX)
  return m?.[1] ?? null
}

function normalizeMgItem(raw: MgItemRaw): Playlist | null {
  const id = mgPlaylistId(raw)
  if (!id) return null
  return {
    id,
    name: raw.title ?? "",
    img: raw.imageUrl || null,
    // barList[0].title is already a display string (e.g. "1234万").
    playCount: raw.barList?.[0]?.title || undefined,
    author: raw.subTitle || undefined,
    source: "mg",
  }
}

function playlistsFromContentItemList(
  blocks: Array<{ itemList?: MgItemRaw[] }> | undefined
): Playlist[] {
  const out: Playlist[] = []
  const seen = new Set<string>()
  for (const block of blocks ?? []) {
    for (const raw of block.itemList ?? []) {
      const pl = normalizeMgItem(raw)
      if (!pl || seen.has(pl.id)) continue
      seen.add(pl.id)
      out.push(pl)
    }
  }
  return out
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

interface MgTagCell {
  texts?: string[]
}

interface MgTagBlock {
  content?: MgTagCell[]
  header?: { title?: string }
}

interface MgTagResponse {
  code?: string
  info?: string
  data?: MgTagBlock[]
}

/** Hot tags from musiclistplaza-taglist (`texts: [name, id, …]`). */
export async function getMgPlaylistTags(): Promise<PlaylistTag[]> {
  const url = "https://app.c.nf.migu.cn/pc/v1.0/template/musiclistplaza-taglist/release"
  const res = await tauriFetch(url, { method: "GET", headers: DEFAULT_HEADERS })
  if (!res.ok) throw new Error(`Migu playlist tags failed: ${res.status}`)

  const data = (await res.json()) as MgTagResponse
  if (!data || data.code !== "000000" || !data.data?.[0]?.content) {
    throw new Error(`Migu playlist tags failed: ${data?.info ?? "bad response"}`)
  }

  const out: PlaylistTag[] = []
  const seen = new Set<string>()
  for (const cell of data.data[0].content) {
    const name = cell.texts?.[0]
    const id = cell.texts?.[1]
    if (!name || !id || seen.has(id)) continue
    seen.add(id)
    out.push({ id, name })
  }
  return out
}

export async function getMgHotPlaylists(page = 1, tagId?: string | null): Promise<Playlist[]> {
  if (tagId) {
    const url =
      `https://app.c.nf.migu.cn/pc/v1.0/template/musiclistplaza-listbytag/release` +
      `?pageNumber=${page}&templateVersion=2&tagId=${encodeURIComponent(tagId)}`

    const res = await tauriFetch(url, { method: "GET", headers: DEFAULT_HEADERS })
    if (!res.ok) throw new Error(`Migu hot playlists failed: ${res.status}`)

    const data = (await res.json()) as MgListResponse
    if (!data || data.code !== "000000" || !data.data) {
      throw new Error(`Migu hot playlists failed: ${data?.info ?? "bad response"}`)
    }

    const fromItems = playlistsFromContentItemList(data.data.contentItemList)
    if (fromItems.length) return fromItems

    if (data.data.contents) {
      const out: Playlist[] = []
      collectMgNodes(data.data.contents, out, new Set<string>())
      return out
    }
    return []
  }

  // Prefer getMusicData (has barList play counts). The older square-recommend
  // contents tree only returns titles/covers — no play counts.
  const url =
    `https://app.c.nf.migu.cn/MIGUM2.0/v2.0/content/getMusicData.do` +
    `?count=30&start=${page}&templateVersion=5&type=1`

  const res = await tauriFetch(url, { method: "GET", headers: DEFAULT_HEADERS })

  if (!res.ok) throw new Error(`Migu hot playlists failed: ${res.status}`)

  const data = (await res.json()) as MgListResponse
  if (!data || data.code !== "000000" || !data.data) {
    throw new Error(`Migu hot playlists failed: ${data?.info ?? "bad response"}`)
  }

  const fromItems = playlistsFromContentItemList(data.data.contentItemList)
  if (fromItems.length) return fromItems

  if (data.data.contents) {
    const out: Playlist[] = []
    collectMgNodes(data.data.contents, out, new Set<string>())
    return out
  }
  return []
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

export async function getMgPlaylistDetail(id: string, page = 1): Promise<PlaylistDetail> {
  const songUrl =
    `https://app.c.nf.migu.cn/MIGUM3.0/resource/playlist/song/v2.0` +
    `?pageNo=${page}&pageSize=${LIMIT_SONG}&playlistId=${id}`
  const infoUrl = `https://c.musicapp.migu.cn/MIGUM3.0/resource/playlist/v2.0?playlistId=${id}`

  const [songRes, infoRes] = await Promise.all([
    tauriFetch(songUrl, { method: "GET", headers: DEFAULT_HEADERS }),
    tauriFetch(infoUrl, { method: "GET", headers: DEFAULT_HEADERS }),
  ])

  if (!songRes.ok) throw new Error(`Migu playlist detail failed: ${songRes.status}`)

  const data = (await songRes.json()) as MgDetailResponse
  if (!data || data.code !== "000000") {
    throw new Error(`Migu playlist detail failed: ${data?.info ?? "bad response"}`)
  }

  let info: PlaylistDetailInfo = { name: "", img: null }
  if (infoRes.ok) {
    try {
      const infoData = (await infoRes.json()) as {
        code?: string
        data?: { title?: string; imgItem?: { img?: string }; ownerName?: string }
      }
      if (infoData.code === "000000" && infoData.data) {
        info = {
          name: infoData.data.title ?? "",
          img: infoData.data.imgItem?.img || null,
          author: infoData.data.ownerName,
        }
      }
    } catch {
      /* keep empty info */
    }
  }

  const seen = new Set<string>()
  const list: MusicInfo[] = []
  for (const song of data.data?.songList ?? []) {
    if (!song.songId || seen.has(song.songId)) continue
    seen.add(song.songId)
    list.push(normalizeMgSong(song))
  }
  return { info, list }
}
