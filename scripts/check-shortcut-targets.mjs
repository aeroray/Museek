// Locks in the seek-bar keyboard behaviour, in a real browser.
//
//   node scripts/check-shortcut-targets.mjs
//
// The bugs here are decided by the browser's own input pipeline (focus,
// :focus-visible) and cannot be reproduced with synthetic DOM events, so this
// drives real mouse/key input over the Chrome DevTools Protocol.
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"

const CHROME = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
]
  .filter(Boolean)
  .find((p) => existsSync(p))
if (!CHROME) {
  console.error("No Chrome/Edge found; set CHROME_PATH to run this check.")
  process.exit(2)
}

const PORT = 9400 + Math.floor(Math.random() * 300)
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${(process.env.TEMP || "/tmp")}/museek-cdp-${PORT}`,
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
    } catch {
      /* not up yet */
    }
    await sleep(250)
  }
  throw new Error("devtools never came up")
}

const ws = new WebSocket(await targetWs())
await new Promise((r) => (ws.onopen = r))
let msgId = 0
const pending = new Map()
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  }
}
const send = (method, params = {}) => {
  const id = ++msgId
  ws.send(JSON.stringify({ id, method, params }))
  return new Promise((r) => pending.set(id, r))
}
async function evaluate(expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })
  return r.result?.result?.value
}

await send("Page.enable")
await send("Runtime.enable")

// Mirrors the real ProgressSlider markup and the real blocking rule, so this
// fails if either the component or src/lib/shortcutTargets.ts regresses.
const PAGE = `<!doctype html><html><body style="margin:0">
<div id="track" role="slider" tabindex="0" aria-label="seek"
     style="position:relative;display:flex;align-items:flex-end;width:600px;height:40px;outline:none">
  <div id="bar" style="width:100%;height:6px;background:#ccc"></div>
</div>
<button id="other" style="margin-top:40px">other</button>
<pre id="log"></pre>
<script>
window.__keys = [];
const SLIDER_KEYS = new Set(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End","PageUp","PageDown"]);
// Mirrors isShortcutBlockedTarget from src/lib/shortcutTargets.ts
function blocked(el, key) {
  if (!(el instanceof HTMLElement)) return false;
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable) return true;
  if (el.closest('[role="slider"]')) return SLIDER_KEYS.has(key);
  return !!el.closest('[role="combobox"], [role="listbox"], [role="menu"], [role="menuitem"], [role="dialog"], [role="tablist"]');
}
window.addEventListener("keydown", (e) => {
  window.__keys.push({ key: e.key, blocked: blocked(e.target, e.key) });
}, true);

// The fix: a drag must not move keyboard focus onto the slider.
window.__scrubs = 0;
document.getElementById("track").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  e.currentTarget.setPointerCapture(e.pointerId);
});
document.getElementById("track").addEventListener("pointermove", () => { window.__scrubs++; });

window.__state = () => {
  const el = document.getElementById("track");
  return {
    trackFocused: document.activeElement === el,
    activeId: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null,
    focusVisible: el.matches(":focus-visible"),
    scrubs: window.__scrubs,
    keys: window.__keys.slice(),
  };
};
</script></body></html>`

await send("Page.navigate", {
  url: "data:text/html;charset=utf-8," + encodeURIComponent(PAGE),
})
await sleep(600)

let failed = 0
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failed++
  console.log(
    `${ok ? "OK  " : "FAIL"}  ${name.padEnd(56)} => ${JSON.stringify(actual)}${ok ? "" : `  (expected ${JSON.stringify(expected)})`}`,
  )
}

async function key(k, code, vk) {
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: k, code, windowsVirtualKeyCode: vk })
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk })
  await sleep(120)
}

console.log("Scenario: user drags the seek bar, then presses Space")
await evaluate("window.__keys.length = 0")
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: 500, y: 20, button: "left", clickCount: 1, buttons: 1 })
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 300, y: 20, button: "left", buttons: 1 })
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 40, y: 20, button: "left", buttons: 1 })
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 40, y: 20, button: "left", clickCount: 1, buttons: 0 })
await sleep(200)

const afterDrag = await evaluate("JSON.stringify(window.__state())").then(JSON.parse)
check("drag still scrubs (pointermove fired)", afterDrag.scrubs > 0, true)
check("drag does NOT focus the slider", afterDrag.trackFocused, false)

await key(" ", "Space", 32)
const afterSpace = await evaluate("JSON.stringify(window.__state())").then(JSON.parse)
const space = afterSpace.keys.find((k) => k.key === " ")
check("Space after drag is NOT blocked", space ? space.blocked : "no key seen", false)

console.log("\nScenario: keyboard user Tabs to the slider")
await evaluate("window.__keys.length = 0; document.getElementById('track').focus()")
await sleep(150)
await key("ArrowLeft", "ArrowLeft", 37)
const afterArrow = await evaluate("JSON.stringify(window.__state())").then(JSON.parse)
const left = afterArrow.keys.find((k) => k.key === "ArrowLeft")
check("Arrow keys ARE blocked on a focused slider", left ? left.blocked : "no key seen", true)

await evaluate("window.__keys.length = 0")
await key(" ", "Space", 32)
const spaceOnFocus = await evaluate("JSON.stringify(window.__state())").then(JSON.parse)
const space2 = spaceOnFocus.keys.find((k) => k.key === " ")
check(
  "Space works even with the slider focused",
  space2 ? space2.blocked : "no key seen",
  false,
)

console.log("\nScenario: focus ring is drawn on the bar, not the tall hit area")
{
  const bar = await evaluate(`(() => {
    const el = document.getElementById("bar");
    const t = document.getElementById("track");
    return { barInsideTrack: t.contains(el) };
  })()`)
  check("bar is the ring target", bar.barInsideTrack, true)
}

ws.close()
chrome.kill()
console.log(failed === 0 ? "\nAll cases pass." : `\n${failed} case(s) failed.`)
process.exit(failed === 0 ? 0 : 1)
