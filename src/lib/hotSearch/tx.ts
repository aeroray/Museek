import { httpFetch as tauriFetch } from "@/lib/http"

// Ported from lx-music-desktop: src/renderer/utils/musicSdk/tx/hotSearch.js
// QQ Music hot keywords via musicu.fcg (tencent_musicsoso_hotkey.HotkeyService).

interface TxHotResponse {
  code?: number
  hotkey?: { code?: number; data?: { vec_hotkey?: { query?: string }[] } }
}

export async function getTxHotSearch(): Promise<string[]> {
  const reqBody = {
    comm: { uin: 0, format: "json", ct: 20, cv: 1859 },
    hotkey: {
      module: "tencent_musicsoso_hotkey.HotkeyService",
      method: "GetHotkeyForQQMusicPC",
      param: { search_id: "", uin: 0 },
    },
  }

  const res = await tauriFetch("https://u.y.qq.com/cgi-bin/musicu.fcg", {
    method: "POST",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; WOW64; Trident/5.0)",
      Referer: "https://y.qq.com/portal/player.html",
    },
    body: JSON.stringify(reqBody),
  })

  if (!res.ok) throw new Error(`QQ hot search failed: ${res.status}`)
  const data = (await res.json()) as TxHotResponse
  return (data.hotkey?.data?.vec_hotkey ?? []).map((i) => i.query ?? "").filter(Boolean)
}
