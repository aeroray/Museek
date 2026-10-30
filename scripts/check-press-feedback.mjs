// Icon controls have a hover effect and NOTHING on press.
//
// The app settled on exactly one motion: hovering a control lifts its glyph 1px
// and grows it 4%. Clicking does not scale, nudge or animate the control at all —
// a press effect was what produced the "it keeps shrinking while I hold" report
// and was removed entirely.
//
// This drives real pointer events through CDP and asserts both halves:
//
//   1. hot keyword: grows on hover (regression: `animation-fill-mode: both` left
//      every word pinned at scale(1) and killed both hover and press)
//   2. a control's size on press equals its size at rest — no press scaling
//   3. the size while held does not drift, because nothing is animating
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
import { Button } from "@/components/ui/button"

// Real components and real classes, so the check measures what ships.
function Harness() {
  return (
    <div style={{ padding: 40, background: "#fff", display: "flex", flexDirection: "column", gap: 24 }}>
      {/* A plain icon button: icon-motion comes from the Button component. */}
      <Button id="btn" variant="ghost" size="icon" className="h-9 w-9">
        <Search size={16} />
      </Button>

      {/* Sidebar nav link: icon-motion is on the shared class string. */}
      <a
        id="nav"
        href="#"
        className="relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium icon-motion text-muted-foreground hover:bg-accent/70"
      >
        <Search size={16} />
        <span>Search</span>
      </a>

      {/* Hot keyword: hover grows the word, press does nothing. */}
      <button
        id="word"
        className="hot-cloud-word leading-none tracking-tight will-change-transform transform-gpu transition-[transform,filter,opacity] duration-200 ease-out hover:scale-110 text-2xl font-semibold"
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
await send("Emulation.setDeviceMetricsOverride", { width: 700, height: 400, deviceScaleFactor: 1, mobile: false })

/*
 * Force the two media features the hover rule depends on.
 *
 * `.icon-motion:hover svg` lives inside
 *   @media (hover: hover) and (prefers-reduced-motion: no-preference)
 * so it only applies when the browser reports a hover-capable pointer and no
 * reduced-motion preference. A headless CI runner reports neither reliably —
 * GitHub Actions' Windows image in particular exposes no hover-capable pointer,
 * so `hover: hover` evaluates false and the rule never applies. The check then
 * failed with hover scale 1.000 while the hot-keyword hover (a plain Tailwind
 * utility, not behind a media query) still passed, which is exactly how the
 * environment difference showed up.
 *
 * Emulating both features makes the measurement independent of the runner. This
 * is declaring the intended environment, not papering over a code defect: real
 * desktop users have a hovering pointer and (usually) no reduced-motion setting.
 */
await send("Emulation.setEmulatedMedia", {
  features: [
    { name: "hover", value: "hover" },
    { name: "any-hover", value: "hover" },
    { name: "pointer", value: "fine" },
    { name: "any-pointer", value: "fine" },
    { name: "prefers-reduced-motion", value: "no-preference" },
  ],
})
{
  const capability = await evaluate(`({
    hover: matchMedia("(hover: hover)").matches,
    reduced: matchMedia("(prefers-reduced-motion: no-preference)").matches,
  })`)
  console.log(
    `   media: hover=${capability.hover} no-preference=${capability.reduced}`,
  )
}

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

/** Effective scale of a computed `transform`, whatever wrote it. */
const parseScale = (t) => {
  if (!t || t === "none") return 1
  const m = /matrix\(([^)]+)\)/.exec(t)
  if (!m) return 1
  const parts = m[1].split(",").map(Number)
  return Math.sqrt(parts[0] * parts[0] + parts[1] * parts[1])
}

/**
 * Hover, then press and hold, sampling throughout.
 *
 * Both `transform` and the CSS `scale` property are read: `.icon-motion` lifts the
 * glyph via `transform`, while Tailwind's scale utilities also write `transform`.
 * Reading only one of them would report 1 and make a working effect look dead.
 */
async function probe(selector) {
  const box = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })()`)
  const read = () =>
    evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)})
      // The glyph is what moves on hover; the box is what would move on press.
      const glyph = el.querySelector("svg") ?? el
      const boxCs = getComputedStyle(el)
      const glyphCs = getComputedStyle(glyph)
      return {
        boxTransform: boxCs.transform,
        boxScale: boxCs.scale,
        glyphTransform: glyphCs.transform,
      }
    })()`)

  const rest = await read()
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y })
  await sleep(400)
  const hovered = await read()

  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 })
  const trail = []
  for (let i = 0; i < 10; i++) {
    await sleep(45)
    trail.push(await read())
  }
  const held = trail[trail.length - 1]
  await sleep(500)
  const stillHeld = await read()

  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1 })
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 })
  await sleep(500)
  return { rest, hovered, held, stillHeld, trail }
}

let failures = 0
const check = (name, cond, detail = "") => {
  if (!cond) failures++
  console.log(`${cond ? "OK  " : "FAIL"}  ${name.padEnd(58)}${detail ? "  " + detail : ""}`)
}

// --- 1. hover works at all -------------------------------------------------
console.log("1. hover produces a visible effect")
{
  const word = await probe("#word")
  const hoverScale = parseScale(word.hovered.boxTransform)
  console.log(`   hot keyword hover scale: ${hoverScale.toFixed(3)}`)
  check("hot keyword grows on hover", hoverScale > 1.05, hoverScale.toFixed(3))

  const btn = await probe("#btn")
  const btnHoverScale = parseScale(btn.hovered.glyphTransform)
  console.log(`   icon button glyph hover scale: ${btnHoverScale.toFixed(3)}`)
  check("icon button glyph lifts on hover", btnHoverScale > 1.02, btnHoverScale.toFixed(3))

  const nav = await probe("#nav")
  const navHoverScale = parseScale(nav.hovered.glyphTransform)
  console.log(`   nav link glyph hover scale: ${navHoverScale.toFixed(3)}`)
  check("nav link glyph lifts on hover", navHoverScale > 1.02, navHoverScale.toFixed(3))
}

// --- 2. press does nothing -------------------------------------------------
console.log("\n2. pressing does not scale anything")
for (const [selector, label] of [
  ["#btn", "icon button"],
  ["#nav", "nav link"],
  ["#word", "hot keyword"],
]) {
  const r = await probe(selector)
  const restBox = parseScale(r.rest.boxTransform) * (Number(r.rest.boxScale) || 1)
  const heldBox = parseScale(r.held.boxTransform) * (Number(r.held.boxScale) || 1)
  const hoverBox = parseScale(r.hovered.boxTransform) * (Number(r.hovered.boxScale) || 1)
  console.log(`   ${label.padEnd(14)} box: rest ${restBox.toFixed(3)} hover ${hoverBox.toFixed(3)} held ${heldBox.toFixed(3)}`)
  check(`${label}: box does not shrink on press`, Math.abs(heldBox - hoverBox) < 0.005)
  check(`${label}: box is not smaller than at rest`, heldBox >= restBox - 0.005)
}

// --- 3. nothing animates while held ---------------------------------------
console.log("\n3. the size is constant while the pointer is held down")
{
  const r = await probe("#btn")
  const scales = r.trail.map((t) => parseScale(t.boxTransform) * (Number(t.boxScale) || 1))
  const spread = Math.max(...scales) - Math.min(...scales)
  console.log(`   box scale while held: ${scales.map((s) => s.toFixed(3)).join(" ")}`)
  check("no drift during the hold", spread < 0.002, `spread ${spread.toFixed(4)}`)
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
