import { httpFetch as tauriFetch } from "@/lib/http"
import * as md5Lib from "js-md5"
import * as aesjs from "aes-js"
import type { MusicInfo, MusicQuality, Quality, SearchResult } from "@/types/music"
import { formatDuration } from "@/lib/utils"

// Ported from lx-music-desktop: src/renderer/utils/musicSdk/wy/musicSearch.js
// NetEase Cloud Music. Uses the "eapi" request signing (AES-128-ECB + MD5),
// ported inline from wy/utils/crypto.js + wy/utils/index.js. The simplest
// working endpoint lx-music uses: /api/search/song/list/page via the
// /eapi/batch gateway. eapi params are AES-128-ECB-encrypted hex (uppercase),
// posted as an x-www-form-urlencoded "params" field.

// js-md5 CommonJS/ESM interop (same pattern as src/lib/lxApi.ts)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const md5 = ((md5Lib as any).default ?? md5Lib) as (str: string) => string

interface WySingerRaw {
  name?: string
}

interface WyAlbumRaw {
  id?: number | string
  name?: string
  picUrl?: string
}

interface WyBrItemRaw {
  size?: number
}

interface WyPrivilegeRaw {
  maxBrLevel?: string
  maxbr?: number
}

interface WySimpleSongRaw {
  id?: number | string
  name?: string
  dt?: number
  ar?: WySingerRaw[]
  al?: WyAlbumRaw
  privilege?: WyPrivilegeRaw
  hr?: WyBrItemRaw
  sq?: WyBrItemRaw
  h?: WyBrItemRaw
  l?: WyBrItemRaw
}

interface WyResourceRaw {
  baseInfo?: {
    simpleSongData?: WySimpleSongRaw
  }
}

interface WySearchResponse {
  code?: number
  data?: {
    resources?: WyResourceRaw[]
    totalCount?: number
  }
}

// Mirrors common/utils/common.ts sizeFormate
function sizeFormate(size: number): string {
  if (!size) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const number = Math.floor(Math.log(size) / Math.log(1024))
  return `${(size / Math.pow(1024, Math.floor(number))).toFixed(2)} ${units[number]}`
}

function formatSingers(singers: WySingerRaw[] | undefined): string {
  if (!Array.isArray(singers)) return ""
  return singers
    .map((s) => s.name)
    .filter(Boolean)
    .join("、")
}

// --- eapi encryption, ported from wy/utils/crypto.js ---
const EAPI_KEY = "e82ckenh8dichen8"

function bytesToHexUpper(buf: Uint8Array): string {
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()
}

// AES-128-ECB encrypt with PKCS7 padding (matches Node crypto aes-128-ecb).
function aesEcbEncrypt(text: string, key: string): Uint8Array {
  const keyBytes = aesjs.utils.utf8.toBytes(key)
  const cipher = new aesjs.ModeOfOperation.ecb(keyBytes)
  const padded = aesjs.padding.pkcs7.pad(aesjs.utils.utf8.toBytes(text))
  return cipher.encrypt(padded)
}

function eapi(url: string, object: unknown): { params: string } {
  const text = typeof object === "object" ? JSON.stringify(object) : String(object)
  const message = `nobody${url}use${text}md5forencrypt`
  const digest = md5(message)
  const data = `${url}-36cd479b6b5-${text}-36cd479b6b5-${digest}`
  return {
    params: bytesToHexUpper(aesEcbEncrypt(data, EAPI_KEY)),
  }
}
// --- end eapi ---

const QUALITY_ORDER: Quality[] = ["flac24bit", "flac", "320k", "128k"]

function normalizeWySong(item: WySimpleSongRaw): MusicInfo {
  const qualitys: MusicQuality[] = []
  const privilege = item.privilege ?? {}

  if (privilege.maxBrLevel === "hires") {
    qualitys.push({ type: "flac24bit", size: item.hr ? sizeFormate(item.hr.size ?? 0) : null })
  }
  // Fall-through cascade mirrors the reference switch on maxbr.
  const maxbr = privilege.maxbr ?? 0
  if (maxbr >= 999000) {
    qualitys.push({ type: "flac", size: item.sq ? sizeFormate(item.sq.size ?? 0) : null })
  }
  if (maxbr >= 320000) {
    qualitys.push({ type: "320k", size: item.h ? sizeFormate(item.h.size ?? 0) : null })
  }
  if (maxbr >= 128000) {
    qualitys.push({ type: "128k", size: item.l ? sizeFormate(item.l.size ?? 0) : null })
  }
  if (qualitys.length === 0) qualitys.push({ type: "128k", size: null })

  // De-dupe + order ascending (128k first), matching reference types.reverse().
  const byType = new Map<Quality, MusicQuality>()
  for (const q of qualitys) if (!byType.has(q.type)) byType.set(q.type, q)
  const ordered = QUALITY_ORDER.filter((t) => byType.has(t))
    .map((t) => byType.get(t)!)
    .reverse()

  const _qualitys: MusicInfo["meta"]["_qualitys"] = {}
  for (const q of ordered) _qualitys[q.type] = { size: q.size }

  const songId = String(item.id)

  return {
    id: `wy_${songId}`,
    name: item.name ?? "",
    singer: formatSingers(item.ar),
    source: "wy",
    interval: formatDuration((item.dt ?? 0) / 1000),
    albumName: item.al?.name ?? "",
    meta: {
      songId,
      albumId: item.al?.id != null ? String(item.al.id) : "",
      picUrl: item.al?.picUrl ?? null,
      qualitys: ordered,
      _qualitys,
    },
  }
}

function handleResult(resources: WyResourceRaw[] | undefined): MusicInfo[] {
  if (!resources) return []
  const list: MusicInfo[] = []
  for (const res of resources) {
    const song = res.baseInfo?.simpleSongData
    if (song) list.push(normalizeWySong(song))
  }
  return list
}

export async function searchWangyi(
  query: string,
  page = 1,
  limit = 30
): Promise<SearchResult> {
  const apiPath = "/api/search/song/list/page"
  const payload = {
    keyword: query,
    needCorrect: "1",
    channel: "typing",
    offset: limit * (page - 1),
    scene: "normal",
    total: page === 1,
    limit,
  }

  const form = eapi(apiPath, payload)
  const body = new URLSearchParams(form).toString()

  const res = await tauriFetch("http://interface.music.163.com/eapi/batch", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36",
      origin: "https://music.163.com",
    },
    body,
  })

  if (!res.ok) throw new Error(`NetEase search failed: ${res.status}`)

  const data = (await res.json()) as WySearchResponse
  if (!data || data.code !== 200) throw new Error("NetEase search failed: bad response")

  const list = handleResult(data.data?.resources ?? [])
  const total = data.data?.totalCount ?? 0

  return {
    list,
    total,
    page,
    allPage: Math.ceil(total / limit),
    limit,
  }
}
