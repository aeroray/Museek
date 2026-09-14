import { invoke } from "@tauri-apps/api/core";
import * as md5Lib from "js-md5";
import { formatDuration } from "@/lib/utils";
import { indexQualitySizes } from "@/lib/quality";
import { t } from "@/lib/i18n";
import type {
  LocalNameMode,
  MusicInfo,
  MusicQuality,
  Quality,
} from "@/types/music";
import { allowLocalFilePaths } from "./fsScope";

// js-md5 CommonJS/ESM interop
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const md5 = ((md5Lib as any).default ?? md5Lib) as (str: string) => string;

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const LOCAL_AUDIO_EXTS = new Set([
  "mp3",
  "flac",
  "m4a",
  "ogg",
  "wav",
  "aac",
]);

export function localTrackId(filePath: string): string {
  return `local_${md5(filePath.replace(/\\/g, "/").toLowerCase())}`;
}

export function extOf(path: string): string {
  const base = path.split(/[/\\]/).pop() ?? "";
  const i = base.lastIndexOf(".");
  return i >= 0 ? base.slice(i + 1).toLowerCase() : "";
}

export function isLocalAudioPath(path: string): boolean {
  return LOCAL_AUDIO_EXTS.has(extOf(path));
}

export function isCuePath(path: string): boolean {
  return extOf(path) === "cue";
}

export function isLocalImportPath(path: string): boolean {
  return isLocalAudioPath(path) || isCuePath(path);
}

export function localCueTrackId(filePath: string, trackNo: number): string {
  const n = Number.isFinite(trackNo) ? Math.max(1, Math.trunc(trackNo)) : 1;
  return localTrackId(
    `${filePath.replace(/\\/g, "/")}#${String(n).padStart(2, "0")}`,
  );
}

function basenameNoExt(path: string): string {
  const base = path.split(/[/\\]/).pop() ?? path;
  return base.replace(/\.[^.]+$/, "");
}

export function localFilenameTitle(path: string): string {
  return basenameNoExt(path).trim() || t("local.unknownTitle");
}

/** Display title: filename lock, else ID3, else Match-online catalog name. */
export function localResolvedTitle(opts: {
  filePath: string;
  nameMode: LocalNameMode;
  hasTitleTag: boolean;
  parsedName: string;
  catalogName?: string | null;
}): string {
  if (opts.nameMode === "filename") {
    return localFilenameTitle(opts.filePath);
  }
  if (opts.hasTitleTag && opts.parsedName.trim()) {
    return opts.parsedName.trim();
  }
  const catalog = opts.catalogName?.trim();
  if (catalog) return catalog;
  return opts.parsedName.trim() || localFilenameTitle(opts.filePath);
}

/** Guess "Artist - Title" from filename. */
export function guessFromFilename(path: string): {
  name: string;
  singer: string;
} {
  const raw = basenameNoExt(path).trim();
  const parts = raw
    .split(/\s[-–—]\s/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return { singer: parts[0], name: parts.slice(1).join(" - ") };
  }
  return { name: raw || t("local.unknownTitle"), singer: "" };
}

function sizeFormate(size: number): string {
  if (!size) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const number = Math.floor(Math.log(size) / Math.log(1024));
  return `${(size / Math.pow(1024, Math.floor(number))).toFixed(2)} ${units[number]}`;
}

/** Extension-only fallback when format tags are missing. */
function qualityForExt(ext: string, fileSize?: number): MusicQuality[] {
  const size = fileSize ? sizeFormate(fileSize) : null;
  if (ext === "flac" || ext === "wav") return [{ type: "flac", size }];
  return [{ type: "320k", size }];
}

function isLosslessFormat(
  ext: string,
  format: { lossless?: boolean; codec?: string; container?: string },
): boolean {
  if (format.lossless === true) return true;
  if (format.lossless === false) return false;
  const codec = (format.codec ?? "").toLowerCase();
  const container = (format.container ?? "").toLowerCase();
  const blob = `${codec} ${container}`;
  if (/\b(flac|alac|pcm|wav|wave|ape|wavpack|dsd)\b/.test(blob)) return true;
  return ext === "flac" || ext === "wav";
}

/** Hi-Res: ≥24-bit or sample rate above 48 kHz (common streaming definition). */
function isHiRes(bitsPerSample?: number, sampleRate?: number): boolean {
  if (typeof bitsPerSample === "number" && bitsPerSample >= 24) return true;
  if (typeof sampleRate === "number" && sampleRate > 48000) return true;
  return false;
}

/** Snap a measured bitrate (bits/sec) to a lossy display tier. */
function lossyQualityFromBitrate(bps: number): Quality {
  const kbps = bps / 1000;
  if (kbps >= 288) return "320k";
  if (kbps >= 224) return "256k";
  if (kbps >= 160) return "192k";
  return "128k";
}

/**
 * Map music-metadata `format` (+ file size) to Museek quality tiers.
 * Avoids the old ext-only guess (every MP3/M4A → 320k, every FLAC → flac).
 */
function qualityFromFormat(
  ext: string,
  format:
    | {
        lossless?: boolean;
        codec?: string;
        container?: string;
        bitrate?: number;
        bitsPerSample?: number;
        sampleRate?: number;
      }
    | undefined,
  fileSize?: number,
): MusicQuality[] {
  const size = fileSize ? sizeFormate(fileSize) : null;

  if (format && isLosslessFormat(ext, format)) {
    const type: Quality = isHiRes(format.bitsPerSample, format.sampleRate)
      ? "flac24bit"
      : "flac";
    return [{ type, size }];
  }

  // Lossy: music-metadata bitrate is bits/sec.
  const bps = format?.bitrate;
  if (typeof bps === "number" && bps > 0) {
    return [{ type: lossyQualityFromBitrate(bps), size }];
  }

  return qualityForExt(ext, fileSize);
}

type NativeAudioProbe = {
  durationSec: number;
  title: string | null;
  artist: string | null;
  album: string | null;
  lossless: boolean;
  sampleRate: number | null;
  bitsPerSample: number | null;
  channels: number | null;
  bitrateKbps: number | null;
  fileSize: number;
  lyric: string | null;
  coverBase64: string | null;
  coverMime: string | null;
};

function bytesFromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function probeLocalAudioNative(
  filePath: string,
  includeCover: boolean,
): Promise<NativeAudioProbe | null> {
  try {
    return await invoke<NativeAudioProbe>("probe_local_audio", {
      path: filePath,
      includeCover,
    });
  } catch {
    return null;
  }
}

function qualityFromProbe(ext: string, probe: NativeAudioProbe): MusicQuality[] {
  return qualityFromFormat(
    ext,
    {
      lossless: probe.lossless,
      bitsPerSample: probe.bitsPerSample ?? undefined,
      sampleRate: probe.sampleRate ?? undefined,
      bitrate:
        typeof probe.bitrateKbps === "number" && probe.bitrateKbps > 0
          ? probe.bitrateKbps * 1000
          : undefined,
    },
    probe.fileSize,
  );
}

/** Re-read container/bitrate plus whether title/artist tags exist (no cover I/O). */
export async function peekLocalQuality(filePath: string): Promise<{
  qualitys: MusicQuality[];
  hasTitleTag: boolean;
  hasArtistTag: boolean;
} | null> {
  if (!isTauri) return null;
  try {
    const probe = await probeLocalAudioNative(filePath, false);
    if (!probe) return null;
    return {
      qualitys: qualityFromProbe(extOf(filePath), probe),
      hasTitleTag: Boolean(probe.title?.trim()),
      hasArtistTag: Boolean(probe.artist?.trim()),
    };
  } catch {
    return null;
  }
}

async function saveEmbeddedCover(
  id: string,
  data: Uint8Array,
  format?: string,
): Promise<{ rel: string; picUrl: string } | null> {
  if (!isTauri || !data.length) return null;
  try {
    const { writeFile, mkdir, BaseDirectory } =
      await import("@tauri-apps/plugin-fs");
    const { appDataDir, join } = await import("@tauri-apps/api/path");
    const { convertFileSrc } = await import("@tauri-apps/api/core");
    const mime = (format ?? "").toLowerCase();
    let ext = "jpg";
    if (mime.includes("png")) ext = "png";
    else if (mime.includes("webp")) ext = "webp";
    else if (mime.includes("gif")) ext = "gif";
    else if (mime.includes("bmp")) ext = "bmp";
    await mkdir("museek/localCovers", {
      baseDir: BaseDirectory.AppData,
      recursive: true,
    });
    const rel = `museek/localCovers/${id}.${ext}`;
    // Copy into a tight buffer — some parsers hand back a view into a larger tag block.
    const bytes =
      data.byteOffset === 0 && data.byteLength === data.buffer.byteLength
        ? data
        : data.slice();
    await writeFile(rel, bytes, { baseDir: BaseDirectory.AppData });
    const abs = await join(await appDataDir(), rel);
    return { rel, picUrl: convertFileSrc(abs) };
  } catch {
    return null;
  }
}

/** Rebuild convertFileSrc URL for a stored relative cover path. */
export async function resolveLocalCoverUrl(
  rel: string | undefined,
): Promise<string | null> {
  if (!rel || !isTauri) return null;
  try {
    const { appDataDir, join } = await import("@tauri-apps/api/path");
    const { convertFileSrc } = await import("@tauri-apps/api/core");
    const { exists, BaseDirectory } = await import("@tauri-apps/plugin-fs");
    if (!(await exists(rel, { baseDir: BaseDirectory.AppData }))) return null;
    return convertFileSrc(await join(await appDataDir(), rel));
  } catch {
    return null;
  }
}

export interface ParsedLocalTags {
  name: string;
  singer: string;
  albumName: string;
  interval: string;
  /** File clock in seconds; 0 when unknown. */
  durationSec: number;
  qualitys: MusicQuality[];
  localCoverRel?: string;
  picUrl?: string | null;
  /** Timed LRC from tags, when present. */
  embeddedLyric?: string;
  /** True when title/artist came from tags (not filename/placeholder). */
  hasTitleTag: boolean;
  hasArtistTag: boolean;
  hasAlbumTag: boolean;
  hasCover: boolean;
}

/**
 * Read tags from a local audio file. Falls back to filename / placeholders.
 * Never networks — online fill lives in `enrichLocalSong`.
 */
export async function parseLocalFile(
  filePath: string,
  id: string,
  nameMode: LocalNameMode = "smart",
  includeCover = true,
): Promise<ParsedLocalTags> {
  const ext = extOf(filePath);
  const filenameName = localFilenameTitle(filePath);
  const guessed = guessFromFilename(filePath);
  const placeholderTitle = t("local.unknownTitle");
  const placeholderArtist = t("local.unknownArtist");

  let name = "";
  let singer = "";
  let albumName = "";
  let interval = "0:00";
  let durationSec = 0;
  let qualitys = qualityForExt(ext);
  let localCoverRel: string | undefined;
  let picUrl: string | null = null;
  let embeddedLyric: string | undefined;
  let hasTitleTag = false;
  let hasArtistTag = false;
  let hasAlbumTag = false;
  let hasCover = false;

  if (isTauri) {
    try {
      await allowLocalFilePaths([filePath]);
      const probe = await probeLocalAudioNative(filePath, includeCover);
      if (probe) {
        if (probe.title?.trim()) {
          if (nameMode === "smart") name = probe.title.trim();
          hasTitleTag = true;
        }
        if (probe.artist?.trim()) {
          singer = probe.artist.trim();
          hasArtistTag = true;
        }
        if (probe.album?.trim()) {
          albumName = probe.album.trim();
          hasAlbumTag = true;
        }
        if (probe.durationSec > 0) {
          durationSec = probe.durationSec;
          interval = formatDuration(probe.durationSec);
        }
        qualitys = qualityFromProbe(ext, probe);
        if (probe.lyric?.trim()) embeddedLyric = probe.lyric.trim();
        if (probe.coverBase64) {
          const saved = await saveEmbeddedCover(
            id,
            bytesFromBase64(probe.coverBase64),
            probe.coverMime ?? undefined,
          );
          if (saved) {
            localCoverRel = saved.rel;
            picUrl = saved.picUrl;
            hasCover = true;
          }
        }
      }
    } catch {
      /* fall through to filename / placeholders */
    }
  }

  if (!name) {
    name =
      nameMode === "filename" ? filenameName : guessed.name || filenameName;
  }
  if (!name) name = placeholderTitle;
  if (!singer) singer = guessed.singer || placeholderArtist;
  if (!name.trim()) name = placeholderTitle;
  if (!singer.trim()) singer = placeholderArtist;

  return {
    name,
    singer,
    albumName,
    interval,
    durationSec,
    qualitys,
    localCoverRel,
    picUrl,
    embeddedLyric,
    hasTitleTag,
    hasArtistTag,
    hasAlbumTag,
    hasCover,
  };
}

/** Import-time metadata: basename only, no file read and no network. */
export function tagsFromFilename(filePath: string): ParsedLocalTags {
  const filenameName = localFilenameTitle(filePath);
  const guessed = guessFromFilename(filePath);
  return {
    name: filenameName,
    singer: guessed.singer || t("local.unknownArtist"),
    albumName: "",
    interval: "0:00",
    durationSec: 0,
    qualitys: qualityForExt(extOf(filePath)),
    hasTitleTag: false,
    hasArtistTag: false,
    hasAlbumTag: false,
    hasCover: false,
  };
}

export function buildLocalSong(
  id: string,
  filePath: string,
  tags: ParsedLocalTags,
  clip?: { start: number; end: number; index: number },
): MusicInfo {
  const _qualitys = indexQualitySizes(tags.qualitys);
  const useClip =
    clip &&
    Number.isFinite(clip.start) &&
    Number.isFinite(clip.end) &&
    clip.end > clip.start;
  return {
    id,
    name: tags.name,
    singer: tags.singer,
    source: "local",
    interval: useClip ? formatDuration(clip.end - clip.start) : tags.interval,
    albumName: tags.albumName,
    meta: {
      songId: id,
      albumId: "",
      picUrl: tags.picUrl ?? null,
      qualitys: tags.qualitys,
      _qualitys,
      filePath,
      localCoverRel: tags.localCoverRel,
      embeddedLyric: useClip ? undefined : tags.embeddedLyric,
      clipStart: useClip ? clip.start : undefined,
      clipEnd: useClip ? clip.end : undefined,
      cueIndex: useClip ? clip.index : undefined,
    },
  };
}
