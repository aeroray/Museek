import { audioPlayer } from "@/lib/audio"
import { httpFetch } from "@/lib/http"
import { getCachedAudioUrl, putCachedAudio } from "@/lib/mediaCache"
import { qualityCandidates } from "@/lib/quality"
import { sourceRunner } from "@/lib/sourceRunner"
import type { MusicInfo, Quality } from "@/types/music"

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

// Object URL of cache-backed playback — revoke on switch / stop.
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

/**
 * Prefer on-disk audio cache; otherwise fetch once, cache, play from blob.
 * Falls back to streaming the remote URL on any cache error.
 */
export async function resolvePlayableSrc(
  song: MusicInfo,
  quality: Quality,
  url: string,
  opts: { audioCache: boolean; maxCacheMB: number },
): Promise<string> {
  if (!isTauri || !opts.audioCache) return url
  const cached = await getCachedAudioUrl(song.source, song.meta.songId, quality)
  if (cached) return cached
  try {
    const res = await httpFetch(url, { method: "GET" })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const bytes = new Uint8Array(await res.arrayBuffer())
    const ext = quality === "flac" || quality === "flac24bit" ? "flac" : "mp3"
    const maxBytes = opts.maxCacheMB * 1024 * 1024
    await putCachedAudio(song.source, song.meta.songId, quality, bytes, ext, maxBytes)
    return URL.createObjectURL(new Blob([bytes], { type: ext === "flac" ? "audio/flac" : "audio/mpeg" }))
  } catch {
    return url
  }
}

/** Shared adaptive URL resolve for playback and downloads. */
export async function resolveAdaptiveUrl(
  song: MusicInfo,
  preferred: Quality,
): Promise<{ url: string; quality: Quality }> {
  return sourceRunner.getMusicUrlAdaptive(song, preferred)
}
