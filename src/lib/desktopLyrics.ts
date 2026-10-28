import { emitTo, listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { audioPlayer } from "@/lib/audio";
import { usePlayerStore } from "@/stores/playerStore";
import { useLangStore } from "@/lib/i18n";
import { useThemeStore } from "@/stores/themeStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { formatShortcut } from "@/lib/shortcutKeys";
import { useDesktopLyricsStore } from "@/stores/desktopLyricsStore";
import { currentFontStacks, useFontStore } from "@/stores/fontStore";
import { findActiveLyricIndex } from "@/lib/lyrics";
import { getLyricTime } from "@/lib/playback/clock";
import { snapshotKey as payloadKey } from "@/lib/desktopLyricsSync";
import {
  loadDesktopLyricsInteractionMode,
  saveDesktopLyricsInteractionMode,
} from "@/lib/desktopLyricsStorage";
import {
  DESKTOP_LYRICS_LABEL,
  DESKTOP_LYRICS_APPEARANCE_EVENT,
  DESKTOP_LYRICS_CLOSED_EVENT,
  DESKTOP_LYRICS_INTERACTION_EVENT,
  DESKTOP_LYRICS_REQUEST_EVENT,
  DESKTOP_LYRICS_SET_INTERACTION_EVENT,
  DESKTOP_LYRICS_STATE_EVENT,
  DESKTOP_LYRICS_TIME_EVENT,
  type DesktopLyricsAppearanceSnapshot,
  type DesktopLyricsInteractionMode,
  type DesktopLyricsSnapshot,
} from "@/lib/desktopLyricsProtocol";

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Same rule as the player-bar button: close if open; else need a song with lyrics. */
export function canToggleDesktopLyrics(opts: {
  hasSong: boolean;
  hasLyrics: boolean;
  visible: boolean;
}): boolean {
  if (opts.visible) return true;
  return opts.hasSong && opts.hasLyrics;
}

type PlayerSnapshotState = ReturnType<typeof usePlayerStore.getState>;

let bridgeStarted = false;
let lastSnapshotKey: string | null = null;
let lastAppearanceKey: string | null = null;
let lastInteractionMode: DesktopLyricsInteractionMode | null = null;
let interactionModeLoaded = false;
let interactionModeLoadPromise: Promise<void> | null = null;

function createSnapshot(state: PlayerSnapshotState): DesktopLyricsSnapshot {
  const currentTime =
    state.status === "loading" || state.status === "idle"
      ? 0
      : getLyricTime();
  return {
    song: state.currentSong
      ? {
          title: state.currentSong.name,
          artist: state.currentSong.singer,
          coverUrl:
            state.currentPicUrl ?? state.currentSong.meta.picUrl ?? null,
        }
      : null,
    lines: state.lyricLines.map((line) => ({
      ...line,
      time: line.time,
      text: line.text,
      ...(line.translation ? { translation: line.translation } : {}),
    })),
    currentTime,
    currentLyricIndex: findActiveLyricIndex(state.lyricLines, currentTime),
    duration: state.duration,
    isPlaying: state.isPlaying,
    status: state.status,
    lyricsLoading: state.lyricsLoading,
  };
}

/**
 * Identity of a lyric *payload*, not of the clock — see `desktopLyricsSync.ts`
 * for why the distinction is load-bearing.
 */
function snapshotKey(state: PlayerSnapshotState): string {
  return payloadKey(state);
}

function createAppearanceSnapshot(): DesktopLyricsAppearanceSnapshot {
  const theme = useThemeStore.getState();
  const shortcuts = useSettingsStore.getState().shortcuts;
  const fonts = currentFontStacks();
  return {
    lang: useLangStore.getState().lang,
    themeMode: theme.mode,
    palette: theme.palette,
    capsuleVisible: useSettingsStore.getState().desktopLyricsCapsuleVisible,
    twoLines: useSettingsStore.getState().desktopLyricsTwoLines,
    lyricColor: useSettingsStore.getState().desktopLyricsColor,
    lockShortcut: formatShortcut(shortcuts.desktopLyricsLock),
    hideShortcut: formatShortcut(shortcuts.desktopLyrics),
    fontUi: fonts.ui,
    fontLyrics: fonts.lyrics,
  };
}

function appearanceKey(snapshot: DesktopLyricsAppearanceSnapshot): string {
  return `${snapshot.lang}|${snapshot.themeMode}|${snapshot.palette}|${snapshot.capsuleVisible}|${snapshot.twoLines}|${snapshot.lyricColor ?? ""}|${snapshot.lockShortcut}|${snapshot.hideShortcut}|${snapshot.fontUi ?? ""}|${snapshot.fontLyrics ?? ""}`;
}

async function ensureInteractionModeLoaded(): Promise<void> {
  if (!isTauri || interactionModeLoaded) return;
  if (!interactionModeLoadPromise) {
    interactionModeLoadPromise = loadDesktopLyricsInteractionMode()
      .then((interactionMode) => {
        useDesktopLyricsStore.getState().setInteractionMode(interactionMode);
        interactionModeLoaded = true;
      })
      .catch(() => {
        interactionModeLoaded = true;
      })
      .finally(() => {
        interactionModeLoadPromise = null;
      });
  }
  await interactionModeLoadPromise;
}

async function publishSnapshot(force = false): Promise<void> {
  if (!isTauri) return;
  const state = usePlayerStore.getState();
  const key = snapshotKey(state);
  if (!force && key === lastSnapshotKey) return;
  // Record the key only once the send succeeded. Committing it first meant one
  // rejected `emitTo` (window closing, transient IPC failure) suppressed that
  // snapshot permanently: the next publish computed the same key and returned,
  // so a paused player never recovered until something else changed the store.
  const sent = await emitTo(
    DESKTOP_LYRICS_LABEL,
    DESKTOP_LYRICS_STATE_EVENT,
    createSnapshot(state),
  )
    .then(() => true)
    .catch(() => false);
  if (sent) lastSnapshotKey = key;
}

async function publishAppearance(force = false): Promise<void> {
  if (!isTauri) return;
  const snapshot = createAppearanceSnapshot();
  const key = appearanceKey(snapshot);
  if (!force && key === lastAppearanceKey) return;
  // Same ordering rule as publishSnapshot: only remember the key once it landed.
  const sent = await emitTo(
    DESKTOP_LYRICS_LABEL,
    DESKTOP_LYRICS_APPEARANCE_EVENT,
    snapshot,
  )
    .then(() => true)
    .catch(() => false);
  if (sent) lastAppearanceKey = key;
}

async function publishInteraction(force = false): Promise<void> {
  if (!isTauri) return;
  const interactionMode = useDesktopLyricsStore.getState().interactionMode;
  if (!force && interactionMode === lastInteractionMode) return;
  const sent = await emitTo(
    DESKTOP_LYRICS_LABEL,
    DESKTOP_LYRICS_INTERACTION_EVENT,
    interactionMode,
  )
    .then(() => true)
    .catch(() => false);
  if (sent) lastInteractionMode = interactionMode;
}

export async function setDesktopLyricsInteractionMode(
  interactionMode: DesktopLyricsInteractionMode,
): Promise<void> {
  if (isTauri) await ensureInteractionModeLoaded();
  useDesktopLyricsStore.getState().setInteractionMode(interactionMode);
  if (!isTauri) return;
  await saveDesktopLyricsInteractionMode(interactionMode).catch(() => {});
  await invoke("set_lyrics_interaction", {
    interactive: interactionMode === "interactive",
  }).catch(() => {});
  await publishInteraction(true);
}

export async function openDesktopLyrics(): Promise<void> {
  if (!isTauri) return;
  if (!usePlayerStore.getState().currentSong) return;
  // Restore the persisted lock state unless auto-lock is on. The mode is saved to
  // disk (`desktopLyrics.json`) and hydrated into the store precisely so a lock
  // choice survives a close/reopen; forcing "interactive" here overwrote it, so
  // the setting could only ever mean "force locked" or "force unlocked".
  await ensureInteractionModeLoaded();
  const interactionMode = useSettingsStore.getState().autoLockDesktopLyrics
    ? "locked"
    : useDesktopLyricsStore.getState().interactionMode;
  await setDesktopLyricsInteractionMode(interactionMode);
  try {
    await invoke("show_lyrics_window", {
      interactive: interactionMode === "interactive",
    });
    useDesktopLyricsStore.getState().setVisible(true);
  } catch {
    return;
  }
  await Promise.all([
    publishSnapshot(true),
    publishAppearance(true),
    publishInteraction(true),
  ]);
}

export async function toggleDesktopLyricsVisibility(): Promise<void> {
  if (useDesktopLyricsStore.getState().isVisible) {
    await hideDesktopLyrics();
  } else {
    await openDesktopLyrics();
  }
}

export async function toggleDesktopLyricsInteraction(): Promise<void> {
  const state = useDesktopLyricsStore.getState();
  if (!state.isVisible) return;
  await setDesktopLyricsInteractionMode(
    state.interactionMode === "interactive" ? "locked" : "interactive",
  );
}

export async function hideDesktopLyrics(): Promise<void> {
  if (!isTauri) return;
  useDesktopLyricsStore.getState().setVisible(false);
  await invoke("hide_lyrics_window").catch(() => {});
}

export function startDesktopLyricsBridge(): () => void {
  if (!isTauri || bridgeStarted) return () => {};
  bridgeStarted = true;
  lastSnapshotKey = null;
  lastAppearanceKey = null;
  lastInteractionMode = null;

  let disposed = false;
  let unlistenRequest: (() => void) | undefined;
  let unlistenSetInteraction: (() => void) | undefined;
  let unlistenClosed: (() => void) | undefined;
  let unsubscribeTime: (() => void) | undefined;
  let pendingTime: number | null = null;
  let flushingTime = false;
  const unsubscribe = usePlayerStore.subscribe(() => {
    void publishSnapshot();
  });
  const unsubscribeTheme = useThemeStore.subscribe((state, previous) => {
    if (state.mode !== previous.mode || state.palette !== previous.palette) {
      void publishAppearance();
    }
  });
  const unsubscribeLang = useLangStore.subscribe((state, previous) => {
    if (state.lang !== previous.lang) void publishAppearance();
  });
  const unsubscribeSettings = useSettingsStore.subscribe((state, previous) => {
    if (
      state.desktopLyricsCapsuleVisible !==
        previous.desktopLyricsCapsuleVisible ||
      state.desktopLyricsTwoLines !== previous.desktopLyricsTwoLines ||
      state.desktopLyricsColor !== previous.desktopLyricsColor ||
      state.shortcuts.desktopLyricsLock !==
        previous.shortcuts.desktopLyricsLock ||
      state.shortcuts.desktopLyrics !== previous.shortcuts.desktopLyrics
    ) {
      void publishAppearance();
    }
  });
  const unsubscribeFonts = useFontStore.subscribe((state, previous) => {
    if (
      state.ui !== previous.ui ||
      state.desktopLyrics !== previous.desktopLyrics
    ) {
      void publishAppearance();
    }
  });

  const systemTheme = window.matchMedia?.("(prefers-color-scheme: dark)");
  const onSystemThemeChange = () => void publishAppearance(true);
  systemTheme?.addEventListener?.("change", onSystemThemeChange);

  const startTimeBridge = () => {
    if (unsubscribeTime) return;
    const flushTime = () => {
      if (flushingTime) return;
      flushingTime = true;
      void (async () => {
        try {
          while (
            pendingTime !== null &&
            useDesktopLyricsStore.getState().isVisible
          ) {
            const currentTime = pendingTime;
            pendingTime = null;
            await emitTo(
              DESKTOP_LYRICS_LABEL,
              DESKTOP_LYRICS_TIME_EVENT,
              currentTime,
            ).catch(() => {});
          }
        } finally {
          flushingTime = false;
          if (
            pendingTime !== null &&
            useDesktopLyricsStore.getState().isVisible
          ) {
            flushTime();
          }
        }
      })();
    };
    unsubscribeTime = audioPlayer.subscribeTime(() => {
      if (!useDesktopLyricsStore.getState().isVisible) return;
      pendingTime = getLyricTime();
      flushTime();
    });
  };
  const stopTimeBridge = () => {
    unsubscribeTime?.();
    unsubscribeTime = undefined;
    pendingTime = null;
  };
  const unsubscribeVisibility = useDesktopLyricsStore.subscribe(
    (state, previous) => {
      if (state.isVisible === previous.isVisible) return;
      if (state.isVisible) startTimeBridge();
      else stopTimeBridge();
    },
  );
  if (useDesktopLyricsStore.getState().isVisible) startTimeBridge();

  void listen<null>(DESKTOP_LYRICS_REQUEST_EVENT, () => {
    void Promise.all([
      ensureInteractionModeLoaded(),
      publishSnapshot(true),
      publishAppearance(true),
      publishInteraction(true),
    ]);
  }).then((unlisten) => {
    if (disposed) unlisten();
    else unlistenRequest = unlisten;
  });

  void listen<DesktopLyricsInteractionMode>(
    DESKTOP_LYRICS_SET_INTERACTION_EVENT,
    (event) => {
      void setDesktopLyricsInteractionMode(event.payload);
    },
  ).then((unlisten) => {
    if (disposed) unlisten();
    else unlistenSetInteraction = unlisten;
  });

  void listen<null>(DESKTOP_LYRICS_CLOSED_EVENT, () => {
    useDesktopLyricsStore.getState().setVisible(false);
  }).then((unlisten) => {
    if (disposed) unlisten();
    else unlistenClosed = unlisten;
  });

  void Promise.all([
    ensureInteractionModeLoaded(),
    publishSnapshot(true),
    publishAppearance(true),
    publishInteraction(true),
  ]);

  return () => {
    disposed = true;
    unsubscribe();
    unsubscribeTheme();
    unsubscribeLang();
    unsubscribeSettings();
    unsubscribeFonts();
    unsubscribeVisibility();
    stopTimeBridge();
    systemTheme?.removeEventListener?.("change", onSystemThemeChange);
    unlistenRequest?.();
    unlistenSetInteraction?.();
    unlistenClosed?.();
    unlistenRequest = undefined;
    unlistenSetInteraction = undefined;
    unlistenClosed = undefined;
    bridgeStarted = false;
    lastSnapshotKey = null;
    lastAppearanceKey = null;
    lastInteractionMode = null;
  };
}
