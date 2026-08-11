export type RecognitionProvider = "netease";

export type CaptureMode = "microphone" | "system";

export interface AudioClip {
  samples: Float32Array;
  sampleRate: number;
  channelCount: number;
  durationMs: number;
}

export interface CapturedAudioDto {
  samples: number[];
  sampleRate: number;
  channelCount: number;
  durationMs: number;
}

export interface RecognitionCandidate {
  id: string;
  title: string;
  artist: string;
  album: string;
  coverUrl: string | null;
  provider: RecognitionProvider;
  externalId: string | null;
  confidence: number | null;
  url: string | null;
}

export interface RecognitionResult {
  provider: RecognitionProvider;
  candidates: RecognitionCandidate[];
  elapsedMs: number;
  sampleMs: number;
  queryId: string | null;
}

export interface RecognitionProviderAdapter {
  id: RecognitionProvider;
  recognize(clip: AudioClip): Promise<RecognitionResult>;
}

export function audioClipFromDto(dto: CapturedAudioDto): AudioClip {
  const sampleRate =
    Number.isFinite(dto.sampleRate) && dto.sampleRate > 0
      ? dto.sampleRate
      : 16000;
  const channelCount =
    Number.isFinite(dto.channelCount) && dto.channelCount > 0
      ? dto.channelCount
      : 1;
  const samples = Float32Array.from(dto.samples);
  const durationMs =
    dto.durationMs > 0
      ? dto.durationMs
      : (samples.length / channelCount / sampleRate) * 1000;

  return { samples, sampleRate, channelCount, durationMs };
}

export function monoSamples(clip: AudioClip): Float32Array {
  if (clip.channelCount <= 1) return clip.samples;

  const frameCount = Math.floor(clip.samples.length / clip.channelCount);
  const mono = new Float32Array(frameCount);
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
    let sum = 0;
    for (
      let channelIndex = 0;
      channelIndex < clip.channelCount;
      channelIndex++
    ) {
      sum += clip.samples[frameIndex * clip.channelCount + channelIndex] ?? 0;
    }
    mono[frameIndex] = sum / clip.channelCount;
  }
  return mono;
}

export function resample(
  samples: Float32Array,
  sourceRate: number,
  targetRate: number,
): Float32Array {
  if (sourceRate === targetRate || samples.length < 2) return samples;

  const targetLength = Math.max(
    1,
    Math.round((samples.length * targetRate) / sourceRate),
  );
  const output = new Float32Array(targetLength);
  const ratio = sourceRate / targetRate;

  for (let targetIndex = 0; targetIndex < targetLength; targetIndex++) {
    const sourcePosition = targetIndex * ratio;
    const leftIndex = Math.floor(sourcePosition);
    const rightIndex = Math.min(leftIndex + 1, samples.length - 1);
    const weight = sourcePosition - leftIndex;
    const left = samples[leftIndex] ?? 0;
    const right = samples[rightIndex] ?? left;
    output[targetIndex] = left + (right - left) * weight;
  }

  return output;
}

export function prepareMono(clip: AudioClip, targetRate: number): Float32Array {
  return resample(monoSamples(clip), clip.sampleRate, targetRate);
}
