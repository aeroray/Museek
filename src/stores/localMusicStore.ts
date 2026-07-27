import { create } from "zustand"
import { readData, writeData } from "@/lib/db"
import { useSettingsStore } from "@/stores/settingsStore"
import {
  buildLocalSong,
  enrichLocalSong,
  isLocalAudioPath,
  localTrackId,
  parseLocalFile,
  peekLocalQuality,
  pickLocalAudioFiles,
  pickLocalAudioFolder,
  resolveLocalCoverUrl,
} from "@/lib/localMusic"
import { indexQualitySizes } from "@/lib/quality"
import { normalizeCategoryName } from "@/lib/songCategories"
import type { LocalCategory, LocalTrack, MusicInfo } from "@/types/music"

const STORE_FILE = "localMusic.json"
const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

/** Parallel file reads + tag parse. Keep modest — each file is loaded fully into memory. */
const IMPORT_CONCURRENCY = 4
const PERSIST_DEBOUNCE_MS = 400
/** Bump when local quality detection changes — triggers one-time re-probe on load. */
const QUALITY_SCHEMA = 1

export type LocalImportProgress = {
  done: number
  total: number
  /** Basename of the file most recently finished */
  current?: string
}

interface LocalMusicPersist {
  tracks: LocalTrack[]
  categories: LocalCategory[]
  qualitySchema?: number
}

interface LocalMusicState {
  tracks: LocalTrack[]
  categories: LocalCategory[]
  importing: boolean
  importProgress: LocalImportProgress | null
  loadFromDisk: () => Promise<void>
  importFiles: () => Promise<number>
  importFolder: () => Promise<number>
  /** Import absolute filesystem paths (OS "Open with" / file association). */
  importPaths: (paths: string[]) => Promise<number>
  remove: (id: string) => Promise<void>
  removeMany: (ids: string[]) => Promise<void>
  updateSong: (id: string, song: MusicInfo) => void
  setTrackUnavailable: (id: string, unavailable: boolean) => void
  addCategory: (name: string) => LocalCategory | null
  renameCategory: (id: string, name: string) => void
  removeCategory: (id: string) => void
  setTracksCategory: (ids: string[], categoryId: string | null) => void
}

function persist(
  tracks: LocalTrack[],
  categories: LocalCategory[],
  qualitySchema: number = QUALITY_SCHEMA
) {
  // Device-local only — deliberately excluded from config sync (see configIO DB_FILES).
  writeData(STORE_FILE, { tracks, categories, qualitySchema } satisfies LocalMusicPersist)
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
    return { tracks: raw.filter(isLocalTrack), categories: [], qualitySchema: 0 }
  }
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>
    const tracks = Array.isArray(obj.tracks) ? obj.tracks.filter(isLocalTrack) : []
    const categories = Array.isArray(obj.categories) ? obj.categories.filter(isLocalCategory) : []
    const catIds = new Set(categories.map((c) => c.id))
    const qualitySchema =
      typeof obj.qualitySchema === "number" && Number.isFinite(obj.qualitySchema)
        ? obj.qualitySchema
        : 0
    return {
      tracks: tracks.map((t) =>
        t.categoryId && !catIds.has(t.categoryId) ? { ...t, categoryId: null } : t
      ),
      categories,
      qualitySchema,
    }
  }
  return { tracks: [], categories: [], qualitySchema: 0 }
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

function pathKey(filePath: string): string {
  return filePath.replace(/\\/g, "/").toLowerCase()
}

function fileBasename(filePath: string): string {
  return filePath.split(/[/\\]/).pop() ?? filePath
}

/** Run `worker` over `items` with a fixed concurrency pool. */
async function mapPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return
  let next = 0
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      await worker(items[i])
    }
  })
  await Promise.all(runners)
}

export const useLocalMusicStore = create<LocalMusicState>((set, get) => {
  let persistTimer: ReturnType<typeof setTimeout> | null = null

  function schedulePersist() {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      persistTimer = null
      const { tracks, categories } = get()
      persist(tracks, categories)
    }, PERSIST_DEBOUNCE_MS)
  }

  function flushPersist() {
    if (persistTimer) {
      clearTimeout(persistTimer)
      persistTimer = null
    }
    const { tracks, categories } = get()
    persist(tracks, categories)
  }

  function prependTrack(track: LocalTrack) {
    // Functional set avoids lost updates when several workers finish close together.
    set((state) => ({ tracks: [track, ...state.tracks] }))
    schedulePersist()
  }

  function upsertRestoredTrack(track: LocalTrack) {
    set((state) => ({
      tracks: state.tracks.map((t) => (t.id === track.id ? track : t)),
    }))
    schedulePersist()
  }

  async function ingestPaths(paths: string[]): Promise<number> {
    const byPath = new Map(get().tracks.map((t) => [pathKey(t.filePath), t]))
    const toImport: string[] = []
    const toRestore: LocalTrack[] = []
    const seen = new Set<string>()

    for (const filePath of paths) {
      const key = pathKey(filePath)
      if (seen.has(key)) continue
      seen.add(key)
      const existing = byPath.get(key)
      if (existing) {
        // Same path again: if it was marked missing, clear that on successful re-read.
        if (existing.unavailable) toRestore.push(existing)
        continue
      }
      toImport.push(filePath)
    }

    const total = toImport.length + toRestore.length
    if (total === 0) {
      set({ importProgress: null })
      return 0
    }

    let done = 0
    let added = 0
    set({ importProgress: { done: 0, total } })

    const bumpProgress = (current: string) => {
      done += 1
      set({ importProgress: { done, total, current } })
    }

    await mapPool(toRestore, IMPORT_CONCURRENCY, async (existing) => {
      const current = fileBasename(existing.filePath)
      try {
        const tags = await parseLocalFile(existing.filePath, existing.id)
        const song = buildLocalSong(existing.id, existing.filePath, tags)
        upsertRestoredTrack({
          ...existing,
          unavailable: false,
          song,
        })
        added += 1
        void enrichLocalSong(song, tags).then((enriched) => {
          if (enriched !== song) get().updateSong(existing.id, enriched)
        })
      } catch {
        /* still missing / unreadable — leave unavailable as-is */
      } finally {
        bumpProgress(current)
      }
    })

    await mapPool(toImport, IMPORT_CONCURRENCY, async (filePath) => {
      const current = fileBasename(filePath)
      try {
        const id = localTrackId(filePath)
        const tags = await parseLocalFile(filePath, id)
        const song = buildLocalSong(id, filePath, tags)
        const track: LocalTrack = {
          id,
          filePath,
          addedAt: Date.now(),
          categoryId: null,
          song,
        }
        prependTrack(track)
        added += 1

        // Enrich (NetEase fill) off the critical path so the row appears immediately.
        void enrichLocalSong(song, tags).then((enriched) => {
          if (enriched !== song) get().updateSong(id, enriched)
        })
      } catch {
        /* skip unreadable files; still advance progress */
      } finally {
        bumpProgress(current)
      }
    })

    flushPersist()
    return added
  }

  return {
    tracks: [],
    categories: [],
    importing: false,
    importProgress: null,

    async loadFromDisk() {
      const raw = await readData<unknown>(STORE_FILE, [])
      const { tracks, categories, qualitySchema } = parseStore(raw)
      const hydrated = await hydrateCovers(tracks)
      set({ tracks: hydrated, categories })

      // One-time fix: older imports guessed quality from extension only (e.g. all
      // MP3 → 320k, 24-bit FLAC → FLAC). Re-probe in the background.
      if ((qualitySchema ?? 0) < QUALITY_SCHEMA && hydrated.length > 0) {
        void (async () => {
          await mapPool(hydrated, IMPORT_CONCURRENCY, async (track) => {
            const qualitys = await peekLocalQuality(track.filePath)
            if (!qualitys?.length) return
            const next = qualitys[0]?.type
            const prev = track.song.meta.qualitys[0]?.type
            const sizeChanged =
              (qualitys[0]?.size ?? null) !== (track.song.meta.qualitys[0]?.size ?? null)
            if (!next || (next === prev && !sizeChanged)) return
            const _qualitys = indexQualitySizes(qualitys)
            set((state) => ({
              tracks: state.tracks.map((t) =>
                t.id === track.id
                  ? {
                      ...t,
                      song: {
                        ...t.song,
                        meta: { ...t.song.meta, qualitys, _qualitys },
                      },
                    }
                  : t
              ),
            }))
          })
          persist(get().tracks, get().categories, QUALITY_SCHEMA)
        })()
      } else if ((qualitySchema ?? 0) < QUALITY_SCHEMA) {
        persist(hydrated, categories, QUALITY_SCHEMA)
      }
    },

    async importFiles() {
      const paths = await pickLocalAudioFiles()
      if (!paths.length) return 0
      set({ importing: true, importProgress: null })
      try {
        return await ingestPaths(paths)
      } finally {
        set({ importing: false, importProgress: null })
      }
    },

    async importFolder() {
      const depth = useSettingsStore.getState().localScanDepth
      const paths = await pickLocalAudioFolder(depth)
      if (!paths.length) return 0
      set({ importing: true, importProgress: null })
      try {
        return await ingestPaths(paths)
      } finally {
        set({ importing: false, importProgress: null })
      }
    },

    async importPaths(paths) {
      const filtered = paths.filter((p) => typeof p === "string" && isLocalAudioPath(p))
      if (!filtered.length) return 0
      set({ importing: true, importProgress: null })
      try {
        return await ingestPaths(filtered)
      } finally {
        set({ importing: false, importProgress: null })
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
  }
})
