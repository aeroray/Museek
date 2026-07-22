import { httpFetch } from "@/lib/http"
import * as md5Lib from "js-md5"
import { eapiParams } from "@/lib/platforms/wy/eapi"
import { createAsyncCache } from "@/lib/cache"
import type { OnlineSource } from "@/types/music"
import type { Playlist } from "./index"

// Search for PLAYLISTS (not songs) on each platform — ported from lx-music's
// per-platform songList.js `search`. Every platform is wrapped so a failure
// (network / format change) yields [] instead of breaking the search page.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const md5 = ((md5Lib as any).default ?? md5Lib) as (s: string) => string

function formatPlayCount(num: number): string | undefined {
  if (!num || isNaN(num)) return undefined
  if (num > 100000000) return `${Math.trunc(num / 10000000) / 10}亿`
  if (num > 10000) return `${Math.trunc(num / 1000) / 10}万`
  return String(num)
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---------- NetEase (eapi) ----------
const WY_HEADERS = {
  "Content-Type": "application/x-www-form-urlencoded",
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/60 Safari/537.36",
  origin: "https://music.163.com",
}

// POST an eapi request. `path` is the real api path (e.g. /api/user/playlist);
// the eapi endpoint is that path with the leading /api swapped for /eapi.
async function eapiPost(path: string, payload: Record<string, unknown>): Promise<any> {
  const params = eapiParams(path, payload)
  const url = `http://interface.music.163.com/eapi${path.replace(/^\/api/, "")}`
  const res = await httpFetch(url, { method: "POST", headers: WY_HEADERS, body: new URLSearchParams({ params }).toString() })
  if (!res.ok) return null
  return (await res.json()) as any
}

function mapWyPlaylist(p: any): Playlist {
  return {
    id: String(p.id),
    name: p.name ?? "",
    img: p.coverImgUrl ?? null,
    playCount: formatPlayCount(p.playCount),
    author: p.creator?.nickname,
    source: "wy",
  }
}

// Playlist search by keyword (matches the playlist name), cloudsearch type 1000.
async function searchWyByKeyword(query: string, page: number, limit: number): Promise<Playlist[]> {
  const data = await eapiPost("/api/cloudsearch/pc", {
    s: query,
    type: 1000,
    limit,
    total: page === 1,
    offset: limit * (page - 1),
  })
  if (data?.code !== 200) return []
  return (data.result?.playlists ?? []).map(mapWyPlaylist)
}

// User search by nickname, cloudsearch type 1002.
async function searchWyUsers(query: string, limit: number): Promise<{ userId: string; nickname: string }[]> {
  const data = await eapiPost("/api/cloudsearch/pc", { s: query, type: 1002, limit, offset: 0, total: true })
  if (data?.code !== 200) return []
  return (data.result?.userprofiles ?? []).map((u: any) => ({
    userId: String(u.userId),
    nickname: String(u.nickname ?? ""),
  }))
}

// A user's own playlists — the first one is always their "我喜欢的音乐".
async function getWyUserPlaylists(uid: string, limit: number): Promise<Playlist[]> {
  const data = await eapiPost("/api/user/playlist", { uid, limit, offset: 0, includeVideo: true })
  if (data?.code !== 200) return []
  return (data.playlist ?? []).map(mapWyPlaylist)
}

// Keyword search alone can't surface a *specific user's* playlists (e.g. the
// default "我喜欢的音乐", whose name is generic and shared by everyone). So when the
// query exactly matches a user's nickname, also pull that user's own playlists.
async function searchWyUserMatchedPlaylists(query: string): Promise<Playlist[]> {
  try {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const users = await searchWyUsers(query, 5)
    const exact = users.filter((u) => u.nickname.trim().toLowerCase() === q).slice(0, 2)
    if (!exact.length) return []
    const lists = await Promise.all(exact.map((u) => getWyUserPlaylists(u.userId, 50).catch(() => [] as Playlist[])))
    return lists.flat()
  } catch {
    return []
  }
}

async function searchWy(query: string, page: number, limit: number): Promise<Playlist[]> {
  const [byUser, byKeyword] = await Promise.all([
    page === 1 ? searchWyUserMatchedPlaylists(query) : Promise.resolve<Playlist[]>([]),
    searchWyByKeyword(query, page, limit).catch(() => [] as Playlist[]),
  ])
  // A matched user's own playlists first (you searched their name), then keyword hits.
  const seen = new Set<string>()
  const out: Playlist[] = []
  for (const p of [...byUser, ...byKeyword]) {
    if (!seen.has(p.id)) {
      seen.add(p.id)
      out.push(p)
    }
  }
  return out
}

// ---------- QQ (signed Desktop search, search_type=3) ----------
async function searchTx(query: string, page: number, limit: number): Promise<Playlist[]> {
  try {
    const { qqDesktopSearch } = await import("@/lib/search/txDesktop")
    const data = await qqDesktopSearch(query, page, limit, 3)
    const body = (data.body ?? {}) as { songlist?: { list?: any[] } }
    return (body.songlist?.list ?? []).map(
      (item: any): Playlist => ({
        id: String(item.dissid),
        name: item.dissname ?? "",
        img: item.imgurl ?? null,
        playCount: formatPlayCount(item.listennum),
        author: item.creator?.name,
        source: "tx",
      }),
    )
  } catch {
    return []
  }
}

// ---------- KuWo (r.s, ft=playlist) ----------
async function searchKw(query: string, page: number, limit: number): Promise<Playlist[]> {
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
    ft: "playlist",
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
  return (data.abslist ?? []).map(
    (item: any): Playlist => ({
      id: String(item.playlistid),
      name: decode(item.name),
      img: item.pic || null,
      playCount: formatPlayCount(parseInt(item.playcnt)),
      author: decode(item.nickname),
      source: "kw",
    }),
  )
}

// ---------- KuGou (plain GET) ----------
async function searchKg(query: string, page: number, limit: number): Promise<Playlist[]> {
  const res = await httpFetch(
    `http://msearchretry.kugou.com/api/v3/search/special?keyword=${encodeURIComponent(query)}` +
      `&page=${page}&pagesize=${limit}&showtype=10&filter=0&version=7910&sver=2`,
    { method: "GET", headers: { "User-Agent": UA } },
  )
  if (!res.ok) return []
  const data = (await res.json()) as any
  if (data?.errcode !== 0) return []
  return (data.data?.info ?? []).map(
    (item: any): Playlist => ({
      // getKgPlaylistDetail accepts the id_<specialid> form.
      id: `id_${item.specialid}`,
      name: item.specialname ?? "",
      img: item.imgurl ? String(item.imgurl).replace("{size}", "240") : null,
      playCount: formatPlayCount(item.playcount),
      author: item.nickname,
      source: "kg",
    }),
  )
}

// ---------- Migu (signed GET) ----------
function miguSign(time: string, str: string): { sign: string; deviceId: string } {
  const deviceId = "963B7AA0D21511ED807EE5846EC87D20"
  const signatureMd5 = "6cdc72a439cef99a3418d2a78aa28c73"
  const sign = md5(`${str}${signatureMd5}yyapp2d16148780a1dcc7408e06336b98cfd50${deviceId}${time}`)
  return { sign, deviceId }
}
async function searchMg(query: string, page: number, limit: number): Promise<Playlist[]> {
  const time = Date.now().toString()
  const { sign, deviceId } = miguSign(time, query)
  const switches = encodeURIComponent(
    JSON.stringify({
      song: 0,
      album: 0,
      singer: 0,
      tagSong: 0,
      mvSong: 0,
      bestShow: 0,
      songlist: 1,
      lyricSong: 0,
    }),
  )
  const res = await httpFetch(
    `https://jadeite.migu.cn/music_search/v3/search/searchAll?isCorrect=1&isCopyright=1` +
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
    },
  )
  if (!res.ok) return []
  const data = (await res.json()) as any
  const result = data?.songListResultData?.result
  if (!Array.isArray(result)) return []
  return result.map(
    (item: any): Playlist => ({
      id: String(item.musicListId ?? item.id),
      name: item.title ?? item.name ?? "",
      img: item.imgItem?.img || item.img || null,
      playCount: formatPlayCount(parseInt(item.playNum)),
      author: item.userName ?? item.author,
      source: "mg",
    }),
  )
}

/* eslint-enable @typescript-eslint/no-explicit-any */

const fns: Record<OnlineSource, (q: string, page: number, limit: number) => Promise<Playlist[]>> = {
  wy: searchWy,
  tx: searchTx,
  kw: searchKw,
  kg: searchKg,
  mg: searchMg,
}

const cache = createAsyncCache<Playlist[]>(3 * 60_000)

export async function searchPlaylists(
  source: OnlineSource,
  query: string,
  page = 1,
  limit = 30
): Promise<Playlist[]> {
  const q = query.trim()
  if (!q) return []
  return cache(`${source}:${q}:${page}`, async () => {
    try {
      return await fns[source](q, page, limit)
    } catch {
      return []
    }
  })
}
