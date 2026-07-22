import { create } from "zustand"
import { readData, writeData } from "@/lib/db"
import { useSettingsStore } from "@/stores/settingsStore"
import {
  buildLocalSong,
  enrichLocalSong,
  localTrackId,
  parseLocalFile,
  pickLocalAudioFiles,
  pickLocalAudioFolder,
  resolveLocalCoverUrl,
} from "@/lib/localMusic"
import { normalizeCategoryName } from "@/lib/songCategories"
import type { LocalCategory, LocalTrack, MusicInfo } from "@/types/music"

const STORE_FILE = "localMusic.json"
const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

interface LocalMusicPersist {
  tracks: LocalTrack[]
  categories: LocalCategory[]
}

interface LocalMusicState {
  tracks: LocalTrack[]
  categories: LocalCategory[]
  importing: boolean
  loadFromDisk: () => Promise<void>
  importFiles: () => Promise<number>
  importFolder: () => Promise<number>
  remove: (id: string) => Promise<void>
  removeMany: (ids: string[]) => Promise<void>
  updateSong: (id: string, song: MusicInfo) => void
  setTrackUnavailable: (id: string, unavailable: boolean) => void
  addCategory: (name: string) => LocalCategory | null
  renameCategory: (id: string, name: string) => void
  removeCategory: (id: string) => void
  setTracksCategory: (ids: string[], categoryId: string | null) => void
}

function persist(tracks: LocalTrack[], categories: LocalCategory[]) {
  // Device-local only — deliberately excluded from config sync (see configIO DB_FILES).
  writeData(STORE_FILE, { tracks, categories } satisfies LocalMusicPersist)
}

async function deleteFileIfNeeded(filePath: string) {
  if (!isTauri) return
  if (!useSettingsStore.getState().deleteLocalFiles) return
  try {
    const { remove, exists } = await import("@tauri-apps/plugin-fs")
    if (await exists(filePath)) await remove(filePath)
  } catch {
    /* ignore — entry still removed from the list */
  }
}

function isLocalTrack(v: unknown): v is LocalTrack {
  if (!v || typeof v !== "object") return false
  const t = v as LocalTrack
  return (
    typeof t.id === "string" &&
    typeof t.filePath === "string" &&
    typeof t.addedAt === "number" &&
    !!t.song &&
    typeof t.song === "object" &&
    t.song.source === "local"
  )
}

function isLocalCategory(v: unknown): v is LocalCategory {
  if (!v || typeof v !== "object") return false
  const c = v as LocalCategory
  return typeof c.id === "string" && typeof c.name === "string" && typeof c.createdAt === "number"
}

function parseStore(raw: unknown): LocalMusicPersist {
  // Legacy: bare LocalTrack[]
  if (Array.isArray(raw)) {
    return { tracks: raw.filter(isLocalTrack), categories: [] }
  }
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>
    const tracks = Array.isArray(obj.tracks) ? obj.tracks.filter(isLocalTrack) : []
    const categories = Array.isArray(obj.categories) ? obj.categories.filter(isLocalCategory) : []
    const catIds = new Set(categories.map((c) => c.id))
    return {
      tracks: tracks.map((t) =>
        t.categoryId && !catIds.has(t.categoryId) ? { ...t, categoryId: null } : t
      ),
      categories,
    }
  }
  return { tracks: [], categories: [] }
}

async function hydrateCovers(tracks: LocalTrack[]): Promise<LocalTrack[]> {
  const out: LocalTrack[] = []
  for (const track of tracks) {
    const rel = track.song.meta.localCoverRel
    if (!rel) {
      out.push(track)
      continue
    }
    const picUrl = await resolveLocalCoverUrl(rel)
    out.push({
      ...track,
      song: {
        ...track.song,
        meta: { ...track.song.meta, picUrl: picUrl ?? track.song.meta.picUrl ?? null },
      },
    })
  }
  return out
}

async function ingestPaths(paths: string[], existing: LocalTrack[]): Promise<LocalTrack[]> {
  const byPath = new Map(existing.map((t) => [t.filePath.replace(/\\/g, "/").toLowerCase(), t]))
  const added: LocalTrack[] = []

  for (const filePath of paths) {
    const key = filePath.replace(/\\/g, "/").toLowerCase()
    if (byPath.has(key)) continue

    const id = localTrackId(filePath)
    const tags = await parseLocalFile(filePath, id)
    let song = buildLocalSong(id, filePath, tags)
    song = await enrichLocalSong(song, tags)

    const track: LocalTrack = { id, filePath, addedAt: Date.now(), categoryId: null, song }
    byPath.set(key, track)
    added.push(track)
  }
  return added
}

export const useLocalMusicStore = create<LocalMusicState>((set, get) => ({
  tracks: [],
  categories: [],
  importing: false,

  async loadFromDisk() {
    const raw = await readData<unknown>(STORE_FILE, [])
    const { tracks, categories } = parseStore(raw)
    const hydrated = await hydrateCovers(tracks)
    set({ tracks: hydrated, categories })
  },

  async importFiles() {
    set({ importing: true })
    try {
      const paths = await pickLocalAudioFiles()
      if (!paths.length) return 0
      const added = await ingestPaths(paths, get().tracks)
      if (!added.length) return 0
      const tracks = [...added, ...get().tracks]
      set({ tracks })
      persist(tracks, get().categories)
      return added.length
    } finally {
      set({ importing: false })
    }
  },

  async importFolder() {
    set({ importing: true })
    try {
      const depth = useSettingsStore.getState().localScanDepth
      const paths = await pickLocalAudioFolder(depth)
      if (!paths.length) return 0
      const added = await ingestPaths(paths, get().tracks)
      if (!added.length) return 0
      const tracks = [...added, ...get().tracks]
      set({ tracks })
      persist(tracks, get().categories)
      return added.length
    } finally {
      set({ importing: false })
    }
  },

  async remove(id) {
    const track = get().tracks.find((t) => t.id === id)
    const tracks = get().tracks.filter((t) => t.id !== id)
    set({ tracks })
    persist(tracks, get().categories)
    if (track) await deleteFileIfNeeded(track.filePath)
  },

  async removeMany(ids) {
    const idSet = new Set(ids)
    const removing = get().tracks.filter((t) => idSet.has(t.id))
    const tracks = get().tracks.filter((t) => !idSet.has(t.id))
    set({ tracks })
    persist(tracks, get().categories)
    for (const t of removing) await deleteFileIfNeeded(t.filePath)
  },

  updateSong(id, song) {
    const tracks = get().tracks.map((t) => (t.id === id ? { ...t, song } : t))
    set({ tracks })
    persist(tracks, get().categories)
  },

  setTrackUnavailable(id, unavailable) {
    const track = get().tracks.find((t) => t.id === id)
    if (!track || !!track.unavailable === unavailable) return
    const tracks = get().tracks.map((t) =>
      t.id === id ? { ...t, unavailable } : t
    )
    set({ tracks })
    persist(tracks, get().categories)
  },

  addCategory(name) {
    const n = normalizeCategoryName(name)
    if (!n) return null
    if (get().categories.some((c) => c.name.toLowerCase() === n.toLowerCase())) return null
    const cat: LocalCategory = {
      id: `lc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      name: n,
      createdAt: Date.now(),
    }
    const categories = [...get().categories, cat]
    set({ categories })
    persist(get().tracks, categories)
    return cat
  },

  renameCategory(id, name) {
    const n = normalizeCategoryName(name)
    if (!n) return
    if (get().categories.some((c) => c.id !== id && c.name.toLowerCase() === n.toLowerCase())) return
    const categories = get().categories.map((c) => (c.id === id ? { ...c, name: n } : c))
    set({ categories })
    persist(get().tracks, categories)
  },

  removeCategory(id) {
    const categories = get().categories.filter((c) => c.id !== id)
    const tracks = get().tracks.map((t) =>
      t.categoryId === id ? { ...t, categoryId: null } : t
    )
    set({ categories, tracks })
    persist(tracks, categories)
  },

  setTracksCategory(ids, categoryId) {
    if (categoryId && !get().categories.some((c) => c.id === categoryId)) return
    const idSet = new Set(ids)
    const tracks = get().tracks.map((t) =>
      idSet.has(t.id) ? { ...t, categoryId } : t
    )
    set({ tracks })
    persist(tracks, get().categories)
  },
}))
