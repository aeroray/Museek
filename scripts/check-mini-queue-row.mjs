// Measures the REAL mini queue row in headless Chrome and compares it to the
// constant the native window is sized with.
//
// `MINI_QUEUE_ROW` is the layout contract between `MiniPlayer.tsx`'s Tailwind
// classes and the mini window's fixed height. It shipped as 38 while the row
// actually renders 39.5px (py-1.5 + text-xs/leading-tight + text-[10px]/
// leading-tight), so the panel overflowed for every queue length: a one-song
// queue grew a scrollbar, and the fourth row's singer line was clipped.
//
// Deriving 39.5 from the class list is not enough — `leading-tight` beating
// `text-xs`'s line-height depends on Tailwind's declaration order, which is a
// build detail. This measures the browser instead.
//
//   node scripts/check-mini-queue-row.mjs
import { spawn, execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const work = join(import.meta.dirname, "mini-queue-harness")
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

// Render the real queue markup — same classes as MiniPlayer.tsx — plus the real
// geometry module, so the measurement and the constant are compared directly.
writeFileSync(
  entry,
  `import { createRoot } from "react-dom/client"
import { miniQueuePanelHeight, MINI_QUEUE_ROW, MINI_QUEUE_MAX_ROWS } from "@/lib/miniPlayerGeometry"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"
import "./probe.css"

// Verbatim copy of the row markup in MiniPlayer.tsx (the parts that affect
// height): the flex row, the two text lines, the duration and the remove button.
function Row({ name, singer, interval }) {
  return (
    <li>
      <div className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium leading-tight">{name}</p>
          <p className="truncate text-[10px] leading-tight text-muted-foreground">{singer}</p>
        </div>
        <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground/80">
          {interval || "--:--"}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100"
        >
          <X size={13} />
        </Button>
      </div>
    </li>
  )
}

function Panel({ count }) {
  const rows = Array.from({ length: count }, (_, i) => ({
    name: "测试歌曲标题 A Very Long Song Title " + i,
    singer: "歌手名字 Artist",
    interval: "3:45",
  }))
  return (
    <div
      id="panel"
      style={{
        // Exactly what the native window gives the panel.
        height: miniQueuePanelHeight(count) + "px",
        width: "400px",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <ScrollArea className="h-full">
        <ul className="flex flex-col gap-0.5 p-1.5">
          {rows.map((r, i) => <Row key={i} {...r} />)}
        </ul>
      </ScrollArea>
    </div>
  )
}

window.__measure = (count) => {
  const host = document.getElementById("host")
  host.innerHTML = ""
  const div = document.createElement("div")
  host.appendChild(div)
  const r = createRoot(div)
  r.render(<Panel count={count} />)
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const panel = host.querySelector("#panel")
      const list = panel.querySelector("ul")
      const vp = panel.querySelector("[data-radix-scroll-area-viewport]")
      const firstRow = list.querySelector("li > div")
      const title = firstRow.querySelector("p")
      const singer = firstRow.querySelectorAll("p")[1]
      const cs = getComputedStyle(firstRow)
      resolve({
        constant: MINI_QUEUE_ROW,
        maxRows: MINI_QUEUE_MAX_ROWS,
        rowHeight: firstRow.getBoundingClientRect().height,
        rowPaddingY: parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom),
        titleLineHeight: parseFloat(getComputedStyle(title).lineHeight),
        titleFontSize: parseFloat(getComputedStyle(title).fontSize),
        singerLineHeight: parseFloat(getComputedStyle(singer).lineHeight),
        singerFontSize: parseFloat(getComputedStyle(singer).fontSize),
        listHeight: list.getBoundingClientRect().height,
        panelHeight: panel.getBoundingClientRect().height,
        viewportScrollHeight: vp.scrollHeight,
        viewportClientHeight: vp.clientHeight,
      })
    }))
  })
}

createRoot(document.getElementById("root")).render(<div id="host" />)
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
const tailwind = (() => {
  try { return require.resolve("tailwindcss", { paths: [root] }) } catch {}
  const pnpm = join(root, "node_modules", ".pnpm")
  const dir = readdirSync(pnpm).find((d) => d.startsWith("tailwindcss@3"))
  return join(pnpm, dir, "node_modules", "tailwindcss")
})()

const css = await esbuild.build({
  entryPoints: [${JSON.stringify(join(work, "probe.css"))}],
  bundle: true,
  outfile: ${JSON.stringify(join(work, "probe.out.css"))},
  logLevel: "error",
  plugins: [{
    name: "tailwind",
    setup(build) {
      build.onLoad({ filter: /\\.css$/ }, async (args) => {
        const fs = require("node:fs")
        const postcss = require(require.resolve("postcss", { paths: [root] }))
        const tw = require(tailwind)
        const source = fs.readFileSync(args.path, "utf8")
        const result = await postcss([tw({
          content: [${JSON.stringify(join(work, "entry.tsx"))}, ${JSON.stringify(join(root, "src/**/*.tsx"))}],
          darkMode: ["class"],
          theme: { extend: {
            colors: {
              border: "hsl(var(--border))", background: "hsl(var(--background))",
              foreground: "hsl(var(--foreground))", muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
              accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
              primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
              destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
              secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
              input: "hsl(var(--input))", ring: "hsl(var(--ring))",
            },
            borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" },
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

try {
  execFileSync(process.execPath, [esbuildRunner], { stdio: "inherit" })
} catch {
  console.error("bundle failed")
  process.exit(1)
}

const PORT = 9700 + Math.floor(Math.random() * 90)
const profile = join(process.env.TEMP || "/tmp", `museek-mq-${PORT}`)
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

const css = readFileSync(join(work, "probe.out.css"), "utf8")
const html = `<!doctype html><html><body style="margin:0">
<style>
:root { --background: 40 20% 98%; --foreground: 30 10% 12%; --muted: 40 12% 92%;
  --muted-foreground: 30 8% 42%; --accent: 40 20% 94%; --accent-foreground: 30 10% 12%;
  --primary: 25 70% 52%; --primary-foreground: 0 0% 100%; --border: 40 12% 88%;
  --input: 40 12% 88%; --ring: 25 70% 52%; --destructive: 0 70% 52%;
  --destructive-foreground: 0 0% 100%; --secondary: 40 15% 94%; --secondary-foreground: 30 10% 12%;
  --radius: 0.75rem; }
${css}
</style>
<div id="root"></div>
<script>${readFileSync(outfile, "utf8")}</script>
</body></html>`
const htmlPath = join(work, "index.html")
writeFileSync(htmlPath, html)
await send("Page.navigate", { url: "file:///" + htmlPath.replace(/\\/g, "/") })
await sleep(1200)

let failures = 0
const check = (name, cond, detail = "") => {
  if (!cond) failures++
  console.log(`${cond ? "OK  " : "FAIL"}  ${name.padEnd(56)}${detail ? "  " + detail : ""}`)
}

// 1. The measured row must equal the constant the window is sized with.
{
  const m = await evaluate("window.__measure(1)")
  console.log(
    `  measured: row=${m.rowHeight}px (py ${m.rowPaddingY} + title ${m.titleLineHeight} + singer ${m.singerLineHeight})`,
  )
  check(
    `MINI_QUEUE_ROW (${m.constant}) matches the rendered row (${m.rowHeight})`,
    Math.abs(m.constant - m.rowHeight) < 0.01,
  )
  check(
    "the old 38px budget was short (this is the bug being pinned)",
    m.rowHeight > 38,
    `row is ${m.rowHeight}`,
  )
  check(
    "leading-tight wins over text-xs's line-height",
    m.titleLineHeight === 15 && m.singerLineHeight === 12.5,
    `title ${m.titleLineHeight}, singer ${m.singerLineHeight}`,
  )
}

// 2. For every queue length, the panel must not overflow — that is what made a
//    scrollbar appear even for a single song.
for (let n = 1; n <= 4; n++) {
  const m = await evaluate(`window.__measure(${n})`)
  check(
    `${n} row(s): panel ${m.panelHeight}px does not overflow content ${m.listHeight}px`,
    m.listHeight <= m.panelHeight + 0.5,
    `list ${m.listHeight}, panel ${m.panelHeight}`,
  )
  check(
    `${n} row(s): no scrollbar (scrollHeight ${m.viewportScrollHeight} <= clientHeight ${m.viewportClientHeight})`,
    m.viewportScrollHeight <= m.viewportClientHeight + 1,
    `overflow ${m.viewportScrollHeight - m.viewportClientHeight}px`,
  )
}

ws.close()
chrome.kill()
await sleep(300)

// Cleanup must never turn a passing check into a failing one (Windows keeps
// Crashpad handles open in the profile for a moment after exit).
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
console.log("Mini queue row-height checks passed.")
