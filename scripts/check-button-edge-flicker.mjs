// Pins the "top edge of the button flickers on hover" bug.
//
// Reported twice, for the two saturated-fill buttons in a dialog footer:
//   - the changelog dialog's 知道了 button   (variant="default")
//   - the exit dialog's 退出 button           (variant="destructive")
// while the adjacent 取消 button (variant="outline") was fine.
//
// Mechanism. `DialogContent` centres the popup with `top:50% + translateY(-50%)`
// (src/components/ui/dialog.tsx), so an odd popup height puts the footer
// buttons' top edges on a HALF PIXEL. That edge is drawn as an antialiased row.
// `outline` owns that row with `border-input`; the other variants had no border,
// so the *background* painted it. A `background-color` transition then
// re-resolves that single row — measured in the real dialog, it jumped
// 111.7 -> 17.7 on the frame after the pointer entered, while every row below
// ramped smoothly and the row above stayed put. One snap on hover-in and one on
// hover-out is the flicker the user saw.
//
// Fix: every saturated-fill variant carries `border-y border-<fill>`, so the
// edge row is a constant opaque colour the transition cannot re-resolve. Only
// the vertical sides are bordered — a left/right border would widen an
// auto-width button — and `box-sizing: border-box` plus the footer's fixed
// height keep the box identical (verified 60x32 before and after).
//
//   node scripts/check-button-edge-flicker.mjs
import { spawn, execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { extname, join, resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")

let failures = 0
const check = (name, cond, extra = "") => {
  if (cond) console.log(`  ok   ${name}`)
  else {
    console.log(`  FAIL ${name}${extra ? "  " + extra : ""}`)
    failures++
  }
}

// ---------------------------------------------------------------------------
// 1. Static: every saturated-fill variant must own its top edge with a border.
//    Cheaper than the browser half, and it names the exact drifted line.
// ---------------------------------------------------------------------------
console.log("saturated-fill variants own their top edge")
{
  const src = readFileSync(join(root, "src/components/ui/button.tsx"), "utf8")
  const start = src.indexOf("variant: {")
  const variantBlock = src.slice(start, src.indexOf("size: {"))
  // Parse line by line and take a variant's string from the FIRST line after
  // `name:` that contains a double-quoted value. Comments are skipped outright,
  // because the `default` variant documents the flicker and that prose contains
  // quotes and dashes that would derail any block-level regex.
  const variantOf = (name) => {
    const lines = variantBlock.split("\n")
    const at = lines.findIndex((l) => new RegExp(`^\\s*${name}:\\s*$`).test(l))
    if (at < 0) {
      // Single-line form: `name: "…"`
      const one = lines.find((l) => new RegExp(`^\\s*${name}:\\s*"`).test(l))
      return one ? (one.match(/"([^"]+)"/)?.[1] ?? "") : ""
    }
    for (let i = at + 1; i < lines.length; i++) {
      const line = lines[i]
      if (/^\s*\/\//.test(line)) continue
      const m = line.match(/"([^"]+)"/)
      if (m) return m[1]
      if (/^\s*\},?\s*$/.test(line)) break
    }
    return ""
  }
  // `default` and `destructive` are the two reported; `secondary` has the same
  // opaque-fill shape and is held to the same rule so it cannot drift back.
  // `default` is filled with primary, not with a colour called "default".
  const FILL = { default: "primary", destructive: "destructive", secondary: "secondary" }
  for (const name of ["default", "destructive", "secondary"]) {
    const cls = variantOf(name)
    const fill = FILL[name]
    check(`${name}: has a vertical border`, /\bborder-y\b/.test(cls), cls)
    check(
      `${name}: the border matches its own fill (border-${fill})`,
      cls.split(/\s+/).includes(`border-${fill}`),
      cls,
    )
    check(
      `${name}: no full border (would widen an auto-width button)`,
      !/(^|\s)border(?!-[a-z[])(\s|$)/.test(cls.replace(/\bborder-y\b/g, "")),
      cls,
    )
  }
  check("outline: keeps its explicit border-input", /\bborder-input\b/.test(variantOf("outline")))
  const dialog = readFileSync(join(root, "src/components/ui/dialog.tsx"), "utf8")
  check("DialogFooter still pins the button height", /\[&_button\.inline-flex\]:h-8/.test(dialog))
}

// ---------------------------------------------------------------------------
// 2. Runtime: build the real app, open the real changelog dialog, and assert
//    the property that makes the edge stable — the top edge is painted by a
//    constant opaque border, not by the transitioning background.
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
  // Exit code 2 is the suite's "environment cannot run this" convention.
  console.error("SKIP: no Chrome/Edge found; set CHROME_PATH to run this check.")
  process.exit(failures ? 1 : 2)
}

const dist = mkdtempSync(join(tmpdir(), "museek-edge-dist-"))
let built = true
try {
  execFileSync(
    process.execPath,
    [join(root, "node_modules/vite/bin/vite.js"), "build", "--outDir", dist, "--emptyOutDir"],
    { cwd: root, stdio: "pipe", encoding: "utf8" },
  )
} catch (err) {
  built = false
  console.error("vite build failed:")
  console.error((err.stdout ?? "") + (err.stderr ?? ""))
}
if (!built) {
  console.log("\nFAILED: could not build the app for the runtime half of this check")
  process.exit(1)
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
}
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost")
  let path = join(dist, decodeURIComponent(url.pathname))
  if (!existsSync(path) || !extname(path)) path = join(dist, "index.html")
  res.setHeader("content-type", MIME[extname(path)] || "application/octet-stream")
  res.end(readFileSync(path))
})
const PORT = 9700 + Math.floor(Math.random() * 60)
await new Promise((r) => server.listen(PORT, "127.0.0.1", r))

const DEBUG_PORT = PORT + 200
const profile = mkdtempSync(join(tmpdir(), "museek-edge-profile-"))
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
  for (const dir of [dist, profile]) {
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
        /* devtools not up yet */
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

  // 1200x800 is the app's default window and puts the changelog footer button
  // on a half-pixel y — the exact condition behind the report.
  await send("Page.enable")
  await send("Runtime.enable")
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1200,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
  })
  await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/settings?tab=about` })
  await sleep(3200)

  const opened = await evaluate(`(async () => {
    const label = (e) => (e.textContent || "").trim()
    const opener = [...document.querySelectorAll("button")].find((b) => /更新日志|Changelog/.test(label(b)))
    if (!opener) return null
    opener.click()
    await new Promise((r) => setTimeout(r, 1000))
    const btn = [...document.querySelectorAll('[data-slot="dialog-footer"] button')].pop()
    if (!btn) return null
    const r = btn.getBoundingClientRect()
    const cs = getComputedStyle(btn)
    return {
      x: r.x, y: r.y, w: r.width, h: r.height,
      borderTopWidth: cs.borderTopWidth,
      borderLeftWidth: cs.borderLeftWidth,
      borderTopColor: cs.borderTopColor,
      backgroundColor: cs.backgroundColor,
      boxSizing: cs.boxSizing,
    }
  })()`)

  if (!opened) {
    check("the changelog dialog and its footer button exist", false)
  } else {
    check("the changelog dialog and its footer button exist", true)
    check(
      "the button's top edge is on a half-pixel row (the failing condition)",
      Math.abs(opened.y - Math.round(opened.y)) > 0.01,
      `y=${opened.y}`,
    )
    check(
      "the top edge is painted by a real border, not by the background",
      parseFloat(opened.borderTopWidth) >= 1,
      `border-top-width: ${opened.borderTopWidth}`,
    )
    check(
      "that border is opaque (a translucent one could still be re-resolved)",
      (() => {
        const m = /rgba?\(([^)]+)\)/.exec(opened.borderTopColor)
        if (!m) return false
        const parts = m[1].split(",").map((s) => parseFloat(s.trim()))
        return parts.length < 4 || parts[3] === 1
      })(),
      opened.borderTopColor,
    )
    check(
      "no horizontal border, so an auto-width button keeps its width",
      parseFloat(opened.borderLeftWidth) === 0,
      `border-left-width: ${opened.borderLeftWidth}`,
    )
    check("box-sizing is border-box", opened.boxSizing === "border-box", opened.boxSizing)

    // The border must survive hover unchanged while the background animates:
    // that invariance is what stops the edge row from snapping.
    const onHover = await evaluate(`(async () => {
      const btn = [...document.querySelectorAll('[data-slot="dialog-footer"] button')].pop()
      btn.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }))
      // Force the real :hover state through the UI, then read the resolved style.
      const r = btn.getBoundingClientRect()
      return { x: r.x, y: r.y, w: r.width, h: r.height }
    })()`)
    await send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: Math.round(onHover.x + onHover.w / 2),
      y: Math.round(onHover.y + onHover.h / 2),
      buttons: 0,
    })
    await sleep(600)
    const hovered = await evaluate(`(() => {
      const btn = [...document.querySelectorAll('[data-slot="dialog-footer"] button')].pop()
      const r = btn.getBoundingClientRect()
      const cs = getComputedStyle(btn)
      return {
        x: r.x, y: r.y, w: r.width, h: r.height,
        borderTopColor: cs.borderTopColor,
        backgroundColor: cs.backgroundColor,
      }
    })()`)
    check(
      "the button box does not move on hover",
      Math.abs(hovered.y - opened.y) < 0.01 &&
        Math.abs(hovered.x - opened.x) < 0.01 &&
        Math.abs(hovered.w - opened.w) < 0.01 &&
        Math.abs(hovered.h - opened.h) < 0.01,
      `before ${opened.w}x${opened.h}@${opened.x},${opened.y} / after ${hovered.w}x${hovered.h}@${hovered.x},${hovered.y}`,
    )
    check(
      "the top border colour is identical on hover",
      hovered.borderTopColor === opened.borderTopColor,
      `${opened.borderTopColor} -> ${hovered.borderTopColor}`,
    )
    check(
      "the fill does still respond to hover",
      hovered.backgroundColor !== opened.backgroundColor,
      `${opened.backgroundColor} -> ${hovered.backgroundColor}`,
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
console.log("Button edge flicker checks passed.")
process.exit(0)
