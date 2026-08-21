import type { LyricLine } from "@/types/music"

/** Active lyric line for a playback time (last line with time ≤ currentTime). */
export function findActiveLyricIndex(lines: LyricLine[], currentTime: number): number {
  if (!lines.length) return -1
  for (let i = lines.length - 1; i >= 0; i--) {
    if (currentTime >= lines[i].time) return i
  }
  return -1
}

/** Desktop two-line mode: translation if present, otherwise the next sung line. */
export function desktopLyricSecondaryText(
  lines: LyricLine[],
  index: number,
): string | null {
  const current = lines[index]
  if (!current) return null
  const translation = current.translation?.trim()
  if (translation) return translation
  for (let i = index + 1; i < lines.length; i++) {
    const text = lines[i]?.text?.trim()
    if (text) return text
  }
  return null
}
