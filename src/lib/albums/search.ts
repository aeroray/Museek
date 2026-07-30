import { httpFetch } from "@/lib/http"
import * as md5Lib from "js-md5"
import { eapiParams } from "@/lib/platforms/wy/eapi"
import type { OnlineSource } from "@/types/music"
import type { Album } from "./index"
import { formatAlbumDate, parseSongCount } from "./date"

// Album keyword search per platform — mirrors src/lib/playlists/search.ts.
// Soft-fail: every platform path yields [] on network / format errors.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const md5 = ((md5Lib as any).default ?? md5Lib) as (s: string) => string

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---------- NetEase (eapi, cloudsearch type 10) ----------
const WY_HEADERS = {
  "Content-Type": "application/x-www-form-urlencoded",
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/60 Safari/537.36",
  origin: "https://music.163.com",
}

async function eapiPost(path: string, payload: Record<string, unknown>): Promise<any> {
  const params = eapiParams(path, payload)
  const url = `http://interface.music.163.com/eapi${path.replace(/^\/api/, "")}`
  const res = await httpFetch(url, {
    method: "POST",
    headers: WY_HEADERS,
    body: new URLSearchParams({ params }).toString(),
  })
  if (!res.ok) return null
  return (await res.json()) as any
}

function wyAlbumAuthor(a: any): string | undefined {
  if (a?.artist?.name) return String(a.artist.name)
  if (Array.isArray(a?.artists) && a.artists.length) {
    return a.artists
      .map((x: any) => x?.name)
      .filter(Boolean)
      .join("、")
  }
  return undefined
}

async function searchWy(query: string, page: number, limit: number): Promise<Album[]> {
  const data = await eapiPost("/api/cloudsearch/pc", {
    s: query,
    type: 10,
    limit,
    total: page === 1,
    offset: limit * (page - 1),
  })
  if (data?.code !== 200) return []
  return (data.result?.albums ?? []).map(
    (a: any): Album => {
      let img: string | null = a.picUrl ?? a.blurPicUrl ?? null
      if (img) {
        img = String(img).replace(/^http:\/\//i, "https://")
        if (!/[?&]param=/.test(img)) {
          img += (img.includes("?") ? "&" : "?") + "param=240y240"
        }
      }
      return {
        id: String(a.id),
        name: a.name ?? "",
        img,
        author: wyAlbumAuthor(a),
        publishTime: formatAlbumDate(a.publishTime),
        songCount: parseSongCount(a.size),
        source: "wy",
      }
    }
  )
}

// ---------- QQ (signed Desktop search, search_type=2) ----------
async function searchTx(query: string, page: number, limit: number): Promise<Album[]> {
  try {
    const { qqDesktopSearch } = await import("@/lib/search/txDesktop")
    const data = await qqDesktopSearch(query, page, limit, 2)
    const body = (data.body ?? {}) as { album?: { list?: any[] } }
    return (body.album?.list ?? []).map((item: any): Album => {
      const mid = String(item.albummid ?? item.albumMID ?? item.mid ?? "")
      const singers = item.singer_list ?? item.singerList ?? item.singer ?? []
      const author = Array.isArray(singers)
        ? singers
            .map((s: any) => s?.name)
            .filter(Boolean)
            .join("、")
        : undefined
      let img: string | null = item.albumPic ?? item.album_pic ?? item.pic ?? null
      if (!img && mid) {
        img = `https://y.gtimg.cn/music/photo_new/T002R500x500M000${mid}.jpg`
      }
      return {
        id: mid,
        name: item.albumName ?? item.albumname ?? item.name ?? "",
        img,
        author: author || undefined,
        publishTime: formatAlbumDate(item.publicTime ?? item.publish_time ?? item.publishTime),
        songCount: parseSongCount(item.song_count ?? item.songCount ?? item.songnum),
        source: "tx",
      }
    })
  } catch {
    return []
  }
}

// ---------- KuWo (r.s, ft=album) ----------
// Album search returns `albumlist` with lowercase fields (music/playlist use `abslist`).
async function searchKw(query: string, page: number, limit: number): Promise<Album[]> {
  const params = new URLSearchParams({
    client: "kt",
    all: query,
    pn: String(page - 1),
    rn: String(limit),
    uid: "794762570",
    ver: "kwplayer_ar_9.2.2.1",
    vipver: "1",
    show_copyright_off: "1",
    newver: "1",
    ft: "album",
    cluster: "0",
    strategy: "2012",
    encoding: "utf8",
    rformat: "json",
    mobi: "1",
  })
  const res = await httpFetch(`http://search.kuwo.cn/r.s?${params}`, {
    method: "GET",
    headers: { Referer: "https://www.kuwo.cn/", "User-Agent": UA },
  })
  if (!res.ok) return []
  const data = (await res.json()) as any
  const decode = (s: string) => {
    try {
      return decodeURIComponent(String(s).replace(/\+/g, " "))
    } catch {
      return String(s ?? "")
    }
  }
  const list = data.albumlist ?? data.abslist ?? []
  return list
    .map((item: any): Album => {
      const id = String(item.albumid ?? item.ALBUMID ?? item.id ?? "")
      const pic = item.hts_img || item.img || item.pic || null
      return {
        id,
        name: decode(item.name ?? item.ALBUM ?? item.album ?? ""),
        img: pic ? String(pic) : null,
        author: decode(item.artist ?? item.ARTIST ?? "") || undefined,
        publishTime: formatAlbumDate(item.pub ?? item.showtime ?? item.timing_online),
        songCount: parseSongCount(item.musiccnt ?? item.musicCnt),
        source: "kw",
      }
    })
    .filter((a: Album) => a.id && a.name)
}

// ---------- KuGou ----------
async function searchKg(query: string, page: number, limit: number): Promise<Album[]> {
  const res = await httpFetch(
    `http://msearchretry.kugou.com/api/v3/search/album?keyword=${encodeURIComponent(query)}` +
      `&page=${page}&pagesize=${limit}&sver=2&with_res_tag=0`,
    { method: "GET", headers: { "User-Agent": UA } }
  )
  if (!res.ok) return []
  const data = (await res.json()) as any
  if (data?.errcode != null && data.errcode !== 0) return []
  return (data.data?.info ?? []).map(
    (item: any): Album => ({
      id: String(item.albumid ?? item.album_id ?? ""),
      name: item.albumname ?? item.album_name ?? "",
      img: item.imgurl ? String(item.imgurl).replace("{size}", "240") : null,
      author: item.singer ?? item.singername ?? undefined,
      publishTime: formatAlbumDate(item.publishtime ?? item.publish_time),
      songCount: parseSongCount(item.songcount ?? item.song_count),
      source: "kg",
    })
  )
}

// ---------- Migu (signed GET, album + song for relevance) ----------
function miguSign(time: string, str: string): { sign: string; deviceId: string } {
  const deviceId = "963B7AA0D21511ED807EE5846EC87D20"
  const signatureMd5 = "6cdc72a439cef99a3418d2a78aa28c73"
  const sign = md5(`${str}${signatureMd5}yyapp2d16148780a1dcc7408e06336b98cfd50${deviceId}${time}`)
  return { sign, deviceId }
}

function miguImg(url: string | null | undefined): string | null {
  if (!url) return null
  const s = String(url)
  if (/^https?:\/\//i.test(s)) return s
  return `http://d.musicapp.migu.cn${s.startsWith("/") ? s : `/${s}`}`
}

function normQuery(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "")
}

/** Prefer albums whose title matches the query; song-hit-only rows rank lower. */
function mgAlbumNameScore(name: string, query: string): number {
  const n = normQuery(name)
  const q = normQuery(query)
  if (!n || !q) return 0
  if (n === q) return 3
  if (n.startsWith(q) || q.startsWith(n)) return 2
  if (n.includes(q)) return 1
  return 0
}

function mgSongNameScore(songName: string, query: string): number {
  const n = normQuery(songName)
  const q = normQuery(query)
  if (!n || !q) return 0
  if (n === q) return 3
  // Strip live / remix suffixes for a softer match.
  const bare = n.replace(/\(.*?\)|（.*?）/g, "").trim()
  if (bare === q) return 2
  if (n.includes(q)) return 1
  return 0
}

function mgLiveOrCoverPenalty(albumName: string, songName: string): number {
  const s = `${albumName} ${songName}`
  if (/live|演唱会|remix|翻唱|伴奏|铃声/i.test(s)) return 80
  return 0
}

function isMgJunkAlbum(name: string, id: string): boolean {
  if (!id || id === "2") return true
  const n = name.trim()
  return n === "单曲发行" || n === ""
}

async function searchMg(query: string, page: number, limit: number): Promise<Album[]> {
  const time = Date.now().toString()
  const { sign, deviceId } = miguSign(time, query)
  // Pull songs too: album-only search ranks by "contains track", so e.g. 晴天
  // surfaces random compilations before 叶惠美. Top song hits carry the right album.
  const switches = encodeURIComponent(
    JSON.stringify({
      song: 1,
      album: 1,
      singer: 0,
      tagSong: 0,
      mvSong: 0,
      bestShow: 0,
      songlist: 0,
      lyricSong: 0,
    })
  )
  const res = await httpFetch(
    `https://jadeite.migu.cn/music_search/v3/search/searchAll?isCorrect=0&isCopyright=1` +
      `&searchSwitch=${switches}&pageSize=${limit}&text=${encodeURIComponent(query)}&pageNo=${page}&sort=0&sid=USS`,
    {
      method: "GET",
      headers: {
        uiVersion: "A_music_3.6.1",
        deviceId,
        timestamp: time,
        sign,
        channel: "0146921",
        "User-Agent":
          "Mozilla/5.0 (Linux; U; Android 11.0.0; zh-cn; MI 11 Build/OPR1.170623.032) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30",
      },
    }
  )
  if (!res.ok) return []
  const data = (await res.json()) as any
  if (data?.code != null && data.code !== "000000") return []

  type Ranked = Album & { score: number; ord: number }
  const byId = new Map<string, Ranked>()

  const upsert = (album: Album, score: number, ord: number) => {
    if (isMgJunkAlbum(album.name, album.id)) return
    const prev = byId.get(album.id)
    if (!prev) {
      byId.set(album.id, { ...album, score, ord })
      return
    }
    // Keep the richer metadata; take the better relevance score.
    byId.set(album.id, {
      ...prev,
      name: prev.name || album.name,
      img: prev.img || album.img,
      author: prev.author || album.author,
      publishTime: prev.publishTime || album.publishTime,
      songCount: prev.songCount ?? album.songCount,
      score: Math.max(prev.score, score),
      ord: Math.min(prev.ord, ord),
    })
  }

  // 1) Albums from song hits — strongest signal when the query is a track title.
  let songOrd = 0
  for (const group of data?.songResultData?.resultList ?? []) {
    if (!Array.isArray(group)) continue
    for (const song of group) {
      const id = song?.albumId != null ? String(song.albumId) : ""
      if (!id) continue
      const songName = String(song.name ?? song.songName ?? "")
      const albumName = String(song.album ?? "")
      const hit = mgSongNameScore(songName, query)
      const singers = Array.isArray(song.singerList)
        ? song.singerList
            .map((s: any) => s?.name)
            .filter(Boolean)
            .join("、")
        : ""
      // Exact song-title hits dominate; keep API song order; demote live/remix.
      // Album-title bonus only when the song name itself is a weak match.
      const score =
        1000 * Math.max(hit, 0.15) +
        (hit >= 2 ? 0 : 50 * mgAlbumNameScore(albumName, query)) +
        Math.max(0, 40 - songOrd) -
        mgLiveOrCoverPenalty(albumName, songName)
      upsert(
        {
          id,
          name: albumName,
          img: miguImg(song.img3 || song.img2 || song.img1),
          author: singers || undefined,
          source: "mg",
        },
        score,
        songOrd
      )
      songOrd++
    }
  }

  // 2) Official album results — boost title matches; demote "contains song X" rows.
  const albumRows = Array.isArray(data?.albumResultData?.result) ? data.albumResultData.result : []
  albumRows.forEach((item: any, i: number) => {
    const id = String(item.albumId ?? item.id ?? "")
    const name = String(item.name ?? item.title ?? item.album ?? "")
    const desc = String(item.desc ?? "")
    const titleScore = mgAlbumNameScore(name, query)
    const containsOnly = /包含歌曲/.test(desc) && titleScore === 0
    const score = 200 * titleScore + (containsOnly ? 5 : 40) + Math.max(0, 20 - i)
    upsert(
      {
        id,
        name,
        img: miguImg(item.imgItems?.[0]?.img || item.imgItem?.img || item.img),
        author: item.singer ?? item.singerName ?? item.artist ?? undefined,
        publishTime: formatAlbumDate(item.publishDate ?? item.publishTime),
        songCount: parseSongCount(item.songNum ?? item.totalCount ?? item.musicNum),
        source: "mg",
      },
      score,
      1000 + i
    )
  })

  return [...byId.values()]
    .sort((a, b) => b.score - a.score || a.ord - b.ord)
    .slice(0, limit)
    .map(({ score: _s, ord: _o, ...album }) => album)
}

/* eslint-enable @typescript-eslint/no-explicit-any */

const fns: Record<OnlineSource, (q: string, page: number, limit: number) => Promise<Album[]>> = {
  wy: searchWy,
  tx: searchTx,
  kw: searchKw,
  kg: searchKg,
  mg: searchMg,
}

/** Uncached search entry — soft-fails to []. Callers should use albums/index searchAlbums. */
export async function searchAlbums(
  source: OnlineSource,
  query: string,
  page = 1,
  limit = 30
): Promise<Album[]> {
  const q = query.trim()
  if (!q) return []
  try {
    return await fns[source](q, page, limit)
  } catch {
    return []
  }
}
