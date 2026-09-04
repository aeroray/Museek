import * as md5Lib from "js-md5";
import { parseBuffer } from "music-metadata";
import { formatDuration } from "@/lib/utils";
import { indexQualitySizes } from "@/lib/quality";
import { t } from "@/lib/i18n";
import type {
  LocalNameMode,
  MusicInfo,
  MusicQuality,
  Quality,
} from "@/types/music";
import { lyricTextFromTags } from "./lyrics";

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

/** Re-read container/bitrate plus whether title/artist tags exist (no cover I/O). */
export async function peekLocalQuality(filePath: string): Promise<{
  qualitys: MusicQuality[];
  hasTitleTag: boolean;
  hasArtistTag: boolean;
} | null> {
  if (!isTauri) return null;
  try {
    const ext = extOf(filePath);
    const { readFile } = await import("@tauri-apps/plugin-fs");
    const bytes = await readFile(filePath);
    const meta = await parseBuffer(bytes, {
      mimeType: mimeForExt(ext),
      size: bytes.byteLength,
    });
    const common = meta.common;
    const artists = (
      common.artists?.length
        ? common.artists
        : common.artist
          ? [common.artist]
          : []
    )
      .map((a) => a?.trim())
      .filter(Boolean);
    return {
      qualitys: qualityFromFormat(ext, meta.format, bytes.byteLength),
      hasTitleTag: Boolean(common.title?.trim()),
      hasArtistTag: artists.length > 0,
    };
  } catch {
    return null;
  }
}

function mimeForExt(ext: string): string {
  switch (ext) {
    case "flac":
      return "audio/flac";
    case "m4a":
    case "aac":
      return "audio/mp4";
    case "ogg":
      return "audio/ogg";
    case "wav":
      return "audio/wav";
    default:
      return "audio/mpeg";
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

type PictureLike = {
  format?: string;
  type?: string;
  name?: string;
  description?: string;
  data?: Uint8Array;
};

/**
 * Prefer a real album cover over file icons / artist photos.
 * music-metadata's own `selectCover` is unreliable (broken `in` check on an array),
 * and using `picture[0]` alone misses files where the front cover isn't first.
 */
function pickCoverPicture(
  pictures: PictureLike[] | undefined,
): PictureLike | null {
  if (!pictures?.length) return null;

  const rank = (p: PictureLike): number => {
    const len = p.data?.byteLength ?? p.data?.length ?? 0;
    if (len < 64) return -1; // empty / tiny stub
    const type =
      `${p.type ?? ""} ${p.name ?? ""} ${p.description ?? ""}`.toLowerCase();
    const mime = (p.format ?? "").toLowerCase();
    let score = Math.min(len, 5_000_000); // size as weak signal
    if (/cover\s*\(front\)|front\s*cover|^3$|\bfront\b/.test(type))
      score += 1e12;
    else if (/\bcover\b|\balbum\b|^4$/.test(type)) score += 1e11;
    else if (!type.trim() || /\bother\b|^0$/.test(type)) score += 1e9;
    if (
      /icon|leaflet|media|conductor|composer|lyricist|artist|band|publisher|video/.test(
        type,
      )
    ) {
      score -= 1e11;
    }
    if (/jpeg|jpg|png|webp/.test(mime)) score += 1e8;
    else if (/gif|bmp/.test(mime)) score += 1e7;
    return score;
  };

  let best: PictureLike | null = null;
  let bestScore = -1;
  for (const p of pictures) {
    const score = rank(p);
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return bestScore >= 0 ? best : null;
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
      const { readFile } = await import("@tauri-apps/plugin-fs");
      const bytes = await readFile(filePath);
      const meta = await parseBuffer(bytes, {
        mimeType: mimeForExt(ext),
        size: bytes.byteLength,
      });
      const common = meta.common;
      if (common.title?.trim()) {
        if (nameMode === "smart") name = common.title.trim();
        hasTitleTag = true;
      }
      const artists = (
        common.artists?.length
          ? common.artists
          : common.artist
            ? [common.artist]
            : []
      )
        .map((a) => a?.trim())
        .filter(Boolean) as string[];
      if (artists.length) {
        singer = artists.join("、");
        hasArtistTag = true;
      }
      if (common.album?.trim()) {
        albumName = common.album.trim();
        hasAlbumTag = true;
      }
      const dur = meta.format.duration;
      if (typeof dur === "number" && dur > 0) interval = formatDuration(dur);

      qualitys = qualityFromFormat(ext, meta.format, bytes.byteLength);

      const fromTags = lyricTextFromTags(common.lyrics);
      if (fromTags) embeddedLyric = fromTags;

      const pic = pickCoverPicture(common.picture);
      const raw = pic?.data;
      if (raw && raw.length > 0) {
        const data =
          raw instanceof Uint8Array
            ? raw
            : new Uint8Array(raw as ArrayLike<number>);
        const saved = await saveEmbeddedCover(id, data, pic?.format);
        if (saved) {
          localCoverRel = saved.rel;
          picUrl = saved.picUrl;
          hasCover = true;
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
): MusicInfo {
  const _qualitys = indexQualitySizes(tags.qualitys);
  return {
    id,
    name: tags.name,
    singer: tags.singer,
    source: "local",
    interval: tags.interval,
    albumName: tags.albumName,
    meta: {
      songId: id,
      albumId: "",
      picUrl: tags.picUrl ?? null,
      qualitys: tags.qualitys,
      _qualitys,
      filePath,
      localCoverRel: tags.localCoverRel,
      embeddedLyric: tags.embeddedLyric,
    },
  };
}
