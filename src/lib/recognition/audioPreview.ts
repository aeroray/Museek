import { monoSamples, type AudioClip } from "@/lib/recognition/contracts";

export interface AudioClipStats {
  peak: number;
  rms: number;
  activePercent: number;
}

export function audioClipStats(clip: AudioClip): AudioClipStats {
  const samples = monoSamples(clip);
  let peak = 0;
  let squareSum = 0;
  let activeSamples = 0;

  for (const sample of samples) {
    const value = Number.isFinite(sample)
      ? Math.max(-1, Math.min(1, sample))
      : 0;
    const absolute = Math.abs(value);
    peak = Math.max(peak, absolute);
    squareSum += value * value;
    if (absolute >= 0.005) activeSamples++;
  }

  return {
    peak,
    rms: samples.length > 0 ? Math.sqrt(squareSum / samples.length) : 0,
    activePercent:
      samples.length > 0 ? (activeSamples / samples.length) * 100 : 0,
  };
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index++) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

export function audioClipToWavBlob(clip: AudioClip): Blob {
  const samples = monoSamples(clip);
  const bytesPerSample = 2;
  const dataLength = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  const sampleRate = Math.max(1, Math.round(clip.sampleRate));

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataLength, true);

  for (let index = 0; index < samples.length; index++) {
    const value = Number.isFinite(samples[index])
      ? Math.max(-1, Math.min(1, samples[index]))
      : 0;
    const pcm = value < 0 ? value * 0x8000 : value * 0x7fff;
    view.setInt16(44 + index * bytesPerSample, Math.round(pcm), true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}
