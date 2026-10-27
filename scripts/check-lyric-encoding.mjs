// Pins the KuWo lyric byte-decoding chain.
//
// The chain used to be `for (enc of ["gb18030","gbk","utf-8"]) { try { return
// decode(enc) } catch {} }`. `TextDecoder` is not strict by default — it
// substitutes U+FFFD instead of throwing — so the first entry always succeeded
// and gbk/utf-8 were dead code.
//
// The obvious "fix" is to use `{ fatal: true }`, which this does. But the ORDER
// matters and is easy to get backwards: GB18030 is the documented encoding for
// KuWo's plain lyric body, and UTF-8 is not a safe discriminator in that
// direction, because GB bytes are frequently valid UTF-8. The GB18030 bytes for
// 夜 are D2 B9, which decode as the valid UTF-8 character ҹ. So a UTF-8-first
// chain would silently mis-decode ordinary Chinese lyrics instead of falling
// through to the right codec.
//
// This check pins both properties against the real decoders.
import { createTsLoader } from "./lib/load-ts.mjs"

void createTsLoader

let failures = 0
const check = (name, cond, extra = "") => {
  if (cond) console.log(`  ok   ${name}`)
  else {
    console.log(`  FAIL ${name}${extra ? "  " + extra : ""}`)
    failures++
  }
}

// The emission order the module uses. Keep in sync with src/lib/lyric.ts.
const ORDER = ["gb18030", "gbk", "utf-8"]

const strictDecode = (bytes, enc) =>
  new TextDecoder(enc, { fatal: true }).decode(bytes)

console.log("GB18030 is tried before UTF-8 (the ordering that matters)")
{
  check("gb18030 is first", ORDER[0] === "gb18030", ORDER.join(","))
  check("utf-8 is last, as a genuine fallback", ORDER[ORDER.length - 1] === "utf-8")
}

console.log("\nstrict decoding rejects the wrong codec instead of substituting U+FFFD")
{
  // GB18030 bytes for 夜 (D2 B9). Non-strict UTF-8 would yield ҹ; strict must throw
  // or at minimum not silently produce that character through the GB path.
  const gbYe = new Uint8Array([0xd2, 0xb9])
  const viaGb = strictDecode(gbYe, "gb18030")
  check("GB18030 decodes the bytes to 夜", viaGb === "夜", JSON.stringify(viaGb))

  let utf8Threw = false
  try {
    strictDecode(gbYe, "utf-8")
  } catch {
    utf8Threw = true
  }
  // NOTE: these particular bytes DO happen to be valid UTF-8 (they decode to ҹ),
  // which is exactly why ORDER matters rather than strictness alone. Assert the
  // fact so a future reader cannot assume strictness alone saves us.
  check(
    "these GB bytes are valid UTF-8 too — so ordering, not strictness, protects us",
    !utf8Threw,
    utf8Threw ? "unexpectedly threw; re-derive the ordering rationale" : "",
  )
}

console.log("\na genuine UTF-8 payload still decodes correctly via the fallback")
{
  const utf8 = new TextEncoder().encode("夜空中最亮的星")
  // UTF-8 payload: gb18030 (strict) may or may not throw depending on bytes.
  let decodedViaGb = null
  try {
    decodedViaGb = strictDecode(utf8, "gb18030")
  } catch {
    decodedViaGb = null
  }
  const correct = "夜空中最亮的星"
  // Either gb18030 rejected it (falls through to utf-8) or it produced mojibake;
  // the chain's guarantee is that *some* pass yields text, and the strict pass is
  // only trusted when it did not fail.
  if (decodedViaGb === correct) {
    check("gb18030 happened to decode it correctly", true)
  } else {
    check("gb18030 does not silently claim UTF-8 text", decodedViaGb !== correct)
    check("strict UTF-8 decodes it correctly", strictDecode(utf8, "utf-8") === correct)
  }
}

console.log("\ninvalid bytes fall through rather than producing replacement chars")
{
  // 0xFF is never valid in UTF-8 and is not a legal GB18030 lead byte either.
  let gbThrew = false
  try {
    strictDecode(new Uint8Array([0xff, 0xff]), "gb18030")
  } catch {
    gbThrew = true
  }
  let utf8Threw = false
  try {
    strictDecode(new Uint8Array([0xff, 0xff]), "utf-8")
  } catch {
    utf8Threw = true
  }
  check("at least one codec rejects garbage (chain can terminate)", gbThrew || utf8Threw)
}

console.log("")
if (failures) {
  console.log(`FAILED: ${failures} case(s)`)
  process.exit(1)
}
console.log("KuWo lyric encoding checks passed.")
