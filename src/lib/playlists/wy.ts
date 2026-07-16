import { httpFetch as tauriFetch } from "@/lib/http"
import * as md5Lib from "js-md5"
import * as aesjs from "aes-js"
import type { MusicInfo, MusicQuality, Quality } from "@/types/music"
import { indexQualitySizes } from "@/lib/quality"
import { formatDuration } from "@/lib/utils"
import type { Playlist } from "./index"

// Ported from lx-music-desktop: src/renderer/utils/musicSdk/wy/songList.js
// NetEase. The reference signs the hot-list request with weapi (/weapi/
// playlist/list, cat=全部, order=hot) and the detail with the linux gateway
// (/api/v3/playlist/detail). Here both go through the eapi gateway using the
// SAME signing helper as src/lib/search/wy.ts and src/lib/charts/wy.ts — the
// hot list hits /api/playlist/list and detail hits /api/v3/playlist/detail
// (which returns playlist.tracks fully populated, so no second song/detail
// call is needed). Song normalization mirrors src/lib/charts/wy.ts.

// js-md5 CommonJS/ESM interop (same pattern as src/lib/search/wy.ts)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const md5 = ((md5Lib as any).default ?? md5Lib) as (str: string) => string

const LIMIT_LIST = 30
// Reference asks for n: 100000; playlists are far smaller, but keep it generous.
const LIMIT_SONG = 100000

// --- eapi encryption, ported from wy/utils/crypto.js (same as src/lib/search/wy.ts) ---
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

async function eapiPost<T>(apiPath: string, payload: unknown, label: string): Promise<T> {
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

  if (!res.ok) throw new Error(`${label} failed: ${res.status}`)
  return (await res.json()) as T
}

// Mirrors renderer/utils/index.ts formatPlayCount
function formatPlayCount(num: number): string {
  if (num > 100000000) return `${Math.trunc(num / 10000000) / 10}亿`
  if (num > 10000) return `${Math.trunc(num / 1000) / 10}万`
  return String(num)
}

// --- hot list ---
interface WyPlaylistRaw {
  id?: number | string
  name?: string
  coverImgUrl?: string
  playCount?: number
}

interface WyListResponse {
  code?: number
  playlists?: WyPlaylistRaw[]
}

function normalizeWyPlaylist(raw: WyPlaylistRaw): Playlist {
  const playCount = Number(raw.playCount)
  return {
    id: String(raw.id),
    name: raw.name ?? "",
    img: raw.coverImgUrl ?? null,
    playCount: isNaN(playCount) || playCount === 0 ? undefined : formatPlayCount(playCount),
    source: "wy",
  }
}

export async function getWyHotPlaylists(page = 1): Promise<Playlist[]> {
  const payload = {
    cat: "全部",
    order: "hot",
    limit: LIMIT_LIST,
    offset: LIMIT_LIST * (page - 1),
    total: true,
  }

  const data = await eapiPost<WyListResponse>(
    "/api/playlist/list",
    payload,
    "NetEase hot playlists"
  )
  if (!data || data.code !== 200 || !data.playlists) {
    throw new Error("NetEase hot playlists failed: bad response")
  }

  return data.playlists.map(normalizeWyPlaylist)
}

// --- detail (mirrors src/lib/charts/wy.ts) ---
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
  id?: number | string
  maxBrLevel?: string
  maxbr?: number
}

interface WyTrackRaw {
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

interface WyPlaylistDetailResponse {
  code?: number
  playlist?: {
    tracks?: WyTrackRaw[]
    trackIds?: { id?: number | string }[]
  }
}

interface WySongDetailResponse {
  code?: number
  songs?: WyTrackRaw[]
  privileges?: WyPrivilegeRaw[]
}

// playlist/detail only inlines the first ~10 full track objects; the rest live
// in trackIds. Expand them via song/detail, but cap the total + chunk requests
// so a giant playlist doesn't fire dozens of calls.
const MAX_DETAIL_SONGS = 1000
const SONG_DETAIL_CHUNK = 500

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

const QUALITY_ORDER: Quality[] = ["flac24bit", "flac", "320k", "128k"]

function normalizeWyTrack(item: WyTrackRaw): MusicInfo {
  const qualitys: MusicQuality[] = []
  const privilege = item.privilege ?? {}
  const maxbr = privilege.maxbr ?? 0

  // Detect each tier from EITHER the privilege bitrate cascade OR the presence of
  // the matching audio-file object (hr/sq/h/l). The file objects reflect the
  // song's intrinsic catalog availability and survive the anonymous song/detail
  // `maxbr` cap on VIP songs, so playlist tracks aren't wrongly limited to 128k.
  if (privilege.maxBrLevel === "hires" || item.hr) {
    qualitys.push({ type: "flac24bit", size: item.hr ? sizeFormate(item.hr.size ?? 0) : null })
  }
  if (maxbr >= 999000 || item.sq) {
    qualitys.push({ type: "flac", size: item.sq ? sizeFormate(item.sq.size ?? 0) : null })
  }
  if (maxbr >= 320000 || item.h) {
    qualitys.push({ type: "320k", size: item.h ? sizeFormate(item.h.size ?? 0) : null })
  }
  if (maxbr >= 128000 || item.l) {
    qualitys.push({ type: "128k", size: item.l ? sizeFormate(item.l.size ?? 0) : null })
  }
  if (qualitys.length === 0) qualitys.push({ type: "128k", size: null })

  // De-dupe + order ascending (128k first), matching reference types.reverse().
  const byType = new Map<Quality, MusicQuality>()
  for (const q of qualitys) if (!byType.has(q.type)) byType.set(q.type, q)
  const ordered = QUALITY_ORDER.filter((t) => byType.has(t))
    .map((t) => byType.get(t)!)
    .reverse()

  const _qualitys = indexQualitySizes(ordered)

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

// Fetch full song objects for a list of ids (chunked). playlist/detail only
// inlines the first ~10 tracks, so the rest must be expanded here. song/detail
// returns the privilege (quality) info in a parallel `privileges` array, so we
// merge it back onto each song by id before normalizing.
async function getWySongDetails(ids: (number | string)[]): Promise<MusicInfo[]> {
  const out: MusicInfo[] = []
  for (let i = 0; i < ids.length; i += SONG_DETAIL_CHUNK) {
    const chunk = ids.slice(i, i + SONG_DETAIL_CHUNK)
    const c = JSON.stringify(chunk.map((id) => ({ id })))
    let data: WySongDetailResponse | null = null
    try {
      data = await eapiPost<WySongDetailResponse>("/api/v3/song/detail", { c }, "NetEase song detail")
    } catch {
      data = null
    }
    if (!data || data.code !== 200 || !data.songs) continue
    const privById = new Map<string, WyPrivilegeRaw>()
    for (const p of data.privileges ?? []) if (p.id != null) privById.set(String(p.id), p)
    for (const s of data.songs) {
      out.push(normalizeWyTrack({ ...s, privilege: s.privilege ?? privById.get(String(s.id)) }))
    }
  }
  return out
}

// page is ignored — the whole list (up to MAX_DETAIL_SONGS) is returned at once.
export async function getWyPlaylistDetail(id: string, _page = 1): Promise<MusicInfo[]> {
  const payload = { id, n: LIMIT_SONG, s: 0 }

  const data = await eapiPost<WyPlaylistDetailResponse>(
    "/api/v3/playlist/detail",
    payload,
    "NetEase playlist detail"
  )
  if (!data || data.code !== 200 || !data.playlist) {
    throw new Error("NetEase playlist detail failed: bad response")
  }

  const tracks = data.playlist.tracks ?? []
  const trackIds = data.playlist.trackIds ?? []

  // Expand the full list via song/detail when playlist/detail truncated `tracks`
  // (large playlists like the default "我喜欢的音乐"). Reorder to the playlist's
  // own order, and fall back to the inlined tracks if the expansion fails.
  if (trackIds.length > tracks.length) {
    const ids = trackIds
      .map((t) => t?.id)
      .filter((x): x is number | string => x != null)
      .slice(0, MAX_DETAIL_SONGS)
    const songs = await getWySongDetails(ids)
    if (songs.length) {
      const byId = new Map(songs.map((s) => [s.meta.songId, s]))
      const ordered = ids.map((x) => byId.get(String(x))).filter((s): s is MusicInfo => !!s)
      if (ordered.length) return ordered
    }
  }

  return tracks.map(normalizeWyTrack)
}
