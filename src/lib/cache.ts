// A tiny in-memory TTL cache for read-only third-party calls (search, charts,
// playlists, lyrics, play URLs, covers). It serves two purposes for reducing
// request frequency:
//
//   1. Result caching — within `ttlMs`, an identical key returns the previous
//      result instead of hitting the network (e.g. switching back to a chart
//      board, re-selecting a search platform, or replaying a song).
//   2. In-flight de-duplication — because we cache the *promise*, several rapid
//      identical calls (double-clicks, React effect re-runs) share one request.
//
// Failures are NOT cached: a rejected promise is evicted so a manual retry (or
// the next visit) re-fetches. A simple LRU bound keeps memory in check.

export function createAsyncCache<T>(ttlMs: number, max = 60) {
  const map = new Map<string, { promise: Promise<T>; expires: number }>()

  return function cached(key: string, fn: () => Promise<T>): Promise<T> {
    const hit = map.get(key)
    if (hit && Date.now() < hit.expires) {
      // Refresh recency (Map keeps insertion order → re-insert = most recent).
      map.delete(key)
      map.set(key, hit)
      return hit.promise
    }

    const promise = fn().catch((err) => {
      // Don't keep a failed request cached — allow retry to re-fetch.
      if (map.get(key)?.promise === promise) map.delete(key)
      throw err
    })

    map.set(key, { promise, expires: Date.now() + ttlMs })

    // Evict the oldest entry if we're over the bound.
    if (map.size > max) {
      const oldest = map.keys().next().value
      if (oldest !== undefined && oldest !== key) map.delete(oldest)
    }

    return promise
  }
}
