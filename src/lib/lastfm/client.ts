import { httpFetch } from "@/lib/http";
import {
  LASTFM_API_ROOT,
  LASTFM_AUTH_URL,
  LastfmError,
  encodeBody,
  encodeQuery,
  lastfmErrorLabel,
  parseLastfmError,
  publicParams,
  signParams,
  signedParams,
  type LastfmParams,
} from "@/lib/lastfm/api";

/**
 * The Last.fm network client.
 *
 * Requests go through `@/lib/http`, which uses Tauri's HTTP plugin and therefore
 * bypasses CORS. That is what makes a browser-side Last.fm client possible in
 * Tauri at all: unlike Electron there is no `webSecurity: false`, so a plain
 * `fetch` from the webview would be blocked.
 *
 * Reads are GET (api_key only, plus a signature when the method needs one);
 * writes are POST with an urlencoded body, always signed.
 */

export type LastfmCredentials = {
  apiKey: string;
  apiSecret: string;
  /** Present once the user has authorized; absent while disconnected. */
  sessionKey?: string;
};

const TIMEOUT_MS = 15_000;

/**
 * A timeout signal for one request.
 *
 * `AbortSignal.timeout` is used rather than a hand-rolled AbortController +
 * timer because it cannot leak the timer if the request settles first. WebView2
 * and WKWebView both ship it (Chromium 103+ / Safari 16+), which covers the
 * platforms this app targets.
 */
function timeoutSignal(): AbortSignal {
  return AbortSignal.timeout(TIMEOUT_MS);
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new LastfmError(
      res.ok
        ? "Last.fm returned a non-JSON response"
        : `Last.fm request failed (HTTP ${res.status})`,
    );
  }
  // Last.fm reports failures with HTTP 200 and an `error` field in most cases,
  // so the body is checked before the status.
  const err = parseLastfmError(payload);
  if (err) throw err;
  if (!res.ok) throw new LastfmError(`Last.fm request failed (HTTP ${res.status})`);
  return payload;
}

/** An unsigned read (`api_key` only) — user.getInfo, user.getTopArtists, … */
export async function lastfmGet(
  apiKey: string,
  method: string,
  params: LastfmParams = {},
): Promise<unknown> {
  const query = encodeQuery({ ...publicParams(method, apiKey), ...params });
  const res = await httpFetch(`${LASTFM_API_ROOT}?${query}`, {
    method: "GET",
    signal: timeoutSignal(),
  });
  return readJson(res);
}

/**
 * A signed read. `auth.getToken` and `auth.getSession` need a signature even
 * though they carry no session key, which is why this is separate from the
 * session-authenticated write below.
 */
export async function lastfmGetSigned(
  creds: LastfmCredentials,
  method: string,
  params: LastfmParams = {},
): Promise<unknown> {
  const base = publicParams(method, creds.apiKey);
  const all = { ...base, ...params };
  const sig = signParams(all, creds.apiSecret);
  const query = encodeQuery({ ...all, api_sig: sig });
  const res = await httpFetch(`${LASTFM_API_ROOT}?${query}`, {
    method: "GET",
    signal: timeoutSignal(),
  });
  return readJson(res);
}

/** A signed, session-authenticated write (POST, urlencoded). */
export async function lastfmPost(
  creds: LastfmCredentials,
  method: string,
  params: LastfmParams,
): Promise<unknown> {
  if (!creds.sessionKey) {
    throw new LastfmError("Not connected to Last.fm", 9);
  }
  const base = signedParams(method, creds.apiKey, creds.sessionKey);
  const all = { ...base, ...params };
  // The signature is computed over the raw values, then the body is encoded.
  const sig = signParams(all, creds.apiSecret);
  const res = await httpFetch(LASTFM_API_ROOT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: encodeBody(all, sig),
    signal: timeoutSignal(),
  });
  return readJson(res);
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export type LastfmSession = { name: string; key: string };

/** Step 1: a request token the user authorizes in their browser. */
export async function fetchToken(creds: LastfmCredentials): Promise<string> {
  const payload = (await lastfmGetSigned(creds, "auth.getToken")) as {
    token?: string;
  };
  if (!payload?.token) throw new LastfmError("Last.fm did not return a token");
  return payload.token;
}

export function authorizeUrl(apiKey: string, token: string): string {
  return `${LASTFM_AUTH_URL}?api_key=${encodeURIComponent(apiKey)}&token=${encodeURIComponent(token)}`;
}

/**
 * Step 2: exchange the authorized token for a session key.
 *
 * Called repeatedly while the user is in their browser. Before they authorize,
 * Last.fm answers with error 14 ("This token has not been authorized") — which
 * must be treated as "keep waiting", NOT as a failure, or the poll would abort
 * on its very first tick. Error 4 means the token was rejected outright.
 */
export const TOKEN_UNAUTHORIZED = 14;

export async function fetchSession(
  creds: LastfmCredentials,
  token: string,
): Promise<LastfmSession> {
  const payload = (await lastfmGetSigned(creds, "auth.getSession", { token })) as {
    session?: { name?: string; key?: string };
  };
  const session = payload?.session;
  if (!session?.key || !session?.name) {
    throw new LastfmError("Last.fm did not return a session");
  }
  return { name: session.name, key: session.key };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function updateNowPlaying(
  creds: LastfmCredentials,
  fields: { artist: string; track: string; album?: string; duration?: number },
): Promise<void> {
  await lastfmPost(creds, "track.updateNowPlaying", {
    artist: fields.artist,
    track: fields.track,
    album: fields.album || undefined,
    duration: fields.duration && fields.duration > 0 ? fields.duration : undefined,
  });
}

export type ScrobbleResponse = {
  accepted: number;
  ignored: number;
  /** Per-play ignore codes, e.g. 1 = artist ignored, 3 = timestamp too old. */
  ignoredCodes: number[];
};

/**
 * Submit one or more plays.
 *
 * Last.fm accepts up to 50 per request via indexed parameters, and answers with
 * `accepted` / `ignored` counts. An `ignored` play is NOT an error worth
 * retrying — the service has judged it (too short, too old, filtered artist) and
 * will keep rejecting it — so the counts are returned for the caller to act on.
 */
export async function scrobble(
  creds: LastfmCredentials,
  plays: Record<string, string>,
): Promise<ScrobbleResponse> {
  const payload = (await lastfmPost(creds, "track.scrobble", plays)) as {
    scrobbles?: {
      "@attr"?: { accepted?: number | string; ignored?: number | string };
      scrobble?:
        | { ignoredMessage?: { code?: number | string } }
        | { ignoredMessage?: { code?: number | string } }[];
    };
  };
  const attr = payload?.scrobbles?.["@attr"];
  const accepted = Number(attr?.accepted ?? 0) || 0;
  const ignored = Number(attr?.ignored ?? 0) || 0;
  const entries = payload?.scrobbles?.scrobble;
  const list = Array.isArray(entries) ? entries : entries ? [entries] : [];
  const ignoredCodes = list
    .map((entry) => Number(entry?.ignoredMessage?.code ?? 0) || 0)
    .filter((code) => code > 0);
  return { accepted, ignored, ignoredCodes };
}

export { lastfmErrorLabel };
