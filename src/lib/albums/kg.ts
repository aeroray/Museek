import { httpFetch as tauriFetch } from "@/lib/http"
import type { MusicInfo, MusicQuality } from "@/types/music"
import { indexQualitySizes } from "@/lib/quality"
import { formatDuration } from "@/lib/utils"
import type { AlbumDetail } from "./index"
import type { Album, AlbumTag } from "./index"
import { formatAlbumDate, parseSongCount } from "./date"

// Ported from lx-music-desktop kg/album.js + musicInfo.js.
// Songs: mobiles album/song (often hash-only) → gateway resolveHashes.
// Info: POST kmrserviceretry container/v1/album.

const LIMIT = 200

const KG_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

function sizeFormate(size: number): string {
  if (!size) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const number = Math.floor(Math.log(size) / Math.log(1024))
  return `${(size / Math.pow(1024, Math.floor(number))).toFixed(2)} ${units[number]}`
}

function decodeName(str: string | null | undefined): string {
  if (!str) return ""
  try {
    return new DOMParser().parseFromString(str, "text/html").body.textContent ?? str
  } catch {
    return str
  }
}

interface KgAlbumSongRaw {
  hash?: string
  filename?: string
  album_id?: string | number
  album_audio_id?: string | number
  audio_id?: string | number
  duration?: number
  filesize?: number
  "320filesize"?: number
  sqfilesize?: number
  filesize_high?: number
  remark?: string
  trans_param?: { union_cover?: string }
}

interface KgAlbumSongResponse {
  status?: number
  errcode?: number
  data?: {
    total?: number
    info?: KgAlbumSongRaw[]
  }
  info?: KgAlbumSongRaw[]
  total?: number
}

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

interface KgAlbumMeta {
  album_name?: string
  sizable_cover?: string
  cover?: string
  author_name?: string
  intro?: string
  publish_date?: string
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

function normalizeKgSpecialSong(raw: KgAlbumSongRaw): MusicInfo | null {
  const songId = String(raw.album_audio_id ?? raw.audio_id ?? "")
  if (!songId || songId === "undefined" || !raw.hash) return null

  const qualitys: MusicQuality[] = []
  if (raw.filesize) qualitys.push({ type: "128k", size: sizeFormate(raw.filesize) })
  if (raw["320filesize"]) qualitys.push({ type: "320k", size: sizeFormate(raw["320filesize"]) })
  if (raw.sqfilesize) qualitys.push({ type: "flac", size: sizeFormate(raw.sqfilesize) })
  if (raw.filesize_high) qualitys.push({ type: "flac24bit", size: sizeFormate(raw.filesize_high) })
  if (qualitys.length === 0) qualitys.push({ type: "128k", size: null })

  const _qualitys = indexQualitySizes(qualitys)
  const filename = decodeName(raw.filename)
  let singer = ""
  let name = filename
  const sep = filename.indexOf(" - ")
  if (sep > 0) {
    singer = filename.slice(0, sep)
    name = filename.slice(sep + 3)
  }
  const cover = raw.trans_param?.union_cover

  return {
    id: `kg_${songId}`,
    name,
    singer,
    source: "kg",
    interval: formatDuration(raw.duration || 0),
    albumName: decodeName(raw.remark),
    meta: {
      songId,
      albumId: raw.album_id != null ? String(raw.album_id) : "",
      picUrl: cover ? cover.replace("{size}", "240") : null,
      hash: raw.hash,
      qualitys,
      _qualitys,
    },
  }
}

/** Resolve hash-only rows via gateway (mirrors playlists/kg resolveHashes). */
async function resolveHashes(hashes: string[]): Promise<KgGatewaySong[]> {
  const out: KgGatewaySong[] = []
  for (let i = 0; i < hashes.length; i += 100) {
    const chunk = hashes.slice(i, i + 100)
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
      data: chunk.map((hash) => ({ hash })),
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

    if (!res.ok) throw new Error(`KuGou album hash resolve failed: ${res.status}`)
    const json = (await res.json()) as { data?: KgGatewaySong[][] }
    for (const group of json.data ?? []) {
      if (group?.[0]) out.push(group[0])
    }
  }
  return out
}

async function getAlbumInfo(id: string): Promise<{
  name: string
  img: string | null
  author?: string
}> {
  const res = await tauriFetch(
    "http://kmrserviceretry.kugou.com/container/v1/album?dfid=1tT5He3kxrNC4D29ad1MMb6F&mid=22945702112173152889429073101964063697&userid=0&appid=1005&clientver=11589",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": KG_UA,
      },
      body: JSON.stringify({
        appid: 1005,
        clienttime: 1681833686,
        clientver: 11589,
        data: [{ album_id: id }],
        fields:
          "language,grade_count,intro,mix_intro,heat,category,sizable_cover,cover,album_name,type,quality,publish_company,grade,special_tag,author_name,publish_date,language_id,album_id,exclusive,is_publish,trans_param,authors,album_tag",
        isBuy: 0,
        key: "e6f3306ff7e2afb494e89fbbda0becbf",
        mid: "22945702112173152889429073101964063697",
        show_album_tag: 0,
      }),
    }
  )

  if (!res.ok) throw new Error(`KuGou album info failed: ${res.status}`)
  const json = (await res.json()) as KgAlbumMeta[] | { data?: KgAlbumMeta[] }
  const row = Array.isArray(json) ? json[0] : json.data?.[0]
  if (!row) throw new Error("KuGou album info failed: empty")

  const cover = row.sizable_cover || row.cover || null
  return {
    name: row.album_name ?? "",
    img: cover ? String(cover).replace("{size}", "240") : null,
    author: row.author_name || undefined,
  }
}

export async function getKgAlbumDetail(id: string, page = 1): Promise<AlbumDetail> {
  const songUrl =
    `http://mobiles.kugou.com/api/v3/album/song?version=9108&albumid=${encodeURIComponent(id)}` +
    `&plat=0&pagesize=${LIMIT}&area_code=0&page=${page}&with_res_tag=0`

  const [songRes, info] = await Promise.all([
    tauriFetch(songUrl, {
      method: "GET",
      headers: { Referer: "https://m.kugou.com/", "User-Agent": KG_UA },
    }),
    getAlbumInfo(id),
  ])

  if (!songRes.ok) throw new Error(`KuGou album songs failed: ${songRes.status}`)

  const songJson = (await songRes.json()) as KgAlbumSongResponse
  // mobiles may nest under data.info or expose info at top level (lx createHttpFetch unwrap).
  const rawList = songJson.data?.info ?? songJson.info ?? []
  if (!rawList.length) {
    return { info, list: [] }
  }

  const hashes = rawList.map((s) => s.hash).filter((h): h is string => !!h)
  if (hashes.length) {
    try {
      const gateway = await resolveHashes(hashes)
      const list: MusicInfo[] = []
      const seen = new Set<string>()
      for (const raw of gateway) {
        const song = normalizeKgGatewaySong(raw)
        if (!song || seen.has(song.meta.songId)) continue
        seen.add(song.meta.songId)
        list.push(song)
      }
      if (list.length) return { info, list }
    } catch {
      /* fall through to special-song shape */
    }
  }

  const list: MusicInfo[] = []
  const seen = new Set<string>()
  for (const raw of rawList) {
    const song = normalizeKgSpecialSong(raw)
    if (!song || seen.has(song.meta.songId)) continue
    seen.add(song.meta.songId)
    list.push(song)
  }
  return { info, list }
}

// --- album plaza (yueku album index) ---
const LIMIT_HOT = 30

const KG_ALBUM_LANGS: AlbumTag[] = [
  { id: "1", name: "华语" },
  { id: "2", name: "欧美" },
  { id: "3", name: "日语" },
  { id: "4", name: "韩语" },
  { id: "5", name: "其他" },
]

interface KgPlazaAlbumRaw {
  albumid?: number | string
  albumname?: string
  img?: string
  singername?: string
  publish_time?: string
  song_count?: number
}

interface KgPlazaResponse {
  status?: number
  data?: {
    /** Yueku index nests albums under data.data (not info). */
    data?: KgPlazaAlbumRaw[]
    info?: KgPlazaAlbumRaw[]
    total?: number
  }
}

export async function getKgAlbumTags(): Promise<AlbumTag[]> {
  return KG_ALBUM_LANGS
}

export async function getKgHotAlbums(page = 1, tagId?: string | null): Promise<Album[]> {
  const lang = tagId && /^\d+$/.test(tagId) ? tagId : "1"
  const url =
    `http://www2.kugou.kugou.com/yueku/v9/album/index?is_ajax=1&cdn=cdn` +
    `&p=${page}&s=${LIMIT_HOT}&l=${encodeURIComponent(lang)}&c=&t=0`
  const res = await tauriFetch(url, {
    method: "GET",
    headers: { "User-Agent": KG_UA, Referer: "https://www.kugou.com/" },
  })
  if (!res.ok) throw new Error(`KuGou hot albums failed: ${res.status}`)
  const data = (await res.json()) as KgPlazaResponse
  const list = data?.data?.data ?? data?.data?.info ?? []
  if (!list.length && data?.status != null && data.status !== 1) {
    throw new Error("KuGou hot albums failed: bad response")
  }
  return list
    .map(
      (item): Album => ({
        id: String(item.albumid ?? ""),
        name: item.albumname ?? "",
        img: item.img ? String(item.img).replace("{size}", "240") : null,
        author: item.singername || undefined,
        publishTime: formatAlbumDate(item.publish_time),
        songCount: parseSongCount(item.song_count),
        source: "kg",
      })
    )
    .filter((a) => a.id && a.name)
}
