import { createSourceRegistry } from "./sourceRegistry";
import { SourceWorkerHost } from "./sources/sourceWorkerHost";
import { t } from "@/lib/i18n";
import { qualityCandidates, qualityUpgradeCandidates } from "@/lib/quality";
import { toLxMusicInfo } from "@/lib/lxMusicInfo";
import { looksLikeRealAudio } from "@/lib/audioUrlProbe";
import { createAsyncCache } from "@/lib/cache";
import { getWyBuiltinMusicUrl } from "@/lib/playlists/wyUrl";
import type { SourceScript, SourceRegistry, LxRequestPayload } from "@/types/source";
import type { LyricInfo, MusicInfo, Quality } from "@/types/music";

/** Parallel musicUrl probes per wave — higher so 10–20 sources don't serialize. */
const MUSIC_URL_WAVE = 12;
/** Per-source musicUrl attempt timeout (scripts without their own timeout can hang). */
const MUSIC_URL_ATTEMPT_MS = 5_000;
/** Successful play URLs are reusable briefly (CDN links expire; keep TTL short). */
const musicUrlCache = createAsyncCache<string>(4 * 60_000, 80);
const picCache = createAsyncCache<string | null>(30 * 60_000, 80);

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** First fulfilled promise wins (Promise.any without requiring ES2021 lib). */
function raceFirst<T>(promises: Promise<T>[]): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (!promises.length) {
      reject(new Error("raceFirst: empty"));
      return;
    }
    let settled = false;
    let pending = promises.length;
    const errors: unknown[] = [];
    for (const p of promises) {
      p.then(
        (v) => {
          if (settled) return;
          settled = true;
          resolve(v);
        },
        (err) => {
          if (settled) return;
          errors.push(err);
          pending -= 1;
          if (pending === 0) {
            settled = true;
            reject(
              errors[0] instanceof Error
                ? errors[0]
                : new Error(String(errors[0])),
            );
          }
        },
      );
    }
  });
}

export class SourceRunner {
  constructor(private readonly registry: SourceRegistry) {}

  setScripts(scripts: SourceScript[]): void {
    this.registry.setScripts(scripts);
  }

  // Multiple enabled sources can be loaded simultaneously; musicUrl races them
  // in small waves and takes the first valid full-track URL. Keyed by script id.
  private sessions = new Map<string, SourceWorkerHost>();

  async loadScript(
    script: SourceScript,
  ): Promise<Record<string, unknown> | undefined> {
    this.unloadScript(script.id);
    const host = new SourceWorkerHost();
    try {
      const sources = await host.start(script);
      this.sessions.set(script.id, host);
      return sources;
    } catch (err) {
      host.terminate();
      throw err;
    }
  }

  unloadScript(id: string): void {
    this.sessions.get(id)?.terminate();
    this.sessions.delete(id);
  }

  isLoaded(id: string): boolean {
    return this.sessions.has(id);
  }

  isReady(): boolean {
    return this.sessions.size > 0;
  }

  /**
   * Ask one script for a play URL. Does not race other sources or write the
   * playback cache — used by the Sources “test all” health check.
   */
  async probeMusicUrl(scriptId: string, payload: LxRequestPayload): Promise<boolean> {
    const session = this.sessions.get(scriptId);
    if (!session) return false;
    const quality = (payload.type ?? "128k") as Quality;
    const request = this.buildRequest("musicUrl", payload);
    try {
      const url = await withTimeout(
        (async () => {
          const result = await session.invoke(request);
          if (typeof result === "string" && result.startsWith("http")) {
            if (await looksLikeRealAudio(result, payload.info, quality)) {
              return result;
            }
          }
          return null;
        })(),
        MUSIC_URL_ATTEMPT_MS,
        `probe:${scriptId}`,
      );
      return Boolean(url);
    } catch {
      return false;
    }
  }

  // Enabled+loaded sources in UI list order (used for lyric/pic failover and
  // as the musicUrl race participant set).
  private getOrderedIds(): string[] {
    return this.registry
      .getScripts()
      .filter((s) => s.enabled && this.sessions.has(s.id))
      .map((s) => s.id);
  }

  /** Enabled, loaded source ids in list order — changes when the user edits sources. */
  layoutKey(): string {
    return this.getOrderedIds().join("|");
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
    };
  }

  private musicUrlKey(payload: LxRequestPayload): string {
    const q = payload.type ?? "128k";
    return `${payload.source}:${payload.info.meta.songId}:${q}`;
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
    const request = this.buildRequest("musicUrl", payload);

    type Outcome = { ok: true; url: string } | { ok: false };

    return new Promise((resolve, reject) => {
      let settled = false;
      let remaining = ids.length;
      if (!remaining) {
        reject(new Error(t("sources.err.allFailed")));
        return;
      }

      const tryOne = async (id: string): Promise<Outcome> => {
        if (settled) return { ok: false };
        const session = this.sessions.get(id);
        if (!session) return { ok: false };
        try {
          const url = await withTimeout(
            (async () => {
              const result = await session.invoke(request);
              if (settled) return null;
              if (typeof result === "string" && result.startsWith("http")) {
                if (
                  await looksLikeRealAudio(
                    result,
                    payload.info,
                    quality,
                    () => settled,
                  )
                ) {
                  return result;
                }
              }
              return null;
            })(),
            MUSIC_URL_ATTEMPT_MS,
            `musicUrl:${id}`,
          );
          if (settled) return { ok: false };
          if (url) return { ok: true, url };
        } catch {
          /* counted as failure below */
        }
        return { ok: false };
      };

      for (const id of ids) {
        void tryOne(id).then((outcome) => {
          if (settled) return;
          if (outcome.ok) {
            settled = true;
            resolve(outcome.url);
            return;
          }
          remaining -= 1;
          if (remaining === 0) {
            settled = true;
            reject(new Error(t("sources.err.allFailed")));
          }
        });
      }
    });
  }

  /**
   * Resolve a playback URL: wave-race enabled sources (cap concurrency), with a
   * short TTL cache so replay / quality retries don't re-hit every script.
   */
  async getMusicUrl(payload: LxRequestPayload): Promise<string> {
    const ids = this.getOrderedIds();
    if (!ids.length) throw new Error(t("sources.err.noEnabled"));

    const quality = (payload.type ?? "128k") as Quality;
    const key = this.musicUrlKey(payload);

    return musicUrlCache(key, async () => {
      let lastErr: unknown;
      for (let i = 0; i < ids.length; i += MUSIC_URL_WAVE) {
        const wave = ids.slice(i, i + MUSIC_URL_WAVE);
        try {
          return await this.raceMusicUrlWave(wave, payload, quality);
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr instanceof Error
        ? lastErr
        : new Error(t("sources.err.allFailed"));
    });
  }

  // Resolve a playback URL starting at `preferred`, stepping down the quality
  // ladder until a source returns a usable URL. Returns the quality that
  // actually worked so callers can show / notify when it was downgraded.
  //
  // NetEase (`wy`): race the built-in public URL API in parallel with imported
  // sources on the first quality step so a slow/broken script list can't leave
  // the player stuck on loading for tens of seconds.
  async getMusicUrlAdaptive(
    song: MusicInfo,
    preferred: Quality,
    opts?: { betterThan?: Quality },
  ): Promise<{ url: string; quality: Quality }> {
    const candidates = opts?.betterThan
      ? qualityUpgradeCandidates(preferred, opts.betterThan)
      : qualityCandidates(preferred);
    if (!candidates.length) {
      throw new Error("no higher quality to try");
    }
    let lastErr: unknown;

    const tryBuiltin = async (quality: Quality): Promise<string> => {
      return withTimeout(
        (async () => {
          const url = await getWyBuiltinMusicUrl(song.meta.songId, quality);
          if (!(await looksLikeRealAudio(url, song, quality))) {
            throw new Error("NetEase builtin URL failed audio probe");
          }
          return url;
        })(),
        MUSIC_URL_ATTEMPT_MS,
        "musicUrl:wy-builtin",
      );
    };

    for (let i = 0; i < candidates.length; i++) {
      const quality = candidates[i];
      const fromSources = this.getMusicUrl({
        source: song.source,
        action: "musicUrl",
        info: song,
        type: quality,
      });

      if (song.source === "wy") {
        // First quality: race builtin vs sources. Later qualities: sources first,
        // then builtin (avoids hammering the official API on every step).
        if (i === 0) {
          try {
            return await raceFirst([
              fromSources.then((url) => ({ url, quality })),
              tryBuiltin(quality).then((url) => ({ url, quality })),
            ]);
          } catch (err) {
            lastErr = err;
            continue;
          }
        }
        try {
          const url = await fromSources;
          return { url, quality };
        } catch (err) {
          lastErr = err;
          try {
            const url = await tryBuiltin(quality);
            return { url, quality };
          } catch (e2) {
            lastErr = e2;
          }
        }
        continue;
      }

      try {
        const url = await fromSources;
        return { url, quality };
      } catch (err) {
        lastErr = err;
      }
    }

    throw lastErr instanceof Error
      ? lastErr
      : new Error(t("sources.err.noEnabled"));
  }

  async getLyric(payload: LxRequestPayload): Promise<LyricInfo | null> {
    for (const id of this.getOrderedIds()) {
      const session = this.sessions.get(id);
      if (!session) continue;
      try {
        const result = await session.invoke(this.buildRequest("lyric", payload));
        if (result && typeof result === "object" && "lyric" in result)
          return result as LyricInfo;
      } catch {
        // try next source
      }
    }
    return null;
  }

  async getPic(payload: LxRequestPayload): Promise<string | null> {
    const key = `${payload.source}:${payload.info.meta.songId}`;
    return picCache(key, async () => {
      for (const id of this.getOrderedIds()) {
        const session = this.sessions.get(id);
        if (!session) continue;
        try {
          const result = await session.invoke(this.buildRequest("pic", payload));
          if (typeof result === "string" && result.startsWith("http"))
            return result;
        } catch {
          // try next source
        }
      }
      return null;
    });
  }
}

export function createSourceRunner(registry: SourceRegistry): SourceRunner {
  return new SourceRunner(registry);
}

export const sourceRunner = createSourceRunner(createSourceRegistry());
