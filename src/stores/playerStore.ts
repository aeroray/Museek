import { create } from "zustand"
import { audioPlayer } from "@/lib/audio"
import { sourceRunner } from "@/lib/sourceRunner"
import { loadLyric } from "@/lib/lyric/loadLyric"
import {
  applyAudioSource,
  beginPlayGeneration,
  isPlayGenerationCurrent,
  resolvePlayableSrc,
  revokeCurrentObjectUrl,
} from "@/lib/playback"
import { notify } from "@/lib/notify"
import { updateMediaControls, attachMediaControls } from "@/lib/smtc"
import { setPreventSleep } from "@/lib/power"
import { useSettingsStore } from "@/stores/settingsStore"
import { t } from "@/lib/i18n"
import type { MusicInfo, LyricLine, Quality } from "@/types/music"
import type { QueueItem, PlayMode, PlayerStatus } from "@/types/player"

// Last play-state pushed to the OS media controls (avoids redundant updates).
let lastMediaPlaying = false

interface PlayerState {
  currentSong: MusicInfo | null
  currentQuality: Quality
  queue: QueueItem[]
  queueIndex: number
  playMode: PlayMode
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  muted: boolean
  status: PlayerStatus
  error: string | null
  lyricLines: LyricLine[]
  currentLyricIndex: number
  /** True while fetching/parsing lyrics for the current song (avoids empty→content flash). */
  lyricsLoading: boolean
  showQueue: boolean
  showLyrics: boolean
  currentPicUrl: string | null

  play: (song: MusicInfo, quality?: Quality) => Promise<void>
  playFromQueue: (index: number) => Promise<void>
  addToQueue: (songs: MusicInfo[]) => void
  playAll: (songs: MusicInfo[]) => void
  clearQueue: () => void
  next: () => Promise<void>
  prev: () => Promise<void>
  togglePlay: () => void
  seek: (time: number) => void
  setVolume: (v: number) => void
  setMuted: (m: boolean) => void
  setPlayMode: (mode: PlayMode) => void
  setShowQueue: (v: boolean) => void
  setShowLyrics: (v: boolean) => void

  // Internal
  _syncFromAudio: () => void
  _handleEnded: () => void
  _handleError: (msg: string) => void
  _loadLyric: (song: MusicInfo) => Promise<void>
  _loadPic: (song: MusicInfo) => Promise<void>
}

export const usePlayerStore = create<PlayerState>((set, get) => {
  // Wire audio callbacks once store is created
  setTimeout(() => {
    audioPlayer.setCallbacks({
      onStateChange: () => get()._syncFromAudio(),
      onEnded: () => get()._handleEnded(),
      onError: (msg) => get()._handleError(msg),
    })
    // Wire OS media-control buttons (taskbar thumbnail / media flyout) to playback.
    attachMediaControls({
      play: () => audioPlayer.play(),
      pause: () => audioPlayer.pause(),
      toggle: () => get().togglePlay(),
      next: () => get().next(),
      previous: () => get().prev(),
    })
  }, 0)

  return {
    currentSong: null,
    currentQuality: "128k",
    queue: [],
    queueIndex: -1,
    playMode: "sequence",
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    muted: false,
    status: "idle",
    error: null,
    lyricLines: [],
    currentLyricIndex: -1,
    lyricsLoading: false,
    showQueue: false,
    showLyrics: false,
    currentPicUrl: null,

    async play(song, quality) {
      const preferred = quality ?? useSettingsStore.getState().playQuality
      const gen = beginPlayGeneration()

      // No source loaded → can't resolve a playback URL. Prompt to import instead
      // of silently failing.
      if (!sourceRunner.isReady()) {
        notify({
          message: t("player.noSource"),
          variant: "error",
          actionLabel: t("player.goImport"),
          actionTo: "/settings",
        })
        return
      }

      // Immediately silence the previous track so switching feels instant — don't
      // let the old song keep playing while the new URL is being resolved.
      audioPlayer.pause()

      // status:"loading" must survive audio pause/timeupdate sync (see _syncFromAudio).
      // Clear progress so the bar reads as inactive while the new URL resolves.
      set({
        currentSong: song,
        currentQuality: preferred,
        status: "loading",
        error: null,
        lyricLines: [],
        currentLyricIndex: -1,
        lyricsLoading: true,
        currentPicUrl: null,
        currentTime: 0,
        duration: 0,
        isPlaying: false,
      })

      // Add to queue if not already there
      const { queue } = get()
      let idx = queue.findIndex((item) => item.music.id === song.id)
      if (idx === -1) {
        const newQueue = [...queue, { music: song, quality: preferred }]
        idx = newQueue.length - 1
        set({ queue: newQueue, queueIndex: idx })
      } else {
        set({ queueIndex: idx })
      }

      try {
        // Try the preferred quality, auto-downgrading until a source delivers a URL.
        const { url, quality: actual } = await sourceRunner.getMusicUrlAdaptive(song, preferred)
        if (!isPlayGenerationCurrent(gen)) return

        // Record the real quality on the now-playing queue item so its badge
        // reflects what actually played (and stays put when it's no longer active).
        set((s) => {
          const q = [...s.queue]
          if (q[idx]) q[idx] = { ...q[idx], playedQuality: actual }
          return { currentQuality: actual, queue: q }
        })
        if (actual !== preferred) {
          notify({
            message: t("player.qualityDowngraded", { quality: t(`quality.${actual}`) }),
            variant: "info",
          })
        }
        const settings = useSettingsStore.getState()
        const src = await resolvePlayableSrc(song, actual, url, {
          audioCache: settings.audioCache,
          maxCacheMB: settings.maxCacheMB,
        })
        if (!isPlayGenerationCurrent(gen)) return

        applyAudioSource(src)
        await audioPlayer.play()
        if (!isPlayGenerationCurrent(gen)) return

        // Publish to the OS media controls (taskbar / media flyout).
        lastMediaPlaying = true
        updateMediaControls(song.name, song.singer, song.albumName ?? "", song.meta.picUrl ?? null, true)
      } catch (err) {
        if (!isPlayGenerationCurrent(gen)) return
        const raw = (err as Error).message || t("player.err.unknown")
        // Transport-level failures from the source's HTTP request (DNS/TLS/connection)
        // surface as cryptic reqwest strings — give a clearer hint that it's a
        // network/proxy/source-reachability problem, not a bug in the song itself.
        const isNetwork =
          /sending request|trying to connect|dns|resolve|tls|handshake|timed out|timeout|connection/i.test(raw)
        const message = isNetwork ? t("player.err.network", { msg: raw }) : t("player.failedDetail", { msg: raw })
        set({ status: "error", error: message, lyricsLoading: false })
        notify({ message, variant: "error" })
        return
      }

      // Load lyric and pic in parallel, non-blocking
      get()._loadLyric(song)
      get()._loadPic(song)
    },

    async playFromQueue(index) {
      const item = get().queue[index]
      if (!item) return
      set({ queueIndex: index })
      await get().play(item.music, item.quality)
    },

    addToQueue(songs) {
      // Stamp queued items with the preferred quality from Settings (not the
      // last-played `currentQuality`, which defaults to 128k) so the configured
      // quality actually applies when these items play.
      const preferred = useSettingsStore.getState().playQuality
      set((s) => ({
        queue: [
          ...s.queue,
          ...songs
            .filter((song) => !s.queue.some((q) => q.music.id === song.id))
            .map((song) => ({ music: song, quality: preferred })),
        ],
      }))
    },

    clearQueue() {
      set({ queue: [], queueIndex: -1 })
    },

    // Replace the queue with `songs` and start playing. In shuffle mode it starts
    // from a RANDOM track — otherwise "play all" always begins at track 1 and
    // only shuffles from the second song onward.
    playAll(songs) {
      if (!songs.length) return
      get().clearQueue()
      get().addToQueue(songs)
      const startIdx = get().playMode === "shuffle" ? Math.floor(Math.random() * songs.length) : 0
      get().play(songs[startIdx])
    },

    async next() {
      const { queue, queueIndex, playMode } = get()
      if (!queue.length) return
      let nextIdx: number
      if (playMode === "shuffle") {
        nextIdx = Math.floor(Math.random() * queue.length)
      } else {
        nextIdx = (queueIndex + 1) % queue.length
      }
      await get().playFromQueue(nextIdx)
    },

    async prev() {
      const { queue, queueIndex } = get()
      if (!queue.length) return
      const prevIdx = (queueIndex - 1 + queue.length) % queue.length
      await get().playFromQueue(prevIdx)
    },

    togglePlay() {
      if (get().isPlaying) {
        audioPlayer.pause()
      } else {
        audioPlayer.play()
      }
    },

    seek(time) {
      audioPlayer.seek(time)
    },

    setVolume(v) {
      audioPlayer.setVolume(v)
      set({ volume: v })
    },

    setMuted(m) {
      audioPlayer.setMuted(m)
      set({ muted: m })
    },

    setPlayMode: (mode) => set({ playMode: mode }),
    setShowQueue: (v) => set({ showQueue: v }),
    setShowLyrics: (v) => set({ showLyrics: v }),

    _syncFromAudio() {
      const state = audioPlayer.getState()
      const { lyricLines, status: storeStatus } = get()

      let currentLyricIndex = -1
      if (lyricLines.length) {
        for (let i = lyricLines.length - 1; i >= 0; i--) {
          if (state.currentTime >= lyricLines[i].time) {
            currentLyricIndex = i
            break
          }
        }
      }

      // While resolving a playback URL, pause()/timeupdate would otherwise report
      // "paused" and wipe the intentional loading UI (play spinner + disabled seek).
      // Accept audio status only once playback actually starts (or buffers).
      const status =
        storeStatus === "loading" && state.status !== "playing" && state.status !== "loading"
          ? "loading"
          : storeStatus === "error"
            ? "error"
            : state.status

      // Use the *computed* status for isPlaying — if we keyed off storeStatus==="loading"
      // after already promoting status to "playing", one frame shows Play instead of Pause.
      set({
        isPlaying: status === "loading" ? false : state.isPlaying,
        currentTime: status === "loading" ? 0 : state.currentTime,
        duration: status === "loading" ? 0 : state.duration,
        status,
        currentLyricIndex,
      })

      // Keep the system awake only while actually playing (respecting the
      // setting). setPreventSleep de-dupes, so calling it every tick is cheap.
      setPreventSleep(state.isPlaying && useSettingsStore.getState().preventSleepWhilePlaying)

      // Keep the OS media controls' play/pause state in sync (only on change).
      if (state.isPlaying !== lastMediaPlaying) {
        lastMediaPlaying = state.isPlaying
        const song = get().currentSong
        if (song) {
          updateMediaControls(
            song.name,
            song.singer,
            song.albumName ?? "",
            get().currentPicUrl ?? song.meta.picUrl ?? null,
            state.isPlaying,
          )
        }
      }
    },

    _handleEnded() {
      const { playMode, queue, queueIndex } = get()
      if (playMode === "repeat-one") {
        audioPlayer.seek(0)
        audioPlayer.play()
        return
      }
      // Sequential mode stops at the end of the queue; list-loop wraps; shuffle
      // keeps picking. (next() itself wraps, so guard the end here.)
      if (playMode === "sequence" && queueIndex >= queue.length - 1) {
        // Reached the end → clear the now-playing state so the player returns to
        // idle instead of leaving the finished song sitting there looking paused.
        const finished = get().currentSong
        audioPlayer.stop()
        revokeCurrentObjectUrl()
        lastMediaPlaying = false
        if (finished) {
          updateMediaControls(
            finished.name,
            finished.singer,
            finished.albumName ?? "",
            get().currentPicUrl ?? finished.meta.picUrl ?? null,
            false,
          )
        }
        set({
          currentSong: null,
          queueIndex: -1,
          isPlaying: false,
          status: "idle",
          currentTime: 0,
          duration: 0,
          lyricLines: [],
          currentLyricIndex: -1,
          lyricsLoading: false,
          currentPicUrl: null,
        })
        return
      }
      get().next()
    },

    _handleError(msg) {
      set({ status: "error", error: msg, isPlaying: false })
    },

    async _loadLyric(song) {
      const songId = song.id
      set({ lyricsLoading: true })
      try {
        const lines = await loadLyric(song)
        if (get().currentSong?.id !== songId) return
        set({ lyricLines: lines, lyricsLoading: false })
      } catch {
        if (get().currentSong?.id !== songId) return
        set({ lyricLines: [], lyricsLoading: false })
      }
    },

    async _loadPic(song) {
      if (song.meta.picUrl) {
        set({ currentPicUrl: song.meta.picUrl })
        return
      }
      const picUrl = await sourceRunner.getPic({ source: song.source, action: "pic", info: song })
      if (picUrl) set({ currentPicUrl: picUrl })
    },
  }
})

// Preserve playback state across Vite HMR in dev. Without this, hot-reloading a
// module recreates the store with its initial state (currentSong=null, queue=[])
// while the module-level audio singleton keeps playing — so the player bar shows
// "nothing playing" mid-song. No effect in production (import.meta.hot is undefined
// and the block is tree-shaken away). Only data fields are restored, never actions.
if (import.meta.hot) {
  const saved = import.meta.hot.data.playerState as Partial<PlayerState> | undefined
  if (saved) usePlayerStore.setState(saved)
  import.meta.hot.dispose((data) => {
    const s = usePlayerStore.getState()
    data.playerState = {
      currentSong: s.currentSong,
      currentQuality: s.currentQuality,
      queue: s.queue,
      queueIndex: s.queueIndex,
      playMode: s.playMode,
      isPlaying: s.isPlaying,
      currentTime: s.currentTime,
      duration: s.duration,
      status: s.status,
      currentPicUrl: s.currentPicUrl,
      lyricLines: s.lyricLines,
      currentLyricIndex: s.currentLyricIndex,
      lyricsLoading: s.lyricsLoading,
      volume: s.volume,
      muted: s.muted,
    }
  })
}
