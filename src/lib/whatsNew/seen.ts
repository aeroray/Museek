const STORAGE_KEY = "museek.whatsNew.seenVersion"

/** Last version whose What's New dialog was dismissed (device-local, not synced). */
export function getSeenVersion(): string | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v && v.trim() ? v.trim().replace(/^v/i, "") : null
  } catch {
    return null
  }
}

export function setSeenVersion(version: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, version.replace(/^v/i, ""))
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Show What's New only after an upgrade.
 * Fresh install (no seen key): silently record current version and stay quiet.
 */
export function shouldShowWhatsNew(currentVersion: string): boolean {
  const current = currentVersion.replace(/^v/i, "")
  const seen = getSeenVersion()
  if (!seen) {
    setSeenVersion(current)
    return false
  }
  return seen !== current
}
