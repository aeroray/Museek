import { httpFetch as tauriFetch } from "@/lib/http"
import type { MusicInfo, MusicQuality } from "@/types/music"
import { indexQualitySizes } from "@/lib/quality"
import { formatDuration } from "@/lib/utils"
import type { Playlist, PlaylistDetail, PlaylistTag } from "./index"

// Ported from lx-music-desktop: src/renderer/utils/musicSdk/tx/songList.js
// Hot playlists use the unsigned musicu.fcg get_playlist_by_tag method
// (PlayListPlazaServer) with order=5 (最热). Detail uses the legacy
// fcg_ucc_getcdinfo_byids_cp.fcg endpoint (disstid=), whose songlist items have
// the same file/singer/album shape as the QQ search/chart song objects.
// Neither uses the zzcSign scheme search/tx.ts needs, so no signing is reused.
// Song normalization mirrors src/lib/charts/tx.ts.

const LIMIT_LIST = 36
// 最热 sort id (sortList[0] in the reference).
const SORT_HOT = 5

// Mirrors src/lib/charts/tx.ts sizeFormate
function sizeFormate(size: number): string {
  if (!size) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const number = Math.floor(Math.log(size) / Math.log(1024))
  return `${(size / Math.pow(1024, Math.floor(number))).toFixed(2)} ${units[number]}`
}

// Mirrors renderer/utils/index.ts formatPlayCount
function formatPlayCount(num: number): string {
  if (num > 100000000) return `${Math.trunc(num / 10000000) / 10}亿`
  if (num > 10000) return `${Math.trunc(num / 1000) / 10}万`
  return String(num)
}

// --- hot list ---
interface TxPlaylistRaw {
  tid?: number | string
  title?: string
  access_num?: number
  cover_url_medium?: string
  creator_info?: { nick?: string }
}

interface TxListResponse {
  code?: number
  playlist?: {
    code?: number
    data?: {
      v_playlist?: TxPlaylistRaw[]
    }
  }
}

function normalizeTxPlaylist(raw: TxPlaylistRaw): Playlist {
  const access = Number(raw.access_num)
  return {
    id: String(raw.tid),
    name: raw.title ?? "",
    img: raw.cover_url_medium || null,
    playCount: isNaN(access) || access === 0 ? undefined : formatPlayCount(access),
    author: raw.creator_info?.nick || undefined,
    source: "tx",
  }
}

interface TxCategoryItem {
  id?: number | string
  name?: string
}

interface TxCategoryGroup {
  group_name?: string
  v_item?: TxCategoryItem[]
}

interface TxTagsResponse {
  code?: number
  tags?: {
    code?: number
    data?: { v_group?: TxCategoryGroup[] }
  }
}

interface TxCategoryListResponse {
  code?: number
  playlist?: {
    code?: number
    data?: {
      content?: {
        v_item?: Array<{
          basic?: {
            tid?: number | string
            title?: string
            play_cnt?: number
            cover?: { medium_url?: string; default_url?: string }
            creator?: { nick?: string }
          }
        }>
      }
    }
  }
}

function musicuUrl(data: unknown): string {
  return (
    `https://u.y.qq.com/cgi-bin/musicu.fcg?loginUin=0&hostUin=0&format=json` +
    `&inCharset=utf-8&outCharset=utf-8&notice=0&platform=wk_v15.json&needNewCode=0` +
    `&data=${encodeURIComponent(JSON.stringify(data))}`
  )
}

/** Flatten all category groups (热门 / 主题 / 场景 / …), de-duped by id. */
export async function getTxPlaylistTags(): Promise<PlaylistTag[]> {
  const url = musicuUrl({
    tags: {
      method: "get_all_categories",
      param: { qq: "" },
      module: "playlist.PlaylistAllCategoriesServer",
    },
  })

  const res = await tauriFetch(url, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; WOW64; Trident/5.0)",
    },
  })
  if (!res.ok) throw new Error(`QQ playlist tags failed: ${res.status}`)

  const data = (await res.json()) as TxTagsResponse
  const groups = data?.tags?.data?.v_group
  if (!data || data.code !== 0 || !groups?.length) {
    throw new Error("QQ playlist tags failed: bad response")
  }

  const out: PlaylistTag[] = []
  const seen = new Set<string>()
  for (const group of groups) {
    for (const item of group.v_item ?? []) {
      if (item.id == null || !item.name) continue
      const id = String(item.id)
      if (seen.has(id)) continue
      seen.add(id)
      out.push({ id, name: item.name })
    }
  }
  return out
}

function normalizeTxCategoryBasic(basic: {
  tid?: number | string
  title?: string
  play_cnt?: number
  cover?: { medium_url?: string; default_url?: string }
  creator?: { nick?: string }
} | undefined): Playlist | null {
  if (!basic || basic.tid == null) return null
  const play = Number(basic.play_cnt)
  return {
    id: String(basic.tid),
    name: basic.title ?? "",
    img: basic.cover?.medium_url || basic.cover?.default_url || null,
    playCount: isNaN(play) || play === 0 ? undefined : formatPlayCount(play),
    author: basic.creator?.nick,
    source: "tx",
  }
}

export async function getTxHotPlaylists(page = 1, tagId?: string | null): Promise<Playlist[]> {
  if (tagId) {
    const id = parseInt(tagId, 10)
    if (isNaN(id)) throw new Error("QQ hot playlists failed: bad tag")
    const reqBody = {
      comm: { cv: 1602, ct: 20 },
      playlist: {
        method: "get_category_content",
        param: {
          titleid: id,
          caller: "0",
          category_id: id,
          size: LIMIT_LIST,
          page: page - 1,
          use_page: 1,
        },
        module: "playlist.PlayListCategoryServer",
      },
    }

    const res = await tauriFetch(musicuUrl(reqBody), {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; WOW64; Trident/5.0)",
      },
    })
    if (!res.ok) throw new Error(`QQ hot playlists failed: ${res.status}`)

    const data = (await res.json()) as TxCategoryListResponse
    const items = data?.playlist?.data?.content?.v_item
    if (!data || data.code !== 0 || !items) {
      throw new Error("QQ hot playlists failed: bad response")
    }
    const out: Playlist[] = []
    for (const row of items) {
      const pl = normalizeTxCategoryBasic(row.basic)
      if (pl) out.push(pl)
    }
    return out
  }

  const reqBody = {
    comm: { cv: 1602, ct: 20 },
    playlist: {
      method: "get_playlist_by_tag",
      param: {
        id: 10000000,
        sin: LIMIT_LIST * (page - 1),
        size: LIMIT_LIST,
        order: SORT_HOT,
        cur_page: page,
      },
      module: "playlist.PlayListPlazaServer",
    },
  }

  const res = await tauriFetch(musicuUrl(reqBody), {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; WOW64; Trident/5.0)",
    },
  })

  if (!res.ok) throw new Error(`QQ hot playlists failed: ${res.status}`)

  const data = (await res.json()) as TxListResponse
  if (!data || data.code !== 0 || !data.playlist?.data?.v_playlist) {
    throw new Error("QQ hot playlists failed: bad response")
  }

  return data.playlist.data.v_playlist.map(normalizeTxPlaylist)
}

// --- detail ---
interface TxSingerRaw {
  name?: string
  mid?: string
}

interface TxAlbumRaw {
  name?: string
  mid?: string
}

interface TxFileRaw {
  media_mid?: string
  size_128mp3?: number
  size_320mp3?: number
  size_flac?: number
  size_hires?: number
}

interface TxListSongRaw {
  id?: number | string
  mid?: string
  title?: string
  interval?: number
  singer?: TxSingerRaw[]
  album?: TxAlbumRaw
  file?: TxFileRaw
}

interface TxListDetailResponse {
  code?: number
  cdlist?: Array<{
    songlist?: TxListSongRaw[]
    dissname?: string
    logo?: string
    nickname?: string
  }>
}

function formatSingers(singers: TxSingerRaw[] | undefined): string {
  if (!Array.isArray(singers)) return ""
  return singers
    .map((s) => s.name)
    .filter(Boolean)
    .join("、")
}

function normalizeTxListSong(raw: TxListSongRaw): MusicInfo | null {
  const file = raw.file
  if (!file?.media_mid) return null

  const qualitys: MusicQuality[] = []
  if (file.size_128mp3) qualitys.push({ type: "128k", size: sizeFormate(file.size_128mp3) })
  if (file.size_320mp3) qualitys.push({ type: "320k", size: sizeFormate(file.size_320mp3) })
  if (file.size_flac) qualitys.push({ type: "flac", size: sizeFormate(file.size_flac) })
  if (file.size_hires) qualitys.push({ type: "flac24bit", size: sizeFormate(file.size_hires) })
  if (qualitys.length === 0) qualitys.push({ type: "128k", size: null })

  const _qualitys = indexQualitySizes(qualitys)

  const albumName = raw.album?.name ?? ""
  const albumId = raw.album?.mid ?? ""

  let picUrl: string | null = null
  if (albumId && albumName !== "" && albumName !== "空") {
    picUrl = `https://y.gtimg.cn/music/photo_new/T002R500x500M000${albumId}.jpg`
  } else if (raw.singer?.length && raw.singer[0].mid) {
    picUrl = `https://y.gtimg.cn/music/photo_new/T001R500x500M000${raw.singer[0].mid}.jpg`
  }

  // songId is the songmid (string mid like "0039MnYb0qxYhV"); play scripts read it.
  const songmid = raw.mid ?? ""

  return {
    id: `tx_${songmid}`,
    name: raw.title ?? "",
    singer: formatSingers(raw.singer),
    source: "tx",
    interval: formatDuration(raw.interval || 0),
    albumName,
    meta: {
      songId: songmid,
      albumId,
      strMediaMid: file.media_mid,
      picUrl,
      qualitys,
      _qualitys,
    },
  }
}

// fcg_ucc_getcdinfo_byids_cp returns the full playlist in one response, so page
// is ignored (the _ prefix keeps it strict-mode clean while matching the
// dispatcher shape). This endpoint intermittently returns a non-zero `code`
// (transient rate-limit / load-balancer hiccup), so — like the lx-music
// reference — we retry up to 3 times with backoff before surfacing the error.
function retryDelayMs(tryNum: number): number {
  // ~400ms, ~800ms + small jitter — avoid hammering on 429-ish failures.
  return 400 * (tryNum + 1) + Math.floor(Math.random() * 200)
}

export async function getTxPlaylistDetail(id: string, _page = 1, tryNum = 0): Promise<PlaylistDetail> {
  const url =
    `https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg` +
    `?type=1&json=1&utf8=1&onlysong=0&new_format=1&disstid=${id}` +
    `&loginUin=0&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&notice=0` +
    `&platform=yqq.json&needNewCode=0`

  const res = await tauriFetch(url, {
    method: "GET",
    headers: {
      Origin: "https://y.qq.com",
      Referer: `https://y.qq.com/n/yqq/playsquare/${id}.html`,
      "User-Agent": "Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; WOW64; Trident/5.0)",
    },
  })

  if (!res.ok) {
    if (tryNum < 2) {
      await new Promise((r) => setTimeout(r, retryDelayMs(tryNum)))
      return getTxPlaylistDetail(id, _page, tryNum + 1)
    }
    throw new Error(`QQ playlist detail failed: ${res.status}`)
  }

  const data = (await res.json()) as TxListDetailResponse
  if (!data || data.code !== 0 || !data.cdlist?.length) {
    if (tryNum < 2) {
      await new Promise((r) => setTimeout(r, retryDelayMs(tryNum)))
      return getTxPlaylistDetail(id, _page, tryNum + 1)
    }
    throw new Error("QQ playlist detail failed: bad response")
  }

  const cd = data.cdlist[0]
  const list: MusicInfo[] = []
  for (const item of cd.songlist ?? []) {
    const song = normalizeTxListSong(item)
    if (song) list.push(song)
  }
  return {
    info: {
      name: cd.dissname ?? "",
      img: cd.logo || null,
      author: cd.nickname,
    },
    list,
  }
}
