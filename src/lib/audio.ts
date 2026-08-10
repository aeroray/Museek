import { cdnFetchStrategies } from "@/lib/cdnHeaders";
import { httpFetch } from "@/lib/http";
import type { PlayerStatus } from "@/types/player";

export interface AudioState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  status: PlayerStatus;
}

type AudioCallback = (state: AudioState) => void;
type EndedCallback = () => void;
type ErrorCallback = (msg: string) => void;
type TimeCallback = (currentTime: number) => void;

class AudioPlayer {
  private audio: HTMLAudioElement | null;
  private onStateChange: AudioCallback | null = null;
  private onEnded: EndedCallback | null = null;
  private onError: ErrorCallback | null = null;
  private currentTime = 0;
  /** Smooth clock listeners (rAF while playing). */
  private timeListeners = new Set<TimeCallback>();
  private timeRaf = 0;

  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private buffer: AudioBuffer | null = null;
  private sourceUrl = "";
  private sourceVersion = 0;
  private loadAbort: AbortController | null = null;
  private loadPromise: Promise<AudioBuffer> | null = null;
  private webCurrentTime = 0;
  private webStartedAt = 0;
  private webDuration = 0;
  private webPlaying = false;
  private webStatus: PlayerStatus = "idle";
  private webVolume = 1;
  private webMuted = false;

  constructor() {
    if (isWindowsTauri) {
      this.audio = null;
    } else {
      this.audio = new Audio();
      this.audio.preload = "auto";
      // NetEase and similar CDNs hotlink-check Referer; never send the app origin.
      this.audio.setAttribute("referrerpolicy", "no-referrer");
    }
    this.bindEvents();
  }

  private bindEvents() {
    const audio = this.audio;
    if (!audio) return;

    const notify = () => {
      this.readCurrentTime();
      this.onStateChange?.(this.getState());
    };

    audio.addEventListener("play", () => {
      notify();
      this.startSmoothClock();
    });
    audio.addEventListener("pause", () => {
      notify();
      this.stopSmoothClock();
      this.emitTime();
    });
    audio.addEventListener("timeupdate", () => {
      notify();
      this.emitTime();
    });
    audio.addEventListener("waiting", notify);
    audio.addEventListener("canplay", notify);
    audio.addEventListener("loadedmetadata", notify);
    audio.addEventListener("volumechange", notify);
    audio.addEventListener("ended", () => {
      this.stopSmoothClock();
      notify();
      this.onEnded?.();
    });
    audio.addEventListener("error", () => {
      this.stopSmoothClock();
      this.onError?.(audio.error?.message ?? "Playback error");
    });
  }

  private readCurrentTime(): number {
    if (!this.audio) {
      if (this.webPlaying && this.context) {
        this.webCurrentTime = Math.min(
          this.webDuration,
          Math.max(0, this.context.currentTime - this.webStartedAt),
        );
      }
      this.currentTime = Number.isFinite(this.webCurrentTime)
        ? this.webCurrentTime
        : 0;
      return this.currentTime;
    }

    const currentTime = this.audio.currentTime;
    this.currentTime = Number.isFinite(currentTime) ? currentTime : 0;
    return this.currentTime;
  }

  private emitTime() {
    const currentTime = this.readCurrentTime();
    for (const cb of this.timeListeners) cb(currentTime);
  }

  private startSmoothClock() {
    if (this.timeRaf || this.timeListeners.size === 0) return;
    const tick = () => {
      this.emitTime();
      if (this.isPlaying()) {
        this.timeRaf = requestAnimationFrame(tick);
      } else {
        this.timeRaf = 0;
      }
    };
    this.timeRaf = requestAnimationFrame(tick);
  }

  private stopSmoothClock() {
    if (!this.timeRaf) return;
    cancelAnimationFrame(this.timeRaf);
    this.timeRaf = 0;
  }

  private isPlaying(): boolean {
    if (!this.audio) return this.webPlaying;
    return !this.audio.paused && !this.audio.ended;
  }

  private isAssetLikeUrl(url: string): boolean {
    return (
      /^(?:asset|blob|data):/i.test(url) || url.includes("asset.localhost")
    );
  }

  private getWebContext(): AudioContext {
    if (this.context) return this.context;
    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) {
      throw new Error("Web Audio is unavailable");
    }
    const context = new AudioContextConstructor();
    const gain = context.createGain();
    gain.connect(context.destination);
    this.context = context;
    this.gain = gain;
    this.applyWebGain();
    return context;
  }

  private applyWebGain() {
    if (this.gain) this.gain.gain.value = this.webMuted ? 0 : this.webVolume;
  }

  private async fetchWebAudio(
    url: string,
    signal: AbortSignal,
  ): Promise<Response> {
    if (this.isAssetLikeUrl(url)) {
      return fetch(url, { signal });
    }

    let lastError: unknown = null;
    for (const headers of cdnFetchStrategies(url)) {
      try {
        const response = await httpFetch(url, {
          method: "GET",
          headers,
          signal,
        });
        if (response.ok) return response;
        lastError = new Error(`Audio request failed (${response.status})`);
      } catch (error) {
        if (signal.aborted) throw error;
        lastError = error;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("Audio request failed");
  }

  private async decodeWebAudio(
    url: string,
    signal: AbortSignal,
  ): Promise<AudioBuffer> {
    const response = await this.fetchWebAudio(url, signal);
    const bytes = await response.arrayBuffer();
    if (!bytes.byteLength) throw new Error("Empty audio response");
    return this.getWebContext().decodeAudioData(bytes);
  }

  private ensureWebBuffer(): Promise<AudioBuffer> {
    if (this.buffer) return Promise.resolve(this.buffer);
    if (this.loadPromise) return this.loadPromise;

    const version = this.sourceVersion;
    const abort = new AbortController();
    this.loadAbort = abort;
    this.loadPromise = this.decodeWebAudio(this.sourceUrl, abort.signal)
      .then((buffer) => {
        if (version !== this.sourceVersion) {
          throw new Error("Audio source changed");
        }
        this.buffer = buffer;
        this.webDuration = buffer.duration;
        this.webStatus = "paused";
        this.notifyWebState();
        return buffer;
      })
      .catch((error) => {
        if (version === this.sourceVersion && !abort.signal.aborted) {
          this.webStatus = "error";
          this.notifyWebState();
          this.onError?.((error as Error).message || "Playback error");
        }
        throw error;
      });
    return this.loadPromise;
  }

  private notifyWebState() {
    this.readCurrentTime();
    this.onStateChange?.(this.getState());
  }

  private detachWebSource() {
    const sourceNode = this.sourceNode;
    this.sourceNode = null;
    if (!sourceNode) return;
    sourceNode.onended = null;
    try {
      sourceNode.stop();
    } catch {
      /* already stopped */
    }
    sourceNode.disconnect();
  }

  private startWebPlayback(buffer: AudioBuffer) {
    const context = this.getWebContext();
    const sourceNode = context.createBufferSource();
    sourceNode.buffer = buffer;
    sourceNode.connect(this.gain!);

    const offset =
      this.webCurrentTime >= buffer.duration
        ? 0
        : Math.max(0, this.webCurrentTime);
    this.webCurrentTime = offset;
    this.webStartedAt = context.currentTime - offset;
    this.sourceNode = sourceNode;
    this.webPlaying = true;
    this.webStatus = "playing";
    sourceNode.onended = () => {
      if (this.sourceNode !== sourceNode || !this.webPlaying) return;
      this.sourceNode = null;
      this.webPlaying = false;
      this.webCurrentTime = this.webDuration;
      this.webStatus = "ended";
      this.stopSmoothClock();
      this.notifyWebState();
      this.onEnded?.();
    };
    sourceNode.start(0, offset);
    this.notifyWebState();
    this.startSmoothClock();
  }

  /**
   * Subscribe to a smooth playback clock (~rAF while playing).
   * Prefer this over reading the element from UI — keeps the audio seam private.
   */
  subscribeTime(cb: TimeCallback): () => void {
    this.timeListeners.add(cb);
    if (this.isPlaying()) this.startSmoothClock();
    return () => {
      this.timeListeners.delete(cb);
      if (this.timeListeners.size === 0) this.stopSmoothClock();
    };
  }

  setCallbacks(callbacks: {
    onStateChange?: AudioCallback;
    onEnded?: EndedCallback;
    onError?: ErrorCallback;
  }) {
    this.onStateChange = callbacks.onStateChange ?? null;
    this.onEnded = callbacks.onEnded ?? null;
    this.onError = callbacks.onError ?? null;
  }

  setSource(url: string) {
    if (!this.audio) {
      this.sourceVersion += 1;
      this.loadAbort?.abort();
      this.loadAbort = null;
      this.loadPromise = null;
      this.detachWebSource();
      this.stopSmoothClock();
      this.sourceUrl = url;
      this.buffer = null;
      this.webCurrentTime = 0;
      this.webDuration = 0;
      this.webStatus = url ? "loading" : "idle";
      return;
    }

    this.currentTime = 0;
    this.audio.src = url;
    this.audio.load();
  }

  play(): Promise<void> {
    if (this.audio) return this.audio.play();
    if (!this.sourceUrl) return Promise.reject(new Error("No audio source"));
    return this.ensureWebBuffer().then(async (buffer) => {
      if (this.webPlaying) return;
      await this.getWebContext().resume();
      this.detachWebSource();
      this.startWebPlayback(buffer);
    });
  }

  pause() {
    if (!this.audio) {
      if (!this.webPlaying) return;
      this.readCurrentTime();
      this.webPlaying = false;
      this.webStatus = this.sourceUrl ? "paused" : "idle";
      this.detachWebSource();
      this.stopSmoothClock();
      this.notifyWebState();
      this.emitTime();
      return;
    }
    this.audio.pause();
  }

  // Fully stop: pause, drop the source, and reset the element to an idle state.
  // Used when the queue finishes so nothing is left loaded/paused.
  stop() {
    if (!this.audio) {
      this.sourceVersion += 1;
      this.loadAbort?.abort();
      this.loadAbort = null;
      this.loadPromise = null;
      this.detachWebSource();
      this.stopSmoothClock();
      this.sourceUrl = "";
      this.buffer = null;
      this.webCurrentTime = 0;
      this.webDuration = 0;
      this.webStatus = "idle";
      this.currentTime = 0;
      return;
    }

    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
    this.currentTime = 0;
    this.stopSmoothClock();
  }

  seek(time: number) {
    if (!this.audio) {
      const duration = this.webDuration;
      this.webCurrentTime = duration
        ? Math.max(0, Math.min(time, duration))
        : Math.max(0, time);
      this.currentTime = this.webCurrentTime;
      if (this.webPlaying && this.buffer) {
        this.detachWebSource();
        this.startWebPlayback(this.buffer);
      } else {
        this.notifyWebState();
        this.emitTime();
      }
      return;
    }

    if (isFinite(this.audio.duration)) {
      this.audio.currentTime = Math.max(0, Math.min(time, this.audio.duration));
      this.emitTime();
    }
  }

  setVolume(v: number) {
    const volume = Math.max(0, Math.min(1, v));
    if (!this.audio) {
      this.webVolume = volume;
      this.applyWebGain();
      this.notifyWebState();
      return;
    }
    this.audio.volume = volume;
  }

  setMuted(m: boolean) {
    if (!this.audio) {
      this.webMuted = m;
      this.applyWebGain();
      this.notifyWebState();
      return;
    }
    this.audio.muted = m;
  }

  private resolveStatus(): PlayerStatus {
    if (!this.audio) return this.webStatus;
    if (!this.audio.src) return "idle";
    if (this.audio.error) return "error";
    if (this.audio.ended) return "ended";
    if (this.audio.readyState < 3 && !this.audio.paused) return "loading";
    if (!this.audio.paused) return "playing";
    return "paused";
  }

  getState(): AudioState {
    if (!this.audio) {
      return {
        isPlaying: this.webPlaying,
        currentTime: this.readCurrentTime(),
        duration: this.webDuration,
        volume: this.webVolume,
        muted: this.webMuted,
        status: this.resolveStatus(),
      };
    }

    return {
      isPlaying: !this.audio.paused && !this.audio.ended,
      currentTime: this.currentTime,
      duration: this.audio.duration || 0,
      volume: this.audio.volume,
      muted: this.audio.muted,
      status: this.resolveStatus(),
    };
  }

  getCurrentTime(): number {
    return this.readCurrentTime();
  }
}

const isWindowsTauri =
  typeof window !== "undefined" &&
  "__TAURI_INTERNALS__" in window &&
  typeof navigator !== "undefined" &&
  /Windows/i.test(navigator.userAgent);

export const audioPlayer = new AudioPlayer();
