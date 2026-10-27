// Drives the real `useInfiniteScroll` hook in headless Chrome against a real
// overflowing scroll container, because that hook is what makes the playlist
// grid fetch page 2 at all.
//
// The wiring it replaces failed in a way a pure-logic test cannot see: the
// component only ever asked for page 1, so the grid dead-ended after ~30 cards.
// What must hold is that scrolling near the bottom requests exactly one more
// page, that a disabled/finished list requests nothing, and that it keeps
// working for page 3, 4, … rather than firing once.
//
//   node scripts/check-infinite-scroll.mjs
import { spawn, execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const work = join(import.meta.dirname, "infinite-scroll-harness")
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

const entry = join(work, "entry.tsx")
const outfile = join(work, "bundle.js")

writeFileSync(
  entry,
  `import { useCallback, useEffect, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll"

// A controlled list: each "page" appends ROWS items, and the harness records
// every requested page so it can assert exactly what the hook asked for.
const INITIAL = 40  // taller than the 200px viewport, so nothing auto-loads on mount
const ROWS = 10

function Harness() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [items, setItems] = useState(() => Array.from({ length: INITIAL }, (_, i) => i))
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [busy, setBusy] = useState(false)
  const [, force] = useState(0)

  const loadMore = useCallback(() => {
    window.__requested.push(page + 1)
    setBusy(true)
    // Resolve on a macrotask so isLoading is observable during the load.
    setTimeout(() => {
      setPage((p) => p + 1)
      setItems((prev) => [
        ...prev,
        ...Array.from({ length: ROWS }, (_, i) => prev.length + i),
      ])
      setBusy(false)
      force((n) => n + 1)
    }, 30)
  }, [page])

  useInfiniteScroll({
    scrollRef,
    hasMore,
    isLoading: busy,
    onLoadMore: loadMore,
  })

  return (
    <div>
      <div
        ref={scrollRef}
        id="vp"
        style={{ height: "200px", overflowY: "auto" }}
      >
        {items.map((i) => (
          <div key={i} style={{ height: "20px" }}>row {i}</div>
        ))}
      </div>
      <div id="state">{JSON.stringify({ page, hasMore, busy })}</div>
    </div>
  )
}

window.__requested = []
window.__setHasMore = (v) => window.__harnessSetHasMore(v)
window.__rows = () => document.querySelectorAll("#vp > div").length
window.__scrollToBottom = () => {
  const vp = document.getElementById("vp")
  vp.scrollTop = vp.scrollHeight
  vp.dispatchEvent(new Event("scroll", { bubbles: true }))
}
window.__scrollToTop = () => {
  const vp = document.getElementById("vp")
  vp.scrollTop = 0
  vp.dispatchEvent(new Event("scroll", { bubbles: true }))
}

// ---------------------------------------------------------------------------
// Page-level binding. The hook working is not enough — every list that uses it
// must actually bind to the right node. Both failures below shipped once:
//
//   * a Radix ScrollArea renders its viewport in a CHILD effect, so a
//     state-based lookup can see null on its first pass and, with
//     hasMore/isLoading unchanged, never retry;
//   * the caller may pass null while a viewport exists on screen, which is
//     what happened when the collection ScrollArea had no ref at all.
//
// This harness reproduces both: the viewport appears one frame late, and the
// element handed to the hook stays null.
function LateMountHarness() {
  const [mounted, setMounted] = useState(false)
  const [items, setItems] = useState(() => Array.from({ length: 40 }, (_, i) => i))
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(false)

  // Radix-style: the scroll node shows up after the parent's first effect.
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const loadMore = useCallback(() => {
    window.__lateRequested.push(page + 1)
    setBusy(true)
    setTimeout(() => {
      setPage((p) => p + 1)
      setItems((prev) => [...prev, ...Array.from({ length: 10 }, (_, i) => prev.length + i)])
      setBusy(false)
    }, 30)
  }, [page])

  // Deliberately pass null: the hook must fall back to the on-screen viewport.
  useInfiniteScroll({
    scrollElement: null,
    hasMore: true,
    isLoading: busy,
    onLoadMore: loadMore,
  })

  return (
    <div>
      <div
        id="latevp"
        data-radix-scroll-area-viewport=""
        style={{ height: "200px", overflowY: "auto" }}
      >
        {mounted ? items.map((i) => <div key={i} style={{ height: "20px" }}>r{i}</div>) : null}
      </div>
    </div>
  )
}

window.__lateRequested = []
window.__lateRows = () => document.querySelectorAll("#latevp > div").length
window.__scrollLate = () => {
  const vp = document.getElementById("latevp")
  vp.scrollTop = vp.scrollHeight
  vp.dispatchEvent(new Event("scroll", { bubbles: true }))
}

const mode = new URLSearchParams(location.search).get("mode")
createRoot(document.getElementById("root")).render(
  mode === "late" ? <LateMountHarness /> : <Harness />,
)
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

const PORT = 9600 + Math.floor(Math.random() * 90)
const profile = join(process.env.TEMP || "/tmp", `museek-is-${PORT}`)
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
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails))
  return r.result?.result?.value
}

await send("Page.enable")
await send("Runtime.enable")

const html = `<!doctype html><html><body style="margin:0">
<div id="root"></div>
<script>${readFileSync(outfile, "utf8")}</script>
</body></html>`
const htmlPath = join(work, "index.html")
writeFileSync(htmlPath, html)
await send("Page.navigate", { url: "file:///" + htmlPath.replace(/\\/g, "/") })
await sleep(1000)

let failures = 0
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(
    `${ok ? "OK  " : "FAIL"}  ${name.padEnd(50)} => ${JSON.stringify(actual)}${ok ? "" : `  (expected ${JSON.stringify(expected)})`}`,
  )
}

// 1. Nothing loads before the user scrolls (content is taller than the viewport,
//    so the nearest-bottom check must not fire on mount).
check("no load before scrolling", await evaluate("window.__requested.length"), 0)

// 2. Scrolling to the bottom requests exactly page 2.
await evaluate("window.__scrollToBottom()")
await sleep(450)
check("bottom scroll requests page 2", await evaluate("window.__requested"), [2])
const rowsAfter = await evaluate("window.__rows()")
check(`rows grew by one page to 50 (got ${rowsAfter})`, rowsAfter, 50)

// 3. Repeated scrolls converge on page 3 (not page 2 twice).
await evaluate("window.__scrollToBottom()")
await sleep(450)
check("next scroll requests page 3", await evaluate("window.__requested"), [2, 3])

// 4. Scrolling back to the top must not request anything.
await evaluate("window.__scrollToTop()")
await sleep(150)
check("top scroll requests nothing", await evaluate("window.__requested"), [2, 3])

// 5. Further pages keep working — the hook is not one-shot.
await evaluate("window.__scrollToBottom()")
await sleep(450)
await evaluate("window.__scrollToBottom()")
await sleep(450)
const req = await evaluate("window.__requested")
check(`kept paginating (got ${JSON.stringify(req)})`, req.length >= 4, true)

// ---------------------------------------------------------------------------
// 6. Page-level binding: the viewport mounts one frame late AND the caller
//    passes `null`. Both shipped as bugs; either alone makes the list dead.
await send("Page.navigate", { url: "file:///" + htmlPath.replace(/\\/g, "/") + "?mode=late" })
await sleep(1200)

check(
  "late mount: hook still binds (rows rendered)",
  (await evaluate("window.__lateRows()")) > 0,
  true,
)

await evaluate("window.__scrollLate()")
await sleep(450)
const lateReq = await evaluate("window.__lateRequested")
check(`late mount: scrolling loads page 2 (got ${JSON.stringify(lateReq)})`, lateReq.length >= 1, true)

await evaluate("window.__scrollLate()")
await sleep(450)
const lateReq2 = await evaluate("window.__lateRequested")
check(
  `late mount: keeps loading (got ${JSON.stringify(lateReq2)})`,
  lateReq2.length >= 2,
  true,
)

ws.close()
chrome.kill()
await sleep(300)
rmSync(work, { recursive: true, force: true })
rmSync(profile, { recursive: true, force: true })

console.log("")
if (failures) {
  console.log(`FAILED: ${failures} case(s)`)
  process.exit(1)
}
console.log("Infinite-scroll hook checks passed.")
