import { create } from "zustand"
import { readData, writeData } from "@/lib/db"
import type { MusicInfo, Source } from "@/types/music"
import type { Playlist as SourcePlaylist } from "@/lib/playlists"

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
  removeFromFavorites: (songId: string) => void
  isFavorite: (songId: string) => boolean
  // Favorite a whole platform playlist (from the 歌单 page).
  addFavoritePlaylist: (pl: SourcePlaylist) => void
  removeFavoritePlaylist: (source: Source, id: string) => void
  isFavoritePlaylist: (source: Source, id: string) => boolean
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

function normalizeCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, " ")
}

function isFavoriteCategory(v: unknown): v is FavoriteCategory {
  if (!v || typeof v !== "object") return false
  const c = v as FavoriteCategory
  return typeof c.id === "string" && typeof c.name === "string" && typeof c.createdAt === "number"
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
      // Local files are offline-only — keep them out of the online favorites list.
      if (song.source === "local") return
      if (get().favorites.some((f) => f.id === song.id)) return
      set((s) => ({ favorites: [song, ...s.favorites] }))
      persist()
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

    addFavoritePlaylist(pl) {
      if (get().favoritePlaylists.some((p) => p.source === pl.source && p.id === pl.id)) return
      set((s) => ({ favoritePlaylists: [pl, ...s.favoritePlaylists] }))
      persist()
    },

    removeFavoritePlaylist(source, id) {
      set((s) => ({
        favoritePlaylists: s.favoritePlaylists.filter((p) => !(p.source === source && p.id === id)),
      }))
      persist()
    },

    isFavoritePlaylist(source, id) {
      return get().favoritePlaylists.some((p) => p.source === source && p.id === id)
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
        favoritePlaylists: data.favoritePlaylists ?? [],
        favoriteCategories,
        favoriteSongCategories,
      })
      // Drop any previously saved local tracks from favorites (isolation).
      if (favorites.length !== (data.favorites ?? []).length) persist()
    },
  }
})
