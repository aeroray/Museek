import { parseLrc } from "@/lib/lyrics/parser";
import type { LyricInfo, LyricLine, LyricWord } from "@/types/music";

const MAX_NATIVE_WORD_DURATION = 20;

function withoutWords(line: LyricLine): LyricLine {
  const result = { ...line };
  delete result.words;
  return result;
}

function comparableText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function hasValidNativeWords(
  line: LyricLine,
): line is LyricLine & { words: LyricWord[] } {
  if (!line.words?.length) return false;
  if (
    comparableText(line.text) !==
    comparableText(line.words.map((word) => word.text).join(""))
  ) {
    return false;
  }

  let previousTime = line.time - 0.5;
  for (const word of line.words) {
    if (
      !word.text ||
      !Number.isFinite(word.time) ||
      !Number.isFinite(word.duration) ||
      word.time < line.time - 0.5 ||
      word.time + 0.001 < previousTime ||
      word.duration <= 0 ||
      word.duration > MAX_NATIVE_WORD_DURATION
    ) {
      return false;
    }
    previousTime = word.time;
  }
  return true;
}

export function parseLyricDuration(value: string): number {
  const parts = value.split(":").map(Number);
  if (!parts.length || parts.some((part) => !Number.isFinite(part))) return 0;
  let result = 0;
  for (const part of parts) result = result * 60 + part;
  return result > 0 ? result : 0;
}

/** Keep platform-native word timings; plain LRC stays a whole line. */
export function applyKaraokeTiming(lines: LyricLine[]): LyricLine[] {
  return lines.map((line) => {
    if (hasValidNativeWords(line)) {
      return { ...line, karaoke: "native" };
    }
    return { ...withoutWords(line), karaoke: "none" };
  });
}

export function linesFromLyricInfo(info: LyricInfo): LyricLine[] {
  const timedLyric = info.lxlyric?.trim();
  const primary =
    timedLyric && /\[\d{1,2}:\d{2}/.test(timedLyric) ? timedLyric : info.lyric;
  if (!primary?.trim()) return [];
  return applyKaraokeTiming(parseLrc(primary, info.tlyric ?? undefined));
}

export function isWordByWordLyric(lines: LyricLine[]): boolean {
  return lines.some((line) => line.karaoke === "native");
}
