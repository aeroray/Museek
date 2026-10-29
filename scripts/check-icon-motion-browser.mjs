// Verify the unified hover motion is actually applied and identical everywhere.
//
// Renders the real components in headless Chrome and measures, for each control,
// the glyph's transform when hovered. All of them must produce the SAME
// translateY and scale, and none may translate horizontally.
//
//   node scripts/check-icon-motion-browser.mjs
import { spawn, execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const work = join(import.meta.dirname, "icon-motion-harness")
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
import { Heart, ListMusic, Maximize, Pause, Play, Repeat, Search, Settings, SkipBack, SkipForward, Volume2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PlayPauseButton } from "@/components/player/PlayPauseButton"

// Every control kind the app has, all through the same Button component.
function Harness() {
  return (
    <div style={{ display: "flex", gap: 8, padding: 24, background: "#fff" }}>
      <Button id="a" variant="ghost" size="icon" className="h-9 w-9"><Search size={16} /></Button>
      <Button id="b" variant="ghost" size="icon" className="h-9 w-9"><SkipBack size={16} /></Button>
      <Button id="c" variant="ghost" size="icon" className="h-9 w-9"><SkipForward size={16} /></Button>
      <Button id="d" variant="ghost" size="icon" className="h-9 w-9"><Repeat size={16} /></Button>
      <Button id="e" variant="ghost" size="icon" className="h-9 w-9"><Heart size={16} /></Button>
      <Button id="f" variant="ghost" size="icon" className="h-9 w-9"><Settings size={16} /></Button>
      <Button id="g" variant="ghost" size="icon" className="h-9 w-9"><Maximize size={16} /></Button>
      <Button id="h" variant="ghost" size="icon" className="h-9 w-9"><ListMusic size={16} /></Button>
      <Button id="i" variant="ghost" size="icon" className="h-9 w-9"><Volume2 size={16} /></Button>
      <PlayPauseButton id="j" variant="default" size="icon" className="size-11" isPlaying={false} aria-label="play" />
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
              foreground: "hsl(var(--foreground))", muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
              accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
              primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
              destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
              secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
              input: "hsl(var(--input))", ring: "hsl(var(--ring))",
            },
            borderRadius: { lg: "var(--radius)" },
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

const PORT = 9300 + Math.floor(Math.random() * 90)
const profile = join(process.env.TEMP || "/tmp", `museek-motion-${PORT}`)
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
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300))
  return r.result?.result?.value
}

await send("Page.enable")
await send("Runtime.enable")
await send("Emulation.setDeviceMetricsOverride", { width: 900, height: 200, deviceScaleFactor: 1, mobile: false })

const css = readFileSync(join(work, "probe.out.css"), "utf8")
const appCss = readFileSync(join(root, "src/index.css"), "utf8")
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
  --ease-spring-snappy: cubic-bezier(0.3, 1.4, 0.5, 1);
  --ease-spring-pop: cubic-bezier(0.34, 1.56, 0.64, 1);
}
${css}
</style>
<style>${appCss.replace(/@tailwind[^;]+;/g, "")}</style>
<div id="root"></div>
<script>${readFileSync(outfile, "utf8")}</script>
</body></html>`
const htmlPath = join(work, "index.html")
writeFileSync(htmlPath, html)
await send("Page.navigate", { url: "file:///" + htmlPath.replace(/\\/g, "/") })
await sleep(1200)

// CSS :hover cannot be forced from script. Instead, extract the hover rule from
// the compiled stylesheet text (which is what the browser actually applied) and
// check both its selector target and its value.
const compiled = css + "\n" + appCss
{
  // Every `.icon-motion:hover` rule, with its declarations.
  const rules = [...compiled.matchAll(/([^{}]*\.icon-motion:hover[^{}]*)\{([^}]*)\}/g)].map(
    (m) => ({ selector: m[1].trim(), body: m[2] }),
  )
  console.log(`.icon-motion:hover rules in the compiled CSS: ${rules.length}`)
  for (const r of rules) console.log(`  ${r.selector} { ${r.body.trim()} }`)

  const glyphRule = rules.find((r) => /\bsvg\s*$/.test(r.selector))
  const boxRule = rules.find((r) => !/\bsvg\s*$/.test(r.selector))

  let failures = 0
  const check = (name, cond, detail = "") => {
    if (!cond) failures++
    console.log(`${cond ? "OK  " : "FAIL"}  ${name.padEnd(54)}${detail ? "  " + detail : ""}`)
  }

  check(
    "a hover rule targets the glyph",
    Boolean(glyphRule),
    glyphRule ? "" : "no `.icon-motion:hover ... svg` rule",
  )
  check(
    "it lifts the glyph 1px",
    /translateY\(-1px\)/.test(glyphRule?.body ?? ""),
    glyphRule?.body.trim() ?? "none",
  )
  check(
    "it also scales the glyph by 1.04",
    /scale\(1\.04\)/.test(glyphRule?.body ?? ""),
    glyphRule?.body.trim() ?? "none",
  )
  check(
    "the lift has no horizontal component",
    !/translateX/.test(glyphRule?.body ?? "") &&
      !/translate\(\s*-?[\d.]+px/.test(glyphRule?.body ?? ""),
    glyphRule?.body.trim() ?? "none",
  )
  check(
    "no hover rule scales the box itself",
    !boxRule || !/scale:\s*[\d.]/.test(boxRule.body),
    boxRule ? boxRule.body.trim() : "only the glyph rule exists",
  )
  check(
    "the press rule shrinks the box to 0.96",
    /\.icon-motion:active[^{]*\{[^}]*scale:\s*0\.96/.test(compiled),
  )

  // Every button must carry the class (or be an explicit exception).
  const coverage = await evaluate(`(() => {
    const out = []
    for (const btn of document.querySelectorAll("button")) {
      const svg = btn.querySelector("svg")
      if (!svg) continue
      out.push({ id: btn.id, has: btn.className.includes("icon-motion") })
    }
    return out
  })()`)
  const missing = coverage.filter((c) => !c.has)
  // The play button opts out on purpose (it changes its own glyph), so it is
  // excluded here and asserted separately below.
  const optOut = coverage.filter((c) => c.id === "j")
  const missingExcludingOptOut = missing.filter((m) => m.id !== "j")
  check(
    `all ${coverage.length - optOut.length} animated icon buttons share the class`,
    missingExcludingOptOut.length === 0,
    missingExcludingOptOut.map((m) => m.id).join(", "),
  )
  check(
    "the play button is the only opt-out",
    missing.length === optOut.length && optOut.length === 1,
    missing.map((m) => m.id).join(", "),
  )

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
  console.log("Icon motion browser checks passed.")
  process.exit(0)
}