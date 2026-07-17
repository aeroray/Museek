import type { MusicInfo, MusicQuality, SearchResult } from "@/types/music"
import { indexQualitySizes } from "@/lib/quality"
import { formatDuration } from "@/lib/utils"
import { qqDesktopSearch } from "@/lib/search/txDesktop"

// Ported from lx-music-desktop tx/musicSearch.js — Desktop DoSearchForQQMusicDesktop
// on signed musics.fcg (Mobile endpoint is wind-controlled more often).

interface TxSingerRaw {
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

interface TxAlbumRaw {
  name?: string
  mid?: string
}

interface TxSongRaw {
  id?: number | string
  mid?: string
  title?: string
  interval?: number
  singer?: TxSingerRaw[]
  album?: TxAlbumRaw
  file?: TxFileRaw
}

// Mirrors common/utils/common.ts sizeFormate
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

function normalizeTxSong(raw: TxSongRaw): MusicInfo | null {
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
  if (albumId && albumId !== "空") {
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

function handleResult(rawList: TxSongRaw[] | undefined): MusicInfo[] {
  if (!Array.isArray(rawList)) return []
  const list: MusicInfo[] = []
  for (const item of rawList) {
    const song = normalizeTxSong(item)
    if (song) list.push(song)
  }
  return list
}

export async function searchTx(query: string, page = 1, limit = 30): Promise<SearchResult> {
  const data = await qqDesktopSearch(query, page, limit, 0)
  const body = (data.body ?? {}) as {
    song?: { list?: TxSongRaw[] }
    item_song?: TxSongRaw[]
  }
  // Desktop: body.song.list; legacy Mobile: body.item_song
  const list = handleResult(body.song?.list ?? body.item_song)
  const meta = data.meta ?? {}
  const total = meta.sum ?? meta.estimate_sum ?? 0

  return {
    list,
    total,
    page,
    allPage: Math.ceil(total / limit) || 0,
    limit,
  }
}
