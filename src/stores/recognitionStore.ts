import { create } from "zustand";
import { searchWangyi } from "@/lib/search/wy";
import { captureAudio, supportsSystemCapture } from "@/lib/recognition/capture";
import { recognitionProviders } from "@/lib/recognition/providers";
import type {
  AudioClip,
  CaptureMode,
  RecognitionCandidate,
  RecognitionResult,
} from "@/lib/recognition/contracts";
import type { MusicInfo } from "@/types/music";

export type RecognitionStatus =
  | "idle"
  | "capturing"
  | "recognizing"
  | "success"
  | "no-match"
  | "error";

export interface RecognitionMatch {
  candidate: RecognitionCandidate;
  song: MusicInfo | null;
}

interface RecognitionRun {
  status: "success" | "no-match" | "error";
  result: RecognitionResult | null;
  matches: RecognitionMatch[];
  error: string | null;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[\s\u3000\-_/()[\]{}'".,!?！？：:]/g, "");
}

async function enrichCandidate(
  candidate: RecognitionCandidate,
): Promise<RecognitionMatch> {
  try {
    const query = `${candidate.title} ${candidate.artist}`.trim();
    const result = await searchWangyi(query, 1, 8);
    const title = normalize(candidate.title);
    const artist = normalize(candidate.artist);
    const exact = result.list.find((song) => {
      const songTitle = normalize(song.name);
      const songArtist = normalize(song.singer);
      return (
        songTitle === title &&
        (songArtist.includes(artist) || artist.includes(songArtist))
      );
    });
    return { candidate, song: exact ?? result.list[0] ?? null };
  } catch {
    return { candidate, song: null };
  }
}

async function enrich(result: RecognitionResult): Promise<RecognitionMatch[]> {
  return Promise.all(result.candidates.map(enrichCandidate));
}

interface RecognitionState {
  captureMode: CaptureMode;
  status: RecognitionStatus;
  error: string | null;
  clip: AudioClip | null;
  result: RecognitionResult | null;
  matches: RecognitionMatch[];
  setCaptureMode: (mode: CaptureMode) => void;
  recognize: () => Promise<void>;
  clear: () => void;
}

let requestGeneration = 0;

async function runProvider(clip: AudioClip): Promise<RecognitionRun> {
  try {
    const result = await recognitionProviders.netease.recognize(clip);
    const matches = await enrich(result);
    return {
      status: result.candidates.length > 0 ? "success" : "no-match",
      result,
      matches,
      error: null,
    };
  } catch (error) {
    return {
      status: "error",
      result: null,
      matches: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export const useRecognitionStore = create<RecognitionState>((set, get) => ({
  captureMode: supportsSystemCapture() ? "system" : "microphone",
  status: "idle",
  error: null,
  clip: null,
  result: null,
  matches: [],

  setCaptureMode(captureMode) {
    set({ captureMode, error: null });
  },

  async recognize() {
    const generation = ++requestGeneration;
    const { captureMode } = get();
    set({ status: "capturing", error: null, result: null, matches: [] });
    try {
      const clip = await captureAudio(captureMode);
      if (generation !== requestGeneration) return;
      set({ clip, status: "recognizing" });
      const run = await runProvider(clip);
      if (generation !== requestGeneration) return;
      set({
        status: run.status,
        error: run.error,
        result: run.result,
        matches: run.matches,
      });
    } catch (error) {
      if (generation !== requestGeneration) return;
      set({
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  clear() {
    requestGeneration++;
    set({ status: "idle", error: null, clip: null, result: null, matches: [] });
  },
}));
