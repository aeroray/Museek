import type { LyricLine } from "@/types/music"

const timeRx = /^\[(\d{1,2}):(\d{2})\.(\d{2,3})\]/

export function parseLrc(lrc: string, translation?: string | null): LyricLine[] {
  const lines = lrc.split(/\r?\n/)
  const result: LyricLine[] = []

  for (const line of lines) {
    const match = timeRx.exec(line)
    if (!match) continue
    const minutes = parseInt(match[1])
    const seconds = parseInt(match[2])
    const millis = parseInt(match[3].padEnd(3, "0"))
    const time = minutes * 60 + seconds + millis / 1000
    const text = line.replace(timeRx, "").trim()
    if (text) result.push({ time, text })
  }

  const sorted = result.sort((a, b) => a.time - b.time)

  if (translation) {
    const tLines = parseLrc(translation)
    for (const tLine of tLines) {
      const match = sorted.find((l) => Math.abs(l.time - tLine.time) < 0.1)
      if (match) match.translation = tLine.text
    }
  }

  return sorted
}
