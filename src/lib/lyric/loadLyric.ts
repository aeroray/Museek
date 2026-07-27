import { createAsyncCache } from "@/lib/cache"
import { getBuiltinLyric } from "@/lib/lyric"
import { getWyLyric } from "@/lib/lyric/extra"
import { fetchLocalFileLyric } from "@/lib/localMusic"
import { parseLrc } from "@/lib/lyrics/parser"
import { getCachedLyric, putCachedLyric } from "@/lib/mediaCache"
import { searchWangyi } from "@/lib/search/wy"
import { sourceRunner } from "@/lib/sourceRunner"
import type { LyricInfo, LyricLine, MusicInfo } from "@/types/music"

// Memory + in-flight dedupe on top of disk cache — covers browser preview
// (no disk) and rapid A→B→A / double-play before disk write finishes.
const lyricCache = createAsyncCache<LyricLine[]>(30 * 60_000, 80)

/** Fallback when no sidecar / embedded timed lyric: NetEase search by title/artist. */
async function fetchLocalLyricOnline(song: MusicInfo): Promise<LyricInfo | null> {
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
  // Local: prefer file-side sources every time (.lrc may appear after import).
  if (song.source === "local") {
    const fromFile = await fetchLocalFileLyric({
      filePath: song.meta.filePath,
      embeddedLyric: song.meta.embeddedLyric,
    })
    if (fromFile?.lyric) {
      putCachedLyric(song.source, song.meta.songId, fromFile)
      return parseLrc(fromFile.lyric, fromFile.tlyric ?? undefined)
    }
  }

  let lyricInfo: LyricInfo | null = await getCachedLyric(song.source, song.meta.songId)
  if (!lyricInfo?.lyric) {
    if (song.source === "local") {
      lyricInfo = await fetchLocalLyricOnline(song)
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
 * Local: sidecar .lrc / embedded tags → cache → NetEase search.
 * Returns [] when nothing is available (caller owns loading UI).
 */
export async function loadLyric(song: MusicInfo): Promise<LyricLine[]> {
  const key = `${song.source}:${song.meta.songId}`
  return lyricCache(key, () => fetchLyricLines(song))
}
