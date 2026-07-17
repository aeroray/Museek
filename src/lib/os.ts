/** Rough OS detection for UI chrome (native traffic lights vs custom buttons). */
export function isMacOs(): boolean {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent.toLowerCase()
  const platform = (navigator.platform || "").toLowerCase()
  return platform.includes("mac") || ua.includes("mac")
}
