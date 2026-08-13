import { audioPlayer } from "@/lib/audio"
import {
  isAudioContentType,
  looksLikeAudioBytes,
  looksLikeNonAudioBytes,
  maybeGunzipAudio,
} from "@/lib/audioBytes"
import { cdnFetchStrategies, isNetEaseCdnUrl } from "@/lib/cdnHeaders"
import { httpFetch } from "@/lib/http"
import { getCachedAudioUrl, listCachedAudioQualities, putCachedAudio } from "@/lib/mediaCache"
import { qualityCandidates } from "@/lib/quality"
import { sourceRunner } from "@/lib/sourceRunner"
import type { MusicInfo, Quality } from "@/types/music"

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

/** Cap how long a cache download may block playback before falling back to stream. */
const CACHE_DOWNLOAD_MS = 12_000
/** Background warm may take longer (large FLAC / slow CDN) so the next play hits disk. */
const CACHE_WARM_MS = 120_000

// Object URL of cache-backed / proxied playback — revoke on switch / stop.
let currentObjectUrl: string | null = null

/** Monotonic token so a stale play() resolve can't clobber a newer track. */
let playGeneration = 0

export function beginPlayGeneration(): number {
  return ++playGeneration
}

export function isPlayGenerationCurrent(gen: number): boolean {
  return gen === playGeneration
}

export function applyAudioSource(src: string): void {
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl)
    currentObjectUrl = null
  }
  if (src.startsWith("blob:")) currentObjectUrl = src
  audioPlayer.setSource(src)
}

export function revokeCurrentObjectUrl(): void {
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl)
    currentObjectUrl = null
  }
}

/**
 * Probe disk cache for a playable copy before any remote URL resolve.
 * Walks preferred quality downward first, then any other cached tier for the
 * song (so switching play quality down doesn't force a re-download).
 */
export async function findCachedPlayableSrc(
  song: MusicInfo,
  preferred: Quality,
  audioCache: boolean,
): Promise<{ src: string; quality: Quality } | null> {
  if (!isTauri || !audioCache) return null
  const tried = new Set<Quality>()
  for (const quality of qualityCandidates(preferred)) {
    tried.add(quality)
    const src = await getCachedAudioUrl(song.source, song.meta.songId, quality)
    if (src) return { src, quality }
  }
  for (const quality of await listCachedAudioQualities(song.source, song.meta.songId)) {
    if (tried.has(quality)) continue
    const src = await getCachedAudioUrl(song.source, song.meta.songId, quality)
    if (src) return { src, quality }
  }
  return null
}

function mimeForQuality(quality: Quality): { ext: string; mime: string } {
  if (quality === "flac" || quality === "flac24bit") {
    return { ext: "flac", mime: "audio/flac" }
  }
  return { ext: "mp3", mime: "audio/mpeg" }
}

function acceptAudioBytes(bytes: Uint8Array, contentType: string | null): boolean {
  if (looksLikeNonAudioBytes(bytes)) return false
  if (looksLikeAudioBytes(bytes)) return true
  if (isAudioContentType(contentType) && bytes.length >= 32 * 1024) return true
  return false
}

function withAbortTimeout(ms: number): { signal: AbortSignal; clear: () => void } {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  return { signal: ctrl.signal, clear: () => clearTimeout(timer) }
}

/**
 * Download audio for disk cache. Tries CDN header strategies; aborts after timeoutMs.
 * Never used as the sole path to start playback for NetEase (stream first).
 */
async function downloadAudioBytes(
  url: string,
  timeoutMs: number,
): Promise<{ bytes: Uint8Array; contentType: string | null } | null> {
  for (const headers of cdnFetchStrategies(url)) {
    const { signal, clear } = withAbortTimeout(timeoutMs)
    try {
      const res = await httpFetch(url, {
        method: "GET",
        headers,
        signal,
      })
      if (!res.ok) continue
      const contentType = res.headers.get("content-type")
      const bytes = maybeGunzipAudio(new Uint8Array(await res.arrayBuffer()))
      if (!acceptAudioBytes(bytes, contentType)) continue
      return { bytes, contentType }
    } catch {
      /* try next strategy */
    } finally {
      clear()
    }
  }
  return null
}

function warmDiskCache(
  song: MusicInfo,
  quality: Quality,
  url: string,
  maxCacheMB: number,
): void {
  void (async () => {
    try {
      const downloaded = await downloadAudioBytes(url, CACHE_WARM_MS)
      if (!downloaded) return
      const { ext } = mimeForQuality(quality)
      await putCachedAudio(
        song.source,
        song.meta.songId,
        quality,
        downloaded.bytes,
        ext,
        maxCacheMB * 1024 * 1024,
      )
    } catch {
      /* ignore background cache failures */
    }
  })()
}

/**
 * Prefer on-disk audio cache; otherwise try a timed native download for cache,
 * then fall back to streaming the remote URL (https-upgraded for NetEase).
 */
export async function resolvePlayableSrc(
  song: MusicInfo,
  quality: Quality,
  url: string,
  opts: { audioCache: boolean; maxCacheMB: number },
): Promise<string> {
  if (!isTauri) return url

  if (opts.audioCache) {
    const cached = await getCachedAudioUrl(song.source, song.meta.songId, quality)
    if (cached) return cached
  }

  // Prefer https for NetEase CDN (WebView-friendly); stream immediately so a
  // slow full-file cache download can't leave the player on infinite loading.
  const streamUrl = isNetEaseCdnUrl(url) ? url.replace(/^http:\/\//i, "https://") : url
  if (!opts.audioCache) return streamUrl

  // NetEase: play via stream first; warm disk cache in the background (long timeout).
  if (isNetEaseCdnUrl(url) || song.source === "wy") {
    warmDiskCache(song, quality, url, opts.maxCacheMB)
    return streamUrl
  }

  try {
    const downloaded = await downloadAudioBytes(url, CACHE_DOWNLOAD_MS)
    if (downloaded) {
      const { bytes } = downloaded
      const { ext, mime } = mimeForQuality(quality)
      const maxBytes = opts.maxCacheMB * 1024 * 1024
      await putCachedAudio(song.source, song.meta.songId, quality, bytes, ext, maxBytes)
      return URL.createObjectURL(new Blob([bytes], { type: mime }))
    }
  } catch {
    /* fall through to remote URL */
  }

  // Timed download missed — still warm in background so the next play can hit.
  warmDiskCache(song, quality, url, opts.maxCacheMB)
  return streamUrl
}

/** Shared adaptive URL resolve for playback and downloads. */
export async function resolveAdaptiveUrl(
  song: MusicInfo,
  preferred: Quality,
): Promise<{ url: string; quality: Quality }> {
  return sourceRunner.getMusicUrlAdaptive(song, preferred)
}
