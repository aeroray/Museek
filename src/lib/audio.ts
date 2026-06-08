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

class AudioPlayer {
  private audio: HTMLAudioElement
  private onStateChange: AudioCallback | null = null
  private onEnded: EndedCallback | null = null
  private onError: ErrorCallback | null = null

  constructor() {
    this.audio = new Audio()
    this.audio.preload = "auto"
    this.bindEvents()
  }

  private bindEvents() {
    const notify = () => this.onStateChange?.(this.getState())

    this.audio.addEventListener("play", notify)
    this.audio.addEventListener("pause", notify)
    this.audio.addEventListener("timeupdate", notify)
    this.audio.addEventListener("waiting", notify)
    this.audio.addEventListener("canplay", notify)
    this.audio.addEventListener("loadedmetadata", notify)
    this.audio.addEventListener("volumechange", notify)
    this.audio.addEventListener("ended", () => {
      notify()
      this.onEnded?.()
    })
    this.audio.addEventListener("error", () => {
      this.onError?.(this.audio.error?.message ?? "Playback error")
    })
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

  seek(time: number) {
    if (isFinite(this.audio.duration)) {
      this.audio.currentTime = Math.max(0, Math.min(time, this.audio.duration))
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
