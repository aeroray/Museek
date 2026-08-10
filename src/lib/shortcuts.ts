import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { usePlayerStore } from "@/stores/playerStore";
import { getPlaybackTime } from "@/lib/playback/clock";
import { useDesktopLyricsStore } from "@/stores/desktopLyricsStore";
import { DESKTOP_LYRICS_GLOBAL_INTERACTION_EVENT } from "@/lib/desktopLyricsProtocol";
import { toggleMiniPlayer } from "@/lib/miniPlayer";

const SEEK_STEP = 5; // seconds
const VOL_STEP = 0.05;
const DESKTOP_LYRICS_TOGGLE_DEDUPE_MS = 200;
const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return (
    el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable
  );
}

/**
 * Global media keyboard shortcuts, registered once at the app root. Always
 * active, except while focus is in a text field (so typing in the search box
 * never triggers playback). Modifier = Ctrl (Windows) / ⌘ (mac).
 *
 *  Space            play / pause
 *  ← / →            seek −/+ 5s
 *  Ctrl/⌘ + ← / →   previous / next track
 *  Ctrl/⌘ + L        desktop lyrics toggle
 *  Ctrl/⌘ + Shift + L lock / unlock desktop lyrics
 *  ↑ / ↓            volume up / down
 *  M                mute toggle
 *  L                lyrics view toggle
 *  P                mini player toggle
 */
export function useGlobalShortcuts(): void {
  useEffect(() => {
    let disposed = false;
    let unlistenGlobalInteraction: (() => void) | undefined;
    let lastDesktopLyricsInteractionAt = 0;
    const toggleDesktopLyricsInteraction = () => {
      if (!useDesktopLyricsStore.getState().isVisible) return;
      const now = Date.now();
      if (
        now - lastDesktopLyricsInteractionAt <
        DESKTOP_LYRICS_TOGGLE_DEDUPE_MS
      ) {
        return;
      }
      lastDesktopLyricsInteractionAt = now;
      void import("@/lib/desktopLyrics").then((m) =>
        m.toggleDesktopLyricsInteraction(),
      );
    };

    if (isTauri) {
      void listen<null>(DESKTOP_LYRICS_GLOBAL_INTERACTION_EVENT, () => {
        toggleDesktopLyricsInteraction();
      }).then((unlisten) => {
        if (disposed) unlisten();
        else unlistenGlobalInteraction = unlisten;
      });
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || isTypingTarget(e.target)) return;
      const p = usePlayerStore.getState();
      const desktopLyricsVisible = useDesktopLyricsStore.getState().isVisible;
      const canTransport = p.status !== "idle" && p.status !== "loading";
      const canSeek =
        !!p.currentSong &&
        p.status !== "idle" &&
        p.status !== "loading" &&
        p.status !== "error";
      const mod = e.ctrlKey || e.metaKey;
      let handled = true;
      switch (e.key) {
        case " ":
          if (canTransport) p.togglePlay();
          else handled = false;
          break;
        case "ArrowLeft":
          if (mod) {
            if (canTransport) void p.prev();
            else handled = false;
          } else if (canSeek) {
            p.seek(getPlaybackTime() - SEEK_STEP);
          } else {
            handled = false;
          }
          break;
        case "ArrowRight":
          if (mod) {
            if (canTransport) void p.next();
            else handled = false;
          } else if (canSeek) {
            p.seek(getPlaybackTime() + SEEK_STEP);
          } else {
            handled = false;
          }
          break;
        case "ArrowUp":
          if (p.muted) p.setMuted(false);
          p.setVolume(Math.min(1, p.volume + VOL_STEP));
          break;
        case "ArrowDown":
          if (p.muted) p.setMuted(false);
          p.setVolume(Math.max(0, p.volume - VOL_STEP));
          break;
        case "m":
        case "M":
          if (mod) {
            handled = false;
            break;
          }
          p.setMuted(!p.muted);
          break;
        case "l":
        case "L":
          if (mod && e.shiftKey) {
            if (!desktopLyricsVisible) {
              handled = false;
              break;
            }
            toggleDesktopLyricsInteraction();
            break;
          }
          if (mod) {
            if (!p.currentSong && !desktopLyricsVisible) {
              handled = false;
              break;
            }
            void import("@/lib/desktopLyrics").then((m) =>
              m.toggleDesktopLyricsVisibility(),
            );
            break;
          }
          if (p.currentSong) p.setShowLyrics(!p.showLyrics);
          else handled = false;
          break;
        case "p":
        case "P":
          if (mod) {
            handled = false;
            break;
          }
          if (p.currentSong) void toggleMiniPlayer();
          else handled = false;
          break;
        default:
          handled = false;
      }
      if (!handled) return;
      e.preventDefault();
      // Drop focus from any control so the same keypress can't also activate it
      // or leave a focus-visible ring (e.g. Space right after clicking a button
      // or a playlist card's "play all").
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body)
        active.blur();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      disposed = true;
      unlistenGlobalInteraction?.();
      window.removeEventListener("keydown", onKey);
    };
  }, []);
}
