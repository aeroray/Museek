/**
 * Deciding *what* the desktop-lyrics window needs to be told, and *when*.
 *
 * The main window pushes a lyric snapshot over IPC whenever the player store
 * changes. `timeupdate` fires ~4 times a second and every tick calls
 * `_syncFromAudio`, which always writes to the store, so the subscriber runs on
 * every tick whether or not anything the lyric window renders has changed. The
 * dedupe key is therefore the only thing standing between the player and a
 * full re-serialization of the lyric-line array — with per-word karaoke timings
 * — several times a second.
 *
 * It used to include `Math.round(currentTime * 1000)`, which changes on every
 * tick, so the dedupe never matched during playback. Keeping this in a pure
 * module lets `scripts/check-desktop-lyrics-snapshot-key.mjs` pin the rule
 * without a Tauri bridge: the key must be blind to the clock and sensitive to
 * everything the window actually renders.
 */
import type { usePlayerStore } from "@/stores/playerStore";
import type { LyricLine } from "@/types/music";

type PlayerSnapshotState = ReturnType<typeof usePlayerStore.getState>;

/**
 * Cheap 32-bit string hash (FNV-1a).
 *
 * The key has to notice *content*, not just length: switching lyric source for
 * the same song routinely produces a different lyric with the same line count
 * and similar line lengths. Hashing keeps that cheap — this runs on every player
 * store change, and the whole point of the key is to avoid serializing the lines.
 */
function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Cheap fingerprint of the lyric payload.
 *
 * Must change whenever the window would render something different — including a
 * re-fetched lyric for the same song with the same line count — but must not
 * serialize the lines themselves.
 */
export function lyricLinesKey(lines: readonly LyricLine[]): string {
  let key = `${lines.length};`;
  for (const line of lines) {
    key += `${line.time}:${hashString(line.text)}:${hashString(line.translation ?? "")}:${line.words?.length ?? 0};`;
  }
  return key;
}

/**
 * Identity of the payload the window would receive.
 *
 * Deliberately excludes the playback clock: the smooth clock has its own
 * `desktop-lyrics/time` event, and the window recomputes the active line locally
 * from `currentTime`.
 */
export function snapshotKey(state: PlayerSnapshotState): string {
  return [
    state.currentSong?.id ?? "",
    state.currentSong?.name ?? "",
    state.currentSong?.singer ?? "",
    state.isPlaying,
    state.status,
    state.lyricsLoading,
    state.duration,
    state.currentPicUrl ?? state.currentSong?.meta.picUrl ?? "",
    lyricLinesKey(state.lyricLines),
  ].join("|");
}
