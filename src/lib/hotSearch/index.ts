import { createAsyncCache } from "@/lib/cache"
import { getWyHotSearch } from "./wy"
import { getTxHotSearch } from "./tx"
import { getKwHotSearch } from "./kw"
import { getKgHotSearch } from "./kg"
import { getMgHotSearch } from "./mg"
import type { Source } from "@/types/music"

// Per-platform "hot search" (热搜) keyword lists, ported from lx-music-desktop's
// musicSdk/<platform>/hotSearch.js. Each fetcher returns keywords already ordered
// hottest-first; index becomes the rank used by the UI for sizing / emphasis.

export interface HotKeyword {
  keyword: string
  rank: number // 0 = hottest
}

type HotFn = () => Promise<string[]>

const hotFns: Record<Source, HotFn> = {
  wy: getWyHotSearch,
  tx: getTxHotSearch,
  kw: getKwHotSearch,
  kg: getKgHotSearch,
  mg: getMgHotSearch,
}

// Hot keywords change slowly — cache 10 minutes per platform (also de-dupes rapid
// re-fetches when toggling platforms back and forth).
const hotCache = createAsyncCache<HotKeyword[]>(10 * 60_000)

const MAX = 30

export function getHotSearch(source: Source): Promise<HotKeyword[]> {
  return hotCache(source, async () => {
    const raw = await hotFns[source]()
    const seen = new Set<string>()
    const list: HotKeyword[] = []
    for (const kw of raw) {
      const k = (kw ?? "").trim()
      if (!k || seen.has(k)) continue
      seen.add(k)
      list.push({ keyword: k, rank: list.length })
      if (list.length >= MAX) break
    }
    return list
  })
}
