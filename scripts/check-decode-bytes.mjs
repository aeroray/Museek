// Verifies the byte pipeline `decodeWebAudio` now runs before decoding:
// gunzip, then reject bodies that are clearly not audio.
//
//   node --experimental-strip-types scripts/check-decode-bytes.mjs
//
// This mirrors src/lib/audio.ts `decodeWebAudio`. The helpers are the real ones
// from src/lib/audioBytes.ts, so this fails if that module's behaviour drifts.
import * as pako from "pako"
import {
  looksLikeNonAudioBytes,
  maybeGunzipAudio,
} from "../src/lib/audioBytes.ts"

let failed = 0
const check = (name, actual, expected) => {
  const ok = actual === expected
  if (!ok) failed += 1
  console.log(`${ok ? "OK  " : "FAIL"}  ${name.padEnd(56)} => ${actual}${ok ? "" : ` (expected ${expected})`}`)
}

const enc = (s) => new TextEncoder().encode(s)

// Stand-in for real containers: only the leading magic bytes matter here.
const ID3_MP3 = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, ...new Uint8Array(64)])
const FLAC = new Uint8Array([0x66, 0x4c, 0x61, 0x43, ...new Uint8Array(64)])
const MP4 = new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, ...new Uint8Array(64)])
const OGG = new Uint8Array([0x4f, 0x67, 0x67, 0x53, ...new Uint8Array(64)])

// Mirrors decodeWebAudio's decision: does this body get rejected as non-audio?
const rejects = (raw) => {
  const bytes = maybeGunzipAudio(raw)
  if (!bytes.byteLength) return "empty"
  return looksLikeNonAudioBytes(bytes) ? "reject" : "decode"
}

console.log("Plain bodies")
check("ID3 mp3", rejects(ID3_MP3), "decode")
check("flac", rejects(FLAC), "decode")
check("mp4/m4a", rejects(MP4), "decode")
check("ogg", rejects(OGG), "decode")
check("empty", rejects(new Uint8Array(0)), "empty")

console.log("\nError pages served as 200 (the hotlink/geo block shape)")
check("html", rejects(enc("<!doctype html><html><body>blocked</body></html>")), "reject")
check("html no doctype", rejects(enc("<html><head></head></html>")), "reject")
check("json", rejects(enc('{"code":403,"msg":"no permission"}')), "reject")
check("json array", rejects(enc('[{"error":"nope"}]')), "reject")
check("xml", rejects(enc('<?xml version="1.0"?><error/>')), "reject")
check("leading whitespace html", rejects(enc("\n\n   <!doctype html><html></html>")), "reject")
check("BOM + html", rejects(new Uint8Array([0xef, 0xbb, 0xbf, ...enc("<html></html>")])), "reject")

console.log("\nGzipped bodies (Tauri HTTP can leave these compressed)")
check("gzip mp3 -> decode", rejects(pako.gzip(ID3_MP3)), "decode")
check("gzip flac -> decode", rejects(pako.gzip(FLAC)), "decode")
check("gzip html -> reject", rejects(pako.gzip(enc("<!doctype html><html></html>"))), "reject")
check("gzip json -> reject", rejects(pako.gzip(enc('{"code":403}'))), "reject")
// The regression this guards: a gzipped body used to reach decodeAudioData raw.
check("gzip is actually unwrapped", maybeGunzipAudio(pako.gzip(ID3_MP3))[0], 0x49)

console.log("\nCorrupt gzip must not crash or lose the body")
{
  // Valid magic, garbage payload: pako throws, helper returns the input as-is.
  const corrupt = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 1, 2, 3, 4, 5, 6, 7, 8])
  const out = maybeGunzipAudio(corrupt)
  check("corrupt gzip returns input", out === corrupt, true)
  check("corrupt gzip still decodes", rejects(corrupt), "decode")
}

console.log(failed === 0 ? "\nAll cases pass." : `\n${failed} case(s) failed.`)
process.exit(failed === 0 ? 0 : 1)
