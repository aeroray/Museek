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
  /** Always created. Used for local/asset playback (and all playback off Windows). */
  private element: HTMLAudioElement;
  private onStateChange: AudioCallback | null = null;
  private onEnded: EndedCallback | null = null;
  private onError: ErrorCallback | null = null;
  private currentTime = 0;
  /** Smooth clock listeners (rAF while playing). */
  private timeListeners = new Set<TimeCallback>();
  private timeRaf = 0;
  private timeFallbackTimer = 0;
  private lastTimeTick = 0;

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
  /** True after natural end (or pause-at-end) until the next setSource. */
  private endedSent = false;
  /** Bumped when the HTML element is given a new src so whenReady cannot reuse stale metadata. */
  private htmlLoadId = 0;
  /** `htmlLoadId` for which loadedmetadata has fired. */
  private htmlReadyFor = 0;
  /** Inclusive file-time start of the active CUE clip; 0 = beginning of file. */
  private clipStart = 0;
  /** Exclusive file-time end of the active CUE clip; null = whole file. */
  private clipEnd: number | null = null;

  constructor() {
    this.element = new Audio();
    this.element.preload = "auto";
    // NetEase and similar CDNs hotlink-check Referer; never send the app origin.
    this.element.setAttribute("referrerpolicy", "no-referrer");
    this.element.disableRemotePlayback = true;
    this.bindEvents();
    this.syncHtmlGain();
  }

  /**
   * HTML media element when it should own playback.
   * Windows remote URLs stay on Web Audio so WebView2 does not publish a
   * second SMTC card; local/asset URLs stream from disk instead of decoding
   * a whole album FLAC into an AudioBuffer (CUE tracks were waiting minutes).
   */
  private get audio(): HTMLAudioElement | null {
    return this.usingWebAudio() ? null : this.element;
  }

  private usingWebAudio(): boolean {
    return (
      isWindowsTauri &&
      Boolean(this.sourceUrl) &&
      !this.isAssetLikeUrl(this.sourceUrl)
    );
  }

  private bindEvents() {
    const audio = this.element;
    const htmlActive = () => this.audio === audio;

    const notify = () => {
      if (!htmlActive()) return;
      this.readCurrentTime();
      this.onStateChange?.(this.getState());
    };

    audio.addEventListener("play", () => {
      if (!htmlActive()) return;
      notify();
      this.startSmoothClock();
    });
    audio.addEventListener("pause", () => {
      if (!htmlActive()) return;
      notify();
      this.stopSmoothClock();
      this.emitTime();
    });
    audio.addEventListener("timeupdate", () => {
      if (!htmlActive()) return;
      notify();
      this.emitTime();
    });
    audio.addEventListener("waiting", notify);
    audio.addEventListener("canplay", notify);
    audio.addEventListener("loadedmetadata", () => {
      this.htmlReadyFor = this.htmlLoadId;
      notify();
    });
    audio.addEventListener("volumechange", notify);
    audio.addEventListener("ended", () => {
      if (!htmlActive()) return;
      this.stopSmoothClock();
      notify();
      this.emitEnded();
    });
    audio.addEventListener("error", () => {
      if (!htmlActive()) return;
      this.stopSmoothClock();
      this.onError?.(audio.error?.message ?? "Playback error");
    });
  }

  private clearHtmlElement() {
    this.element.pause();
    this.element.removeAttribute("src");
    this.element.load();
  }

  private abortWebDecode() {
    this.sourceVersion += 1;
    this.loadAbort?.abort();
    this.loadAbort = null;
    this.loadPromise = null;
    this.detachWebSource();
    this.buffer = null;
    this.webPlaying = false;
    this.webCurrentTime = 0;
    this.webDuration = 0;
    this.webStatus = "idle";
  }

  private waitHtmlSeekSettled(): Promise<void> {
    const audio = this.audio;
    if (!audio) return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const timer = window.setTimeout(done, 4_000);
      const cleanup = () => {
        window.clearTimeout(timer);
        audio.removeEventListener("seeked", done);
      };
      audio.addEventListener("seeked", done);
      queueMicrotask(() => {
        if (!audio.seeking) done();
      });
    });
  }

  private fileTime(): number {
    if (!this.audio) {
      if (this.webPlaying && this.context) {
        this.webCurrentTime = Math.min(
          this.fileDuration() || this.webCurrentTime,
          Math.max(0, this.context.currentTime - this.webStartedAt),
        );
      }
      return Number.isFinite(this.webCurrentTime) ? this.webCurrentTime : 0;
    }
    const currentTime = this.audio.currentTime;
    return Number.isFinite(currentTime) ? currentTime : 0;
  }

  private fileDuration(): number {
    if (!this.audio) return this.webDuration > 0 ? this.webDuration : 0;
    const duration = this.audio.duration;
    return Number.isFinite(duration) && duration > 0 ? duration : 0;
  }

  private clipWindow(): { start: number; end: number } | null {
    if (this.clipEnd != null && this.clipEnd > this.clipStart) {
      return { start: this.clipStart, end: this.clipEnd };
    }
    return null;
  }

  private toClipTime(fileTime: number): number {
    const clip = this.clipWindow();
    if (!clip) return fileTime;
    return Math.max(0, Math.min(fileTime - clip.start, clip.end - clip.start));
  }

  private clipDuration(): number {
    const clip = this.clipWindow();
    if (clip) return clip.end - clip.start;
    return this.fileDuration();
  }

  private readCurrentTime(): number {
    this.currentTime = this.toClipTime(this.fileTime());
    return this.currentTime;
  }

  private emitTime() {
    this.maybeFinishClip();
    const currentTime = this.readCurrentTime();
    for (const cb of this.timeListeners) cb(currentTime);
  }

  private emitEnded() {
    if (this.endedSent) return;
    this.endedSent = true;
    this.onEnded?.();
  }

  private atEndOfTrack(duration: number, currentTime: number): boolean {
    return duration > 0 && currentTime >= duration - 0.05;
  }

  /** BufferSource.onended is unreliable in WebView2; also treat pause-at-EOS as ended. */
  private finishWebPlayback() {
    if (this.audio || this.endedSent) return;
    this.endedSent = true;
    this.detachWebSource();
    this.webPlaying = false;
    this.webCurrentTime = this.clipWindow()?.end ?? this.webDuration;
    this.webStatus = "ended";
    this.stopSmoothClock();
    this.notifyWebState();
    this.onEnded?.();
  }

  private finishHtmlClip() {
    if (!this.audio || this.endedSent) return;
    this.endedSent = true;
    this.audio.pause();
    this.stopSmoothClock();
    this.notifyWebState();
    this.onEnded?.();
  }

  private maybeFinishClip() {
    if (this.endedSent) return;
    const clip = this.clipWindow();
    if (clip) {
      if (this.fileTime() >= clip.end - 0.05) {
        if (this.audio) this.finishHtmlClip();
        else this.finishWebPlayback();
      }
      return;
    }
    this.maybeFinishWebPlayback();
  }

  private maybeFinishWebPlayback() {
    if (
      this.audio ||
      !this.webPlaying ||
      this.endedSent ||
      !this.atEndOfTrack(this.webDuration, this.webCurrentTime)
    ) {
      return;
    }
    this.finishWebPlayback();
  }

  private startSmoothClock() {
    if (this.timeRaf || this.timeFallbackTimer) return;
    if (this.timeListeners.size === 0 && this.audio) return;
    const tick = () => {
      if (!this.isPlaying() || (this.timeListeners.size === 0 && this.audio)) {
        this.stopSmoothClock();
        return;
      }
      this.lastTimeTick = performance.now();
      this.emitTime();
      this.timeRaf = requestAnimationFrame(tick);
    };
    const fallbackTick = () => {
      if (!this.isPlaying() || (this.timeListeners.size === 0 && this.audio)) {
        this.stopSmoothClock();
        return;
      }
      const now = performance.now();
      if (now - this.lastTimeTick < 50) return;
      this.lastTimeTick = now;
      this.emitTime();
    };
    this.lastTimeTick = performance.now();
    this.timeFallbackTimer = window.setInterval(fallbackTick, 50);
    this.timeRaf = requestAnimationFrame(tick);
  }

  private stopSmoothClock() {
    if (this.timeRaf) cancelAnimationFrame(this.timeRaf);
    this.timeRaf = 0;
    if (this.timeFallbackTimer) window.clearInterval(this.timeFallbackTimer);
    this.timeFallbackTimer = 0;
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

  private syncHtmlGain() {
    this.element.volume = this.webVolume;
    this.element.muted = this.webMuted;
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
    this.endedSent = false;
    sourceNode.onended = () => {
      if (this.sourceNode !== sourceNode) return;
      this.finishWebPlayback();
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

  setClip(start: number | null, end: number | null) {
    this.clipStart =
      typeof start === "number" && Number.isFinite(start) && start > 0
        ? start
        : 0;
    this.clipEnd =
      typeof end === "number" && Number.isFinite(end) && end > this.clipStart
        ? end
        : null;
    this.endedSent = false;
  }

  setSource(url: string) {
    this.endedSent = false;
    const same = Boolean(url) && url === this.sourceUrl;
    if (same) {
      if (this.usingWebAudio()) {
        this.detachWebSource();
        this.stopSmoothClock();
        this.webPlaying = false;
        this.webStatus = this.buffer ? "paused" : url ? "loading" : "idle";
        return;
      }
      // Keep the element running so CUE track changes can seek in place.
      return;
    }

    this.clipStart = 0;
    this.clipEnd = null;
    const prevWasWeb = this.usingWebAudio();
    this.sourceUrl = url;
    const nextIsWeb = this.usingWebAudio();
    this.stopSmoothClock();
    this.currentTime = 0;

    if (nextIsWeb) {
      if (!prevWasWeb) {
        this.htmlLoadId += 1;
        this.clearHtmlElement();
      }
      this.abortWebDecode();
      this.webCurrentTime = 0;
      this.webDuration = 0;
      this.webStatus = url ? "loading" : "idle";
      return;
    }

    if (prevWasWeb) this.abortWebDecode();
    this.syncHtmlGain();
    if (!url) {
      this.htmlLoadId += 1;
      this.clearHtmlElement();
      return;
    }
    this.htmlLoadId += 1;
    this.element.src = url;
    this.element.load();
  }

  hasSource(): boolean {
    return Boolean(this.sourceUrl);
  }

  whenReady(): Promise<void> {
    if (this.usingWebAudio()) {
      if (!this.sourceUrl) return Promise.resolve();
      return this.ensureWebBuffer().then(() => undefined);
    }
    const audio = this.element;
    const loadId = this.htmlLoadId;
    if (
      this.htmlReadyFor === loadId &&
      audio.readyState >= 1 &&
      Number.isFinite(audio.duration) &&
      audio.duration > 0
    ) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const done = () => {
        cleanup();
        resolve();
      };
      const timer = window.setTimeout(done, 8_000);
      const cleanup = () => {
        window.clearTimeout(timer);
        audio.removeEventListener("loadedmetadata", done);
        audio.removeEventListener("error", done);
      };
      audio.addEventListener("loadedmetadata", done);
      audio.addEventListener("error", done);
    });
  }

  /** Attach a source and seek without starting playback (startup resume). */
  async preparePausedSource(
    url: string,
    startTime: number,
    clip?: { start: number; end: number } | null,
  ): Promise<void> {
    this.setSource(url);
    this.setClip(clip?.start ?? null, clip?.end ?? null);
    if (!this.audio) {
      this.seek(startTime);
      this.webStatus = "paused";
      this.emitTime();
      this.notifyWebState();
      return;
    }
    await this.whenReady();
    this.seek(startTime);
    this.pause(false);
  }

  async play(): Promise<void> {
    const clip = this.clipWindow();
    if (clip) {
      const fileTime = this.fileTime();
      if (fileTime < clip.start - 0.02 || fileTime >= clip.end - 0.05) {
        this.seek(0);
      }
    }
    if (this.audio) {
      await this.waitHtmlSeekSettled();
      const html = this.audio;
      if (!html) return;
      await html.play();
      return;
    }
    if (!this.sourceUrl) throw new Error("No audio source");
    const buffer = await this.ensureWebBuffer();
    if (this.webPlaying) return;
    await this.getWebContext().resume();
    this.detachWebSource();
    this.startWebPlayback(buffer);
  }

  pause(emitEnd = true) {
    if (!this.audio) {
      if (!this.webPlaying) return;
      this.fileTime();
      const end = this.clipWindow()?.end ?? this.webDuration;
      if (emitEnd && this.atEndOfTrack(end, this.webCurrentTime)) {
        this.finishWebPlayback();
        return;
      }
      this.webPlaying = false;
      this.webStatus = this.sourceUrl ? "paused" : "idle";
      this.detachWebSource();
      this.stopSmoothClock();
      this.notifyWebState();
      this.emitTime();
      return;
    }
    const audio = this.audio;
    const end = this.clipWindow()?.end ?? audio.duration;
    const atEnd =
      audio.ended || this.atEndOfTrack(end, audio.currentTime);
    audio.pause();
    if (emitEnd && atEnd) this.emitEnded();
  }

  // Fully stop: pause, drop the source, and reset both backends.
  // Used when the queue finishes so nothing is left loaded/paused.
  stop() {
    this.endedSent = false;
    this.clipStart = 0;
    this.clipEnd = null;
    this.htmlLoadId += 1;
    this.abortWebDecode();
    this.clearHtmlElement();
    this.stopSmoothClock();
    this.sourceUrl = "";
    this.webCurrentTime = 0;
    this.webDuration = 0;
    this.webStatus = "idle";
    this.currentTime = 0;
  }

  seek(time: number) {
    const clip = this.clipWindow();
    const start = clip?.start ?? 0;
    const fileDur = this.fileDuration();
    const end = clip?.end ?? fileDur;
    const abs = start + Math.max(0, time);
    const clamped =
      end > start ? Math.max(start, Math.min(abs, end)) : Math.max(0, abs);

    if (!this.audio) {
      this.webCurrentTime = clamped;
      this.currentTime = this.toClipTime(clamped);
      if (this.webPlaying && this.buffer) {
        this.detachWebSource();
        this.startWebPlayback(this.buffer);
      } else {
        this.notifyWebState();
        this.emitTime();
      }
      return;
    }

    if (isFinite(this.audio.duration) || clip) {
      if (isFinite(this.audio.duration) || this.audio.readyState >= 1) {
        this.audio.currentTime = clamped;
      }
      this.emitTime();
    }
  }

  setVolume(v: number) {
    this.webVolume = Math.max(0, Math.min(1, v));
    this.applyWebGain();
    this.syncHtmlGain();
    this.notifyWebState();
  }

  setMuted(m: boolean) {
    this.webMuted = m;
    this.applyWebGain();
    this.syncHtmlGain();
    this.notifyWebState();
  }

  private resolveStatus(): PlayerStatus {
    if (this.usingWebAudio()) return this.webStatus;
    if (!this.sourceUrl) return "idle";
    if (!this.audio) return this.webStatus;
    if (!this.audio.src) return "idle";
    if (this.audio.error) return "error";
    if (this.audio.ended) return "ended";
    // CUE clip seeks drop readyState briefly; don't report loading or the
    // player bar flashes Play + a dimmed cover.
    if (this.audio.seeking) return this.audio.paused ? "paused" : "playing";
    if (this.audio.readyState < 3 && !this.audio.paused) return "loading";
    if (!this.audio.paused) return "playing";
    return "paused";
  }

  getState(): AudioState {
    if (!this.audio) {
      return {
        isPlaying: this.webPlaying,
        currentTime: this.readCurrentTime(),
        duration: this.clipDuration(),
        volume: this.webVolume,
        muted: this.webMuted,
        status: this.resolveStatus(),
      };
    }

    return {
      isPlaying: !this.audio.paused && !this.audio.ended,
      currentTime: this.readCurrentTime(),
      duration: this.clipDuration(),
      volume: this.audio.volume,
      muted: this.audio.muted,
      status: this.resolveStatus(),
    };
  }

  getCurrentTime(): number {
    return this.currentTime;
  }
}

const isWindowsTauri =
  typeof window !== "undefined" &&
  "__TAURI_INTERNALS__" in window &&
  typeof navigator !== "undefined" &&
  /Windows/i.test(navigator.userAgent);

export const audioPlayer = new AudioPlayer();
