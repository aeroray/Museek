import { readData, writeDataCompact } from "@/lib/db";
import { intervalToSeconds } from "@/lib/playbackSession";
import type { MusicInfo, MusicInfoMeta } from "@/types/music";

export const LISTEN_LOG_FILE = "listenLog.json";
export const PLAY_COUNT_MS = 30_000;

/**
 * Retention. The log is a history, not a library: it must stay small and
 * predictable no matter how long the app is used, so there is exactly one rule —
 * a hard cap on stored events, oldest dropped first.
 *
 * A count cap rather than an age cap on purpose. It gives a fixed, explainable
 * ceiling on disk use ("this file never grows past ~1.2 MB"), whereas an age cap
 * would let a heavy listener's file grow without bound inside the window, and
 * would quietly make the "All time" period mean something narrower than it says.
 *
 * Measured, not guessed: a realistic online song snapshot (cover URL plus three
 * quality entries) is ~620 bytes as compact JSON. 2,000 events therefore cap the
 * file near 1.2 MB, and cover ~40 days at 50 songs/day or ~80 days at 25/day —
 * comfortably more than the longest period the UI offers (30 days).
 */
export const MAX_LISTEN_EVENTS = 2_000;

/** Distinct songs shown in the "Recently played" tab. */
export const RECENT_LIMIT = 100;
export const TOP_SONGS_LIMIT = 50;
export const TOP_ARTISTS_LIMIT = 30;

export type ListenPeriod = "today" | "week" | "month" | "all";

export type PlayEvent = {
  id: string;
  startedAt: number;
  listenedMs: number;
  completed: boolean;
  song: MusicInfo;
};

export type LiveListenSession = PlayEvent & {
  playing: boolean;
  lastTick: number;
};

export type ListenLogFile = {
  version: 1;
  events: PlayEvent[];
  live: LiveListenSession | null;
};

export type TopSongStat = {
  song: MusicInfo;
  playCount: number;
  listenedMs: number;
};

export type TopArtistStat = {
  singer: string;
  playCount: number;
  listenedMs: number;
};

export type ListenAggregate = {
  listenedMs: number;
  uniqueSongs: number;
  uniqueArtists: number;
  plays: number;
  topSongs: TopSongStat[];
  topArtists: TopArtistStat[];
  recents: PlayEvent[];
};

const PERIOD_MS: Record<Exclude<ListenPeriod, "today" | "all">, number> = {
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}

function isMusicInfo(v: unknown): v is MusicInfo {
  if (!isRecord(v)) return false;
  const meta = v.meta;
  return (
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    typeof v.singer === "string" &&
    typeof v.source === "string" &&
    typeof v.interval === "string" &&
    typeof v.albumName === "string" &&
    isRecord(meta) &&
    typeof meta.songId === "string"
  );
}

function parseEvent(v: unknown): PlayEvent | null {
  if (!isRecord(v) || !isMusicInfo(v.song)) return null;
  if (typeof v.id !== "string" || typeof v.startedAt !== "number") return null;
  if (!Number.isFinite(v.startedAt) || v.startedAt <= 0) return null;
  const listenedMs =
    typeof v.listenedMs === "number" && Number.isFinite(v.listenedMs)
      ? Math.max(0, Math.trunc(v.listenedMs))
      : 0;
  return {
    id: v.id,
    startedAt: Math.trunc(v.startedAt),
    listenedMs,
    completed: v.completed === true,
    song: snapshotSong(v.song),
  };
}

function parseLive(v: unknown): LiveListenSession | null {
  const event = parseEvent(v);
  if (!event || !isRecord(v)) return null;
  const lastTick =
    typeof v.lastTick === "number" && Number.isFinite(v.lastTick)
      ? Math.trunc(v.lastTick)
      : event.startedAt;
  return {
    ...event,
    playing: false,
    lastTick,
  };
}

export function snapshotSong(song: MusicInfo): MusicInfo {
  const meta: MusicInfoMeta = {
    ...song.meta,
    qualitys: Array.isArray(song.meta.qualitys) ? song.meta.qualitys : [],
    _qualitys:
      song.meta._qualitys && typeof song.meta._qualitys === "object"
        ? song.meta._qualitys
        : {},
  };
  delete meta.embeddedLyric;
  return {
    id: song.id,
    name: song.name,
    singer: song.singer,
    source: song.source,
    interval: song.interval,
    albumName: song.albumName,
    meta,
  };
}

export function newEventId(songId: string, startedAt: number): string {
  return `${startedAt}:${songId}:${Math.random().toString(36).slice(2, 8)}`;
}

export function songDurationMs(song: MusicInfo): number {
  return Math.max(0, intervalToSeconds(song.interval) * 1000);
}

/**
 * Splits a collab credit into individual artists.
 *
 * Every platform module joins artists with the ideographic comma `、`
 * (`formatSingers` in the search/chart/playlist adapters, and KuWo/KuGou
 * additionally rewrite `&` to it), so that is the one separator guaranteed by
 * the data contract. `;` and `,` are included because local file tags use them.
 *
 * `/` and `&` are deliberately NOT separators: both occur inside real artist
 * names (AC/DC, Simon & Garfunkel), and splitting them would invent artists that
 * do not exist. The cost of missing an occasional collab is a slightly split
 * stat; the cost of over-splitting is wrong data that cannot be undone.
 */
export function splitArtists(singer: string | undefined | null): string[] {
  if (!singer) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of singer.split(/[、;；,，]+/)) {
    const name = part.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

/** Whether any artist on a collab credit matches `artist`. */
function creditIncludes(singer: string, artist: string): boolean {
  return splitArtists(singer).includes(artist);
}

/** Spotify-style 30s stream, plus completed tracks shorter than 30s. */
export function countsAsPlay(event: PlayEvent): boolean {
  if (event.listenedMs >= PLAY_COUNT_MS) return true;
  if (!event.completed) return false;
  const durationMs = songDurationMs(event.song);
  return durationMs === 0 || durationMs < PLAY_COUNT_MS;
}

export function periodStart(period: ListenPeriod, now = Date.now()): number {
  if (period === "all") return 0;
  if (period === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  return now - PERIOD_MS[period];
}

export function accrueSession(
  live: LiveListenSession,
  now = Date.now(),
): LiveListenSession {
  if (!live.playing) return live;
  const delta = Math.max(0, now - live.lastTick);
  return {
    ...live,
    listenedMs: live.listenedMs + delta,
    lastTick: now,
  };
}

/**
 * Enforce the retention cap. Events are appended chronologically, so dropping
 * the oldest is a slice from the front.
 *
 * Applied on read *and* write, so an install upgrading from the previous 8,000
 * cap shrinks on first load instead of staying oversized until the next play.
 */
export function trimEvents(events: PlayEvent[]): PlayEvent[] {
  if (events.length <= MAX_LISTEN_EVENTS) return events;
  return events.slice(events.length - MAX_LISTEN_EVENTS);
}

export function eventsWithLive(
  events: PlayEvent[],
  live: LiveListenSession | null,
): PlayEvent[] {
  if (!live) return events;
  return [...events, live];
}

/**
 * "Recently played" is a list of *songs*, not of play events: a song you have on
 * repeat should occupy one row showing the latest time, not twenty rows pushing
 * everything else off the list.
 *
 * Keeps the newest event per song id, then sorts by time, then caps. Events are
 * already chronological, but the sort makes the result independent of input
 * order — `eventsWithLive` appends the live session out of order.
 */
function collapseRecents(events: PlayEvent[]): PlayEvent[] {
  const newestPerSong = new Map<string, PlayEvent>();
  for (const event of events) {
    const seen = newestPerSong.get(event.song.id);
    if (!seen || event.startedAt > seen.startedAt) {
      newestPerSong.set(event.song.id, event);
    }
  }
  return [...newestPerSong.values()]
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, RECENT_LIMIT);
}

/**
 * Aggregate the log for one period.
 *
 * Artist stats are counted per *credited artist*, not per credit string: a song
 * tagged `鬼才、刀酱` credits both 鬼才 and 刀酱 individually, so they add up with
 * their solo work instead of forming a separate "鬼才、刀酱" row. A play is
 * therefore counted once per song but once per artist on that song, which is
 * what makes the artist ranking comparable across collabs and solo tracks.
 *
 * `singerFilter` matches if the artist appears anywhere in a credit, so opening
 * an artist from the ranking shows their collabs too.
 */
export function aggregateListening(
  events: PlayEvent[],
  period: ListenPeriod,
  now = Date.now(),
  singerFilter?: string | null,
): ListenAggregate {
  const start = periodStart(period, now);
  const inRange = events.filter((e) => e.startedAt >= start);
  const ranked = singerFilter
    ? inRange.filter((e) => creditIncludes(e.song.singer, singerFilter))
    : inRange;
  const plays = ranked.filter(countsAsPlay);

  let listenedMs = 0;
  const songIds = new Set<string>();
  const artists = new Set<string>();
  for (const event of ranked) {
    listenedMs += event.listenedMs;
    songIds.add(event.song.id);
    for (const name of splitArtists(event.song.singer)) artists.add(name);
  }

  const songMap = new Map<string, TopSongStat>();
  const artistMap = new Map<string, TopArtistStat>();
  for (const event of plays) {
    const songStat = songMap.get(event.song.id);
    if (songStat) {
      songStat.playCount += 1;
      songStat.listenedMs += event.listenedMs;
    } else {
      songMap.set(event.song.id, {
        song: event.song,
        playCount: 1,
        listenedMs: event.listenedMs,
      });
    }

    for (const name of splitArtists(event.song.singer)) {
      const artistStat = artistMap.get(name);
      if (artistStat) {
        artistStat.playCount += 1;
        artistStat.listenedMs += event.listenedMs;
      } else {
        artistMap.set(name, {
          singer: name,
          playCount: 1,
          listenedMs: event.listenedMs,
        });
      }
    }
  }

  const byPlaysThenTime = (
    a: { playCount: number; listenedMs: number },
    b: { playCount: number; listenedMs: number },
  ) => b.playCount - a.playCount || b.listenedMs - a.listenedMs;

  return {
    listenedMs,
    uniqueSongs: songIds.size,
    uniqueArtists: artists.size,
    plays: plays.length,
    topSongs: [...songMap.values()]
      .sort(byPlaysThenTime)
      .slice(0, TOP_SONGS_LIMIT),
    topArtists: [...artistMap.values()]
      .sort(byPlaysThenTime)
      .slice(0, TOP_ARTISTS_LIMIT),
    recents: collapseRecents(ranked),
  };
}

export async function readListenLog(): Promise<ListenLogFile> {
  const raw = await readData<unknown>(LISTEN_LOG_FILE, null);
  if (!isRecord(raw)) {
    return { version: 1, events: [], live: null };
  }
  const events = Array.isArray(raw.events)
    ? raw.events.map(parseEvent).filter((e): e is PlayEvent => e !== null)
    : [];
  return {
    version: 1,
    // Retention is re-applied here so an older, larger log shrinks on load
    // instead of staying oversized until the next play.
    events: trimEvents(events),
    live: parseLive(raw.live),
  };
}

export async function writeListenLog(log: ListenLogFile): Promise<void> {
  // Compact, not pretty-printed: this file is machine-only and holds thousands
  // of song snapshots, where indentation would roughly double the bytes.
  await writeDataCompact(LISTEN_LOG_FILE, {
    version: 1,
    events: trimEvents(log.events),
    live: log.live
      ? {
          id: log.live.id,
          startedAt: log.live.startedAt,
          listenedMs: log.live.listenedMs,
          completed: log.live.completed,
          song: log.live.song,
          lastTick: log.live.lastTick,
        }
      : null,
  });
}
