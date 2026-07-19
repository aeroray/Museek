import { looksLikeAudioBytes, looksLikeNonAudioBytes } from "@/lib/audioBytes"
import { cdnHeadersForUrl } from "@/lib/cdnHeaders"
import { httpFetch } from "@/lib/http"
import type { MusicInfo, Quality } from "@/types/music"

/**
 * Trial / VIP-notice detection for source failover.
 *
 * A source counts as "success" the moment it returns an http URL. For VIP /
 * copyright songs some sources hand back a short "this song is restricted" voice
 * clip — a valid URL — so failover would stop there. We size-check the URL:
 * a real song is far larger than a few-second notice. Keyed on the song's stated
 * duration when known.
 *
 * Also rejects obvious non-audio Content-Types (application/json, text/html).
 * Some source APIs return a "play URL" that is actually a JSON error page with
 * no Content-Length (chunked) — the old fail-open path accepted those and the
 * WebView then threw MEDIA_ERR_SRC_NOT_SUPPORTED.
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

/** Sentinel: probe proved the body is not audio. */
const REJECT = 0

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

/** True when Content-Type clearly is not playable audio. */
export function isRejectableContentType(ct: string | null): boolean {
  if (!ct) return false
  const c = ct.toLowerCase()
  if (c.includes("audio/") || c.includes("mpegurl") || c.includes("octet-stream")) return false
  return /json|html|javascript|\bxml\b|text\/plain/.test(c)
}

async function fetchContentLength(url: string): Promise<number | null> {
  const cdn = cdnHeadersForUrl(url)
  try {
    const head = await httpFetch(url, { method: "HEAD", headers: cdn })
    if (head.ok) {
      if (isRejectableContentType(head.headers.get("content-type"))) return REJECT
      const len = parseInt(head.headers.get("content-length") || "", 10)
      if (len > 0) return len
    }
  } catch {
    /* fall through */
  }
  try {
    // Small Range probe: sniff magic bytes when the CDN honours Range (206).
    // Never arrayBuffer() a full-song 200 — that would download the track during race.
    const ranged = await httpFetch(url, {
      method: "GET",
      headers: { ...cdn, Range: "bytes=0-63" },
    })
    const ct = ranged.headers.get("content-type")
    if (isRejectableContentType(ct)) return REJECT

    const cr = ranged.headers.get("content-range")
    if (cr) {
      const total = parseInt(cr.split("/")[1] || "", 10)
      if (ranged.status === 206 || (ranged.ok && total > 0)) {
        const cl = parseInt(ranged.headers.get("content-length") || "", 10)
        if (cl > 0 && cl <= 512) {
          const prefix = new Uint8Array(await ranged.arrayBuffer())
          if (prefix.length >= 4 && looksLikeNonAudioBytes(prefix)) return REJECT
        }
      }
      if (total > 0) return total
    }
    const len = parseInt(ranged.headers.get("content-length") || "", 10)
    // Without Content-Range, a large Content-Length is the whole file — don't read it.
    if (len > 1 && len <= 512 && ranged.ok) {
      const prefix = new Uint8Array(await ranged.arrayBuffer())
      if (prefix.length >= 4 && looksLikeNonAudioBytes(prefix)) return REJECT
      if (prefix.length >= 4 && !looksLikeAudioBytes(prefix) && isRejectableContentType(ct)) {
        return REJECT
      }
    }
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
  // Explicit non-audio body (HTML/JSON error page, etc.).
  if (len === REJECT) return false
  if (len == null) return true

  const known = parseSizeToBytes(song.meta._qualitys?.[quality]?.size)
  if (known && known > 0) return len >= known * 0.5

  const secs = intervalToSeconds(song.interval)
  if (secs > 0) return len >= BITRATE_KBPS[quality] * 125 * secs * 0.5

  return len >= MIN_AUDIO_BYTES
}
