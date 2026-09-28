import type { ScrobbleFields } from "@/lib/lastfm/scrobble";
import { SCROBBLE_BATCH_MAX } from "@/lib/lastfm/scrobble";

/**
 * The offline scrobble queue.
 *
 * A scrobble is a record of something that already happened, so it must not be
 * lost because the network was down, the app was closed, or Last.fm was briefly
 * unavailable. Plays are appended here first and only removed once Last.fm has
 * accepted (or definitively rejected) them.
 *
 * Pure and free of store/network imports so the retention, batching and backoff
 * rules can be checked directly.
 */

/**
 * Last.fm rejects a scrobble whose `timestamp` is too old (error code 3). Its
 * documented limit is two weeks, so anything older can never be accepted and is
 * dropped rather than retried forever.
 */
export const MAX_SCROBBLE_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Retention cap.
 *
 * An entry is ~200 bytes as compact JSON, so 500 of them is ~100 KB — small
 * enough to be a rounding error next to the 1 GB audio cache, and deep enough to
 * cover a long offline stretch. Dropping the OLDEST first is deliberate: the
 * newest plays are the ones still inside the two-week window.
 */
export const MAX_PENDING_SCROBBLES = 500;

/**
 * Backoff between attempts, in ms, indexed by the number of failed attempts.
 *
 * Without this, a scrobble that Last.fm is temporarily refusing (outage, rate
 * limit) would be retried on every single flush — which happens on every track
 * change — and could itself provoke the rate limit it is hitting.
 */
export const RETRY_BACKOFF_MS = [
  0, // never attempted
  30_000, // 1 failure: 30s
  2 * 60_000, // 2: 2min
  10 * 60_000, // 3: 10min
  30 * 60_000, // 4: 30min
  2 * 60 * 60_000, // 5+: 2h
];

export type PendingScrobble = ScrobbleFields & {
  /** Stable id so a successful batch can be matched back to its entries. */
  id: string;
  /** Failed attempts so far; drives the backoff. */
  attempts: number;
  /** ms epoch of the last attempt, or undefined if never tried. */
  lastAttempt?: number;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}

/** Parse one entry, returning null if it could never be accepted anyway. */
export function parsePending(v: unknown): PendingScrobble | null {
  if (!isRecord(v)) return null;
  const artist = typeof v.artist === "string" ? v.artist.trim() : "";
  const track = typeof v.track === "string" ? v.track.trim() : "";
  const timestamp = typeof v.timestamp === "number" ? Math.trunc(v.timestamp) : 0;
  if (!artist || !track || !Number.isFinite(timestamp) || timestamp <= 0) {
    return null;
  }
  const duration =
    typeof v.duration === "number" && Number.isFinite(v.duration)
      ? Math.max(0, Math.trunc(v.duration))
      : 0;
  const attempts =
    typeof v.attempts === "number" && Number.isFinite(v.attempts)
      ? Math.max(0, Math.trunc(v.attempts))
      : 0;
  const lastAttempt =
    typeof v.lastAttempt === "number" && Number.isFinite(v.lastAttempt)
      ? Math.trunc(v.lastAttempt)
      : undefined;
  return {
    id:
      typeof v.id === "string" && v.id
        ? v.id
        : `${timestamp}:${artist}:${track}`,
    artist,
    track,
    album: typeof v.album === "string" ? v.album : "",
    duration,
    timestamp,
    attempts,
    lastAttempt,
  };
}

/** Parse a whole stored list, dropping anything unusable. */
export function parsePendingList(raw: unknown): PendingScrobble[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(parsePending)
    .filter((e): e is PendingScrobble => e !== null);
}

/**
 * Drop plays that can no longer be accepted, then enforce the cap.
 *
 * Oldest-first removal on both counts: an entry past the two-week window is
 * dead, and past the cap the newest plays are the ones still worth keeping.
 */
export function trimPending(
  list: PendingScrobble[],
  now = Date.now(),
): PendingScrobble[] {
  const cutoff = Math.floor((now - MAX_SCROBBLE_AGE_MS) / 1000);
  const live = list.filter((e) => e.timestamp >= cutoff);
  if (live.length <= MAX_PENDING_SCROBBLES) return live;
  return live.slice(live.length - MAX_PENDING_SCROBBLES);
}

export function newPendingId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Whether an entry is due for another attempt.
 *
 * A never-attempted entry is always due. After a failure the backoff for its
 * attempt count must have elapsed, so a failing flush does not spin.
 */
export function isDue(entry: PendingScrobble, now = Date.now()): boolean {
  if (!entry.attempts) return true;
  if (!entry.lastAttempt) return true;
  const wait =
    RETRY_BACKOFF_MS[Math.min(entry.attempts, RETRY_BACKOFF_MS.length - 1)];
  return now - entry.lastAttempt >= wait;
}

/** Entries ready to send right now, oldest first, capped at Last.fm's batch size. */
export function dueBatch(
  list: PendingScrobble[],
  now = Date.now(),
): PendingScrobble[] {
  return list
    .filter((e) => isDue(e, now))
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(0, SCROBBLE_BATCH_MAX);
}

/** Mark a batch as attempted, so the backoff starts counting. */
export function markAttempted(
  list: PendingScrobble[],
  ids: string[],
  now = Date.now(),
): PendingScrobble[] {
  const set = new Set(ids);
  return list.map((e) =>
    set.has(e.id) ? { ...e, attempts: e.attempts + 1, lastAttempt: now } : e,
  );
}

/**
 * Clear the backoff on the named entries so the next flush attempts them at once.
 *
 * Used when the reason for the previous failures has gone away — a dead session
 * the user has just replaced. The backoff was earned against a condition that no
 * longer holds, so honouring it would make a reconnect look broken for up to two
 * hours. The attempt COUNT is reset too, not just the timestamp, so a subsequent
 * genuine failure starts its backoff from the short end again.
 */
export function clearBackoff(
  list: PendingScrobble[],
  ids: string[],
): PendingScrobble[] {
  const set = new Set(ids);
  return list.map((e) =>
    set.has(e.id) ? { ...e, attempts: 0, lastAttempt: undefined } : e,
  );
}

/** Remove entries Last.fm has finished with (accepted, or permanently rejected). */
export function removeEntries(
  list: PendingScrobble[],
  ids: string[],
): PendingScrobble[] {
  const set = new Set(ids);
  return list.filter((e) => !set.has(e.id));
}

/** Deduplicate by id, keeping the first occurrence. */
export function dedupePending(list: PendingScrobble[]): PendingScrobble[] {
  const seen = new Set<string>();
  const out: PendingScrobble[] = [];
  for (const entry of list) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
  }
  return out;
}
