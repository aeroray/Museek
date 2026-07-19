import { createLxApi, parseScriptMeta } from "./lxApi"
import { t } from "@/lib/i18n"
import { qualityCandidates } from "@/lib/quality"
import { toLxMusicInfo } from "@/lib/lxMusicInfo"
import { looksLikeRealAudio } from "@/lib/audioUrlProbe"
import { createAsyncCache } from "@/lib/cache"
import { getWyBuiltinMusicUrl } from "@/lib/playlists/wyUrl"
import type {
  SourceScript,
  LxRequestPayload,
  LxRequestResult,
} from "@/types/source"
import type { LyricInfo, MusicInfo, Quality } from "@/types/music"

type LxHandler = (payload: unknown) => Promise<LxRequestResult>

/** Cap parallel musicUrl probes so many enabled sources don't stampede CDNs. */
const MUSIC_URL_WAVE = 3
/** Successful play URLs are reusable briefly (CDN links expire; keep TTL short). */
const musicUrlCache = createAsyncCache<string>(4 * 60_000, 80)
const picCache = createAsyncCache<string | null>(30 * 60_000, 80)

/**
 * Injected by sourceStore so this module never imports the store (breaks the
 * sourceStore ↔ sourceRunner cycle).
 */
export type SourceRegistry = {
  getScripts: () => SourceScript[]
  setScriptSources: (id: string, sources: Record<string, unknown>) => void
}

let registry: SourceRegistry = {
  getScripts: () => [],
  setScriptSources: () => {},
}

export function bindSourceRegistry(r: SourceRegistry): void {
  registry = r
}

class SourceRunner {
  // Multiple enabled sources can be loaded simultaneously; musicUrl races them
  // in small waves and takes the first valid full-track URL. Keyed by script id.
  private handlers = new Map<string, LxHandler>()

  async loadScript(script: SourceScript): Promise<Record<string, unknown> | undefined> {
    // Reloading the same script: drop its previous handler first.
    this.handlers.delete(script.id)

    const meta = parseScriptMeta(script.rawScript)

    let initedResolved = false
    let capturedHandler: LxHandler | null = null
    // Captured so importScript can attach `sources` to a brand-new script that
    // isn't in the store yet when `inited` fires (setScriptSources would no-op).
    let capturedSources: Record<string, unknown> | undefined
    let resolveInited: () => void = () => {}
    const initedPromise = new Promise<void>((resolve) => {
      resolveInited = () => {
        initedResolved = true
        resolve()
      }
    })

    const lx = createLxApi({
      scriptInfo: { ...meta, rawScript: script.rawScript },
      onRequestRegister: (handler) => {
        capturedHandler = handler as LxHandler
      },
      onInited: (data) => {
        if (data && typeof data === "object" && "sources" in data) {
          capturedSources = data.sources as Record<string, unknown>
          registry.setScriptSources(script.id, capturedSources)
        }
        resolveInited()
      },
      onUpdateAlert: () => {},
    })

    ;(globalThis as unknown as Record<string, unknown>).lx = lx

    // Scripts often throw inside async init (.catch → throw) which becomes an
    // unhandled rejection — capture it so import shows the real reason.
    let asyncInitError: Error | null = null
    const onUnhandled = (ev: PromiseRejectionEvent) => {
      const reason = ev.reason
      asyncInitError = reason instanceof Error ? reason : new Error(String(reason ?? "init failed"))
      ev.preventDefault?.()
    }
    if (typeof window !== "undefined") {
      window.addEventListener("unhandledrejection", onUnhandled)
    }

    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function(script.rawScript)
      fn()
    } catch (err) {
      if (typeof window !== "undefined") {
        window.removeEventListener("unhandledrejection", onUnhandled)
      }
      throw new Error(`Script execution failed: ${(err as Error).message}`)
    }

    // Wait for lx.send('inited') — 10s to allow for slow init HTTP requests
    const timeout = new Promise<void>((_, reject) =>
      setTimeout(() => {
        if (!initedResolved) {
          reject(
            new Error(
              asyncInitError?.message ||
                "Script did not call lx.send('inited') within 10s (init API may be blocked)"
            )
          )
        }
      }, 10000)
    )

    try {
      await Promise.race([initedPromise, timeout])
    } catch (err) {
      if (asyncInitError) throw asyncInitError
      throw err
    } finally {
      if (typeof window !== "undefined") {
        window.removeEventListener("unhandledrejection", onUnhandled)
      }
    }

    if (!capturedHandler)
      throw new Error("Script did not register a request handler")
    this.handlers.set(script.id, capturedHandler)
    return capturedSources
  }

  unloadScript(id: string): void {
    this.handlers.delete(id)
  }

  isLoaded(id: string): boolean {
    return this.handlers.has(id)
  }

  isReady(): boolean {
    return this.handlers.size > 0
  }

  // Enabled+loaded sources in UI list order (used for lyric/pic failover and
  // as the musicUrl race participant set).
  private getOrderedIds(): string[] {
    return registry
      .getScripts()
      .filter((s) => s.enabled && this.handlers.has(s.id))
      .map((s) => s.id)
  }

  private buildRequest(
    action: "musicUrl" | "lyric" | "pic",
    payload: LxRequestPayload,
  ) {
    return {
      source: payload.source,
      action,
      info: {
        type: payload.type ?? "128k",
        musicInfo: toLxMusicInfo(payload.info),
      },
    }
  }

  private musicUrlKey(payload: LxRequestPayload): string {
    const q = payload.type ?? "128k"
    return `${payload.source}:${payload.info.meta.songId}:${q}`
  }

  /**
   * Race a wave of sources; first URL that passes the real-audio probe wins.
   * After a winner, remaining probes in the wave are cancelled (no more HEAD/Range).
   */
  private raceMusicUrlWave(
    ids: string[],
    payload: LxRequestPayload,
    quality: Quality,
  ): Promise<string> {
    const request = this.buildRequest("musicUrl", payload)

    type Outcome = { ok: true; url: string } | { ok: false }

    return new Promise((resolve, reject) => {
      let settled = false
      let remaining = ids.length
      if (!remaining) {
        reject(new Error(t("sources.err.allFailed")))
        return
      }

      const tryOne = async (id: string): Promise<Outcome> => {
        if (settled) return { ok: false }
        const handler = this.handlers.get(id)
        if (!handler) return { ok: false }
        try {
          const result = await handler(request)
          if (settled) return { ok: false }
          if (typeof result === "string" && result.startsWith("http")) {
            if (
              await looksLikeRealAudio(result, payload.info, quality, () => settled)
            ) {
              if (settled) return { ok: false }
              return { ok: true, url: result }
            }
          }
        } catch {
          /* counted as failure below */
        }
        return { ok: false }
      }

      for (const id of ids) {
        void tryOne(id).then((outcome) => {
          if (settled) return
          if (outcome.ok) {
            settled = true
            resolve(outcome.url)
            return
          }
          remaining -= 1
          if (remaining === 0) {
            settled = true
            reject(new Error(t("sources.err.allFailed")))
          }
        })
      }
    })
  }

  /**
   * Resolve a playback URL: wave-race enabled sources (cap concurrency), with a
   * short TTL cache so replay / quality retries don't re-hit every script.
   */
  async getMusicUrl(payload: LxRequestPayload): Promise<string> {
    const ids = this.getOrderedIds()
    if (!ids.length) throw new Error(t("sources.err.noEnabled"))

    const quality = (payload.type ?? "128k") as Quality
    const key = this.musicUrlKey(payload)

    return musicUrlCache(key, async () => {
      let lastErr: unknown
      for (let i = 0; i < ids.length; i += MUSIC_URL_WAVE) {
        const wave = ids.slice(i, i + MUSIC_URL_WAVE)
        try {
          return await this.raceMusicUrlWave(wave, payload, quality)
        } catch (err) {
          lastErr = err
        }
      }
      throw lastErr instanceof Error
        ? lastErr
        : new Error(t("sources.err.allFailed"))
    })
  }

  // Resolve a playback URL starting at `preferred`, stepping down the quality
  // ladder until a source returns a usable URL. Returns the quality that
  // actually worked so callers can show / notify when it was downgraded.
  // For NetEase (`wy`), fall back to the built-in public URL API when every
  // imported script fails or returns a non-audio body.
  async getMusicUrlAdaptive(
    song: MusicInfo,
    preferred: Quality,
  ): Promise<{ url: string; quality: Quality }> {
    const candidates = qualityCandidates(preferred)
    let lastErr: unknown
    for (const quality of candidates) {
      try {
        const url = await this.getMusicUrl({
          source: song.source,
          action: "musicUrl",
          info: song,
          type: quality,
        })
        return { url, quality }
      } catch (err) {
        lastErr = err
      }
    }

    if (song.source === "wy") {
      for (const quality of candidates) {
        try {
          const url = await getWyBuiltinMusicUrl(song.meta.songId, quality)
          if (await looksLikeRealAudio(url, song, quality)) {
            return { url, quality }
          }
        } catch (err) {
          lastErr = err
        }
      }
    }

    throw lastErr instanceof Error
      ? lastErr
      : new Error(t("sources.err.noEnabled"))
  }

  async getLyric(payload: LxRequestPayload): Promise<LyricInfo | null> {
    for (const id of this.getOrderedIds()) {
      const handler = this.handlers.get(id)
      if (!handler) continue
      try {
        const result = await handler(this.buildRequest("lyric", payload))
        if (result && typeof result === "object" && "lyric" in result)
          return result as LyricInfo
      } catch {
        // try next source
      }
    }
    return null
  }

  async getPic(payload: LxRequestPayload): Promise<string | null> {
    const key = `${payload.source}:${payload.info.meta.songId}`
    return picCache(key, async () => {
      for (const id of this.getOrderedIds()) {
        const handler = this.handlers.get(id)
        if (!handler) continue
        try {
          const result = await handler(this.buildRequest("pic", payload))
          if (typeof result === "string" && result.startsWith("http"))
            return result
        } catch {
          // try next source
        }
      }
      return null
    })
  }
}

export const sourceRunner = new SourceRunner()
