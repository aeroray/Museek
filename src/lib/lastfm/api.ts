import * as md5Lib from "js-md5";

/**
 * Last.fm API plumbing: request signing, endpoint constants and response
 * parsing.
 *
 * Kept free of Tauri/network/store imports so the signature algorithm — the one
 * part that silently breaks everything if it is wrong — can be checked by a
 * plain node script against Last.fm's published algorithm.
 */

// js-md5 CommonJS/ESM interop (same pattern as src/lib/search/mg.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const md5 = ((md5Lib as any).default ?? md5Lib) as (str: string) => string;

export const LASTFM_API_ROOT = "https://ws.audioscrobbler.com/2.0/";

/** Where the user authorizes a token. Opened in the system browser. */
export const LASTFM_AUTH_URL = "https://www.last.fm/api/auth/";

/**
 * Last.fm's documented error codes, mapped to a short reason.
 *
 * These matter for behaviour, not just messaging: a bad/expired session key (9)
 * or a revoked key (26) means the stored credentials are dead and the UI must
 * ask the user to reconnect, whereas a rate limit (29) or a transient outage
 * (11/16) must NOT discard them.
 */
export const LASTFM_ERRORS: Record<number, string> = {
  2: "invalid service",
  3: "invalid method",
  4: "authentication failed",
  5: "invalid format",
  6: "invalid parameters",
  7: "invalid resource",
  8: "operation failed",
  9: "invalid session key",
  10: "invalid API key",
  11: "service offline",
  13: "invalid method signature",
  16: "temporarily unavailable",
  17: "login required",
  26: "suspended API key",
  27: "invalid API key or secret",
  29: "rate limit exceeded",
};

/** Errors that mean the stored session is unusable and must be reconnected. */
export function isAuthError(code: number | undefined): boolean {
  return code === 4 || code === 9 || code === 26;
}

/** Errors worth retrying later rather than dropping the request. */
export function isTransientError(code: number | undefined): boolean {
  return code === 8 || code === 11 || code === 16 || code === 29;
}

export type LastfmParams = Record<string, string | number | undefined>;

/**
 * Build Last.fm's `api_sig`.
 *
 * The published algorithm: sort the parameters alphabetically by name, drop
 * `format` and `callback`, concatenate each as `name + value` with no
 * separators, append the shared secret, then MD5 the whole string. The digest is
 * lowercase hex.
 *
 * `format` and `callback` are excluded because they only shape the response, not
 * the request — including them makes every signature fail with error 13.
 */
export function signParams(params: LastfmParams, secret: string): string {
  const pairs = Object.entries(params)
    .filter(([key, value]) => {
      if (key === "format" || key === "callback") return false;
      return value !== undefined && value !== null && value !== "";
    })
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  let raw = "";
  for (const [key, value] of pairs) raw += key + String(value);
  return md5(raw + secret);
}

/** Parameters for an unauthenticated (api_key only) read. */
export function publicParams(method: string, apiKey: string): LastfmParams {
  return { method, api_key: apiKey, format: "json" };
}

/** Parameters for a signed, session-authenticated write. */
export function signedParams(
  method: string,
  apiKey: string,
  sessionKey: string,
): LastfmParams {
  return { method, api_key: apiKey, sk: sessionKey, format: "json" };
}

/**
 * Encode params for the POST body. The signature must be computed over the
 * *unencoded* values, so `api_sig` is added here, after signing.
 */
export function encodeBody(params: LastfmParams, sig: string): string {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    body.set(key, String(value));
  }
  body.set("api_sig", sig);
  return body.toString();
}

/** Encode params into a query string (for GET reads). */
export function encodeQuery(params: LastfmParams): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    q.set(key, String(value));
  }
  return q.toString();
}

/** A Last.fm failure, carrying the numeric code so callers can classify it. */
export class LastfmError extends Error {
  readonly code: number | undefined;
  constructor(message: string, code?: number) {
    super(message);
    this.name = "LastfmError";
    this.code = code;
  }
}

/** True when the payload is Last.fm's `{ error, message }` shape. */
export function parseLastfmError(payload: unknown): LastfmError | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (typeof record.error !== "number") return null;
  const code = record.error;
  const detail =
    typeof record.message === "string" && record.message
      ? record.message
      : (LASTFM_ERRORS[code] ?? "unknown error");
  return new LastfmError(detail, code);
}

export function lastfmErrorLabel(err: unknown): string {
  if (err instanceof LastfmError) {
    const known = err.code !== undefined ? LASTFM_ERRORS[err.code] : undefined;
    return known ? `${err.message} (${err.code})` : err.message;
  }
  return err instanceof Error ? err.message : String(err);
}
