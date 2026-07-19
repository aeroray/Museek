import { httpFetch } from "@/lib/http"
import type { Quality } from "@/types/music"

/**
 * Built-in NetEase play-URL resolve via the public enhance/player/url API.
 * Used when imported lx sources fail or return non-audio bodies for `wy`.
 */

const BR: Record<Quality, number> = {
  "128k": 128000,
  "320k": 320000,
  flac: 999000,
  flac24bit: 1999000,
}

interface WyUrlRow {
  id?: number
  url?: string | null
  code?: number
  br?: number
  size?: number
  type?: string
  freeTrialInfo?: unknown
}

export async function getWyBuiltinMusicUrl(
  songId: string,
  quality: Quality = "128k",
): Promise<string> {
  const br = BR[quality] ?? 128000
  const url =
    `https://music.163.com/api/song/enhance/player/url` +
    `?id=${encodeURIComponent(songId)}` +
    `&ids=${encodeURIComponent(`[${songId}]`)}` +
    `&br=${br}`

  const res = await httpFetch(url, {
    method: "GET",
    headers: {
      Referer: "https://music.163.com/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    },
  })
  if (!res.ok) throw new Error(`NetEase url API HTTP ${res.status}`)

  const data = (await res.json()) as { code?: number; data?: WyUrlRow[] }
  const row = data.data?.[0]
  if (!row?.url || row.code !== 200) {
    throw new Error("NetEase url API returned no playable link")
  }
  // Prefer https when the CDN supports it (WebView mixed-content friendly).
  return row.url.replace(/^http:\/\//i, "https://")
}
