import { httpFetch as tauriFetch } from "@/lib/http"
import type { MusicInfo, MusicQuality } from "@/types/music"
import { indexQualitySizes } from "@/lib/quality"
import { formatDuration } from "@/lib/utils"
import type { ChartBoard } from "./index"

// Ported from lx-music-desktop: src/renderer/utils/musicSdk/tx/leaderboard.js
// QQ Music toplist via musicu.fcg (musicToplist.ToplistInfoServer/GetDetail).
// This endpoint uses the legacy comm-block auth, NOT the zzcSign scheme that
// search/tx.ts uses for musics.fcg — so no signing helper is reused here.
// Song normalization mirrors src/lib/search/tx.ts.

// A few well-known QQ boards. ids/bangids match the reference's boardList.
export const txBoards: ChartBoard[] = [
  { id: "tx__26", name: "热歌榜" },
  { id: "tx__4", name: "流行指数榜" },
  { id: "tx__27", name: "新歌榜" },
  { id: "tx__62", name: "飙升榜" },
  { id: "tx__28", name: "网络歌曲榜" },
  { id: "tx__60", name: "抖快榜" },
  { id: "tx__5", name: "内地榜" },
  { id: "tx__59", name: "香港地区榜" },
  { id: "tx__61", name: "台湾地区榜" },
  { id: "tx__3", name: "欧美榜" },
  { id: "tx__16", name: "韩国榜" },
  { id: "tx__17", name: "日本榜" },
]

const LIMIT = 300

// Mirrors src/lib/search/tx.ts sizeFormate
function sizeFormate(size: number): string {
  if (!size) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const number = Math.floor(Math.log(size) / Math.log(1024))
  return `${(size / Math.pow(1024, Math.floor(number))).toFixed(2)} ${units[number]}`
}

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

interface TxBangSongRaw {
  id?: number | string
  mid?: string
  title?: string
  interval?: number
  singer?: TxSingerRaw[]
  album?: TxAlbumRaw
  file?: TxFileRaw
}

interface TxBangResponse {
  toplist?: {
    code?: number
    data?: {
      songInfoList?: TxBangSongRaw[]
    }
  }
}

function formatSingers(singers: TxSingerRaw[] | undefined): string {
  if (!Array.isArray(singers)) return ""
  return singers
    .map((s) => s.name)
    .filter(Boolean)
    .join("、")
}

function normalizeTxBangSong(raw: TxBangSongRaw): MusicInfo | null {
  const file = raw.file
  if (!file?.media_mid) return null

  const qualitys: MusicQuality[] = []
  if (file.size_128mp3) qualitys.push({ type: "128k", size: sizeFormate(file.size_128mp3) })
  if (file.size_320mp3) qualitys.push({ type: "320k", size: sizeFormate(file.size_320mp3) })
  if (file.size_flac) qualitys.push({ type: "flac", size: sizeFormate(file.size_flac) })
  if (file.size_hires) qualitys.push({ type: "flac24bit", size: sizeFormate(file.size_hires) })
  if (qualitys.length === 0) qualitys.push({ type: "128k", size: null })

  const _qualitys = indexQualitySizes(qualitys)

  const albumName = raw.album?.name ?? ""
  const albumId = raw.album?.mid ?? ""

  let picUrl: string | null = null
  if (albumId && albumName !== "" && albumName !== "空") {
    picUrl = `https://y.gtimg.cn/music/photo_new/T002R500x500M000${albumId}.jpg`
  } else if (raw.singer?.length && raw.singer[0].mid) {
    picUrl = `https://y.gtimg.cn/music/photo_new/T001R500x500M000${raw.singer[0].mid}.jpg`
  }

  // songId is the songmid (string mid like "0039MnYb0qxYhV"); play scripts read it.
  const songmid = raw.mid ?? ""

  return {
    id: `tx_${songmid}`,
    name: raw.title ?? "",
    singer: formatSingers(raw.singer),
    source: "tx",
    interval: formatDuration(raw.interval || 0),
    albumName,
    meta: {
      songId: songmid,
      albumId,
      strMediaMid: file.media_mid,
      picUrl,
      qualitys,
      _qualitys,
    },
  }
}

// The toplist endpoint returns a full single-page list, so page is ignored
// (the _ prefix keeps it strict-mode clean while matching the dispatcher shape).
export async function getTxBoardSongs(boardId: string, _page = 1): Promise<MusicInfo[]> {
  const topid = parseInt(boardId.replace("tx__", ""))

  // period is omitted: GetDetail returns the most recent period when absent,
  // which avoids the fragile HTML scraping the reference uses to resolve it.
  const reqBody = {
    toplist: {
      module: "musicToplist.ToplistInfoServer",
      method: "GetDetail",
      param: {
        topid,
        num: LIMIT,
      },
    },
    comm: {
      uin: 0,
      format: "json",
      ct: 20,
      cv: 1859,
    },
  }

  const res = await tauriFetch("https://u.y.qq.com/cgi-bin/musicu.fcg", {
    method: "POST",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; WOW64; Trident/5.0)",
    },
    body: JSON.stringify(reqBody),
  })

  if (!res.ok) throw new Error(`QQ board failed: ${res.status}`)

  const data = (await res.json()) as TxBangResponse
  if (!data?.toplist || data.toplist.code !== 0) throw new Error("QQ board failed: bad response")

  const list: MusicInfo[] = []
  for (const item of data.toplist.data?.songInfoList ?? []) {
    const song = normalizeTxBangSong(item)
    if (song) list.push(song)
  }
  return list
}
