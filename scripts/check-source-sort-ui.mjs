// Renders the real SourceManager in headless Chrome and drives it, to prove
// "sort by quality" is offered only when every testable source has a result and
// that clicking it actually reorders the table.
//
//   node scripts/check-source-sort-ui.mjs
//
// Bundles with the project's own esbuild (resolving `@` the way vite does), so
// the component under test is the real one.
import { spawn, execFileSync } from "node:child_process"
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const work = join(import.meta.dirname, "source-sort-harness")
mkdirSync(work, { recursive: true })

const CHROME = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
]
  .filter(Boolean)
  .find((p) => existsSync(p))
if (!CHROME) {
  // Exit code 2 means "environment cannot run this", which the runner reports
  // as SKIP rather than FAIL: a missing browser must not look like a regression.
  console.error("SKIP: no Chrome/Edge found; set CHROME_PATH to run this check.")
  process.exit(2)
}

// --- bundle ---------------------------------------------------------------
const entry = join(work, "entry.tsx")
const outfile = join(work, "bundle.js")

// A script that declares N platforms and can serve a play URL on each.
const mkScript = (id, platforms, enabled = true) => `
{
  id: ${JSON.stringify(id)}, name: ${JSON.stringify(id)},
  version: "1.0", author: "", url: "local:" + ${JSON.stringify(id)} + ".js",
  enabled: ${enabled}, rawScript: "/*! @name " + ${JSON.stringify(id)} + " @version 1.0 */",
  sources: Object.fromEntries(${JSON.stringify(platforms)}.map((p) => [p, { name: p, type: "music", actions: ["musicUrl"], qualitys: ["128k"] }])),
}`

writeFileSync(
  entry,
  `import { createRoot } from "react-dom/client"
import { SourceManager } from "@/components/settings/SourceManager"
import { useSourceStore } from "@/stores/sourceStore"
import { TooltipProvider } from "@/components/ui/tooltip"

// Three sources with different declared platforms, seeded in a deliberately
// BAD order ("worst" first) so a successful sort is unmistakable.
const scripts = [
  ${mkScript("worst", ["wy"])},
  ${mkScript("mid", ["wy", "kw"])},
  ${mkScript("best", ["wy", "kw", "kg", "tx"])},
]

useSourceStore.setState({ scripts, probeResults: {}, isLoading: false, error: null })

// Deterministic probe results: worst=0/1, mid=2/2, best=4/4.
const FULL = {
  worst: { platforms: { wy: false } },
  mid: { platforms: { wy: true, kw: true } },
  best: { platforms: { wy: true, kw: true, kg: true, tx: true } },
}
const NONE = {}

window.__seed = (probes) => useSourceStore.setState({ scripts, probeResults: probes })
window.__order = () =>
  [...document.querySelectorAll("[data-script-id]")].map((el) => el.getAttribute("data-script-id"))
window.__hasExport = () =>
  [...document.querySelectorAll("button")].some((b) =>
    (b.textContent || "").includes("导出音源") || (b.textContent || "").includes("Export sources"),
  )
window.__buttons = () => [...document.querySelectorAll("button")].map((b) => b.textContent.trim())
// Match on the rendered label. The button's own textContent includes the icon,
// which contributes nothing, so a substring test is the reliable form.
window.__hasSort = () =>
  [...document.querySelectorAll("button")].some((b) =>
    (b.textContent || "").includes("一键排序") || (b.textContent || "").includes("Sort by quality"),
  )
window.__clickSort = () => {
  const b = [...document.querySelectorAll("button")].find(
    (x) =>
      (x.textContent || "").includes("一键排序") || (x.textContent || "").includes("Sort by quality"),
  )
  if (!b) return false
  b.click()
  return true
}
window.__enabled = () => useSourceStore.getState().scripts.map((s) => [s.id, s.enabled])
window.__FULL = FULL
window.__NONE = NONE

createRoot(document.getElementById("root")).render(<TooltipProvider><SourceManager /></TooltipProvider>)
`,
)

const esbuildRunner = join(work, "runner.mjs")
writeFileSync(
  esbuildRunner,
  `import { createRequire } from "node:module"
import { readdirSync } from "node:fs"
import { join } from "node:path"
const root = ${JSON.stringify(root)}
const require = createRequire(import.meta.url)
function esbuildEntry() {
  try { return require.resolve("esbuild/lib/main.js", { paths: [root] }) } catch {}
  const pnpm = join(root, "node_modules", ".pnpm")
  const dir = readdirSync(pnpm).find((d) => d.startsWith("esbuild@"))
  if (!dir) throw new Error("esbuild not found; run pnpm install")
  return join(pnpm, dir, "node_modules", "esbuild", "lib", "main.js")
}
const esbuild = require(esbuildEntry())
await esbuild.build({
  entryPoints: [${JSON.stringify(entry)}],
  bundle: true, format: "iife", outfile: ${JSON.stringify(outfile)},
  logLevel: "error", jsx: "automatic",
  alias: { "@": join(root, "src") },
  define: { "process.env.NODE_ENV": '"production"' },
})
`,
)

try {
  execFileSync(process.execPath, [esbuildRunner], { stdio: "inherit" })
} catch {
  console.error("bundle failed")
  process.exit(1)
}

// --- run ------------------------------------------------------------------
const PORT = 9900 + Math.floor(Math.random() * 90)
const profile = join(process.env.TEMP || "/tmp", `museek-ss-${PORT}`)
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore" },
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function targetWs() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl)
      if (page) return page.webSocketDebuggerUrl
    } catch {}
    await sleep(250)
  }
  throw new Error("devtools never came up")
}

const ws = new WebSocket(await targetWs())
await new Promise((r) => (ws.onopen = r))
let id = 0
const pending = new Map()
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  }
}
const send = (method, params = {}) => {
  const n = ++id
  ws.send(JSON.stringify({ id: n, method, params }))
  return new Promise((r) => pending.set(n, r))
}
async function evaluate(expression) {
  const r = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })
  if (r.result?.exceptionDetails) {
    throw new Error(JSON.stringify(r.result.exceptionDetails))
  }
  return r.result?.result?.value
}

await send("Page.enable")
await send("Runtime.enable")

const html = `<!doctype html><html><body style="margin:0;font-family:sans-serif">
<div id="root"></div>
<script>${readFileSync(outfile, "utf8")}</script>
</body></html>`
const htmlPath = join(work, "index.html")
writeFileSync(htmlPath, html)
await send("Page.navigate", { url: "file:///" + htmlPath.replace(/\\/g, "/") })
await sleep(1200)

let failed = 0
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failed++
  console.log(
    `${ok ? "OK  " : "FAIL"}  ${name.padEnd(56)} => ${JSON.stringify(actual)}${ok ? "" : `  (expected ${JSON.stringify(expected)})`}`,
  )
}

// 1. No probe results at all -> action must be absent.
await evaluate("window.__seed(window.__NONE); 1")
await sleep(300)
check("no results: button hidden", await evaluate("window.__hasSort()"), false)
check("no results: order untouched", await evaluate("window.__order()"), ["worst", "mid", "best"])

// 2. Partial results -> still hidden (this is the reported rule).
await evaluate(
  `window.__seed({ worst: window.__FULL.worst, mid: window.__FULL.mid }); 1`,
)
await sleep(300)
check("partial results: button still hidden", await evaluate("window.__hasSort()"), false)
check("partial results: order untouched", await evaluate("window.__order()"), ["worst", "mid", "best"])

// 3. Every source probed -> action appears.
await evaluate(`window.__seed(window.__FULL); 1`)
await sleep(300)
check("all results: button shown", await evaluate("window.__hasSort()"), true)
check("export button shown when sources exist", await evaluate("window.__hasExport()"), true)

const enabledBefore = await evaluate("window.__enabled()")

// 4. Click it -> reordered best-first.
check("click returns true", await evaluate("window.__clickSort()"), true)
await sleep(500)
check("after click: best first", await evaluate("window.__order()"), ["best", "mid", "worst"])
// Compare the enabled FLAGS by id, not the list order: sorting legitimately
// reorders the array, and the invariant is that no flag flipped. Emit a
// key-sorted representation so the comparison is order-insensitive.
const flagMap = (pairs) =>
  JSON.stringify(pairs.map(([id, on]) => [id, on]).sort((a, b) => a[0].localeCompare(b[0])))
check(
  "after click: enabled flags unchanged",
  flagMap(await evaluate("window.__enabled()")),
  flagMap(enabledBefore),
)
check("after click: button still visible", await evaluate("window.__hasSort()"), true)

// 5. Click again -> idempotent, no further change.
check("second click returns true", await evaluate("window.__clickSort()"), true)
await sleep(400)
check("second click: order stable", await evaluate("window.__order()"), ["best", "mid", "worst"])

ws.close()
chrome.kill()
await sleep(300)
rmSync(work, { recursive: true, force: true })
rmSync(profile, { recursive: true, force: true })

console.log("")
if (failed) {
  console.log(`FAILED: ${failed} case(s)`)
  process.exit(1)
}
console.log("All source sort UI checks passed.")
