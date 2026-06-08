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

interface PersistShape {
  favorites: MusicInfo[]
  userLists: Playlist[]
  favoritePlaylists: SourcePlaylist[]
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
  loadFromDisk: () => Promise<void>
}

export const usePlaylistStore = create<PlaylistState>((set, get) => {
  const persist = () => {
    const { favorites, userLists, favoritePlaylists } = get()
    writeData("playlists.json", { favorites, userLists, favoritePlaylists })
  }

  return {
    favorites: [],
    userLists: [],
    favoritePlaylists: [],

    addToFavorites(song) {
      if (get().favorites.some((f) => f.id === song.id)) return
      set((s) => ({ favorites: [song, ...s.favorites] }))
      persist()
    },

    removeFromFavorites(songId) {
      set((s) => ({ favorites: s.favorites.filter((f) => f.id !== songId) }))
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

    async loadFromDisk() {
      const data = await readData<Partial<PersistShape>>("playlists.json", {})
      set({
        favorites: data.favorites ?? [],
        userLists: data.userLists ?? [],
        favoritePlaylists: data.favoritePlaylists ?? [],
      })
    },
  }
})
