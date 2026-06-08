import { createLxApi, parseScriptMeta } from "./lxApi";
import { useSourceStore } from "@/stores/sourceStore";
import { t } from "@/lib/i18n";
import { qualityCandidates } from "@/lib/quality";
import type {
  SourceScript,
  LxRequestPayload,
  LxRequestResult,
} from "@/types/source";
import type { LyricInfo, MusicInfo, Quality } from "@/types/music";

// lx-music source scripts expect a FLAT musicInfo object with the song id at the
// top level as `songmid` (see lx-music-desktop kw/index.js: `musicInfo.songmid`),
// plus `types`/`_types` and per-source id fields. Our internal MusicInfo nests
// those under `meta`, so flatten before handing the object to a script — otherwise
// the script reads `undefined` and builds URLs like `.../url/kw/undefined/128k`.
function toLxMusicInfo(m: MusicInfo): Record<string, unknown> {
  return {
    name: m.name,
    singer: m.singer,
    source: m.source,
    songmid: m.meta.songId,
    albumId: m.meta.albumId ?? "",
    albumName: m.albumName,
    interval: m.interval,
    img: m.meta.picUrl ?? null,
    lrc: null,
    otherSource: null,
    types: m.meta.qualitys,
    _types: m.meta._qualitys,
    typeUrl: {},
    // per-source id fields (only the relevant one is populated)
    hash: m.meta.hash,
    strMediaMid: m.meta.strMediaMid,
    copyrightId: m.meta.copyrightId,
  };
}

type LxHandler = (payload: unknown) => Promise<LxRequestResult>;

class SourceRunner {
  // Multiple enabled sources can be loaded simultaneously; on each request we try
  // them in order (failover) until one returns a valid result. Keyed by script id.
  private handlers = new Map<string, LxHandler>();

  async loadScript(script: SourceScript): Promise<Record<string, unknown> | undefined> {
    // Reloading the same script: drop its previous handler first.
    this.handlers.delete(script.id);

    const meta = parseScriptMeta(script.rawScript);

    let initedResolved = false;
    let capturedHandler: LxHandler | null = null;
    // Captured so importScript can attach `sources` to a brand-new script that
    // isn't in the store yet when `inited` fires (setScriptSources would no-op).
    let capturedSources: Record<string, unknown> | undefined;
    let resolveInited: () => void = () => {};
    const initedPromise = new Promise<void>((resolve) => {
      resolveInited = () => {
        initedResolved = true;
        resolve();
      };
    });

    const lx = createLxApi({
      scriptInfo: { ...meta, rawScript: script.rawScript },
      onRequestRegister: (handler) => {
        capturedHandler = handler as LxHandler;
      },
      onInited: (data) => {
        if (data && typeof data === "object" && "sources" in data) {
          capturedSources = data.sources as Record<string, unknown>;
          useSourceStore.getState().setScriptSources(script.id, capturedSources);
        }
        resolveInited();
      },
      onUpdateAlert: () => {},
    });

    (globalThis as unknown as Record<string, unknown>).lx = lx;

    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function(script.rawScript);
      fn();
    } catch (err) {
      throw new Error(`Script execution failed: ${(err as Error).message}`);
    }

    // Wait for lx.send('inited') — 10s to allow for slow init HTTP requests
    const timeout = new Promise<void>((_, reject) =>
      setTimeout(() => {
        if (!initedResolved)
          reject(new Error("Script did not call lx.send('inited') within 10s"));
      }, 10000),
    );

    await Promise.race([initedPromise, timeout]);

    if (!capturedHandler)
      throw new Error("Script did not register a request handler");
    this.handlers.set(script.id, capturedHandler);
    return capturedSources;
  }

  unloadScript(id: string): void {
    this.handlers.delete(id);
  }

  isLoaded(id: string): boolean {
    return this.handlers.has(id);
  }

  isReady(): boolean {
    return this.handlers.size > 0;
  }

  // Order to try sources: the enabled+loaded sources in list order (top-to-bottom
  // in the UI). Earlier entries are tried first. Reads the source store lazily
  // (inside the method) to avoid a circular import at module-eval time.
  private getOrderedIds(): string[] {
    const { scripts } = useSourceStore.getState();
    return scripts
      .filter((s) => s.enabled && this.handlers.has(s.id))
      .map((s) => s.id);
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

  // Try each enabled source in turn; return the first valid URL. Throws an
  // aggregated error only if every source fails.
  async getMusicUrl(payload: LxRequestPayload): Promise<string> {
    const ids = this.getOrderedIds();
    if (!ids.length) throw new Error(t("sources.err.noEnabled"));

    const { scripts } = useSourceStore.getState();
    const nameOf = (id: string) => scripts.find((s) => s.id === id)?.name ?? id;
    const errors: string[] = [];

    for (const id of ids) {
      const handler = this.handlers.get(id);
      if (!handler) continue;
      try {
        const result = await handler(this.buildRequest("musicUrl", payload));
        if (typeof result === "string" && result.startsWith("http"))
          return result;
        errors.push(t("sources.err.invalidUrl", { name: nameOf(id) }));
      } catch (err) {
        errors.push(
          t("sources.err.sourceMsg", {
            name: nameOf(id),
            msg: (err as Error).message,
          }),
        );
      }
    }
    throw new Error(t("sources.err.allFailed", { errors: errors.join("；") }));
  }

  // Resolve a playback URL starting at `preferred`, stepping down the quality
  // ladder until a source returns a usable URL. Returns the quality that
  // actually worked so callers can show / notify when it was downgraded.
  async getMusicUrlAdaptive(
    song: MusicInfo,
    preferred: Quality,
  ): Promise<{ url: string; quality: Quality }> {
    const candidates = qualityCandidates(preferred);
    let lastErr: unknown;
    for (const quality of candidates) {
      try {
        const url = await this.getMusicUrl({
          source: song.source,
          action: "musicUrl",
          info: song,
          type: quality,
        });
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
      const handler = this.handlers.get(id);
      if (!handler) continue;
      try {
        const result = await handler(this.buildRequest("lyric", payload));
        if (result && typeof result === "object" && "lyric" in result)
          return result as LyricInfo;
      } catch {
        // try next source
      }
    }
    return null;
  }

  async getPic(payload: LxRequestPayload): Promise<string | null> {
    for (const id of this.getOrderedIds()) {
      const handler = this.handlers.get(id);
      if (!handler) continue;
      try {
        const result = await handler(this.buildRequest("pic", payload));
        if (typeof result === "string" && result.startsWith("http"))
          return result;
      } catch {
        // try next source
      }
    }
    return null;
  }
}

export const sourceRunner = new SourceRunner();
