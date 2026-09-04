import { create } from "zustand";
import { audioPlayer } from "@/lib/audio";
import { readData, writeData } from "@/lib/db";
import { sourceRunner } from "@/lib/sourceRunner";
import { loadLyric } from "@/lib/lyrics";
import { localFileToObjectUrl, mapLocalPlayError } from "@/lib/localMusic";
import {
  applyAudioSource,
  beginPlayGeneration,
  findBestCachedSrc,
  findCachedMeetingPreferred,
  findCachedPlayableSrc,
  isPlayGenerationCurrent,
  rememberQualityUpgradeMiss,
  resolvePlayableSrc,
  revokeCurrentObjectUrl,
  shouldAttemptQualityUpgrade,
} from "@/lib/playback";
import { qualityMeets } from "@/lib/quality";
import {
  clampResumeTime,
  flushPlaybackSessionWrite,
  intervalToSeconds,
  readPlaybackSession,
  schedulePlaybackSessionWrite,
  type PlaybackSession,
} from "@/lib/playbackSession";
import { notify } from "@/lib/notify";
import { updateMediaControls, attachMediaControls } from "@/lib/smtc";
import { setPreventSleep } from "@/lib/power";
import { useLocalMusicStore } from "@/stores/localMusicStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { t } from "@/lib/i18n";
import type { MusicInfo, LyricLine, Quality } from "@/types/music";
import type { QueueItem, PlayMode, PlayerStatus } from "@/types/player";

// Last play-state pushed to the OS media controls (avoids redundant updates).
let lastMediaPlaying = false;

const PLAY_START_TIMEOUT_MS = 10_000;
/** Device-local volume/mute — deliberately excluded from config sync. */
const PLAYER_PREFS_FILE = "player.json";
/** Keep restored duration/status until a real audio source is attached. */
let holdRestoredClock = false;
/** Resume offset for a restored song if play() races source hydration. */
let sessionResumeAt = 0;
let sessionResumeSongId: string | null = null;
let restoreSourcePromise: Promise<void> | null = null;

type PlayerPrefs = {
  volume: number;
  muted: boolean;
};

function clampVolume(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return Math.max(0, Math.min(1, v));
}

function persistPlayerPrefs(volume: number, muted: boolean) {
  writeData(PLAYER_PREFS_FILE, { volume, muted } satisfies PlayerPrefs);
}

function snapshotPlaybackSession(): PlaybackSession {
  const s = usePlayerStore.getState();
  return {
    version: 1,
    queue: s.queue,
    queueIndex: s.queueIndex,
    currentSong: s.currentSong,
    currentQuality: s.currentQuality,
    playMode: s.playMode,
    currentTime: audioPlayer.getCurrentTime(),
    duration: s.duration,
  };
}

function persistPlaybackSession(immediate = false) {
  schedulePlaybackSessionWrite(snapshotPlaybackSession(), immediate);
}

function consumeResume(songId: string): number {
  if (sessionResumeSongId !== songId) return 0;
  return sessionResumeAt;
}

function clearResume() {
  sessionResumeAt = 0;
  sessionResumeSongId = null;
}

let lyricLoadGen = 0;

function invalidateLyricLoad() {
  lyricLoadGen += 1;
}

/** After a local file starts, apply on-disk tags/lyrics. Do not search online unless already matched. */
function loadLocalMetaAfterPlay(
  song: MusicInfo,
  hydrateP: Promise<MusicInfo | null>,
  isCurrent: () => boolean,
) {
  void (async () => {
    if (!isCurrent()) return;
    usePlayerStore.getState()._loadLyric(song);

    const hydrated = await hydrateP;
    if (!isCurrent()) return;
    const next =
      useLocalMusicStore.getState().tracks.find((item) => item.id === song.id)
        ?.song ??
      hydrated ??
      usePlayerStore.getState().currentSong ??
      song;
    const player = usePlayerStore.getState();
    if (player.currentSong?.id !== song.id) return;
    usePlayerStore.setState({
      currentSong: next,
      queue: player.queue.map((item) =>
        item.music.id === song.id ? { ...item, music: next } : item,
      ),
    });
    void player._loadPic(next);
    void player._loadLyric(next);
  })();
}

function playWithTimeout(): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(t("player.err.playTimeout"))),
      PLAY_START_TIMEOUT_MS,
    );
    audioPlayer.play().then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** Map engine/DOM exceptions so the toast is readable, not a WebView string. */
function formatRemotePlayError(raw: string): string {
  if (
    raw === t("player.err.playTimeout") ||
    raw === t("player.err.invalidAudio") ||
    raw === t("player.err.unknown")
  ) {
    return raw;
  }
  if (
    /sending request|trying to connect|dns|resolve|tls|handshake|timed out|timeout|connection/i.test(
      raw,
    )
  ) {
    return t("player.err.network", { msg: raw });
  }
  // HTMLAudio / Web Audio NotSupportedError, decode failures, empty bodies.
  if (
    /not supported|unable to decode|encodingerror|no supported source|media_element_error|format error|empty audio/i.test(
      raw,
    )
  ) {
    return t("player.err.invalidAudio");
  }
  return t("player.failedDetail", { msg: raw });
}

interface PlayerState {
  currentSong: MusicInfo | null;
  currentQuality: Quality;
  queue: QueueItem[];
  queueIndex: number;
  playMode: PlayMode;
  isPlaying: boolean;
  duration: number;
  volume: number;
  muted: boolean;
  status: PlayerStatus;
  error: string | null;
  lyricLines: LyricLine[];
  /** True while fetching/parsing lyrics for the current song (avoids empty→content flash). */
  lyricsLoading: boolean;
  showQueue: boolean;
  showLyrics: boolean;
  /** True while the main window is morphing into the mini player shell. */
  miniMode: boolean;
  /** True while enter/exit mini is animating — content stays blurred until done. */
  miniMorphing: boolean;
  /** Mini bar collapsed to cover-only while docked at a screen edge. */
  miniPeek: boolean;
  /** Which edge is in the magnetic dock zone (hint while dragging / before peek). */
  miniDockHint: "left" | "right" | "top" | "bottom" | null;
  currentPicUrl: string | null;
  /** True once a playable audio source is attached (cache, local file, or stream). */
  sourceReady: boolean;
  /** True while togglePlay is waiting (restore, decode, or URL resolve). */
  playPending: boolean;

  play: (song: MusicInfo, quality?: Quality) => Promise<void>;
  playFromQueue: (index: number) => Promise<void>;
  addToQueue: (songs: MusicInfo[]) => void;
  playAll: (songs: MusicInfo[]) => void;
  clearQueue: () => void;
  /** Drop songs from the queue; stop playback if the current track is among them. */
  removeSongsFromPlayback: (ids: string[]) => void;
  next: () => Promise<void>;
  prev: () => Promise<void>;
  togglePlay: () => void;
  seek: (time: number) => void;
  setVolume: (v: number) => void;
  setMuted: (m: boolean) => void;
  setPlayMode: (mode: PlayMode) => void;
  setShowQueue: (v: boolean) => void;
  setShowLyrics: (v: boolean) => void;
  /** Restore volume/mute and the last queue / now-playing song from disk. */
  loadFromDisk: () => Promise<void>;
  /** Attach a cached or local file for the restored song without autoplay. */
  restorePlaybackSource: () => Promise<void>;

  // Internal
  _syncFromAudio: () => void;
  _handleEnded: () => void;
  _handleError: (msg: string) => void;
  _loadLyric: (song: MusicInfo) => Promise<void>;
  _loadPic: (song: MusicInfo) => Promise<void>;
}

export const usePlayerStore = create<PlayerState>((set, get) => {
  // Wire audio callbacks once store is created
  setTimeout(() => {
    audioPlayer.setCallbacks({
      onStateChange: () => get()._syncFromAudio(),
      onEnded: () => get()._handleEnded(),
      onError: (msg) => get()._handleError(msg),
    });
    // Wire OS media-control buttons (taskbar thumbnail / media flyout) to playback.
    attachMediaControls({
      play: () => {
        if (!get().isPlaying) get().togglePlay();
      },
      pause: () => audioPlayer.pause(),
      toggle: () => get().togglePlay(),
      next: () => get().next(),
      previous: () => get().prev(),
      seek: (seconds) => get().seek(seconds),
      seekBy: (delta) => get().seek(audioPlayer.getCurrentTime() + delta),
    });
  }, 0);

  return {
    currentSong: null,
    currentQuality: "128k",
    queue: [],
    queueIndex: -1,
    playMode: "sequence",
    isPlaying: false,
    duration: 0,
    volume: 1,
    muted: false,
    status: "idle",
    error: null,
    lyricLines: [],
    lyricsLoading: false,
    showQueue: false,
    showLyrics: false,
    miniMode: false,
    miniMorphing: false,
    miniPeek: false,
    miniDockHint: null,
    currentPicUrl: null,
    sourceReady: false,
    playPending: false,

    async play(song, quality) {
      if (restoreSourcePromise) await restoreSourcePromise;
      if (song.id !== sessionResumeSongId) clearResume();
      const preferred = quality ?? useSettingsStore.getState().playQuality;
      const gen = beginPlayGeneration();
      const isLocal = song.source === "local";

      // No source loaded → can't resolve a playback URL. Prompt to import instead
      // of silently failing. Local files play from disk and need no lx source.
      if (!isLocal && !sourceRunner.isReady()) {
        notify({
          message: t("player.noSource"),
          variant: "error",
          actionLabel: t("player.goImport"),
          actionTo: "/settings",
        });
        return;
      }

      // Immediately silence the previous track so switching feels instant — don't
      // let the old song keep playing while the new URL is being resolved.
      audioPlayer.pause();
      invalidateLyricLoad();

      // status:"loading" must survive audio pause/timeupdate sync (see _syncFromAudio).
      // Clear progress so the bar reads as inactive while the new URL resolves.
      set({
        currentSong: song,
        currentQuality: preferred,
        status: "loading",
        error: null,
        lyricLines: [],
        lyricsLoading: true,
        currentPicUrl: song.meta.picUrl ?? null,
        duration: 0,
        isPlaying: false,
        sourceReady: false,
      });

      // Add to queue if not already there
      const { queue } = get();
      let idx = queue.findIndex((item) => item.music.id === song.id);
      if (idx === -1) {
        const newQueue = [...queue, { music: song, quality: preferred }];
        idx = newQueue.length - 1;
        set({ queue: newQueue, queueIndex: idx });
      } else {
        set({ queueIndex: idx });
      }
      persistPlaybackSession(true);

      try {
        if (isLocal) {
          const filePath = song.meta.filePath;
          if (!filePath) throw new Error(t("local.missingPath"));
          const hydrateP = useLocalMusicStore
            .getState()
            .hydrateTrackOnPlay(song.id);
          const src = await localFileToObjectUrl(filePath);
          if (!isPlayGenerationCurrent(gen)) return;
          const best = song.meta.qualitys[0]?.type ?? preferred;
          set((s) => {
            const q = [...s.queue];
            if (q[idx]) q[idx] = { ...q[idx], playedQuality: best };
            return { currentQuality: best, queue: q };
          });
          applyAudioSource(src);
          holdRestoredClock = false;
          const resumeAt = consumeResume(song.id);
          if (resumeAt > 0) {
            await audioPlayer.whenReady();
            audioPlayer.seek(resumeAt);
          }
          set({ sourceReady: true });
          persistPlaybackSession(true);
          await playWithTimeout();
          if (!isPlayGenerationCurrent(gen)) return;
          lastMediaPlaying = true;
          updateMediaControls(
            song.name,
            song.singer,
            song.albumName ?? "",
            song.meta.picUrl ?? null,
            true,
          );
          useLocalMusicStore.getState().setTrackUnavailable(song.id, false);
          loadLocalMetaAfterPlay(song, hydrateP, () => {
            return (
              isPlayGenerationCurrent(gen) && get().currentSong?.id === song.id
            );
          });
          return;
        }

        const settings = useSettingsStore.getState();

        const meeting = await findCachedMeetingPreferred(
          song,
          preferred,
          settings.audioCache,
        );
        if (!isPlayGenerationCurrent(gen)) return;
        const lower = meeting
          ? null
          : await findBestCachedSrc(song, settings.audioCache);
        if (!isPlayGenerationCurrent(gen)) return;

        let src: string;
        let actual: Quality;
        let fromCache = false;

        if (meeting) {
          src = meeting.src;
          actual = meeting.quality;
          fromCache = true;
        } else if (lower && !shouldAttemptQualityUpgrade(song, preferred)) {
          src = lower.src;
          actual = lower.quality;
          fromCache = true;
        } else {
          try {
            const resolved = await sourceRunner.getMusicUrlAdaptive(
              song,
              preferred,
              lower ? { betterThan: lower.quality } : undefined,
            );
            if (!isPlayGenerationCurrent(gen)) return;
            actual = resolved.quality;
            if (!qualityMeets(actual, preferred)) {
              rememberQualityUpgradeMiss(song, preferred);
            }
            src = await resolvePlayableSrc(song, actual, resolved.url, {
              audioCache: settings.audioCache,
              maxCacheMB: settings.maxCacheMB,
            });
            if (!isPlayGenerationCurrent(gen)) return;
          } catch (err) {
            if (!lower) throw err;
            rememberQualityUpgradeMiss(song, preferred);
            src = lower.src;
            actual = lower.quality;
            fromCache = true;
          }
        }

        set((s) => {
          const q = [...s.queue];
          if (q[idx]) q[idx] = { ...q[idx], playedQuality: actual };
          return { currentQuality: actual, queue: q };
        });
        if (!fromCache && actual !== preferred) {
          notify({
            message: t("player.qualityDowngraded", {
              quality: t(`quality.${actual}`),
            }),
            variant: "info",
          });
        }
        applyAudioSource(src);
        holdRestoredClock = false;
        if (fromCache) {
          const resumeAt = consumeResume(song.id);
          if (resumeAt > 0) {
            await audioPlayer.whenReady();
            audioPlayer.seek(resumeAt);
          }
        } else {
          clearResume();
        }
        set({ sourceReady: true });
        persistPlaybackSession(true);
        await playWithTimeout();
        if (!isPlayGenerationCurrent(gen)) return;

        lastMediaPlaying = true;
        updateMediaControls(
          song.name,
          song.singer,
          song.albumName ?? "",
          song.meta.picUrl ?? null,
          true,
        );
      } catch (err) {
        if (!isPlayGenerationCurrent(gen)) return;
        const raw = (err as Error).message || t("player.err.unknown");
        // Local missing/unreadable files: clear copy, not "播放失败：File not found".
        // Also reset the player bar — leaving the broken track as "current" looks paused.
        if (isLocal) {
          if (raw === t("player.err.playTimeout")) {
            set({ status: "error", error: raw, lyricsLoading: false });
            notify({ message: raw, variant: "error" });
            return;
          }
          const message = mapLocalPlayError(err);
          useLocalMusicStore.getState().setTrackUnavailable(song.id, true);
          const failed = get().currentSong;
          audioPlayer.stop();
          revokeCurrentObjectUrl();
          lastMediaPlaying = false;
          if (failed) {
            updateMediaControls(
              failed.name,
              failed.singer,
              failed.albumName ?? "",
              get().currentPicUrl ?? failed.meta.picUrl ?? null,
              false,
            );
          }
          set({
            currentSong: null,
            queueIndex: -1,
            isPlaying: false,
            status: "idle",
            error: null,
            duration: 0,
            lyricLines: [],
            lyricsLoading: false,
            currentPicUrl: null,
            showLyrics: false,
            sourceReady: false,
          });
          persistPlaybackSession(true);
          notify({ message, variant: "error" });
          return;
        }
        const isTimeout = raw === t("player.err.playTimeout");
        const message = isTimeout ? raw : formatRemotePlayError(raw);
        audioPlayer.stop();
        revokeCurrentObjectUrl();
        lastMediaPlaying = false;
        set({
          status: "error",
          error: message,
          lyricsLoading: false,
          isPlaying: false,
          playPending: false,
          sourceReady: false,
        });
        notify({ message, variant: "error" });
        return;
      }

      // Load lyric and pic in parallel, non-blocking
      get()._loadLyric(song);
      get()._loadPic(song);
    },

    async playFromQueue(index) {
      const item = get().queue[index];
      if (!item) return;
      set({ queueIndex: index });
      await get().play(item.music, item.quality);
    },

    addToQueue(songs) {
      // Stamp queued items with the preferred quality from Settings (not the
      // last-played `currentQuality`, which defaults to 128k) so the configured
      // quality actually applies when these items play.
      const preferred = useSettingsStore.getState().playQuality;
      set((s) => ({
        queue: [
          ...s.queue,
          ...songs
            .filter((song) => !s.queue.some((q) => q.music.id === song.id))
            .map((song) => ({ music: song, quality: preferred })),
        ],
      }));
      persistPlaybackSession(true);
    },

    clearQueue() {
      set({ queue: [], queueIndex: -1 });
      persistPlaybackSession(true);
    },

    removeSongsFromPlayback(ids) {
      if (!ids.length) return;
      const idSet = new Set(ids);
      const { currentSong, queue, queueIndex } = get();
      const droppingCurrent = !!currentSong && idSet.has(currentSong.id);
      const nextQueue = queue.filter((item) => !idSet.has(item.music.id));
      if (!droppingCurrent && nextQueue.length === queue.length) return;

      if (droppingCurrent) {
        beginPlayGeneration();
        audioPlayer.stop();
        revokeCurrentObjectUrl();
        lastMediaPlaying = false;
        updateMediaControls(
          currentSong.name,
          currentSong.singer,
          currentSong.albumName ?? "",
          get().currentPicUrl ?? currentSong.meta.picUrl ?? null,
          false,
        );
        set({
          currentSong: null,
          queue: nextQueue,
          queueIndex: -1,
          isPlaying: false,
          status: "idle",
          error: null,
          duration: 0,
          lyricLines: [],
          lyricsLoading: false,
          currentPicUrl: null,
          showLyrics: false,
          sourceReady: false,
        });
        persistPlaybackSession(true);
        return;
      }

      const playingId = queue[queueIndex]?.music.id;
      const nextIndex = playingId
        ? nextQueue.findIndex((item) => item.music.id === playingId)
        : -1;
      set({
        queue: nextQueue,
        queueIndex: nextIndex,
      });
      persistPlaybackSession(true);
    },

    // Append `songs` to the current queue (deduped) and start playing. In shuffle
    // mode it starts from a RANDOM track of the selection — otherwise the first.
    playAll(songs) {
      if (!songs.length) return;
      get().addToQueue(songs);
      const startIdx =
        get().playMode === "shuffle"
          ? Math.floor(Math.random() * songs.length)
          : 0;
      get().play(songs[startIdx]);
    },

    async next() {
      const { queue, queueIndex, playMode } = get();
      if (!queue.length) return;
      let nextIdx: number;
      if (playMode === "shuffle") {
        nextIdx = Math.floor(Math.random() * queue.length);
      } else {
        nextIdx = (queueIndex + 1) % queue.length;
      }
      await get().playFromQueue(nextIdx);
    },

    async prev() {
      const { queue, queueIndex } = get();
      if (!queue.length) return;
      const prevIdx = (queueIndex - 1 + queue.length) % queue.length;
      await get().playFromQueue(prevIdx);
    },

    togglePlay() {
      if (get().isPlaying) {
        audioPlayer.pause();
        persistPlaybackSession(true);
        return;
      }
      if (get().status === "loading" || get().playPending) return;
      void (async () => {
        set({ playPending: true });
        try {
          if (restoreSourcePromise) await restoreSourcePromise;
          const song = get().currentSong;
          const preferred = useSettingsStore.getState().playQuality;
          if (
            song &&
            song.source !== "local" &&
            !qualityMeets(get().currentQuality, preferred) &&
            shouldAttemptQualityUpgrade(song, preferred)
          ) {
            await get().play(song, preferred);
            return;
          }
          if (audioPlayer.hasSource()) {
            await audioPlayer.play();
            return;
          }
          if (song) await get().play(song, preferred);
        } catch (err) {
          if (get().status === "loading") return;
          get()._handleError(
            formatRemotePlayError(
              (err as Error).message || t("player.err.unknown"),
            ),
          );
        } finally {
          set({ playPending: false });
        }
      })();
    },

    seek(time) {
      audioPlayer.seek(time);
      persistPlaybackSession(true);
    },

    setVolume(v) {
      const volume = clampVolume(v);
      audioPlayer.setVolume(volume);
      set({ volume });
      persistPlayerPrefs(volume, get().muted);
    },

    setMuted(m) {
      audioPlayer.setMuted(m);
      set({ muted: m });
      persistPlayerPrefs(get().volume, m);
    },

    setPlayMode: (mode) => {
      set({ playMode: mode });
      persistPlaybackSession(true);
    },
    setShowQueue: (v) => set({ showQueue: v }),
    setShowLyrics: (v) => {
      if (v && get().lyricLines.length === 0) return;
      set({ showLyrics: v });
    },

    async loadFromDisk() {
      const data = await readData<Partial<PlayerPrefs>>(PLAYER_PREFS_FILE, {});
      const volume =
        typeof data.volume === "number" ? clampVolume(data.volume) : 1;
      const muted = typeof data.muted === "boolean" ? data.muted : false;
      audioPlayer.setVolume(volume);
      audioPlayer.setMuted(muted);

      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
          persistPlaybackSession(true);
          flushPlaybackSessionWrite();
        }
      });

      const session = await readPlaybackSession();
      if (!session?.currentSong && !session?.queue.length) {
        set({ volume, muted });
        return;
      }

      const duration =
        session.duration > 0
          ? session.duration
          : intervalToSeconds(session.currentSong?.interval);
      sessionResumeSongId = session.currentSong?.id ?? null;
      sessionResumeAt = session.currentSong
        ? clampResumeTime(session.currentTime, duration)
        : 0;
      holdRestoredClock = !!session.currentSong;
      set({
        volume,
        muted,
        queue: session.queue,
        queueIndex: session.queueIndex,
        currentSong: session.currentSong,
        currentQuality: session.currentQuality,
        playMode: session.playMode,
        duration,
        status: session.currentSong ? "paused" : "idle",
        isPlaying: false,
        sourceReady: false,
        currentPicUrl: session.currentSong?.meta.picUrl ?? null,
        lyricLines: [],
        lyricsLoading: Boolean(session.currentSong),
      });
      if (session.currentSong) {
        if (session.currentSong.source !== "local") {
          void get()._loadLyric(session.currentSong);
        }
        void get()._loadPic(session.currentSong);
      }
    },

    async restorePlaybackSource() {
      if (restoreSourcePromise) return restoreSourcePromise;
      restoreSourcePromise = (async () => {
        const song = get().currentSong;
        if (!song) {
          holdRestoredClock = false;
          clearResume();
          return;
        }
        if (song.source !== "local") {
          void get()._loadLyric(song);
        }
        const resumeAt = sessionResumeAt;
        try {
          if (song.source === "local") {
            const filePath = song.meta.filePath;
            if (!filePath) throw new Error("missing");
            const hydrateP = useLocalMusicStore
              .getState()
              .hydrateTrackOnPlay(song.id);
            const src = await localFileToObjectUrl(filePath);
            if (get().currentSong?.id !== song.id) return;
            await audioPlayer.preparePausedSource(src, resumeAt);
            holdRestoredClock = false;
            clearResume();
            set({
              sourceReady: true,
              status: "paused",
              isPlaying: false,
              duration: audioPlayer.getState().duration || get().duration,
            });
            persistPlaybackSession(true);
            lastMediaPlaying = false;
            updateMediaControls(
              song.name,
              song.singer,
              song.albumName ?? "",
              get().currentPicUrl ?? song.meta.picUrl ?? null,
              false,
            );
            loadLocalMetaAfterPlay(song, hydrateP, () => {
              return get().currentSong?.id === song.id;
            });
            return;
          }

          const settings = useSettingsStore.getState();
          const cached = await findCachedPlayableSrc(
            song,
            get().currentQuality,
            settings.audioCache,
          );
          if (get().currentSong?.id !== song.id) return;
          if (!cached) {
            holdRestoredClock = true;
            clearResume();
            set({ sourceReady: false, status: "paused", isPlaying: false });
            return;
          }

          await audioPlayer.preparePausedSource(cached.src, resumeAt);
          holdRestoredClock = false;
          clearResume();
          set({
            sourceReady: true,
            currentQuality: cached.quality,
            status: "paused",
            isPlaying: false,
            duration: audioPlayer.getState().duration || get().duration,
          });
          persistPlaybackSession(true);
          lastMediaPlaying = false;
          updateMediaControls(
            song.name,
            song.singer,
            song.albumName ?? "",
            get().currentPicUrl ?? song.meta.picUrl ?? null,
            false,
          );
        } catch {
          if (get().currentSong?.id !== song.id) return;
          holdRestoredClock = true;
          clearResume();
          set({ sourceReady: false, status: "paused", isPlaying: false });
        }
      })().finally(() => {
        restoreSourcePromise = null;
      });
      return restoreSourcePromise;
    },

    _syncFromAudio() {
      const state = audioPlayer.getState();
      const { status: storeStatus } = get();

      if (holdRestoredClock && !audioPlayer.hasSource()) {
        return;
      }

      // While resolving a playback URL, pause()/timeupdate would otherwise report
      // "paused" and wipe the intentional loading UI (play spinner + disabled seek).
      // Accept audio status only once playback actually starts (or buffers).
      const status =
        storeStatus === "loading" &&
        state.status !== "playing" &&
        state.status !== "loading"
          ? "loading"
          : storeStatus === "error"
            ? "error"
            : state.status;

      // Use the *computed* status for isPlaying — if we keyed off storeStatus==="loading"
      // after already promoting status to "playing", one frame shows Play instead of Pause.
      set({
        isPlaying:
          status === "loading" || status === "error" ? false : state.isPlaying,
        duration: status === "loading" ? 0 : state.duration || get().duration,
        status,
        playPending:
          status === "playing" || status === "error" ? false : get().playPending,
      });

      if (status === "playing") persistPlaybackSession(false);
      else if (status === "paused") persistPlaybackSession(true);

      // Keep the system awake only while actually playing (respecting the
      // setting). setPreventSleep de-dupes, so calling it every tick is cheap.
      setPreventSleep(
        state.isPlaying && useSettingsStore.getState().preventSleepWhilePlaying,
      );

      // Keep the OS media controls' play/pause state in sync (only on change).
      if (state.isPlaying !== lastMediaPlaying) {
        lastMediaPlaying = state.isPlaying;
        const song = get().currentSong;
        if (song) {
          updateMediaControls(
            song.name,
            song.singer,
            song.albumName ?? "",
            get().currentPicUrl ?? song.meta.picUrl ?? null,
            state.isPlaying,
          );
        }
      }
    },

    _handleEnded() {
      const { playMode, queue, queueIndex } = get();
      if (playMode === "repeat-one") {
        audioPlayer.seek(0);
        audioPlayer.play();
        return;
      }
      // Sequential mode stops at the end of the queue; list-loop wraps; shuffle
      // keeps picking. (next() itself wraps, so guard the end here.)
      if (playMode === "sequence" && queueIndex >= queue.length - 1) {
        // Reached the end → clear the now-playing state so the player returns to
        // idle instead of leaving the finished song sitting there looking paused.
        const finished = get().currentSong;
        audioPlayer.stop();
        revokeCurrentObjectUrl();
        lastMediaPlaying = false;
        if (finished) {
          updateMediaControls(
            finished.name,
            finished.singer,
            finished.albumName ?? "",
            get().currentPicUrl ?? finished.meta.picUrl ?? null,
            false,
          );
        }
        set({
          currentSong: null,
          queueIndex: -1,
          isPlaying: false,
          status: "idle",
          duration: 0,
          lyricLines: [],
          lyricsLoading: false,
          currentPicUrl: null,
          showLyrics: false,
          sourceReady: false,
          playPending: false,
        });
        persistPlaybackSession(true);
        return;
      }
      get().next();
    },

    _handleError(msg) {
      audioPlayer.stop();
      revokeCurrentObjectUrl();
      lastMediaPlaying = false;
      set({
        status: "error",
        error: formatRemotePlayError(msg),
        isPlaying: false,
        playPending: false,
        sourceReady: false,
      });
    },

    async _loadLyric(song) {
      const songId = song.id;
      const gen = ++lyricLoadGen;
      set({ lyricsLoading: true });
      try {
        const lines = await loadLyric(song);
        if (gen !== lyricLoadGen || get().currentSong?.id !== songId) return;
        set({
          lyricLines: lines,
          lyricsLoading: false,
          ...(lines.length === 0 ? { showLyrics: false } : {}),
        });
      } catch {
        if (gen !== lyricLoadGen || get().currentSong?.id !== songId) return;
        set({ lyricLines: [], lyricsLoading: false, showLyrics: false });
      }
    },

    async _loadPic(song) {
      if (song.meta.picUrl) {
        set({ currentPicUrl: song.meta.picUrl });
        return;
      }
      // Local embedded covers are stored under AppData; resolve if we only have the rel path.
      if (song.source === "local" && song.meta.localCoverRel) {
        const { resolveLocalCoverUrl } = await import("@/lib/localMusic");
        const localUrl = await resolveLocalCoverUrl(song.meta.localCoverRel);
        if (localUrl) {
          set({ currentPicUrl: localUrl });
          return;
        }
      }
      if (song.source === "local") return;
      const picUrl = await sourceRunner.getPic({
        source: song.source,
        action: "pic",
        info: song,
      });
      if (picUrl) set({ currentPicUrl: picUrl });
    },
  };
});

// Preserve playback state across Vite HMR in dev. Without this, hot-reloading a
// module recreates the store with its initial state (currentSong=null, queue=[])
// while the module-level audio singleton keeps playing — so the player bar shows
// "nothing playing" mid-song. No effect in production (import.meta.hot is undefined
// and the block is tree-shaken away). Only data fields are restored, never actions.
if (import.meta.hot) {
  const saved = import.meta.hot.data.playerState as
    | Partial<PlayerState>
    | undefined;
  if (saved) usePlayerStore.setState(saved);
  import.meta.hot.dispose((data) => {
    const s = usePlayerStore.getState();
    data.playerState = {
      currentSong: s.currentSong,
      currentQuality: s.currentQuality,
      queue: s.queue,
      queueIndex: s.queueIndex,
      playMode: s.playMode,
      isPlaying: s.isPlaying,
      duration: s.duration,
      status: s.status,
      currentPicUrl: s.currentPicUrl,
      lyricLines: s.lyricLines,
      lyricsLoading: s.lyricsLoading,
      volume: s.volume,
      muted: s.muted,
    };
  });
}
