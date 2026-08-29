import { PLATFORM_ORDER } from "@/components/common/PlatformTabs"
import { getBuiltinLyric } from "@/lib/lyric"
import {
  isWordByWordLyric,
  linesFromLyricInfo,
} from "@/lib/lyrics/timing"
import { lyricProbeSong, lyricSearchQueries, pickBestMatch } from "@/lib/lyrics/matchSong"
import { searchKugou } from "@/lib/search/kg"
import { searchKuwo } from "@/lib/search/kuwo"
import { searchMigu } from "@/lib/search/mg"
import { searchTx } from "@/lib/search/tx"
import { searchWangyi } from "@/lib/search/wy"
import { sourceRunner } from "@/lib/sourceRunner"
import type { LyricInfo, MusicInfo, OnlineSource } from "@/types/music"

export type PlatformLyricStatus = "ok" | "empty" | "error" | "pending"

export type PlatformLyricOption = {
  source: OnlineSource
  status: PlatformLyricStatus
  wordByWord: boolean
}

function hasLyricPayload(
  info: LyricInfo | null | undefined,
): info is LyricInfo {
  return Boolean(info?.lyric?.trim() || info?.lxlyric?.trim())
}

function platformOrderFor(song: MusicInfo): OnlineSource[] {
  if (song.source === "local") return [...PLATFORM_ORDER]
  const own = song.source
  return [own, ...PLATFORM_ORDER.filter((platform) => platform !== own)]
}

function isWordByWordInfo(info: LyricInfo, lines: ReturnType<typeof linesFromLyricInfo>): boolean {
  return (
    isWordByWordLyric(lines) ||
    Boolean(info.lxlyric && /<\d+,\d+>/.test(info.lxlyric))
  )
}

const INSTRUMENTAL_HINT =
  /没有填词的纯音乐|纯音乐，请欣赏|纯音乐 请欣赏/i
const CREDIT_LINE =
  /^(作词|作曲|编曲|制作人|混音|录音师|出品人|监制|lyricist|composer|arranger)\s*[:：]/i

/** Platform "this is instrumental" notices are not lyrics. */
function lyricLooksInstrumental(
  info: LyricInfo,
  lines: ReturnType<typeof linesFromLyricInfo>,
): boolean {
  const sung = lines.filter((line) => {
    const text = line.text.trim()
    if (!text) return false
    if (INSTRUMENTAL_HINT.test(text)) return false
    if (CREDIT_LINE.test(text)) return false
    return true
  })
  if (sung.length === 0) return true
  const blob = `${info.lyric}\n${info.lxlyric ?? ""}`
  return sung.length <= 2 && INSTRUMENTAL_HINT.test(blob)
}

type FetchedLyric = { info: LyricInfo; wordByWord: boolean }
type Payload = { info: LyricInfo }

const SEARCH_LIMIT = 20

const searchFns: Record<
  OnlineSource,
  (query: string, page?: number, limit?: number) => Promise<{ list: MusicInfo[] }>
> = {
  kw: searchKuwo,
  kg: searchKugou,
  tx: searchTx,
  wy: searchWangyi,
  mg: searchMigu,
}

const picks = new Map<string, OnlineSource>()
const payloads = new Map<string, Payload>()
const inflight = new Map<string, Promise<PlatformLyricOption[]>>()

function songKey(song: MusicInfo): string {
  return `${song.source}:${song.meta.songId}`
}

function probeIdentityKey(song: MusicInfo): string {
  const probe = lyricProbeSong(song)
  return `${songKey(song)}:${probe.name}:${probe.singer}`
}

function payloadKey(song: MusicInfo, platform: OnlineSource): string {
  return `${probeIdentityKey(song)}:${platform}`
}

export function selectedLyricSource(song: MusicInfo): OnlineSource | null {
  return (
    picks.get(songKey(song)) ??
    (song.source === "local"
      ? song.meta.wySongId
        ? "wy"
        : null
      : song.source)
  )
}

async function resolvePlatformSong(
  song: MusicInfo,
  platform: OnlineSource,
): Promise<MusicInfo | null> {
  if (song.source === platform) return song
  if (
    platform === "wy" &&
    song.source === "local" &&
    song.meta.wySongId
  ) {
    const probe = lyricProbeSong(song)
    return {
      ...probe,
      source: "wy",
      meta: { ...probe.meta, songId: song.meta.wySongId },
    }
  }

  const probe = lyricProbeSong(song)
  const seen = new Set<string>()
  const hits: MusicInfo[] = []
  for (const query of lyricSearchQueries(song)) {
    const result = await searchFns[platform](query, 1, SEARCH_LIMIT)
    for (const hit of result.list) {
      if (!hit.id || seen.has(hit.id)) continue
      seen.add(hit.id)
      hits.push(hit)
    }
    const matched = pickBestMatch(probe, hits)
    if (matched) return matched
  }
  return pickBestMatch(probe, hits)
}

async function probeOne(
  song: MusicInfo,
  platform: OnlineSource,
): Promise<PlatformLyricOption> {
  try {
    const cached = payloads.get(payloadKey(song, platform))
    if (cached) {
      const lines = linesFromLyricInfo(cached.info)
      if (!lines.length || lyricLooksInstrumental(cached.info, lines)) {
        return { source: platform, status: "empty", wordByWord: false }
      }
      return {
        source: platform,
        status: "ok",
        wordByWord: isWordByWordInfo(cached.info, lines),
      }
    }
    const hit = await resolvePlatformSong(song, platform)
    if (!hit) return { source: platform, status: "empty", wordByWord: false }
    const info = await getBuiltinLyric(hit)
    if (!info?.lyric?.trim() && !info?.lxlyric?.trim()) {
      return { source: platform, status: "empty", wordByWord: false }
    }
    const lines = linesFromLyricInfo(info)
    if (!lines.length || lyricLooksInstrumental(info, lines)) {
      return { source: platform, status: "empty", wordByWord: false }
    }
    payloads.set(payloadKey(song, platform), { info })
    return {
      source: platform,
      status: "ok",
      wordByWord: isWordByWordInfo(info, lines),
    }
  } catch (error) {
    console.error("[museek] lyric probe failed", platform, error)
    return { source: platform, status: "error", wordByWord: false }
  }
}

export async function listPlatformLyrics(
  song: MusicInfo,
  onUpdate?: (options: PlatformLyricOption[]) => void,
): Promise<PlatformLyricOption[]> {
  const key = probeIdentityKey(song)
  const pending = inflight.get(key)
  if (pending) return pending

  const options: PlatformLyricOption[] = PLATFORM_ORDER.map((source) => ({
    source,
    status: "pending",
    wordByWord: false,
  }))
  onUpdate?.([...options])

  const request = (async () => {
    await Promise.all(
      PLATFORM_ORDER.map(async (platform, index) => {
        options[index] = await probeOne(song, platform)
        onUpdate?.([...options])
      }),
    )
    inflight.delete(key)
    return [...options]
  })()
  inflight.set(key, request)
  try {
    return await request
  } catch {
    inflight.delete(key)
    return PLATFORM_ORDER.map((source) => ({
      source,
      status: "error" as const,
      wordByWord: false,
    }))
  }
}

async function lyricFromPlatform(
  song: MusicInfo,
  platform: OnlineSource,
): Promise<FetchedLyric | null> {
  const hit = await resolvePlatformSong(song, platform)
  if (!hit) return null
  let info = await getBuiltinLyric(hit)
  if (!hasLyricPayload(info) && song.source === platform) {
    try {
      info = await sourceRunner.getLyric({
        source: platform,
        action: "lyric",
        info: song,
      })
    } catch {
      info = null
    }
  }
  if (!hasLyricPayload(info)) return null
  const lines = linesFromLyricInfo(info)
  if (!lines.length || lyricLooksInstrumental(info, lines)) return null
  payloads.set(payloadKey(song, platform), { info })
  return { info, wordByWord: isWordByWordInfo(info, lines) }
}

type PlatformFetch = {
  platform: OnlineSource
  task: Promise<FetchedLyric | null>
}

function startPlatformFetches(
  song: MusicInfo,
  platforms: OnlineSource[],
): PlatformFetch[] {
  return platforms.map((platform) => ({
    platform,
    task: lyricFromPlatform(song, platform).catch((error) => {
      console.error("[museek] lyric search failed", platform, error)
      return null
    }),
  }))
}

/** First word-by-word among completed fetches; else first plain in `platforms` order. */
async function pickFromFetches(
  fetches: PlatformFetch[],
): Promise<{ platform: OnlineSource; fetched: FetchedLyric } | null> {
  if (!fetches.length) return null

  return await new Promise((resolve) => {
    let settled = false
    let pending = fetches.length
    const byPlatform = new Map<OnlineSource, FetchedLyric | null>()

    const finish = (
      row: { platform: OnlineSource; fetched: FetchedLyric } | null,
    ) => {
      if (settled) return
      settled = true
      resolve(row)
    }

    const plainFallback = () => {
      for (const { platform } of fetches) {
        const fetched = byPlatform.get(platform)
        if (fetched) return { platform, fetched }
      }
      return null
    }

    for (const { platform, task } of fetches) {
      void task.then((fetched) => {
        byPlatform.set(platform, fetched)
        pending--
        if (fetched?.wordByWord) {
          finish({ platform, fetched })
          return
        }
        if (pending === 0) finish(plainFallback())
      })
    }
  })
}

/**
 * Playback lyric pick: own platform first (or all five for local files).
 * Requests run in parallel; stop waiting at the first word-by-word hit.
 */
export async function fetchPreferredLyric(
  song: MusicInfo,
): Promise<LyricInfo | null> {
  const order = platformOrderFor(song)
  const fetches = startPlatformFetches(song, order)
  const own =
    song.source !== "local" && order[0] === song.source ? order[0] : null

  if (own) {
    const ownFetched = await fetches[0].task
    if (ownFetched?.wordByWord) {
      picks.set(songKey(song), own)
      return ownFetched.info
    }
    const rest = await pickFromFetches(fetches.slice(1))
    if (rest?.fetched.wordByWord) {
      picks.set(songKey(song), rest.platform)
      return rest.fetched.info
    }
    if (ownFetched) {
      picks.set(songKey(song), own)
      return ownFetched.info
    }
    if (rest) {
      picks.set(songKey(song), rest.platform)
      return rest.fetched.info
    }
    return null
  }

  const picked = await pickFromFetches(fetches)
  if (!picked) return null
  picks.set(songKey(song), picked.platform)
  return picked.fetched.info
}

export async function loadPlatformLyric(
  song: MusicInfo,
  platform: OnlineSource,
): Promise<LyricInfo | null> {
  const existing = payloads.get(payloadKey(song, platform))
  if (existing) {
    picks.set(songKey(song), platform)
    return existing.info
  }
  await listPlatformLyrics(song)
  const payload = payloads.get(payloadKey(song, platform))
  if (!payload) return null
  picks.set(songKey(song), platform)
  return payload.info
}
