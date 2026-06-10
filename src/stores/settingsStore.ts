import { create } from "zustand"
import { readData, writeData } from "@/lib/db"
import { setTrayVisible } from "@/lib/power"
import type { Quality, Source } from "@/types/music"

export type NamingScheme = "singer-name" | "name-singer" | "name"
export type FavoritesSort = "added" | "name"
export type FavoritesPlatform = Source | "all"
// Close-button behavior: quit the app outright, or hide to the system tray.
export type CloseBehavior = "exit" | "tray"

interface Persisted {
  playQuality: Quality
  downloadQuality: Quality
  // null = default app-data downloads folder; otherwise an absolute directory.
  downloadDir: string | null
  maxConcurrent: number
  fileNaming: NamingScheme
  // Cache the audio of played songs to disk (faster replays + offline).
  audioCache: boolean
  // Disk cache size cap in MB; least-recently-used audio is evicted beyond this.
  maxCacheMB: number
  // Keep the system awake (but allow display sleep/lock) while music plays.
  preventSleepWhilePlaying: boolean
  // Enable global media keyboard shortcuts (space / arrows / M / L).
  shortcutsEnabled: boolean
  // Favorites list view preferences.
  favoritesSort: FavoritesSort
  favoritesPlatform: FavoritesPlatform
  closeBehavior: CloseBehavior
  closeConfirmDismissed: boolean
  // Folder-based sync target (absolute path to a cloud-synced folder), or null.
  syncFolder: string | null
  // Stored so auto-sync can run silently; the cloud file stays encrypted regardless.
  syncPassphrase: string | null
  // Silently back up to the sync folder on quit (vs. ask each time).
  autoBackupOnExit: boolean
  // exportedAt of the last config this device synced — guards startup auto-import
  // against reload loops and against reverting newer local data.
  syncLastAt: string | null
}

interface SettingsState extends Persisted {
  setPlayQuality: (q: Quality) => void
  setDownloadQuality: (q: Quality) => void
  setDownloadDir: (dir: string | null) => void
  setMaxConcurrent: (n: number) => void
  setFileNaming: (s: NamingScheme) => void
  setAudioCache: (v: boolean) => void
  setMaxCacheMB: (n: number) => void
  setPreventSleepWhilePlaying: (v: boolean) => void
  setShortcutsEnabled: (v: boolean) => void
  setFavoritesSort: (s: FavoritesSort) => void
  setFavoritesPlatform: (p: FavoritesPlatform) => void
  setCloseBehavior: (b: CloseBehavior) => void
  setCloseConfirmDismissed: (v: boolean) => void
  setSyncFolder: (dir: string | null) => void
  setSyncPassphrase: (p: string | null) => void
  setAutoBackupOnExit: (v: boolean) => void
  setSyncLastAt: (iso: string | null) => void
  loadFromDisk: () => Promise<void>
}

const DEFAULTS: Persisted = {
  playQuality: "320k",
  downloadQuality: "320k",
  downloadDir: null,
  maxConcurrent: 1,
  fileNaming: "singer-name",
  audioCache: true,
  maxCacheMB: 1024,
  preventSleepWhilePlaying: true,
  shortcutsEnabled: true,
  favoritesSort: "added",
  favoritesPlatform: "all",
  closeBehavior: "exit",
  closeConfirmDismissed: false,
  syncFolder: null,
  syncPassphrase: null,
  autoBackupOnExit: true,
  syncLastAt: null,
}

const QUALITIES: Quality[] = ["128k", "320k", "flac", "flac24bit"]
const NAMINGS: NamingScheme[] = ["singer-name", "name-singer", "name"]
const SORTS: FavoritesSort[] = ["added", "name"]
const FAV_PLATFORMS: FavoritesPlatform[] = ["all", "kw", "kg", "tx", "wy", "mg"]
const CLOSE_BEHAVIORS: CloseBehavior[] = ["exit", "tray"]
export const CACHE_LIMITS_MB = [512, 1024, 2048, 4096]

export const useSettingsStore = create<SettingsState>((set, get) => {
  const persist = () => {
    const {
      playQuality,
      downloadQuality,
      downloadDir,
      maxConcurrent,
      fileNaming,
      audioCache,
      maxCacheMB,
      preventSleepWhilePlaying,
      shortcutsEnabled,
      favoritesSort,
      favoritesPlatform,
      closeBehavior,
      closeConfirmDismissed,
      syncFolder,
      syncPassphrase,
      autoBackupOnExit,
      syncLastAt,
    } = get()
    writeData("settings.json", {
      playQuality,
      downloadQuality,
      downloadDir,
      maxConcurrent,
      fileNaming,
      audioCache,
      maxCacheMB,
      preventSleepWhilePlaying,
      shortcutsEnabled,
      favoritesSort,
      favoritesPlatform,
      closeBehavior,
      closeConfirmDismissed,
      syncFolder,
      syncPassphrase,
      autoBackupOnExit,
      syncLastAt,
    })
  }

  return {
    ...DEFAULTS,

    setPlayQuality(q) {
      set({ playQuality: q })
      persist()
    },
    setDownloadQuality(q) {
      set({ downloadQuality: q })
      persist()
    },
    setDownloadDir(dir) {
      set({ downloadDir: dir })
      persist()
    },
    setMaxConcurrent(n) {
      set({ maxConcurrent: Math.min(5, Math.max(1, Math.round(n))) })
      persist()
    },
    setFileNaming(s) {
      set({ fileNaming: s })
      persist()
    },
    setAudioCache(v) {
      set({ audioCache: v })
      persist()
    },
    setMaxCacheMB(n) {
      set({ maxCacheMB: n })
      persist()
    },
    setPreventSleepWhilePlaying(v) {
      set({ preventSleepWhilePlaying: v })
      persist()
    },
    setShortcutsEnabled(v) {
      set({ shortcutsEnabled: v })
      persist()
    },
    setFavoritesSort(s) {
      set({ favoritesSort: s })
      persist()
    },
    setFavoritesPlatform(p) {
      set({ favoritesPlatform: p })
      persist()
    },
    setCloseBehavior(b) {
      set({ closeBehavior: b })
      persist()
      setTrayVisible(b === "tray")
    },
    setCloseConfirmDismissed(v) {
      set({ closeConfirmDismissed: v })
      persist()
    },
    setSyncFolder(dir) {
      set({ syncFolder: dir })
      persist()
    },
    setSyncPassphrase(p) {
      set({ syncPassphrase: p })
      persist()
    },
    setAutoBackupOnExit(v) {
      set({ autoBackupOnExit: v })
      persist()
    },
    setSyncLastAt(iso) {
      set({ syncLastAt: iso })
      persist()
    },

    async loadFromDisk() {
      const data = await readData<Partial<Persisted>>("settings.json", DEFAULTS)
      set({
        playQuality: QUALITIES.includes(data.playQuality as Quality) ? (data.playQuality as Quality) : DEFAULTS.playQuality,
        downloadQuality: QUALITIES.includes(data.downloadQuality as Quality)
          ? (data.downloadQuality as Quality)
          : DEFAULTS.downloadQuality,
        downloadDir: typeof data.downloadDir === "string" ? data.downloadDir : null,
        maxConcurrent:
          typeof data.maxConcurrent === "number"
            ? Math.min(5, Math.max(1, Math.round(data.maxConcurrent)))
            : DEFAULTS.maxConcurrent,
        fileNaming: NAMINGS.includes(data.fileNaming as NamingScheme)
          ? (data.fileNaming as NamingScheme)
          : DEFAULTS.fileNaming,
        audioCache: typeof data.audioCache === "boolean" ? data.audioCache : DEFAULTS.audioCache,
        maxCacheMB: CACHE_LIMITS_MB.includes(data.maxCacheMB as number)
          ? (data.maxCacheMB as number)
          : DEFAULTS.maxCacheMB,
        preventSleepWhilePlaying:
          typeof data.preventSleepWhilePlaying === "boolean"
            ? data.preventSleepWhilePlaying
            : DEFAULTS.preventSleepWhilePlaying,
        shortcutsEnabled:
          typeof data.shortcutsEnabled === "boolean" ? data.shortcutsEnabled : DEFAULTS.shortcutsEnabled,
        favoritesSort: SORTS.includes(data.favoritesSort as FavoritesSort)
          ? (data.favoritesSort as FavoritesSort)
          : DEFAULTS.favoritesSort,
        favoritesPlatform: FAV_PLATFORMS.includes(data.favoritesPlatform as FavoritesPlatform)
          ? (data.favoritesPlatform as FavoritesPlatform)
          : DEFAULTS.favoritesPlatform,
        closeBehavior: CLOSE_BEHAVIORS.includes(data.closeBehavior as CloseBehavior)
          ? (data.closeBehavior as CloseBehavior)
          : DEFAULTS.closeBehavior,
        closeConfirmDismissed:
          typeof data.closeConfirmDismissed === "boolean"
            ? data.closeConfirmDismissed
            : DEFAULTS.closeConfirmDismissed,
        syncFolder: typeof data.syncFolder === "string" ? data.syncFolder : null,
        syncPassphrase: typeof data.syncPassphrase === "string" ? data.syncPassphrase : null,
        autoBackupOnExit:
          typeof data.autoBackupOnExit === "boolean" ? data.autoBackupOnExit : DEFAULTS.autoBackupOnExit,
        syncLastAt: typeof data.syncLastAt === "string" ? data.syncLastAt : null,
      })
    },
  }
})
