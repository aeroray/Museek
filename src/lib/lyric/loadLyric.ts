import { createAsyncCache } from "@/lib/cache";
import { fetchLocalFileLyric } from "@/lib/localMusic";
import { fetchPreferredLyric } from "@/lib/lyrics/sources";
import {
  isWordByWordLyric,
  linesFromLyricInfo,
} from "@/lib/lyrics/timing";
import { getCachedLyric, putCachedLyric } from "@/lib/mediaCache";
import type { LyricInfo, LyricLine, MusicInfo } from "@/types/music";

function hasLyricPayload(
  info: LyricInfo | null | undefined,
): info is LyricInfo {
  return Boolean(info?.lyric?.trim() || info?.lxlyric?.trim());
}

// Memory + in-flight dedupe on top of disk cache — covers browser preview
// (no disk) and rapid A→B→A / double-play before disk write finishes.
const lyricCache = createAsyncCache<LyricLine[]>(
  30 * 60_000,
  80,
  (lines) => lines.length > 0,
);
const lyricInfoCache = createAsyncCache<LyricInfo | null>(
  30 * 60_000,
  80,
  hasLyricPayload,
);
const LYRIC_CACHE_VERSION = "wbw-prefer-v3";

export { isWordByWordLyric, linesFromLyricInfo };

async function fetchLyricInfo(
  song: MusicInfo,
  cacheSongId: string,
): Promise<LyricInfo | null> {
  // Local file lyrics win every time (.lrc may appear after import).
  if (song.source === "local") {
    const fromFile = await fetchLocalFileLyric({
      filePath: song.meta.filePath,
      embeddedLyric: song.meta.embeddedLyric,
    });
    if (hasLyricPayload(fromFile)) {
      await putCachedLyric(song.source, cacheSongId, fromFile);
      return fromFile;
    }
  }

  let lyricInfo: LyricInfo | null = await getCachedLyric(
    song.source,
    cacheSongId,
  );
  if (!hasLyricPayload(lyricInfo)) {
    lyricInfo = await fetchPreferredLyric(song);
    if (hasLyricPayload(lyricInfo)) {
      await putCachedLyric(song.source, cacheSongId, lyricInfo);
    }
  }
  return hasLyricPayload(lyricInfo) ? lyricInfo : null;
}

/** Write a chosen lyric payload into memory + disk cache for this playing song. */
export async function applyLyricInfo(
  song: MusicInfo,
  info: LyricInfo,
): Promise<LyricLine[]> {
  const cacheSongId = `${song.meta.songId}:${LYRIC_CACHE_VERSION}`;
  const key = `${song.source}:${cacheSongId}`;
  const lines = linesFromLyricInfo(info);
  if (hasLyricPayload(info)) {
    await putCachedLyric(song.source, cacheSongId, info);
    lyricInfoCache.prime(key, info);
  }
  lyricCache.prime(key, lines);
  return lines;
}

async function fetchLyricLines(
  song: MusicInfo,
  cacheSongId: string,
): Promise<LyricLine[]> {
  const lyricInfo = await fetchLyricInfo(song, cacheSongId);
  if (!lyricInfo) return [];
  return linesFromLyricInfo(lyricInfo);
}

/**
 * Local: sidecar / embedded tags, else search platforms and stop at
 * word-by-word. Online: own platform first, then others for word-by-word.
 * Returns [] when nothing is available (caller owns loading UI).
 */
export async function loadLyric(song: MusicInfo): Promise<LyricLine[]> {
  const cacheSongId = `${song.meta.songId}:${LYRIC_CACHE_VERSION}`;
  const key = `${song.source}:${cacheSongId}`;
  return lyricCache(key, () => fetchLyricLines(song, cacheSongId));
}

/** Return the raw lyric payload for download metadata embedding. */
export async function loadLyricInfo(
  song: MusicInfo,
): Promise<LyricInfo | null> {
  const cacheSongId = `${song.meta.songId}:${LYRIC_CACHE_VERSION}`;
  const key = `${song.source}:${cacheSongId}`;
  return lyricInfoCache(key, () => fetchLyricInfo(song, cacheSongId));
}
