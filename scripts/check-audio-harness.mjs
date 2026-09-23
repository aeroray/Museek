// Runs the real `src/lib/audio.ts` in a headless browser against a server that
// fails on demand, and fails if any scenario regresses.
//
//   node scripts/check-audio-harness.mjs
//
// Covers both playback backends:
//   ?web=1  fakes the Tauri bridge so `usingWebAudio()` is true — the only path
//           that produces "Audio request failed", and the reported bug.
//   ?web=0  the HTML <audio> element used on macOS/Linux and in the browser.
//
// This exists because the bugs it guards are invisible to unit tests: they are
// about promise identity, retry behaviour and what a real network failure
// produces. Requires Chrome; skips loudly if none is found.
import { spawn, spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const harness = join(root, "scripts", "audio-harness")
const bundle = join(harness, "bundle.js")

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean)

const chrome = CHROME_CANDIDATES.find((p) => existsSync(p))
if (!chrome) {
  console.error("No Chrome/Edge binary found; set CHROME_PATH to run this check.")
  process.exit(2)
}

// --- Bundle the harness ---------------------------------------------------
const build = spawnSync(
  process.execPath,
  [join(harness, "esbuild-runner.mjs")],
  { cwd: root, encoding: "utf8" },
)
if (build.status !== 0) {
  console.error(build.stdout || "")
  console.error(build.stderr || "")
  console.error("Failed to bundle the harness.")
  process.exit(2)
}

// --- Run one backend ------------------------------------------------------
function runBackend(web) {
  return new Promise((resolveRun) => {
    const dir = mkdtempSync(join(tmpdir(), "museek-audio-"))
    const report = join(dir, "report.txt")
    const crash = join(dir, "crash.txt")
    const profile = join(dir, "profile")

    const server = spawn(
      process.execPath,
      [join(harness, "server.mjs"), report, bundle, crash],
      { cwd: root, stdio: ["ignore", "pipe", "inherit"] },
    )

    let port = null
    let out = ""
    server.stdout.on("data", (c) => {
      out += c
      const m = /PORT=(\d+)/.exec(out)
      if (m && !port) {
        port = m[1]
        launch()
      }
    })

    let browser = null
    const launch = () => {
      browser = spawn(
        chrome,
        [
          "--headless=new",
          "--disable-gpu",
          "--no-sandbox",
          `--user-data-dir=${profile}`,
          "--autoplay-policy=no-user-gesture-required",
          `http://127.0.0.1:${port}/?web=${web ? 1 : 0}`,
        ],
        { stdio: "ignore" },
      )
    }

    const deadline = Date.now() + 60_000
    const poll = setInterval(() => {
      const ready = existsSync(report) || existsSync(crash)
      if (!ready && Date.now() < deadline) return
      clearInterval(poll)
      browser?.kill()
      server.kill()

      let text = ""
      if (existsSync(report)) text = readFileSync(report, "utf8")
      if (existsSync(crash)) {
        text += "\n--- CRASH ---\n" + readFileSync(crash, "utf8")
      }
      // The browser may still hold the profile dir on Windows; temp cleanup
      // failing must never fail the check.
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
      } catch {
        /* left behind in temp */
      }

      if (!text) {
        console.log("(no report — harness never reported)")
        return resolveRun({ ok: false, text: "(no report)" })
      }
      const ok = !/\bFAIL\b/.test(text) && !/CRASH/.test(text)
      resolveRun({ ok, text })
    }, 250)
  })
}

// --- Report ---------------------------------------------------------------
let allOk = true
for (const web of [true, false]) {
  const label = web ? "Web Audio (Windows/Tauri)" : "HTML <audio> (macOS/Linux)"
  console.log(`\n${"=".repeat(64)}\n${label}\n${"=".repeat(64)}`)
  const { ok, text } = await runBackend(web)
  console.log(text)
  if (!ok) allOk = false
}

console.log(allOk ? "\nAll harness scenarios pass." : "\nHarness scenarios FAILED.")
process.exit(allOk ? 0 : 1)
