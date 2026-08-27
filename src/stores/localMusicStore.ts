import { create } from "zustand";
import { readData, writeData } from "@/lib/db";
import { useSettingsStore } from "@/stores/settingsStore";
import {
  buildLocalSong,
  enrichLocalSong,
  isLocalAudioPath,
  isPlaceholderArtist,
  localFilenameTitle,
  localResolvedTitle,
  localTrackId,
  parseLocalFile,
  peekLocalQuality,
  pickLocalAudioFiles,
  pickLocalAudioFolder,
  resolveLocalCoverUrl,
  tagsFromFilename,
  type LocalEnrichStatus,
  type ParsedLocalTags,
} from "@/lib/localMusic";
import { fetchWySongDetail } from "@/lib/search/wy";
import { indexQualitySizes } from "@/lib/quality";
import { normalizeCategoryName } from "@/lib/songCategories";
import type {
  LocalCategory,
  LocalNameMode,
  LocalTrack,
  MusicInfo,
} from "@/types/music";

const STORE_FILE = "localMusic.json";
const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function dropRemovedFromPlayback(ids: string[]) {
  const { usePlayerStore } = await import("@/stores/playerStore");
  usePlayerStore.getState().removeSongsFromPlayback(ids);
}

/** Parallel file reads for restore/refresh/quality probe. New imports skip this. */
const IMPORT_CONCURRENCY = 4;
const PERSIST_DEBOUNCE_MS = 400;
/** Bump when local quality detection changes — triggers one-time re-probe on load. */
const QUALITY_SCHEMA = 1;
/** Bump when local naming changes from a global setting to per-track overrides. */
const NAME_MODE_SCHEMA = 1;

export type LocalMatchSummary = {
  applied: number;
  miss: number;
  unchanged: number;
};

export type LocalImportProgress = {
  done: number;
  total: number;
  /** Basename of the file most recently finished */
  current?: string;
};

interface LocalMusicPersist {
  tracks: LocalTrack[];
  categories: LocalCategory[];
  qualitySchema?: number;
  nameModeSchema?: number;
}

interface LocalMusicState {
  tracks: LocalTrack[];
  categories: LocalCategory[];
  importing: boolean;
  importProgress: LocalImportProgress | null;
  matching: boolean;
  matchProgress: LocalImportProgress | null;
  loadFromDisk: () => Promise<void>;
  importFiles: () => Promise<number>;
  importFolder: () => Promise<number>;
  importPaths: (
    paths: string[],
    opts?: { refreshExisting?: boolean },
  ) => Promise<number>;
  remove: (id: string) => Promise<void>;
  removeMany: (ids: string[]) => Promise<void>;
  updateSong: (id: string, song: MusicInfo) => void;
  setTrackNameMode: (id: string, mode: LocalNameMode) => Promise<void>;
  /** Read embedded tags if not yet parsed. Never networks. */
  hydrateTrackOnPlay: (id: string) => Promise<MusicInfo | null>;
  /** Fill missing cover / NetEase id / catalog title after play starts. */
  fillOnlineMetaOnPlay: (
    id: string,
  ) => Promise<{ song: MusicInfo; applied: boolean } | null>;
  /** Fill missing metadata from NetEase. Explicit user action only. */
  matchTracksOnline: (ids: string[]) => Promise<LocalMatchSummary>;
  setTrackUnavailable: (id: string, unavailable: boolean) => void;
  addCategory: (name: string) => LocalCategory | null;
  renameCategory: (id: string, name: string) => void;
  removeCategory: (id: string) => void;
  setTracksCategory: (ids: string[], categoryId: string | null) => void;
}

function needsOnlineFill(song: MusicInfo): boolean {
  const hasCover = Boolean(song.meta.picUrl?.trim() || song.meta.localCoverRel);
  const hasCatalog = Boolean(song.meta.wySongId && song.meta.catalogName);
  const hasArtist = !isPlaceholderArtist(song.singer);
  return !hasCover || !hasCatalog || !hasArtist;
}

function mergeCatalogFill(
  prev: MusicInfo,
  tags: ParsedLocalTags,
  song: MusicInfo,
  nameMode: LocalNameMode,
): MusicInfo {
  const keepSinger =
    !tags.hasArtistTag && prev.singer && !isPlaceholderArtist(prev.singer);
  const catalogName = prev.meta.catalogName ?? song.meta.catalogName;
  const filePath = song.meta.filePath ?? "";
  return {
    ...song,
    name: localResolvedTitle({
      filePath,
      nameMode,
      hasTitleTag: tags.hasTitleTag,
      parsedName: song.name,
      catalogName,
    }),
    singer: tags.hasArtistTag
      ? song.singer
      : keepSinger
        ? prev.singer
        : song.singer,
    albumName: tags.hasAlbumTag
      ? song.albumName
      : prev.albumName || song.albumName,
    meta: {
      ...song.meta,
      picUrl: tags.hasCover
        ? song.meta.picUrl
        : (song.meta.picUrl ?? prev.meta.picUrl),
      wySongId: prev.meta.wySongId ?? song.meta.wySongId,
      catalogName,
    },
  };
}

function persist(
  tracks: LocalTrack[],
  categories: LocalCategory[],
  qualitySchema: number = QUALITY_SCHEMA,
  nameModeSchema: number = NAME_MODE_SCHEMA,
) {
  // Device-local only — deliberately excluded from config sync (see configIO DB_FILES).
  writeData(STORE_FILE, {
    tracks,
    categories,
    qualitySchema,
    nameModeSchema,
  } satisfies LocalMusicPersist);
}

async function deleteFileIfNeeded(filePath: string) {
  if (!isTauri) return;
  if (!useSettingsStore.getState().deleteLocalFiles) return;
  try {
    const { remove, exists } = await import("@tauri-apps/plugin-fs");
    if (await exists(filePath)) await remove(filePath);
  } catch {
    /* ignore — entry still removed from the list */
  }
}

function isLocalTrack(v: unknown): v is LocalTrack {
  if (!v || typeof v !== "object") return false;
  const t = v as LocalTrack;
  return (
    typeof t.id === "string" &&
    typeof t.filePath === "string" &&
    typeof t.addedAt === "number" &&
    !!t.song &&
    typeof t.song === "object" &&
    t.song.source === "local" &&
    (t.nameMode === undefined ||
      t.nameMode === "filename" ||
      t.nameMode === "smart")
  );
}

function isLocalCategory(v: unknown): v is LocalCategory {
  if (!v || typeof v !== "object") return false;
  const c = v as LocalCategory;
  return (
    typeof c.id === "string" &&
    typeof c.name === "string" &&
    typeof c.createdAt === "number"
  );
}

function parseStore(raw: unknown): LocalMusicPersist {
  // Legacy: bare LocalTrack[]
  if (Array.isArray(raw)) {
    return {
      tracks: raw.filter(isLocalTrack),
      categories: [],
      qualitySchema: 0,
      nameModeSchema: 0,
    };
  }
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const tracks = Array.isArray(obj.tracks)
      ? obj.tracks.filter(isLocalTrack)
      : [];
    const categories = Array.isArray(obj.categories)
      ? obj.categories.filter(isLocalCategory)
      : [];
    const catIds = new Set(categories.map((c) => c.id));
    const qualitySchema =
      typeof obj.qualitySchema === "number" &&
      Number.isFinite(obj.qualitySchema)
        ? obj.qualitySchema
        : 0;
    const nameModeSchema =
      typeof obj.nameModeSchema === "number" &&
      Number.isFinite(obj.nameModeSchema)
        ? obj.nameModeSchema
        : 0;
    return {
      tracks: tracks.map((t) =>
        t.categoryId && !catIds.has(t.categoryId)
          ? { ...t, categoryId: null }
          : t,
      ),
      categories,
      qualitySchema,
      nameModeSchema,
    };
  }
  return { tracks: [], categories: [], qualitySchema: 0, nameModeSchema: 0 };
}

async function hydrateCovers(tracks: LocalTrack[]): Promise<LocalTrack[]> {
  const out: LocalTrack[] = [];
  for (const track of tracks) {
    const rel = track.song.meta.localCoverRel;
    if (!rel) {
      out.push(track);
      continue;
    }
    const picUrl = await resolveLocalCoverUrl(rel);
    out.push({
      ...track,
      song: {
        ...track.song,
        meta: {
          ...track.song.meta,
          picUrl: picUrl ?? track.song.meta.picUrl ?? null,
        },
      },
    });
  }
  return out;
}

function localNameModeForTrack(track: LocalTrack): LocalNameMode {
  return track.nameMode === "filename" ? "filename" : "smart";
}

function migrateLegacyNameModes(
  tracks: LocalTrack[],
  nameModeSchema: number,
): LocalTrack[] {
  if (nameModeSchema >= NAME_MODE_SCHEMA) return tracks;
  if (useSettingsStore.getState().localNameMode !== "filename") return tracks;
  return tracks.map((track) => {
    if (track.nameMode) return track;
    const name = localFilenameTitle(track.filePath);
    return {
      ...track,
      nameMode: "filename",
      song: track.song.name === name ? track.song : { ...track.song, name },
    };
  });
}

/** Recent filename-first imports omitted `nameMode` while still showing the basename. */
function stampFilenameModeIfShowingBasename(tracks: LocalTrack[]): {
  tracks: LocalTrack[];
  changed: boolean;
} {
  let changed = false;
  const next = tracks.map((track) => {
    if (track.nameMode) return track;
    if (track.song.name.trim() !== localFilenameTitle(track.filePath)) {
      return track;
    }
    changed = true;
    return { ...track, nameMode: "filename" as const };
  });
  return { tracks: next, changed };
}

function pathKey(filePath: string): string {
  return filePath.replace(/\\/g, "/").toLowerCase();
}

function fileBasename(filePath: string): string {
  return filePath.split(/[/\\]/).pop() ?? filePath;
}

/** Run `worker` over `items` with a fixed concurrency pool. */
async function mapPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  let next = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (next < items.length) {
        const i = next++;
        await worker(items[i]);
      }
    },
  );
  await Promise.all(runners);
}

export const useLocalMusicStore = create<LocalMusicState>((set, get) => {
  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  const refreshVersions = new Map<string, number>();
  const hydrateInFlight = new Map<string, Promise<MusicInfo | null>>();
  const fillOnPlayInFlight = new Map<
    string,
    Promise<{ song: MusicInfo; applied: boolean } | null>
  >();

  function schedulePersist() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      persistTimer = null;
      const { tracks, categories } = get();
      persist(tracks, categories);
    }, PERSIST_DEBOUNCE_MS);
  }

  function flushPersist() {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    const { tracks, categories } = get();
    persist(tracks, categories);
  }

  function upsertRestoredTrack(track: LocalTrack) {
    set((state) => ({
      tracks: state.tracks.map((t) => (t.id === track.id ? track : t)),
    }));
    schedulePersist();
  }

  function beginTrackRefresh(id: string): number {
    const version = (refreshVersions.get(id) ?? 0) + 1;
    refreshVersions.set(id, version);
    return version;
  }

  function canApplyTrackRefresh(
    id: string,
    filePath: string,
    nameMode: LocalNameMode,
    version: number,
  ): boolean {
    const current = get().tracks.find((track) => track.id === id);
    return (
      refreshVersions.get(id) === version &&
      current?.filePath === filePath &&
      !!current &&
      localNameModeForTrack(current) === nameMode
    );
  }

  /**
   * Read embedded tags/cover/lyrics from disk. Never networks.
   * `hydrated` here means tags were read, not that online match ran.
   */
  async function readLocalTags(track: LocalTrack): Promise<{
    ok: boolean;
    tags?: ParsedLocalTags;
    song?: MusicInfo;
    nameMode: LocalNameMode;
    version: number;
  }> {
    const nameMode = localNameModeForTrack(track);
    const version = beginTrackRefresh(track.id);
    try {
      const tags = await parseLocalFile(track.filePath, track.id, nameMode);
      if (!canApplyTrackRefresh(track.id, track.filePath, nameMode, version)) {
        return { ok: false, nameMode, version };
      }
      const current = get().tracks.find((item) => item.id === track.id);
      if (!current) return { ok: false, nameMode, version };
      let song = mergeCatalogFill(
        current.song,
        tags,
        buildLocalSong(track.id, track.filePath, tags),
        nameMode,
      );
      // Older matches stored wySongId but not catalogName. Fill the title
      // once when unlocking the filename so uncheck reveals the match.
      if (
        nameMode === "smart" &&
        !tags.hasTitleTag &&
        !song.meta.catalogName &&
        song.meta.wySongId
      ) {
        const detailed = await fetchWySongDetail(song.meta.wySongId);
        if (
          !canApplyTrackRefresh(track.id, track.filePath, nameMode, version)
        ) {
          return { ok: false, nameMode, version };
        }
        const catalogName = detailed?.name?.trim();
        if (catalogName) {
          song = {
            ...song,
            name: catalogName,
            meta: { ...song.meta, catalogName },
          };
        }
      }
      upsertRestoredTrack({
        ...current,
        unavailable: false,
        hydrated: true,
        song,
      });
      return { ok: true, tags, song, nameMode, version };
    } catch {
      return { ok: false, nameMode, version };
    }
  }

  /** Explicit online fill only (Match online / Match on import). */
  async function matchOnline(track: LocalTrack): Promise<LocalEnrichStatus | "error"> {
    const result = await readLocalTags(track);
    if (!result.ok || !result.tags || !result.song) return "error";
    const { tags, song, nameMode, version } = result;
    const enriched = await enrichLocalSong(
      song,
      tags,
      nameMode,
      () => canApplyTrackRefresh(track.id, track.filePath, nameMode, version),
    );
    if (!canApplyTrackRefresh(track.id, track.filePath, nameMode, version)) {
      return "error";
    }
    if (enriched.status === "applied") get().updateSong(track.id, enriched.song);
    return enriched.status;
  }

  /** Read embedded tags/cover/lyrics from disk. Does not hit the network. */
  function parseLocalTagsInBackground(ids: string[]) {
    if (ids.length === 0) return;
    void (async () => {
      const tracks: LocalTrack[] = [];
      const seen = new Set<string>();
      for (const id of ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        const track = get().tracks.find((item) => item.id === id);
        if (track && track.hydrated === false) tracks.push(track);
      }
      if (tracks.length === 0) return;
      await mapPool(tracks, IMPORT_CONCURRENCY, async (track) => {
        const current = get().tracks.find((item) => item.id === track.id);
        if (!current || current.hydrated !== false) return;
        await readLocalTags(current);
      });
    })();
  }

  async function matchTracks(ids: string[]): Promise<LocalMatchSummary> {
    const empty: LocalMatchSummary = { applied: 0, miss: 0, unchanged: 0 };
    const seen = new Set<string>();
    const tracks: LocalTrack[] = [];
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const track = get().tracks.find((item) => item.id === id);
      if (track) tracks.push(track);
    }
    if (tracks.length === 0) return empty;
    if (get().matching) return empty;

    let done = 0;
    const summary: LocalMatchSummary = { applied: 0, miss: 0, unchanged: 0 };
    set({
      matching: true,
      matchProgress: { done: 0, total: tracks.length },
    });
    try {
      await mapPool(tracks, IMPORT_CONCURRENCY, async (track) => {
        const current =
          get().tracks.find((item) => item.id === track.id) ?? track;
        const status = await matchOnline(current);
        if (status === "applied") summary.applied += 1;
        else if (status === "miss") summary.miss += 1;
        else if (status === "unchanged") summary.unchanged += 1;
        else summary.miss += 1;
        done += 1;
        set({
          matchProgress: {
            done,
            total: tracks.length,
            current: fileBasename(current.filePath),
          },
        });
      });
      return summary;
    } finally {
      set({ matching: false, matchProgress: null });
    }
  }

  async function ingestAndMaybeMatch(
    paths: string[],
    opts?: { refreshExisting?: boolean },
  ): Promise<number> {
    const { added, importedIds } = await ingestPaths(paths, opts);
    // Release the import lock before matching so playback stays available.
    set({ importing: false, importProgress: null });
    if (importedIds.length === 0) return added;
    if (useSettingsStore.getState().localMatchOnImport) {
      await matchTracks(importedIds);
    } else {
      parseLocalTagsInBackground(importedIds);
    }
    return added;
  }

  async function ingestPaths(
    paths: string[],
    opts?: { refreshExisting?: boolean },
  ): Promise<{ added: number; importedIds: string[] }> {
    const byPath = new Map(get().tracks.map((t) => [pathKey(t.filePath), t]));
    const toImport: string[] = [];
    const toRestore: LocalTrack[] = [];
    const toRefresh: LocalTrack[] = [];
    const seen = new Set<string>();

    for (const filePath of paths) {
      const key = pathKey(filePath);
      if (seen.has(key)) continue;
      seen.add(key);
      const existing = byPath.get(key);
      if (existing) {
        // Same path again: if it was marked missing, clear that on successful re-read.
        if (existing.unavailable) toRestore.push(existing);
        else if (opts?.refreshExisting) toRefresh.push(existing);
        continue;
      }
      toImport.push(filePath);
    }

    const total = toImport.length + toRestore.length + toRefresh.length;
    if (total === 0) {
      set({ importProgress: null });
      return { added: 0, importedIds: [] };
    }

    let done = 0;
    let added = 0;
    set({ importProgress: { done: 0, total } });

    const bumpProgress = (current: string) => {
      done += 1;
      set({ importProgress: { done, total, current } });
    };

    const applyParsed = async (existing: LocalTrack, countAsAdded: boolean) => {
      const current = fileBasename(existing.filePath);
      try {
        const currentTrack =
          get().tracks.find((track) => track.id === existing.id) ?? existing;
        if ((await readLocalTags(currentTrack)).ok && countAsAdded) added += 1;
      } catch {
        /* still missing / unreadable — leave as-is */
      } finally {
        bumpProgress(current);
      }
    };

    await mapPool(toRestore, IMPORT_CONCURRENCY, (existing) =>
      applyParsed(existing, true),
    );
    // Open-with re-read: recover covers/tags after a prior failed (scoped) import.
    await mapPool(toRefresh, IMPORT_CONCURRENCY, (existing) =>
      applyParsed(existing, false),
    );

    const importedIds: string[] = [];
    if (toImport.length > 0) {
      const now = Date.now();
      const imported: LocalTrack[] = toImport.map((filePath, i) => {
        const id = localTrackId(filePath);
        const song = buildLocalSong(id, filePath, tagsFromFilename(filePath));
        return {
          id,
          filePath,
          addedAt: now + i,
          categoryId: null,
          nameMode: "filename",
          hydrated: false,
          song,
        };
      });
      set((state) => ({
        tracks: [...imported.slice().reverse(), ...state.tracks],
        importProgress: {
          done: total,
          total,
          current: fileBasename(toImport[toImport.length - 1] ?? ""),
        },
      }));
      added += imported.length;
      importedIds.push(...imported.map((track) => track.id));
    }

    flushPersist();
    return { added, importedIds };
  }

  return {
    tracks: [],
    categories: [],
    importing: false,
    importProgress: null,
    matching: false,
    matchProgress: null,

    async loadFromDisk() {
      const raw = await readData<unknown>(STORE_FILE, []);
      const { tracks, categories, qualitySchema, nameModeSchema } =
        parseStore(raw);
      const migrated = migrateLegacyNameModes(tracks, nameModeSchema ?? 0);
      const stamped = stampFilenameModeIfShowingBasename(migrated);
      const normalized = await hydrateCovers(stamped.tracks);
      set({ tracks: normalized, categories });
      if (stamped.changed) persist(normalized, categories);

      const pendingTagIds = normalized
        .filter((track) => track.hydrated === false)
        .map((track) => track.id);
      if (pendingTagIds.length > 0) parseLocalTagsInBackground(pendingTagIds);

      // One-time fix: older imports guessed quality from extension only (e.g. all
      // MP3 → 320k, 24-bit FLAC → FLAC). Re-probe in the background.
      if ((qualitySchema ?? 0) < QUALITY_SCHEMA && normalized.length > 0) {
        void (async () => {
          await mapPool(normalized, IMPORT_CONCURRENCY, async (track) => {
            const qualitys = await peekLocalQuality(track.filePath);
            if (!qualitys?.length) return;
            const next = qualitys[0]?.type;
            const prev = track.song.meta.qualitys[0]?.type;
            const sizeChanged =
              (qualitys[0]?.size ?? null) !==
              (track.song.meta.qualitys[0]?.size ?? null);
            if (!next || (next === prev && !sizeChanged)) return;
            const _qualitys = indexQualitySizes(qualitys);
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
                  : t,
              ),
            }));
          });
          persist(get().tracks, get().categories, QUALITY_SCHEMA);
        })();
      } else if (
        (qualitySchema ?? 0) < QUALITY_SCHEMA ||
        (nameModeSchema ?? 0) < NAME_MODE_SCHEMA
      ) {
        persist(normalized, categories, QUALITY_SCHEMA);
      }
    },

    async importFiles() {
      const paths = await pickLocalAudioFiles();
      if (!paths.length) return 0;
      set({ importing: true, importProgress: null });
      try {
        return await ingestAndMaybeMatch(paths);
      } finally {
        set({ importing: false, importProgress: null });
      }
    },

    async importFolder() {
      const depth = useSettingsStore.getState().localScanDepth;
      const paths = await pickLocalAudioFolder(depth);
      if (!paths.length) return 0;
      set({ importing: true, importProgress: null });
      try {
        return await ingestAndMaybeMatch(paths);
      } finally {
        set({ importing: false, importProgress: null });
      }
    },

    async importPaths(paths, opts) {
      const filtered = paths.filter(
        (p) => typeof p === "string" && isLocalAudioPath(p),
      );
      if (!filtered.length) return 0;
      set({ importing: true, importProgress: null });
      try {
        return await ingestAndMaybeMatch(filtered, opts);
      } finally {
        set({ importing: false, importProgress: null });
      }
    },

    async remove(id) {
      const track = get().tracks.find((t) => t.id === id);
      const tracks = get().tracks.filter((t) => t.id !== id);
      set({ tracks });
      persist(tracks, get().categories);
      await dropRemovedFromPlayback([id]);
      if (track) await deleteFileIfNeeded(track.filePath);
    },

    async removeMany(ids) {
      const idSet = new Set(ids);
      const removing = get().tracks.filter((t) => idSet.has(t.id));
      const tracks = get().tracks.filter((t) => !idSet.has(t.id));
      set({ tracks });
      persist(tracks, get().categories);
      await dropRemovedFromPlayback(ids);
      for (const t of removing) await deleteFileIfNeeded(t.filePath);
    },

    updateSong(id, song) {
      const tracks = get().tracks.map((t) =>
        t.id === id ? { ...t, song } : t,
      );
      set({ tracks });
      persist(tracks, get().categories);
      // Enrich/cover refresh often finishes after playback already started — push
      // into the player without a static import cycle.
      queueMicrotask(() => {
        void import("@/stores/playerStore").then(({ usePlayerStore }) => {
          const p = usePlayerStore.getState();
          if (p.currentSong?.id !== id) return;
          const picUrl = song.meta.picUrl ?? p.currentPicUrl;
          usePlayerStore.setState({
            currentSong: song,
            currentPicUrl: picUrl,
            queue: p.queue.map((item) =>
              item.music.id === id ? { ...item, music: song } : item,
            ),
          });
          void import("@/lib/smtc").then(({ updateMediaControls }) => {
            updateMediaControls(
              song.name,
              song.singer,
              song.albumName ?? "",
              picUrl,
              p.isPlaying,
            );
          });
          void p._loadLyric(song);
          void p._loadPic(song);
        });
      });
    },

    async setTrackNameMode(id, mode) {
      const track = get().tracks.find((item) => item.id === id);
      if (!track || localNameModeForTrack(track) === mode) return;
      const tracks = get().tracks.map((item) =>
        item.id === id ? { ...item, nameMode: mode } : item,
      );
      set({ tracks });
      persist(tracks, get().categories);
      const updated = tracks.find((item) => item.id === id);
      if (updated) await readLocalTags(updated);
    },

    async hydrateTrackOnPlay(id) {
      const inflight = hydrateInFlight.get(id);
      if (inflight) return inflight;

      const work = (async () => {
        const track = get().tracks.find((item) => item.id === id);
        if (!track || track.hydrated !== false) return null;
        const ok = (await readLocalTags(track)).ok;
        if (!ok) return null;
        return get().tracks.find((item) => item.id === id)?.song ?? null;
      })();

      hydrateInFlight.set(id, work);
      try {
        return await work;
      } finally {
        hydrateInFlight.delete(id);
      }
    },

    async fillOnlineMetaOnPlay(id) {
      const inflight = fillOnPlayInFlight.get(id);
      if (inflight) return inflight;

      const work = (async () => {
        const track = get().tracks.find((item) => item.id === id);
        if (!track) return null;
        if (!needsOnlineFill(track.song)) {
          return { song: track.song, applied: false };
        }
        const status = await matchOnline(track);
        const song =
          get().tracks.find((item) => item.id === id)?.song ?? track.song;
        return { song, applied: status === "applied" };
      })();

      fillOnPlayInFlight.set(id, work);
      try {
        return await work;
      } finally {
        fillOnPlayInFlight.delete(id);
      }
    },

    matchTracksOnline(ids) {
      return matchTracks(ids);
    },

    setTrackUnavailable(id, unavailable) {
      const track = get().tracks.find((t) => t.id === id);
      if (!track || !!track.unavailable === unavailable) return;
      const tracks = get().tracks.map((t) =>
        t.id === id ? { ...t, unavailable } : t,
      );
      set({ tracks });
      persist(tracks, get().categories);
    },

    addCategory(name) {
      const n = normalizeCategoryName(name);
      if (!n) return null;
      if (
        get().categories.some((c) => c.name.toLowerCase() === n.toLowerCase())
      )
        return null;
      const cat: LocalCategory = {
        id: `lc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        name: n,
        createdAt: Date.now(),
      };
      const categories = [...get().categories, cat];
      set({ categories });
      persist(get().tracks, categories);
      return cat;
    },

    renameCategory(id, name) {
      const n = normalizeCategoryName(name);
      if (!n) return;
      if (
        get().categories.some(
          (c) => c.id !== id && c.name.toLowerCase() === n.toLowerCase(),
        )
      )
        return;
      const categories = get().categories.map((c) =>
        c.id === id ? { ...c, name: n } : c,
      );
      set({ categories });
      persist(get().tracks, categories);
    },

    removeCategory(id) {
      const categories = get().categories.filter((c) => c.id !== id);
      const tracks = get().tracks.map((t) =>
        t.categoryId === id ? { ...t, categoryId: null } : t,
      );
      set({ categories, tracks });
      persist(tracks, categories);
    },

    setTracksCategory(ids, categoryId) {
      if (categoryId && !get().categories.some((c) => c.id === categoryId))
        return;
      const idSet = new Set(ids);
      const tracks = get().tracks.map((t) =>
        idSet.has(t.id) ? { ...t, categoryId } : t,
      );
      set({ tracks });
      persist(tracks, get().categories);
    },
  };
});
