import { useEffect, useState } from "react";

/**
 * A `Date.now()` value that refreshes on an interval, for relative timestamps
 * ("3 分钟前") that would otherwise freeze at whatever the clock said when the
 * page first rendered.
 *
 * Deliberately coarse. These labels only change once a minute, so ticking faster
 * would re-render the surrounding list for no visible gain; 30s keeps the
 * displayed minute within half a minute of correct without aligning to a
 * boundary the caller would have to reason about.
 *
 * Pass `enabled: false` when nothing on screen reads the value, so a hidden or
 * empty view costs nothing.
 */
export function useMinuteTick(enabled = true): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    // Re-sync immediately on enable: the value may be stale from a period when
    // this hook was disabled.
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [enabled]);

  return now;
}
