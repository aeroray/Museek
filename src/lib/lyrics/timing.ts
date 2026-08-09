import type { LyricLine, LyricWord } from "@/types/music";

const CJK_RX = /[\u3400-\u4dbf\u4e00-\u9fff\u{20000}-\u{2ffff}]/u;
const WORD_RX = /[\p{L}\p{N}]/u;
const MARK_RX = /\p{M}/u;
const MIN_ESTIMATE_INTERVAL = 0.55;
const MAX_ESTIMATE_TOKENS = 96;
const MAX_NATIVE_WORD_DURATION = 20;

interface KaraokeToken {
  text: string;
  weight: number;
}

function isWhitespace(value: string): boolean {
  return /\s/u.test(value);
}

function isCjk(value: string): boolean {
  return CJK_RX.test(value);
}

function isWord(value: string): boolean {
  return WORD_RX.test(value);
}

function isMark(value: string): boolean {
  return MARK_RX.test(value);
}

function isConnector(value: string): boolean {
  return value === "'" || value === "’" || value === "-";
}

function tokenWeight(text: string): number {
  return Math.max(
    1,
    Array.from(text).filter((char) => !isWhitespace(char)).length,
  );
}

function tokenize(text: string): KaraokeToken[] {
  const chars = Array.from(text);
  const tokens: string[] = [];
  let prefix = "";
  let index = 0;

  while (index < chars.length) {
    const char = chars[index];
    if (isWhitespace(char)) {
      if (tokens.length) tokens[tokens.length - 1] += char;
      else prefix += char;
      index++;
      continue;
    }

    if (isMark(char) && tokens.length) {
      tokens[tokens.length - 1] += char;
      index++;
      continue;
    }

    if (isCjk(char)) {
      tokens.push(`${prefix}${char}`);
      prefix = "";
      index++;
      continue;
    }

    if (isWord(char)) {
      let token = `${prefix}${char}`;
      prefix = "";
      index++;
      while (index < chars.length) {
        const next = chars[index];
        if (isWord(next) || isMark(next)) {
          token += next;
          index++;
          continue;
        }
        if (
          isConnector(next) &&
          index + 1 < chars.length &&
          isWord(chars[index + 1])
        ) {
          token += next;
          index++;
          continue;
        }
        break;
      }
      tokens.push(token);
      continue;
    }

    if (tokens.length && !prefix) tokens[tokens.length - 1] += char;
    else {
      tokens.push(`${prefix}${char}`);
      prefix = "";
    }
    index++;
  }

  if (prefix) {
    if (tokens.length) tokens[tokens.length - 1] += prefix;
    else tokens.push(prefix);
  }

  return tokens
    .filter((token) => token.length > 0)
    .map((token) => ({ text: token, weight: tokenWeight(token) }));
}

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

function estimateWords(
  line: LyricLine,
  nextLine: LyricLine | undefined,
  songDuration: number,
): LyricWord[] | null {
  const tokens = tokenize(line.text);
  if (!tokens.length || tokens.length > MAX_ESTIMATE_TOKENS) return null;

  const lineEnd = nextLine?.time ?? songDuration;
  const interval = lineEnd - line.time;
  if (!Number.isFinite(interval) || interval < MIN_ESTIMATE_INTERVAL)
    return null;

  const totalWeight = tokens.reduce((sum, token) => sum + token.weight, 0);
  const naturalDuration = Math.min(
    6.5,
    Math.max(0.8, 0.72 + totalWeight * 0.16),
  );
  const duration = Math.min(interval, naturalDuration);
  if (duration < 0.45) return null;

  let elapsed = 0;
  return tokens.map((token) => {
    const wordDuration = (duration * token.weight) / totalWeight;
    const word = {
      time: line.time + elapsed,
      duration: Math.max(0.01, wordDuration),
      text: token.text,
    };
    elapsed += wordDuration;
    return word;
  });
}

export function parseLyricDuration(value: string): number {
  const parts = value.split(":").map(Number);
  if (!parts.length || parts.some((part) => !Number.isFinite(part))) return 0;
  let result = 0;
  for (const part of parts) result = result * 60 + part;
  return result > 0 ? result : 0;
}

export function applyKaraokeTiming(
  lines: LyricLine[],
  songDuration: number,
): LyricLine[] {
  return lines.map((line, index) => {
    if (hasValidNativeWords(line)) {
      return { ...line, karaoke: "native" };
    }

    const estimated = estimateWords(line, lines[index + 1], songDuration);
    if (estimated) {
      return { ...withoutWords(line), words: estimated, karaoke: "estimated" };
    }
    return { ...withoutWords(line), karaoke: "none" };
  });
}
