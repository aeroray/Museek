import { httpFetch as tauriFetch } from "@/lib/http"
import { eapi } from "@/lib/platforms/wy/eapi"
import type { MusicInfo, MusicQuality, Quality } from "@/types/music"
import { indexQualitySizes } from "@/lib/quality"
import { formatDuration } from "@/lib/utils"
import type { ChartBoard } from "./index"

// Ported from lx-music-desktop: src/renderer/utils/musicSdk/wy/leaderboard.js
// NetEase toplist. The reference uses a fixed boardList (the `topList`) and then
// fetches the playlist via weapi /v3/playlist/detail (-> trackIds) before
// resolving every track with /v3/song/detail. Here we use the eapi gateway
// (same signing as src/lib/search/wy.ts) to hit /api/v3/playlist/detail, which
// returns playlist.tracks fully populated for toplists — so a single signed
// request yields the full song objects and the second song/detail call is
// unnecessary. Song normalization mirrors src/lib/search/wy.ts.

// A few well-known NetEase boards. ids/bangids match the reference's topList.
export const wyBoards: ChartBoard[] = [
  { id: "wy__19723756", name: "飙升榜" },
  { id: "wy__3779629", name: "新歌榜" },
  { id: "wy__2884035", name: "原创榜" },
  { id: "wy__3778678", name: "热歌榜" },
  { id: "wy__991319590", name: "说唱榜" },
  { id: "wy__71384707", name: "古典榜" },
  { id: "wy__1978921795", name: "电音榜" },
  { id: "wy__5453912201", name: "黑胶VIP爱听榜" },
  { id: "wy__71385702", name: "ACG榜" },
  { id: "wy__745956260", name: "韩语榜" },
  { id: "wy__10520166", name: "国电榜" },
  { id: "wy__2809513713", name: "欧美热歌榜" },
]

// Reference asks for n: 100000; toplists are far smaller, but keep it generous.
const LIMIT = 100000

interface WySingerRaw {
  name?: string
}

interface WyAlbumRaw {
  id?: number | string
  name?: string
  picUrl?: string
}

interface WyBrItemRaw {
  size?: number
}

interface WyPrivilegeRaw {
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

interface WyPlaylistDetailResponse {
  code?: number
  playlist?: {
    tracks?: WyTrackRaw[]
  }
}

// Mirrors common/utils/common.ts sizeFormate
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

  // Detect each tier from EITHER the privilege bitrate cascade OR the presence of
  // the matching audio-file object (hr/sq/h/l). Toplist playlist/detail often
  // returns a capped anonymous `maxbr` (128k) even when higher files exist —
  // same fix as src/lib/playlists/wy.ts.
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

  // De-dupe + order ascending (128k first), matching reference types.reverse().
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

// The toplist endpoint returns a full single-page list, so page is ignored
// (the _ prefix keeps it strict-mode clean while matching the dispatcher shape).
export async function getWyBoardSongs(boardId: string, _page = 1): Promise<MusicInfo[]> {
  const bangid = boardId.replace("wy__", "")

  const apiPath = "/api/v3/playlist/detail"
  const payload = {
    id: bangid,
    n: LIMIT,
    s: 0,
  }

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

  if (!res.ok) throw new Error(`NetEase board failed: ${res.status}`)

  const data = (await res.json()) as WyPlaylistDetailResponse
  if (!data || data.code !== 200 || !data.playlist?.tracks) {
    throw new Error("NetEase board failed: bad response")
  }

  return data.playlist.tracks.map(normalizeWyTrack)
}
