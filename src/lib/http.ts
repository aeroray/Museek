import { fetch as tauriHttpFetch } from "@tauri-apps/plugin-http"

// Are we running inside the Tauri webview (which injects the IPC bridge)?
// The Claude Preview / plain browser has no bridge, so tauriFetch would throw
// "Cannot read properties of undefined (reading 'invoke')".
const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

// Headers the browser forbids JS from setting on fetch() — relay them to the
// dev proxy via `x-pxy-*` so it can restore them server-side.
const RELAY = new Set(["user-agent", "referer", "origin", "cookie", "host"])

/**
 * Environment-aware HTTP. In the Tauri window it uses the native http plugin
 * (bypasses CORS). In the browser/preview it routes through the Vite dev proxy
 * (see vite.config.ts) so built-in search / charts / lyric still work there.
 */
export async function httpFetch(input: string, init?: RequestInit): Promise<Response> {
  if (isTauri) {
    return tauriHttpFetch(input, init) as unknown as Promise<Response>
  }

  const headers = new Headers((init?.headers as HeadersInit | undefined) ?? undefined)
  const relayed = new Headers()
  headers.forEach((value, key) => {
    if (RELAY.has(key.toLowerCase())) relayed.set(`x-pxy-${key}`, value)
    else relayed.set(key, value)
  })

  return fetch(`/__proxy?target=${encodeURIComponent(input)}`, {
    method: init?.method ?? "GET",
    headers: relayed,
    body: init?.body as BodyInit | null | undefined,
    signal: init?.signal ?? undefined,
  })
}
