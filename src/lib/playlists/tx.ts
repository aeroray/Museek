import { httpFetch as tauriFetch } from "@/lib/http"
import type { MusicInfo, MusicQuality } from "@/types/music"
import { indexQualitySizes } from "@/lib/quality"
import { formatDuration } from "@/lib/utils"
import type { Playlist, PlaylistDetail, PlaylistTag } from "./index"

// Ported from lx-music-desktop: src/renderer/utils/musicSdk/tx/songList.js
// Hot playlists use the unsigned musicu.fcg get_playlist_by_tag method
// (PlayListPlazaServer) with order=5 (最热). Detail prefers the legacy
// fcg_ucc_getcdinfo_byids_cp.fcg endpoint (disstid=); personal and mobile-share
// lists fall back to uniform_get_Dissinfo when that endpoint returns a non-zero
// subcode or songs without songmid. Neither uses the zzcSign scheme search/tx.ts
// needs, so no signing is reused. Song normalization mirrors albums/tx.ts.

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
  songmid?: string
  title?: string
  songname?: string
  interval?: number
  singer?: TxSingerRaw[]
  album?: TxAlbumRaw
  file?: TxFileRaw
  strMediaMid?: string
  media_mid?: string
  size128?: number
  size320?: number
  sizeflac?: number
  size_hires?: number
}

interface TxListDetailResponse {
  code?: number
  subcode?: number
  cdlist?: Array<{
    songlist?: TxListSongRaw[]
    dissname?: string
    logo?: string
    nickname?: string
  }>
}

interface TxDissinfoResponse {
  code?: number
  req_1?: {
    code?: number
    data?: {
      songlist?: TxListSongRaw[]
      dirinfo?: {
        title?: string
        picurl?: string
        host_nick?: string
      }
    }
  }
}

/** Paste URLs may carry `id::euin::hosteuin` from mobile share links. */
const TX_EUIN_SEP = "::euin::"

function splitTxPlaylistId(id: string): { dissid: string; encHostUin: string } {
  const i = id.indexOf(TX_EUIN_SEP)
  if (i === -1) return { dissid: id, encHostUin: "" }
  return { dissid: id.slice(0, i), encHostUin: id.slice(i + TX_EUIN_SEP.length) }
}

function formatSingers(singers: TxSingerRaw[] | undefined): string {
  if (!Array.isArray(singers)) return ""
  return singers
    .map((s) => s.name)
    .filter(Boolean)
    .join("、")
}

function normalizeTxListSong(raw: TxListSongRaw): MusicInfo | null {
  const songmid = String(raw.mid ?? raw.songmid ?? "")
  if (!songmid) return null

  const mediaMid =
    raw.file?.media_mid ?? raw.strMediaMid ?? raw.media_mid ?? songmid

  const qualitys: MusicQuality[] = []
  const size128 = raw.file?.size_128mp3 ?? raw.size128
  const size320 = raw.file?.size_320mp3 ?? raw.size320
  const sizeFlac = raw.file?.size_flac ?? raw.sizeflac
  const sizeHires = raw.file?.size_hires ?? raw.size_hires
  if (size128) qualitys.push({ type: "128k", size: sizeFormate(size128) })
  if (size320) qualitys.push({ type: "320k", size: sizeFormate(size320) })
  if (sizeFlac) qualitys.push({ type: "flac", size: sizeFormate(sizeFlac) })
  if (sizeHires) qualitys.push({ type: "flac24bit", size: sizeFormate(sizeHires) })
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

  return {
    id: `tx_${songmid}`,
    name: raw.title ?? raw.songname ?? "",
    singer: formatSingers(raw.singer),
    source: "tx",
    interval: formatDuration(raw.interval || 0),
    albumName,
    meta: {
      songId: songmid,
      albumId,
      strMediaMid: mediaMid,
      picUrl,
      qualitys,
      _qualitys,
    },
  }
}

function songsFromRawList(rawList: TxListSongRaw[] | undefined): MusicInfo[] {
  const list: MusicInfo[] = []
  for (const item of rawList ?? []) {
    const song = normalizeTxListSong(item)
    if (song) list.push(song)
  }
  return list
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

/** Newer personal / mobile-share lists: old getcdinfo returns subcode 4000 or no usable mids. */
async function getTxPlaylistDetailViaDissinfo(
  dissid: string,
  encHostUin: string,
  tryNum = 0,
): Promise<PlaylistDetail> {
  const dissIdNum = parseInt(dissid, 10)
  if (!Number.isFinite(dissIdNum)) {
    throw new Error("QQ playlist detail failed: bad id")
  }

  const res = await tauriFetch("https://u.y.qq.com/cgi-bin/musicu.fcg", {
    method: "POST",
    headers: {
      Origin: "https://y.qq.com",
      Referer: `https://y.qq.com/n/yqq/playsquare/${dissid}.html`,
      "User-Agent": "Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; WOW64; Trident/5.0)",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      comm: {
        cv: 4747474,
        ct: 24,
        format: "json",
        inCharset: "utf-8",
        outCharset: "utf-8",
        platform: "yqq.json",
        needNewCode: 1,
        uin: 0,
      },
      req_1: {
        module: "music.srfDissInfo.aiDissInfo",
        method: "uniform_get_Dissinfo",
        param: {
          disstid: dissIdNum,
          userinfo: 1,
          tag: 1,
          orderlist: 1,
          song_begin: 0,
          song_num: 100000,
          onlysonglist: 0,
          enc_host_uin: encHostUin,
        },
      },
    }),
  })

  if (!res.ok) {
    if (tryNum < 2) {
      await new Promise((r) => setTimeout(r, retryDelayMs(tryNum)))
      return getTxPlaylistDetailViaDissinfo(dissid, encHostUin, tryNum + 1)
    }
    throw new Error(`QQ playlist detail failed: ${res.status}`)
  }

  const body = (await res.json()) as TxDissinfoResponse
  if (body.code !== 0) {
    if (tryNum < 2) {
      await new Promise((r) => setTimeout(r, retryDelayMs(tryNum)))
      return getTxPlaylistDetailViaDissinfo(dissid, encHostUin, tryNum + 1)
    }
    throw new Error("QQ playlist detail failed: bad response")
  }
  if (body.req_1?.code !== 0 || !body.req_1.data) {
    throw new Error("QQ playlist detail failed: bad response")
  }

  const result = body.req_1.data
  const dirinfo = result.dirinfo
  return {
    info: {
      name: dirinfo?.title ?? "",
      img: dirinfo?.picurl || null,
      author: dirinfo?.host_nick,
    },
    list: songsFromRawList(result.songlist),
  }
}

export async function getTxPlaylistDetail(id: string, _page = 1, tryNum = 0): Promise<PlaylistDetail> {
  const { dissid, encHostUin } = splitTxPlaylistId(id)
  const url =
    `https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg` +
    `?type=1&json=1&utf8=1&onlysong=0&new_format=1&disstid=${encodeURIComponent(dissid)}` +
    `&loginUin=0&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&notice=0` +
    `&platform=yqq.json&needNewCode=0`

  const res = await tauriFetch(url, {
    method: "GET",
    headers: {
      Origin: "https://y.qq.com",
      Referer: `https://y.qq.com/n/yqq/playsquare/${dissid}.html`,
      "User-Agent": "Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; WOW64; Trident/5.0)",
    },
  })

  if (!res.ok) {
    if (tryNum < 2) {
      await new Promise((r) => setTimeout(r, retryDelayMs(tryNum)))
      return getTxPlaylistDetail(id, _page, tryNum + 1)
    }
    return getTxPlaylistDetailViaDissinfo(dissid, encHostUin)
  }

  const data = (await res.json()) as TxListDetailResponse
  if (!data || data.code !== 0) {
    if (tryNum < 2) {
      await new Promise((r) => setTimeout(r, retryDelayMs(tryNum)))
      return getTxPlaylistDetail(id, _page, tryNum + 1)
    }
    return getTxPlaylistDetailViaDissinfo(dissid, encHostUin)
  }

  // Personal / mobile-share lists: code 0 but subcode 4000, or a cdlist whose
  // songs lack songmid. Same fallback lx-music added as getListDetail2.
  if (data.subcode !== 0 || !data.cdlist?.length) {
    return getTxPlaylistDetailViaDissinfo(dissid, encHostUin)
  }

  const cd = data.cdlist[0]
  const list = songsFromRawList(cd.songlist)
  if (list.length === 0 && (cd.songlist?.length ?? 0) > 0) {
    return getTxPlaylistDetailViaDissinfo(dissid, encHostUin)
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
