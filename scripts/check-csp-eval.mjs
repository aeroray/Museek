// Pins the CSP <-> source-sandbox coupling.
//
// The source-script sandbox loads user-imported lx-music scripts with
// `new Function(rawScript)` (src/lib/sources/sourceWorker.ts). CSP gates that
// behind `'unsafe-eval'` in the creating realm's `script-src`, and a
// same-origin dedicated worker inherits the document's policy.
//
// This is easy to get wrong invisibly: Tauri serves the CSP header only for the
// bundled app over `tauri://`, so `pnpm tauri dev` (which loads from the Vite
// dev server) never enforces it. A missing 'unsafe-eval' therefore breaks every
// imported source script in a packaged release while development looks fine.
//
// The tradeoff is deliberate: arbitrary JS is the entire mechanism by which
// Museek gets playback URLs, so eval cannot be removed without replacing the
// source-script model. What this check buys is that the coupling is explicit
// and cannot drift silently in either direction.
//
//   node scripts/check-csp-eval.mjs
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")

let failures = 0
const check = (name, cond, extra = "") => {
  if (cond) console.log(`  ok   ${name}`)
  else {
    console.log(`  FAIL ${name}${extra ? "  " + extra : ""}`)
    failures++
  }
}

const conf = JSON.parse(
  readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8"),
)
const csp = conf?.app?.security?.csp ?? ""
const workerSrc = readFileSync(
  join(root, "src/lib/sources/sourceWorker.ts"),
  "utf8",
)

/** Pull one directive out of a CSP string. */
function directive(name) {
  const part = csp
    .split(";")
    .map((d) => d.trim())
    .find((d) => d === name || d.startsWith(name + " "))
  return part ?? ""
}

const scriptSrc = directive("script-src")

console.log("the sandbox really does evaluate scripts with eval")
{
  check(
    "sourceWorker loads scripts via new Function",
    /new Function\(/.test(workerSrc),
  )
}

console.log("\nscript-src must therefore permit eval")
{
  check("a csp is configured", csp.length > 0)
  check("script-src is present", scriptSrc.length > 0)
  check(
    "'unsafe-eval' is allowed (a packaged build breaks every source script without it)",
    scriptSrc.includes("'unsafe-eval'"),
    scriptSrc,
  )
  check(
    "eval was not granted to a wider directive set than needed (object-src still 'none')",
    directive("object-src") === "object-src 'none'",
    directive("object-src"),
  )
}

console.log("\nthe rest of the policy stays tight")
{
  check("base-uri is locked", directive("base-uri") === "base-uri 'self'")
  check("frame-src is none", directive("frame-src") === "frame-src 'none'")
  check(
    "workers are same-origin only",
    directive("worker-src") === "worker-src 'self'",
    directive("worker-src"),
  )
  check(
    "default-src does not fall back to a wildcard",
    !directive("default-src").includes("*"),
    directive("default-src"),
  )
}

console.log("\nthe worker confinement is installed and asserted")
{
  check("network stubs are installed", /installNetworkStubs\(\)/.test(workerSrc))
  check(
    "the stub list is verified before the worker reports ready",
    /assertNetworkStubs\(\)/.test(workerSrc),
  )
  for (const name of ["EventSource", "WebTransport", "WebTransport", "WebSocketStream"]) {
    check(`${name} is blocked`, workerSrc.includes(`lock("${name}"`))
  }
}

console.log("")
if (failures) {
  console.log(`FAILED: ${failures} case(s)`)
  process.exit(1)
}
console.log("CSP / eval coupling checks passed.")
