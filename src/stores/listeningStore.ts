import { create } from "zustand";
import {
  accrueSession,
  newEventId,
  readListenLog,
  snapshotSong,
  trimEvents,
  writeListenLog,
  type LiveListenSession,
  type PlayEvent,
} from "@/lib/listenLog";
import type { MusicInfo } from "@/types/music";

let live: LiveListenSession | null = null;
let events: PlayEvent[] = [];
let writeTimer: ReturnType<typeof setTimeout> | null = null;
let lastUiAt = 0;
let loaded = false;

function persist(immediate = false) {
  const payload = { version: 1 as const, events, live };
  if (immediate) {
    if (writeTimer) {
      clearTimeout(writeTimer);
      writeTimer = null;
    }
    void writeListenLog(payload);
    return;
  }
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    void writeListenLog({ version: 1, events, live });
  }, 1500);
}

function publish(force: boolean) {
  const now = Date.now();
  if (!force && now - lastUiAt < 1000) return;
  lastUiAt = now;
  useListeningStore.setState({
    events,
    live: live ? { ...live } : null,
  });
}

function pauseLive() {
  if (!live?.playing) return;
  live = { ...accrueSession(live), playing: false };
  persist(true);
  publish(true);
}

type ListeningState = {
  events: PlayEvent[];
  live: LiveListenSession | null;
  hydrated: boolean;
  loadFromDisk: () => Promise<void>;
  clearHistory: () => Promise<void>;
  finish: (completed: boolean) => void;
  setPlaying: (playing: boolean, song: MusicInfo | null) => void;
};

export const useListeningStore = create<ListeningState>((set) => ({
  events: [],
  live: null,
  hydrated: false,

  async loadFromDisk() {
    if (loaded) return;
    loaded = true;
    const log = await readListenLog();
    events = log.events;
    live = log.live;
    set({ events, live, hydrated: true });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "hidden") return;
      if (live?.playing) live = accrueSession(live);
      persist(true);
    });
  },

  async clearHistory() {
    if (writeTimer) {
      clearTimeout(writeTimer);
      writeTimer = null;
    }
    events = [];
    live = null;
    set({ events: [], live: null });
    await writeListenLog({ version: 1, events: [], live: null });
  },

  finish(completed) {
    if (!live) return;
    const closed = accrueSession(live);
    events = trimEvents([
      ...events,
      {
        id: closed.id,
        startedAt: closed.startedAt,
        listenedMs: closed.listenedMs,
        completed,
        song: closed.song,
      },
    ]);
    live = null;
    persist(true);
    publish(true);
  },

  setPlaying(playing, song) {
    if (!playing) {
      pauseLive();
      return;
    }
    if (!song) return;

    if (live && live.song.id === song.id) {
      live = {
        ...live,
        song: snapshotSong(song),
        playing: true,
        lastTick: live.playing ? live.lastTick : Date.now(),
      };
      live = accrueSession(live);
      persist(false);
      publish(false);
      return;
    }

    if (live) {
      useListeningStore.getState().finish(false);
    }

    const startedAt = Date.now();
    live = {
      id: newEventId(song.id, startedAt),
      startedAt,
      listenedMs: 0,
      completed: false,
      song: snapshotSong(song),
      playing: true,
      lastTick: startedAt,
    };
    persist(true);
    publish(true);
  },
}));
