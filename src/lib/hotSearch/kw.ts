import { httpFetch as tauriFetch } from "@/lib/http"

// Ported from lx-music-desktop: src/renderer/utils/musicSdk/kw/hotSearch.js

interface KwHotResponse {
  status?: string
  tagvalue?: { key?: string }[]
}

const URL =
  "http://hotword.kuwo.cn/hotword.s?prod=kwplayer_ar_9.3.0.1&corp=kuwo&newver=2&vipver=9.3.0.1&source=kwplayer_ar_9.3.0.1_40.apk&p2p=1&notrace=0&uid=0&plat=kwplayer_ar&rformat=json&encoding=utf8&tabid=1"

export async function getKwHotSearch(): Promise<string[]> {
  const res = await tauriFetch(URL, {
    headers: { "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 9;)" },
  })

  if (!res.ok) throw new Error(`KuWo hot search failed: ${res.status}`)
  const data = (await res.json()) as KwHotResponse
  if (data.status !== "ok") throw new Error("KuWo hot search failed: bad response")
  return (data.tagvalue ?? []).map((i) => i.key ?? "").filter(Boolean)
}
