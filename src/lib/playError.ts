/**
 * Classification of playback failures into user-facing copy.
 *
 * Kept as a pure module (the translator is injected) so the mapping can be
 * checked without a browser, matching `listenFormat` / `desktopLyricsFit`.
 */

export type Translate = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

/** `MediaError.code` values, per the HTML spec. */
export const MEDIA_ERR_ABORTED = 1;
export const MEDIA_ERR_NETWORK = 2;
export const MEDIA_ERR_DECODE = 3;
export const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;

/**
 * Turn a `MediaError` into something classifiable, or `null` when it is not a
 * failure at all.
 *
 * Measured in Chromium (`scripts/probe-media-error-server.mjs`), the element
 * reports code 4 (`SRC_NOT_SUPPORTED`) as a catch-all for a 404, an HTML/JSON
 * error body, an empty `src` and an unreachable host alike, so the code alone
 * cannot separate "network" from "bad audio" — it only needs to be *stable*.
 *
 * The numeric code is preferred over `message` because `message` is unreliable:
 * a plain 404 produced `message === ""` (not null/undefined), so the old
 * `audio.error?.message ?? "Playback error"` fallback never fired and the toast
 * rendered as `播放失败：` with nothing after it. When a message *is* present it
 * is English engine prose ("MEDIA_ELEMENT_ERROR: Format error") that would leak
 * into a localized UI.
 *
 * `MEDIA_ERR_ABORTED` returns null defensively: clearing `src` and reloading
 * was observed to fire `abort`/`emptied` rather than `error`, but if a code-1
 * error ever does surface it means playback was cancelled, not that it failed.
 */
export function describeMediaError(
  code: number | null | undefined,
  message: string | null | undefined,
): string | null {
  if (code === MEDIA_ERR_ABORTED) return null;
  if (
    code === MEDIA_ERR_NETWORK ||
    code === MEDIA_ERR_DECODE ||
    code === MEDIA_ERR_SRC_NOT_SUPPORTED
  ) {
    return `MediaError(code=${code})`;
  }
  const detail = (message ?? "").trim();
  return detail || "Playback error";
}

/**
 * Aborts and generation changes are not failures — the user (or a newer play
 * request) cancelled this one on purpose, so it must not raise a toast.
 */
export function isIgnorablePlayError(err: unknown): boolean {
  const name = err instanceof Error ? err.name : "";
  const raw = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (name === "AbortError") return true;
  return (
    raw.includes("the operation was aborted") ||
    raw.includes("signal is aborted") ||
    raw.includes("request canceled") ||
    raw.includes("request cancelled") ||
    raw.includes("audio source changed")
  );
}

/** Map engine/DOM exceptions so the toast is readable, not a WebView string. */
export function formatRemotePlayError(raw: string, t: Translate): string {
  if (isIgnorablePlayError(raw)) {
    return raw;
  }
  // Already-localized copy must pass through unchanged. `_handleError` can
  // receive a message another layer already formatted, and re-wrapping it
  // produced "播放失败：网络连接失败，请检查网络或换音源".
  const alreadyLocalized = [
    t("player.err.playTimeout"),
    t("player.err.invalidAudio"),
    t("player.err.unknown"),
    t("player.err.urlExpired"),
    t("player.err.rateLimited"),
    t("player.err.network", { msg: "" }),
  ];
  if (alreadyLocalized.includes(raw)) {
    return raw;
  }

  // Web Audio fetch failures from `src/lib/audio.ts`, which embed the HTTP
  // status. Without this branch they fell through to `player.failedDetail` and
  // the user saw raw English in a localized UI: "播放失败：Audio request failed
  // (403)". Classifying the status also makes the advice actionable — a 403/404
  // almost always means the resolved play URL expired and a fresh one is needed.
  const audioRequest = /audio request failed(?:\s*\((\d{3})\))?/i.exec(raw);
  if (audioRequest) {
    const status = audioRequest[1] ? Number(audioRequest[1]) : 0;
    if (status === 401 || status === 403 || status === 404 || status === 410 || status === 451) {
      return t("player.err.urlExpired");
    }
    if (status === 429) {
      return t("player.err.rateLimited");
    }
    if (status >= 500) {
      return t("player.err.network", { msg: raw });
    }
    // 200 with a non-audio body, or no status at all.
    return t("player.err.invalidAudio");
  }

  // Internal invariant failures from `src/lib/audio.ts`. These carry no detail
  // worth showing and would otherwise reach the user as raw English
  // ("播放失败：Web Audio is unavailable").
  if (
    /^(?:web audio is unavailable|no audio source|playback error)$/i.test(
      raw.trim(),
    )
  ) {
    return t("player.err.unknown");
  }

  // `describeMediaError` markers: the DOM exception carried no usable prose, so
  // classify by the numeric code instead.
  const mediaError = /mediaerror\(code=(\d)\)/i.exec(raw);
  if (mediaError) {
    const code = Number(mediaError[1]);
    return code === MEDIA_ERR_NETWORK
      ? t("player.err.network", { msg: raw })
      : t("player.err.invalidAudio");
  }

  if (
    /sending request|trying to connect|dns|resolve|tls|handshake|timed out|timeout|connection/i.test(
      raw,
    )
  ) {
    return t("player.err.network", { msg: raw });
  }
  // HTMLAudio / Web Audio NotSupportedError, decode failures, empty bodies.
  if (
    /not supported|unable to decode|encodingerror|no supported source|media_element_error|format error|empty audio/i.test(
      raw,
    )
  ) {
    return t("player.err.invalidAudio");
  }
  return t("player.failedDetail", { msg: raw });
}
