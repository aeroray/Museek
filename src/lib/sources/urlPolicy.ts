/** Reasons used in errors returned to source scripts (and logged with script id). */
const INVALID = "invalid URL"
const SCHEME = "only http and https are allowed"
const PRIVATE = "private or loopback hosts are not allowed"
const BLOCKED_HOST = "host is not allowed"

const ABUSE_HOST_RE =
  /casino|gambling|lottery|porn|(?:^|\.)xxx(?:\.|$)|wager|xmrig|coinmin|(?:^|[\d.-])bet(?:$|[\d.-])/i

function normalizeHost(hostname: string): string {
  return hostname.replace(/\.+$/, "").toLowerCase().replace(/^\[|\]$/g, "")
}

function parseIPv4(host: string): [number, number, number, number] | null {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return null
  const parts = host.split(".").map(Number)
  if (parts.some((n) => n > 255)) return null
  return parts as [number, number, number, number]
}

function ipv4FromMappedIPv6(host: string): [number, number, number, number] | null {
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(host)
  if (dotted) return parseIPv4(dotted[1])
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(host)
  if (!hex) return null
  const hi = Number.parseInt(hex[1], 16)
  const lo = Number.parseInt(hex[2], 16)
  return [(hi >> 8) & 255, hi & 255, (lo >> 8) & 255, lo & 255]
}

/**
 * Is this IPv4 address one that must never be reachable from a source script?
 *
 * Covers loopback, RFC1918, link-local, and the ranges that are easy to forget
 * but are just as sensitive: carrier-grade NAT (100.64/10, which on many home
 * setups reaches the router), benchmarking (198.18/15), IETF protocol
 * assignments (192.0.0.0/24, where some metadata services live), documentation
 * ranges, and reserved/broadcast space (240/4).
 */
function isPrivateIPv4(p: [number, number, number, number]): boolean {
  const [a, b, c] = p
  if (a === 0 || a === 127 || a === 10) return true
  if (a === 169 && b === 254) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  // Carrier-grade NAT (RFC 6598).
  if (a === 100 && b >= 64 && b <= 127) return true
  // Benchmarking (RFC 2544).
  if (a === 198 && (b === 18 || b === 19)) return true
  // IETF protocol assignments (RFC 6890) — some cloud metadata agents live here.
  if (a === 192 && b === 0 && c === 0) return true
  // Documentation ranges.
  if (a === 198 && b === 51 && c === 100) return true
  if (a === 203 && b === 0 && c === 113) return true
  // Reserved (240/4) and broadcast.
  if (a >= 240) return true
  return false
}

/**
 * Well-known DNS aliases for loopback / link-local.
 *
 * These defeat a purely name-based private-host check, because they are ordinary
 * DNS names: `127.0.0.1.nip.io` and `localtest.me` both resolve to 127.0.0.1.
 * A name list can never be complete — a fully correct control must resolve the
 * host and inspect the address, which is what the Rust asset-protocol grant does.
 * Here it removes the trivial bypasses and keeps the fast path cheap.
 */
const LOOPBACK_ALIAS_RE =
  /(?:^|\.)(?:localtest\.me|localhost\.localdomain|lvh\.me|vcap\.me|sslip\.io|nip\.io|xip\.io|traefik\.me|localtest)$/i

/** Well-known cloud metadata endpoints. */
const METADATA_HOST_RE = /^(?:metadata|metadata\.google\.internal|instance-data)$/i

function isPrivateOrLoopbackHost(hostname: string): boolean {
  const host = normalizeHost(hostname)
  if (!host) return true
  if (host === "localhost" || host.endsWith(".localhost")) return true
  if (METADATA_HOST_RE.test(host) || host.endsWith(".metadata.google.internal")) {
    return true
  }
  if (LOOPBACK_ALIAS_RE.test(host)) return true

  const v4 = parseIPv4(host) ?? ipv4FromMappedIPv6(host)
  if (v4) return isPrivateIPv4(v4)

  if (!host.includes(":")) return false
  if (host === "::1" || host === "::" || host === "0:0:0:0:0:0:0:1") return true
  if (host.startsWith("fe80:")) return true
  if (host.startsWith("fc") || host.startsWith("fd")) return true
  return false
}

function hostLooksAbusive(hostname: string): boolean {
  return ABUSE_HOST_RE.test(normalizeHost(hostname))
}

export function deniedSourceUrlReason(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return INVALID
  }

  const protocol = parsed.protocol.toLowerCase()
  if (protocol !== "http:" && protocol !== "https:") {
    return SCHEME
  }

  const host = parsed.hostname
  if (isPrivateOrLoopbackHost(host)) return PRIVATE
  if (hostLooksAbusive(host)) return BLOCKED_HOST
  return null
}

export function assertAllowedSourceUrl(url: string, scriptId?: string): void {
  const reason = deniedSourceUrlReason(url)
  if (!reason) return
  let host = url
  try {
    host = new URL(url).hostname
  } catch {
    /* keep raw url */
  }
  console.warn(`[source ${scriptId ?? "?"}] blocked request to ${host}: ${reason}`)
  throw new Error(`Request blocked: ${reason}`)
}
