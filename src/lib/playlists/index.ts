import type { MusicInfo, Source } from "@/types/music"
import { createAsyncCache } from "@/lib/cache"
import { getKwHotPlaylists, getKwPlaylistDetail, getKwPlaylistTags } from "./kw"
import { getTxHotPlaylists, getTxPlaylistDetail, getTxPlaylistTags } from "./tx"
import { getWyHotPlaylists, getWyPlaylistDetail, getWyPlaylistTags } from "./wy"
import { getKgHotPlaylists, getKgPlaylistDetail, getKgPlaylistTags } from "./kg"
import { getMgHotPlaylists, getMgPlaylistDetail, getMgPlaylistTags } from "./mg"

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

/** Category / tag chip for filtering the hot-playlist grid. */
export interface PlaylistTag {
  id: string
  name: string
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

function fetchHotPlaylists(
  source: Source,
  page: number,
  tagId?: string | null
): Promise<Playlist[]> {
  switch (source) {
    case "kw":
      return getKwHotPlaylists(page, tagId)
    case "tx":
      return getTxHotPlaylists(page, tagId)
    case "wy":
      return getWyHotPlaylists(page, tagId)
    case "kg":
      return getKgHotPlaylists(page, tagId)
    case "mg":
      return getMgHotPlaylists(page, tagId)
    default:
      return Promise.resolve([])
  }
}

function fetchPlaylistTags(source: Source): Promise<PlaylistTag[]> {
  switch (source) {
    case "kw":
      return getKwPlaylistTags()
    case "tx":
      return getTxPlaylistTags()
    case "wy":
      return getWyPlaylistTags()
    case "kg":
      return getKgPlaylistTags()
    case "mg":
      return getMgPlaylistTags()
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

// Hot lists, tags, and playlist contents are stable over a session — cache for
// 5 min so switching platforms / tags / reopening a playlist is instant.
const hotCache = createAsyncCache<Playlist[]>(5 * 60_000)
const tagsCache = createAsyncCache<PlaylistTag[]>(5 * 60_000)
const detailCache = createAsyncCache<PlaylistDetail>(5 * 60_000)

/**
 * Fetch the platform's hot/recommended playlists (default "热门" sort, cached).
 * Pass `tagId` to filter by category; omit / null / "" for the default recommend list.
 * Pagination is best-effort: platforms whose hot endpoint returns a single
 * fixed page ignore `page`.
 */
export function getHotPlaylists(
  source: Source,
  page = 1,
  tagId?: string | null
): Promise<Playlist[]> {
  const tagKey = tagId?.trim() || "_"
  return hotCache(`${source}:${page}:${tagKey}`, () => fetchHotPlaylists(source, page, tagId))
}

/**
 * Fetch category tags for the hot-playlist filter bar.
 * Returns [] on unsupported sources; callers should hide the bar when empty
 * (including when the network call fails — see UI).
 */
export function getPlaylistTags(source: Source): Promise<PlaylistTag[]> {
  return tagsCache(`${source}:tags`, () => fetchPlaylistTags(source))
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
