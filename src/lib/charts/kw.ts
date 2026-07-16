import { httpFetch as tauriFetch } from "@/lib/http"
import * as aesjs from "aes-js"
import * as md5Lib from "js-md5"
import type { MusicInfo, MusicQuality, Quality } from "@/types/music"
import { indexQualitySizes } from "@/lib/quality"
import { formatDuration } from "@/lib/utils"
import type { ChartBoard } from "./index"

// Ported from lx-music-desktop: src/renderer/utils/musicSdk/kw/leaderboard.js
// Board song lists come from the wbd.kuwo.cn bang_info endpoint. Request params
// are signed and the response body is AES-128-ECB encrypted (wbdCrypto, ported
// from kw/util.js). AES uses aes-js (same ECB pattern as src/lib/lxApi.ts /
// src/lib/search/wy.ts); MD5 uses js-md5 (same interop as src/lib/search/mg.ts).

// js-md5 CommonJS/ESM interop (same pattern as src/lib/search/mg.ts)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const md5 = ((md5Lib as any).default ?? md5Lib) as (str: string) => string

// A few well-known KuWo boards. ids/bangids match the reference's boardList.
export const kwBoards: ChartBoard[] = [
  { id: "kw__93", name: "飙升榜" },
  { id: "kw__16", name: "热歌榜" },
  { id: "kw__17", name: "新歌榜" },
  { id: "kw__158", name: "抖音热歌榜" },
  { id: "kw__145", name: "会员畅听榜" },
  { id: "kw__187", name: "流行趋势榜" },
  { id: "kw__26", name: "经典怀旧榜" },
  { id: "kw__104", name: "华语榜" },
  { id: "kw__182", name: "粤语榜" },
  { id: "kw__22", name: "欧美榜" },
  { id: "kw__184", name: "韩语榜" },
  { id: "kw__183", name: "日语榜" },
]

const LIMIT = 100

const bitrateToQuality: Record<string, Quality> = {
  "4000": "flac24bit",
  "2000": "flac",
  "320": "320k",
  "128": "128k",
}

// n_minfo entries look like: "level:hh,bitrate:2000,format:flac,size:35.69MB;..."
const mInfoRx = /level:\w+,bitrate:(\d+),format:\w+,size:([\w.]+)/

function parseNMinfo(nMinfo: string): MusicQuality[] {
  const result: MusicQuality[] = []
  const seen = new Set<string>()
  for (const part of nMinfo.split(";")) {
    const info = part.match(mInfoRx)
    if (!info) continue
    const bitrate = info[1]
    if (seen.has(bitrate)) continue
    seen.add(bitrate)
    const q = bitrateToQuality[bitrate]
    if (q) result.push({ type: q, size: info[2].toLocaleUpperCase() })
  }
  return result.reverse()
}

function decodeKwName(name: string | undefined): string {
  if (!name) return ""
  try {
    return decodeURIComponent(name.replace(/\+/g, " "))
  } catch {
    return name
  }
}

function formatSinger(raw: string | undefined): string {
  return (raw || "").replace(/&/g, "、")
}

// --- wbdCrypto, ported from kw/util.js ---
const WBD_AES_KEY = new Uint8Array([
  112, 87, 39, 61, 199, 250, 41, 191, 57, 68, 45, 114, 221, 94, 140, 228,
])
const WBD_APP_ID = "y67sprxhhpws"

function aesEcbEncryptBase64(data: string): string {
  const cipher = new aesjs.ModeOfOperation.ecb(Array.from(WBD_AES_KEY))
  const padded = aesjs.padding.pkcs7.pad(aesjs.utils.utf8.toBytes(data))
  const encrypted = cipher.encrypt(padded)
  let binary = ""
  for (const b of encrypted) binary += String.fromCharCode(b)
  return btoa(binary)
}

function aesEcbDecryptToText(base64Result: string): string {
  const binary = atob(decodeURIComponent(base64Result))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const cipher = new aesjs.ModeOfOperation.ecb(Array.from(WBD_AES_KEY))
  const decrypted = aesjs.padding.pkcs7.strip(cipher.decrypt(bytes))
  return aesjs.utils.utf8.fromBytes(decrypted)
}

function buildParam(jsonData: unknown): string {
  const data = JSON.stringify(jsonData)
  const time = Date.now()
  const encodeData = aesEcbEncryptBase64(data)
  const sign = md5(`${WBD_APP_ID}${encodeData}${time}`).toUpperCase()
  return `data=${encodeURIComponent(encodeData)}&time=${time}&appId=${WBD_APP_ID}&sign=${sign}`
}
// --- end wbdCrypto ---

interface KwBangSongRaw {
  id: string | number
  name: string
  artist: string
  album: string
  albumId: string | number
  duration: string | number
  pic?: string
  n_minfo: string
}

interface KwBangResponse {
  code?: number | string
  data?: {
    total?: string | number
    musiclist?: KwBangSongRaw[]
  }
}

function normalizeKwBangSong(raw: KwBangSongRaw): MusicInfo {
  const songId = String(raw.id)
  const qualitys = raw.n_minfo ? parseNMinfo(raw.n_minfo) : []
  if (qualitys.length === 0) qualitys.push({ type: "128k", size: null })
  const _qualitys = indexQualitySizes(qualitys)

  const duration = parseInt(String(raw.duration))
  return {
    id: `kw_${songId}`,
    name: decodeKwName(raw.name),
    singer: formatSinger(decodeKwName(raw.artist)),
    source: "kw",
    interval: isNaN(duration) ? "0:00" : formatDuration(duration),
    albumName: decodeKwName(raw.album),
    meta: {
      songId,
      albumId: raw.albumId != null ? String(raw.albumId) : "",
      picUrl: raw.pic || null,
      qualitys,
      _qualitys,
    },
  }
}

export async function getKwBoardSongs(boardId: string, page = 1): Promise<MusicInfo[]> {
  const bangid = boardId.replace("kw__", "")

  const requestBody = {
    uid: "",
    devId: "",
    sFrom: "kuwo_sdk",
    user_type: "AP",
    carSource: "kwplayercar_ar_6.0.1.0_apk_keluze.apk",
    id: bangid,
    pn: page - 1,
    rn: LIMIT,
  }
  const url = `https://wbd.kuwo.cn/api/bd/bang/bang_info?${buildParam(requestBody)}`

  const res = await tauriFetch(url, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  })

  if (!res.ok) throw new Error(`KuWo board failed: ${res.status}`)

  const encrypted = await res.text()
  const rawData = JSON.parse(aesEcbDecryptToText(encrypted)) as KwBangResponse
  if (!rawData || String(rawData.code) !== "200" || !rawData.data?.musiclist) {
    throw new Error("KuWo board failed: bad response")
  }

  return rawData.data.musiclist.map(normalizeKwBangSong)
}
