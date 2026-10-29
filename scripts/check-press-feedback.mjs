// Two reported regressions, measured in a real browser.
//
// 1. Hot-keyword cloud: hovering does nothing and clicking does nothing.
//    Cause: `.hot-cloud-word` used `animation-fill-mode: both`, so the entrance
//    animation's `to { transform: translateY(0) scale(1) }` kept applying after
//    the animation finished. A running/filling animation's transform wins over
//    any transition/utility transform from another state, so `hover:scale-110`
//    and `active:scale-95` were dead. Fill mode is now `backwards`.
//
// 2. Sidebar nav link shrinks further the longer it is held.
//    Cause: the press transition used `--ease-spring-snappy`, whose curve peaks
//    at 1.114 — above 1. On a shrink from 1 to 0.96 the overshoot renders
//    ~0.96 x (2 - 1.114) = 0.92 partway through, smaller than the target.
//    Sampling during that window reads as "the longer I press, the smaller it
//    gets". The press curve is now `ease-out`, which is monotonic.
//
//   node scripts/check-press-feedback.mjs
import { spawn, execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const work = join(import.meta.dirname, "press-feedback-harness")
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
  console.error("SKIP: no Chrome/Edge found; set CHROME_PATH to run this check.")
  process.exit(2)
}

const entry = join(work, "entry.tsx")
const outfile = join(work, "bundle.js")

writeFileSync(
  entry,
  `import { createRoot } from "react-dom/client"
import { Search } from "lucide-react"

// Reproduce both call sites with their real classes.
function Harness() {
  return (
    <div style={{ padding: 40, background: "#fff", display: "flex", flexDirection: "column", gap: 24 }}>
      <a
        id="nav"
        href="#"
        className="relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium icon-motion text-muted-foreground hover:bg-accent/70"
      >
        <Search size={16} />
        <span>Search</span>
      </a>

      <button
        id="word"
        className="hot-cloud-word leading-none tracking-tight will-change-transform transform-gpu transition-[transform,filter,opacity] duration-200 ease-out hover:scale-110 hover:brightness-110 active:scale-95 text-2xl font-semibold"
        style={{ animationDelay: "0ms" }}
      >
        keyword
      </button>
    </div>
  )
}
createRoot(document.getElementById("root")).render(<Harness />)
`,
)

const runner = join(work, "runner.mjs")
writeFileSync(
  runner,
  `import { createRequire } from "node:module"
import { readdirSync } from "node:fs"
import { join } from "node:path"
const root = ${JSON.stringify(root)}
const require = createRequire(import.meta.url)
function esbuildEntry() {
  try { return require.resolve("esbuild/lib/main.js", { paths: [root] }) } catch {}
  const pnpm = join(root, "node_modules", ".pnpm")
  const dir = readdirSync(pnpm).find((d) => d.startsWith("esbuild@"))
  return join(pnpm, dir, "node_modules", "esbuild", "lib", "main.js")
}
const esbuild = require(esbuildEntry())
const tailwind = (() => {
  try { return require.resolve("tailwindcss", { paths: [root] }) } catch {}
  const pnpm = join(root, "node_modules", ".pnpm")
  const dir = readdirSync(pnpm).find((d) => d.startsWith("tailwindcss@3"))
  return join(pnpm, dir, "node_modules", "tailwindcss")
})()
const postcss = require(require.resolve("postcss", { paths: [root] }))
await esbuild.build({
  entryPoints: [${JSON.stringify(join(work, "probe.css"))}],
  bundle: true,
  outfile: ${JSON.stringify(join(work, "probe.out.css"))},
  logLevel: "error",
  plugins: [{
    name: "tailwind",
    setup(build) {
      build.onLoad({ filter: /\\.css$/ }, async (args) => {
        const fs = require("node:fs")
        const tw = require(tailwind)
        const source = fs.readFileSync(args.path, "utf8")
        const result = await postcss([tw({
          content: [${JSON.stringify(entry)}, ${JSON.stringify(join(root, "src/**/*.tsx"))}],
          darkMode: ["class"],
          theme: { extend: {
            colors: {
              border: "hsl(var(--border))", background: "hsl(var(--background))",
              foreground: "hsl(var(--foreground))",
              muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
              accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
              primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
              destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
              secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
              input: "hsl(var(--input))", ring: "hsl(var(--ring))",
            },
            borderRadius: { lg: "var(--radius)", xl: "0.9rem" },
          } },
        })]).process(source, { from: args.path })
        return { contents: result.css, loader: "css" }
      })
    }
  }],
})
await esbuild.build({
  entryPoints: [${JSON.stringify(entry)}],
  bundle: true, format: "iife", outfile: ${JSON.stringify(outfile)},
  logLevel: "error", jsx: "automatic",
  alias: { "@": join(root, "src") },
  define: { "process.env.NODE_ENV": '"production"' },
  loader: { ".css": "empty" },
})
`,
)

writeFileSync(
  join(work, "probe.css"),
  `@tailwind base;
@tailwind components;
@tailwind utilities;
html, body { margin: 0; background: #fff; }
`,
)

try {
  execFileSync(process.execPath, [runner], { stdio: "inherit" })
} catch {
  console.error("bundle failed")
  process.exit(1)
}

const PORT = 9000 + Math.floor(Math.random() * 90)
const profile = join(process.env.TEMP || "/tmp", `museek-pf-${PORT}`)
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--force-device-scale-factor=1",
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
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400))
  return r.result?.result?.value
}

await send("Page.enable")
await send("Runtime.enable")
await send("Emulation.setDeviceMetricsOverride", { width: 700, height: 300, deviceScaleFactor: 1, mobile: false })

const appCss = readFileSync(join(root, "src/index.css"), "utf8").replace(/@tailwind[^;]+;/g, "")
const css = readFileSync(join(work, "probe.out.css"), "utf8")
const html = `<!doctype html><html><body style="margin:0;background:#fff">
<style>
:root { --background: 40 20% 98%; --foreground: 30 10% 12%; --muted: 40 12% 92%;
  --muted-foreground: 30 8% 42%; --accent: 40 20% 94%; --accent-foreground: 30 10% 12%;
  --primary: 25 70% 52%; --primary-foreground: 0 0% 100%; --border: 40 12% 88%;
  --input: 40 12% 88%; --ring: 25 70% 52%; --destructive: 0 70% 52%;
  --destructive-foreground: 0 0% 100%; --secondary: 40 15% 94%; --secondary-foreground: 30 10% 12%;
  --radius: 0.75rem;
  --motion-fast: 120ms; --motion-base: 240ms; --motion-slow: 320ms;
  --ease-spring-soft: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-spring-snappy: cubic-bezier(0.342, 1.201, 0, 1.114);
  --ease-spring-pop: cubic-bezier(0.335, 1.387, 0.001, 1.053);
  --heat-1: 0 70% 50%;
}
${css}
</style>
<style>${appCss}</style>
<div id="root"></div>
<script>${readFileSync(outfile, "utf8")}</script>
</body></html>`
const htmlPath = join(work, "index.html")
writeFileSync(htmlPath, html)
await send("Page.navigate", { url: "file:///" + htmlPath.replace(/\\/g, "/") })
await sleep(1500)

/**
 * Drive a real hover through CDP so `:hover` and `:active` actually apply, then
 * read the composited scale.
 *
 * Both readings parse `transform`, not the CSS `scale` property: `.icon-motion`
 * writes `scale`, but Tailwind's `scale-*` utilities write `transform: matrix()`,
 * so reading `.scale` alone would report 1 for every Tailwind-styled element and
 * make a working press look dead.
 */
async function hoverAndRead(selector) {
  const box = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })()`)
  const read = () =>
    evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)})
      const cs = getComputedStyle(el)
      return { transform: cs.transform, scale: cs.scale, filter: cs.filter }
    })()`)

  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y })
  await sleep(350)
  const hovered = await read()
  // Press, then sample densely across the transition. An overshooting easing
  // curve dips *below* its target partway through and comes back, so comparing
  // only the settled value would miss it — the complaint is about what the user
  // sees while holding, which is exactly the transit.
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1,
  })
  const trail = []
  for (let i = 0; i < 14; i++) {
    await sleep(45)
    trail.push(await read())
  }
  const held = trail[trail.length - 1]
  await sleep(600)
  const stillHeld = await read()
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1,
  })
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 })
  await sleep(500)
  return { hovered, held, stillHeld, trail }
}

/** Effective scale of a computed `transform`, whatever wrote it. */
const parseScale = (t) => {
  if (!t || t === "none") return 1
  const m = /matrix\(([^)]+)\)/.exec(t)
  if (!m) return 1
  const parts = m[1].split(",").map(Number)
  return Math.sqrt(parts[0] * parts[0] + parts[1] * parts[1])
}

/** The CSS `scale` property (used by .icon-motion), falling back to transform. */
const effectiveScale = (reading) => {
  const s = Number(reading.scale)
  if (Number.isFinite(s) && s !== 1 && s > 0) return s
  return parseScale(reading.transform)
}

let failures = 0
const check = (name, cond, detail = "") => {
  if (!cond) failures++
  console.log(`${cond ? "OK  " : "FAIL"}  ${name.padEnd(56)}${detail ? "  " + detail : ""}`)
}

// --- 1. hot keyword -------------------------------------------------------
console.log("hot keyword: hover grows it, press shrinks it")
{
  const word = await hoverAndRead("#word")
  const hoverScale = parseScale(word.hovered.transform)
  console.log(`  hover  scale ${hoverScale.toFixed(3)}   (${word.hovered.transform})`)
  check("hover scales the keyword up", hoverScale > 1.05, hoverScale.toFixed(3))
  const pressScale = parseScale(word.held.transform)
  console.log(`  press  scale ${pressScale.toFixed(3)}   (${word.held.transform})`)
  check("press scales the keyword down", pressScale < 0.97, pressScale.toFixed(3))
}

// --- 2. sidebar press stability -------------------------------------------
console.log("\nnav link: the pressed size is stable while held")
{
  const nav = await hoverAndRead("#nav")
  const scales = nav.trail.map(effectiveScale)
  const settled = effectiveScale(nav.stillHeld)
  const lowest = Math.min(...scales)
  console.log(`  transit: ${scales.map((s) => s.toFixed(3)).join(" ")}`)
  console.log(`  settled: ${settled.toFixed(4)}   lowest during transit: ${lowest.toFixed(4)}`)
  check("pressed scale settles at 0.96", Math.abs(settled - 0.96) < 0.005, settled.toFixed(4))
  check(
    "it never undershoots the target while held",
    lowest >= 0.955,
    `dipped to ${lowest.toFixed(4)} (an overshooting curve on a shrink)` ,
  )
  check(
    "the settled size does not depend on hold time",
    Math.abs(settled - scales[scales.length - 1]) < 0.005,
  )
}

ws.close()
chrome.kill()
await sleep(300)

async function bestEffortRemove(dir) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      rmSync(dir, { recursive: true, force: true })
      return
    } catch {
      await sleep(200)
    }
  }
}
await bestEffortRemove(work)
await bestEffortRemove(profile)

console.log("")
if (failures) {
  console.log(`FAILED: ${failures} case(s)`)
  process.exit(1)
}
console.log("Press feedback checks passed.")
