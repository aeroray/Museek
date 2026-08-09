import type { LyricLine } from "@/types/music";
import type { PlayerStatus } from "@/types/player";
import type { Lang } from "@/lib/i18n";
import type { Palette, ThemeMode } from "@/stores/themeStore";

export const DESKTOP_LYRICS_LABEL = "lyrics";
export const DESKTOP_LYRICS_STATE_EVENT = "desktop-lyrics/state";
export const DESKTOP_LYRICS_TIME_EVENT = "desktop-lyrics/time";
export const DESKTOP_LYRICS_REQUEST_EVENT = "desktop-lyrics/request-sync";
export const DESKTOP_LYRICS_APPEARANCE_EVENT = "desktop-lyrics/appearance";
export const DESKTOP_LYRICS_INTERACTION_EVENT = "desktop-lyrics/interaction";
export const DESKTOP_LYRICS_SET_INTERACTION_EVENT =
  "desktop-lyrics/set-interaction";
export const DESKTOP_LYRICS_GLOBAL_INTERACTION_EVENT =
  "desktop-lyrics/toggle-interaction";
export const DESKTOP_LYRICS_CLOSED_EVENT = "desktop-lyrics/closed";

export type DesktopLyricsInteractionMode = "interactive" | "locked";

export interface DesktopLyricsAppearanceSnapshot {
  lang: Lang;
  themeMode: ThemeMode;
  palette: Palette;
  capsuleVisible: boolean;
}

export interface DesktopLyricsSnapshot {
  song: {
    title: string;
    artist: string;
    coverUrl: string | null;
  } | null;
  lines: LyricLine[];
  currentTime: number;
  currentLyricIndex: number;
  isPlaying: boolean;
  status: PlayerStatus;
  lyricsLoading: boolean;
}
