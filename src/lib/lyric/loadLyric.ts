import { getBuiltinLyric } from "@/lib/lyric"
import { parseLrc } from "@/lib/lyrics/parser"
import { getCachedLyric, putCachedLyric } from "@/lib/mediaCache"
import { sourceRunner } from "@/lib/sourceRunner"
import type { LyricLine, MusicInfo } from "@/types/music"

/**
 * Cache → builtin platform APIs → source script → parse.
 * Returns [] when nothing is available (caller owns loading UI).
 */
export async function loadLyric(song: MusicInfo): Promise<LyricLine[]> {
  let lyricInfo = await getCachedLyric(song.source, song.meta.songId)
  if (!lyricInfo?.lyric) {
    lyricInfo = await getBuiltinLyric(song)
    if (!lyricInfo?.lyric) {
      lyricInfo = await sourceRunner.getLyric({ source: song.source, action: "lyric", info: song })
    }
    if (lyricInfo?.lyric) putCachedLyric(song.source, song.meta.songId, lyricInfo)
  }
  if (!lyricInfo?.lyric) return []
  return parseLrc(lyricInfo.lyric, lyricInfo.tlyric ?? undefined)
}
