/**
 * Lyrics module — load, parse, active-line, fullscreen helpers.
 * Prefer `@/lib/lyrics` over the older `lyric` / `lyrics` split paths.
 */
export { parseLrc } from "./parser"
export { findActiveLyricIndex } from "./activeLine"
export {
  LYRIC_OFFSET_STEP,
  applyLyricOffsetForSong,
  bumpLyricOffset,
  resetLyricOffset,
} from "./offset"
export { loadLyric } from "@/lib/lyric/loadLyric"
export { getBuiltinLyric } from "@/lib/lyric"
export {
  isLyricsFullscreenSession,
  enterLyricsFullscreen,
  exitLyricsFullscreen,
  syncLyricsFullscreenState,
} from "@/lib/lyricsFullscreen"
