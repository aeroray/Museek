/**
 * Caching for "which platforms have a lyric for this song".
 *
 * Extracted from `sources.ts` so the caching rules can be pinned without a
 * network or a Tauri bridge: that module imports the five platform search
 * adapters and the source runner.
 *
 * ## What went wrong without it
 *
 * The source menu ran the whole cross-platform probe every time it was opened.
 * A per-platform *payload* cache already existed, but it only covers platforms
 * that returned a lyric — every `empty` result had nothing cached, so reopening
 * the menu re-ran a full search per platform plus an artist-alias probe, and the
 * menu flashed through "searching…" again for an answer it had already computed.
 *
 * ## The two rules
 *
 * 1. A settled list is cached for a while. Lyrics do not change for a given
 *    recording.
 * 2. A list containing `error` is NOT cached. An error means the probe did not
 *    get to answer, and caching it would present a transient network failure as
 *    "this platform has no lyrics" until the app restarts.
 */

export type PlatformLyricStatus = "ok" | "empty" | "error" | "pending";

export type PlatformLyricOption<TSource extends string = string> = {
  source: TSource;
  status: PlatformLyricStatus;
  wordByWord: boolean;
};

/** Session cache with a hard size cap: oldest entries are evicted (LRU-ish). */
export class BoundedMap<K, V> extends Map<K, V> {
  constructor(private readonly max: number) {
    super();
  }
  override set(key: K, value: V): this {
    if (this.has(key)) this.delete(key);
    super.set(key, value);
    while (this.size > this.max) {
      const oldest = this.keys().next().value as K;
      this.delete(oldest);
    }
    return this;
  }
}

export const OPTIONS_TTL_MS = 30 * 60_000;

export type OptionsCacheEntry<TSource extends string = string> = {
  options: PlatformLyricOption<TSource>[];
  at: number;
};

/**
 * True when `options` may be remembered as the answer.
 *
 * `pending` should never survive to a finished list, but it is excluded for the
 * same reason as `error`: it is the absence of an answer, not an answer.
 */
export function isCacheable(
  options: readonly PlatformLyricOption[],
): boolean {
  return !options.some(
    (option) => option.status === "error" || option.status === "pending",
  );
}

/**
 * Wrap a probe so repeated calls for the same key reuse the previous result.
 *
 * `probe` receives the key so one wrapper can serve many songs. It is expected to
 * report progress through `onUpdate`; a cached hit reports the stored list
 * synchronously so a menu can paint real rows on its first frame.
 */
export function createOptionLister<TTarget, TSource extends string = string>(deps: {
  probe: (
    target: TTarget,
    onUpdate: (options: PlatformLyricOption<TSource>[]) => void,
  ) => Promise<PlatformLyricOption<TSource>[]>;
  keyOf: (target: TTarget) => string;
  /** Platforms to report as `pending` while the probe runs. */
  platforms: readonly TSource[];
  max?: number;
  ttlMs?: number;
  now?: () => number;
}): {
  list: (
    target: TTarget,
    onUpdate?: (options: PlatformLyricOption<TSource>[]) => void,
  ) => Promise<PlatformLyricOption<TSource>[]>;
  known: (target: TTarget) => PlatformLyricOption<TSource>[] | null;
  forget: (target: TTarget) => void;
} {
  const max = deps.max ?? 60;
  const ttlMs = deps.ttlMs ?? OPTIONS_TTL_MS;
  const now = deps.now ?? Date.now;
  const cache = new BoundedMap<string, OptionsCacheEntry<TSource>>(max);
  const inflight = new Map<string, Promise<PlatformLyricOption<TSource>[]>>();

  const fresh = (key: string): PlatformLyricOption<TSource>[] | null => {
    const hit = cache.get(key);
    if (!hit) return null;
    if (now() - hit.at >= ttlMs) {
      cache.delete(key);
      return null;
    }
    return hit.options;
  };

  const list = async (
    target: TTarget,
    onUpdate?: (options: PlatformLyricOption<TSource>[]) => void,
  ): Promise<PlatformLyricOption<TSource>[]> => {
    const key = deps.keyOf(target);

    const cached = fresh(key);
    if (cached) {
      // Synchronous, so the caller's first render already has the real answer.
      onUpdate?.(cached);
      return cached;
    }

    const pending = inflight.get(key);
    if (pending) return pending;

    onUpdate?.(
      deps.platforms.map((source) => ({
        source,
        status: "pending" as const,
        wordByWord: false,
      })),
    );

    const request = (async () => {
      const settled = await deps.probe(target, (options) => onUpdate?.(options));
      inflight.delete(key);
      if (isCacheable(settled)) cache.set(key, { options: settled, at: now() });
      return settled;
    })();
    inflight.set(key, request);

    try {
      return await request;
    } catch {
      inflight.delete(key);
      return deps.platforms.map((source) => ({
        source,
        status: "error" as const,
        wordByWord: false,
      }));
    }
  };

  return {
    list,
    known: (target) => fresh(deps.keyOf(target)),
    forget: (target) => cache.delete(deps.keyOf(target)),
  };
}
