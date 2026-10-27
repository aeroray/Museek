// Verifies the bilingual completeness constraint (MC-CON-20261021-00000002):
// every UI string exists in both `zh` and `en`. A key with only one language is
// incomplete, and `translate()` silently falls back to zh, which hides the gap.
//
//   node scripts/check-i18n-parity.mjs
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const src = readFileSync(join(root, "src/lib/i18n.ts"), "utf8")

const zhStart = src.indexOf("  zh: {")
const enStart = src.indexOf("  en: {")
if (zhStart < 0 || enStart < 0) {
  console.error("could not locate the zh/en dictionaries in src/lib/i18n.ts")
  process.exit(1)
}

const keysIn = (block) =>
  [...block.matchAll(/^\s*"([^"]+)":/gm)]
    .map((m) => m[1])
    // The nested `dict` entries end when the next top-level property starts.
    .filter(Boolean)

const zhKeys = keysIn(src.slice(zhStart, enStart))
const enKeys = keysIn(src.slice(enStart))

let failures = 0
const check = (name, cond, extra = "") => {
  if (cond) console.log(`  ok   ${name}`)
  else {
    console.log(`  FAIL ${name}${extra ? "  " + extra : ""}`)
    failures++
  }
}

check(`zh has keys (${zhKeys.length})`, zhKeys.length > 500)
check(`en has keys (${enKeys.length})`, enKeys.length > 500)

const onlyZh = zhKeys.filter((k) => !enKeys.includes(k))
const onlyEn = enKeys.filter((k) => !zhKeys.includes(k))

check(
  "no key is missing from en",
  onlyZh.length === 0,
  onlyZh.length ? `missing: ${onlyZh.slice(0, 10).join(", ")}` : "",
)
check(
  "no key is missing from zh",
  onlyEn.length === 0,
  onlyEn.length ? `missing: ${onlyEn.slice(0, 10).join(", ")}` : "",
)

// Duplicate keys inside one dictionary silently shadow each other.
for (const [name, keys] of [
  ["zh", zhKeys],
  ["en", enKeys],
]) {
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i)
  check(`no duplicate keys in ${name}`, dupes.length === 0, dupes.slice(0, 10).join(", "))
}

console.log("")
if (failures) {
  console.log(`FAILED: ${failures} case(s)`)
  process.exit(1)
}
console.log("i18n parity checks passed.")
