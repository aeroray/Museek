import * as pako from "pako"
import { audioPlayer } from "@/lib/audio"
import {
  isAudioContentType,
  isGzipBytes,
  looksLikeAudioBytes,
  looksLikeNonAudioBytes,
} from "@/lib/audioBytes"
import { cdnFetchStrategies, isNetEaseCdnUrl } from "@/lib/cdnHeaders"
import { httpFetch } from "@/lib/http"
import { getCachedAudioUrl, putCachedAudio } from "@/lib/mediaCache"
import { qualityCandidates } from "@/lib/quality"
import { sourceRunner } from "@/lib/sourceRunner"
import type { MusicInfo, Quality } from "@/types/music"

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

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
 * Walks the same quality ladder as adaptive URL fetch so a previously
 * downgraded cache entry (e.g. 128k when flac was requested) still hits.
 */
export async function findCachedPlayableSrc(
  song: MusicInfo,
  preferred: Quality,
  audioCache: boolean,
): Promise<{ src: string; quality: Quality } | null> {
  if (!isTauri || !audioCache) return null
  for (const quality of qualityCandidates(preferred)) {
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

function maybeGunzip(bytes: Uint8Array): Uint8Array {
  if (!isGzipBytes(bytes)) return bytes
  try {
    return pako.inflate(bytes)
  } catch {
    return bytes
  }
}

function acceptAudioBytes(bytes: Uint8Array, contentType: string | null): boolean {
  if (looksLikeNonAudioBytes(bytes)) return false
  if (looksLikeAudioBytes(bytes)) return true
  // Some CDNs omit a clear magic at offset 0 but still send audio/* + a real body.
  if (isAudioContentType(contentType) && bytes.length >= 32 * 1024) return true
  return false
}

/**
 * Download playable bytes trying several CDN header strategies.
 * Returns null when every strategy yields a non-audio body.
 */
async function downloadAudioBytes(
  url: string,
): Promise<{ bytes: Uint8Array; contentType: string | null } | null> {
  for (const headers of cdnFetchStrategies(url)) {
    try {
      const res = await httpFetch(url, { method: "GET", headers })
      if (!res.ok) continue
      const contentType = res.headers.get("content-type")
      const bytes = maybeGunzip(new Uint8Array(await res.arrayBuffer()))
      if (acceptAudioBytes(bytes, contentType)) return { bytes, contentType }
    } catch {
      /* try next strategy */
    }
  }
  return null
}

/**
 * Prefer on-disk audio cache; otherwise try a native download (CDN Referer /
 * no-Referer / X-Real-IP strategies), validate bytes, cache, play from blob.
 *
 * Always falls back to the remote URL on download failure — many source scripts
 * return third-party hosts (not *.126.net) that only work as `audio.src` with
 * referrerpolicy=no-referrer, and throwing here blocked playback entirely.
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

  // Skip the full download when cache is off and the URL isn't a hotlink CDN —
  // stream remotely (Audio element uses referrerpolicy=no-referrer).
  const shouldDownload = opts.audioCache || isNetEaseCdnUrl(url)
  if (!shouldDownload) return url

  try {
    const downloaded = await downloadAudioBytes(url)
    if (downloaded) {
      const { bytes } = downloaded
      const { ext, mime } = mimeForQuality(quality)
      if (opts.audioCache) {
        const maxBytes = opts.maxCacheMB * 1024 * 1024
        await putCachedAudio(song.source, song.meta.songId, quality, bytes, ext, maxBytes)
      }
      return URL.createObjectURL(new Blob([bytes], { type: mime }))
    }
  } catch {
    /* fall through to remote URL */
  }

  return url
}

/** Shared adaptive URL resolve for playback and downloads. */
export async function resolveAdaptiveUrl(
  song: MusicInfo,
  preferred: Quality,
): Promise<{ url: string; quality: Quality }> {
  return sourceRunner.getMusicUrlAdaptive(song, preferred)
}
