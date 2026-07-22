import { httpFetch as tauriFetch } from "@/lib/http"
import { eapi } from "@/lib/platforms/wy/eapi"

// Ported from lx-music-desktop: src/renderer/utils/musicSdk/wy/hotSearch.js
// NetEase hot-search keywords via the eapi gateway (same signing as charts/wy.ts).

interface WyHotResponse {
  code?: number
  data?: { itemList?: { searchWord?: string }[] }
}

export async function getWyHotSearch(): Promise<string[]> {
  const form = eapi("/api/search/chart/detail", { id: "HOT_SEARCH_SONG#@#" })
  const body = new URLSearchParams(form).toString()

  const res = await tauriFetch("http://interface.music.163.com/eapi/batch", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36",
      origin: "https://music.163.com",
    },
    body,
  })

  if (!res.ok) throw new Error(`NetEase hot search failed: ${res.status}`)
  const data = (await res.json()) as WyHotResponse
  return (data.data?.itemList ?? []).map((i) => i.searchWord ?? "").filter(Boolean)
}
