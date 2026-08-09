import { createAsyncCache } from "@/lib/cache";
import { getBuiltinLyric } from "@/lib/lyric";
import { getWyLyric } from "@/lib/lyric/extra";
import { fetchLocalFileLyric } from "@/lib/localMusic";
import { parseLrc } from "@/lib/lyrics/parser";
import { getCachedLyric, putCachedLyric } from "@/lib/mediaCache";
import { searchWangyi } from "@/lib/search/wy";
import { sourceRunner } from "@/lib/sourceRunner";
import { applyKaraokeTiming, parseLyricDuration } from "@/lib/lyrics/timing";
import type { LyricInfo, LyricLine, MusicInfo } from "@/types/music";

// Memory + in-flight dedupe on top of disk cache — covers browser preview
// (no disk) and rapid A→B→A / double-play before disk write finishes.
const lyricCache = createAsyncCache<LyricLine[]>(30 * 60_000, 80);
const LYRIC_CACHE_VERSION = "word-timing-v3";

function hasLyricPayload(
  info: LyricInfo | null | undefined,
): info is LyricInfo {
  return Boolean(info?.lyric?.trim() || info?.lxlyric?.trim());
}

function parseLyricInfo(info: LyricInfo, songDuration: number): LyricLine[] {
  const timedLyric = info.lxlyric?.trim();
  const primary =
    timedLyric && /\[\d{1,2}:\d{2}/.test(timedLyric) ? timedLyric : info.lyric;
  if (!primary?.trim()) return [];
  return applyKaraokeTiming(
    parseLrc(primary, info.tlyric ?? undefined),
    songDuration,
  );
}

/** Fallback when no sidecar / embedded timed lyric: NetEase search by title/artist. */
async function fetchLocalLyricOnline(
  song: MusicInfo,
): Promise<LyricInfo | null> {
  const q = [song.name, song.singer].filter(Boolean).join(" ").trim();
  if (!q) return null;
  try {
    const result = await searchWangyi(q, 1, 5);
    const hit = result.list[0];
    if (!hit?.meta.songId) return null;
    return await getWyLyric(hit);
  } catch {
    return null;
  }
}

async function fetchLyricLines(
  song: MusicInfo,
  cacheSongId: string,
): Promise<LyricLine[]> {
  // Local: prefer file-side sources every time (.lrc may appear after import).
  if (song.source === "local") {
    const fromFile = await fetchLocalFileLyric({
      filePath: song.meta.filePath,
      embeddedLyric: song.meta.embeddedLyric,
    });
    if (hasLyricPayload(fromFile)) {
      putCachedLyric(song.source, cacheSongId, fromFile);
      return parseLyricInfo(fromFile, parseLyricDuration(song.interval));
    }
  }

  let lyricInfo: LyricInfo | null = await getCachedLyric(
    song.source,
    cacheSongId,
  );
  if (!hasLyricPayload(lyricInfo)) {
    if (song.source === "local") {
      lyricInfo = await fetchLocalLyricOnline(song);
    } else {
      lyricInfo = await getBuiltinLyric(song);
      if (!hasLyricPayload(lyricInfo)) {
        lyricInfo = await sourceRunner.getLyric({
          source: song.source,
          action: "lyric",
          info: song,
        });
      }
    }
    if (hasLyricPayload(lyricInfo)) {
      putCachedLyric(song.source, cacheSongId, lyricInfo);
    }
  }
  if (!hasLyricPayload(lyricInfo)) return [];
  return parseLyricInfo(lyricInfo, parseLyricDuration(song.interval));
}

/**
 * Cache → builtin platform APIs → source script → parse.
 * Local: sidecar .lrc / embedded tags → cache → NetEase search.
 * Returns [] when nothing is available (caller owns loading UI).
 */
export async function loadLyric(song: MusicInfo): Promise<LyricLine[]> {
  const cacheSongId = `${song.meta.songId}:${LYRIC_CACHE_VERSION}`;
  const key = `${song.source}:${cacheSongId}`;
  return lyricCache(key, () => fetchLyricLines(song, cacheSongId));
}
