// Pins the DES primitive behind `decodeQrc`, using FIPS 46-3 known-answer
// vectors. This is the check that was missing when the bug shipped:
// `src/lib/lyrics/qrc.ts` had two S-box cells that were not permutations of
// 0..15 (so not valid DES tables at all) and a C/D bit off-by-one in
// `createSubkeys`. Together they made the QQ Music QRC payload decrypt to
// garbage, `decodeQrc` returned "", and every word-by-word QQ lyric silently
// degraded to line-timed LRC — no error, no log, feature just never worked.
//
// Two properties are checked:
//   1. Structural: every S-box row is a permutation of 0..15. This is the
//      invariant that catches a typo'd table without needing to trust anyone's
//      memory of the canonical values, and it is what would most plausibly be
//      broken again by a careless edit.
//   2. Behavioural: the published DES known-answer vectors from FIPS 46-3.
//
// The S-box halves are verified structurally rather than by comparing against a
// pasted copy of the table, because a pasted copy is exactly the sort of second
// source of truth that drifts. The KAT then covers correctness end to end.
//
//   node scripts/check-qrc-des.mjs
import { createTsLoader } from "./lib/load-ts.mjs"

const load = createTsLoader()
const { desBlock } = await load("src/lib/lyrics/qrc.ts")

let failures = 0
const check = (name, cond, extra = "") => {
  if (cond) console.log(`  ok   ${name}`)
  else {
    console.log(`  FAIL ${name}${extra ? "  " + extra : ""}`)
    failures++
  }
}

// The module works on bytes laid out in DES's "reference bit" order, where the
// 8-byte block is read as [B3,B2,B1,B0,B7,B6,B5,B4] relative to the wire bytes.
// Converting here keeps the check reading like the published vectors.
const toRef = (u) => new Uint8Array([u[3], u[2], u[1], u[0], u[7], u[6], u[5], u[4]])
const hex = (u) => [...u].map((b) => b.toString(16).padStart(2, "0")).join("")
const fromHex = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)))

console.log("S-box tables are valid DES permutations")
{
  // Read the tables back out of the module source. They are module-private, and
  // exporting 8 tables purely for a test would be worse than parsing them.
  const { readFileSync } = await import("node:fs")
  const { join, resolve } = await import("node:path")
  const src = readFileSync(
    join(resolve(import.meta.dirname, ".."), "src/lib/lyrics/qrc.ts"),
    "utf8",
  )
  const table = src.slice(src.indexOf("const SBOXES"), src.indexOf("] as const;"))
  const rows = [...table.matchAll(/\[([\d,\s]+)\]/g)]
    .map((m) => m[1])
    .filter((body) => body.includes(","))
    .map((body) => body.split(",").map((n) => Number(n.trim())))

  check("found 8 S-boxes x 4 rows = 32 rows", rows.length === 32, `got ${rows.length}`)
  let bad = 0
  for (const [i, row] of rows.entries()) {
    const sorted = [...row].sort((a, b) => a - b)
    const isPerm = sorted.length === 16 && sorted.every((v, j) => v === j)
    if (!isPerm) {
      bad++
      const dupes = row.filter((v, j) => row.indexOf(v) !== j)
      const missing = [...Array(16).keys()].filter((v) => !row.includes(v))
      console.log(
        `       row ${i} is not a permutation: dupes=${JSON.stringify(dupes)} missing=${JSON.stringify(missing)}`,
      )
    }
  }
  check("every S-box row is a permutation of 0..15 (the shipped bug)", bad === 0)
}

console.log("\nFIPS 46-3 known-answer vectors")
{
  // [key, plaintext, expected ciphertext], all 64-bit hex from the standard.
  const vectors = [
    ["0123456789abcdef", "4e6f772069732074", "3fa40e8a984d4815"],
    ["0000000000000000", "0000000000000000", "8ca64de9c1b123a7"],
    ["ffffffffffffffff", "ffffffffffffffff", "7359b2163e4edc58"],
    ["1046913489980131", "0000000000000000", "88d55e54f54c97b4"],
    ["0101010101010101", "0123456789abcdef", "617b3a0ce8f07100"],
    ["1111111111111111", "1111111111111111", "f40379ab9e0ec533"],
    ["133457799bbcdff1", "0123456789abcdef", "85e813540f0ab405"],
  ]
  let pass = 0
  for (const [k, p, expected] of vectors) {
    const got = hex(toRef(desBlock(toRef(fromHex(p)), toRef(fromHex(k)), false)))
    if (got === expected) pass++
    else console.log(`       key=${k} pt=${p} want=${expected} got=${got}`)
  }
  check(`all ${vectors.length} vectors encrypt correctly`, pass === vectors.length, `${pass}/${vectors.length}`)

  // Round-trip: decrypt(encrypt(x)) === x, which also exercises the reversed
  // key schedule that QRC relies on.
  const key = toRef(fromHex("133457799bbcdff1"))
  const plain = toRef(fromHex("0123456789abcdef"))
  const enc = desBlock(plain, key, false)
  const dec = hex(toRef(desBlock(enc, key, true)))
  check("decrypt inverts encrypt", dec === "0123456789abcdef", dec)
}

console.log("")
if (failures) {
  console.log(`FAILED: ${failures} case(s)`)
  process.exit(1)
}
console.log("QRC DES checks passed.")
