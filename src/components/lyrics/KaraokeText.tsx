import { useLyricTime } from "@/lib/playback/clock";
import { cn } from "@/lib/utils";
import type { LyricLine } from "@/types/music";
import type { CSSProperties, PointerEventHandler } from "react";

type KaraokeLine = Pick<LyricLine, "text" | "time" | "words" | "karaoke">;

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

/**
 * Renders one lyric line.
 *
 * Word-by-word fill is used ONLY when the payload carries validated native word
 * timings. A plain line-timed LRC renders as plain text, exactly like the lyrics
 * panel and the top bar — there used to be a `until` prop here that swept a
 * whole-line fill across plain lines, which only the desktop lyric passed, so the
 * same song looked karaoke-styled in one surface and plain in the other two.
 * See `docs/memory/areas/lyrics.md` (native word timing only).
 */
export function KaraokeText({
  line,
  currentTime,
  className,
  style,
  onPointerEnter,
}: KaraokeTextProps) {
  const words = hasKaraokeTiming(line) ? (line.words ?? []) : null;

  return (
    <span
      className={cn(className, words ? "lyric-has-fill" : "lyric-plain")}
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
