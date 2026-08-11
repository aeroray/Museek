import { GenerateFP } from "./vendor/afp.js";
import { httpFetch } from "@/lib/http";
import {
  prepareMono,
  type AudioClip,
  type RecognitionCandidate,
  type RecognitionProviderAdapter,
  type RecognitionResult,
} from "@/lib/recognition/contracts";

const NETEASE_SAMPLE_RATE = 8000;
const NETEASE_WINDOW_MS = 3000;
const NETEASE_STEP_MS = 1000;
const NETEASE_WINDOW_SAMPLES = (NETEASE_SAMPLE_RATE * NETEASE_WINDOW_MS) / 1000;
const NETEASE_STEP_SAMPLES = (NETEASE_SAMPLE_RATE * NETEASE_STEP_MS) / 1000;
const NETEASE_ENDPOINT =
  "https://interface.music.163.com/api/music/audio/match";

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function createSessionId(): string {
  const bytes = new Uint8Array(8);
  const cryptoApi = typeof crypto !== "undefined" ? crypto : null;
  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index++) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function nullableText(value: unknown): string | null {
  if (typeof value === "string") return value || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (
    typeof value === "string" &&
    value.trim() &&
    Number.isFinite(Number(value))
  )
    return Number(value);
  return null;
}

function candidateFromSingleResult(
  resultValue: unknown,
  data: Record<string, unknown>,
  root: Record<string, unknown>,
): RecognitionCandidate[] {
  const result = record(resultValue);
  const song = record(result.song ?? data.song ?? root.song);
  const artists = song.artists ?? song.ar ?? song.artist;
  const artistNames = Array.isArray(artists)
    ? artists
        .map((artist) =>
          typeof artist === "string" ? artist : text(record(artist).name),
        )
        .filter(Boolean)
    : [text(artists)];
  const title = text(song.name ?? result.name ?? data.name);
  const artist = artistNames.join("、") || text(result.artist ?? data.artist);
  if (!title && !artist) return [];

  const album = record(song.album ?? result.album ?? data.album);
  const albumName = text(album.name ?? result.albumName ?? data.albumName);
  const coverUrl = nullableText(
    album.picUrl ?? album.cover ?? result.picUrl ?? data.picUrl,
  );
  const externalId = nullableText(
    song.id ?? result.songId ?? result.id ?? data.songId,
  );
  const confidence = numberOrNull(
    result.score ?? result.confidence ?? data.score,
  );

  return [
    {
      id: `netease_${externalId ?? `${title}_${artist}`}`,
      title,
      artist,
      album: albumName,
      coverUrl,
      provider: "netease",
      externalId,
      confidence,
      url: nullableText(result.url ?? song.url),
    },
  ];
}

function candidateFromResult(payload: unknown): RecognitionCandidate[] {
  const root = record(payload);
  const data = record(root.data);
  const rawResult = data.result ?? root.result;
  const resultValues = Array.isArray(rawResult) ? rawResult : [rawResult];
  const candidates: RecognitionCandidate[] = [];

  for (const resultValue of resultValues) {
    candidates.push(...candidateFromSingleResult(resultValue, data, root));
  }

  return candidates;
}

function windowStarts(sampleCount: number): number[] {
  if (sampleCount <= 0) return [];
  if (sampleCount <= NETEASE_WINDOW_SAMPLES) return [0];

  const lastStart = sampleCount - NETEASE_WINDOW_SAMPLES;
  const starts: number[] = [];
  for (let start = 0; start <= lastStart; start += NETEASE_STEP_SAMPLES) {
    starts.push(start);
  }
  if (starts[starts.length - 1] !== lastStart) starts.push(lastStart);
  return starts;
}

function windowSamples(samples: Float32Array, start: number): Float32Array {
  const window = new Float32Array(NETEASE_WINDOW_SAMPLES);
  window.set(
    samples.subarray(
      start,
      Math.min(start + NETEASE_WINDOW_SAMPLES, samples.length),
    ),
  );
  return window;
}

async function requestWindow(
  samples: Float32Array,
): Promise<{ candidates: RecognitionCandidate[]; queryId: string | null }> {
  const audioFingerprint = await GenerateFP(samples);
  const query = new URLSearchParams({
    sessionId: createSessionId(),
    algorithmCode: "shazam_v2",
    duration: String(NETEASE_WINDOW_MS / 1000),
    rawdata: audioFingerprint,
    times: "1",
    decrypt: "1",
  });
  const response = await httpFetch(`${NETEASE_ENDPOINT}?${query}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0",
      origin: "https://music.163.com",
    },
  });
  if (!response.ok)
    throw new Error(`NetEase recognition failed: ${response.status}`);

  const payload = (await response.json()) as unknown;
  const data = record(record(payload).data);
  return {
    candidates: candidateFromResult(payload),
    queryId: nullableText(data.queryId),
  };
}

export const neteaseProvider: RecognitionProviderAdapter = {
  id: "netease",
  async recognize(clip: AudioClip): Promise<RecognitionResult> {
    const startedAt = performance.now();
    const samples = prepareMono(clip, NETEASE_SAMPLE_RATE);
    let queryId: string | null = null;

    for (const start of windowStarts(samples.length)) {
      const result = await requestWindow(windowSamples(samples, start));
      queryId = result.queryId ?? queryId;
      if (result.candidates.length > 0) {
        return {
          provider: "netease",
          candidates: result.candidates,
          elapsedMs: performance.now() - startedAt,
          sampleMs: NETEASE_WINDOW_MS,
          queryId,
        };
      }
    }

    return {
      provider: "netease",
      candidates: [],
      elapsedMs: performance.now() - startedAt,
      sampleMs: samples.length > 0 ? NETEASE_WINDOW_MS : 0,
      queryId,
    };
  },
};
