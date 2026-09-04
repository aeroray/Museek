import { recognitionProviders } from "@/lib/recognition/providers";
import type { AudioClip } from "@/lib/recognition/contracts";
import { RECOGNITION_DURATION_MS } from "@/lib/recognition/capture";
import { fetchWySongDetail, searchWangyi } from "@/lib/search/wy";
import { t } from "@/lib/i18n";
import type { MusicInfo } from "@/types/music";

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function audioContext(): AudioContext {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) throw new Error(t("local.matchRecognizeFailed"));
  return new Ctor();
}

function sliceBuffer(buffer: AudioBuffer): AudioClip {
  const wantSec = RECOGNITION_DURATION_MS / 1000;
  const startSec =
    buffer.duration > wantSec + 4
      ? Math.min(buffer.duration * 0.35, Math.max(0, buffer.duration - wantSec))
      : 0;
  const durationSec = Math.min(wantSec, Math.max(0, buffer.duration - startSec));
  const rate = buffer.sampleRate;
  const start = Math.floor(startSec * rate);
  const length = Math.max(1, Math.floor(durationSec * rate));
  const channels = Math.max(1, buffer.numberOfChannels);
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) {
      sum += buffer.getChannelData(c)[start + i] ?? 0;
    }
    samples[i] = sum / channels;
  }
  return {
    samples,
    sampleRate: rate,
    channelCount: 1,
    durationMs: (length / rate) * 1000,
  };
}

async function clipFromLocalFile(filePath: string): Promise<AudioClip> {
  if (!isTauri) throw new Error(t("local.desktopOnly"));
  const { readFile } = await import("@tauri-apps/plugin-fs");
  const bytes = await readFile(filePath);
  if (!bytes.byteLength) throw new Error(t("local.matchRecognizeFailed"));
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const ctx = audioContext();
  try {
    const buffer = await ctx.decodeAudioData(copy.buffer);
    if (!buffer.length) throw new Error(t("local.matchRecognizeFailed"));
    return sliceBuffer(buffer);
  } catch (err) {
    if (err instanceof Error && err.message === t("local.desktopOnly")) {
      throw err;
    }
    throw new Error(t("local.matchRecognizeFailed"));
  } finally {
    void ctx.close();
  }
}

async function musicInfoFromCandidateId(
  songId: string,
  title: string,
  artist: string,
): Promise<MusicInfo | null> {
  if (songId) {
    const detailed = await fetchWySongDetail(songId);
    if (detailed) return detailed;
  }
  const query = `${title} ${artist}`.trim();
  if (!query) return null;
  try {
    const result = await searchWangyi(query, 1, 8);
    return result.list[0] ?? null;
  } catch {
    return null;
  }
}

/** Fingerprint a slice of the local file (NetEase AFP). Fallback when tags are missing. */
export async function recognizeLocalFile(
  filePath: string,
): Promise<MusicInfo[]> {
  const clip = await clipFromLocalFile(filePath);
  const result = await recognitionProviders.netease.recognize(clip);
  const songs: MusicInfo[] = [];
  const seen = new Set<string>();
  for (const candidate of result.candidates) {
    const song = await musicInfoFromCandidateId(
      candidate.externalId ?? "",
      candidate.title,
      candidate.artist,
    );
    if (!song || seen.has(song.id)) continue;
    seen.add(song.id);
    songs.push(song);
  }
  return songs;
}
