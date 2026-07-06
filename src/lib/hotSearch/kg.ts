import { httpFetch as tauriFetch } from "@/lib/http"

// Ported from lx-music-desktop: src/renderer/utils/musicSdk/kg/hotSearch.js

// Mirrors src/lib/search/kg.ts decodeName (HTML entity decode).
function decodeName(str: string | null | undefined): string {
  if (!str) return ""
  try {
    return new DOMParser().parseFromString(str, "text/html").body.textContent ?? str
  } catch {
    return str
  }
}

interface KgHotResponse {
  errcode?: number
  data?: { list?: { keywords?: { keyword?: string }[] }[] }
}

export async function getKgHotSearch(): Promise<string[]> {
  const res = await tauriFetch(
    "http://gateway.kugou.com/api/v3/search/hot_tab?signature=ee44edb9d7155821412d220bcaf509dd&appid=1005&clientver=10026&plat=0",
    {
      method: "GET",
      headers: {
        dfid: "1ssiv93oVqMp27cirf2CvoF1",
        mid: "156798703528610303473757548878786007104",
        clienttime: "1584257267",
        "x-router": "msearch.kugou.com",
        "user-agent": "Android9-AndroidPhone-10020-130-0-searchrecommendprotocol-wifi",
        "kg-rc": "1",
      },
    },
  )

  if (!res.ok) throw new Error(`KuGou hot search failed: ${res.status}`)
  const data = (await res.json()) as KgHotResponse
  if (data.errcode !== 0) throw new Error("KuGou hot search failed: bad response")

  const list: string[] = []
  for (const item of data.data?.list ?? []) {
    for (const k of item.keywords ?? []) list.push(decodeName(k.keyword))
  }
  return list.filter(Boolean)
}
