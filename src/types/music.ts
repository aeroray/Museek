export type OnlineSource = "kw" | "kg" | "tx" | "wy" | "mg";
export type Source = OnlineSource | "local";
export type Quality = "128k" | "320k" | "flac" | "flac24bit";
export type LocalNameMode = "filename" | "smart";

export interface MusicQuality {
  type: Quality;
  size: string | null;
}

export interface MusicInfoMeta {
  songId: string;
  albumId?: string;
  picUrl?: string | null;
  qualitys: MusicQuality[];
  _qualitys: Partial<Record<Quality, { size: string | null }>>;
  // kg-specific
  hash?: string;
  // tx-specific
  strMediaMid?: string;
  // mg-specific
  copyrightId?: string;
  /** Absolute path of a local library file (source === "local"). */
  filePath?: string;
  /** AppData-relative cover extracted from tags, e.g. museek/localCovers/….jpg */
  localCoverRel?: string;
  /** Timed LRC text extracted from tags at import (local only). */
  embeddedLyric?: string;
}

export interface MusicInfo {
  id: string;
  name: string;
  singer: string;
  source: Source;
  interval: string;
  albumName: string;
  meta: MusicInfoMeta;
}

/** Device-local library entry (not synced). */
export interface LocalTrack {
  id: string;
  filePath: string;
  addedAt: number;
  /** One category at most; null / omitted = uncategorized. */
  categoryId?: string | null;
  /** Title lock: `filename` keeps the basename. New imports set this. Omitted = legacy smart. */
  nameMode?: LocalNameMode;
  /** Whether local file tags (cover, duration, lyrics) have been read. Omitted = already read (legacy). */
  hydrated?: boolean;
  /** File missing/moved/unreadable — set after a failed play attempt. */
  unavailable?: boolean;
  song: MusicInfo;
}

/** User-defined local library category (one track → one category). */
export interface LocalCategory {
  id: string;
  name: string;
  createdAt: number;
}

export interface SearchResult {
  list: MusicInfo[];
  total: number;
  page: number;
  allPage: number;
  limit: number;
}

export interface LyricInfo {
  lyric: string;
  tlyric?: string | null;
  rlyric?: string | null;
  lxlyric?: string | null;
}

export interface LyricWord {
  time: number;
  duration: number;
  text: string;
}

export type LyricKaraokeMode = "native" | "estimated" | "none";

export interface LyricLine {
  time: number;
  text: string;
  translation?: string;
  words?: LyricWord[];
  karaoke?: LyricKaraokeMode;
}
