// Pins the source-script URL policy.
//
// `assertAllowedSourceUrl` is the only thing standing between a malicious
// imported lx-music script and the user's loopback services, LAN, and cloud
// metadata endpoint. It used to be name-based only, so ordinary DNS names that
// alias loopback (`127.0.0.1.nip.io`, `localtest.me`) walked straight through,
// and several special-use IPv4 ranges (carrier-grade NAT, benchmarking,
// IETF-assignment) were treated as public.
//
// The numeric-encoding bypasses were already handled correctly and must stay
// that way — the WHATWG parser normalises octal/decimal/hex forms to dotted
// quads, and `parseIPv4` then sees a real address.
//
//   node scripts/check-source-url-policy.mjs
import { createTsLoader } from "./lib/load-ts.mjs"

const load = createTsLoader()
const { deniedSourceUrlReason } = await load("src/lib/sources/urlPolicy.ts")

let failures = 0
const check = (name, cond, extra = "") => {
  if (cond) console.log(`  ok   ${name}`)
  else {
    console.log(`  FAIL ${name}${extra ? "  " + extra : ""}`)
    failures++
  }
}
const isDenied = (url) => deniedSourceUrlReason(url) !== null
const isAllowed = (url) => deniedSourceUrlReason(url) === null

console.log("ordinary CDN and API hosts stay reachable")
for (const url of [
  "https://www.kuwo.cn/api/x",
  "https://interface.music.163.com/eapi/batch",
  "https://songsearch.kugou.com/x",
  "https://c.y.qq.com/soso/fcgi-bin/client_search_cp",
  "https://app.c.nf.migu.cn/x",
  "https://ws.audioscrobbler.com/2.0/",
  "https://p2.music.126.net/abc.jpg",
]) {
  check(`allowed ${new URL(url).host}`, isAllowed(url))
}

console.log("\nloopback, LAN and link-local literals are denied")
for (const url of [
  "http://127.0.0.1/x",
  "http://127.1.2.3/x",
  "http://localhost/x",
  "http://LOCALHOST./x",
  "http://foo.localhost/x",
  "http://10.1.2.3/x",
  "http://172.16.0.1/x",
  "http://172.31.255.255/x",
  "http://192.168.1.1/x",
  "http://169.254.169.254/latest/meta-data/",
  "http://0.0.0.0/x",
]) {
  check(`denied ${url}`, isDenied(url))
}

console.log("\nspecial-use ranges that were previously treated as public")
for (const url of [
  "http://100.64.0.1/x", // carrier-grade NAT
  "http://100.127.255.254/x",
  "http://198.18.0.1/x", // benchmarking
  "http://198.19.255.254/x",
  "http://192.0.0.1/x", // IETF protocol assignments
  "http://240.0.0.1/x", // reserved
  "http://255.255.255.255/x", // broadcast
]) {
  check(`denied ${url}`, isDenied(url))
}

console.log("\nDNS names that alias loopback (the shipped bypass)")
for (const url of [
  "http://localtest.me/x",
  "http://127.0.0.1.nip.io/x",
  "http://10.0.0.1.nip.io/x",
  "http://192.168.1.1.sslip.io/x",
  "http://metadata.google.internal/computeMetadata/v1/",
  "http://metadata/computeMetadata/v1/",
]) {
  check(`denied ${url}`, isDenied(url))
}

console.log("\nnumeric-encoding bypasses stay denied (already correct before)")
for (const url of [
  "http://2130706433/x", // decimal 127.0.0.1
  "http://0177.0.0.1/x", // octal
  "http://0x7f.0.0.1/x", // hex
  "http://127.1/x",
]) {
  check(`denied ${url}`, isDenied(url))
}

console.log("\nIPv6 loopback / unique-local / link-local")
for (const url of [
  "http://[::1]/x",
  "http://[fe80::1]/x",
  "http://[fd00::1]/x",
  "http://[fc00::1]/x",
  "http://[::ffff:127.0.0.1]/x",
]) {
  check(`denied ${url}`, isDenied(url))
}

console.log("\nnon-http schemes are refused")
for (const url of [
  "file:///C:/Windows/win.ini",
  "asset://localhost/etc/passwd",
  "tauri://localhost/x",
  "data:text/html,<script>",
  "ftp://example.com/x",
]) {
  check(`denied ${url}`, isDenied(url))
}

console.log("\na normal-looking host is not caught by the abuse filter")
for (const url of [
  "https://bethel-music.example/x",
  "https://alphabet.example/x",
  "https://abetterplace.example/x",
]) {
  check(`allowed ${new URL(url).host}`, isAllowed(url))
}

console.log("")
if (failures) {
  console.log(`FAILED: ${failures} case(s)`)
  process.exit(1)
}
console.log("Source URL policy checks passed.")
