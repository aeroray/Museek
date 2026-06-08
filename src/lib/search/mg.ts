import { httpFetch as tauriFetch } from "@/lib/http"
import * as md5Lib from "js-md5"
import type { MusicInfo, MusicQuality, Quality, SearchResult } from "@/types/music"
import { formatDuration } from "@/lib/utils"

// Ported from lx-music-desktop: src/renderer/utils/musicSdk/mg/musicSearch.js
// Migu jadeite v3 searchAll endpoint, signed with a static-key MD5 signature.

// js-md5 CommonJS/ESM interop (same pattern as src/lib/lxApi.ts)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const md5 = ((md5Lib as any).default ?? md5Lib) as (str: string) => string

interface MgSingerRaw {
  name?: string
}

interface MgAudioFormatRaw {
  formatType?: string
  asize?: number | string
  isize?: number | string
}

interface MgSongRaw {
  songId?: string
  copyrightId?: string
  name?: string
  album?: string
  albumId?: string
  duration?: number
  singerList?: MgSingerRaw[]
  audioFormats?: MgAudioFormatRaw[]
  img1?: string
  img2?: string
  img3?: string
}

interface MgSearchResponse {
  code?: string
  info?: string
  songResultData?: {
    resultList?: MgSongRaw[][]
    totalCount?: number | string
  }
}

// Mirrors common/utils/common.ts sizeFormate
function sizeFormate(size: number): string {
  if (!size) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const number = Math.floor(Math.log(size) / Math.log(1024))
  return `${(size / Math.pow(1024, Math.floor(number))).toFixed(2)} ${units[number]}`
}

function formatSingers(singers: MgSingerRaw[] | undefined): string {
  if (!Array.isArray(singers)) return ""
  return singers
    .map((s) => s.name)
    .filter(Boolean)
    .join("、")
}

// Ported from mg/util.js createSignature (static device id + salts).
function createSignature(time: string, str: string): { sign: string; deviceId: string } {
  const deviceId = "963B7AA0D21511ED807EE5846EC87D20"
  const signatureMd5 = "6cdc72a439cef99a3418d2a78aa28c73"
  const sign = md5(
    `${str}${signatureMd5}yyapp2d16148780a1dcc7408e06336b98cfd50${deviceId}${time}`
  )
  return { sign, deviceId }
}

const formatTypeToQuality: Record<string, Quality> = {
  PQ: "128k",
  HQ: "320k",
  SQ: "flac",
  ZQ24: "flac24bit",
}

function normalizeMgSong(raw: MgSongRaw): MusicInfo {
  const qualitys: MusicQuality[] = []
  for (const fmt of raw.audioFormats ?? []) {
    const q = fmt.formatType ? formatTypeToQuality[fmt.formatType] : undefined
    if (!q) continue
    const rawSize = fmt.asize ?? fmt.isize
    const size = rawSize != null ? sizeFormate(Number(rawSize)) : null
    qualitys.push({ type: q, size })
  }
  if (qualitys.length === 0) qualitys.push({ type: "128k", size: null })

  const _qualitys: MusicInfo["meta"]["_qualitys"] = {}
  for (const q of qualitys) _qualitys[q.type] = { size: q.size }

  let img = raw.img3 || raw.img2 || raw.img1 || null
  if (img && !/^https?:/.test(img)) img = "http://d.musicapp.migu.cn" + img

  const songId = String(raw.songId)

  return {
    id: `mg_${songId}`,
    name: raw.name ?? "",
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

function filterData(rawData: MgSongRaw[][]): MusicInfo[] {
  const seen = new Set<string>()
  const list: MusicInfo[] = []
  for (const group of rawData) {
    for (const data of group) {
      if (!data.songId || !data.copyrightId || seen.has(data.copyrightId)) continue
      seen.add(data.copyrightId)
      list.push(normalizeMgSong(data))
    }
  }
  return list
}

export async function searchMigu(
  query: string,
  page = 1,
  limit = 30
): Promise<SearchResult> {
  const time = Date.now().toString()
  const { sign, deviceId } = createSignature(time, query)

  const searchSwitch =
    "%7B%22song%22%3A1%2C%22album%22%3A0%2C%22singer%22%3A0%2C%22tagSong%22%3A1" +
    "%2C%22mvSong%22%3A0%2C%22bestShow%22%3A1%2C%22songlist%22%3A0%2C%22lyricSong%22%3A0%7D"
  const url =
    `https://jadeite.migu.cn/music_search/v3/search/searchAll?isCorrect=0&isCopyright=1` +
    `&searchSwitch=${searchSwitch}&pageSize=${limit}&text=${encodeURIComponent(query)}` +
    `&pageNo=${page}&sort=0&sid=USS`

  const res = await tauriFetch(url, {
    method: "GET",
    headers: {
      uiVersion: "A_music_3.6.1",
      deviceId,
      timestamp: time,
      sign,
      channel: "0146921",
      "User-Agent":
        "Mozilla/5.0 (Linux; U; Android 11.0.0; zh-cn; MI 11 Build/OPR1.170623.032) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30",
    },
  })

  if (!res.ok) throw new Error(`Migu search failed: ${res.status}`)

  const data = (await res.json()) as MgSearchResponse
  if (!data || data.code !== "000000") {
    throw new Error(`Migu search failed: ${data?.info ?? "bad response"}`)
  }

  const result = data.songResultData ?? { resultList: [], totalCount: 0 }
  const list = filterData(result.resultList ?? [])
  const total = parseInt(String(result.totalCount ?? 0)) || 0

  return {
    list,
    total,
    page,
    allPage: Math.ceil(total / limit),
    limit,
  }
}
