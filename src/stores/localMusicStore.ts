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
import type { LocalTrack, MusicInfo } from "@/types/music"

const STORE_FILE = "localMusic.json"
const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

interface LocalMusicState {
  tracks: LocalTrack[]
  importing: boolean
  loadFromDisk: () => Promise<void>
  importFiles: () => Promise<number>
  importFolder: () => Promise<number>
  remove: (id: string) => Promise<void>
  removeMany: (ids: string[]) => Promise<void>
  updateSong: (id: string, song: MusicInfo) => void
}

function persist(tracks: LocalTrack[]) {
  // Device-local only — deliberately excluded from config sync (see configIO DB_FILES).
  writeData(STORE_FILE, tracks)
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

    const track: LocalTrack = { id, filePath, addedAt: Date.now(), song }
    byPath.set(key, track)
    added.push(track)
  }
  return added
}

export const useLocalMusicStore = create<LocalMusicState>((set, get) => ({
  tracks: [],
  importing: false,

  async loadFromDisk() {
    const raw = await readData<unknown>(STORE_FILE, [])
    const list = Array.isArray(raw) ? raw.filter(isLocalTrack) : []
    const hydrated = await hydrateCovers(list)
    set({ tracks: hydrated })
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
      persist(tracks)
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
      persist(tracks)
      return added.length
    } finally {
      set({ importing: false })
    }
  },

  async remove(id) {
    const track = get().tracks.find((t) => t.id === id)
    const tracks = get().tracks.filter((t) => t.id !== id)
    set({ tracks })
    persist(tracks)
    if (track) await deleteFileIfNeeded(track.filePath)
  },

  async removeMany(ids) {
    const idSet = new Set(ids)
    const removing = get().tracks.filter((t) => idSet.has(t.id))
    const tracks = get().tracks.filter((t) => !idSet.has(t.id))
    set({ tracks })
    persist(tracks)
    for (const t of removing) await deleteFileIfNeeded(t.filePath)
  },

  updateSong(id, song) {
    const tracks = get().tracks.map((t) => (t.id === id ? { ...t, song } : t))
    set({ tracks })
    persist(tracks)
  },
}))
