// Drives the REAL src/lib/audio.ts against a server that fails on demand, to
// verify the retry path actually recovers (and that no premature error fires).
//
// Bundled by esbuild into an IIFE and served by the harness server.
import { audioPlayer } from "@/lib/audio"

const out: string[] = []
const log = (s: string) => {
  out.push(s)
  const el = document.getElementById("out")
  if (el) el.textContent = out.join("\n")
}

// Record every error the player reports, with the source URL at that moment.
const errors: string[] = []
audioPlayer.setCallbacks({
  onStateChange: () => {},
  onEnded: () => {},
  onError: (msg) => {
    errors.push(msg)
    log(`  onError fired: ${JSON.stringify(msg)}`)
  },
})

const base = (window as unknown as { __BASE__: string }).__BASE__

async function scenario(name: string, url: string, expect: "ok" | "fail") {
  errors.length = 0
  log(`\n[${name}]`)
  let threw = ""
  try {
    audioPlayer.setSource(url)
    await audioPlayer.whenReady()
    await audioPlayer.play()
  } catch (err) {
    threw = (err as Error).message
  }
  const state = audioPlayer.getState()
  log(`  whenReady/play threw: ${threw ? JSON.stringify(threw) : "no"}`)
  log(`  onError count: ${errors.length}`)
  log(`  status: ${state.status}  duration: ${state.duration.toFixed(3)}`)

  if (expect === "ok") {
    if (threw) log("  RESULT: FAIL (expected success)")
    else if (state.duration <= 0) log("  RESULT: FAIL (no duration)")
    else log("  RESULT: PASS")
  } else {
    if (!threw && errors.length === 0) log("  RESULT: FAIL (silent failure)")
    else log("  RESULT: PASS")
  }
}

;(async () => {
  const web = "__TAURI_INTERNALS__" in window
  log(`audioPlayer harness, base=${base}`)
  log(`path: ${web ? "WEB AUDIO (the reported-bug path)" : "HTML <audio> element"}`)

  // 1. A good file decodes and reports a real duration.
  await scenario("valid wav", `${base}/ok.wav`, "ok")

  // 2. The reported bug shape: a 403 on the first URL. The player must reject
  //    (so playerStore can retry) rather than fail silently.
  await scenario("403 first try", `${base}/403`, "fail")

  // 3. THE RETRY: a fresh URL that works. This is what playerStore does after
  //    invalidating the expired URL, and it must succeed.
  await scenario("retry with good url", `${base}/ok2.wav`, "ok")

  // 4. Re-applying the SAME url after a SUCCESS is served from the decoded
  //    buffer (no re-fetch needed).
  audioPlayer.setSource(`${base}/ok.wav`)
  await audioPlayer.whenReady().catch(() => {})
  await scenario("same url after success", `${base}/ok.wav`, "ok")

  // 4b. Re-applying the SAME url after a FAILURE must actually re-fetch. The
  //     URL a source resolves can be byte-identical across retries (a CDN url
  //     without a timestamp, a cached response), and playerStore's retry only
  //     swaps the URL — it does not know whether the string changed. If the
  //     rejected load promise is retained, the retry replays the old failure
  //     forever and the user sees the same error twice.
  audioPlayer.setSource(`${base}/flaky.wav`)
  await audioPlayer.whenReady().catch(() => {})
  log("\n[re-apply same url after failure]")
  log("  (first attempt should have failed)")
  await scenario("same url retry after failure", `${base}/flaky.wav`, "ok")

  // 5. A 200 whose body is HTML: must fail loudly, not decode garbage.
  await scenario("200 html body", `${base}/html`, "fail")

  // 6. A 200 whose body is JSON: same.
  await scenario("200 json body", `${base}/json`, "fail")

  // 7. A gzipped-but-valid body must still decode. Only meaningful on the Web
  //    Audio path: there the bytes come from the Tauri HTTP plugin, which can
  //    hand back a still-compressed body. The HTML element uses WebView2's own
  //    network stack, which decodes content-encoding itself, so a raw gzip body
  //    is legitimately not playable there.
  if (web) {
    await scenario("gzip wav", `${base}/ok.wav.gz`, "ok")
  } else {
    log("\n[gzip wav] skipped (HTML path — WebView2 handles content-encoding)")
  }

  await fetch(`${base}/report`, { method: "POST", body: out.join("\n") })
})().catch(async (err) => {
  // Without this the page just stops and the harness reports nothing.
  log(`\nHARNESS CRASHED: ${(err as Error).stack || err}`)
  await fetch(`${base}/report-error`, {
    method: "POST",
    body: out.join("\n") + "\n" + ((err as Error).stack || String(err)),
  }).catch(() => {})
})
