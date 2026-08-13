/**
 * Cheap checks so we don't treat CDN 403 HTML / JSON error bodies as MP3.
 */

import * as pako from "pako";
import type { Quality } from "@/types/music";

function startsWithAscii(bytes: Uint8Array, ascii: string): boolean {
  if (bytes.length < ascii.length) return false
  for (let i = 0; i < ascii.length; i++) {
    if (bytes[i] !== ascii.charCodeAt(i)) return false
  }
  return true
}

function isMp4Ftyp(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  );
}

/** Gzip magic — Tauri HTTP may leave bodies compressed. */
export function isGzipBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
}

export function maybeGunzipAudio(bytes: Uint8Array): Uint8Array {
  if (!isGzipBytes(bytes)) return bytes;
  try {
    return pako.inflate(bytes);
  } catch {
    return bytes;
  }
}

/** Pick a real container extension from magic bytes, not from the requested quality. */
export function suggestedDownloadExtension(
  bytes: Uint8Array,
  quality: Quality,
): string {
  if (isMp4Ftyp(bytes)) return "m4a";
  if (startsWithAscii(bytes, "fLaC")) return "flac";
  if (startsWithAscii(bytes, "OggS")) return "ogg";
  if (startsWithAscii(bytes, "RIFF")) return "wav";
  if (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33)
    return "mp3";
  if (quality === "flac" || quality === "flac24bit") return "flac";
  return "mp3";
}

export function looksLikeAudioBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false

  // ID3v2 tag (MP3)
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true
  // MPEG frame sync / AAC ADTS
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return true
  // FLAC
  if (startsWithAscii(bytes, "fLaC")) return true
  // Ogg
  if (startsWithAscii(bytes, "OggS")) return true
  // WAV / RIFF
  if (startsWithAscii(bytes, "RIFF")) return true
  // MP4 / M4A — "ftyp" at offset 4
  if (isMp4Ftyp(bytes)) return true

  return false
}

/** True for bodies that are clearly not audio (HTML/JSON/XML error pages). */
export function looksLikeNonAudioBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 1) return true
  // Skip UTF-8 BOM
  let i = 0
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) i = 3
  while (i < bytes.length && (bytes[i] === 0x20 || bytes[i] === 0x09 || bytes[i] === 0x0a || bytes[i] === 0x0d)) {
    i++
  }
  const slice = bytes.subarray(i, Math.min(i + 64, bytes.length))
  let head = ""
  try {
    head = new TextDecoder().decode(slice).toLowerCase()
  } catch {
    return false
  }
  return (
    head.startsWith("<!doctype") ||
    head.startsWith("<html") ||
    head.startsWith("<?xml") ||
    head.startsWith("<head") ||
    head.startsWith("{") ||
    head.startsWith("[")
  )
}

export function isAudioContentType(contentType: string | null): boolean {
  if (!contentType) return false
  const ct = contentType.toLowerCase()
  return ct.includes("audio/") || ct.includes("mpeg") || ct.includes("mp4") || ct.includes("flac") || ct.includes("ogg")
}
