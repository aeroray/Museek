import { createAsyncCache } from "@/lib/cache"
import { getBuiltinLyric } from "@/lib/lyric"
import { getWyLyric } from "@/lib/lyric/extra"
import { parseLrc } from "@/lib/lyrics/parser"
import { getCachedLyric, putCachedLyric } from "@/lib/mediaCache"
import { searchWangyi } from "@/lib/search/wy"
import { sourceRunner } from "@/lib/sourceRunner"
import type { LyricInfo, LyricLine, MusicInfo } from "@/types/music"

// Memory + in-flight dedupe on top of disk cache — covers browser preview
// (no disk) and rapid A→B→A / double-play before disk write finishes.
const lyricCache = createAsyncCache<LyricLine[]>(30 * 60_000, 80)

/** Local files have no platform id — search NetEase by title/artist and pull lyrics. */
async function fetchLocalLyric(song: MusicInfo): Promise<LyricInfo | null> {
  const q = [song.name, song.singer].filter(Boolean).join(" ").trim()
  if (!q) return null
  try {
    const result = await searchWangyi(q, 1, 5)
    const hit = result.list[0]
    if (!hit?.meta.songId) return null
    return await getWyLyric(hit)
  } catch {
    return null
  }
}

async function fetchLyricLines(song: MusicInfo): Promise<LyricLine[]> {
  let lyricInfo: LyricInfo | null = await getCachedLyric(song.source, song.meta.songId)
  if (!lyricInfo?.lyric) {
    if (song.source === "local") {
      lyricInfo = await fetchLocalLyric(song)
    } else {
      lyricInfo = await getBuiltinLyric(song)
      if (!lyricInfo?.lyric) {
        lyricInfo = await sourceRunner.getLyric({
          source: song.source,
          action: "lyric",
          info: song,
        })
      }
    }
    if (lyricInfo?.lyric) putCachedLyric(song.source, song.meta.songId, lyricInfo)
  }
  if (!lyricInfo?.lyric) return []
  return parseLrc(lyricInfo.lyric, lyricInfo.tlyric ?? undefined)
}

/**
 * Cache → builtin platform APIs → source script → parse.
 * Local: cache → NetEase search by name/artist → wy lyric.
 * Returns [] when nothing is available (caller owns loading UI).
 */
export async function loadLyric(song: MusicInfo): Promise<LyricLine[]> {
  const key = `${song.source}:${song.meta.songId}`
  return lyricCache(key, () => fetchLyricLines(song))
}
