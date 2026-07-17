import { httpFetch } from "@/lib/http"
import type { MusicInfo, Quality } from "@/types/music"

/**
 * Trial / VIP-notice detection for source failover.
 *
 * A source counts as "success" the moment it returns an http URL. For VIP /
 * copyright songs some sources hand back a short "this song is restricted" voice
 * clip — a valid URL — so failover would stop there. We size-check the URL:
 * a real song is far larger than a few-second notice. Keyed on the song's stated
 * duration when known; FAILS OPEN (accepts) when size can't be determined.
 *
 * Content-Length results are TTL-cached per URL so concurrent source races and
 * quality retries don't each fire HEAD + Range against the same CDN.
 */

const BITRATE_KBPS: Record<Quality, number> = {
  "128k": 128,
  "320k": 320,
  flac: 500,
  flac24bit: 900,
}

const MIN_AUDIO_BYTES = 150 * 1024
const LENGTH_TTL_MS = 5 * 60_000
const LENGTH_CACHE_MAX = 120

const lengthCache = new Map<string, { len: number | null; expires: number }>()
const lengthInflight = new Map<string, Promise<number | null>>()

function intervalToSeconds(interval: string): number {
  const parts = interval.split(":").map((p) => parseInt(p, 10))
  if (!parts.length || parts.some((n) => isNaN(n))) return 0
  return parts.reduce((acc, n) => acc * 60 + n, 0)
}

/** Parse lx-style size strings ("4.28MB", "850KB") or a raw byte count. */
export function parseSizeToBytes(s: string | null | undefined): number | null {
  if (!s) return null
  const m = String(s).trim().match(/^([\d.]+)\s*([KMGT]?)i?B?$/i)
  if (!m) {
    const n = parseInt(String(s), 10)
    return isNaN(n) ? null : n
  }
  const val = parseFloat(m[1])
  if (isNaN(val)) return null
  const units: Record<string, number> = {
    "": 1,
    K: 1024,
    M: 1024 ** 2,
    G: 1024 ** 3,
    T: 1024 ** 4,
  }
  return Math.round(val * (units[m[2].toUpperCase()] ?? 1))
}

function rememberLength(url: string, len: number | null): void {
  lengthCache.set(url, { len, expires: Date.now() + LENGTH_TTL_MS })
  if (lengthCache.size > LENGTH_CACHE_MAX) {
    const oldest = lengthCache.keys().next().value
    if (oldest !== undefined && oldest !== url) lengthCache.delete(oldest)
  }
}

async function fetchContentLength(url: string): Promise<number | null> {
  try {
    const head = await httpFetch(url, { method: "HEAD" })
    if (head.ok) {
      const len = parseInt(head.headers.get("content-length") || "", 10)
      if (len > 0) return len
    }
  } catch {
    /* fall through */
  }
  try {
    const ranged = await httpFetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
    })
    const cr = ranged.headers.get("content-range")
    if (cr) {
      const total = parseInt(cr.split("/")[1] || "", 10)
      if (total > 0) return total
    }
    const len = parseInt(ranged.headers.get("content-length") || "", 10)
    if (len > 1) return len
  } catch {
    /* fail open */
  }
  return null
}

async function resolvedContentLength(url: string): Promise<number | null> {
  const hit = lengthCache.get(url)
  if (hit && Date.now() < hit.expires) return hit.len

  const pending = lengthInflight.get(url)
  if (pending) return pending

  const job = fetchContentLength(url)
    .then((len) => {
      rememberLength(url, len)
      return len
    })
    .finally(() => {
      lengthInflight.delete(url)
    })
  lengthInflight.set(url, job)
  return job
}

/**
 * True if the URL plausibly points to the full song (or we couldn't tell).
 * Pass `isCancelled` from a source race so losers stop probing after a winner.
 */
export async function looksLikeRealAudio(
  url: string,
  song: MusicInfo,
  quality: Quality,
  isCancelled?: () => boolean,
): Promise<boolean> {
  if (isCancelled?.()) return false
  const len = await resolvedContentLength(url)
  if (isCancelled?.()) return false
  if (len == null) return true

  const known = parseSizeToBytes(song.meta._qualitys?.[quality]?.size)
  if (known && known > 0) return len >= known * 0.5

  const secs = intervalToSeconds(song.interval)
  if (secs > 0) return len >= BITRATE_KBPS[quality] * 125 * secs * 0.5

  return len >= MIN_AUDIO_BYTES
}
