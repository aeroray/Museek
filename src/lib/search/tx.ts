import { httpFetch as tauriFetch } from "@/lib/http"
import type { MusicInfo, MusicQuality, SearchResult } from "@/types/music"
import { formatDuration } from "@/lib/utils"

// Ported from lx-music-desktop: src/renderer/utils/musicSdk/tx/musicSearch.js
// QQ Music musics.fcg endpoint. Body is a JSON request signed with the
// "zzcSign" SHA1-based scheme (ported inline from tx/utils/crypto.js).

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

interface TxSearchData {
  body?: {
    item_song?: TxSongRaw[]
  }
  meta?: {
    estimate_sum?: number
  }
}

interface TxSearchResponse {
  code?: number
  req?: {
    code?: number
    data?: TxSearchData
  }
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

// --- zzcSign signature, ported from tx/utils/crypto.js ---
const PART_1_INDEXES = [23, 14, 6, 36, 16, 40, 7, 19]
const PART_2_INDEXES = [16, 1, 32, 12, 19, 27, 8, 5]
const SCRAMBLE_VALUES = [
  89, 39, 179, 150, 218, 82, 58, 252, 177, 52, 186, 123, 120, 64, 242, 133, 143, 161, 121, 179,
]

function bytesToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

async function hashSHA1(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest("SHA-1", data)
  return bytesToHex(digest)
}

function pickHashByIdx(hash: string, indexes: number[]): string {
  return indexes.map((idx) => hash[idx]).join("")
}

function base64Encode(bytes: number[]): string {
  let binary = ""
  for (const b of bytes) binary += String.fromCharCode(b & 0xff)
  return btoa(binary).replace(/[\\/+=]/g, "")
}

async function zzcSign(text: string): Promise<string> {
  const hash = await hashSHA1(text)
  const part1 = pickHashByIdx(hash, PART_1_INDEXES)
  const part2 = pickHashByIdx(hash, PART_2_INDEXES)
  const part3 = SCRAMBLE_VALUES.map(
    (value, i) => value ^ parseInt(hash.slice(i * 2, i * 2 + 2), 16)
  )
  const b64Part = base64Encode(part3)
  return `zzc${part1}${b64Part}${part2}`.toLowerCase()
}
// --- end zzcSign ---

function normalizeTxSong(raw: TxSongRaw): MusicInfo | null {
  const file = raw.file
  if (!file?.media_mid) return null

  const qualitys: MusicQuality[] = []
  if (file.size_128mp3) qualitys.push({ type: "128k", size: sizeFormate(file.size_128mp3) })
  if (file.size_320mp3) qualitys.push({ type: "320k", size: sizeFormate(file.size_320mp3) })
  if (file.size_flac) qualitys.push({ type: "flac", size: sizeFormate(file.size_flac) })
  if (file.size_hires) qualitys.push({ type: "flac24bit", size: sizeFormate(file.size_hires) })
  if (qualitys.length === 0) qualitys.push({ type: "128k", size: null })

  const _qualitys: MusicInfo["meta"]["_qualitys"] = {}
  for (const q of qualitys) _qualitys[q.type] = { size: q.size }

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

export async function searchTx(
  query: string,
  page = 1,
  limit = 30
): Promise<SearchResult> {
  const reqBody = {
    comm: {
      ct: "11",
      cv: "14090508",
      v: "14090508",
      tmeAppID: "qqmusic",
      phonetype: "EBG-AN10",
      deviceScore: "553.47",
      devicelevel: "50",
      newdevicelevel: "20",
      rom: "HuaWei/EMOTION/EmotionUI_14.2.0",
      os_ver: "12",
      OpenUDID: "0",
      OpenUDID2: "0",
      QIMEI36: "0",
      udid: "0",
      chid: "0",
      aid: "0",
      oaid: "0",
      taid: "0",
      tid: "0",
      wid: "0",
      uid: "0",
      sid: "0",
      modeSwitch: "6",
      teenMode: "0",
      ui_mode: "2",
      nettype: "1020",
      v4ip: "",
    },
    req: {
      module: "music.search.SearchCgiService",
      method: "DoSearchForQQMusicMobile",
      param: {
        search_type: 0,
        searchid: Math.random().toString().slice(2),
        query,
        page_num: page,
        num_per_page: limit,
        highlight: 0,
        nqc_flag: 0,
        multi_zhida: 0,
        cat: 2,
        grp: 1,
        sin: 0,
        sem: 0,
      },
    },
  }

  const bodyStr = JSON.stringify(reqBody)
  const sign = await zzcSign(bodyStr)

  const res = await tauriFetch(`https://u.y.qq.com/cgi-bin/musics.fcg?sign=${sign}`, {
    method: "POST",
    headers: {
      "User-Agent": "QQMusic 14090508(android 12)",
    },
    body: bodyStr,
  })

  if (!res.ok) throw new Error(`QQ search failed: ${res.status}`)

  const data = (await res.json()) as TxSearchResponse
  if (!data || !data.req || data.code !== 0 || data.req.code !== 0) {
    throw new Error("QQ search failed: bad response")
  }

  const searchData = data.req.data
  const list = handleResult(searchData?.body?.item_song)
  const total = searchData?.meta?.estimate_sum ?? 0

  return {
    list,
    total,
    page,
    allPage: Math.ceil(total / limit),
    limit,
  }
}
