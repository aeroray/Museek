import { create } from "zustand";
import { readData, writeData } from "@/lib/db";
import { normalizeLocalScanDepth } from "@/lib/localMusic/depth";
import { setTrayVisible } from "@/lib/power";
import { syncOpenAtLogin } from "@/lib/autostart";
import type { LocalNameMode, OnlineSource, Quality } from "@/types/music";

export type NamingScheme = "singer-name" | "name-singer" | "name";
export type FavoritesSort = "added" | "name";
export type LocalSort = FavoritesSort;
export type FavoritesPlatform = OnlineSource | "all";
// Close-button behavior: quit the app outright, or hide to the system tray.
export type CloseBehavior = "exit" | "tray";

interface Persisted {
  playQuality: Quality;
  downloadQuality: Quality;
  embedLyrics: boolean;
  embedCover: boolean;
  // null = not set → the user is prompted to choose on first download; otherwise an
  // absolute directory. Device-local: deliberately excluded from cross-device sync
  // (Windows/macOS paths differ), see DEVICE_LOCAL_SETTINGS in configIO.ts.
  downloadDir: string | null;
  maxConcurrent: number;
  fileNaming: NamingScheme;
  // When removing a download task, also delete the saved audio file on disk.
  // Default off — clearing the task list should not wipe the library.
  deleteDownloadFiles: boolean;
  // Folder import recursion depth (0–2 finite levels; -1 = unlimited).
  localScanDepth: number;
  // Legacy migration only. New local imports use smart recognition by default,
  // with naming overrides stored on individual LocalTrack records.
  localNameMode: LocalNameMode;
  // When removing a local-library entry, also delete the audio file on disk.
  deleteLocalFiles: boolean;
  // Cache the audio of played songs to disk (faster replays + offline).
  audioCache: boolean;
  // Disk cache size cap in MB; least-recently-used audio is evicted beyond this.
  maxCacheMB: number;
  // Keep the system awake (but allow display sleep/lock) while music plays.
  preventSleepWhilePlaying: boolean;
  // Open the separate desktop lyrics window in locked mode by default.
  autoLockDesktopLyrics: boolean;
  // Keep a readable translucent capsule behind desktop lyrics.
  desktopLyricsCapsuleVisible: boolean;
  // Favorites list view preferences.
  favoritesSort: FavoritesSort;
  favoritesPlatform: FavoritesPlatform;
  // Local music list sort (added / name).
  localSort: LocalSort;
  closeBehavior: CloseBehavior;
  closeConfirmDismissed: boolean;
  /** Launch Museek when the OS signs in (Win + macOS). Default off. */
  openAtLogin: boolean;
  /**
   * When opened via the login item (`--autostart`), hide to tray instead of
   * showing the main window. Requires openAtLogin; forces closeBehavior tray.
   */
  startHiddenToTray: boolean;
  // Folder-based sync target (absolute path to a cloud-synced folder), or null.
  syncFolder: string | null;
  // Stored so auto-sync can run silently; the cloud file stays encrypted regardless.
  syncPassphrase: string | null;
  // Silently back up to the sync folder on quit (vs. ask each time).
  autoBackupOnExit: boolean;
  // exportedAt of the last config this device synced — guards startup auto-import
  // against reload loops and against reverting newer local data.
  syncLastAt: string | null;
}

interface SettingsState extends Persisted {
  setPlayQuality: (q: Quality) => void;
  setDownloadQuality: (q: Quality) => void;
  setEmbedLyrics: (v: boolean) => void;
  setEmbedCover: (v: boolean) => void;
  setDownloadDir: (dir: string | null) => void;
  setMaxConcurrent: (n: number) => void;
  setFileNaming: (s: NamingScheme) => void;
  setDeleteDownloadFiles: (v: boolean) => void;
  setLocalScanDepth: (n: number) => void;
  setDeleteLocalFiles: (v: boolean) => void;
  setAudioCache: (v: boolean) => void;
  setMaxCacheMB: (n: number) => void;
  setPreventSleepWhilePlaying: (v: boolean) => void;
  setAutoLockDesktopLyrics: (v: boolean) => void;
  setDesktopLyricsCapsuleVisible: (v: boolean) => void;
  setFavoritesSort: (s: FavoritesSort) => void;
  setFavoritesPlatform: (p: FavoritesPlatform) => void;
  setLocalSort: (s: LocalSort) => void;
  setCloseBehavior: (b: CloseBehavior) => void;
  setCloseConfirmDismissed: (v: boolean) => void | Promise<void>;
  setOpenAtLogin: (v: boolean) => void;
  setStartHiddenToTray: (v: boolean) => void;
  setSyncFolder: (dir: string | null) => void;
  setSyncPassphrase: (p: string | null) => void;
  setAutoBackupOnExit: (v: boolean) => void;
  setSyncLastAt: (iso: string | null) => void;
  loadFromDisk: () => Promise<void>;
}

const DEFAULTS: Persisted = {
  playQuality: "320k",
  downloadQuality: "320k",
  embedLyrics: true,
  embedCover: true,
  downloadDir: null,
  maxConcurrent: 1,
  fileNaming: "singer-name",
  deleteDownloadFiles: false,
  localScanDepth: 0,
  localNameMode: "smart",
  deleteLocalFiles: false,
  audioCache: true,
  maxCacheMB: 1024,
  preventSleepWhilePlaying: true,
  autoLockDesktopLyrics: false,
  desktopLyricsCapsuleVisible: true,
  favoritesSort: "added",
  favoritesPlatform: "all",
  localSort: "added",
  closeBehavior: "exit",
  closeConfirmDismissed: false,
  openAtLogin: false,
  startHiddenToTray: false,
  syncFolder: null,
  syncPassphrase: null,
  autoBackupOnExit: true,
  syncLastAt: null,
};

const QUALITIES: Quality[] = ["128k", "320k", "flac", "flac24bit"];
const NAMINGS: NamingScheme[] = ["singer-name", "name-singer", "name"];
const SORTS: FavoritesSort[] = ["added", "name"];
const FAV_PLATFORMS: FavoritesPlatform[] = [
  "all",
  "kw",
  "kg",
  "tx",
  "wy",
  "mg",
];
const LOCAL_NAME_MODES: LocalNameMode[] = ["filename", "smart"];
const CLOSE_BEHAVIORS: CloseBehavior[] = ["exit", "tray"];
export const CACHE_LIMITS_MB = [512, 1024, 2048, 4096];

export const useSettingsStore = create<SettingsState>((set, get) => {
  const persist = () => {
    const {
      playQuality,
      downloadQuality,
      embedLyrics,
      embedCover,
      downloadDir,
      maxConcurrent,
      fileNaming,
      deleteDownloadFiles,
      localScanDepth,
      localNameMode,
      deleteLocalFiles,
      audioCache,
      maxCacheMB,
      preventSleepWhilePlaying,
      autoLockDesktopLyrics,
      desktopLyricsCapsuleVisible,
      favoritesSort,
      favoritesPlatform,
      localSort,
      closeBehavior,
      closeConfirmDismissed,
      openAtLogin,
      startHiddenToTray,
      syncFolder,
      syncPassphrase,
      autoBackupOnExit,
      syncLastAt,
    } = get();
    return writeData("settings.json", {
      playQuality,
      downloadQuality,
      embedLyrics,
      embedCover,
      downloadDir,
      maxConcurrent,
      fileNaming,
      deleteDownloadFiles,
      localScanDepth,
      localNameMode,
      deleteLocalFiles,
      audioCache,
      maxCacheMB,
      preventSleepWhilePlaying,
      autoLockDesktopLyrics,
      desktopLyricsCapsuleVisible,
      favoritesSort,
      favoritesPlatform,
      localSort,
      closeBehavior,
      closeConfirmDismissed,
      openAtLogin,
      startHiddenToTray,
      syncFolder,
      syncPassphrase,
      autoBackupOnExit,
      syncLastAt,
    });
  };

  return {
    ...DEFAULTS,

    setPlayQuality(q) {
      set({ playQuality: q });
      persist();
    },
    setDownloadQuality(q) {
      set({ downloadQuality: q });
      persist();
    },
    setEmbedLyrics(v) {
      set({ embedLyrics: v });
      persist();
    },
    setEmbedCover(v) {
      set({ embedCover: v });
      persist();
    },
    setDownloadDir(dir) {
      set({ downloadDir: dir });
      persist();
    },
    setMaxConcurrent(n) {
      set({ maxConcurrent: Math.min(5, Math.max(1, Math.round(n))) });
      persist();
    },
    setFileNaming(s) {
      set({ fileNaming: s });
      persist();
    },
    setDeleteDownloadFiles(v) {
      set({ deleteDownloadFiles: v });
      persist();
    },
    setLocalScanDepth(n) {
      set({ localScanDepth: normalizeLocalScanDepth(n) });
      persist();
    },
    setDeleteLocalFiles(v) {
      set({ deleteLocalFiles: v });
      persist();
    },
    setAudioCache(v) {
      set({ audioCache: v });
      persist();
    },
    setMaxCacheMB(n) {
      set({ maxCacheMB: n });
      persist();
    },
    setPreventSleepWhilePlaying(v) {
      set({ preventSleepWhilePlaying: v });
      persist();
    },
    setAutoLockDesktopLyrics(v) {
      set({ autoLockDesktopLyrics: v });
      persist();
    },
    setDesktopLyricsCapsuleVisible(v) {
      set({ desktopLyricsCapsuleVisible: v });
      persist();
    },
    setFavoritesSort(s) {
      set({ favoritesSort: s });
      persist();
    },
    setFavoritesPlatform(p) {
      set({ favoritesPlatform: p });
      persist();
    },
    setLocalSort(s) {
      set({ localSort: s });
      persist();
    },
    setCloseBehavior(b) {
      if (b === "exit" && get().startHiddenToTray) {
        set({ closeBehavior: b, startHiddenToTray: false });
      } else {
        set({ closeBehavior: b });
      }
      persist();
      setTrayVisible(b === "tray");
    },
    setCloseConfirmDismissed(v) {
      set({ closeConfirmDismissed: v });
      // Must be awaitable: CloseGuard quits right after this, and a fire-and-forget
      // write can be killed before it hits disk (so "don't remind" never sticks).
      return persist();
    },
    setOpenAtLogin(v) {
      set({
        openAtLogin: v,
        // Silent start only makes sense with login autostart.
        ...(v ? {} : { startHiddenToTray: false }),
      });
      persist();
      void syncOpenAtLogin(v);
    },
    setStartHiddenToTray(v) {
      if (v) {
        // Need a tray icon to recover the window after a silent login launch.
        set({
          startHiddenToTray: true,
          openAtLogin: true,
          closeBehavior: "tray",
        });
        setTrayVisible(true);
        void syncOpenAtLogin(true);
      } else {
        set({ startHiddenToTray: false });
      }
      persist();
    },
    setSyncFolder(dir) {
      set({ syncFolder: dir });
      persist();
    },
    setSyncPassphrase(p) {
      set({ syncPassphrase: p });
      persist();
    },
    setAutoBackupOnExit(v) {
      set({ autoBackupOnExit: v });
      persist();
    },
    setSyncLastAt(iso) {
      set({ syncLastAt: iso });
      persist();
    },

    async loadFromDisk() {
      const data = await readData<Partial<Persisted>>(
        "settings.json",
        DEFAULTS,
      );
      set({
        playQuality: QUALITIES.includes(data.playQuality as Quality)
          ? (data.playQuality as Quality)
          : DEFAULTS.playQuality,
        downloadQuality: QUALITIES.includes(data.downloadQuality as Quality)
          ? (data.downloadQuality as Quality)
          : DEFAULTS.downloadQuality,
        embedLyrics:
          typeof data.embedLyrics === "boolean"
            ? data.embedLyrics
            : DEFAULTS.embedLyrics,
        embedCover:
          typeof data.embedCover === "boolean"
            ? data.embedCover
            : DEFAULTS.embedCover,
        // Device-local: kept in settings.json, never gated on WebView localStorage
        // (that flag was wiped on some updates and then persist() blanked the path).
        downloadDir:
          typeof data.downloadDir === "string" && data.downloadDir.trim()
            ? data.downloadDir
            : null,
        maxConcurrent:
          typeof data.maxConcurrent === "number"
            ? Math.min(5, Math.max(1, Math.round(data.maxConcurrent)))
            : DEFAULTS.maxConcurrent,
        fileNaming: NAMINGS.includes(data.fileNaming as NamingScheme)
          ? (data.fileNaming as NamingScheme)
          : DEFAULTS.fileNaming,
        deleteDownloadFiles:
          typeof data.deleteDownloadFiles === "boolean"
            ? data.deleteDownloadFiles
            : DEFAULTS.deleteDownloadFiles,
        localScanDepth:
          typeof data.localScanDepth === "number"
            ? normalizeLocalScanDepth(data.localScanDepth)
            : DEFAULTS.localScanDepth,
        localNameMode: LOCAL_NAME_MODES.includes(
          data.localNameMode as LocalNameMode,
        )
          ? (data.localNameMode as LocalNameMode)
          : DEFAULTS.localNameMode,
        deleteLocalFiles:
          typeof data.deleteLocalFiles === "boolean"
            ? data.deleteLocalFiles
            : DEFAULTS.deleteLocalFiles,
        audioCache:
          typeof data.audioCache === "boolean"
            ? data.audioCache
            : DEFAULTS.audioCache,
        maxCacheMB: CACHE_LIMITS_MB.includes(data.maxCacheMB as number)
          ? (data.maxCacheMB as number)
          : DEFAULTS.maxCacheMB,
        preventSleepWhilePlaying:
          typeof data.preventSleepWhilePlaying === "boolean"
            ? data.preventSleepWhilePlaying
            : DEFAULTS.preventSleepWhilePlaying,
        autoLockDesktopLyrics:
          typeof data.autoLockDesktopLyrics === "boolean"
            ? data.autoLockDesktopLyrics
            : DEFAULTS.autoLockDesktopLyrics,
        desktopLyricsCapsuleVisible:
          typeof data.desktopLyricsCapsuleVisible === "boolean"
            ? data.desktopLyricsCapsuleVisible
            : DEFAULTS.desktopLyricsCapsuleVisible,
        favoritesSort: SORTS.includes(data.favoritesSort as FavoritesSort)
          ? (data.favoritesSort as FavoritesSort)
          : DEFAULTS.favoritesSort,
        favoritesPlatform: FAV_PLATFORMS.includes(
          data.favoritesPlatform as FavoritesPlatform,
        )
          ? (data.favoritesPlatform as FavoritesPlatform)
          : DEFAULTS.favoritesPlatform,
        localSort: SORTS.includes(data.localSort as LocalSort)
          ? (data.localSort as LocalSort)
          : DEFAULTS.localSort,
        closeBehavior: CLOSE_BEHAVIORS.includes(
          data.closeBehavior as CloseBehavior,
        )
          ? (data.closeBehavior as CloseBehavior)
          : DEFAULTS.closeBehavior,
        closeConfirmDismissed:
          typeof data.closeConfirmDismissed === "boolean"
            ? data.closeConfirmDismissed
            : DEFAULTS.closeConfirmDismissed,
        openAtLogin:
          typeof data.openAtLogin === "boolean"
            ? data.openAtLogin
            : DEFAULTS.openAtLogin,
        startHiddenToTray:
          typeof data.startHiddenToTray === "boolean"
            ? data.startHiddenToTray
            : DEFAULTS.startHiddenToTray,
        syncFolder:
          typeof data.syncFolder === "string" ? data.syncFolder : null,
        syncPassphrase:
          typeof data.syncPassphrase === "string" ? data.syncPassphrase : null,
        autoBackupOnExit:
          typeof data.autoBackupOnExit === "boolean"
            ? data.autoBackupOnExit
            : DEFAULTS.autoBackupOnExit,
        syncLastAt:
          typeof data.syncLastAt === "string" ? data.syncLastAt : null,
      });
      // Keep the OS login item in sync with the saved preference.
      const openAtLogin = get().openAtLogin;
      // Silent start without openAtLogin is invalid after load.
      if (get().startHiddenToTray && !openAtLogin) {
        set({ startHiddenToTray: false });
        persist();
      }
      // Opening silent start implies tray close mode.
      if (get().startHiddenToTray && get().closeBehavior !== "tray") {
        set({ closeBehavior: "tray" });
        persist();
        setTrayVisible(true);
      }
      void syncOpenAtLogin(openAtLogin);
    },
  };
});
