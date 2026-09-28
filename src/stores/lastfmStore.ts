import { create } from "zustand";
import { readData, writeDataCompact } from "@/lib/db";
import { notify } from "@/lib/notify";
import { t } from "@/lib/i18n";
import { songDurationMs } from "@/lib/listenLog";
import {
  LastfmError,
  isAuthError,
  isTransientError,
  lastfmErrorLabel,
} from "@/lib/lastfm/api";
import {
  authorizeUrl,
  fetchSession,
  fetchToken,
  lastfmGet,
  scrobble as sendScrobble,
  updateNowPlaying,
  TOKEN_UNAUTHORIZED,
  type LastfmCredentials,
} from "@/lib/lastfm/client";
import {
  batchScrobbleParams,
  isScrobblableSong,
  isScrobbleComplete,
  scrobbleFields,
  shouldScrobble,
  type ScrobbleFields,
} from "@/lib/lastfm/scrobble";
import {
  clearBackoff,
  dedupePending,
  dueBatch,
  markAttempted,
  newPendingId,
  parsePendingList,
  removeEntries,
  trimPending,
  type PendingScrobble,
} from "@/lib/lastfm/queue";
import type { MusicInfo } from "@/types/music";

/**
 * Last.fm integration.
 *
 * Credentials live in their own file (`lastfm.json`) rather than `settings.json`
 * for two reasons: they are device-local secrets that must never travel through
 * a config export or sync folder, and the pending-scrobble queue needs to be
 * written far more often than settings. Keeping the file out of `configIO`'s
 * `DB_FILES` is what makes the first guarantee true.
 */

export const LASTFM_FILE = "lastfm.json";

/** How often the connect flow asks whether the user has authorized yet. */
const AUTH_POLL_MS = 2_000;
/** Give up waiting for the user to authorize after this long. */
const AUTH_TIMEOUT_MS = 120_000;
/** Periods offered by the stats view, matching Last.fm's own enum. */
export type LastfmPeriod = "overall" | "7day" | "1month" | "3month" | "12month";

export type LastfmStats = {
  username: string;
  playcount: number;
  topArtists: { name: string; playcount: number; url: string; image?: string }[];
  topTracks: {
    name: string;
    artist: string;
    playcount: number;
    url: string;
    image?: string;
  }[];
  recent: {
    name: string;
    artist: string;
    album: string;
    url: string;
    image?: string;
    nowPlaying: boolean;
    playedAt?: number;
  }[];
  fetchedAt: number;
};

/**
 * Fetched stats, keyed by the period they were fetched for.
 *
 * Cached per period rather than kept as a single "current" object so that
 * switching back to a period shows it immediately, and so the data survives a
 * restart. Top artists/tracks genuinely differ per period; `recent` does not,
 * but it rides along with whichever period was fetched and is cheap to store.
 */
export type LastfmStatsCache = Partial<Record<LastfmPeriod, LastfmStats>>;

type Persisted = {
  apiKey: string;
  apiSecret: string;
  sessionKey: string;
  username: string;
  enabled: boolean;
  scrobbleEnabled: boolean;
  nowPlayingEnabled: boolean;
  pending: PendingScrobble[];
  statsCache: LastfmStatsCache;
};

const DEFAULTS: Persisted = {
  apiKey: "",
  apiSecret: "",
  sessionKey: "",
  username: "",
  enabled: false,
  scrobbleEnabled: true,
  nowPlayingEnabled: true,
  pending: [],
  statsCache: {},
};

const PERIOD_KEYS: LastfmPeriod[] = [
  "overall",
  "7day",
  "1month",
  "3month",
  "12month",
];

/** Optional string: keeps `undefined` distinct from `""` for `image`. */
function optStr(v: unknown): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

/**
 * Rebuild one cached period, dropping anything malformed.
 *
 * This shares a file with the credentials, so it must never throw and never
 * yield a half-built object: a row with no name would render as a blank line,
 * so those entries are filtered out rather than kept.
 */
function parseStatsEntry(raw: unknown): LastfmStats | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const rows = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    username: str(r.username),
    playcount: num(r.playcount),
    topArtists: rows(r.topArtists)
      .map((a) => {
        const x = asRecord(a);
        return {
          name: str(x.name),
          playcount: num(x.playcount),
          url: str(x.url),
          image: optStr(x.image),
        };
      })
      .filter((a) => a.name),
    topTracks: rows(r.topTracks)
      .map((t) => {
        const x = asRecord(t);
        return {
          name: str(x.name),
          artist: str(x.artist),
          playcount: num(x.playcount),
          url: str(x.url),
          image: optStr(x.image),
        };
      })
      .filter((t) => t.name),
    recent: rows(r.recent)
      .map((t) => {
        const x = asRecord(t);
        return {
          name: str(x.name),
          artist: str(x.artist),
          album: str(x.album),
          url: str(x.url),
          image: optStr(x.image),
          // A cached row is never "now playing": that is true only at the moment
          // of the fetch, and claiming it after a restart would be a lie.
          nowPlaying: false,
          playedAt: num(x.playedAt) > 0 ? num(x.playedAt) : undefined,
        };
      })
      .filter((t) => t.name),
    fetchedAt: num(r.fetchedAt),
  };
}

function parseStatsCache(raw: unknown): LastfmStatsCache {
  const r = asRecord(raw);
  const out: LastfmStatsCache = {};
  for (const period of PERIOD_KEYS) {
    const entry = parseStatsEntry(r[period]);
    if (entry) out[period] = entry;
  }
  return out;
}

/**
 * Validate whatever was on disk. Every field is checked because this file holds
 * credentials: a malformed entry must degrade to "not configured", never to a
 * half-configured state that fails every request.
 */
export function parsePersisted(raw: unknown): Persisted {
  if (!raw || typeof raw !== "object") return { ...DEFAULTS };
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, fallback = "") =>
    typeof v === "string" ? v : fallback;
  const bool = (v: unknown, fallback: boolean) =>
    typeof v === "boolean" ? v : fallback;
  return {
    apiKey: str(r.apiKey),
    apiSecret: str(r.apiSecret),
    sessionKey: str(r.sessionKey),
    username: str(r.username),
    enabled: bool(r.enabled, DEFAULTS.enabled),
    scrobbleEnabled: bool(r.scrobbleEnabled, DEFAULTS.scrobbleEnabled),
    nowPlayingEnabled: bool(r.nowPlayingEnabled, DEFAULTS.nowPlayingEnabled),
    pending: dedupePending(trimPending(parsePendingList(r.pending))),
    statsCache: parseStatsCache(r.statsCache),
  };
}

/** True when the user has supplied both API credentials. */
export function isConfigured(apiKey: string, apiSecret: string): boolean {
  return Boolean(apiKey.trim() && apiSecret.trim());
}

type LastfmState = Persisted & {
  hydrated: boolean;
  /** A connect flow is waiting for the user to authorize in their browser. */
  connecting: boolean;
  /** The URL the user must open; shown so they can re-open it manually. */
  authUrl: string | null;
  error: string | null;
  /** Fetched account stats, per period, surviving a restart. */
  statsCache: LastfmStatsCache;
  /** True while a stats fetch is in flight. */
  statsLoading: boolean;
  statsError: string | null;
  /** True while a flush is in flight, so flushes do not overlap. */
  flushing: boolean;

  loadFromDisk: () => Promise<void>;
  setCredentials: (apiKey: string, apiSecret: string) => Promise<void>;
  startConnect: () => Promise<void>;
  cancelConnect: () => void;
  disconnect: () => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
  setScrobbleEnabled: (enabled: boolean) => Promise<void>;
  setNowPlayingEnabled: (enabled: boolean) => Promise<void>;
  /** Announce the track that just started. */
  reportNowPlaying: (song: MusicInfo) => void;
  /** A listen session ended; decide whether it counts as a scrobble. */
  reportListenEnded: (event: {
    song: MusicInfo;
    startedAt: number;
    listenedMs: number;
    completed: boolean;
    durationMs: number;
  }) => void;
  flush: (opts?: { force?: boolean }) => Promise<void>;
  /** Fetch (or refresh) one period. Already-cached data stays visible meanwhile. */
  loadStats: (period: LastfmPeriod) => Promise<void>;
  clearStats: () => void;
};

// Module-level, outside React state: the poll timer and the last announced track
// are not render inputs.
let authPoll: ReturnType<typeof setInterval> | null = null;
let authTimeout: ReturnType<typeof setTimeout> | null = null;
let lastNowPlayingKey = "";
let loaded = false;

function stopAuthWait() {
  if (authPoll) {
    clearInterval(authPoll);
    authPoll = null;
  }
  if (authTimeout) {
    clearTimeout(authTimeout);
    authTimeout = null;
  }
}

function credsOf(state: Persisted): LastfmCredentials {
  return {
    apiKey: state.apiKey,
    apiSecret: state.apiSecret,
    sessionKey: state.sessionKey || undefined,
  };
}

/** Only persist when the session is actually usable, so a failed connect is not saved. */
function snapshot(state: LastfmState): Persisted {
  return {
    apiKey: state.apiKey,
    apiSecret: state.apiSecret,
    sessionKey: state.sessionKey,
    username: state.username,
    enabled: state.enabled,
    scrobbleEnabled: state.scrobbleEnabled,
    nowPlayingEnabled: state.nowPlayingEnabled,
    pending: trimPending(state.pending),
    statsCache: state.statsCache,
  };
}

let writeTimer: ReturnType<typeof setTimeout> | null = null;
function persist(state: LastfmState, immediate = false) {
  const payload = snapshot(state);
  if (immediate) {
    if (writeTimer) {
      clearTimeout(writeTimer);
      writeTimer = null;
    }
    void writeDataCompact(LASTFM_FILE, { version: 1, ...payload });
    return;
  }
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    const current = useLastfmStore.getState();
    void writeDataCompact(LASTFM_FILE, {
      version: 1,
      ...snapshot(current),
    });
  }, 1200);
}

export const useLastfmStore = create<LastfmState>((set, get) => ({
  ...DEFAULTS,
  hydrated: false,
  connecting: false,
  authUrl: null,
  error: null,
  statsLoading: false,
  statsError: null,
  flushing: false,

  async loadFromDisk() {
    if (loaded) return;
    loaded = true;
    const raw = await readData<unknown>(LASTFM_FILE, null);
    const parsed = parsePersisted(raw);
    set({ ...parsed, hydrated: true });
    // A queue left from a previous run is flushed once credentials are known.
    if (parsed.sessionKey && parsed.pending.length) void get().flush();
  },

  async setCredentials(apiKey, apiSecret) {
    const trimmedKey = apiKey.trim();
    const trimmedSecret = apiSecret.trim();
    // Changing either credential invalidates a session obtained with the old
    // pair, so the connection is dropped rather than left silently broken.
    const changed =
      trimmedKey !== get().apiKey || trimmedSecret !== get().apiSecret;
    set({
      apiKey: trimmedKey,
      apiSecret: trimmedSecret,
      error: null,
      ...(changed
        ? { sessionKey: "", username: "", statsCache: {}, statsError: null }
        : {}),
    });
    persist(get(), true);
  },

  async startConnect() {
    const { apiKey, apiSecret } = get();
    if (!isConfigured(apiKey, apiSecret)) {
      set({ error: t("lastfm.err.needCredentials") });
      return;
    }
    stopAuthWait();
    set({ connecting: true, error: null, authUrl: null });

    let token: string;
    try {
      token = await fetchToken({ apiKey, apiSecret });
    } catch (err) {
      set({ connecting: false, error: lastfmErrorLabel(err) });
      return;
    }

    const url = authorizeUrl(apiKey, token);
    set({ authUrl: url });
    // Open in the system browser: the Last.fm page needs the user's own login,
    // and a webview popup would be a worse experience (no password manager).
    try {
      const { open } = await import("@tauri-apps/plugin-shell");
      await open(url);
    } catch {
      try {
        window.open(url, "_blank");
      } catch {
        /* the URL is shown in the UI as a fallback */
      }
    }

    // Poll until the user authorizes. Before they do, Last.fm answers error 14
    // ("token not authorized"), which is the expected state — NOT a failure — so
    // it must not end the wait or surface an error.
    authPoll = setInterval(async () => {
      const state = get();
      if (!state.connecting) {
        stopAuthWait();
        return;
      }
      try {
        const session = await fetchSession(
          { apiKey: state.apiKey, apiSecret: state.apiSecret },
          token,
        );
        stopAuthWait();
        set({
          connecting: false,
          authUrl: null,
          sessionKey: session.key,
          username: session.name,
          enabled: true,
          error: null,
        });
        persist(get(), true);
        notify({
          message: t("lastfm.connected", { name: session.name }),
          variant: "success",
        });
        // Forced: a queue that failed against a previous session should go out
        // now, not after whatever backoff it had accumulated.
        void get().flush({ force: true });
      } catch (err) {
        const code = err instanceof LastfmError ? err.code : undefined;
        if (code === TOKEN_UNAUTHORIZED) return; // still waiting
        // 15 means the token expired (Last.fm overloads it in the auth flow).
        if (code === 15) {
          stopAuthWait();
          set({ connecting: false, error: t("lastfm.err.tokenExpired") });
          return;
        }
        if (isTransientError(code)) return; // keep polling through an outage
        stopAuthWait();
        set({ connecting: false, error: lastfmErrorLabel(err) });
      }
    }, AUTH_POLL_MS);

    authTimeout = setTimeout(() => {
      if (!get().connecting) return;
      stopAuthWait();
      set({ connecting: false, authUrl: null, error: t("lastfm.err.timeout") });
    }, AUTH_TIMEOUT_MS);
  },

  cancelConnect() {
    stopAuthWait();
    set({ connecting: false, authUrl: null });
  },

  async disconnect() {
    stopAuthWait();
    lastNowPlayingKey = "";
    // The cache is deliberately NOT cleared here. Disconnect also runs
    // automatically when a request hits an auth error, and wiping the user's
    // fetched stats because a background scrobble failed would be a nasty
    // surprise. Entries are matched against the current username instead, so a
    // different account can never display them.
    set({ sessionKey: "", username: "", error: null });
    persist(get(), true);
  },

  async setEnabled(enabled) {
    set({ enabled });
    persist(get(), true);
    if (!enabled) lastNowPlayingKey = "";
    // Forced: switching the integration back on is a deliberate "send what you
    // have" action, so it should not wait out a backoff from a previous failure.
    if (enabled) void get().flush({ force: true });
  },

  async setScrobbleEnabled(value) {
    set({ scrobbleEnabled: value });
    persist(get(), true);
  },

  async setNowPlayingEnabled(value) {
    set({ nowPlayingEnabled: value });
    persist(get(), true);
    if (!value) lastNowPlayingKey = "";
  },

  reportNowPlaying(song) {
    const state = get();
    if (!state.enabled || !state.nowPlayingEnabled || !state.sessionKey) return;
    // Untagged local files carry placeholder metadata ("未知歌曲" / "未知歌手"),
    // which Last.fm would accept as a real artist and track. Announcing those
    // would put a junk entry on the profile for every untagged file.
    if (!isScrobblableSong(song)) return;
    const durationMs = songDurationMs(song);
    const fields = scrobbleFields(song, Date.now(), durationMs);
    if (!fields.artist || !fields.track) return;
    // Deduped because the player announces the current track on every state
    // change (play/pause/resume), not only on a track change. Without this, a
    // single listen would send dozens of identical now-playing requests and
    // invite a rate limit. Cleared on pause and on a new session, so resuming
    // the same track re-announces.
    const key = `${fields.artist}\u0000${fields.track}`;
    if (key === lastNowPlayingKey) return;
    lastNowPlayingKey = key;
    void updateNowPlaying(credsOf(state), {
      artist: fields.artist,
      track: fields.track,
      album: fields.album || undefined,
      // Last.fm accepts `duration` here, and it is what lets the profile show a
      // track length and lets Last.fm apply its own rules. It was previously
      // omitted because this call passed a hard-coded 0.
      duration: fields.duration > 0 ? fields.duration : undefined,
    }).catch((err) => {
      // A failed now-playing is never retried: it describes the present moment
      // and is worthless by the time a retry could land. A dead session is still
      // worth acting on, because every later write will fail too.
      if (err instanceof LastfmError && isAuthError(err.code)) {
        set({ error: t("lastfm.err.reconnect") });
        void get().disconnect();
      }
    });
  },

  reportListenEnded({ song, startedAt, listenedMs, completed, durationMs }) {
    const state = get();
    if (!state.enabled || !state.scrobbleEnabled || !state.sessionKey) return;
    if (!isScrobblableSong(song)) return;
    if (!shouldScrobble({ listenedMs, durationMs, completed })) return;

    const fields = scrobbleFields(song, startedAt, durationMs);
    if (!isScrobbleComplete(fields)) return;

    const entry: PendingScrobble = {
      ...fields,
      id: newPendingId(),
      attempts: 0,
    };
    set({ pending: trimPending([...get().pending, entry]) });
    persist(get(), true);
    void get().flush();
  },

  async flush(opts) {
    const state = get();
    if (state.flushing) return;
    if (!state.enabled || !state.scrobbleEnabled) return;
    if (!state.sessionKey || !state.pending.length) return;

    // `force` ignores the backoff. A user who has just reconnected or pressed
    // "retry now" expects an immediate attempt; without it they would wait out a
    // backoff that was earned by a session which no longer exists.
    const batch = opts?.force
      ? [...state.pending].sort((a, b) => a.timestamp - b.timestamp).slice(0, 50)
      : dueBatch(state.pending);
    if (!batch.length) return;

    set({ flushing: true });
    const ids = batch.map((e) => e.id);
    try {
      const fields: ScrobbleFields[] = batch.map((e) => ({
        artist: e.artist,
        track: e.track,
        album: e.album,
        duration: e.duration,
        timestamp: e.timestamp,
      }));
      const result = await sendScrobble(
        credsOf(state),
        batchScrobbleParams(fields),
      );
      // `accepted` and `ignored` together account for the batch. An ignored play
      // is a judgement by Last.fm (too short, filtered artist, too old) and will
      // be rejected identically forever, so it is dropped rather than retried.
      const settled = result.accepted + result.ignored;
      const done = settled >= batch.length ? ids : [];
      set({
        pending: removeEntries(
          markAttempted(get().pending, ids),
          done,
        ),
        error: null,
      });
      persist(get(), true);
      // Anything still pending and already due (e.g. a partially settled batch)
      // gets another pass.
      if (!done.length) return;
      if (dueBatch(get().pending).length) void get().flush();
    } catch (err) {
      const code = err instanceof LastfmError ? err.code : undefined;
      if (isAuthError(code)) {
        // The session is dead: stop retrying and tell the user to reconnect.
        // The queue is deliberately KEPT — the plays still happened — but the
        // backoff is cleared, because it was earned against a session that no
        // longer exists. Otherwise reconnecting would appear to do nothing for
        // up to two hours while the timer ran down.
        set({
          pending: clearBackoff(get().pending, ids),
          error: t("lastfm.err.reconnect"),
        });
        persist(get(), true);
        notify({
          message: t("lastfm.err.reconnect"),
          variant: "error",
          actionLabel: t("lastfm.goSettings"),
          actionTo: "/settings?tab=listening",
        });
        return;
      }
      // Transient (or unknown): back off and try again later.
      set({ pending: markAttempted(get().pending, ids) });
      persist(get(), true);
      if (!isTransientError(code)) {
        // A permanent, non-auth error (invalid params) would retry forever, so
        // surface it once instead of silently looping.
        set({ error: lastfmErrorLabel(err) });
      }
    } finally {
      set({ flushing: false });
    }
  },

  async loadStats(period) {
    const { apiKey, username } = get();
    if (!apiKey) {
      set({ statsError: t("lastfm.err.needCredentials") });
      return;
    }
    // Stats are read with `api_key` only, so they work even when the user is not
    // connected — but a username is still required. The connected account's name
    // is used when the user has not typed one.
    const user = username.trim();
    if (!user) {
      set({ statsError: t("lastfm.err.notConnected") });
      return;
    }
    set({ statsLoading: true, statsError: null });
    try {
      const [info, artists, tracks, recent] = await Promise.all([
        lastfmGet(apiKey, "user.getInfo", { user }),
        lastfmGet(apiKey, "user.getTopArtists", { user, period, limit: 12 }),
        lastfmGet(apiKey, "user.getTopTracks", { user, period, limit: 12 }),
        lastfmGet(apiKey, "user.getRecentTracks", { user, limit: 12 }),
      ]);
      const built = buildStats(user, info, artists, tracks, recent);
      // Merge rather than replace: another period's data must not be dropped
      // just because this one was refreshed.
      set((state) => ({
        statsCache: { ...state.statsCache, [period]: built },
        statsLoading: false,
      }));
      persist(get(), true);
    } catch (err) {
      set({ statsLoading: false, statsError: lastfmErrorLabel(err) });
    }
  },

  clearStats() {
    set({ statsCache: {}, statsError: null });
    persist(get(), true);
  },
}));

/**
 * The cached stats for a period, or null when there is nothing usable.
 *
 * Validated against the CURRENT username so a cached payload can never be shown
 * for a different account — the cache outlives a disconnect on purpose, and this
 * is what keeps that safe. An entry with no fetchedAt is treated as absent: it
 * could not have come from a real fetch.
 */
export function cachedStatsFor(
  cache: LastfmStatsCache,
  period: LastfmPeriod,
  username: string,
): LastfmStats | null {
  const entry = cache[period];
  if (!entry || !entry.fetchedAt) return null;
  const user = username.trim();
  if (user && entry.username && entry.username !== user) return null;
  return entry;
}

// ---------------------------------------------------------------------------
// Response shaping
// ---------------------------------------------------------------------------

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

/** Last.fm returns every scalar as a string, so numbers are parsed explicitly. */
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * Pick the best image Last.fm offers.
 *
 * The docs only guarantee `small`/`medium`/`large`; `extralarge` and `mega`
 * appear in real responses but are undocumented, so they are preferred when
 * present and simply skipped when not. An empty `#text` is Last.fm's way of
 * saying "no image", which must not be treated as a URL.
 */
function pickImage(images: unknown): string | undefined {
  if (!Array.isArray(images)) return undefined;
  const bySize = new Map<string, string>();
  for (const entry of images) {
    const r = asRecord(entry);
    const size = str(r.size);
    const text = str(r["#text"]).trim();
    if (size && text) bySize.set(size, text);
  }
  for (const size of ["mega", "extralarge", "large", "medium", "small"]) {
    const hit = bySize.get(size);
    if (hit) return hit;
  }
  return undefined;
}

export function buildStats(
  username: string,
  infoRaw: unknown,
  artistsRaw: unknown,
  tracksRaw: unknown,
  recentRaw: unknown,
): LastfmStats {
  // `user.getInfo` wraps its payload in a `user` object, unlike the list methods
  // which wrap theirs in `topartists` / `toptracks` / `recenttracks`. Reading
  // `playcount` off the outer object silently yields 0.
  const info = asRecord(asRecord(infoRaw).user);
  const artists = asRecord(artistsRaw);
  const tracks = asRecord(tracksRaw);
  const recent = asRecord(recentRaw);

  const topArtists = Array.isArray(artists.topartists)
    ? artists.topartists
    : asRecord(artists.topartists).artist;
  const topTracks = Array.isArray(tracks.toptracks)
    ? tracks.toptracks
    : asRecord(tracks.toptracks).track;
  const recentList = Array.isArray(recent.recenttracks)
    ? recent.recenttracks
    : asRecord(recent.recenttracks).track;

  return {
    username: str(info.name) || username,
    playcount: num(info.playcount),
    topArtists: (Array.isArray(topArtists) ? topArtists : []).map((a) => {
      const r = asRecord(a);
      return {
        name: str(r.name),
        playcount: num(r.playcount),
        url: str(r.url),
        image: pickImage(r.image),
      };
    }),
    topTracks: (Array.isArray(topTracks) ? topTracks : []).map((tr) => {
      const r = asRecord(tr);
      const artist = asRecord(r.artist);
      return {
        name: str(r.name),
        artist: str(artist.name) || str(r.artist),
        playcount: num(r.playcount),
        url: str(r.url),
        image: pickImage(r.image),
      };
    }),
    recent: (Array.isArray(recentList) ? recentList : []).map((tr) => {
      const r = asRecord(tr);
      const artist = asRecord(r.artist);
      const date = asRecord(r.date);
      const uts = num(date.uts);
      return {
        name: str(r.name),
        artist: str(artist.name) || str(r.artist),
        album: str(asRecord(r.album)["#text"]),
        url: str(r.url),
        image: pickImage(r.image),
        // `nowplaying` is present as "true" only for the current track; the
        // attribute is absent otherwise, never "false".
        nowPlaying: str(asRecord(r["@attr"]).nowplaying) === "true",
        playedAt: uts > 0 ? uts * 1000 : undefined,
      };
    }),
    fetchedAt: Date.now(),
  };
}

/** Test seam: reset module-level state between runs. */
export function __resetLastfmForTests() {
  stopAuthWait();
  lastNowPlayingKey = "";
  loaded = false;
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
}

/**
 * Forget the now-playing dedupe key.
 *
 * Called when playback stops, so that resuming the same track announces it again
 * instead of being suppressed as a duplicate of the pre-pause announcement.
 */
export function resetNowPlayingDedupe() {
  lastNowPlayingKey = "";
}
