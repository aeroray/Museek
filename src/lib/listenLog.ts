import { readData, writeData } from "@/lib/db";
import { intervalToSeconds } from "@/lib/playbackSession";
import type { MusicInfo, MusicInfoMeta } from "@/types/music";

export const LISTEN_LOG_FILE = "listenLog.json";
export const PLAY_COUNT_MS = 30_000;
export const MAX_LISTEN_EVENTS = 8_000;
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
  song: MusicInfo;
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

function collapseRecents(events: PlayEvent[]): PlayEvent[] {
  const newestFirst = [...events].sort((a, b) => b.startedAt - a.startedAt);
  const out: PlayEvent[] = [];
  for (const event of newestFirst) {
    const prev = out[out.length - 1];
    if (prev && prev.song.id === event.song.id) continue;
    out.push(event);
    if (out.length >= RECENT_LIMIT) break;
  }
  return out;
}

export function aggregateListening(
  events: PlayEvent[],
  period: ListenPeriod,
  now = Date.now(),
  singerFilter?: string | null,
): ListenAggregate {
  const start = periodStart(period, now);
  const inRange = events.filter((e) => e.startedAt >= start);
  const ranked = singerFilter
    ? inRange.filter((e) => e.song.singer === singerFilter)
    : inRange;
  const plays = ranked.filter(countsAsPlay);

  let listenedMs = 0;
  const songIds = new Set<string>();
  const artists = new Set<string>();
  for (const event of ranked) {
    listenedMs += event.listenedMs;
    songIds.add(event.song.id);
    if (event.song.singer) artists.add(event.song.singer);
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
    const singer = event.song.singer;
    if (!singer) continue;
    const artistStat = artistMap.get(singer);
    if (artistStat) {
      artistStat.playCount += 1;
      artistStat.listenedMs += event.listenedMs;
    } else {
      artistMap.set(singer, {
        singer,
        playCount: 1,
        listenedMs: event.listenedMs,
        song: event.song,
      });
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
    events: trimEvents(events),
    live: parseLive(raw.live),
  };
}

export async function writeListenLog(log: ListenLogFile): Promise<void> {
  await writeData(LISTEN_LOG_FILE, {
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
