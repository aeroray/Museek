// Bridge to the OS media controls (Windows SMTC etc.) exposed by the Rust side.
// No-ops in the browser preview (Tauri IPC unavailable).

import { audioPlayer } from "@/lib/audio";

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const isWindows =
  typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);

const PROGRESS_INTERVAL_MS = 1000;
const SEEK_JUMP_SECS = 0.75;

type LastMedia = {
  title: string;
  artist: string;
  album: string;
  cover: string | null;
  playing: boolean;
  duration: number;
};

let lastMedia: LastMedia | null = null;
let lastProgressAt = 0;
let lastProgressPos = 0;
let progressWired = false;

function getBrowserMediaSession(): MediaSession | null {
  if (!isWindows || isTauri || typeof navigator === "undefined") return null;
  if (!("mediaSession" in navigator)) return null;
  return navigator.mediaSession;
}

function finiteSecs(value: number): number | undefined {
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function clockSnapshot(): { position?: number; duration?: number } {
  const state = audioPlayer.getState();
  return {
    position: finiteSecs(state.currentTime),
    duration: finiteSecs(state.duration) && state.duration > 0 ? state.duration : undefined,
  };
}

function updateBrowserPosition(playing: boolean) {
  const session = getBrowserMediaSession();
  if (!session?.setPositionState) return;
  const { position, duration } = clockSnapshot();
  if (duration == null || position == null) return;
  try {
    session.setPositionState({
      duration,
      playbackRate: 1,
      position: Math.min(position, duration),
    });
    session.playbackState = playing ? "playing" : "paused";
  } catch {
    /* browser media controls are best-effort */
  }
}

function updateBrowserMediaControls(
  title: string,
  artist: string,
  album: string,
  cover: string | null,
  playing: boolean,
) {
  const session = getBrowserMediaSession();
  if (!session) return;
  try {
    if (!title.trim()) {
      session.metadata = null;
      session.playbackState = "none";
      return;
    }
    session.metadata = new MediaMetadata({
      title,
      artist,
      album,
      artwork: cover ? [{ src: cover }] : [],
    });
    session.playbackState = playing ? "playing" : "paused";
    updateBrowserPosition(playing);
  } catch {
    /* browser media controls are best-effort */
  }
}

async function invokeMediaProgress(position: number, playing: boolean) {
  if (!isTauri) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("media_progress", { position, playing });
  } catch {
    /* media controls are best-effort */
  }
}

function rememberProgress(position: number) {
  lastProgressAt = performance.now();
  lastProgressPos = position;
}

function wireProgressBridge() {
  if (progressWired) return;
  progressWired = true;
  audioPlayer.subscribeTime((currentTime) => {
    if (!lastMedia?.title.trim()) return;
    const { duration } = clockSnapshot();
    const playing = audioPlayer.getState().isPlaying;
    if ((duration ?? 0) > 0 && lastMedia.duration <= 0) {
      void updateMediaControls(
        lastMedia.title,
        lastMedia.artist,
        lastMedia.album,
        lastMedia.cover,
        playing,
      );
      return;
    }
    const jumped = Math.abs(currentTime - lastProgressPos) >= SEEK_JUMP_SECS;
    const due = performance.now() - lastProgressAt >= PROGRESS_INTERVAL_MS;
    if (!jumped && !due) return;
    rememberProgress(currentTime);
    updateBrowserPosition(playing);
    void invokeMediaProgress(currentTime, playing);
  });
}

export async function updateMediaControls(
  title: string,
  artist: string,
  album: string,
  cover: string | null,
  playing: boolean,
): Promise<void> {
  const { position, duration } = clockSnapshot();
  lastMedia = {
    title,
    artist,
    album,
    cover,
    playing,
    duration: duration ?? 0,
  };
  rememberProgress(position ?? 0);
  updateBrowserMediaControls(title, artist, album, cover, playing);
  if (!isTauri) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("media_update", {
      title,
      artist,
      album,
      cover,
      playing,
      position,
      duration,
    });
  } catch {
    /* media controls are best-effort */
  }
}

let attached = false;

// Wire OS media-control button events (play/pause/toggle/next/previous) to the
// player. Safe to call multiple times — only the first attaches.
export async function attachMediaControls(handlers: {
  play: () => void;
  pause: () => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seek?: (seconds: number) => void;
  seekBy?: (delta: number) => void;
}): Promise<void> {
  const mediaSession = getBrowserMediaSession();
  if ((!isTauri && !mediaSession) || attached) return;
  attached = true;
  wireProgressBridge();

  if (mediaSession) {
    const actions = [
      ["play", handlers.play],
      ["pause", handlers.pause],
      ["previoustrack", handlers.previous],
      ["nexttrack", handlers.next],
    ] as const;
    for (const [action, handler] of actions) {
      try {
        mediaSession.setActionHandler(action, () => handler());
      } catch {
        /* action is not supported by this WebView */
      }
    }
    if (handlers.seek) {
      try {
        mediaSession.setActionHandler("seekto", (details) => {
          if (typeof details.seekTime === "number") handlers.seek?.(details.seekTime);
        });
      } catch {
        /* action is not supported by this WebView */
      }
    }
  }

  if (!isTauri) return;
  try {
    const { listen } = await import("@tauri-apps/api/event");
    await listen<string>("media-control", (e) => {
      switch (e.payload) {
        case "play":
          handlers.play();
          break;
        case "pause":
          handlers.pause();
          break;
        case "toggle":
          handlers.toggle();
          break;
        case "next":
          handlers.next();
          break;
        case "previous":
          handlers.previous();
          break;
        default:
          break;
      }
    });
    if (handlers.seek) {
      await listen<number>("media-seek", (e) => {
        if (Number.isFinite(e.payload)) handlers.seek?.(e.payload);
      });
    }
    if (handlers.seekBy) {
      await listen<number>("media-seek-by", (e) => {
        if (Number.isFinite(e.payload)) handlers.seekBy?.(e.payload);
      });
    }
  } catch {
    attached = false;
  }
}
