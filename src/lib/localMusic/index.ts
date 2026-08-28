export {
  parseLocalFile,
  buildLocalSong,
  tagsFromFilename,
  localTrackId,
  localFilenameTitle,
  localResolvedTitle,
  isLocalAudioPath,
  extOf,
  resolveLocalCoverUrl,
  peekLocalQuality,
  LOCAL_AUDIO_EXTS,
} from "./tags";
export type { ParsedLocalTags } from "./tags";
export { pickLocalAudioFiles, pickLocalAudioFolder } from "./scan";
export { normalizeLocalScanDepth, isUnlimitedLocalScanDepth } from "./depth";
export { enrichLocalSong } from "./enrich";
export type { LocalEnrichStatus } from "./enrich";
export {
  localCatalogQuery,
  catalogIdentity,
  lyricSearchIdentity,
  isPlaceholderArtist,
  isPlaceholderTitle,
} from "./catalogQuery";
export {
  fetchLocalFileLyric,
  readSiblingLrc,
  readEmbeddedLyric,
} from "./lyrics";
export {
  localFileToObjectUrl,
  revealLocalFile,
  mapLocalPlayError,
} from "./playback";
