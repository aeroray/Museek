import { splitArtists } from "@/lib/listenLog";
import type { MusicInfo } from "@/types/music";

/**
 * When a play counts as a scrobble, and how a song maps onto Last.fm's fields.
 *
 * Pure and free of store/network imports so the rules can be checked directly —
 * they are the part that decides whether a user's profile is accurate, and the
 * thresholds are easy to get subtly wrong.
 */

/**
 * Last.fm's published scrobble rules (https://www.last.fm/api/scrobbling):
 *
 *   - a track under 30 seconds is never scrobbled;
 *   - a track of 30s or more is scrobbled once the user has listened to at least
 *     half its length OR 4 minutes, whichever comes first;
 *   - the `timestamp` is when playback STARTED, not when it finished.
 *
 * The 4-minute cap matters for long tracks (a 12-minute piece is scrobbled at
 * 4:00 rather than 6:00); the half-length rule matters for everything shorter.
 */
export const MIN_SCROBBLE_MS = 30_000;
export const SCROBBLE_CAP_MS = 4 * 60_000;

/** Whether a track is long enough to ever be scrobbled. */
export function isScrobbable(durationMs: number): boolean {
  return durationMs >= MIN_SCROBBLE_MS;
}

/** How long the user must listen before the play is scrobbled. */
export function scrobbleThresholdMs(durationMs: number): number {
  if (!isScrobbable(durationMs)) return Number.POSITIVE_INFINITY;
  return Math.min(durationMs / 2, SCROBBLE_CAP_MS);
}

/**
 * Whether a finished (or in-progress) listen should be scrobbled.
 *
 * `durationMs` of 0 means the duration is unknown — a stream or a file whose
 * metadata never loaded. Treating unknown as "too short" would silently never
 * scrobble those; instead the 4-minute cap applies, which is the conservative
 * reading of the rules (it still requires real listening, just not a fraction of
 * a length nobody knows).
 */
export function shouldScrobble(opts: {
  listenedMs: number;
  durationMs: number;
  /** A track that ran to its end counts even if the threshold was not met. */
  completed: boolean;
}): boolean {
  const { listenedMs, durationMs, completed } = opts;
  if (durationMs > 0 && !isScrobbable(durationMs)) return false;
  if (completed) return true;
  const threshold =
    durationMs > 0 ? scrobbleThresholdMs(durationMs) : SCROBBLE_CAP_MS;
  return listenedMs >= threshold;
}

/**
 * Split a Museek artist credit into the primary artist and any featured names.
 *
 * Last.fm has no concept of a featured credit: a scrobble carries ONE
 * `artist`. Sending "鬼才、刀酱" would create a single nonsense artist page, so
 * the credit is split and the first name is sent — matching what the artist
 * ranking on the 足迹 page does, so the two views agree.
 */
export function primaryArtist(singer: string | undefined | null): string {
  const names = splitArtists(singer);
  return names[0] ?? (singer ?? "").trim();
}

export type ScrobbleFields = {
  artist: string;
  track: string;
  album: string;
  duration: number;
  /** Seconds since epoch, captured when playback started. */
  timestamp: number;
};

/**
 * Map a Museek song onto Last.fm's scrobble fields.
 *
 * `startedAt` is passed in rather than read here: the timestamp must be the
 * moment playback began, and by the time a scrobble is sent the app may be
 * minutes past that.
 */
export function scrobbleFields(
  song: MusicInfo,
  startedAtMs: number,
  durationMs: number,
): ScrobbleFields {
  return {
    artist: primaryArtist(song.singer),
    track: song.name,
    album: song.albumName ?? "",
    duration: Math.max(0, Math.round(durationMs / 1000)),
    timestamp: Math.floor(startedAtMs / 1000),
  };
}

/** True when there is enough information for Last.fm to accept the scrobble. */
export function isScrobbleComplete(fields: ScrobbleFields): boolean {
  return (
    fields.artist.trim().length > 0 &&
    fields.track.trim().length > 0 &&
    Number.isFinite(fields.timestamp) &&
    fields.timestamp > 0
  );
}

/**
 * Last.fm's `track.scrobble` accepts a batch of up to 50 plays in one request,
 * using indexed parameter names (`artist[0]`, `artist[1]`, …). Sending more than
 * that in one call is rejected.
 */
export const SCROBBLE_BATCH_MAX = 50;

/** Indexed parameters for a batch, as Last.fm expects them. */
export function batchScrobbleParams(
  plays: ScrobbleFields[],
): Record<string, string> {
  const out: Record<string, string> = {};
  plays.forEach((play, i) => {
    out[`artist[${i}]`] = play.artist;
    out[`track[${i}]`] = play.track;
    out[`timestamp[${i}]`] = String(play.timestamp);
    if (play.album) out[`album[${i}]`] = play.album;
    if (play.duration > 0) out[`duration[${i}]`] = String(play.duration);
  });
  return out;
}
