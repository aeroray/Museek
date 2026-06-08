export type Source = "kw" | "kg" | "tx" | "wy" | "mg"
export type Quality = "128k" | "320k" | "flac" | "flac24bit"

export interface MusicQuality {
  type: Quality
  size: string | null
}

export interface MusicInfoMeta {
  songId: string
  albumId?: string
  picUrl?: string | null
  qualitys: MusicQuality[]
  _qualitys: Partial<Record<Quality, { size: string | null }>>
  // kg-specific
  hash?: string
  // tx-specific
  strMediaMid?: string
  // mg-specific
  copyrightId?: string
}

export interface MusicInfo {
  id: string
  name: string
  singer: string
  source: Source
  interval: string
  albumName: string
  meta: MusicInfoMeta
}

export interface SearchResult {
  list: MusicInfo[]
  total: number
  page: number
  allPage: number
  limit: number
}

export interface LyricInfo {
  lyric: string
  tlyric?: string | null
  rlyric?: string | null
  lxlyric?: string | null
}

export interface LyricLine {
  time: number
  text: string
  translation?: string
}
