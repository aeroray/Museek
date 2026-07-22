import { audioPlayer } from "@/lib/audio"

/**
 * Playback-clock seam — UI and stores subscribe here instead of touching the
 * audio element. Coarse state still flows through playerStore via timeupdate;
 * this is the smooth (~rAF) clock for seek bars and similar.
 */
export function subscribePlaybackTime(cb: (currentTime: number) => void): () => void {
  return audioPlayer.subscribeTime(cb)
}
