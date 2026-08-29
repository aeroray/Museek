import { useLyricTime } from "@/lib/playback/clock";
import { cn } from "@/lib/utils";
import type { LyricLine } from "@/types/music";
import type { CSSProperties, PointerEventHandler } from "react";

type KaraokeLine = Pick<LyricLine, "text" | "time" | "words" | "karaoke">;

export interface KaraokeTextProps {
  line: KaraokeLine;
  currentTime: number;
  /** End of this line; used for whole-line theme fill when there is no native karaoke. */
  until?: number;
  className?: string;
  style?: CSSProperties;
  onPointerEnter?: PointerEventHandler<HTMLSpanElement>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function hasKaraokeTiming(line: KaraokeLine): boolean {
  if (line.karaoke !== "native") return false;
  const words = line.words;
  return Boolean(
    words?.length &&
    words.every(
      (word) =>
        word.text.length > 0 &&
        Number.isFinite(word.time) &&
        Number.isFinite(word.duration) &&
        word.duration > 0,
    ),
  );
}

function lineFillProgress(
  lineTime: number,
  until: number | undefined,
  currentTime: number,
): number | null {
  if (
    until == null ||
    !Number.isFinite(until) ||
    !Number.isFinite(lineTime) ||
    until <= lineTime + 0.05
  ) {
    return null;
  }
  return clamp((currentTime - lineTime) / (until - lineTime), 0, 1);
}

function KaraokeFill({
  text,
  progress,
}: {
  text: string;
  progress: number;
}) {
  const reveal = `${(1 - progress) * 100}%`;
  return (
    <span className="lyric-karaoke-words">
      <span className="lyric-karaoke-word">
        <span className="lyric-karaoke-word-text">{text}</span>
        <span
          className="lyric-karaoke-word-sung"
          aria-hidden="true"
          style={{
            // Keep inset non-negative — negative clip-path values have
            // crashed / blanked WKWebView on some macOS builds.
            clipPath: `inset(0 ${reveal} 0 0)`,
          }}
        >
          {text}
        </span>
      </span>
    </span>
  );
}

export function KaraokeText({
  line,
  currentTime,
  until,
  className,
  style,
  onPointerEnter,
}: KaraokeTextProps) {
  const words = hasKaraokeTiming(line) ? (line.words ?? []) : null;
  const lineProgress = words
    ? null
    : lineFillProgress(line.time, until, currentTime);

  return (
    <span
      className={cn(
        className,
        words || lineProgress != null ? "lyric-has-fill" : "lyric-plain",
      )}
      onPointerEnter={onPointerEnter}
      style={style}
    >
      {words ? (
        <span className="lyric-karaoke-words">
          {words.map((word, index) => {
            const wordProgress = clamp(
              (currentTime - word.time) / word.duration,
              0,
              1,
            );
            const wordReveal = `${(1 - wordProgress) * 100}%`;
            return (
              <span
                className="lyric-karaoke-word"
                key={`${word.time}:${index}`}
              >
                <span className="lyric-karaoke-word-text">{word.text}</span>
                <span
                  className="lyric-karaoke-word-sung"
                  aria-hidden="true"
                  style={{
                    clipPath: `inset(0 ${wordReveal} 0 0)`,
                  }}
                >
                  {word.text}
                </span>
              </span>
            );
          })}
        </span>
      ) : lineProgress != null ? (
        <KaraokeFill text={line.text} progress={lineProgress} />
      ) : (
        line.text
      )}
    </span>
  );
}

export function PlaybackKaraokeText(
  props: Omit<KaraokeTextProps, "currentTime">,
) {
  const currentTime = useLyricTime();
  return <KaraokeText {...props} currentTime={currentTime} />;
}
