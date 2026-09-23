// Verifies playback-error classification.
//
//   node --experimental-strip-types scripts/check-play-error.mjs
//
// Imports the real module (src/lib/playError.ts has no imports, so plain node
// can load it) with a stub translator, matching the project's convention of
// standalone check scripts.
import {
  describeMediaError,
  formatRemotePlayError,
  isIgnorablePlayError,
  MEDIA_ERR_ABORTED,
  MEDIA_ERR_DECODE,
  MEDIA_ERR_NETWORK,
  MEDIA_ERR_SRC_NOT_SUPPORTED,
} from "../src/lib/playError.ts"

// Mirrors the zh strings from src/lib/i18n.ts.
const zh = {
  "player.err.network": "网络连接失败，请检查网络或换音源",
  "player.err.invalidAudio": "无法播放，请换其他音源",
  "player.err.playTimeout": "播放超时，请检查网络或换音源",
  "player.err.unknown": "未知错误",
  "player.err.urlExpired": "播放链接已失效，请重试或换音源",
  "player.err.rateLimited": "请求过于频繁，请稍后重试",
  "player.failedDetail": "播放失败：{msg}",
}
const t = (key, vars = {}) =>
  (zh[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""))

let failed = 0
const check = (name, actual, expected) => {
  const ok = actual === expected
  if (!ok) failed += 1
  console.log(
    `${ok ? "OK  " : "FAIL"}  ${name.padEnd(52)} => ${actual}${ok ? "" : `   (expected ${expected})`}`,
  )
}

// --- The reported bug ----------------------------------------------------
// "Audio request failed" must never reach the user as raw English.
console.log("Reported case: raw 'Audio request failed' must be localized")
for (const raw of [
  "Audio request failed (403)",
  "Audio request failed (404)",
  "Audio request failed (401)",
  "Audio request failed (410)",
  "Audio request failed (451)",
]) {
  const out = formatRemotePlayError(raw, t)
  check(`${raw} -> expired copy`, out, zh["player.err.urlExpired"])
  if (/audio request failed/i.test(out)) failed += 1
}
check(
  "no case leaks the English string",
  ["403", "404", "500", "429", ""].some((s) =>
    /audio request failed/i.test(
      formatRemotePlayError(`Audio request failed${s ? ` (${s})` : ""}`, t),
    ),
  ),
  false,
)

// --- Status-specific advice ---------------------------------------------
check(
  "429 -> rate limited",
  formatRemotePlayError("Audio request failed (429)", t),
  zh["player.err.rateLimited"],
)
check(
  "500 -> network copy",
  formatRemotePlayError("Audio request failed (500)", t),
  zh["player.err.network"],
)
check(
  "503 -> network copy",
  formatRemotePlayError("Audio request failed (503)", t),
  zh["player.err.network"],
)
check(
  "no status -> invalid audio",
  formatRemotePlayError("Audio request failed", t),
  zh["player.err.invalidAudio"],
)
check(
  "200 with HTML body -> invalid audio",
  formatRemotePlayError("Audio request failed (200)", t),
  zh["player.err.invalidAudio"],
)

// --- Pre-existing mappings must not regress -----------------------------
check(
  "decode failure -> invalid audio",
  formatRemotePlayError("Unable to decode audio data", t),
  zh["player.err.invalidAudio"],
)
check(
  "empty body -> invalid audio",
  formatRemotePlayError("Empty audio response", t),
  zh["player.err.invalidAudio"],
)
check(
  "socket error -> network",
  formatRemotePlayError("net::ERR_CONNECTION_RESET", t),
  zh["player.err.network"],
)
check(
  "timeout copy passes through",
  formatRemotePlayError(zh["player.err.playTimeout"], t),
  zh["player.err.playTimeout"],
)
check(
  "unknown copy passes through",
  formatRemotePlayError(zh["player.err.unknown"], t),
  zh["player.err.unknown"],
)

// --- Idempotence: already-formatted copy must survive a second pass ------
// `_handleError` formats a message that may already be formatted.
console.log("\nIdempotence: re-formatting formatted copy is stable")
for (const key of [
  "player.err.urlExpired",
  "player.err.rateLimited",
  "player.err.invalidAudio",
  "player.err.network",
  "player.err.playTimeout",
  "player.err.unknown",
]) {
  check(`stable: ${key}`, formatRemotePlayError(zh[key], t), zh[key])
}

// --- Unknown errors still get the detail wrapper ------------------------
check(
  "unrecognized error keeps detail",
  formatRemotePlayError("Some brand new engine error", t),
  `播放失败：Some brand new engine error`,
)

// --- Cancellations must stay silent -------------------------------------
console.log("\nCancellations are not failures")
for (const raw of [
  "The operation was aborted",
  "signal is aborted",
  "Request canceled",
  "Request cancelled",
  "Audio source changed",
]) {
  check(`ignorable: ${raw}`, isIgnorablePlayError(raw), true)
}
{
  const abort = new Error("x")
  abort.name = "AbortError"
  check("ignorable: AbortError by name", isIgnorablePlayError(abort), true)
}
check("real failure is not ignorable", isIgnorablePlayError("Audio request failed (403)"), false)

// --- MediaError classification ------------------------------------------
// Codes/messages measured in Chromium via scripts/probe-media-error-server.mjs.
console.log("\nMediaError: element failures get stable copy")
check(
  "aborted is not a failure",
  describeMediaError(MEDIA_ERR_ABORTED, "whatever"),
  null,
)
check(
  "404 with EMPTY message is not blank",
  describeMediaError(MEDIA_ERR_SRC_NOT_SUPPORTED, ""),
  "MediaError(code=4)",
)
check(
  "English engine prose is not leaked",
  describeMediaError(MEDIA_ERR_SRC_NOT_SUPPORTED, "MEDIA_ELEMENT_ERROR: Format error"),
  "MediaError(code=4)",
)
check(
  "network code stays distinct",
  describeMediaError(MEDIA_ERR_NETWORK, ""),
  "MediaError(code=2)",
)
check(
  "decode code",
  describeMediaError(MEDIA_ERR_DECODE, ""),
  "MediaError(code=3)",
)
check(
  "no code falls back to message",
  describeMediaError(null, "Some engine text"),
  "Some engine text",
)
check(
  "no code and no message still says something",
  describeMediaError(null, ""),
  "Playback error",
)
check(
  "null/undefined message handled",
  describeMediaError(undefined, undefined),
  "Playback error",
)

console.log("\nMediaError markers reach localized copy")
check(
  "code=4 -> invalid audio",
  formatRemotePlayError(describeMediaError(MEDIA_ERR_SRC_NOT_SUPPORTED, ""), t),
  zh["player.err.invalidAudio"],
)
check(
  "code=2 -> network",
  formatRemotePlayError(describeMediaError(MEDIA_ERR_NETWORK, ""), t),
  zh["player.err.network"],
)
// The pre-fix bug: an empty MediaError.message rendered as "播放失败：".
{
  const out = formatRemotePlayError(describeMediaError(MEDIA_ERR_SRC_NOT_SUPPORTED, ""), t)
  check("empty message never yields a blank toast", out.endsWith("：") || out === "", false)
}

// --- Internal invariant strings must not leak English -------------------
console.log("\nInternal invariant strings are localized")
for (const raw of ["Web Audio is unavailable", "No audio source", "Playback error"]) {
  check(`${raw} -> unknown`, formatRemotePlayError(raw, t), zh["player.err.unknown"])
}

console.log(failed === 0 ? "\nAll cases pass." : `\n${failed} case(s) failed.`)
process.exit(failed === 0 ? 0 : 1)
