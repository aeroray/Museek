import type { MusicInfo, Source } from "@/types/music"
import { createAsyncCache } from "@/lib/cache"
import { getKwHotPlaylists, getKwPlaylistDetail } from "./kw"
import { getTxHotPlaylists, getTxPlaylistDetail } from "./tx"
import { getWyHotPlaylists, getWyPlaylistDetail } from "./wy"
import { getKgHotPlaylists, getKgPlaylistDetail } from "./kg"
import { getMgHotPlaylists, getMgPlaylistDetail } from "./mg"

// Hot/featured playlist (歌单) browsing, ported from lx-music-desktop's
// per-platform songList.js. Mirrors the structure of src/lib/charts/index.ts:
// each platform exposes getXxHotPlaylists/getXxPlaylistDetail and this module
// dispatches over them.

export interface Playlist {
  id: string
  name: string
  img: string | null
  playCount?: string
  author?: string
  source: Source
}

/** Playlist metadata returned alongside tracks (lx-music `info`). */
export interface PlaylistDetailInfo {
  name: string
  img: string | null
  author?: string
}

export interface PlaylistDetail {
  info: PlaylistDetailInfo
  list: MusicInfo[]
}

function fetchHotPlaylists(source: Source, page: number): Promise<Playlist[]> {
  switch (source) {
    case "kw":
      return getKwHotPlaylists(page)
    case "tx":
      return getTxHotPlaylists(page)
    case "wy":
      return getWyHotPlaylists(page)
    case "kg":
      return getKgHotPlaylists(page)
    case "mg":
      return getMgHotPlaylists(page)
    default:
      return Promise.resolve([])
  }
}

function fetchPlaylistDetail(source: Source, id: string, page: number): Promise<PlaylistDetail> {
  switch (source) {
    case "kw":
      return getKwPlaylistDetail(id, page)
    case "tx":
      return getTxPlaylistDetail(id, page)
    case "wy":
      return getWyPlaylistDetail(id, page)
    case "kg":
      return getKgPlaylistDetail(id, page)
    case "mg":
      return getMgPlaylistDetail(id, page)
    default:
      return Promise.resolve({ info: { name: "", img: null }, list: [] })
  }
}

// Hot lists and playlist contents are stable over a session — cache for 5 min so
// switching platforms / reopening a playlist is instant and avoids re-requests.
const hotCache = createAsyncCache<Playlist[]>(5 * 60_000)
const detailCache = createAsyncCache<PlaylistDetail>(5 * 60_000)

/**
 * Fetch the platform's hot/recommended playlists (default "热门" sort, cached).
 * Pagination is best-effort: platforms whose hot endpoint returns a single
 * fixed page ignore `page`.
 */
export function getHotPlaylists(source: Source, page = 1): Promise<Playlist[]> {
  return hotCache(`${source}:${page}`, () => fetchHotPlaylists(source, page))
}

/**
 * Fetch songs inside a playlist plus list metadata (name/cover) for the platform.
 */
export function getPlaylistDetail(
  source: Source,
  id: string,
  page = 1
): Promise<PlaylistDetail> {
  return detailCache(`${source}:${id}:${page}`, () => fetchPlaylistDetail(source, id, page))
}
