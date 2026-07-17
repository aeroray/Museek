import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater"
import { relaunch } from "@tauri-apps/plugin-process"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { httpFetch } from "@/lib/http"

export type UpdateInfo = {
  version: string
  currentVersion: string
  body?: string
  /**
   * Always true when returned from check — we only surface updates that are
   * bound to a plugin `Update` and can silent-install.
   */
  canInstall: true
  /** Installer URL from the probe that won (same mirror as the successful check). */
  downloadUrl: string
  /** Winner first, then other mirrors wrapping the same asset. */
  downloadUrls: string[]
  /** Host label of the winning probe, e.g. "gh-proxy.com" or "github.com". */
  sourceLabel?: string
}

export type DownloadProgress = {
  /** 0–100 while known; null while total size is unknown */
  percent: number | null
  downloaded: number
  total: number | null
  /** Optional phase hint from download events (Finished → installing). */
  phase?: "downloading" | "installing"
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
/** Longer budget when we already know a newer version and need the plugin Update. */
const INSTALL_BIND_TIMEOUT_MS = 12_000
/** Second bind attempt after a short pause when the first bind times out. */
const INSTALL_BIND_RETRY_MS = 16_000

export const RELEASES_URL = `https://github.com/${REPO}/releases/latest`

let cached: Update | null = null
/** Winner-first installer URLs from the successful check (prefer over rebuild). */
let cachedDownloadUrls: string[] = []

/** True when a plugin Update is cached for in-app silent install. */
export function hasCachedInstall(): boolean {
  return cached != null
}

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

function toInfo(update: Update, extras: {
  downloadUrl: string
  downloadUrls: string[]
  sourceLabel?: string
}): UpdateInfo {
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
  // Direct GitHub last — often slow or blocked; mirrors race first.
  const direct = assetUrl
  const ordered = [primary, ...rest, direct]
  return [...new Set(ordered.filter(Boolean))]
}

/** Platform artifact URL from updater / latest.json `platforms` map. */
function artifactUrlFromRaw(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const platforms = (raw as LatestJson).platforms
  if (!platforms) return undefined
  const os = detectOs()
  const key =
    os === "windows" ? "windows-x86_64" : os === "macos" ? "darwin-aarch64" : ""
  if (!key) return undefined
  const url = platforms[key]?.url
  return url && typeof url === "string" ? url : undefined
}

function artifactUrlsFromUpdate(update: Update, winnerPrefix = ""): string[] {
  const direct = artifactUrlFromRaw(update.rawJson)
  if (direct) return buildDownloadUrls(direct, winnerPrefix)
  return []
}

type MirrorHint = {
  version: string
  body?: string
  downloadUrl?: string
  downloadUrls?: string[]
  sourceLabel?: string
}

function attachDownloads(
  version: string,
  body: string | undefined,
  assetUrl: string | undefined,
  mirrorPrefix: string,
  fallback?: string,
): MirrorHint {
  if (!assetUrl) {
    return {
      version,
      body,
      downloadUrl: fallback || RELEASES_URL,
      downloadUrls: fallback ? [fallback] : [RELEASES_URL],
      sourceLabel: mirrorLabel(mirrorPrefix),
    }
  }
  const downloadUrls = buildDownloadUrls(assetUrl, mirrorPrefix)
  return {
    version,
    body,
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
    // In-app updater needs .app.tar.gz (+ .sig), never the .dmg installer.
    return (
      names.find((a) => /\.app\.tar\.gz$/i.test(a.name) && !/\.sig$/i.test(a.name))?.url ??
      names.find((a) => /aarch64.*\.tar\.gz$/i.test(a.name) && !/\.sig$/i.test(a.name))?.url
    )
  }
  return names[0]?.url
}

type LatestJson = {
  version?: string
  notes?: string
  platforms?: Record<string, { url?: string; signature?: string }>
}

/** Successful probe: null = already on latest; otherwise hint and/or plugin Update. */
type ProbeOk = { hint: MirrorHint | null; update?: Update }

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

function manifestToHint(data: LatestJson, mirrorPrefix: string): MirrorHint | null {
  if (!data?.version) throw new Error("invalid manifest")
  const version = String(data.version).replace(/^v/, "")
  if (!isNewer(version, __APP_VERSION__)) return null

  const os = detectOs()
  const platformKey =
    os === "windows" ? "windows-x86_64" : os === "macos" ? "darwin-aarch64" : ""
  const platform = platformKey ? data.platforms?.[platformKey] : undefined
  // No signed updater package for this OS → not an in-app-installable update.
  if (!platform?.url || !platform.signature) return null

  return attachDownloads(version, data.notes, platform.url, mirrorPrefix)
}

function apiToHint(
  data: {
    tag_name?: string
    body?: string
    html_url?: string
    assets?: { name?: string; browser_download_url?: string }[]
  },
  mirrorPrefix: string,
): MirrorHint | null {
  const tag = String(data.tag_name || "").replace(/^v/, "")
  if (!tag) throw new Error("invalid api payload")
  if (!isNewer(tag, __APP_VERSION__)) return null
  // Only surface updates when a real updater artifact exists (not .dmg alone).
  const asset = pickAssetUrl(data.assets ?? [])
  if (!asset) return null
  return attachDownloads(tag, data.body, asset, mirrorPrefix)
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
    return new Error("无法完成更新检查（网络受限）。请稍后重试「检查更新」。")
  }
  return err instanceof Error ? err : new Error(raw)
}

function clearCachedUpdate() {
  if (!cached) {
    cachedDownloadUrls = []
    return
  }
  const prev = cached
  cached = null
  cachedDownloadUrls = []
  void prev.close().catch(() => {
    /* ignore */
  })
}

async function bindPluginUpdate(): Promise<Update | null> {
  const first = await check({ timeout: INSTALL_BIND_TIMEOUT_MS }).catch(() => null)
  if (first && isNewer(first.version, __APP_VERSION__)) return first
  if (first) {
    void first.close().catch(() => {
      /* ignore */
    })
  }
  await new Promise((r) => window.setTimeout(r, 400))
  const second = await check({ timeout: INSTALL_BIND_RETRY_MS }).catch(() => null)
  if (second && isNewer(second.version, __APP_VERSION__)) return second
  if (second) {
    void second.close().catch(() => {
      /* ignore */
    })
  }
  return null
}

function resolveDownloadUrls(update: Update, hint: MirrorHint | null): string[] {
  const fromHint =
    hint?.downloadUrls &&
    hint.downloadUrls.length > 0 &&
    hint.downloadUrls[0] !== RELEASES_URL
      ? hint.downloadUrls
      : null
  if (fromHint) return fromHint
  const fromPlugin = artifactUrlsFromUpdate(update)
  if (fromPlugin.length) return fromPlugin
  return hint?.downloadUrls?.length ? hint.downloadUrls : []
}

type ManifestProbe = { url: string; mirrorPrefix: string }

/**
 * Concurrent update check: official updater + latest.json mirrors + GitHub API
 * mirrors all fire at once; the first successful answer wins.
 *
 * Only returns an available update when a plugin `Update` is bound (silent
 * install is possible). Mirror-only discoveries re-bind the plugin; bind
 * failure is treated as a failed check — never a half-state UI.
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
      if (!update) return { hint: null }
      const downloadUrls = artifactUrlsFromUpdate(update)
      const urls = downloadUrls.length ? downloadUrls : []
      return {
        hint: {
          version: update.version,
          body: update.body,
          downloadUrl: urls[0],
          downloadUrls: urls,
          sourceLabel: "updater",
        },
        update,
      }
    },
    ...manifestProbes.map(
      ({ url, mirrorPrefix }) =>
        async (signal: AbortSignal) => {
          const data = (await fetchJson(url, timeoutSignal(PROBE_TIMEOUT_MS, signal))) as LatestJson
          return { hint: manifestToHint(data, mirrorPrefix) }
        },
    ),
    ...apiProbes.map(
      ({ url, mirrorPrefix }) =>
        async (signal: AbortSignal) => {
          const data = (await fetchJson(url, timeoutSignal(PROBE_TIMEOUT_MS, signal))) as Parameters<
            typeof apiToHint
          >[0]
          return { hint: apiToHint(data, mirrorPrefix) }
        },
    ),
  ]

  try {
    const { hint, update } = await raceProbes(probes)

    if (update) {
      const downloadUrls = resolveDownloadUrls(update, hint)
      if (!downloadUrls.length) {
        // Still installable via plugin's announced URL; Rust will append it.
        cached = update
        cachedDownloadUrls = []
        return toInfo(update, {
          downloadUrl: RELEASES_URL,
          downloadUrls: [],
          sourceLabel: hint?.sourceLabel ?? "updater",
        })
      }
      cached = update
      cachedDownloadUrls = downloadUrls
      return toInfo(update, {
        downloadUrl: downloadUrls[0],
        downloadUrls,
        sourceLabel: hint?.sourceLabel ?? "updater",
      })
    }

    // Already on latest (every probe that succeeded said so).
    if (!hint) return null

    // Mirror found a newer version — must bind plugin Update before surfacing.
    const pluginUpdate = await bindPluginUpdate()
    if (!pluginUpdate) {
      throw new Error(
        "发现新版本，但当前平台缺少可用的应用内更新包（需签名的 updater 产物）。请稍后重试或从 Releases 手动安装。",
      )
    }

    const downloadUrls = resolveDownloadUrls(pluginUpdate, hint)
    cached = pluginUpdate
    cachedDownloadUrls = downloadUrls
    const info = toInfo(pluginUpdate, {
      downloadUrl: downloadUrls[0] ?? hint.downloadUrl ?? RELEASES_URL,
      downloadUrls,
      sourceLabel: hint.sourceLabel,
    })
    if (!info.body && hint.body) return { ...info, body: hint.body }
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
      onProgress?.({
        downloaded: 0,
        total,
        percent: total && total > 0 ? 0 : null,
      })
      return
    }
    if (event.event === "Progress") {
      downloaded += event.data.chunkLength
    } else if (event.event === "Finished") {
      if (total != null) downloaded = total
      // Signal install phase to callers (download done, applying update).
      onProgress?.({
        downloaded,
        total,
        percent: total && total > 0 ? 100 : null,
        phase: "installing",
      })
      return
    }
    onProgress?.({
      downloaded,
      total,
      percent: total && total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : null,
      phase: "downloading",
    })
  }
}

/**
 * Prefer check-winner URLs, then race remaining mirrors. Falls back to plugin
 * downloadAndInstall if the race path fails. Only reports failure after every
 * mirror (and fallback) loses.
 */
export async function installAppUpdate(
  onProgress?: (p: DownloadProgress) => void,
  preferredUrls?: string[],
): Promise<void> {
  if (!isTauri()) throw new Error("Updater is only available in the desktop app")
  const update =
    cached ?? (await check({ timeout: INSTALL_BIND_TIMEOUT_MS }).catch(() => null))
  if (!update) {
    throw new Error("无法完成应用内安装。请稍后重试「检查更新」。")
  }
  cached = update
  onProgress?.({ downloaded: 0, total: null, percent: null, phase: "downloading" })

  const fromPreferred =
    preferredUrls && preferredUrls.length > 0
      ? preferredUrls
      : cachedDownloadUrls.length
        ? cachedDownloadUrls
        : artifactUrlsFromUpdate(update)
  // Ensure plugin announced URL is present (Rust also appends it).
  const urls = [...fromPreferred]

  let installing = false
  const unlistenProgress = await listen<DownloadProgress>("update-download-progress", (event) => {
    if (event.payload.phase === "installing") installing = true
    onProgress?.(event.payload)
  })
  const unlistenInstall = await listen("update-about-to-install", () => {
    installing = true
    onProgress?.({
      downloaded: 0,
      total: null,
      percent: 100,
      phase: "installing",
    })
  })

  try {
    try {
      await invoke("race_download_and_install", { urls })
    } catch (raceErr) {
      // Windows quiet-install calls process::exit after launching NSIS — IPC drops.
      if (installing) return
      // Fallback: plugin path (sequential endpoints / announced GitHub URL).
      try {
        await update.downloadAndInstall(progressFromEvents(onProgress))
      } catch (pluginErr) {
        throw friendlyNetworkError(pluginErr ?? raceErr)
      }
    }
  } finally {
    unlistenProgress()
    unlistenInstall()
  }

  // Windows quiet install exits the process before this; macOS/Linux need relaunch.
  await relaunch()
}
