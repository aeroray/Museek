import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater"
import { relaunch } from "@tauri-apps/plugin-process"
import { httpFetch } from "@/lib/http"

export type UpdateInfo = {
  version: string
  currentVersion: string
  body?: string
  /** True when tauri-plugin-updater can download + install in-app. */
  canInstall: boolean
  /** Installer URL from the probe that won (same mirror as the successful check). */
  downloadUrl?: string
  /** Winner first, then other mirrors wrapping the same asset (for “try another”). */
  downloadUrls?: string[]
  /** Host label of the winning probe, e.g. "gh-proxy.com" or "github.com". */
  sourceLabel?: string
}

export type DownloadProgress = {
  /** 0–100 while known; null while total size is unknown */
  percent: number | null
  downloaded: number
  total: number | null
}

const REPO = "aeroray/Museek"
const GITHUB_LATEST_JSON =
  `https://github.com/${REPO}/releases/latest/download/latest.json`
const GITHUB_API_LATEST = `https://api.github.com/repos/${REPO}/releases/latest`

/**
 * URL-prefix proxies for when github.com is unreachable from mainland China.
 * Order is for alternate-download cycling only — check probes race in parallel.
 * ghfast.top kept last as a weak fallback (often blocked by some ISPs).
 */
const GH_MIRRORS = [
  "https://gh-proxy.com/",
  "https://ghproxy.net/",
  "https://mirror.ghproxy.com/",
  "https://gh.llkk.cc/",
  "https://ghfast.top/",
]

/** Per-request budget — concurrent probes, so keep this tight. */
const PROBE_TIMEOUT_MS = 5_000

export const RELEASES_URL = `https://github.com/${REPO}/releases/latest`

let cached: Update | null = null

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

function toInfo(update: Update, extras?: Partial<UpdateInfo>): UpdateInfo {
  return {
    version: update.version,
    currentVersion: update.currentVersion,
    body: update.body,
    canInstall: true,
    ...extras,
  }
}

function isNewer(latest: string, current: string): boolean {
  const a = latest.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0)
  const b = current.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0)
  }
  return false
}

function withMirror(url: string, mirror: string): string {
  if (!mirror || url.startsWith(mirror)) return url
  return `${mirror}${url}`
}

function mirrorLabel(mirrorPrefix: string): string {
  if (!mirrorPrefix) return "github.com"
  try {
    return new URL(mirrorPrefix).host
  } catch {
    return mirrorPrefix.replace(/^https?:\/\//, "").replace(/\/$/, "") || "mirror"
  }
}

/** Winner first, then every other mirror wrapping the same GitHub asset URL. */
function buildDownloadUrls(assetUrl: string, winnerPrefix: string): string[] {
  const primary = withMirror(assetUrl, winnerPrefix)
  const rest = GH_MIRRORS.filter((m) => m !== winnerPrefix).map((m) => withMirror(assetUrl, m))
  // Direct GitHub as last resort when winner was a mirror
  const direct = winnerPrefix ? assetUrl : null
  const ordered = [primary, ...rest, ...(direct && direct !== primary ? [direct] : [])]
  return [...new Set(ordered)]
}

function attachDownloads(
  base: Omit<UpdateInfo, "downloadUrl" | "downloadUrls" | "sourceLabel">,
  assetUrl: string | undefined,
  mirrorPrefix: string,
  fallback?: string,
): UpdateInfo {
  if (!assetUrl) {
    return {
      ...base,
      downloadUrl: fallback || RELEASES_URL,
      downloadUrls: fallback ? [fallback] : [RELEASES_URL],
      sourceLabel: mirrorLabel(mirrorPrefix),
    }
  }
  const downloadUrls = buildDownloadUrls(assetUrl, mirrorPrefix)
  return {
    ...base,
    downloadUrl: downloadUrls[0],
    downloadUrls,
    sourceLabel: mirrorLabel(mirrorPrefix),
  }
}

function detectOs(): "windows" | "macos" | "other" {
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes("windows")) return "windows"
  if (ua.includes("mac")) return "macos"
  return "other"
}

function pickAssetUrl(
  assets: { name?: string; browser_download_url?: string }[],
): string | undefined {
  const os = detectOs()
  const names = assets
    .map((a) => ({ name: a.name ?? "", url: a.browser_download_url ?? "" }))
    .filter((a) => a.name && a.url)

  if (os === "windows") {
    return (
      names.find((a) => /x64-setup\.exe$/i.test(a.name))?.url ??
      names.find((a) => /setup\.exe$/i.test(a.name))?.url ??
      names.find((a) => /\.exe$/i.test(a.name))?.url
    )
  }
  if (os === "macos") {
    return (
      names.find((a) => /aarch64\.dmg$/i.test(a.name))?.url ??
      names.find((a) => /\.dmg$/i.test(a.name))?.url ??
      names.find((a) => /\.app\.tar\.gz$/i.test(a.name))?.url
    )
  }
  return names[0]?.url
}

type LatestJson = {
  version?: string
  notes?: string
  platforms?: Record<string, { url?: string; signature?: string }>
}

/** Successful probe: null = already on latest; UpdateInfo = newer available. */
type ProbeOk = { info: UpdateInfo | null; update?: Update }

async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
  const res = await httpFetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Museek",
    },
    signal,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.json()
}

function timeoutSignal(ms: number, parent?: AbortSignal): AbortSignal {
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), ms)
  const onAbort = () => {
    window.clearTimeout(timer)
    ctrl.abort()
  }
  parent?.addEventListener("abort", onAbort, { once: true })
  if (parent?.aborted) onAbort()
  // Clear timer when this signal aborts for any reason
  ctrl.signal.addEventListener("abort", () => window.clearTimeout(timer), { once: true })
  return ctrl.signal
}

function manifestToInfo(data: LatestJson, mirrorPrefix: string): UpdateInfo | null {
  if (!data?.version) throw new Error("invalid manifest")
  const version = String(data.version).replace(/^v/, "")
  if (!isNewer(version, __APP_VERSION__)) return null

  const os = detectOs()
  const platformKey =
    os === "windows" ? "windows-x86_64" : os === "macos" ? "darwin-aarch64" : ""
  const platformUrl = platformKey ? data.platforms?.[platformKey]?.url : undefined

  return attachDownloads(
    {
      version,
      currentVersion: __APP_VERSION__,
      body: data.notes,
      canInstall: false,
    },
    platformUrl,
    mirrorPrefix,
  )
}

function apiToInfo(
  data: {
    tag_name?: string
    body?: string
    html_url?: string
    assets?: { name?: string; browser_download_url?: string }[]
  },
  mirrorPrefix: string,
): UpdateInfo | null {
  const tag = String(data.tag_name || "").replace(/^v/, "")
  if (!tag) throw new Error("invalid api payload")
  if (!isNewer(tag, __APP_VERSION__)) return null
  const asset = pickAssetUrl(data.assets ?? [])
  return attachDownloads(
    {
      version: tag,
      currentVersion: __APP_VERSION__,
      body: data.body,
      canInstall: false,
    },
    asset,
    mirrorPrefix,
    data.html_url || RELEASES_URL,
  )
}

/**
 * Race probes: first fulfilled success wins. Failures are ignored until all lose.
 * `AbortSignal` cancels losing HTTP requests once a winner is chosen.
 */
function raceProbes(factories: ((signal: AbortSignal) => Promise<ProbeOk>)[]): Promise<ProbeOk> {
  if (!factories.length) return Promise.reject(new Error("no probes"))

  return new Promise((resolve, reject) => {
    const ctrl = new AbortController()
    let pending = factories.length
    let settled = false
    let lastErr: unknown

    for (const run of factories) {
      void run(ctrl.signal)
        .then((ok) => {
          if (settled) return
          settled = true
          ctrl.abort()
          resolve(ok)
        })
        .catch((e) => {
          lastErr = e
          pending -= 1
          if (!settled && pending === 0) reject(lastErr ?? new Error("all probes failed"))
        })
    }
  })
}

function friendlyNetworkError(err: unknown): Error {
  const raw = String(err)
  if (
    /error sending request|failed to fetch|network|timed out|abort|dns|connection/i.test(raw) ||
    /github\.com/i.test(raw)
  ) {
    return new Error(
      "无法连接 GitHub（中国大陆网络常见）。已尝试镜像仍失败时，请稍后重试或从 Releases 页面手动下载。",
    )
  }
  return err instanceof Error ? err : new Error(raw)
}

function clearCachedUpdate() {
  if (!cached) return
  const prev = cached
  cached = null
  void prev.close().catch(() => {
    /* ignore */
  })
}

type ManifestProbe = { url: string; mirrorPrefix: string }

/**
 * Concurrent update check: official updater + latest.json mirrors + GitHub API
 * mirrors all fire at once; the first successful answer wins — and its mirror
 * prefix is reused for the installer download URL.
 */
export async function checkForAppUpdate(): Promise<UpdateInfo | null> {
  if (!isTauri()) return null
  clearCachedUpdate()

  const manifestProbes: ManifestProbe[] = [
    { url: GITHUB_LATEST_JSON, mirrorPrefix: "" },
    ...GH_MIRRORS.map((m) => ({ url: withMirror(GITHUB_LATEST_JSON, m), mirrorPrefix: m })),
  ]
  const apiProbes: ManifestProbe[] = [
    { url: GITHUB_API_LATEST, mirrorPrefix: "" },
    ...GH_MIRRORS.map((m) => ({ url: withMirror(GITHUB_API_LATEST, m), mirrorPrefix: m })),
  ]

  const probes: ((signal: AbortSignal) => Promise<ProbeOk>)[] = [
    // Plugin path — enables in-app install when an endpoint (incl. mirrors) works.
    async () => {
      const update = await check({ timeout: PROBE_TIMEOUT_MS })
      if (!update) return { info: null }
      return {
        info: toInfo(update, { sourceLabel: "updater", downloadUrl: RELEASES_URL, downloadUrls: [RELEASES_URL] }),
        update,
      }
    },
    ...manifestProbes.map(
      ({ url, mirrorPrefix }) =>
        async (signal: AbortSignal) => {
          const data = (await fetchJson(url, timeoutSignal(PROBE_TIMEOUT_MS, signal))) as LatestJson
          return { info: manifestToInfo(data, mirrorPrefix) }
        },
    ),
    ...apiProbes.map(
      ({ url, mirrorPrefix }) =>
        async (signal: AbortSignal) => {
          const data = (await fetchJson(url, timeoutSignal(PROBE_TIMEOUT_MS, signal))) as Parameters<
            typeof apiToInfo
          >[0]
          return { info: apiToInfo(data, mirrorPrefix) }
        },
    ),
  ]

  try {
    const { info, update } = await raceProbes(probes)
    if (update) cached = update
    return info
  } catch (e) {
    throw friendlyNetworkError(e)
  }
}

function progressFromEvents(
  onProgress?: (p: DownloadProgress) => void,
): (event: DownloadEvent) => void {
  let downloaded = 0
  let total: number | null = null
  return (event) => {
    if (event.event === "Started") {
      total = event.data.contentLength ?? null
      downloaded = 0
    } else if (event.event === "Progress") {
      downloaded += event.data.chunkLength
    } else if (event.event === "Finished") {
      if (total != null) downloaded = total
    }
    onProgress?.({
      downloaded,
      total,
      percent: total && total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : null,
    })
  }
}

/** Download, verify signature, install, then relaunch. Requires a successful plugin check(). */
export async function installAppUpdate(
  onProgress?: (p: DownloadProgress) => void,
): Promise<void> {
  if (!isTauri()) throw new Error("Updater is only available in the desktop app")
  const update = cached ?? (await check({ timeout: PROBE_TIMEOUT_MS }).catch(() => null))
  if (!update) {
    throw new Error(
      "当前网络无法直连 GitHub 完成应用内安装。请使用「镜像下载」或打开 Releases 手动安装。",
    )
  }
  cached = update
  try {
    await update.downloadAndInstall(progressFromEvents(onProgress))
  } catch (e) {
    throw friendlyNetworkError(e)
  }
  await relaunch()
}
