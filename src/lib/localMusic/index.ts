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
export { enrichLocalSong, applyCatalogHit, searchLocalCatalogCandidates, localTagsIncomplete, localTrackUntagged } from "./enrich";
export type { LocalEnrichStatus, LocalCatalogPreview } from "./enrich";
export { recognizeLocalFile } from "./recognizeFile";
export {
  localCatalogQuery,
  catalogIdentity,
  lyricSearchIdentity,
  localSongMatched,
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
