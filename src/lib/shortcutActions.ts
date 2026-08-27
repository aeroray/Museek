import { usePlayerStore } from "@/stores/playerStore";
import { useDesktopLyricsStore } from "@/stores/desktopLyricsStore";
import { getPlaybackTime } from "@/lib/playback/clock";
import { toggleMiniPlayer } from "@/lib/miniPlayer";
import type { ShortcutAction } from "@/lib/shortcutKeys";

const SEEK_STEP = 5;
const VOL_STEP = 0.05;
const DESKTOP_LYRICS_TOGGLE_DEDUPE_MS = 200;
const ACTION_DEDUPE_MS = 120;

let lastDesktopLyricsInteractionAt = 0;
const lastActionAt = new Map<ShortcutAction, number>();

function toggleDesktopLyricsInteraction() {
  if (!useDesktopLyricsStore.getState().isVisible) return;
  const now = Date.now();
  if (now - lastDesktopLyricsInteractionAt < DESKTOP_LYRICS_TOGGLE_DEDUPE_MS) {
    return;
  }
  lastDesktopLyricsInteractionAt = now;
  void import("@/lib/desktopLyrics").then((m) =>
    m.toggleDesktopLyricsInteraction(),
  );
}

/** Same availability rules as the matching UI controls. */
export function runShortcutAction(action: ShortcutAction): boolean {
  const now = Date.now();
  if ((lastActionAt.get(action) ?? 0) + ACTION_DEDUPE_MS > now) return false;
  lastActionAt.set(action, now);

  const p = usePlayerStore.getState();
  const desktopLyricsVisible = useDesktopLyricsStore.getState().isVisible;
  const canTransport = p.status !== "idle" && p.status !== "loading";
  const canSeek =
    !!p.currentSong &&
    p.status !== "idle" &&
    p.status !== "loading" &&
    p.status !== "error";

  switch (action) {
    case "playPause":
      if (!canTransport) return false;
      p.togglePlay();
      return true;
    case "seekBack":
      if (!canSeek) return false;
      p.seek(getPlaybackTime() - SEEK_STEP);
      return true;
    case "seekForward":
      if (!canSeek) return false;
      p.seek(getPlaybackTime() + SEEK_STEP);
      return true;
    case "prev":
      if (!canTransport) return false;
      void p.prev();
      return true;
    case "next":
      if (!canTransport) return false;
      void p.next();
      return true;
    case "volumeUp":
      if (p.muted) p.setMuted(false);
      p.setVolume(Math.min(1, p.volume + VOL_STEP));
      return true;
    case "volumeDown":
      if (p.muted) p.setMuted(false);
      p.setVolume(Math.max(0, p.volume - VOL_STEP));
      return true;
    case "mute":
      p.setMuted(!p.muted);
      return true;
    case "lyrics":
      if (!p.currentSong) return false;
      if (!p.showLyrics && p.lyricLines.length === 0) return false;
      p.setShowLyrics(!p.showLyrics);
      return true;
    case "desktopLyrics":
      if (!p.currentSong && !desktopLyricsVisible) return false;
      void import("@/lib/desktopLyrics").then((m) =>
        m.toggleDesktopLyricsVisibility(),
      );
      return true;
    case "desktopLyricsLock":
      if (!desktopLyricsVisible) return false;
      toggleDesktopLyricsInteraction();
      return true;
    case "mini":
      if (!p.currentSong) return false;
      void toggleMiniPlayer();
      return true;
  }
}
