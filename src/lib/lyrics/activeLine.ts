import type { LyricLine } from "@/types/music"

/** Active lyric line for a playback time (last line with time ≤ currentTime). */
export function findActiveLyricIndex(lines: LyricLine[], currentTime: number): number {
  if (!lines.length) return -1
  for (let i = lines.length - 1; i >= 0; i--) {
    if (currentTime >= lines[i].time) return i
  }
  return -1
}
