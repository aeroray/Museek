import { readData, writeData } from "@/lib/db";
import type { MusicInfo, Quality } from "@/types/music";
import type { PlayMode, QueueItem } from "@/types/player";

const SESSION_FILE = "playbackSession.json";
const QUALITIES: Quality[] = ["128k", "320k", "flac", "flac24bit"];
const PLAY_MODES: PlayMode[] = [
  "sequence",
  "shuffle",
  "repeat-one",
  "repeat-list",
];

export type PlaybackSession = {
  version: 1;
  queue: QueueItem[];
  queueIndex: number;
  currentSong: MusicInfo | null;
  currentQuality: Quality;
  playMode: PlayMode;
  currentTime: number;
  duration: number;
};

let writeTimer: ReturnType<typeof setTimeout> | null = null;
let pending: PlaybackSession | null = null;

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
    isRecord(meta) &&
    typeof meta.songId === "string"
  );
}

function isQueueItem(v: unknown): v is QueueItem {
  if (!isRecord(v) || !isMusicInfo(v.music)) return false;
  if (typeof v.quality !== "string" || !QUALITIES.includes(v.quality as Quality)) {
    return false;
  }
  if (
    v.playedQuality !== undefined &&
    (typeof v.playedQuality !== "string" ||
      !QUALITIES.includes(v.playedQuality as Quality))
  ) {
    return false;
  }
  return true;
}

export function intervalToSeconds(interval: string | undefined): number {
  if (!interval) return 0;
  const parts = interval.split(":").map((p) => Number.parseInt(p, 10));
  if (!parts.length || parts.some((n) => !Number.isFinite(n))) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

export function clampResumeTime(time: number, duration: number): number {
  if (!Number.isFinite(time) || time <= 0) return 0;
  if (!Number.isFinite(duration) || duration <= 1) return time;
  if (time >= duration - 1) return 0;
  return Math.min(time, duration);
}

export async function readPlaybackSession(): Promise<PlaybackSession | null> {
  const raw = await readData<unknown>(SESSION_FILE, null);
  if (!isRecord(raw)) return null;
  const queue = Array.isArray(raw.queue) ? raw.queue.filter(isQueueItem) : [];
  const currentSong = isMusicInfo(raw.currentSong) ? raw.currentSong : null;
  const currentQuality = QUALITIES.includes(raw.currentQuality as Quality)
    ? (raw.currentQuality as Quality)
    : "128k";
  const playMode = PLAY_MODES.includes(raw.playMode as PlayMode)
    ? (raw.playMode as PlayMode)
    : "sequence";
  let queueIndex =
    typeof raw.queueIndex === "number" && Number.isFinite(raw.queueIndex)
      ? Math.trunc(raw.queueIndex)
      : -1;
  if (queueIndex < -1 || queueIndex >= queue.length) queueIndex = -1;
  if (currentSong) {
    const idx = queue.findIndex((item) => item.music.id === currentSong.id);
    if (idx >= 0) queueIndex = idx;
  } else {
    queueIndex = -1;
  }
  const duration =
    typeof raw.duration === "number" && raw.duration > 0
      ? raw.duration
      : intervalToSeconds(currentSong?.interval);
  const currentTime = clampResumeTime(
    typeof raw.currentTime === "number" ? raw.currentTime : 0,
    duration,
  );
  return {
    version: 1,
    queue,
    queueIndex,
    currentSong,
    currentQuality,
    playMode,
    currentTime,
    duration,
  };
}

export function schedulePlaybackSessionWrite(
  session: PlaybackSession,
  immediate = false,
): void {
  pending = session;
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  if (immediate) {
    void writeData(SESSION_FILE, session);
    pending = null;
    return;
  }
  writeTimer = setTimeout(() => {
    writeTimer = null;
    if (!pending) return;
    void writeData(SESSION_FILE, pending);
    pending = null;
  }, 1500);
}

export function flushPlaybackSessionWrite(): void {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  if (!pending) return;
  void writeData(SESSION_FILE, pending);
  pending = null;
}
