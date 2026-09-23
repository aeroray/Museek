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
  /**
   * A quality the user chose for THIS track only, overriding the global
   * `playQuality`. Absent means "follow the default like every other song".
   *
   * Cleared whenever the choice coincides with the current default, so a track
   * that was set back to the default is indistinguishable from one never
   * touched — including following the default if it changes later.
   */
  qualityOverride?: Quality
}

export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "error" | "ended"
