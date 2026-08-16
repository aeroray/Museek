import { searchKugou } from "@/lib/search/kg"
import { searchKuwo } from "@/lib/search/kuwo"
import { searchMigu } from "@/lib/search/mg"
import { searchTx } from "@/lib/search/tx"
import { searchWangyi } from "@/lib/search/wy"
import { sourceRunner } from "@/lib/sourceRunner"
import type { MusicInfo, OnlineSource, Quality, SearchResult } from "@/types/music"
import type { SourceInfo, SourceScript } from "@/types/source"

const PLATFORM_ORDER: OnlineSource[] = ["wy", "kw", "kg", "tx", "mg"]

/** Nursery-rhyme query: widely indexed and often not VIP-locked. */
const PROBE_QUERY = "小星星"
const PROBE_SONGS = 2

type SearchFn = (
  query: string,
  page?: number,
  limit?: number,
) => Promise<SearchResult>

const searchFns: Record<OnlineSource, SearchFn> = {
  kw: searchKuwo,
  kg: searchKugou,
  tx: searchTx,
  wy: searchWangyi,
  mg: searchMigu,
}

export type SourceProbeResult = {
  /** Platform id → whether a real play URL came back. */
  platforms: Record<string, boolean>
}

function pickQuality(info: SourceInfo | undefined): Quality {
  const listed = info?.qualitys ?? []
  if (listed.includes("128k")) return "128k"
  if (listed.includes("320k")) return "320k"
  return listed[0] ?? "128k"
}

export function testablePlatforms(script: SourceScript): OnlineSource[] {
  const declared = script.sources ? Object.keys(script.sources) : []
  return PLATFORM_ORDER.filter((id) => {
    if (!declared.includes(id)) return false
    const info = script.sources?.[id]
    if (info?.actions?.length && !info.actions.includes("musicUrl")) return false
    return true
  })
}

/** One catalog fetch per platform for a whole “test all” run. */
export async function loadProbeCatalog(): Promise<
  Partial<Record<OnlineSource, MusicInfo[]>>
> {
  const entries = await Promise.all(
    PLATFORM_ORDER.map(async (source) => {
      try {
        const result = await searchFns[source](PROBE_QUERY, 1, PROBE_SONGS)
        const list = result.list.filter((song) => song.source === source)
        return [source, list] as const
      } catch {
        return [source, [] as MusicInfo[]] as const
      }
    }),
  )
  const catalog: Partial<Record<OnlineSource, MusicInfo[]>> = {}
  for (const [source, list] of entries) {
    if (list.length) catalog[source] = list
  }
  return catalog
}

async function probePlatform(
  scriptId: string,
  platform: OnlineSource,
  songs: MusicInfo[],
  quality: Quality,
): Promise<boolean> {
  for (const song of songs) {
    const ok = await sourceRunner.probeMusicUrl(scriptId, {
      source: platform,
      action: "musicUrl",
      info: song,
      type: quality,
    })
    if (ok) return true
  }
  return false
}

/**
 * Probe each declared, testable platform. Platforms run in parallel; one
 * working URL per platform is enough.
 */
export async function probeSourceScript(
  script: SourceScript,
  catalog: Partial<Record<OnlineSource, MusicInfo[]>>,
): Promise<SourceProbeResult> {
  const platforms = testablePlatforms(script)
  const entries = await Promise.all(
    platforms.map(async (platform) => {
      const songs = catalog[platform]
      if (!songs?.length) return null
      const quality = pickQuality(script.sources?.[platform])
      const ok = await probePlatform(script.id, platform, songs, quality)
      return [platform, ok] as const
    }),
  )
  const result: Record<string, boolean> = {}
  for (const entry of entries) {
    if (!entry) continue
    result[entry[0]] = entry[1]
  }
  return { platforms: result }
}

export function probeAllFailed(result: SourceProbeResult): boolean {
  const values = Object.values(result.platforms)
  return values.length > 0 && values.every((ok) => !ok)
}

export function probeAllPassed(result: SourceProbeResult): boolean {
  const values = Object.values(result.platforms)
  return values.length > 0 && values.every(Boolean)
}

/** Run at most `limit` tasks at once. */
export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    for (;;) {
      const i = next
      next += 1
      if (i >= items.length) return
      out[i] = await fn(items[i], i)
    }
  }
  const n = Math.max(1, Math.min(limit, items.length))
  await Promise.all(Array.from({ length: n }, () => worker()))
  return out
}

/** Concurrent sources to probe at once — high enough to be quick, low enough to avoid 429 false fails. */
export const PROBE_SOURCE_CONCURRENCY = 6

