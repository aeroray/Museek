import type { MusicInfo } from "@/types/music"

/**
 * Play-queue port — playlist helpers call `playAllSongs` instead of importing
 * playerStore (keeps lib → store inversion out of the playlists module).
 */
type PlayAllHandler = (songs: MusicInfo[]) => void

let playAllHandler: PlayAllHandler | null = null

export function bindPlayAll(h: PlayAllHandler): void {
  playAllHandler = h
}

export function playAllSongs(songs: MusicInfo[]): void {
  playAllHandler?.(songs)
}
