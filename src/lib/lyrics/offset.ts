import { useSyncExternalStore } from "react"
import {
  getCachedLyricOffset,
  putCachedLyricOffset,
} from "@/lib/mediaCache"
import type { MusicInfo } from "@/types/music"

/** Same step as NetEase / lx-music lyric delay controls. */
export const LYRIC_OFFSET_STEP = 0.5
export const LYRIC_OFFSET_MIN = -10
export const LYRIC_OFFSET_MAX = 10

let songKey = ""
let offsetSec = 0
let loadGen = 0
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

function clampOffset(value: number): number {
  if (!Number.isFinite(value)) return 0
  const stepped = Math.round(value / LYRIC_OFFSET_STEP) * LYRIC_OFFSET_STEP
  return Math.min(LYRIC_OFFSET_MAX, Math.max(LYRIC_OFFSET_MIN, +stepped.toFixed(1)))
}

function keyFor(song: MusicInfo): string {
  return `${song.source}:${song.meta.songId}`
}

export function getLyricOffset(): number {
  return offsetSec
}

export function subscribeLyricOffset(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useLyricOffset(): number {
  return useSyncExternalStore(
    subscribeLyricOffset,
    getLyricOffset,
    () => 0,
  )
}

export function formatLyricOffset(seconds: number): string {
  const value = clampOffset(seconds)
  const abs = Math.abs(value).toFixed(1)
  if (value > 0) return `+${abs}s`
  if (value < 0) return `-${abs}s`
  return "0.0s"
}

function setMemory(key: string, seconds: number) {
  const next = clampOffset(seconds)
  if (songKey === key && offsetSec === next) return
  songKey = key
  offsetSec = next
  notify()
}

/** Drop in-memory offset (e.g. after Settings → clear cache). */
export function resetLyricOffset() {
  loadGen += 1
  setMemory("", 0)
}

export async function applyLyricOffsetForSong(
  song: MusicInfo | null,
): Promise<void> {
  const gen = ++loadGen
  if (!song) {
    setMemory("", 0)
    return
  }
  const key = keyFor(song)
  setMemory(key, 0)
  const stored = await getCachedLyricOffset(song.source, song.meta.songId)
  if (gen !== loadGen || songKey !== key) return
  setMemory(key, stored ?? 0)
}

export async function bumpLyricOffset(
  song: MusicInfo,
  delta: number,
): Promise<number> {
  loadGen += 1
  const key = keyFor(song)
  if (songKey !== key) setMemory(key, 0)
  const next = clampOffset(offsetSec + delta)
  setMemory(key, next)
  await putCachedLyricOffset(song.source, song.meta.songId, next)
  return next
}

export function canBumpLyricOffset(delta: number): boolean {
  return clampOffset(offsetSec + delta) !== offsetSec
}

export function lyricSeekTime(lineTime: number): number {
  return Math.max(0, lineTime - offsetSec)
}
