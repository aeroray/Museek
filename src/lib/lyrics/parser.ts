import type { LyricInfo, LyricLine, LyricWord } from "@/types/music";

const timeRx = /^\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/;
const wordTimeRx =
  /<(-?\d+),(-?\d+)(?:,-?\d+)?\>|\((-?\d+),(-?\d+)(?:,-?\d+)?\)/g;
const absoluteWordTimeRx = /\((\d+),(\d+)(?:,\d+)?\)/g;

function normalizeLyricText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function formatLrcTimestamp(milliseconds: number): string {
  const time = Math.max(0, Math.trunc(milliseconds));
  const minutes = Math.floor(time / 60000);
  const seconds = Math.floor(time / 1000) % 60;
  const millis = String(time % 1000).padStart(3, "0");
  return `[${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${millis}]`;
}

function parseWordTimedBody(
  body: string,
  lineTime: number,
): { text: string; words: LyricWord[] } | null {
  const matches = [...body.matchAll(wordTimeRx)];
  if (!matches.length) return null;

  const words: LyricWord[] = [];
  let text = "";
  let segmentStart = 0;
  let pending: { time: number; duration: number } | null = null;

  for (const match of matches) {
    const segment = body.slice(segmentStart, match.index);
    text += segment;
    if (pending && segment) {
      words.push({ ...pending, text: segment });
    }

    const offset = Number(match[1] ?? match[3]);
    const duration = Number(match[2] ?? match[4]);
    if (Number.isFinite(offset) && Number.isFinite(duration)) {
      pending = {
        time: lineTime + offset / 1000,
        duration: Math.max(0.001, duration / 1000),
      };
    } else {
      pending = null;
    }
    segmentStart = (match.index ?? 0) + match[0].length;
  }

  const tail = body.slice(segmentStart);
  text += tail;
  if (pending && tail) {
    words.push({ ...pending, text: tail });
  }

  if (
    !words.length ||
    normalizeLyricText(text) !==
      normalizeLyricText(words.map((word) => word.text).join(""))
  ) {
    return null;
  }
  return { text, words };
}

function parseAbsoluteWordTimedBody(
  body: string,
  lineTime: number,
): { text: string; inline: string } | null {
  const matches = [...body.matchAll(absoluteWordTimeRx)];
  if (!matches.length) return null;

  const firstMarkerIndex = matches[0].index ?? 0;
  if (firstMarkerIndex > 0) {
    let text = "";
    let inline = "";
    let segmentStart = 0;

    for (const match of matches) {
      const segment = body.slice(segmentStart, match.index);
      text += segment;
      const absoluteTime = Number(match[1]);
      const duration = Number(match[2]);
      if (
        segment &&
        Number.isFinite(absoluteTime) &&
        Number.isFinite(duration)
      ) {
        inline += `<${Math.max(0, absoluteTime - lineTime)},${Math.max(1, duration)}>${segment}`;
      } else {
        inline += segment;
      }
      segmentStart = (match.index ?? 0) + match[0].length;
    }

    const tail = body.slice(segmentStart);
    text += tail;
    inline += tail;
    const plainText = text.trim();
    const parsed = parseWordTimedBody(inline, lineTime);
    if (
      plainText &&
      parsed &&
      normalizeLyricText(parsed.text) === normalizeLyricText(plainText)
    ) {
      return { text: plainText, inline };
    }
  }

  let text = "";
  let inline = "";
  let segmentStart = 0;
  let pending: { time: number; duration: number } | null = null;

  for (const match of matches) {
    const segment = body.slice(segmentStart, match.index);
    text += segment;
    if (pending && segment) {
      inline += `<${Math.max(0, pending.time - lineTime)},${pending.duration}>${segment}`;
    } else {
      inline += segment;
    }

    const absoluteTime = Number(match[1]);
    const duration = Number(match[2]);
    pending =
      Number.isFinite(absoluteTime) && Number.isFinite(duration)
        ? { time: absoluteTime, duration: Math.max(1, duration) }
        : null;
    segmentStart = (match.index ?? 0) + match[0].length;
  }

  const tail = body.slice(segmentStart);
  text += tail;
  if (pending && tail) {
    inline += `<${Math.max(0, pending.time - lineTime)},${pending.duration}>${tail}`;
  } else {
    inline += tail;
  }

  const plainText = text.trim();
  if (!plainText) return null;
  const parsed = parseWordTimedBody(inline, lineTime);
  return {
    text: plainText,
    inline:
      parsed &&
      normalizeLyricText(parsed.text) === normalizeLyricText(plainText)
        ? inline
        : plainText,
  };
}

/** Convert YRC/QRC-style absolute word markers to the shared inline LRC form. */
export function parseAbsoluteWordTimedLyric(raw: string): LyricInfo {
  const lyricLines: string[] = [];
  const timedLines: string[] = [];

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = /^\[(\d+),\d+\](.*)$/.exec(line);
    if (!match) continue;

    const lineTime = Number(match[1]);
    const parsed = parseAbsoluteWordTimedBody(match[2], lineTime);
    if (!parsed) continue;

    const tag = formatLrcTimestamp(lineTime);
    lyricLines.push(`${tag}${parsed.text}`);
    timedLines.push(`${tag}${parsed.inline}`);
  }

  return {
    lyric: lyricLines.join("\n"),
    lxlyric: timedLines.join("\n"),
  };
}

interface YrcJsonWord {
  tx?: string;
  tr?: number[];
}

interface YrcJsonLine {
  t?: number;
  c?: YrcJsonWord[];
}

/** Newer NetEase YRC lines: `{"t":ms,"c":[{"tx":"字","tr":[offset,duration]}]}`. */
function parseYrcJsonLine(
  line: string,
): { time: number; text: string; inline: string } | null {
  if (!line.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(line) as YrcJsonLine;
    const time = parsed.t;
    if (typeof time !== "number" || !Number.isFinite(time) || !Array.isArray(parsed.c)) {
      return null;
    }

    let text = "";
    let inline = "";
    let timed = false;
    for (const word of parsed.c) {
      const tx = word.tx ?? "";
      if (!tx) continue;
      text += tx;
      if (Array.isArray(word.tr) && word.tr.length >= 2) {
        timed = true;
        inline += `<${Math.max(0, word.tr[0])},${Math.max(1, word.tr[1])}>${tx}`;
      } else {
        inline += tx;
      }
    }

    const plain = text.trim();
    if (!plain || !timed) return null;
    return { time, text: plain, inline };
  } catch {
    return null;
  }
}

/**
 * NetEase YRC: classic `[startMs,dur](absMs,dur,0)字` lines, and JSON lines
 * with per-word `tr` timings. Credit-only JSON (no `tr`) is skipped.
 */
export function parseYrc(yrc: string): LyricInfo {
  const lyricLines: string[] = [];
  const timedLines: string[] = [];

  for (const rawLine of yrc.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const json = parseYrcJsonLine(line);
    if (json) {
      const tag = formatLrcTimestamp(json.time);
      lyricLines.push(`${tag}${json.text}`);
      timedLines.push(`${tag}${json.inline}`);
      continue;
    }

    const match = /^\[(\d+),\d+\](.*)$/.exec(line);
    if (!match) continue;
    const lineTime = Number(match[1]);
    const parsed = parseAbsoluteWordTimedBody(match[2], lineTime);
    if (!parsed) continue;
    const tag = formatLrcTimestamp(lineTime);
    lyricLines.push(`${tag}${parsed.text}`);
    timedLines.push(`${tag}${parsed.inline}`);
  }

  return {
    lyric: lyricLines.join("\n"),
    lxlyric: timedLines.join("\n"),
  };
}

export function parseLrc(
  lrc: string,
  translation?: string | null,
): LyricLine[] {
  const lines = lrc.split(/\r?\n/);
  const result: LyricLine[] = [];

  for (const line of lines) {
    const match = timeRx.exec(line);
    if (!match) continue;
    const minutes = parseInt(match[1]);
    const seconds = parseInt(match[2]);
    const millis = match[3] ? parseInt(match[3].padEnd(3, "0")) : 0;
    const time = minutes * 60 + seconds + millis / 1000;
    const body = line.replace(timeRx, "");
    const timed = parseWordTimedBody(body, time);
    const text = (timed?.text ?? body).trim();
    if (text) {
      result.push({
        time,
        text,
        ...(timed?.words.length ? { words: timed.words } : {}),
      });
    }
  }

  const sorted = result.sort((a, b) => a.time - b.time);

  if (translation) {
    const tLines = parseLrc(translation);
    for (const tLine of tLines) {
      const match = sorted.find((l) => Math.abs(l.time - tLine.time) < 0.1);
      if (match) match.translation = tLine.text;
    }
  }

  return sorted;
}
