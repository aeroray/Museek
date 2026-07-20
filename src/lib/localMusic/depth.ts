/**
 * Local folder import depth.
 * - `0`–`2`: finite levels below the chosen folder
 * - `-1`: unlimited (∞)
 * Legacy values `3`–`5` migrate to unlimited.
 */
export function normalizeLocalScanDepth(n: number): number {
  if (!Number.isFinite(n)) return -1
  const r = Math.round(n)
  if (r < 0 || r > 2) return -1
  return r
}

export function isUnlimitedLocalScanDepth(depth: number): boolean {
  return depth < 0
}
