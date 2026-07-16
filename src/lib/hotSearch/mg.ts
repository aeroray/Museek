import { httpFetch as tauriFetch } from "@/lib/http"

// Ported from lx-music-desktop: src/renderer/utils/musicSdk/mg/hotSearch.js
// Prefer HTTPS (same host as mg search). The historic :7090 cleartext endpoint
// is kept as a fallback — some networks / Tauri builds fail on that port.

interface MgHotItem {
  word?: string
  resourceType?: string
}

interface MgHotResponse {
  code?: string
  info?: string
  data?: { hotwords?: { hotwordList?: MgHotItem[] }[] }
}

const HEADERS: Record<string, string> = {
  channel: "0146921",
  uiVersion: "A_music_3.6.1",
  "User-Agent":
    "Mozilla/5.0 (Linux; U; Android 11.0.0; zh-cn; MI 11 Build/OPR1.170623.032) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30",
}

const ENDPOINTS = [
  "https://jadeite.migu.cn/music_search/v3/search/hotword",
  "http://jadeite.migu.cn:7090/music_search/v3/search/hotword",
]

function pickWords(data: MgHotResponse): string[] {
  const groups = data.data?.hotwords ?? []
  const all = groups.flatMap((g) => g.hotwordList ?? [])
  if (!all.length) return []

  // Prefer song keywords (same as lx-music); fall back to every word if none tagged.
  const songs = all.filter((i) => i.resourceType === "song")
  const use = songs.length ? songs : all
  return use.map((i) => (i.word ?? "").trim()).filter(Boolean)
}

async function fetchOnce(url: string): Promise<string[]> {
  const res = await tauriFetch(url, { method: "GET", headers: HEADERS })
  if (!res.ok) throw new Error(`Migu hot search failed: ${res.status}`)

  const data = (await res.json()) as MgHotResponse
  if (data.code !== "000000") {
    throw new Error(`Migu hot search failed: ${data.info ?? data.code ?? "bad response"}`)
  }

  const words = pickWords(data)
  if (!words.length) throw new Error("Migu hot search returned no keywords")
  return words
}

export async function getMgHotSearch(): Promise<string[]> {
  let lastErr: unknown
  for (const url of ENDPOINTS) {
    try {
      return await fetchOnce(url)
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Migu hot search failed")
}
