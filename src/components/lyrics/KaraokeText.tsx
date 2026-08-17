import { useLyricTime } from "@/lib/playback/clock";
import type { LyricLine } from "@/types/music";
import type { CSSProperties, PointerEventHandler } from "react";

type KaraokeLine = Pick<LyricLine, "text" | "words" | "karaoke">;

export interface KaraokeTextProps {
  line: KaraokeLine;
  currentTime: number;
  className?: string;
  style?: CSSProperties;
  onPointerEnter?: PointerEventHandler<HTMLSpanElement>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function hasKaraokeTiming(line: KaraokeLine): boolean {
  if (line.karaoke !== "native" && line.karaoke !== "estimated") return false;
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

export function KaraokeText({
  line,
  currentTime,
  className,
  style,
  onPointerEnter,
}: KaraokeTextProps) {
  const words = hasKaraokeTiming(line) ? (line.words ?? []) : null;

  return (
    <span className={className} onPointerEnter={onPointerEnter} style={style}>
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
                    // Keep inset non-negative — negative clip-path values have
                    // crashed / blanked WKWebView on some macOS builds.
                    clipPath: `inset(0 ${wordReveal} 0 0)`,
                  }}
                >
                  {word.text}
                </span>
              </span>
            );
          })}
        </span>
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
