import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/* Scroll pace and loop gap are picked for reading, not decoration: ~32px/s is
   calm enough to follow, and the gap is a short breath between passes. */
const SPEED_PX_PER_S = 32;
const GAP_PX = 48;
/* A sweep across the bar toward another button must not start the scroll. */
const HOVER_DELAY_MS = 300;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

interface MarqueeTextProps {
  children: ReactNode;
  className?: string;
  /* Native tooltip fallback for reduced-motion users, who get no scroll. */
  title?: string;
}

/**
 * A one-line text that scrolls like a marquee while hovered, but only when it
 * actually overflows. At rest it renders the plain ellipsized text, so the
 * idle look of the host surface is unchanged.
 */
export function MarqueeText({ children, className, title }: MarqueeTextProps) {
  const rootRef = useRef<HTMLParagraphElement>(null);
  const idleRef = useRef<HTMLSpanElement>(null);
  const copyRef = useRef<HTMLSpanElement>(null);
  const hoverTimer = useRef<number | undefined>(undefined);

  const [overflowing, setOverflowing] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
  );
  const [shift, setShift] = useState(0);

  /* Measure whichever branch is mounted: the idle span reports overflow via
     scrollWidth, the active copy reports the loop distance. Setters compare
     before writing so the resize observer cannot feed back into itself. */
  const measure = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const idle = idleRef.current;
    if (idle) {
      const next = idle.scrollWidth > idle.clientWidth + 1;
      setOverflowing((prev) => (prev === next ? prev : next));
      return;
    }
    const copy = copyRef.current;
    if (copy) {
      const width = copy.offsetWidth;
      setShift((prev) => (prev === width + GAP_PX ? prev : width + GAP_PX));
      const next = width > root.clientWidth + 1;
      setOverflowing((prev) => (prev === next ? prev : next));
    }
  }, []);

  /* Runs after the branch swap so the track mounts with the right distance in
     the same commit — the stale value never reaches the screen. */
  useLayoutEffect(() => {
    measure();
  }, [measure, children, hovering, overflowing, reducedMotion]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [measure]);

  useEffect(() => {
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    const onChange = () => setReducedMotion(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  const animated = hovering && overflowing && !reducedMotion;

  const onPointerEnter = () => {
    if (!overflowing || reducedMotion) return;
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(
      () => setHovering(true),
      HOVER_DELAY_MS,
    );
  };

  const onPointerLeave = () => {
    window.clearTimeout(hoverTimer.current);
    setHovering(false);
  };

  return (
    <p
      ref={rootRef}
      className={cn("block overflow-hidden", className)}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      title={overflowing && reducedMotion ? title : undefined}
    >
      {animated ? (
        <span
          className="marquee-track"
          style={
            {
              "--marquee-shift": `${shift}px`,
              animationDuration: `${shift / SPEED_PX_PER_S}s`,
              columnGap: GAP_PX,
            } as CSSProperties
          }
        >
          <span ref={copyRef} className="marquee-copy">
            {children}
          </span>
          <span className="marquee-copy" aria-hidden="true">
            {children}
          </span>
        </span>
      ) : (
        <span ref={idleRef} className="block truncate">
          {children}
        </span>
      )}
    </p>
  );
}
