import { readData, writeData } from "@/lib/db";
import type { Quality } from "@/types/music";

/**
 * Per-song playback quality that survives the queue.
 *
 * A quality the user picks for one track is a standing instruction about that
 * track, not about the queue it happened to be in. Keeping it on the queue item
 * meant it died with the queue: "play all" on another playlist, or a restart
 * with a different list, silently forgot every choice.
 *
 * So the choices live here instead, keyed by `MusicInfo.id` (already globally
 * unique across sources — `wy_123`, `tx_abc`, and local files' hashed
 * `local_<md5>` ids). The queue item keeps its `qualityOverride` field, but that
 * is now a projection of this store, re-applied whenever a queue is built.
 *
 * Device-local: deliberately absent from `configIO`'s `DB_FILES`, so a config
 * export never carries it and a config import can never wipe it (see the module
 * comment there). This is a cache of choices tied to what is playable on this
 * machine, and it is cleaned up from Settings → Cache like the audio cache.
 */

export const SONG_QUALITY_FILE = "songQualityPrefs.json";

/**
 * Retention. A choice is tiny (a song id plus a tier), but the map is unbounded
 * in principle — a user who fiddles with quality for years would accumulate one
 * entry per track they ever touched, and every entry is a song id they may never
 * play again.
 *
 * A count cap with least-recently-used eviction, matching the disk cache: the
 * choices a user is actually living with are the ones they used most recently,
 * and a forgotten choice costs one menu click to restore.
 */
export const DEFAULT_SONG_QUALITY_LIMIT = 100;
export const MAX_SONG_QUALITY_LIMIT = 1000;
/** Offered in Settings → Cache, mirroring CACHE_LIMITS_MB. */
export const SONG_QUALITY_LIMITS = [50, 100, 250, 500, 1000];

export type SongQualityEntry = {
  /** `MusicInfo.id` — globally unique across sources. */
  id: string;
  quality: Quality;
  /** ms epoch, for LRU eviction. */
  lastUsed: number;
};

/** Tiers a per-song choice may hold. Matches the playback ladder. */
const STORABLE: Quality[] = ["128k", "320k", "flac", "flac24bit"];

function isStorableQuality(v: unknown): v is Quality {
  return typeof v === "string" && STORABLE.includes(v as Quality);
}

/**
 * Keep at most `limit` entries, dropping the least recently used first.
 *
 * Pure and exported so the eviction rule can be tested directly. Returns a new
 * array in most-recent-first order, which is also the order written to disk.
 */
export function trimSongQualityEntries(
  entries: SongQualityEntry[],
  limit: number,
): SongQualityEntry[] {
  const sorted = [...entries].sort((a, b) => b.lastUsed - a.lastUsed);
  if (sorted.length <= limit) return sorted;
  return sorted.slice(0, limit);
}

/**
 * Parse whatever was on disk into usable entries.
 *
 * Every field is validated: this file is written by an older build, a synced
 * folder, or a user with a text editor, and a single malformed entry must not
 * take out the rest. Duplicate ids keep the most recently used one.
 */
export function parseSongQualityEntries(raw: unknown): SongQualityEntry[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map<string, SongQualityEntry>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const id = record.id;
    if (typeof id !== "string" || !id) continue;
    if (!isStorableQuality(record.quality)) continue;
    const lastUsed =
      typeof record.lastUsed === "number" && Number.isFinite(record.lastUsed)
        ? record.lastUsed
        : 0;
    const existing = byId.get(id);
    if (existing && existing.lastUsed >= lastUsed) continue;
    byId.set(id, { id, quality: record.quality, lastUsed });
  }
  return [...byId.values()];
}

// ---------- in-memory state ----------

let entries: SongQualityEntry[] = [];
let loaded = false;
let limit = DEFAULT_SONG_QUALITY_LIMIT;

/**
 * Choices made before the file finished loading.
 *
 * Startup reads settings and player prefs in parallel, so there is a window
 * where the badge is clickable but this module has not read its file. Writing
 * straight into `entries` then would be lost the moment `loadSongQualities`
 * replaced them, and dropping the write would lose the user's click. Holding it
 * here and applying it after the read makes the choice survive either ordering.
 * A `null` value means "forget this song".
 */
const pendingBeforeLoad = new Map<string, Quality | null>();

function persist(): void {
  writeData(SONG_QUALITY_FILE, trimSongQualityEntries(entries, limit));
}

/**
 * Load once.
 *
 * `maxEntries` is optional because of a startup race: settings and player prefs
 * load in parallel, so the configured cap may not be readable yet. Loading with
 * the default and re-applying the real cap via `applySongQualityLimit` once
 * settings are in (as App.tsx does for the disk cache) is what keeps the two
 * from depending on which `readData` settles first.
 */
export async function loadSongQualities(maxEntries?: number): Promise<void> {
  if (maxEntries !== undefined) limit = clampSongQualityLimit(maxEntries);
  const raw = await readData<unknown>(SONG_QUALITY_FILE, []);
  entries = trimSongQualityEntries(parseSongQualityEntries(raw), limit);
  // A choice the user made while this read was in flight beats the file.
  if (pendingBeforeLoad.size) {
    for (const [id, quality] of pendingBeforeLoad) {
      const rest = entries.filter((e) => e.id !== id);
      entries =
        quality === null
          ? rest
          : [{ id, quality, lastUsed: Date.now() }, ...rest];
    }
    pendingBeforeLoad.clear();
    entries = trimSongQualityEntries(entries, limit);
  }
  loaded = true;
  // Re-write when parsing, the cap, or a pending write changed the set, so a
  // lowered limit shrinks the file immediately instead of at the next choice.
  if (JSON.stringify(entries) !== JSON.stringify(raw)) persist();
}

export function clampSongQualityLimit(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SONG_QUALITY_LIMIT;
  return Math.min(MAX_SONG_QUALITY_LIMIT, Math.max(1, Math.round(n)));
}

/**
 * The stored choice for a song, or undefined for "follow the default".
 *
 * Does not refresh recency: callers read this on every play, and treating a
 * read as a use would keep entries alive merely because they were looked at.
 * `setStoredQuality` is what marks a choice as used, and a choice only gets
 * there by the user making it.
 */
export function getStoredQuality(songId: string): Quality | undefined {
  const pending = pendingBeforeLoad.get(songId);
  if (pending !== undefined) return pending ?? undefined;
  if (!loaded) return undefined;
  return entries.find((e) => e.id === songId)?.quality;
}

/** Store (or, with `undefined`, forget) one song's choice. */
export function setStoredQuality(
  songId: string,
  quality: Quality | undefined,
): void {
  if (!loaded) {
    // Not read yet — hold it so the load cannot discard the user's click.
    pendingBeforeLoad.set(songId, quality ?? null);
    return;
  }
  const rest = entries.filter((e) => e.id !== songId);
  entries =
    quality === undefined
      ? rest
      : [{ id: songId, quality, lastUsed: Date.now() }, ...rest];
  entries = trimSongQualityEntries(entries, limit);
  persist();
}

/** Apply a new cap, evicting least-recently-used entries beyond it. */
export function applySongQualityLimit(next: number): void {
  limit = clampSongQualityLimit(next);
  entries = trimSongQualityEntries(entries, limit);
  persist();
}

export function countStoredQualities(): number {
  return loaded ? entries.length : pendingBeforeLoad.size;
}

export function clearStoredQualities(): void {
  entries = [];
  pendingBeforeLoad.clear();
  persist();
}

/** Re-apply the stored choices onto freshly built queue items. */
export function hydrateQualityOverrides<
  T extends { music: { id: string }; qualityOverride?: Quality },
>(items: T[]): T[] {
  return items.map((item) => {
    const stored = getStoredQuality(item.music.id);
    if (stored === item.qualityOverride) return item;
    return { ...item, qualityOverride: stored };
  });
}
