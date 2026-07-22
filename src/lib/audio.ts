import type { PlayerStatus } from "@/types/player"

export interface AudioState {
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  muted: boolean
  status: PlayerStatus
}

type AudioCallback = (state: AudioState) => void
type EndedCallback = () => void
type ErrorCallback = (msg: string) => void
type TimeCallback = (currentTime: number) => void

class AudioPlayer {
  private audio: HTMLAudioElement
  private onStateChange: AudioCallback | null = null
  private onEnded: EndedCallback | null = null
  private onError: ErrorCallback | null = null
  /** Smooth clock listeners (rAF while playing). */
  private timeListeners = new Set<TimeCallback>()
  private timeRaf = 0

  constructor() {
    this.audio = new Audio()
    this.audio.preload = "auto"
    // NetEase and similar CDNs hotlink-check Referer; never send the app origin.
    this.audio.setAttribute("referrerpolicy", "no-referrer")
    this.bindEvents()
  }

  private bindEvents() {
    const notify = () => this.onStateChange?.(this.getState())

    this.audio.addEventListener("play", () => {
      notify()
      this.startSmoothClock()
    })
    this.audio.addEventListener("pause", () => {
      notify()
      this.stopSmoothClock()
      this.emitTime()
    })
    this.audio.addEventListener("timeupdate", notify)
    this.audio.addEventListener("waiting", notify)
    this.audio.addEventListener("canplay", notify)
    this.audio.addEventListener("loadedmetadata", notify)
    this.audio.addEventListener("volumechange", notify)
    this.audio.addEventListener("ended", () => {
      this.stopSmoothClock()
      notify()
      this.onEnded?.()
    })
    this.audio.addEventListener("error", () => {
      this.stopSmoothClock()
      this.onError?.(this.audio.error?.message ?? "Playback error")
    })
  }

  private emitTime() {
    const t = this.audio.currentTime
    for (const cb of this.timeListeners) cb(t)
  }

  private startSmoothClock() {
    if (this.timeRaf || this.timeListeners.size === 0) return
    const tick = () => {
      this.emitTime()
      if (!this.audio.paused && !this.audio.ended) {
        this.timeRaf = requestAnimationFrame(tick)
      } else {
        this.timeRaf = 0
      }
    }
    this.timeRaf = requestAnimationFrame(tick)
  }

  private stopSmoothClock() {
    if (!this.timeRaf) return
    cancelAnimationFrame(this.timeRaf)
    this.timeRaf = 0
  }

  /**
   * Subscribe to a smooth playback clock (~rAF while playing).
   * Prefer this over reading the element from UI — keeps the audio seam private.
   */
  subscribeTime(cb: TimeCallback): () => void {
    this.timeListeners.add(cb)
    cb(this.audio.currentTime)
    if (!this.audio.paused && !this.audio.ended) this.startSmoothClock()
    return () => {
      this.timeListeners.delete(cb)
      if (this.timeListeners.size === 0) this.stopSmoothClock()
    }
  }

  setCallbacks(callbacks: {
    onStateChange?: AudioCallback
    onEnded?: EndedCallback
    onError?: ErrorCallback
  }) {
    this.onStateChange = callbacks.onStateChange ?? null
    this.onEnded = callbacks.onEnded ?? null
    this.onError = callbacks.onError ?? null
  }

  setSource(url: string) {
    this.audio.src = url
    this.audio.load()
  }

  play(): Promise<void> {
    return this.audio.play()
  }

  pause() {
    this.audio.pause()
  }

  // Fully stop: pause, drop the source, and reset the element to an idle state.
  // Used when the queue finishes so nothing is left loaded/paused.
  stop() {
    this.audio.pause()
    this.audio.removeAttribute("src")
    this.audio.load()
    this.stopSmoothClock()
  }

  seek(time: number) {
    if (isFinite(this.audio.duration)) {
      this.audio.currentTime = Math.max(0, Math.min(time, this.audio.duration))
      this.emitTime()
    }
  }

  setVolume(v: number) {
    this.audio.volume = Math.max(0, Math.min(1, v))
  }

  setMuted(m: boolean) {
    this.audio.muted = m
  }

  private resolveStatus(): PlayerStatus {
    if (!this.audio.src) return "idle"
    if (this.audio.error) return "error"
    if (this.audio.ended) return "ended"
    if (this.audio.readyState < 3 && !this.audio.paused) return "loading"
    if (!this.audio.paused) return "playing"
    return "paused"
  }

  getState(): AudioState {
    return {
      isPlaying: !this.audio.paused && !this.audio.ended,
      currentTime: this.audio.currentTime,
      duration: this.audio.duration || 0,
      volume: this.audio.volume,
      muted: this.audio.muted,
      status: this.resolveStatus(),
    }
  }
}

export const audioPlayer = new AudioPlayer()
