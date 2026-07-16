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
 */

const BITRATE_KBPS: Record<Quality, number> = {
  "128k": 128,
  "320k": 320,
  flac: 500,
  flac24bit: 900,
}

const MIN_AUDIO_BYTES = 150 * 1024

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

async function resolvedContentLength(url: string): Promise<number | null> {
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

/** True if the URL plausibly points to the full song (or we couldn't tell). */
export async function looksLikeRealAudio(
  url: string,
  song: MusicInfo,
  quality: Quality,
): Promise<boolean> {
  const len = await resolvedContentLength(url)
  if (len == null) return true

  const known = parseSizeToBytes(song.meta._qualitys?.[quality]?.size)
  if (known && known > 0) return len >= known * 0.5

  const secs = intervalToSeconds(song.interval)
  if (secs > 0) return len >= BITRATE_KBPS[quality] * 125 * secs * 0.5

  return len >= MIN_AUDIO_BYTES
}
