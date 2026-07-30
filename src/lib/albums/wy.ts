import { httpFetch as tauriFetch } from "@/lib/http"
import { eapi } from "@/lib/platforms/wy/eapi"
import type { MusicInfo, MusicQuality, Quality } from "@/types/music"
import { indexQualitySizes } from "@/lib/quality"
import { formatDuration } from "@/lib/utils"
import type { AlbumDetail } from "./index"
import type { Album, AlbumTag } from "./index"
import { formatAlbumDate, parseSongCount } from "./date"

// NetEase album detail via eapi. Prefer /api/v1/album/{id} (songs + album info
// in one response); fall back to /api/album/v3/detail. Song shape matches
// playlists/wy.ts (normalize not exported — slim copy here).

interface WySingerRaw {
  name?: string
}

interface WyAlbumRaw {
  id?: number | string
  name?: string
  picUrl?: string
  blurPicUrl?: string
  artist?: { name?: string }
  artists?: WySingerRaw[]
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

interface WyAlbumDetailResponse {
  code?: number
  songs?: WyTrackRaw[]
  album?: WyAlbumRaw
}

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

function albumAuthor(album: WyAlbumRaw | undefined): string | undefined {
  if (album?.artist?.name) return album.artist.name
  if (album?.artists?.length) {
    const names = album.artists.map((a) => a.name).filter(Boolean)
    if (names.length) return names.join("、")
  }
  return undefined
}

/** NetEase covers often need https + size param or they 404 / stay blank. */
function wyAlbumCover(url?: string | null): string | null {
  if (!url) return null
  let u = String(url).replace(/^http:\/\//i, "https://")
  if (!/[?&]param=/.test(u)) {
    u += (u.includes("?") ? "&" : "?") + "param=240y240"
  }
  return u
}

async function fetchWyAlbum(id: string): Promise<WyAlbumDetailResponse> {
  try {
    const data = await eapiPost<WyAlbumDetailResponse>(
      `/api/v1/album/${id}`,
      {},
      "NetEase album detail"
    )
    if (data && (data.code === 200 || data.code === 502) && (data.songs || data.album)) {
      return data
    }
  } catch {
    /* try v3 */
  }

  return eapiPost<WyAlbumDetailResponse>(
    "/api/album/v3/detail",
    { id },
    "NetEase album detail v3"
  )
}

/** page is ignored — album endpoints return the full track list. */
export async function getWyAlbumDetail(id: string, _page = 1): Promise<AlbumDetail> {
  const data = await fetchWyAlbum(id)
  if (!data || (data.code !== 200 && data.code !== 502)) {
    throw new Error("NetEase album detail failed: bad response")
  }

  const album = data.album
  const info = {
    name: album?.name ?? "",
    img: wyAlbumCover(album?.picUrl ?? album?.blurPicUrl),
    author: albumAuthor(album),
  }

  const list = (data.songs ?? []).map(normalizeWyTrack)
  return { info, list }
}

// --- hot / new albums (eapi /api/album/new) ---
const WY_ALBUM_AREAS: AlbumTag[] = [
  { id: "ZH", name: "华语" },
  { id: "EA", name: "欧美" },
  { id: "KR", name: "韩国" },
  { id: "JP", name: "日本" },
]

const LIMIT_HOT = 30

interface WyHotAlbumRaw {
  id?: number | string
  name?: string
  picUrl?: string
  blurPicUrl?: string
  publishTime?: number
  size?: number
  artist?: { name?: string }
  artists?: WySingerRaw[]
}

interface WyHotAlbumsResponse {
  code?: number
  albums?: WyHotAlbumRaw[]
}

export async function getWyAlbumTags(): Promise<AlbumTag[]> {
  return WY_ALBUM_AREAS
}

export async function getWyHotAlbums(page = 1, tagId?: string | null): Promise<Album[]> {
  const area = !tagId || tagId === "ALL" ? "ALL" : tagId
  const data = await eapiPost<WyHotAlbumsResponse>(
    "/api/album/new",
    {
      area,
      limit: LIMIT_HOT,
      offset: LIMIT_HOT * (page - 1),
      total: true,
    },
    "NetEase hot albums"
  )
  if (!data || (data.code !== 200 && data.code !== 502)) {
    throw new Error("NetEase hot albums failed: bad response")
  }
  return (data.albums ?? []).map(
    (a): Album => ({
      id: String(a.id),
      name: a.name ?? "",
      img: wyAlbumCover(a.picUrl ?? a.blurPicUrl),
      author: albumAuthor(a),
      publishTime: formatAlbumDate(a.publishTime),
      songCount: parseSongCount(a.size),
      source: "wy",
    })
  )
}
