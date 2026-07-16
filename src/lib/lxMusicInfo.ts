import type { MusicInfo } from "@/types/music"

/**
 * Flatten Museek's nested MusicInfo into the flat shape lx-music source scripts
 * expect (`songmid` at the top level, `types` / `_types`, per-source id fields).
 */
export function toLxMusicInfo(m: MusicInfo): Record<string, unknown> {
  return {
    name: m.name,
    singer: m.singer,
    source: m.source,
    songmid: m.meta.songId,
    albumId: m.meta.albumId ?? "",
    albumName: m.albumName,
    interval: m.interval,
    img: m.meta.picUrl ?? null,
    lrc: null,
    otherSource: null,
    types: m.meta.qualitys,
    _types: m.meta._qualitys,
    typeUrl: {},
    hash: m.meta.hash,
    strMediaMid: m.meta.strMediaMid,
    copyrightId: m.meta.copyrightId,
  }
}
