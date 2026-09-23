// Serves the cases the audio element can fail with, so we can read the real
// MediaError.code/message each one produces in Chromium.
import { createServer } from "node:http"
import { writeFileSync } from "node:fs"

// Minimal valid WAV: 8-bit mono, 8000 Hz, 0.1s of silence.
function wav() {
  const rate = 8000
  const samples = 800
  const data = Buffer.alloc(samples, 128)
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

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost")
  // The page POSTs its results here, which avoids depending on --dump-dom
  // timing (the run is asynchronous and dump-dom snapshots too early).
  if (url.pathname === "/report") {
    let body = ""
    req.on("data", (c) => (body += c))
    req.on("end", () => {
      writeFileSync(process.argv[2], body)
      res.writeHead(204)
      res.end()
    })
    return
  }
  switch (url.pathname) {
    case "/ok.wav":
      res.writeHead(200, { "content-type": "audio/wav", "content-length": String(wav().length) })
      return res.end(wav())
    case "/404":
      res.writeHead(404, { "content-type": "text/plain" })
      return res.end("not found")
    case "/html":
      // A 200 whose body is an HTML error page — the hotlink-block shape.
      res.writeHead(200, { "content-type": "text/html" })
      return res.end("<!doctype html><html><body>blocked</body></html>")
    case "/json":
      res.writeHead(200, { "content-type": "application/json" })
      return res.end(JSON.stringify({ code: 403, msg: "no permission" }))
    case "/slow":
      // Respond late: lets us abort a load that is genuinely in flight.
      setTimeout(() => {
        try {
          res.writeHead(200, { "content-type": "audio/wav" })
          res.end(wav())
        } catch {
          /* client already gone */
        }
      }, 5000)
      return
    default:
      res.writeHead(404)
      return res.end("nope")
  }
})

server.listen(0, "127.0.0.1", () => {
  console.log(`PORT=${server.address().port}`)
})
