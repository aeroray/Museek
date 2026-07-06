import { httpFetch as tauriFetch } from "@/lib/http"

// Ported from lx-music-desktop: src/renderer/utils/musicSdk/mg/hotSearch.js

interface MgHotResponse {
  code?: string
  data?: { hotwords?: { hotwordList?: { word?: string; resourceType?: string }[] }[] }
}

export async function getMgHotSearch(): Promise<string[]> {
  const res = await tauriFetch("http://jadeite.migu.cn:7090/music_search/v3/search/hotword", {
    method: "GET",
  })

  if (!res.ok) throw new Error(`Migu hot search failed: ${res.status}`)
  const data = (await res.json()) as MgHotResponse
  const list = data.data?.hotwords?.[0]?.hotwordList ?? []
  // Prefer song keywords (like the reference); fall back to all if none tagged.
  const songs = list.filter((i) => i.resourceType === "song")
  const use = songs.length ? songs : list
  return use.map((i) => i.word ?? "").filter(Boolean)
}
