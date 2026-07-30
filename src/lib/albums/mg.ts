import { httpFetch as tauriFetch } from "@/lib/http"
import type { MusicInfo, MusicQuality, Quality } from "@/types/music"
import { indexQualitySizes } from "@/lib/quality"
import { formatDuration } from "@/lib/utils"
import type { AlbumDetail } from "./index"
import type { Album, AlbumTag } from "./index"
import { formatAlbumDate } from "./date"

// Ported from lx-music-desktop mg/album.js.
// Songs: MIGUM2.0 queryAlbumSong (newRateFormats / artists / length shape —
// filterMusicInfoList). Info: MIGUM3.0 resource/album/v2.0.

const DEFAULT_HEADERS = {
  Referer: "https://m.music.migu.cn/",
  channel: "0146921",
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1",
}

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
  asize?: number | string
  isize?: number | string
}

interface MgImgRaw {
  img?: string
}

interface MgSongRaw {
  songId?: string
  copyrightId?: string
  songName?: string
  name?: string
  album?: string
  albumId?: string
  duration?: number
  length?: string
  artists?: MgArtistRaw[]
  singerList?: MgArtistRaw[]
  newRateFormats?: MgRateFormatRaw[]
  audioFormats?: MgRateFormatRaw[]
  albumImgs?: MgImgRaw[]
  img1?: string
  img2?: string
  img3?: string
}

interface MgSongResponse {
  code?: string
  info?: string
  songList?: MgSongRaw[]
  data?: { songList?: MgSongRaw[] }
}

interface MgAlbumInfoResponse {
  code?: string
  info?: string
  data?: {
    title?: string
    imgItems?: MgImgRaw[]
    singer?: string
    summary?: string
    totalCount?: number
  }
  title?: string
  imgItems?: MgImgRaw[]
  singer?: string
}

const formatTypeToQuality: Record<string, Quality> = {
  PQ: "128k",
  HQ: "320k",
  SQ: "flac",
  ZQ: "flac24bit",
  ZQ24: "flac24bit",
}

function formatSingers(singers: MgArtistRaw[] | undefined): string {
  if (!Array.isArray(singers)) return ""
  return singers
    .map((s) => s.name)
    .filter(Boolean)
    .join("、")
}

function normalizeMgAlbumSong(raw: MgSongRaw): MusicInfo | null {
  if (!raw.songId) return null

  const qualitys: MusicQuality[] = []
  const formats = raw.newRateFormats ?? raw.audioFormats ?? []
  for (const fmt of formats) {
    const q = fmt.formatType ? formatTypeToQuality[fmt.formatType] : undefined
    if (!q) continue
    const rawSize = fmt.size ?? fmt.androidSize ?? fmt.asize ?? fmt.isize
    qualitys.push({ type: q, size: sizeFormate(Number(rawSize ?? 0)) })
  }
  if (qualitys.length === 0) qualitys.push({ type: "128k", size: null })
  const _qualitys = indexQualitySizes(qualitys)

  let img =
    raw.albumImgs?.[0]?.img || raw.img3 || raw.img2 || raw.img1 || null
  if (img && !/^https?:/.test(img)) img = "http://d.musicapp.migu.cn" + img

  let interval = "0:00"
  if (raw.duration != null) {
    interval = formatDuration(raw.duration)
  } else if (raw.length && /(\d\d:\d\d)$/.test(raw.length)) {
    interval = RegExp.$1
  }

  const songId = String(raw.songId)
  return {
    id: `mg_${songId}`,
    name: raw.songName ?? raw.name ?? "",
    singer: formatSingers(raw.artists ?? raw.singerList),
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

async function getAlbumInfo(id: string): Promise<{
  name: string
  img: string | null
  author?: string
}> {
  const url = `https://app.c.nf.migu.cn/MIGUM3.0/resource/album/v2.0?albumId=${encodeURIComponent(id)}`
  const res = await tauriFetch(url, { method: "GET", headers: DEFAULT_HEADERS })
  if (!res.ok) throw new Error(`Migu album info failed: ${res.status}`)

  const json = (await res.json()) as MgAlbumInfoResponse
  // Some gateways wrap under data; lx createHttpFetch may unwrap.
  const info = json.data ?? json
  if (!info || (json.code != null && json.code !== "000000" && !info.title)) {
    throw new Error(`Migu album info failed: ${json.info ?? "bad response"}`)
  }

  const imgs = info.imgItems
  return {
    name: info.title ?? "",
    img: imgs?.length ? imgs[0].img || null : null,
    author: info.singer || undefined,
  }
}

export async function getMgAlbumDetail(id: string, page = 1): Promise<AlbumDetail> {
  const songUrl =
    `http://app.c.nf.migu.cn/MIGUM2.0/v1.0/content/queryAlbumSong` +
    `?albumId=${encodeURIComponent(id)}&pageNo=${page}`

  const [songRes, info] = await Promise.all([
    tauriFetch(songUrl, { method: "GET", headers: DEFAULT_HEADERS }),
    getAlbumInfo(id),
  ])

  if (!songRes.ok) throw new Error(`Migu album songs failed: ${songRes.status}`)

  const data = (await songRes.json()) as MgSongResponse
  const songList = data.songList ?? data.data?.songList
  if (!songList) {
    throw new Error(`Migu album songs failed: ${data.info ?? "bad response"}`)
  }

  const seen = new Set<string>()
  const list: MusicInfo[] = []
  for (const raw of songList) {
    const song = normalizeMgAlbumSong(raw)
    if (!song || seen.has(song.meta.songId)) continue
    seen.add(song.meta.songId)
    list.push(song)
  }
  return { info, list }
}

// --- 新碟上架 (column tabs + disk_grid) ---
const LIMIT_HOT = 30

const MG_FALLBACK_TAGS: AlbumTag[] = [
  { id: "15279065", name: "全部" },
  { id: "15279137", name: "华语" },
  { id: "15279149", name: "欧美" },
  { id: "15279114", name: "日韩" },
]

interface MgHeaderItem {
  title?: string
  actionUrl?: string
}

interface MgHeaderResponse {
  code?: string
  data?: {
    contentItemList?: { itemList?: MgHeaderItem[] }[]
    itemList?: MgHeaderItem[]
  }
  itemList?: MgHeaderItem[]
}

/** disk_grid rows put fields on the item itself (not under content). */
interface MgDiskItem {
  template?: string
  title?: string
  subTitle?: string
  imageUrl?: string
  actionUrl?: string
  barList?: { title?: string }[]
  content?: MgDiskItem
}

interface MgDiskResponse {
  code?: string
  data?: {
    contentItemList?: {
      template?: string
      itemList?: MgDiskItem[]
    }[]
  }
}

function parseMgColumnId(actionUrl?: string): string | null {
  if (!actionUrl) return null
  const m = actionUrl.match(/columnId=(\d+)/i)
  return m?.[1] ?? null
}

function parseMgAlbumId(actionUrl?: string): string | null {
  if (!actionUrl) return null
  const m = actionUrl.match(/album-info\?id=([^&]+)/i)
  return m?.[1] ? decodeURIComponent(m[1]) : null
}

function flattenMgHeaderItems(json: MgHeaderResponse): MgHeaderItem[] {
  const blocks = json.data?.contentItemList
  if (Array.isArray(blocks)) {
    const out: MgHeaderItem[] = []
    for (const block of blocks) {
      for (const item of block.itemList ?? []) out.push(item)
    }
    if (out.length) return out
  }
  if (Array.isArray(json.data?.itemList)) return json.data.itemList
  if (Array.isArray(json.itemList)) return json.itemList
  return []
}

export async function getMgAlbumTags(): Promise<AlbumTag[]> {
  try {
    const res = await tauriFetch(
      "https://app.c.nf.migu.cn/pc/v1.0/template/get-new-cd-list-header",
      { method: "GET", headers: DEFAULT_HEADERS }
    )
    if (!res.ok) return MG_FALLBACK_TAGS.filter((t) => t.id !== "15279065")
    const json = (await res.json()) as MgHeaderResponse
    const tags: AlbumTag[] = []
    for (const item of flattenMgHeaderItems(json)) {
      const id = parseMgColumnId(item.actionUrl)
      if (!id || !item.title) continue
      // Skip "全部" — HotAlbums already has a dedicated 全部 chip (tagId=null).
      if (item.title === "全部") continue
      tags.push({ id, name: item.title })
    }
    return tags.length ? tags : MG_FALLBACK_TAGS.filter((t) => t.id !== "15279065")
  } catch {
    return MG_FALLBACK_TAGS.filter((t) => t.id !== "15279065")
  }
}

export async function getMgHotAlbums(page = 1, tagId?: string | null): Promise<Album[]> {
  const columnId = tagId && /^\d+$/.test(tagId) ? tagId : "15279065"
  const start = (page - 1) * LIMIT_HOT + 1
  const url =
    `https://app.c.nf.migu.cn/MIGUM3.0/v1.0/template/get-new-cd-list-data` +
    `?templateVersion=1&columnId=${encodeURIComponent(columnId)}` +
    `&start=${start}&count=${LIMIT_HOT}`
  const res = await tauriFetch(url, { method: "GET", headers: DEFAULT_HEADERS })
  if (!res.ok) throw new Error(`Migu hot albums failed: ${res.status}`)
  const json = (await res.json()) as MgDiskResponse
  if (json.code != null && json.code !== "000000") {
    throw new Error(`Migu hot albums failed: ${json.code}`)
  }
  const out: Album[] = []
  for (const block of json.data?.contentItemList ?? []) {
    for (const row of block.itemList ?? []) {
      const item = row.content ?? row
      if (item.template && item.template !== "disk_grid") continue
      const id = parseMgAlbumId(item.actionUrl)
      if (!id) continue
      out.push({
        id,
        name: item.title ?? "",
        img: item.imageUrl || null,
        author: item.subTitle || undefined,
        publishTime: formatAlbumDate(item.barList?.[0]?.title),
        source: "mg",
      })
    }
  }
  return out.filter((a) => a.name)
}
