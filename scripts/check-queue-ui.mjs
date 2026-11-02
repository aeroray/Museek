// Pins the two play-queue UI decisions.
//
// 1. The queue list must use the shared ScrollArea, like every other list.
//    It used to be a hand-styled `overflow-y-auto` div with its own
//    `[scrollbar-width:thin]` / `[&::-webkit-scrollbar]:w-1.5` rules, so it was
//    the only surface drawing a raw native bar (thin, always visible) instead of
//    Radix's wider, hover-revealed thumb. Both the appearance and the behaviour
//    were inconsistent with the rest of the app.
//
// 2. Clear must not sit under the pointer that opened the drawer. It was a
//    full-width footer button pinned just above the bottom of the window, right
//    on top of the player bar's queue toggle, so the pointer was already over it
//    when the drawer finished opening — a second click cleared without aiming.
//    It now lives in the drawer header.
//
//   node scripts/check-queue-ui.mjs
import { spawn, execFileSync } from "node:child_process"
import { createServer } from "node:http"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const work = join(import.meta.dirname, "queue-ui-harness")
const src = readFileSync(join(root, "src/components/queue/PlayQueue.tsx"), "utf8")
// Strip comments: the file documents the old hand-written scrollbar rules, and
// those quoted class names would otherwise trip the "no native scroller" check.
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

let failures = 0
const check = (name, cond, extra = "") => {
  if (cond) console.log(`  ok   ${name}`)
  else {
    console.log(`  FAIL ${name}${extra ? "  " + extra : ""}`)
    failures++
  }
}

console.log("the queue list uses the shared ScrollArea")
{
  check("imports ScrollArea", /from "@\/components\/ui\/scroll-area"/.test(code))
  check("renders <ScrollArea>", /<ScrollArea\b/.test(code))
  check(
    "no hand-styled native scroller left",
    !/\[&::-webkit-scrollbar\]:w-1\.5/.test(code) &&
      !/\[scrollbar-width:thin\]/.test(code),
  )
  check(
    "does not pass scrollbar overrides that would diverge from the app",
    !/\[scrollbar-color:/.test(code),
  )
}

console.log("\nClear is a header action, away from the pointer")
{
  const headerStart = code.indexOf("<DrawerHeader")
  const headerEnd = code.indexOf("</DrawerHeader>")
  const body = headerStart >= 0 ? code.slice(headerStart, headerEnd) : ""
  check("the header exists", headerStart >= 0 && headerEnd > headerStart)
  check("Clear is rendered inside the header", /t\("queue\.clear"\)/.test(body))
  check("Clear still opens the confirmation dialog", /setConfirmClear\(true\)/.test(body))
  check(
    "no full-width Clear button in the drawer footer",
    !/<DrawerFooter[\s\S]{0,400}queue\.clear/.test(code),
  )
  check("the footer block is gone entirely", !/DrawerFooter/.test(code))
  // Keep the confirmation step: clearing is destructive and must stay guarded.
  check(
    "clearing still requires confirmation",
    /clearConfirmTitle/.test(code) && /clearQueue\(\)/.test(code),
  )
}

// ---------------------------------------------------------------------------
// Runtime half: render the real component with a seeded store and assert the
// scroller really is a Radix viewport, with no native gutter and no footer.
// ---------------------------------------------------------------------------
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
  process.exit(failures ? 1 : 2)
}

mkdirSync(work, { recursive: true })
const require = createRequire(join(root, "package.json"))
function esbuildEntry() {
  try {
    return require.resolve("esbuild/lib/main.js", { paths: [root] })
  } catch {}
  const pnpm = join(root, "node_modules", ".pnpm")
  const dir = readdirSync(pnpm).find((d) => d.startsWith("esbuild@"))
  if (!dir) throw new Error("esbuild not found; run pnpm install")
  return join(pnpm, dir, "node_modules", "esbuild", "lib", "main.js")
}

const DIST = mkdtempSync(join(tmpdir(), "museek-queue-dist-"))
try {
  execFileSync(
    process.execPath,
    [join(root, "node_modules/vite/bin/vite.js"), "build", "--outDir", DIST, "--emptyOutDir"],
    { cwd: root, stdio: "pipe", encoding: "utf8" },
  )
} catch (err) {
  console.error("vite build failed:")
  console.error((err.stdout ?? "") + (err.stderr ?? ""))
  console.log("\nFAILED: could not build the app")
  process.exit(1)
}

writeFileSync(
  join(work, "harness.tsx"),
  `import { createRoot } from "react-dom/client"
import { PlayQueue } from "@/components/queue/PlayQueue"
import { usePlayerStore } from "@/stores/playerStore"
import type { QueueItem } from "@/types/player"

const items: QueueItem[] = Array.from({ length: 40 }, (_, i) => ({
  music: {
    id: "seed-" + i,
    name: "测试歌曲 " + (i + 1),
    singer: "测试歌手",
    source: "netease",
    meta: { songId: String(i), albumName: "专辑", picUrl: "", interval: "3:45", songs: [] },
  },
  quality: "320k" as const,
}))

usePlayerStore.setState({
  queue: items,
  queueIndex: 0,
  currentSong: items[0].music,
  showQueue: true,
} as never)

// DrawerPortal resolves its container with querySelector(".app-shell") at render
// time, so the shell must already exist in the DOM when React mounts — otherwise
// the portal falls back to a body that is outside the subtree we assert against,
// and the drawer looks absent.
const host = document.getElementById("root")!
host.innerHTML = '<div class="app-shell" style="height:100%"></div>'
const shell = host.querySelector(".app-shell") as HTMLElement
createRoot(shell).render(<PlayQueue />)
`,
)

const cssFile = readdirSync(join(DIST, "assets")).find((f) => f.endsWith(".css"))
const appCss = readFileSync(join(DIST, "assets", cssFile), "utf8")
const esbuild = require(esbuildEntry())
await esbuild.build({
  entryPoints: [join(work, "harness.tsx")],
  bundle: true,
  format: "iife",
  outfile: join(work, "queue.js"),
  logLevel: "error",
  jsx: "automatic",
  alias: { "@": join(root, "src") },
  define: { "process.env.NODE_ENV": '"production"', __APP_VERSION__: JSON.stringify("3.14.2") },
  loader: { ".css": "empty" },
})
writeFileSync(
  join(work, "queue.html"),
  `<!doctype html><html><head><meta charset="utf-8"><style>${appCss}</style>
<style>html,body,#root{margin:0;height:100%;background:#8a8a8a}</style></head>
<body><div id="root"></div><script>${readFileSync(join(work, "queue.js"), "utf8")}</script></body></html>`,
)

const server = createServer((req, res) => {
  res.setHeader("content-type", "text/html; charset=utf-8")
  res.end(readFileSync(join(work, "queue.html")))
})
const PORT = 9800 + Math.floor(Math.random() * 60)
await new Promise((r) => server.listen(PORT, "127.0.0.1", r))
const DEBUG_PORT = PORT + 200
const profile = mkdtempSync(join(tmpdir(), "museek-queue-profile-"))
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--no-sandbox",
    "--force-device-scale-factor=1",
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore" },
)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function cleanup() {
  server.close()
  try {
    chrome.kill()
  } catch {
    /* already gone */
  }
  await sleep(400)
  for (const dir of [DIST, profile, work]) {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* best effort */
    }
  }
}

try {
  const wsUrl = await (async () => {
    for (let i = 0; i < 80; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json()
        const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl)
        if (page) return page.webSocketDebuggerUrl
      } catch {
        /* not up yet */
      }
      await sleep(250)
    }
    throw new Error("Chrome devtools never came up")
  })()
  const ws = new WebSocket(wsUrl)
  await new Promise((r) => (ws.onopen = r))
  let seq = 0
  const pending = new Map()
  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data)
    if (data.id && pending.has(data.id)) {
      pending.get(data.id)(data)
      pending.delete(data.id)
    }
  }
  const send = (method, params = {}) => {
    const n = ++seq
    ws.send(JSON.stringify({ id: n, method, params }))
    return new Promise((r) => pending.set(n, r))
  }
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })
    if (r.result?.exceptionDetails) {
      throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400))
    }
    return r.result?.result?.value
  }

  await send("Page.enable")
  await send("Runtime.enable")
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1200,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` })
  await sleep(1800)

  const report = await evaluate(`(() => {
    const popup = document.querySelector('[data-slot="drawer-popup"]')
    if (!popup) return { debug: document.body.innerHTML.slice(0, 600), slots: [...document.querySelectorAll("[data-slot]")].map(e => e.getAttribute("data-slot")).slice(0,20) }
    const vp = popup.querySelector('[data-radix-scroll-area-viewport]')
    const clearBtn = [...popup.querySelectorAll('button')]
      .find((b) => /清空|Clear/.test((b.textContent || "").trim()))
    const cr = clearBtn ? clearBtn.getBoundingClientRect() : null
    const pr = popup.getBoundingClientRect()
    return {
      hasViewport: !!vp,
      gutter: vp ? vp.offsetWidth - vp.clientWidth : -1,
      scrollbarWidth: vp ? getComputedStyle(vp).scrollbarWidth : "",
      hasNativeScroller: !!popup.querySelector('.overflow-y-auto'),
      hasFooter: !!popup.querySelector('[data-slot="drawer-footer"]'),
      rows: popup.querySelectorAll('[class*="cursor-pointer"]').length,
      clearY: cr ? cr.y : null,
      popupTop: pr.top,
      popupBottom: pr.bottom,
    }
  })()`)

  if (!report || report.debug) {
    console.log("DEBUG:", JSON.stringify(report).slice(0, 900))
    check("the queue drawer renders", false)
  } else {
    check("the queue drawer renders", true)
    check("it is tall enough to need scrolling", report.rows >= 20, `${report.rows} rows`)
    check(
      "the list scrolls through the shared Radix viewport",
      report.hasViewport === true,
    )
    check(
      "no hand-written native scroller remains",
      report.hasNativeScroller === false,
    )
    check(
      "the Radix viewport paints no native gutter",
      report.gutter === 0,
      `gutter=${report.gutter} scrollbar-width=${report.scrollbarWidth}`,
    )
    check("the drawer footer is gone", report.hasFooter === false)
    check(
      "Clear sits in the upper part of the drawer, not at the pointer",
      report.clearY != null && report.clearY - report.popupTop < 120,
      report.clearY == null ? "Clear not found" : `Clear y-offset = ${Math.round(report.clearY - report.popupTop)}px`,
    )
  }
  ws.close()
} finally {
  await cleanup()
}

console.log("")
if (failures) {
  console.log(`FAILED: ${failures} case(s)`)
  process.exit(1)
}
console.log("Play queue UI checks passed.")
process.exit(0)
