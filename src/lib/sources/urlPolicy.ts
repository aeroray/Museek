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

function isPrivateIPv4(p: [number, number, number, number]): boolean {
  if (p[0] === 0 || p[0] === 127 || p[0] === 10) return true
  if (p[0] === 169 && p[1] === 254) return true
  if (p[0] === 192 && p[1] === 168) return true
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true
  return false
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

function isPrivateOrLoopbackHost(hostname: string): boolean {
  const host = normalizeHost(hostname)
  if (!host) return true
  if (host === "localhost" || host.endsWith(".localhost")) return true

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
