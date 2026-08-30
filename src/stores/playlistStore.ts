import { create } from "zustand"
import { readData, writeData } from "@/lib/db"
import { normalizeCategoryName } from "@/lib/songCategories"
import type { MusicInfo, Source } from "@/types/music"
import { playlistKind, type Playlist as SourcePlaylist } from "@/lib/playlists"

// A user-created playlist (distinct from a favorited platform playlist).
export interface Playlist {
  id: string
  name: string
  songs: MusicInfo[]
  createdAt: number
}

/** Synced favorite-song category (one song → one category). */
export interface FavoriteCategory {
  id: string
  name: string
  createdAt: number
}

interface PersistShape {
  favorites: MusicInfo[]
  userLists: Playlist[]
  favoritePlaylists: SourcePlaylist[]
  favoriteCategories: FavoriteCategory[]
  /** songId → categoryId */
  favoriteSongCategories: Record<string, string>
}

interface PlaylistState extends PersistShape {
  addToFavorites: (song: MusicInfo) => void
  addManyToFavorites: (songs: MusicInfo[]) => number
  removeFromFavorites: (songId: string) => void
  isFavorite: (songId: string) => boolean
  // Favorite a whole platform playlist / album (from 歌单 or 专辑详情).
  addFavoritePlaylist: (pl: SourcePlaylist, songs?: MusicInfo[]) => void
  removeFavoritePlaylist: (source: Source, id: string, kind?: "playlist" | "album") => void
  isFavoritePlaylist: (source: Source, id: string, kind?: "playlist" | "album") => boolean
  cacheFavoritePlaylistSongs: (
    source: Source,
    id: string,
    kind: "playlist" | "album",
    songs: MusicInfo[],
    info?: { name?: string; img?: string | null; author?: string },
  ) => void
  getFavoritePlaylistSongs: (
    source: Source,
    id: string,
    kind?: "playlist" | "album",
  ) => MusicInfo[]
  createPlaylist: (name: string) => Playlist
  renamePlaylist: (id: string, name: string) => void
  deletePlaylist: (id: string) => void
  addSongsToPlaylist: (playlistId: string, songs: MusicInfo[]) => void
  removeSongFromPlaylist: (playlistId: string, songId: string) => void
  addFavoriteCategory: (name: string) => FavoriteCategory | null
  renameFavoriteCategory: (id: string, name: string) => void
  removeFavoriteCategory: (id: string) => void
  setFavoritesCategory: (songIds: string[], categoryId: string | null) => void
  loadFromDisk: () => Promise<void>
}

function isFavoriteCategory(v: unknown): v is FavoriteCategory {
  if (!v || typeof v !== "object") return false
  const c = v as FavoriteCategory
  return typeof c.id === "string" && typeof c.name === "string" && typeof c.createdAt === "number"
}

function isPlayableMusicInfo(v: unknown): v is MusicInfo {
  if (!v || typeof v !== "object") return false
  const song = v as MusicInfo
  return (
    typeof song.id === "string" &&
    typeof song.name === "string" &&
    typeof song.singer === "string" &&
    typeof song.source === "string" &&
    !!song.meta &&
    typeof song.meta === "object" &&
    typeof song.meta.songId === "string"
  )
}

function sanitizeFavoritePlaylist(v: unknown): SourcePlaylist | null {
  if (!v || typeof v !== "object") return null
  const p = v as SourcePlaylist
  if (typeof p.id !== "string" || typeof p.name !== "string" || typeof p.source !== "string") {
    return null
  }
  const songs = Array.isArray(p.songs) ? p.songs.filter(isPlayableMusicInfo) : undefined
  const cachedAt = typeof p.cachedAt === "number" ? p.cachedAt : undefined
  return {
    id: p.id,
    name: p.name,
    img: typeof p.img === "string" || p.img === null ? p.img : null,
    playCount: typeof p.playCount === "string" ? p.playCount : undefined,
    author: typeof p.author === "string" ? p.author : undefined,
    publishTime: typeof p.publishTime === "string" ? p.publishTime : undefined,
    songCount:
      typeof p.songCount === "number"
        ? p.songCount
        : songs?.length,
    source: p.source,
    kind: p.kind === "album" ? "album" : "playlist",
    ...(songs && songs.length ? { songs, cachedAt } : {}),
  }
}

export const usePlaylistStore = create<PlaylistState>((set, get) => {
  const persist = () => {
    const {
      favorites,
      userLists,
      favoritePlaylists,
      favoriteCategories,
      favoriteSongCategories,
    } = get()
    writeData("playlists.json", {
      favorites,
      userLists,
      favoritePlaylists,
      favoriteCategories,
      favoriteSongCategories,
    } satisfies PersistShape)
  }

  return {
    favorites: [],
    userLists: [],
    favoritePlaylists: [],
    favoriteCategories: [],
    favoriteSongCategories: {},

    addToFavorites(song) {
      get().addManyToFavorites([song])
    },

    addManyToFavorites(songs) {
      const existing = new Set(get().favorites.map((f) => f.id))
      const toAdd: MusicInfo[] = []
      for (const song of songs) {
        if (song.source === "local" || existing.has(song.id)) continue
        existing.add(song.id)
        toAdd.push(song)
      }
      if (toAdd.length === 0) return 0
      set((s) => ({ favorites: [...toAdd, ...s.favorites] }))
      persist()
      return toAdd.length
    },

    removeFromFavorites(songId) {
      const { [songId]: _, ...rest } = get().favoriteSongCategories
      set((s) => ({
        favorites: s.favorites.filter((f) => f.id !== songId),
        favoriteSongCategories: rest,
      }))
      persist()
    },

    isFavorite(songId) {
      return get().favorites.some((f) => f.id === songId)
    },

    addFavoritePlaylist(pl, songs) {
      const kind = playlistKind(pl)
      const snapshot = (songs ?? pl.songs)?.filter(isPlayableMusicInfo) ?? []
      if (
        get().favoritePlaylists.some(
          (p) => p.source === pl.source && p.id === pl.id && playlistKind(p) === kind,
        )
      ) {
        if (snapshot.length) {
          get().cacheFavoritePlaylistSongs(pl.source, pl.id, kind, snapshot)
        }
        return
      }
      const entry: SourcePlaylist = {
        id: pl.id,
        name: pl.name,
        img: pl.img,
        playCount: pl.playCount,
        author: pl.author,
        publishTime: pl.publishTime,
        songCount: snapshot.length || pl.songCount,
        source: pl.source,
        kind,
        ...(snapshot.length ? { songs: snapshot, cachedAt: Date.now() } : {}),
      }
      set((s) => ({
        favoritePlaylists: [entry, ...s.favoritePlaylists],
      }))
      persist()
    },

    removeFavoritePlaylist(source, id, kind = "playlist") {
      set((s) => ({
        favoritePlaylists: s.favoritePlaylists.filter(
          (p) => !(p.source === source && p.id === id && playlistKind(p) === kind),
        ),
      }))
      persist()
    },

    isFavoritePlaylist(source, id, kind = "playlist") {
      return get().favoritePlaylists.some(
        (p) => p.source === source && p.id === id && playlistKind(p) === kind,
      )
    },

    cacheFavoritePlaylistSongs(source, id, kind, songs, info) {
      const playable = songs.filter(isPlayableMusicInfo)
      if (!playable.length) return
      let changed = false
      set((s) => ({
        favoritePlaylists: s.favoritePlaylists.map((p) => {
          if (p.source !== source || p.id !== id || playlistKind(p) !== kind) return p
          changed = true
          return {
            ...p,
            name: info?.name || p.name,
            img: info?.img !== undefined ? info.img : p.img,
            author: info?.author ?? p.author,
            songCount: playable.length,
            songs: playable,
            cachedAt: Date.now(),
          }
        }),
      }))
      if (changed) persist()
    },

    getFavoritePlaylistSongs(source, id, kind = "playlist") {
      const p = get().favoritePlaylists.find(
        (x) => x.source === source && x.id === id && playlistKind(x) === kind,
      )
      return p?.songs?.length ? p.songs : []
    },

    createPlaylist(name) {
      const playlist: Playlist = { id: `playlist_${Date.now()}`, name, songs: [], createdAt: Date.now() }
      set((s) => ({ userLists: [...s.userLists, playlist] }))
      persist()
      return playlist
    },

    renamePlaylist(id, name) {
      set((s) => ({ userLists: s.userLists.map((p) => (p.id === id ? { ...p, name } : p)) }))
      persist()
    },

    deletePlaylist(id) {
      set((s) => ({ userLists: s.userLists.filter((p) => p.id !== id) }))
      persist()
    },

    addSongsToPlaylist(playlistId, songs) {
      set((s) => ({
        userLists: s.userLists.map((p) => {
          if (p.id !== playlistId) return p
          const existing = new Set(p.songs.map((x) => x.id))
          return { ...p, songs: [...p.songs, ...songs.filter((x) => !existing.has(x.id))] }
        }),
      }))
      persist()
    },

    removeSongFromPlaylist(playlistId, songId) {
      set((s) => ({
        userLists: s.userLists.map((p) =>
          p.id === playlistId ? { ...p, songs: p.songs.filter((x) => x.id !== songId) } : p
        ),
      }))
      persist()
    },

    addFavoriteCategory(name) {
      const n = normalizeCategoryName(name)
      if (!n) return null
      if (get().favoriteCategories.some((c) => c.name.toLowerCase() === n.toLowerCase())) return null
      const cat: FavoriteCategory = {
        id: `fc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        name: n,
        createdAt: Date.now(),
      }
      set((s) => ({ favoriteCategories: [...s.favoriteCategories, cat] }))
      persist()
      return cat
    },

    renameFavoriteCategory(id, name) {
      const n = normalizeCategoryName(name)
      if (!n) return
      if (
        get().favoriteCategories.some(
          (c) => c.id !== id && c.name.toLowerCase() === n.toLowerCase()
        )
      ) {
        return
      }
      set((s) => ({
        favoriteCategories: s.favoriteCategories.map((c) =>
          c.id === id ? { ...c, name: n } : c
        ),
      }))
      persist()
    },

    removeFavoriteCategory(id) {
      const nextMap = { ...get().favoriteSongCategories }
      for (const [songId, catId] of Object.entries(nextMap)) {
        if (catId === id) delete nextMap[songId]
      }
      set((s) => ({
        favoriteCategories: s.favoriteCategories.filter((c) => c.id !== id),
        favoriteSongCategories: nextMap,
      }))
      persist()
    },

    setFavoritesCategory(songIds, categoryId) {
      if (categoryId && !get().favoriteCategories.some((c) => c.id === categoryId)) return
      const next = { ...get().favoriteSongCategories }
      for (const id of songIds) {
        if (!categoryId) delete next[id]
        else next[id] = categoryId
      }
      set({ favoriteSongCategories: next })
      persist()
    },

    async loadFromDisk() {
      const data = await readData<Partial<PersistShape>>("playlists.json", {})
      const favorites = (data.favorites ?? []).filter((f) => f?.source !== "local")
      const favIds = new Set(favorites.map((f) => f.id))
      const favoriteCategories = Array.isArray(data.favoriteCategories)
        ? data.favoriteCategories.filter(isFavoriteCategory)
        : []
      const catIds = new Set(favoriteCategories.map((c) => c.id))
      const rawMap =
        data.favoriteSongCategories && typeof data.favoriteSongCategories === "object"
          ? data.favoriteSongCategories
          : {}
      const favoriteSongCategories: Record<string, string> = {}
      for (const [songId, catId] of Object.entries(rawMap)) {
        if (
          typeof songId === "string" &&
          typeof catId === "string" &&
          favIds.has(songId) &&
          catIds.has(catId)
        ) {
          favoriteSongCategories[songId] = catId
        }
      }
      set({
        favorites,
        userLists: data.userLists ?? [],
        favoritePlaylists: (data.favoritePlaylists ?? [])
          .map(sanitizeFavoritePlaylist)
          .filter((p): p is SourcePlaylist => p !== null),
        favoriteCategories,
        favoriteSongCategories,
      })
      // Drop any previously saved local tracks from favorites (isolation).
      if (favorites.length !== (data.favorites ?? []).length) persist()
    },
  }
})
