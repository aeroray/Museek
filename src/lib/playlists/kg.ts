import { httpFetch as tauriFetch } from "@/lib/http"
import { getKgBoardSongs, kgBoards } from "@/lib/charts/kg"
import { signatureParams } from "@/lib/platforms/kg/sign"
import type { MusicInfo, MusicQuality } from "@/types/music"
import { indexQualitySizes } from "@/lib/quality"
import { formatDuration } from "@/lib/utils"
import type { Playlist, PlaylistDetail, PlaylistDetailInfo, PlaylistTag } from "./index"

// Ported from lx-music-desktop: src/renderer/utils/musicSdk/kg/songList.js
// Hot playlists use the unsigned v9 getSpecial endpoint with t=5 (推荐 — the
// default sort, sortList[0]), which returns special_db[] directly.
// Detail prefers mobilecdn special/song (+ special/info). User collections use
// signed mobiles song_v2 / info_v2. HTML scrape is a last-resort fallback.

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

const KG_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
const KG_MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 11_0 like Mac OS X) AppleWebKit/604.1.38 (KHTML, like Gecko) Version/11.0 Mobile/15A372 Safari/604.1"

// --- hot list ---
interface KgSpecialRaw {
  specialid: string | number
  specialname: string
  imgurl?: string
  img?: string
  play_count?: number
  total_play_count?: string
  nickname?: string
  author?: string
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
    author: raw.nickname || raw.author || undefined,
    source: "kg",
  }
}

interface KgHotTagEntry {
  special_id?: string | number
  special_name?: string
}

interface KgTagsResponse {
  status?: number
  data?: {
    hotTag?: {
      status?: number
      data?: Record<string, KgHotTagEntry>
    }
  }
}

/** Hot tags from getSpecial?is_smarty=1 (`special_id` → list param `c`). */
export async function getKgPlaylistTags(): Promise<PlaylistTag[]> {
  const url = "http://www2.kugou.kugou.com/yueku/v9/special/getSpecial?is_smarty=1&cdn=cdn"
  const res = await tauriFetch(url, {
    method: "GET",
    headers: {
      Referer: "https://www.kugou.com/",
      "User-Agent": KG_UA,
    },
  })
  if (!res.ok) throw new Error(`KuGou playlist tags failed: ${res.status}`)

  const data = (await res.json()) as KgTagsResponse
  const hot = data?.data?.hotTag
  if (!data || data.status !== 1 || hot?.status !== 1 || !hot.data) {
    throw new Error("KuGou playlist tags failed: bad response")
  }

  const out: PlaylistTag[] = []
  const seen = new Set<string>()
  for (const key of Object.keys(hot.data)) {
    const tag = hot.data[key]
    if (tag?.special_id == null || !tag.special_name) continue
    const id = String(tag.special_id)
    if (seen.has(id)) continue
    seen.add(id)
    out.push({ id, name: tag.special_name })
  }
  return out
}

export async function getKgHotPlaylists(page = 1, tagId?: string | null): Promise<Playlist[]> {
  const c = tagId?.trim() ?? ""
  const url =
    `http://www2.kugou.kugou.com/yueku/v9/special/getSpecial` +
    `?is_ajax=1&cdn=cdn&t=${SORT_RECOMMEND}&c=${encodeURIComponent(c)}&p=${page}`

  const res = await tauriFetch(url, {
    method: "GET",
    headers: {
      Referer: "https://www.kugou.com/",
      "User-Agent": KG_UA,
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

interface KgSpecialSongRaw {
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

interface KgSpecialSongResponse {
  status?: number
  errcode?: number
  data?: {
    total?: number
    info?: KgSpecialSongRaw[]
  }
}

interface KgSpecialInfoResponse {
  status?: number
  errcode?: number
  data?: {
    specialname?: string
    imgurl?: string
    nickname?: string
    songcount?: number
    global_specialid?: string
  }
}

interface KgGlobalSongRaw {
  hash?: string
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

const listDataRx = /global\.data\s*=\s*(\[[\s\S]*?\]);/
const listInfoRx = /global = \{[\s\S]+?name: "(.+)"[\s\S]+?pic: "(.+)"[\s\S]+?\};/
const htmlLinkRx = /^.+\/(\d+)\.html(?:\?.*|&.*$|#.*$|$)/

function normalizeKgSpecialSong(raw: KgSpecialSongRaw): MusicInfo | null {
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

function mapSpecialSongs(rawList: KgSpecialSongRaw[]): MusicInfo[] {
  const seen = new Set<string>()
  const list: MusicInfo[] = []
  for (const raw of rawList) {
    const song = normalizeKgSpecialSong(raw)
    if (!song) continue
    if (seen.has(song.meta.songId)) continue
    seen.add(song.meta.songId)
    list.push(song)
  }
  return list
}

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

  const json = (await res.json()) as { data?: KgGatewaySong[][] }
  return (json.data ?? []).map((group) => group?.[0]).filter(Boolean) as KgGatewaySong[]
}

/** Classic editorial / public special via unsigned mobilecdn APIs. */
async function getDetailBySpecialId(specialId: string): Promise<PlaylistDetail | null> {
  const songUrl =
    `http://mobilecdn.kugou.com/api/v3/special/song` +
    `?plat=0&specialid=${encodeURIComponent(specialId)}&page=1&pagesize=-1&version=9108`
  const infoUrl =
    `http://mobilecdn.kugou.com/api/v3/special/info` +
    `?specialid=${encodeURIComponent(specialId)}&plat=0&version=9108`

  const headers = {
    Referer: "https://m.kugou.com/",
    "User-Agent": KG_UA,
  }

  const [songRes, infoRes] = await Promise.all([
    tauriFetch(songUrl, { method: "GET", headers }),
    tauriFetch(infoUrl, { method: "GET", headers }),
  ])

  if (!songRes.ok) return null

  const songJson = (await songRes.json()) as KgSpecialSongResponse
  if (!songJson || (songJson.errcode != null && songJson.errcode !== 0 && songJson.status !== 1)) {
    return null
  }

  const rawList = songJson.data?.info ?? []
  if (rawList.length === 0) return null

  let info: PlaylistDetailInfo = { name: "", img: null }
  if (infoRes.ok) {
    const infoJson = (await infoRes.json()) as KgSpecialInfoResponse
    const d = infoJson?.data
    if (d) {
      info = {
        name: d.specialname ?? "",
        img: d.imgurl ? d.imgurl.replace("{size}", "240") : null,
        author: d.nickname || undefined,
      }
    }
  }

  return { info, list: mapSpecialSongs(rawList) }
}

/** Resolve global_specialid for a numeric special (fallback path). */
async function getGlobalIdFromSpecial(specialId: string): Promise<string | null> {
  const url =
    `http://mobilecdn.kugou.com/api/v3/special/info` +
    `?specialid=${encodeURIComponent(specialId)}&plat=0&version=9108`
  const res = await tauriFetch(url, {
    method: "GET",
    headers: { Referer: "https://m.kugou.com/", "User-Agent": KG_UA },
  })
  if (!res.ok) return null
  const json = (await res.json()) as KgSpecialInfoResponse
  return json?.data?.global_specialid || null
}

async function fetchGlobalInfo(globalId: string): Promise<{
  specialname?: string
  imgurl?: string
  intro?: string
  nickname?: string
  playcount?: number
  songcount?: number
} | null> {
  const params =
    `appid=1058&specialid=0&global_specialid=${globalId}` +
    `&format=jsonp&srcappid=2919&clientver=20000&clienttime=1586163242519` +
    `&mid=1586163242519&uuid=1586163242519&dfid=-`
  const url =
    `https://mobiles.kugou.com/api/v5/special/info_v2?${params}` +
    `&signature=${signatureParams(params, "web")}`

  const res = await tauriFetch(url, {
    method: "GET",
    headers: {
      mid: "1586163242519",
      Referer: "https://m3ws.kugou.com/share/index.php",
      "User-Agent": KG_MOBILE_UA,
      dfid: "-",
      clienttime: "1586163242519",
    },
  })
  if (!res.ok) return null
  const json = (await res.json()) as { status?: number; errcode?: number; data?: Record<string, unknown> }
  if (!json?.data || (json.errcode != null && json.errcode !== 0 && json.status === 0)) return null
  return json.data as {
    specialname?: string
    imgurl?: string
    intro?: string
    nickname?: string
    playcount?: number
    songcount?: number
  }
}

async function fetchGlobalSongs(globalId: string, songcount: number): Promise<KgSpecialSongRaw[]> {
  const total = Math.max(songcount || 0, 1)
  const tasks: Promise<KgSpecialSongRaw[]>[] = []
  let remaining = total
  let page = 0
  while (remaining > 0) {
    const limit = remaining > 300 ? 300 : remaining
    remaining -= limit
    page += 1
    const params =
      `appid=1058&global_specialid=${globalId}&specialid=0&plat=0&version=8000` +
      `&page=${page}&pagesize=${limit}&srcappid=2919&clientver=20000` +
      `&clienttime=1586163263991&mid=1586163263991&uuid=1586163263991&dfid=-`
    const url =
      `https://mobiles.kugou.com/api/v5/special/song_v2?${params}` +
      `&signature=${signatureParams(params, "web")}`
    tasks.push(
      tauriFetch(url, {
        method: "GET",
        headers: {
          mid: "1586163263991",
          Referer: "https://m3ws.kugou.com/share/index.php",
          "User-Agent": KG_MOBILE_UA,
          dfid: "-",
          clienttime: "1586163263991",
        },
      }).then(async (res) => {
        if (!res.ok) return []
        const json = (await res.json()) as KgSpecialSongResponse
        return json.data?.info ?? []
      }),
    )
  }
  const pages = await Promise.all(tasks)
  return pages.flat()
}

/** User / shared collection via signed mobiles APIs. */
async function getDetailByGlobalId(globalId: string): Promise<PlaylistDetail> {
  if (globalId.length > 1000) throw new Error("KuGou playlist detail failed: invalid collection id")

  const meta = await fetchGlobalInfo(globalId)
  if (!meta) throw new Error("KuGou playlist detail failed: collection info not found")

  const rawList = await fetchGlobalSongs(globalId, meta.songcount ?? 0)
  return {
    info: {
      name: meta.specialname ?? "",
      img: meta.imgurl ? meta.imgurl.replace("{size}", "240") : null,
      author: meta.nickname || undefined,
    },
    list: mapSpecialSongs(rawList),
  }
}

async function decodeGcid(gcid: string): Promise<string | null> {
  const params = "dfid=-&appid=1005&mid=0&clientver=20109&clienttime=640612895&uuid=-"
  const body = {
    ret_info: 1,
    data: [{ id: gcid, id_type: 2 }],
  }
  const bodyStr = JSON.stringify(body)
  const url =
    `https://t.kugou.com/v1/songlist/batch_decode?${params}` +
    `&signature=${signatureParams(params, "android", bodyStr)}`

  const res = await tauriFetch(url, {
    method: "POST",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 10; HUAWEI HMA-AL00) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.106 Mobile Safari/537.36",
      Referer: "https://m.kugou.com/",
      "Content-Type": "application/json",
    },
    body: bodyStr,
  })
  if (!res.ok) return null
  const json = (await res.json()) as {
    errcode?: number
    data?: { list?: Array<{ global_collection_id?: string }> }
    list?: Array<{ global_collection_id?: string }>
  }
  // createHttp in lx returns body.data; raw response may nest under data.
  const list = json.data?.list ?? json.list
  return list?.[0]?.global_collection_id ?? null
}

/** Last resort: scrape special single HTML + gateway hash resolve. */
async function getDetailByHtml(specialId: string): Promise<PlaylistDetail> {
  const pageUrl = `http://www2.kugou.kugou.com/yueku/v9/special/single/${specialId}-5-9999.html`
  const pageRes = await tauriFetch(pageUrl, {
    method: "GET",
    headers: {
      Referer: "https://www.kugou.com/",
      "User-Agent": KG_UA,
    },
  })
  if (!pageRes.ok) throw new Error(`KuGou playlist detail failed: ${pageRes.status}`)

  const html = await pageRes.text()
  const match = html.match(listDataRx)
  if (!match) throw new Error("KuGou playlist detail failed: list data not found")

  const infoMatch = html.match(listInfoRx)
  const info: PlaylistDetailInfo = {
    name: infoMatch?.[1] ?? "",
    img: infoMatch?.[2] ? infoMatch[2].replace("{size}", "240") : null,
  }

  const songs = JSON.parse(match[1]) as KgGlobalSongRaw[]
  const hashes: string[] = []
  const seenHash = new Set<string>()
  for (const s of songs) {
    if (!s.hash || seenHash.has(s.hash)) continue
    seenHash.add(s.hash)
    hashes.push(s.hash)
  }
  if (hashes.length === 0) return { info, list: [] }

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
  return { info, list }
}

async function getDetailFromShareChain(chain: string): Promise<PlaylistDetail> {
  const url =
    `http://m.kugou.com/schain/transfer?pagesize=10000&chain=${encodeURIComponent(chain)}` +
    `&su=1&page=1&n=0.7928855356604456`
  const res = await tauriFetch(url, {
    method: "GET",
    headers: { "User-Agent": KG_MOBILE_UA },
  })
  if (!res.ok) throw new Error(`KuGou playlist detail failed: ${res.status}`)

  const json = (await res.json()) as {
    list?: KgSpecialSongRaw[]
    global_collection_id?: string
    info?: { name?: string; img?: string; username?: string }
  }

  if (json.global_collection_id && !json.list) {
    return getDetailByGlobalId(json.global_collection_id)
  }

  if (json.list?.length) {
    return {
      info: {
        name: json.info?.name ?? "",
        img: json.info?.img ? json.info.img.replace("{size}", "240") : null,
        author: json.info?.username || undefined,
      },
      list: mapSpecialSongs(json.list),
    }
  }

  throw new Error("KuGou playlist detail failed: share chain empty")
}

/** Rank / chart page opened via「外部歌单」. */
async function getDetailByRankId(rankId: string): Promise<PlaylistDetail> {
  const board = kgBoards.find((b) => b.id === `kg__${rankId}`)
  const list = await getKgBoardSongs(`kg__${rankId}`, 1)
  return {
    info: {
      name: board?.name ?? `酷狗榜 ${rankId}`,
      img: list[0]?.meta.picUrl ?? null,
    },
    list,
  }
}

/** Resolve songlist / share / rank pages. */
async function getDetailFromLink(link: string): Promise<PlaylistDetail> {
  let url = link.replace(/#.*$/, "")
  const rankId = /\/rank\/home\/\d+-(\d+)\.html/i.exec(url)?.[1]
  if (rankId) return getDetailByRankId(rankId)
  if (url.includes("global_collection_id=") || url.includes("global_specialid=")) {
    const m = url.match(/(?:global_collection_id|global_specialid)=([\w]+)/i)
    if (m?.[1]) return getDetailByGlobalId(m[1])
  }
  if (url.includes("gcid_")) {
    const gcid = url.match(/gcid_\w+/i)?.[0]
    if (gcid) {
      const globalId = await decodeGcid(gcid)
      if (globalId) return getDetailByGlobalId(globalId)
    }
  }
  if (url.includes("chain=")) {
    const chain = url.match(/[?&]chain=(\w+)/i)?.[1]
    if (chain) return getDetailFromShareChain(chain)
  }

  // Follow redirects / scrape page body for embedded collection id.
  const res = await tauriFetch(url, {
    method: "GET",
    headers: {
      "User-Agent": KG_MOBILE_UA,
      Referer: url,
    },
  })
  const finalUrl = (res as Response & { url?: string }).url || url
  if (finalUrl !== url) {
    if (/(?:global_collection_id|global_specialid)=([\w]+)/i.test(finalUrl)) {
      return getDetailFromLink(finalUrl)
    }
    if (/[?&]chain=(\w+)/i.test(finalUrl)) {
      return getDetailFromLink(finalUrl)
    }
  }

  if (!res.ok) throw new Error(`KuGou playlist detail failed: ${res.status}`)

  const body = await res.text()
  let globalId = body.match(/"global_collection_id"\s*:\s*"(\w+)"/)?.[1]
  if (!globalId) {
    let gcid = body.match(/"encode_gic"\s*:\s*"(\w+)"/)?.[1]
    if (!gcid) gcid = body.match(/"encode_src_gid"\s*:\s*"(\w+)"/)?.[1]
    if (gcid) globalId = (await decodeGcid(gcid)) ?? undefined
  }
  if (globalId) return getDetailByGlobalId(globalId)

  // Share short code in path: /share/xxxx.html
  const chain = finalUrl.match(/\/share\/(\w+)\.html/i)?.[1]
  if (chain) return getDetailFromShareChain(chain)

  throw new Error("KuGou playlist detail failed: list data not found")
}

/** 酷狗码 → collection / song list (lx-music getUserListDetailByCode). */
async function getDetailByCode(code: string): Promise<PlaylistDetail> {
  const res = await tauriFetch("http://t.kugou.com/command/", {
    method: "POST",
    headers: {
      "KG-RC": "1",
      "KG-THash": "network_super_call.cpp:3676261689:379",
      "User-Agent": "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      appid: 1001,
      clientver: 9020,
      mid: "21511157a05844bd085308bc76ef3343",
      clienttime: 640612895,
      key: "36164c4015e704673c588ee202b9ecb8",
      data: code,
    }),
  })
  if (!res.ok) throw new Error(`KuGou playlist detail failed: ${res.status}`)

  const json = (await res.json()) as {
    status?: number
    data?: {
      info?: {
        type?: number
        id?: string | number
        name?: string
        username?: string
        img?: string
        img_size?: string
        count?: number
        global_collection_id?: string
        userid?: string | number
      }
      list?: KgSpecialSongRaw[]
    }
  }

  const payload = json.data
  const info = payload?.info
  if (!json.status || !info) {
    throw new Error("KuGou playlist detail failed: invalid share code")
  }

  // type: 1单曲 2歌单 3电台 4酷狗码 5别人的播放队列
  if (info.type === 2 && !info.global_collection_id) {
    const bySpecial = await getDetailBySpecialId(String(info.id))
    if (bySpecial) return bySpecial
  }

  if (info.global_collection_id) {
    return getDetailByGlobalId(info.global_collection_id)
  }

  let rawList = payload?.list ?? []
  if (info.userid != null && rawList.length === 0) {
    const shareRes = await tauriFetch("http://www2.kugou.kugou.com/apps/kucodeAndShare/app/", {
      method: "POST",
      headers: {
        "KG-RC": "1",
        "KG-THash": "network_super_call.cpp:3676261689:379",
        "User-Agent": "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        appid: 1001,
        clientver: 9020,
        mid: "21511157a05844bd085308bc76ef3343",
        clienttime: 640612895,
        key: "36164c4015e704673c588ee202b9ecb8",
        data: {
          id: info.id,
          type: 3,
          userid: info.userid,
          collect_type: 0,
          page: 1,
          pagesize: info.count ?? 500,
        },
      }),
    })
    if (shareRes.ok) {
      const shareJson = (await shareRes.json()) as {
        data?: KgSpecialSongRaw[] | { list?: KgSpecialSongRaw[] }
        list?: KgSpecialSongRaw[]
      }
      if (Array.isArray(shareJson.data)) {
        rawList = shareJson.data
      } else if (shareJson.data && Array.isArray(shareJson.data.list)) {
        rawList = shareJson.data.list
      } else if (Array.isArray(shareJson.list)) {
        rawList = shareJson.list
      }
    }
  }

  // Prefer hash→gateway resolve when rows lack album_audio_id (share payloads).
  const hashes = rawList.map((s) => s.hash).filter((h): h is string => Boolean(h))
  let list: MusicInfo[] = []
  if (hashes.length > 0) {
    const groups: KgGatewaySong[][] = []
    const unique = [...new Set(hashes)]
    for (let i = 0; i < unique.length; i += 100) {
      groups.push(await resolveHashes(unique.slice(i, i + 100)))
    }
    const seen = new Set<string>()
    for (const raw of groups.flat()) {
      const song = normalizeKgGatewaySong(raw)
      if (!song || seen.has(song.meta.songId)) continue
      seen.add(song.meta.songId)
      list.push(song)
    }
  }
  if (list.length === 0) list = mapSpecialSongs(rawList)

  return {
    info: {
      name: info.name ?? "",
      img: (info.img_size || info.img)?.replace("{size}", "240") ?? null,
      author: info.username || undefined,
    },
    list,
  }
}

function parseKgPlaylistId(id: string): {
  kind: "special" | "global" | "gcid" | "chain" | "rank" | "link" | "code"
  value: string
} {
  const raw = id.trim()
  if (/^https?:\/\//i.test(raw) || /kugou\.com/i.test(raw)) {
    return { kind: "link", value: raw.replace(/^.*?http/i, "http") }
  }
  if (raw.startsWith("rank_")) return { kind: "rank", value: raw.slice(5) }
  if (raw.startsWith("gcid_")) return { kind: "gcid", value: raw }
  if (raw.startsWith("collection_")) return { kind: "global", value: raw }
  if (raw.startsWith("chain_")) return { kind: "chain", value: raw.slice(6) }
  if (raw.startsWith("code_")) return { kind: "code", value: raw.slice(5) }

  // Bare digits are 酷狗码 (share codes), not editorial special ids.
  // Explicit `id_<n>` (from special/single URLs) stays on the special path.
  if (/^\d+$/.test(raw)) return { kind: "code", value: raw }

  let specialId = raw
  if (specialId.startsWith("id_")) specialId = specialId.slice(3)
  else if (htmlLinkRx.test(specialId)) specialId = specialId.replace(htmlLinkRx, "$1")
  return { kind: "special", value: specialId }
}

/** Resolve classic editorial / public specialid with API → global → HTML fallbacks. */
async function getDetailBySpecialIdWithFallback(specialId: string): Promise<PlaylistDetail> {
  const byApi = await getDetailBySpecialId(specialId)
  if (byApi) return byApi

  const globalId = await getGlobalIdFromSpecial(specialId)
  if (globalId) {
    try {
      return await getDetailByGlobalId(globalId)
    } catch {
      /* fall through to HTML */
    }
  }

  return getDetailByHtml(specialId)
}

export async function getKgPlaylistDetail(id: string, _page = 1): Promise<PlaylistDetail> {
  const parsed = parseKgPlaylistId(id)

  if (parsed.kind === "link") {
    return getDetailFromLink(parsed.value)
  }
  if (parsed.kind === "rank") {
    return getDetailByRankId(parsed.value)
  }
  if (parsed.kind === "gcid") {
    const globalId = await decodeGcid(parsed.value)
    if (!globalId) throw new Error("KuGou playlist detail failed: gcid decode failed")
    return getDetailByGlobalId(globalId)
  }
  if (parsed.kind === "global") {
    return getDetailByGlobalId(parsed.value)
  }
  if (parsed.kind === "chain") {
    return getDetailFromShareChain(parsed.value)
  }
  if (parsed.kind === "code") {
    try {
      return await getDetailByCode(parsed.value)
    } catch {
      // Editorial special ids are also bare digits — fall back if not a 酷狗码.
      return getDetailBySpecialIdWithFallback(parsed.value)
    }
  }

  return getDetailBySpecialIdWithFallback(parsed.value)
}
