// Pins the "two scrollbars in the changelog" bug.
//
// Museek styles every scrollbar with a global `::-webkit-scrollbar` rule
// (src/index.css). Radix's ScrollArea also draws a bar of its own and hides the
// native one with a <style> element it renders at RUNTIME — but that element
// carries no CSP nonce, and the Tauri build stamps a nonce onto the stylesheets
// in index.html, which makes `'unsafe-inline'` ineffective for `style-src`
// (CSP3 §6.7.3.2). The packaged app therefore drops Radix's rule while keeping
// the viewport's `overflow-y: scroll`, so a 6px native bar is painted
// permanently — and the changelog dialog's ScrollArea (`type="hover"`) reveals
// Radix's 10px thumb on pointer-enter, which is why the second bar seemed to
// appear "on hover".
//
// The bug is invisible in `pnpm tauri dev` and in the browser preview, because
// neither enforces a CSP. So this check serves the real built app with a
// Tauri-shaped CSP (style-src with a nonce) and measures the dialog viewport.
//
// The assertions are deliberately structural rather than pixel-based:
//   1. the compiled stylesheet hides the native bar on every Radix viewport —
//      by a rule in the app's OWN stylesheet, not one injected at runtime;
//   2. under a nonce-bearing style-src, the compiled rule still wins;
//   3. the changelog's viewport has a zero native gutter, so hovering it can
//      add at most Radix's own thumb.
//
//   node scripts/check-scrollbar-gutter.mjs
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
// 1. The source of truth: the app's own stylesheet must carry the hide rules.
//    This is a static assertion, so it fails fast and without a browser.
// ---------------------------------------------------------------------------
console.log("the app stylesheet hides the native bar on Radix viewports")
{
  const css = readFileSync(join(root, "src/index.css"), "utf8")
  // The rules are written as grouped selectors
  //   `[data-radix-scroll-area-viewport], [data-radix-select-viewport] { … }`
  // so parse every declaration block and check which selectors it applies to.
  // Skipping this and grepping for one selector per rule would silently pass
  // once someone groups them, and the app also has unrelated rules mentioning
  // the same marker (`.lyrics-scroll [data-radix-scroll-area-viewport]`).
  const ruleBlocks = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({
    selectors: m[1].split(",").map((s) => s.trim()),
    body: m[2],
  }))
  const appliesTo = (marker, pseudo) =>
    ruleBlocks.some(
      ({ selectors, body }) =>
        selectors.some((s) => s.includes(marker) && s.endsWith(pseudo)) &&
        /scrollbar-width:\s*none|display:\s*none/.test(body),
    )
  for (const marker of ["data-radix-scroll-area-viewport", "data-radix-select-viewport"]) {
    check(
      `[${marker}] hides the native bar via scrollbar-width:none`,
      ruleBlocks.some(
        ({ selectors, body }) =>
          selectors.some((s) => s.includes(marker) && !s.includes("::")) &&
          /scrollbar-width:\s*none/.test(body),
      ),
    )
    check(
      `[${marker}]::-webkit-scrollbar is display:none`,
      appliesTo(marker, "::-webkit-scrollbar"),
    )
  }
}

// ---------------------------------------------------------------------------
// 2. Runtime proof: build the real app, serve it under a Tauri-shaped CSP, and
//    measure the changelog dialog's scroll viewport.
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
  // Exit code 2 is the suite's "environment cannot run this" convention, so a
  // machine with no Chrome reports SKIP instead of a false regression.
  console.error("SKIP: no Chrome/Edge found; set CHROME_PATH to run this check.")
  process.exit(failures ? 1 : 2)
}

const dist = mkdtempSync(join(tmpdir(), "museek-gutter-dist-"))

// The runtime half rebuilds the app, which costs ~10s. It is the only way to
// observe `::-webkit-scrollbar` gutters and CSP behaviour together (jsdom and
// the dev server both lack a real compositor and a real CSP), so it runs by
// default; the static half above still runs everywhere.
//   SCROLLBAR_GUTTER_FAST=1  static assertions only
if (process.env.SCROLLBAR_GUTTER_FAST === "1") {
  console.log("\nSKIP runtime half (SCROLLBAR_GUTTER_FAST=1)")
  console.log(failures ? `\nFAILED: ${failures} case(s)` : "\nScrollbar gutter (static) checks passed.")
  process.exit(failures ? 1 : 0)
}

let built = true
try {
  execFileSync(process.execPath, [join(root, "node_modules/vite/bin/vite.js"), "build", "--outDir", dist, "--emptyOutDir"], {
    cwd: root,
    stdio: "pipe",
    encoding: "utf8",
  })
} catch (err) {
  built = false
  console.error("vite build failed:")
  console.error((err.stdout ?? "") + (err.stderr ?? ""))
}
if (!built) {
  console.log("\nFAILED: could not build the app for the runtime half of this check")
  process.exit(1)
}

// A Tauri-shaped CSP: the nonce is what suppresses 'unsafe-inline'. The app is
// built with a nonce stamped onto its <style> tags exactly as tauri-codegen
// does (inject_nonce_token).
const NONCE = "museek0checks0nonce"
const CSP =
  `default-src 'self'; ` +
  `script-src 'self' 'unsafe-eval' 'nonce-${NONCE}'; ` +
  `style-src 'self' 'unsafe-inline' 'nonce-${NONCE}'; ` +
  `img-src 'self' data: blob:; font-src 'self' data:`
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
  if (!existsSync(path) || !extname(path)) path = join(dist, "index.html") // SPA fallback
  let body = readFileSync(path)
  if (path.endsWith("index.html")) {
    body = Buffer.from(body.toString("utf8").replace(/<style>/g, `<style nonce="${NONCE}">`))
  }
  res.setHeader("content-type", MIME[extname(path)] || "application/octet-stream")
  res.setHeader("content-security-policy", CSP)
  res.end(body)
})
const PORT = 9900 + Math.floor(Math.random() * 80)
await new Promise((r) => server.listen(PORT, "127.0.0.1", r))

const DEBUG_PORT = PORT + 200
const profile = mkdtempSync(join(tmpdir(), "museek-gutter-profile-"))
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
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
  const cspViolations = []
  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data)
    if (data.id && pending.has(data.id)) {
      pending.get(data.id)(data)
      pending.delete(data.id)
    }
    if (data.method === "Log.entryAdded" && data.params?.entry?.level === "error") {
      const text = data.params.entry.text ?? ""
      if (/Content Security Policy|Refused to apply/i.test(text)) cspViolations.push(text)
    }
  }
  const send = (method, params = {}) => {
    const n = ++seq
    ws.send(JSON.stringify({ id: n, method, params }))
    return new Promise((r) => pending.set(n, r))
  }
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400))
    return r.result?.result?.value
  }

  await send("Page.enable")
  await send("Runtime.enable")
  await send("Log.enable")
  await send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false })
  await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/settings?tab=about` })
  await sleep(3200)

  // Open the changelog via the real About-page button.
  const opened = await evaluate(`(async () => {
    const label = (el) => (el.textContent || "").trim()
    const btn = [...document.querySelectorAll("button")].find((b) => /更新日志|Changelog/.test(label(b)))
    if (!btn) return false
    btn.click()
    await new Promise((r) => setTimeout(r, 1000))
    return !!document.querySelector('[data-slot="dialog-content"] [data-radix-scroll-area-viewport]')
  })()`)

  if (!opened) {
    check("the changelog dialog opens from Settings → About", false, "button not found or no viewport")
  } else {
    check("the changelog dialog opens from Settings → About", true)

    // The viewport must already be free of a native gutter with the pointer
    // OUTSIDE (the packaged app used to show it there, permanently).
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 2, y: 2, buttons: 0 })
    await sleep(800)
    const idle = await evaluate(`(() => {
      const vp = document.querySelector('[data-slot="dialog-content"] [data-radix-scroll-area-viewport]')
      const cs = getComputedStyle(vp)
      return {
        nativeGutter: vp.offsetWidth - vp.clientWidth,
        scrollbarWidth: cs.scrollbarWidth,
        overflowY: cs.overflowY,
      }
    })()`)
    check(
      "pointer outside: the scroll viewport has no native scrollbar gutter",
      idle.nativeGutter === 0,
      `gutter=${idle.nativeGutter}px scrollbar-width=${idle.scrollbarWidth} overflow-y=${idle.overflowY}`,
    )
    check(
      "the viewport is still a real scroll container (overflow-y is not hidden)",
      idle.overflowY === "scroll" || idle.overflowY === "auto",
      idle.overflowY,
    )

    // Pointer INSIDE: Radix's own thumb may appear; nothing native may join it.
    const box = await evaluate(`(() => {
      const r = document.querySelector('[data-slot="dialog-content"] [data-radix-scroll-area-viewport]').getBoundingClientRect()
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
    })()`)
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y, buttons: 0 })
    await sleep(1200)
    const hover = await evaluate(`(() => {
      const dlg = document.querySelector('[data-slot="dialog-content"]')
      const vp = dlg.querySelector('[data-radix-scroll-area-viewport]')
      return {
        nativeGutter: vp.offsetWidth - vp.clientWidth,
        radixBars: [...dlg.querySelectorAll('[data-orientation]')].filter(
          (b) => b.getAttribute("data-state") === "visible",
        ).length,
      }
    })()`)
    check(
      "pointer inside: still no native scrollbar gutter",
      hover.nativeGutter === 0,
      `gutter=${hover.nativeGutter}px`,
    )
    check(
      "pointer inside: exactly ONE scrollbar is visible (the Radix thumb)",
      hover.nativeGutter === 0 && hover.radixBars === 1,
      `native=${hover.nativeGutter > 0 ? 1 : 0} + radix=${hover.radixBars} = ${(hover.nativeGutter > 0 ? 1 : 0) + hover.radixBars}`,
    )
    check(
      "the CSP really was enforced (the nonce suppressed 'unsafe-inline')",
      cspViolations.length > 0,
      cspViolations.length ? `${cspViolations.length} inline-style violation(s) as expected` : "no violations — CSP did not take effect",
    )

    // Guard the harness itself: the reproduction only means something if the
    // HTML actually carried a nonce'd <style>. A formatter emitting
    // `<style type="text/css">` would make the rewrite miss it, the header
    // nonce would still suppress 'unsafe-inline', the violations would still
    // appear — and this check would pass while testing the wrong thing.
    //
    // A CSP-blocked <style> stays in the DOM but gets NO stylesheet: `el.sheet`
    // is null. That is what distinguishes "Radix injected it and it was
    // refused" from "it applied", and it is the precondition for the bug.
    const nonced = await evaluate(`(() => {
      const styles = [...document.querySelectorAll("style")]
      const blocked = styles.filter(
        (s) => s.sheet === null && s.textContent.includes("data-radix-scroll-area-viewport"),
      )
      return {
        total: styles.length,
        withNonce: styles.filter((s) => s.hasAttribute("nonce")).length,
        blockedRadixStyles: blocked.length,
      }
    })()`)
    check(
      "the harness stamped a CSP nonce onto the page's <style>",
      nonced.withNonce > 0,
      `${nonced.withNonce}/${nonced.total} style element(s) nonce'd`,
    )
    check(
      "Radix's runtime style really was refused (its rule never reached the CSSOM)",
      nonced.blockedRadixStyles > 0,
      nonced.blockedRadixStyles
        ? `${nonced.blockedRadixStyles} blocked style(s) — the packaged failure mode is being reproduced`
        : "no blocked style — the harness is not reproducing the packaged conditions",
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
console.log("Scrollbar gutter checks passed.")
process.exit(0)
