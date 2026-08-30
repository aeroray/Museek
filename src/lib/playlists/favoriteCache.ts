import type { MusicInfo, OnlineSource, Source } from "@/types/music"
import { getAlbumDetail, type AlbumDetailInfo } from "@/lib/albums"
import { usePlaylistStore } from "@/stores/playlistStore"
import { getPlaylistDetail, type PlaylistDetailInfo } from "./index"

export type FavoriteDetailKind = "playlist" | "album"

export type FavoriteDetailInfo = PlaylistDetailInfo | AlbumDetailInfo

export type FavoriteDetailResult = {
  songs: MusicInfo[]
  info?: FavoriteDetailInfo
  /** True when the remote fetch failed or came back empty and we kept the snapshot. */
  usedCacheOnly: boolean
}

function asOnline(source: Source): OnlineSource {
  if (source === "local") throw new Error("local")
  return source
}

export function readFavoriteSongs(
  source: Source,
  id: string,
  kind: FavoriteDetailKind,
): MusicInfo[] {
  return usePlaylistStore.getState().getFavoritePlaylistSongs(source, id, kind)
}

export async function loadFavoriteDetail(
  kind: FavoriteDetailKind,
  source: Source,
  id: string,
): Promise<FavoriteDetailResult> {
  const cached = readFavoriteSongs(source, id, kind)
  try {
    const remote =
      kind === "album"
        ? await getAlbumDetail(asOnline(source), id)
        : await getPlaylistDetail(source, id)
    if (remote.list.length) {
      usePlaylistStore
        .getState()
        .cacheFavoritePlaylistSongs(source, id, kind, remote.list, remote.info)
      return { songs: remote.list, info: remote.info, usedCacheOnly: false }
    }
    if (cached.length) return { songs: cached, usedCacheOnly: true }
    return { songs: [], info: remote.info, usedCacheOnly: false }
  } catch (e) {
    if (cached.length) return { songs: cached, usedCacheOnly: true }
    throw e
  }
}
