import { createAsyncCache } from "@/lib/cache"
import { getBuiltinLyric } from "@/lib/lyric"
import { parseLrc } from "@/lib/lyrics/parser"
import { getCachedLyric, putCachedLyric } from "@/lib/mediaCache"
import { sourceRunner } from "@/lib/sourceRunner"
import type { LyricInfo, LyricLine, MusicInfo } from "@/types/music"

// Memory + in-flight dedupe on top of disk cache — covers browser preview
// (no disk) and rapid A→B→A / double-play before disk write finishes.
const lyricCache = createAsyncCache<LyricLine[]>(30 * 60_000, 80)

async function fetchLyricLines(song: MusicInfo): Promise<LyricLine[]> {
  let lyricInfo: LyricInfo | null = await getCachedLyric(song.source, song.meta.songId)
  if (!lyricInfo?.lyric) {
    lyricInfo = await getBuiltinLyric(song)
    if (!lyricInfo?.lyric) {
      lyricInfo = await sourceRunner.getLyric({
        source: song.source,
        action: "lyric",
        info: song,
      })
    }
    if (lyricInfo?.lyric) putCachedLyric(song.source, song.meta.songId, lyricInfo)
  }
  if (!lyricInfo?.lyric) return []
  return parseLrc(lyricInfo.lyric, lyricInfo.tlyric ?? undefined)
}

/**
 * Cache → builtin platform APIs → source script → parse.
 * Returns [] when nothing is available (caller owns loading UI).
 */
export async function loadLyric(song: MusicInfo): Promise<LyricLine[]> {
  const key = `${song.source}:${song.meta.songId}`
  return lyricCache(key, () => fetchLyricLines(song))
}
