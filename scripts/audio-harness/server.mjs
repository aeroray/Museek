// Serves the audio harness page plus the failure shapes the real audio player
// must survive. Reports the harness output back so we don't depend on
// --dump-dom timing.
import { createServer } from "node:http"
import { readFileSync, writeFileSync } from "node:fs"
import { gzipSync } from "node:zlib"

function wav(freq = 440) {
  const rate = 8000
  const seconds = 0.5
  const samples = Math.floor(rate * seconds)
  const data = Buffer.alloc(samples)
  for (let i = 0; i < samples; i++) {
    data[i] = 128 + Math.round(60 * Math.sin((2 * Math.PI * freq * i) / rate))
  }
  const head = Buffer.alloc(44)
  head.write("RIFF", 0)
  head.writeUInt32LE(36 + data.length, 4)
  head.write("WAVE", 8)
  head.write("fmt ", 12)
  head.writeUInt32LE(16, 16)
  head.writeUInt16LE(1, 20)
  head.writeUInt16LE(1, 22)
  head.writeUInt32LE(rate, 24)
  head.writeUInt32LE(rate, 28)
  head.writeUInt16LE(1, 32)
  head.writeUInt16LE(8, 34)
  head.write("data", 36)
  head.writeUInt32LE(data.length, 40)
  return Buffer.concat([head, data])
}

const bundle = readFileSync(process.argv[3], "utf8")
/** How many times /flaky.wav has been requested (fails once, then succeeds). */
let flakyHits = 0
// `?web=1` fakes the Tauri bridge so `usingWebAudio()` returns true, which is the
// ONLY path that produces "Audio request failed". Without it we exercise the
// HTML <audio> element instead and never touch the code under test.
const page = (web) => `<!doctype html><html><body><pre id="out">running</pre>
<script>
window.__BASE__ = "http://127.0.0.1:" + location.port;${web ? "\nwindow.__TAURI_INTERNALS__ = {};" : ""}
// Surface any harness failure instead of silently producing no report.
window.addEventListener("error", (e) => {
  window.__ERR__ = (window.__ERR__ || "") + "\\n" + (e.error && e.error.stack || e.message);
});
window.addEventListener("unhandledrejection", (e) => {
  window.__ERR__ = (window.__ERR__ || "") + "\\nREJECT " + (e.reason && e.reason.stack || e.reason);
});
</script>
<script>${bundle}</script></body></html>`

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost")
  switch (url.pathname) {
    case "/report":
    case "/report-error": {
      let body = ""
      req.on("data", (c) => (body += c))
      req.on("end", () => {
        const target =
          url.pathname === "/report-error" ? process.argv[4] : process.argv[2]
        writeFileSync(target, body)
        res.writeHead(204)
        res.end()
      })
      return
    }
    case "/":
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
      return res.end(page(url.searchParams.get("web") === "1"))
    case "/ok.wav":
      res.writeHead(200, { "content-type": "audio/wav" })
      return res.end(wav(440))
    case "/ok2.wav":
      res.writeHead(200, { "content-type": "audio/wav" })
      return res.end(wav(880))
    case "/ok.wav.gz":
      // Tauri's HTTP plugin can leave bodies compressed.
      res.writeHead(200, { "content-type": "audio/wav" })
      return res.end(gzipSync(wav(660)))
    case "/flaky.wav":
      // Fails the first time, succeeds after: models an expired URL that the
      // caller retries with the same string.
      flakyHits += 1
      if (flakyHits === 1) {
        res.writeHead(403, { "content-type": "text/plain" })
        return res.end("expired")
      }
      res.writeHead(200, { "content-type": "audio/wav" })
      return res.end(wav(520))
    case "/403":
      res.writeHead(403, { "content-type": "text/plain" })
      return res.end("forbidden")
    case "/html":
      res.writeHead(200, { "content-type": "text/html" })
      return res.end("<!doctype html><html><body>hotlink blocked</body></html>")
    case "/json":
      res.writeHead(200, { "content-type": "application/json" })
      return res.end(JSON.stringify({ code: 403, msg: "no permission" }))
    default:
      res.writeHead(404)
      return res.end("nope")
  }
})

server.listen(0, "127.0.0.1", () => {
  console.log(`PORT=${server.address().port}`)
})
