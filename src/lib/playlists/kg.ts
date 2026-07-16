import { httpFetch as tauriFetch } from "@/lib/http"
import type { MusicInfo, MusicQuality } from "@/types/music"
import { indexQualitySizes } from "@/lib/quality"
import { formatDuration } from "@/lib/utils"
import type { Playlist } from "./index"

// Ported from lx-music-desktop: src/renderer/utils/musicSdk/kg/songList.js
// Hot playlists use the unsigned v9 getSpecial endpoint with t=5 (推荐 — the
// default sort, sortList[0]), which returns special_db[] directly.
// Detail is the hard part: the reference scrapes the special "single" HTML page
// for a `global.data = [...]` array of { hash } objects, then resolves full song
// info by batch-POSTing those hashes to the gateway album_audio/audio endpoint
// (static key + KG-* headers, no per-request signature). Both steps are ported
// here. Song normalization mirrors src/lib/search/kg.ts / src/lib/charts/kg.ts.

const LIMIT_LIST = 30
// 推荐 sort id (sortList[0] in the reference).
const SORT_RECOMMEND = 5

// Mirrors src/lib/search/kg.ts sizeFormate
function sizeFormate(size: number): string {
  if (!size) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const number = Math.floor(Math.log(size) / Math.log(1024))
  return `${(size / Math.pow(1024, Math.floor(number))).toFixed(2)} ${units[number]}`
}

// Mirrors src/lib/search/kg.ts decodeName (HTML entity decode)
function decodeName(str: string | null | undefined): string {
  if (!str) return ""
  try {
    return new DOMParser().parseFromString(str, "text/html").body.textContent ?? str
  } catch {
    return str
  }
}

// Mirrors renderer/utils/index.ts formatPlayCount
function formatPlayCount(num: number): string {
  if (num > 100000000) return `${Math.trunc(num / 10000000) / 10}亿`
  if (num > 10000) return `${Math.trunc(num / 1000) / 10}万`
  return String(num)
}

// --- hot list ---
interface KgSpecialRaw {
  specialid: string | number
  specialname: string
  imgurl?: string
  img?: string
  play_count?: number
  total_play_count?: string
}

interface KgSpecialResponse {
  status?: number
  special_db?: KgSpecialRaw[]
}

function normalizeKgSpecial(raw: KgSpecialRaw): Playlist {
  // total_play_count is already a display string; play_count is numeric.
  let playCount: string | undefined
  if (raw.total_play_count) playCount = raw.total_play_count
  else if (raw.play_count) playCount = formatPlayCount(raw.play_count)

  const img = raw.img || raw.imgurl || null
  return {
    // Prefix with id_ so it matches the reference's getDetailPageUrl handling
    // (getKgPlaylistDetail strips it).
    id: `id_${raw.specialid}`,
    name: raw.specialname,
    img: img ? img.replace("{size}", "240") : null,
    playCount,
    source: "kg",
  }
}

export async function getKgHotPlaylists(page = 1): Promise<Playlist[]> {
  const url =
    `http://www2.kugou.kugou.com/yueku/v9/special/getSpecial` +
    `?is_ajax=1&cdn=cdn&t=${SORT_RECOMMEND}&c=&p=${page}`

  const res = await tauriFetch(url, {
    method: "GET",
    headers: {
      Referer: "https://www.kugou.com/",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  })

  if (!res.ok) throw new Error(`KuGou hot playlists failed: ${res.status}`)

  const data = (await res.json()) as KgSpecialResponse
  if (!data || data.status !== 1 || !data.special_db) {
    throw new Error("KuGou hot playlists failed: bad response")
  }

  return data.special_db.slice(0, LIMIT_LIST).map(normalizeKgSpecial)
}

// --- detail ---
// Step 1: scrape the special "single" HTML page for `global.data = [...]`.
const listDataRx = /global\.data = (\[.+?\]);/
const htmlLinkRx = /^.+\/(\d+)\.html(?:\?.*|&.*$|#.*$|$)/

interface KgGlobalSong {
  hash?: string
}

// Step 2 response: gateway album_audio/audio returns nested arrays of audio info.
interface KgAudioInfoRaw {
  audio_id?: string | number
  hash?: string
  filesize?: string
  filesize_320?: string
  filesize_flac?: string
  filesize_high?: string
  timelength?: string
}
interface KgAlbumInfoRaw {
  album_name?: string
  album_id?: string | number
}
interface KgGatewaySong {
  songname?: string
  author_name?: string
  audio_info?: KgAudioInfoRaw
  album_info?: KgAlbumInfoRaw
}

function normalizeKgGatewaySong(raw: KgGatewaySong): MusicInfo | null {
  const audio = raw.audio_info
  if (!audio?.audio_id) return null

  const qualitys: MusicQuality[] = []
  if (audio.filesize && audio.filesize !== "0")
    qualitys.push({ type: "128k", size: sizeFormate(parseInt(audio.filesize)) })
  if (audio.filesize_320 && audio.filesize_320 !== "0")
    qualitys.push({ type: "320k", size: sizeFormate(parseInt(audio.filesize_320)) })
  if (audio.filesize_flac && audio.filesize_flac !== "0")
    qualitys.push({ type: "flac", size: sizeFormate(parseInt(audio.filesize_flac)) })
  if (audio.filesize_high && audio.filesize_high !== "0")
    qualitys.push({ type: "flac24bit", size: sizeFormate(parseInt(audio.filesize_high)) })
  if (qualitys.length === 0) qualitys.push({ type: "128k", size: null })

  const _qualitys = indexQualitySizes(qualitys)

  // songId is the album_audio_id (audio_id); hash is the standard FileHash.
  const songId = String(audio.audio_id)
  const duration = parseInt(String(audio.timelength ?? "0"))

  return {
    id: `kg_${songId}`,
    name: decodeName(raw.songname),
    singer: decodeName(raw.author_name),
    source: "kg",
    interval: isNaN(duration) ? "0:00" : formatDuration(duration / 1000),
    albumName: decodeName(raw.album_info?.album_name),
    meta: {
      songId,
      albumId: raw.album_info?.album_id != null ? String(raw.album_info.album_id) : "",
      picUrl: null,
      hash: audio.hash,
      qualitys,
      _qualitys,
    },
  }
}

// Resolve full song info for a batch of hashes via the gateway (mirrors
// kg/songList.js createTask: static key + KG-* headers, no signature param).
async function resolveHashes(hashes: string[]): Promise<KgGatewaySong[]> {
  const body = {
    area_code: "1",
    show_privilege: 1,
    show_album_info: "1",
    is_publish: "",
    appid: 1005,
    clientver: 11451,
    mid: "1",
    dfid: "-",
    clienttime: Date.now(),
    key: "OIlwieks28dk2k092lksi2UIkp",
    fields: "album_info,author_name,audio_info,ori_audio_name,base,songname",
    data: hashes.map((hash) => ({ hash })),
  }

  const res = await tauriFetch("http://gateway.kugou.com/v2/album_audio/audio", {
    method: "POST",
    headers: {
      "KG-THash": "13a3164",
      "KG-RC": "1",
      "KG-Fake": "0",
      "KG-RF": "00869891",
      "User-Agent": "Android712-AndroidPhone-11451-376-0-FeeCacheUpdate-wifi",
      "x-router": "kmr.service.kugou.com",
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) throw new Error(`KuGou playlist detail failed: ${res.status}`)

  // Response data is an array of single-element arrays ([s] -> s[0]).
  const json = (await res.json()) as { data?: KgGatewaySong[][] }
  return (json.data ?? []).map((group) => group?.[0]).filter(Boolean) as KgGatewaySong[]
}

export async function getKgPlaylistDetail(id: string, _page = 1): Promise<MusicInfo[]> {
  // Accept the id_<specialid> form produced by getKgHotPlaylists, a bare numeric
  // id, or a www.kugou.com/.../<id>.html link.
  let specialId = id
  if (specialId.startsWith("id_")) specialId = specialId.slice(3)
  else if (htmlLinkRx.test(specialId)) specialId = specialId.replace(htmlLinkRx, "$1")

  // Step 1: fetch the special "single" page and extract the hash list.
  const pageUrl = `http://www2.kugou.kugou.com/yueku/v9/special/single/${specialId}-5-9999.html`
  const pageRes = await tauriFetch(pageUrl, {
    method: "GET",
    headers: {
      Referer: "https://www.kugou.com/",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  })
  if (!pageRes.ok) throw new Error(`KuGou playlist detail failed: ${pageRes.status}`)

  const html = await pageRes.text()
  const match = html.match(listDataRx)
  if (!match) throw new Error("KuGou playlist detail failed: list data not found")

  const songs = JSON.parse(match[1]) as KgGlobalSong[]
  const hashes: string[] = []
  const seenHash = new Set<string>()
  for (const s of songs) {
    if (!s.hash || seenHash.has(s.hash)) continue
    seenHash.add(s.hash)
    hashes.push(s.hash)
  }
  if (hashes.length === 0) return []

  // Step 2: resolve hashes via the gateway in batches of 100.
  const groups: KgGatewaySong[][] = []
  for (let i = 0; i < hashes.length; i += 100) {
    groups.push(await resolveHashes(hashes.slice(i, i + 100)))
  }

  const seenId = new Set<string>()
  const list: MusicInfo[] = []
  for (const raw of groups.flat()) {
    const song = normalizeKgGatewaySong(raw)
    if (!song) continue
    if (seenId.has(song.meta.songId)) continue
    seenId.add(song.meta.songId)
    list.push(song)
  }
  return list
}
