import { httpFetch as tauriFetch } from "@/lib/http"
import type { MusicInfo, MusicQuality, Quality } from "@/types/music"
import { indexQualitySizes } from "@/lib/quality"
import { formatDuration } from "@/lib/utils"
import type { Playlist, PlaylistDetail } from "./index"

// Ported from lx-music-desktop: src/renderer/utils/musicSdk/kw/songList.js
// Hot playlists come from the unsigned getRcmPlayList endpoint (the "default"
// recommended list, order=hot). Detail uses the pl.svc getlistinfo endpoint
// (the digest-8 path in the reference), which returns musiclist[] with the same
// N_MINFO quality strings the search/chart modules already parse. No signing.
// Song normalization mirrors src/lib/charts/kw.ts.

const LIMIT_LIST = 36
const LIMIT_SONG = 1000

// --- quality parsing (mirrors src/lib/charts/kw.ts) ---
const bitrateToQuality: Record<string, Quality> = {
  "4000": "flac24bit",
  "2000": "flac",
  "320": "320k",
  "128": "128k",
}

// N_MINFO entries look like: "level:hh,bitrate:2000,format:flac,size:35.69MB;..."
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

// Mirrors kw/songList.js formatPlayCount.
function formatPlayCount(num: number): string {
  if (num > 100000000) return `${Math.trunc(num / 10000000) / 10}亿`
  if (num > 10000) return `${Math.trunc(num / 1000) / 10}万`
  return String(num)
}

// --- hot list ---
interface KwRcmPlaylistRaw {
  id: string | number
  name: string
  img?: string
  listencnt?: number
}

interface KwRcmResponse {
  code?: number | string
  data?: {
    data?: KwRcmPlaylistRaw[]
  }
}

function normalizeKwPlaylist(raw: KwRcmPlaylistRaw): Playlist {
  const listencnt = Number(raw.listencnt)
  return {
    id: String(raw.id),
    name: raw.name,
    img: raw.img || null,
    playCount: isNaN(listencnt) || listencnt === 0 ? undefined : formatPlayCount(listencnt),
    source: "kw",
  }
}

export async function getKwHotPlaylists(page = 1): Promise<Playlist[]> {
  const url =
    `http://wapi.kuwo.cn/api/pc/classify/playlist/getRcmPlayList` +
    `?loginUid=0&loginSid=0&appUid=76039576&pn=${page}&rn=${LIMIT_LIST}&order=hot`

  const res = await tauriFetch(url, {
    method: "GET",
    headers: {
      Referer: "https://www.kuwo.cn/",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  })

  if (!res.ok) throw new Error(`KuWo hot playlists failed: ${res.status}`)

  const data = (await res.json()) as KwRcmResponse
  if (!data || String(data.code) !== "200" || !data.data?.data) {
    throw new Error("KuWo hot playlists failed: bad response")
  }

  return data.data.data.map(normalizeKwPlaylist)
}

// --- detail ---
interface KwListSongRaw {
  id: string | number
  name: string
  artist: string
  album: string
  albumid: string | number
  duration: string | number
  N_MINFO?: string
}

interface KwListDetailResponse {
  result?: string
  musiclist?: KwListSongRaw[]
  title?: string
  pic?: string
  uname?: string
}

function normalizeKwListSong(raw: KwListSongRaw): MusicInfo {
  const songId = String(raw.id)
  const qualitys = raw.N_MINFO ? parseNMinfo(raw.N_MINFO) : []
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
      albumId: raw.albumid != null ? String(raw.albumid) : "",
      picUrl: null,
      qualitys,
      _qualitys,
    },
  }
}

export async function getKwPlaylistDetail(id: string, page = 1): Promise<PlaylistDetail> {
  const url =
    `http://nplserver.kuwo.cn/pl.svc?op=getlistinfo&pid=${id}&pn=${page - 1}&rn=${LIMIT_SONG}` +
    `&encode=utf8&keyset=pl2012&identity=kuwo&pcmp4=1&vipver=MUSIC_9.0.5.0_W1&newver=1`

  const res = await tauriFetch(url, {
    method: "GET",
    headers: {
      Referer: "https://www.kuwo.cn/",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  })

  if (!res.ok) throw new Error(`KuWo playlist detail failed: ${res.status}`)

  const data = (await res.json()) as KwListDetailResponse
  if (!data || data.result !== "ok" || !data.musiclist) {
    throw new Error("KuWo playlist detail failed: bad response")
  }

  return {
    info: {
      name: data.title ?? "",
      img: data.pic || null,
      author: data.uname,
    },
    list: data.musiclist.map(normalizeKwListSong),
  }
}
