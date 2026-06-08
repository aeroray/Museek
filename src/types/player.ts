import type { MusicInfo, Quality } from "./music"

export type PlayMode = "sequence" | "shuffle" | "repeat-one" | "repeat-list"

export interface QueueItem {
  music: MusicInfo
  /** Target quality to request (from Settings / the initiating play). */
  quality: Quality
  /** The quality actually delivered once played (may be auto-downgraded). The
   *  queue badge prefers this so it reflects what really played and doesn't
   *  revert to the target when the item stops being the active track. */
  playedQuality?: Quality
}

export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "error" | "ended"
