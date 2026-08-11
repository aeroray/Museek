import {
  audioClipFromDto,
  type AudioClip,
  type CaptureMode,
  type CapturedAudioDto,
} from "@/lib/recognition/contracts";

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const isWindows =
  typeof navigator !== "undefined" && /windows/i.test(navigator.userAgent);
const isMacOS =
  typeof navigator !== "undefined" &&
  /macintosh|mac os x/i.test(navigator.userAgent);
export const RECOGNITION_DURATION_MS = 8000;

export function supportsSystemCapture(): boolean {
  return isTauri && (isWindows || isMacOS);
}

async function captureBrowserMicrophone(
  durationMs: number,
): Promise<AudioClip> {
  if (!navigator.mediaDevices?.getUserMedia)
    throw new Error("Microphone capture is unavailable");
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    throw new Error("Microphone permission was denied");
  }
  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(4096, 1, 1);
  const output = context.createGain();
  output.gain.value = 0;
  const chunks: Float32Array[] = [];
  const targetSamples = Math.ceil((context.sampleRate * durationMs) / 1000);
  let collected = 0;

  try {
    await context.resume();
    const captured = new Promise<Float32Array>((resolve, reject) => {
      processor.onaudioprocess = (event) => {
        if (collected >= targetSamples) return;
        const input = event.inputBuffer.getChannelData(0);
        const remaining = targetSamples - collected;
        const chunk = input.slice(0, Math.min(input.length, remaining));
        chunks.push(chunk);
        collected += chunk.length;
        if (collected >= targetSamples) {
          const samples = new Float32Array(collected);
          let offset = 0;
          for (const item of chunks) {
            samples.set(item, offset);
            offset += item.length;
          }
          resolve(samples);
        }
      };
      processor.addEventListener(
        "error",
        () => reject(new Error("Microphone capture failed")),
        { once: true },
      );
    });
    source.connect(processor);
    processor.connect(output);
    output.connect(context.destination);
    const samples = await captured;
    return {
      samples,
      sampleRate: context.sampleRate,
      channelCount: 1,
      durationMs: (samples.length / context.sampleRate) * 1000,
    };
  } finally {
    processor.disconnect();
    source.disconnect();
    output.disconnect();
    for (const track of stream.getTracks()) track.stop();
    await context.close();
  }
}

export async function captureAudio(
  mode: CaptureMode,
  durationMs = RECOGNITION_DURATION_MS,
): Promise<AudioClip> {
  if (mode === "system") {
    if (!supportsSystemCapture())
      throw new Error("System audio capture is unavailable on this platform");
    const { invoke } = await import("@tauri-apps/api/core");
    const dto = await invoke<CapturedAudioDto>("capture_audio_clip", {
      mode,
      durationMs,
    });
    return audioClipFromDto(dto);
  }
  if (isTauri && isWindows) {
    const { invoke } = await import("@tauri-apps/api/core");
    const dto = await invoke<CapturedAudioDto>("capture_audio_clip", {
      mode,
      durationMs,
    });
    return audioClipFromDto(dto);
  }
  return captureBrowserMicrophone(durationMs);
}
