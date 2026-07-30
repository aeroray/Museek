import { httpFetch as tauriFetch } from "@/lib/http"
import type { MusicInfo, MusicQuality } from "@/types/music"
import { indexQualitySizes } from "@/lib/quality"
import { formatDuration } from "@/lib/utils"
import type { AlbumDetail } from "./index"
import type { Album, AlbumTag } from "./index"
import { formatAlbumDate, parseSongCount } from "./date"

// QQ album detail via fcg_v8_album_info_cp. Song normalization mirrors
// search/tx.ts / playlists/tx.ts (not exported — slim copy; handles both
// nested Desktop shapes and legacy flat album songlist fields).

interface TxSingerRaw {
  name?: string
  mid?: string
}

interface TxAlbumRaw {
  name?: string
  mid?: string
}

interface TxFileRaw {
  media_mid?: string
  size_128mp3?: number
  size_320mp3?: number
  size_flac?: number
  size_hires?: number
}

interface TxSongRaw {
  id?: number | string
  mid?: string
  songmid?: string
  title?: string
  songname?: string
  songName?: string
  interval?: number
  singer?: TxSingerRaw[]
  album?: TxAlbumRaw
  albumname?: string
  albummid?: string
  file?: TxFileRaw
  size128?: number
  size320?: number
  sizeflac?: number
  sizeape?: number
  size_hires?: number
  strMediaMid?: string
  media_mid?: string
}

interface TxAlbumInfoResponse {
  code?: number
  data?: {
    name?: string
    mid?: string
    singername?: string
    singerName?: string
    company?: string
    list?: TxSongRaw[]
    songlist?: TxSongRaw[]
  }
  name?: string
  mid?: string
  singername?: string
  songlist?: TxSongRaw[]
}

function sizeFormate(size: number): string {
  if (!size) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const number = Math.floor(Math.log(size) / Math.log(1024))
  return `${(size / Math.pow(1024, Math.floor(number))).toFixed(2)} ${units[number]}`
}

function formatSingers(singers: TxSingerRaw[] | undefined): string {
  if (!Array.isArray(singers)) return ""
  return singers
    .map((s) => s.name)
    .filter(Boolean)
    .join("、")
}

function normalizeTxSong(raw: TxSongRaw, fallbackAlbumMid: string, fallbackAlbumName: string): MusicInfo | null {
  const songmid = String(raw.mid ?? raw.songmid ?? "")
  if (!songmid) return null

  const mediaMid =
    raw.file?.media_mid ?? raw.strMediaMid ?? raw.media_mid ?? songmid

  const qualitys: MusicQuality[] = []
  const size128 = raw.file?.size_128mp3 ?? raw.size128
  const size320 = raw.file?.size_320mp3 ?? raw.size320
  const sizeFlac = raw.file?.size_flac ?? raw.sizeflac
  const sizeHires = raw.file?.size_hires ?? raw.size_hires
  if (size128) qualitys.push({ type: "128k", size: sizeFormate(size128) })
  if (size320) qualitys.push({ type: "320k", size: sizeFormate(size320) })
  if (sizeFlac) qualitys.push({ type: "flac", size: sizeFormate(sizeFlac) })
  if (sizeHires) qualitys.push({ type: "flac24bit", size: sizeFormate(sizeHires) })
  if (qualitys.length === 0) qualitys.push({ type: "128k", size: null })

  const _qualitys = indexQualitySizes(qualitys)

  const albumName = raw.album?.name ?? raw.albumname ?? fallbackAlbumName
  const albumId = raw.album?.mid ?? raw.albummid ?? fallbackAlbumMid

  let picUrl: string | null = null
  if (albumId && albumId !== "空") {
    picUrl = `https://y.gtimg.cn/music/photo_new/T002R500x500M000${albumId}.jpg`
  } else if (raw.singer?.length && raw.singer[0].mid) {
    picUrl = `https://y.gtimg.cn/music/photo_new/T001R500x500M000${raw.singer[0].mid}.jpg`
  }

  return {
    id: `tx_${songmid}`,
    name: raw.title ?? raw.songname ?? raw.songName ?? "",
    singer: formatSingers(raw.singer),
    source: "tx",
    interval: formatDuration(raw.interval || 0),
    albumName,
    meta: {
      songId: songmid,
      albumId,
      strMediaMid: mediaMid,
      picUrl,
      qualitys,
      _qualitys,
    },
  }
}

function retryDelayMs(tryNum: number): number {
  return 400 * (tryNum + 1) + Math.floor(Math.random() * 200)
}

/** page ignored — album info endpoint returns the full songlist. */
export async function getTxAlbumDetail(id: string, _page = 1, tryNum = 0): Promise<AlbumDetail> {
  const url =
    `https://c.y.qq.com/v8/fcg-bin/fcg_v8_album_info_cp.fcg` +
    `?albummid=${encodeURIComponent(id)}&platform=yqq&format=json` +
    `&loginUin=0&hostUin=0&inCharset=utf8&outCharset=utf-8&notice=0&needNewCode=0`

  const res = await tauriFetch(url, {
    method: "GET",
    headers: {
      Origin: "https://y.qq.com",
      Referer: `https://y.qq.com/n/yqq/album/${id}.html`,
      "User-Agent": "Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; WOW64; Trident/5.0)",
    },
  })

  if (!res.ok) {
    if (tryNum < 2) {
      await new Promise((r) => setTimeout(r, retryDelayMs(tryNum)))
      return getTxAlbumDetail(id, _page, tryNum + 1)
    }
    throw new Error(`QQ album detail failed: ${res.status}`)
  }

  const data = (await res.json()) as TxAlbumInfoResponse
  if (!data || data.code !== 0) {
    if (tryNum < 2) {
      await new Promise((r) => setTimeout(r, retryDelayMs(tryNum)))
      return getTxAlbumDetail(id, _page, tryNum + 1)
    }
    throw new Error("QQ album detail failed: bad response")
  }

  const payload = data.data ?? {
    name: data.name,
    mid: data.mid,
    singername: data.singername,
    songlist: data.songlist,
  }
  const albumMid = String(payload.mid ?? id)
  const albumName = payload.name ?? ""
  const author = payload.singername ?? payload.singerName

  const rawSongs = payload.songlist ?? payload.list ?? []
  const list: MusicInfo[] = []
  for (const item of rawSongs) {
    const song = normalizeTxSong(item, albumMid, albumName)
    if (song) list.push(song)
  }

  return {
    info: {
      name: albumName,
      img: albumMid
        ? `https://y.gtimg.cn/music/photo_new/T002R500x500M000${albumMid}.jpg`
        : null,
      author: author || undefined,
    },
    list,
  }
}

// --- album library (music.web_album_library / GetAlbumByTags-style) ---
const LIMIT_HOT = 30

function musicuUrl(data: unknown): string {
  return (
    `https://u.y.qq.com/cgi-bin/musicu.fcg?loginUin=0&hostUin=0&format=json` +
    `&inCharset=utf-8&outCharset=utf-8&notice=0&platform=wk_v15.json&needNewCode=0` +
    `&data=${encodeURIComponent(JSON.stringify(data))}`
  )
}

interface TxAlbumTagRaw {
  id?: number | string
  name?: string
}

interface TxAlbumLibItem {
  album_mid?: string
  album_name?: string
  album_name_hilight?: string
  singers?: { name?: string; singer_name?: string }[]
  public_time?: string
  song_count?: number
}

interface TxAlbumLibResponse {
  code?: number
  req_1?: {
    code?: number
    data?: {
      tags?: { area?: TxAlbumTagRaw[] }
      list?: TxAlbumLibItem[]
      albumlist?: TxAlbumLibItem[]
    }
  }
}

const TX_FALLBACK_AREAS: AlbumTag[] = [
  { id: "1", name: "内地" },
  { id: "0", name: "港台" },
  { id: "3", name: "欧美" },
  { id: "15", name: "韩国" },
  { id: "14", name: "日本" },
  { id: "4", name: "其他" },
]

export async function getTxAlbumTags(): Promise<AlbumTag[]> {
  const body = {
    comm: { ct: 24, cv: 0 },
    req_1: {
      module: "music.web_album_library",
      method: "get_album_by_tags",
      param: {
        start: 0,
        num: 1,
        sort: 2,
        area: -1,
        company: -1,
        genre: -1,
        type: -1,
        year: -1,
        click_albumid: 0,
        get_tags: 1,
      },
    },
  }
  const res = await tauriFetch(musicuUrl(body), {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; WOW64; Trident/5.0)",
      Referer: "https://y.qq.com/",
    },
  })
  if (!res.ok) return TX_FALLBACK_AREAS
  const data = (await res.json()) as TxAlbumLibResponse
  const areas = data?.req_1?.data?.tags?.area
  if (!areas?.length) return TX_FALLBACK_AREAS
  return areas
    .filter((t) => t.id != null && t.name)
    .map((t) => ({ id: String(t.id), name: String(t.name) }))
}

export async function getTxHotAlbums(page = 1, tagId?: string | null): Promise<Album[]> {
  const area =
    tagId != null && tagId !== "" && Number.isFinite(parseInt(tagId, 10))
      ? parseInt(tagId, 10)
      : -1
  const body = {
    comm: { ct: 24, cv: 0 },
    req_1: {
      module: "music.web_album_library",
      method: "get_album_by_tags",
      param: {
        start: LIMIT_HOT * (page - 1),
        num: LIMIT_HOT,
        sort: 2,
        area,
        company: -1,
        genre: -1,
        type: -1,
        year: -1,
        click_albumid: 0,
        get_tags: 0,
      },
    },
  }
  const res = await tauriFetch(musicuUrl(body), {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; WOW64; Trident/5.0)",
      Referer: "https://y.qq.com/",
    },
  })
  if (!res.ok) throw new Error(`QQ hot albums failed: ${res.status}`)
  const data = (await res.json()) as TxAlbumLibResponse
  if (data?.code !== 0 || (data.req_1?.code != null && data.req_1.code !== 0)) {
    throw new Error("QQ hot albums failed: bad response")
  }
  const list = data?.req_1?.data?.list ?? data?.req_1?.data?.albumlist ?? []
  return list
    .map((item): Album | null => {
      const mid = String(item.album_mid ?? "")
      if (!mid) return null
      const author = Array.isArray(item.singers)
        ? item.singers
            .map((s: { name?: string; singer_name?: string }) => s?.singer_name ?? s?.name)
            .filter(Boolean)
            .join("、")
        : undefined
      return {
        id: mid,
        name: item.album_name ?? item.album_name_hilight ?? "",
        img: `https://y.gtimg.cn/music/photo_new/T002R500x500M000${mid}.jpg`,
        author: author || undefined,
        publishTime: formatAlbumDate(item.public_time),
        songCount: parseSongCount(item.song_count),
        source: "tx",
      }
    })
    .filter((a): a is Album => !!a)
}
