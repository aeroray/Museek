import { httpFetch as tauriFetch } from "@/lib/http"
import type { MusicInfo, MusicQuality, Quality } from "@/types/music"
import { indexQualitySizes } from "@/lib/quality"
import type { AlbumDetail } from "./index"
import type { Album, AlbumTag } from "./index"

// Ported from lx-music-desktop kw/album.js — search.kuwo.cn albuminfo.
// Body may be JSON or a single-quoted JSON-like string (objStr2JSON).

const LIMIT_SONG = 1000

const formatToQuality: Record<string, Quality> = {
  MP3128: "128k",
  MP3H: "320k",
  ALFLAC: "flac",
  HIRFLAC: "flac24bit",
}

/** lx-music kw/util.js objStr2JSON — single-quote → double-quote for JSON.parse. */
function objStr2JSON(raw: unknown): Record<string, unknown> {
  if (raw != null && typeof raw === "object") return raw as Record<string, unknown>
  const str = String(raw ?? "")
  try {
    return JSON.parse(str) as Record<string, unknown>
  } catch {
    /* fall through */
  }
  const fixed = str.replace(
    /('(?=(,\s*')))|('(?=:))|((?<=([:,]\s*))')|((?<={)')|('(?=}))/g,
    '"'
  )
  return JSON.parse(fixed) as Record<string, unknown>
}

function decodeKwName(name: string | undefined | null): string {
  if (!name) return ""
  try {
    return decodeURIComponent(String(name).replace(/\+/g, " "))
  } catch {
    return String(name)
  }
}

function formatSinger(raw: string | undefined): string {
  return (raw || "").replace(/&/g, "、")
}

interface KwAlbumSongRaw {
  id?: string | number
  name?: string
  artist?: string
  formats?: string
  pic?: string
}

interface KwAlbumBody {
  musiclist?: KwAlbumSongRaw[]
  name?: string
  albumid?: string | number
  img?: string
  hts_img?: string
  artist?: string
  info?: string
  songnum?: string | number
}

function normalizeKwAlbumSong(
  raw: KwAlbumSongRaw,
  albumName: string,
  albumId: string
): MusicInfo {
  const formats = String(raw.formats ?? "").split("|")
  const qualitys: MusicQuality[] = []
  for (const f of formats) {
    const q = formatToQuality[f]
    if (q) qualitys.push({ type: q, size: null })
  }
  if (qualitys.length === 0) qualitys.push({ type: "128k", size: null })
  const _qualitys = indexQualitySizes(qualitys)

  const songId = String(raw.id ?? "")
  return {
    id: `kw_${songId}`,
    name: decodeKwName(raw.name),
    singer: formatSinger(decodeKwName(raw.artist)),
    source: "kw",
    interval: "0:00",
    albumName,
    meta: {
      songId,
      albumId,
      picUrl: raw.pic || null,
      qualitys,
      _qualitys,
    },
  }
}

export async function getKwAlbumDetail(id: string, page = 1, retryNum = 0): Promise<AlbumDetail> {
  if (retryNum > 2) throw new Error("KuWo album detail failed: try max num")

  const url =
    `http://search.kuwo.cn/r.s?pn=${page - 1}&rn=${LIMIT_SONG}` +
    `&stype=albuminfo&albumid=${encodeURIComponent(id)}` +
    `&show_copyright_off=0&encoding=utf&vipver=MUSIC_9.1.0`

  const res = await tauriFetch(url, {
    method: "GET",
    headers: {
      Referer: "https://www.kuwo.cn/",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  })

  if (!res.ok) return getKwAlbumDetail(id, page, retryNum + 1)

  let body: KwAlbumBody
  try {
    const text = await res.text()
    body = objStr2JSON(text) as KwAlbumBody
  } catch {
    return getKwAlbumDetail(id, page, retryNum + 1)
  }

  if (!body.musiclist) return getKwAlbumDetail(id, page, retryNum + 1)

  const albumName = decodeKwName(body.name)
  const albumId = body.albumid != null ? String(body.albumid) : id

  return {
    info: {
      name: albumName,
      img: body.img || body.hts_img || null,
      author: decodeKwName(body.artist) || undefined,
    },
    list: body.musiclist.map((item) => normalizeKwAlbumSong(item, albumName, albumId)),
  }
}

// KuWo has no stable album plaza API; derive unique albums from bang charts.
const KW_ALBUM_BANGS: AlbumTag[] = [
  { id: "17", name: "新歌榜" },
  { id: "16", name: "热歌榜" },
  { id: "93", name: "飙升榜" },
]

export async function getKwAlbumTags(): Promise<AlbumTag[]> {
  return KW_ALBUM_BANGS
}

export async function getKwHotAlbums(page = 1, tagId?: string | null): Promise<Album[]> {
  // Only page 1 is meaningful for bang-derived lists.
  if (page > 1) return []
  const bangId = tagId && /^\d+$/.test(tagId) ? tagId : "17"
  const { getKwBoardSongs } = await import("@/lib/charts/kw")
  const songs = await getKwBoardSongs(`kw__${bangId}`, 1)
  const seen = new Set<string>()
  const albums: Album[] = []
  for (const song of songs) {
    const id = song.meta.albumId
    if (!id || seen.has(id)) continue
    seen.add(id)
    albums.push({
      id,
      name: song.albumName || song.name,
      img: song.meta.picUrl ?? null,
      author: song.singer || undefined,
      source: "kw",
    })
  }
  return albums
}
