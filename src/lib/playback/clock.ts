import { useCallback, useSyncExternalStore } from "react";
import { audioPlayer } from "@/lib/audio";
import { findActiveLyricIndex } from "@/lib/lyrics/activeLine";
import type { LyricLine } from "@/types/music";

/**
 * Playback-clock seam — UI and stores subscribe here instead of touching the
 * audio element. Coarse state still flows through playerStore via timeupdate;
 * this is the smooth (~rAF) clock for seek bars and similar.
 */
export function subscribePlaybackTime(
  cb: (currentTime: number) => void,
): () => void {
  return audioPlayer.subscribeTime(cb);
}

export function getPlaybackTime(): number {
  return audioPlayer.getCurrentTime();
}

/** Playback time used for lyric highlighting / karaoke. */
export function getLyricTime(): number {
  return getPlaybackTime();
}

const subscribePlaybackStore = (onStoreChange: () => void): (() => void) =>
  subscribePlaybackTime(() => onStoreChange());

export function usePlaybackTime(): number {
  return useSyncExternalStore(subscribePlaybackStore, getPlaybackTime, () => 0);
}

export function useLyricTime(): number {
  return useSyncExternalStore(subscribePlaybackStore, getLyricTime, () => 0);
}

export function usePlaybackLyricIndex(lines: LyricLine[]): number {
  const getSnapshot = useCallback(
    () => findActiveLyricIndex(lines, getLyricTime()),
    [lines],
  );
  const getServerSnapshot = useCallback(
    () => findActiveLyricIndex(lines, 0),
    [lines],
  );
  return useSyncExternalStore(
    subscribePlaybackStore,
    getSnapshot,
    getServerSnapshot,
  );
}
