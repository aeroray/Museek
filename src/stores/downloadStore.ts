import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { cdnFetchStrategies, cdnHeadersForUrl } from "@/lib/cdnHeaders";
import { hiResCover } from "@/lib/cover";
import { httpFetch as tauriFetch } from "@/lib/http";
import { writeFile, remove, exists } from "@tauri-apps/plugin-fs";
import type { MusicInfo, Quality } from "@/types/music";
import { resolveAdaptiveUrl } from "@/lib/playback";
import { notify, promptDownloadLocation } from "@/lib/notify";
import { useSettingsStore, type NamingScheme } from "@/stores/settingsStore";
import { readData, writeData } from "@/lib/db";
import { t } from "@/lib/i18n";
import { loadLyricInfo } from "@/lib/lyric/loadLyric";
import { sourceRunner } from "@/lib/sourceRunner";
import { maybeGunzipAudio, suggestedDownloadExtension } from "@/lib/audioBytes";

export type DownloadStatus = "waiting" | "downloading" | "completed" | "error";

export interface DownloadTask {
  id: string;
  song: MusicInfo;
  quality: Quality;
  embedLyrics: boolean;
  embedCover: boolean;
  status: DownloadStatus;
  progress: number;
  error?: string;
  /** Absolute path written on disk when completed (used if delete-with-task is on). */
  filePath?: string;
}

interface DownloadState {
  tasks: DownloadTask[];
  addTask: (song: MusicInfo, quality?: Quality) => void;
  removeTask: (id: string) => void;
  removeTasks: (ids: string[]) => void;
  clearCompleted: () => void;
  startTask: (id: string) => Promise<void>;
  updateProgress: (id: string, progress: number) => void;
  updateStatus: (id: string, status: DownloadStatus, error?: string) => void;
  // Start queued tasks up to the configured concurrency limit.
  _pump: () => void;
  /** Device-local history (not synced). Restores queue across restarts. */
  loadFromDisk: () => Promise<void>;
}

type DownloadTaskSnapshot = Omit<DownloadTask, "embedLyrics" | "embedCover"> & {
  embedLyrics?: boolean;
  embedCover?: boolean;
};

const STORE_FILE = "downloads.json";
const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const STATUSES: DownloadStatus[] = [
  "waiting",
  "downloading",
  "completed",
  "error",
];
const QUALITIES: Quality[] = ["128k", "320k", "flac", "flac24bit"];

function sanitize(s: string): string {
  return s.replace(/[/\\:*?"<>|]/g, "_").trim();
}

function buildFilename(
  song: MusicInfo,
  scheme: NamingScheme,
  ext: string,
): string {
  const name = sanitize(song.name);
  const singer = sanitize(song.singer);
  let base: string;
  switch (scheme) {
    case "name-singer":
      base = singer ? `${name} - ${singer}` : name;
      break;
    case "name":
      base = name;
      break;
    case "singer-name":
    default:
      base = singer ? `${singer} - ${name}` : name;
  }
  return `${base || "audio"}.${ext}`;
}

type DownloadCover = { bytes: Uint8Array };

const MAX_DOWNLOAD_COVER_BYTES = 10 * 1024 * 1024;

function startsWithBytes(bytes: Uint8Array, prefix: number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value);
}

function detectCoverMimeType(bytes: Uint8Array): string | null {
  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return "image/png";
  return null;
}

async function fetchCoverBytes(url: string): Promise<Uint8Array | null> {
  for (const headers of cdnFetchStrategies(url)) {
    try {
      const res = await tauriFetch(url, {
        method: "GET",
        headers: {
          ...headers,
          Accept: "image/jpeg,image/png,image/*;q=0.8,*/*;q=0.5",
        },
      });
      if (!res.ok) continue;
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (!bytes.length || bytes.byteLength > MAX_DOWNLOAD_COVER_BYTES) continue;
      if (!detectCoverMimeType(bytes)) continue;
      return bytes;
    } catch {
      /* try the next header strategy */
    }
  }
  return null;
}

function coverUrlCandidates(...urls: Array<string | null | undefined>): string[] {
  const unique: string[] = [];
  for (const url of urls) {
    if (
      typeof url === "string" &&
      /^https?:\/\//i.test(url) &&
      !unique.includes(url)
    ) {
      unique.push(url);
    }
  }
  return unique;
}

async function fetchCoverFromUrls(
  urls: string[],
): Promise<DownloadCover | null> {
  for (const url of urls) {
    const bytes = await fetchCoverBytes(url);
    if (bytes) return { bytes };
  }
  return null;
}

async function fetchDownloadCover(
  song: MusicInfo,
): Promise<DownloadCover | null> {
  const picUrl = song.meta.picUrl || null;
  const fromMeta = await fetchCoverFromUrls(
    coverUrlCandidates(hiResCover(picUrl, song.source), picUrl),
  );
  if (fromMeta) return fromMeta;

  let fromScript: string | null = null;
  try {
    fromScript = await sourceRunner.getPic({
      source: song.source,
      action: "pic",
      info: song,
    });
  } catch {
    fromScript = null;
  }
  const fromPicAction = await fetchCoverFromUrls(
    coverUrlCandidates(hiResCover(fromScript, song.source), fromScript),
  );
  if (fromPicAction) return fromPicAction;
  if (picUrl || fromScript) throw new Error("Could not fetch cover art");
  return null;
}

const MAX_EMBED_LYRICS_CHARS = 80_000;

function lyricTextForEmbed(info: Awaited<ReturnType<typeof loadLyricInfo>>): string | null {
  if (!info) return null;
  // Prefer line-level LRC; word-timed payloads are often too large for ID3 USLT.
  const text = info.lyric?.trim() || info.lxlyric?.trim() || null;
  if (!text) return null;
  return text.length > MAX_EMBED_LYRICS_CHARS
    ? text.slice(0, MAX_EMBED_LYRICS_CHARS)
    : text;
}

const MAX_EMBED_COVER_IPC_BYTES = 768 * 1024;
const AUDIO_EMBED_CHUNK = 512 * 1024;
const MAX_IN_MEMORY_EMBED_BYTES = 48 * 1024 * 1024;

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x2000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function uint8ToBase64Chunks(bytes: Uint8Array): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += AUDIO_EMBED_CHUNK) {
    chunks.push(uint8ToBase64(bytes.subarray(i, i + AUDIO_EMBED_CHUNK)));
  }
  return chunks;
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function concatBase64Chunks(chunks: string[]): Uint8Array {
  const parts = chunks.map(base64ToUint8);
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

type EmbedPayload = {
  lyrics: string | null;
  coverBase64: string | null;
  warnings: string[];
};

async function prepareEmbedPayload(task: DownloadTask): Promise<EmbedPayload> {
  if (!isTauri || (task.embedLyrics === false && task.embedCover === false)) {
    return { lyrics: null, coverBase64: null, warnings: [] };
  }

  const lyricPromise =
    task.embedLyrics === false
      ? Promise.resolve(null)
      : loadLyricInfo(task.song);
  const coverPromise =
    task.embedCover === false
      ? Promise.resolve(null)
      : fetchDownloadCover(task.song);
  const [lyricResult, coverResult] = await Promise.allSettled([
    lyricPromise,
    coverPromise,
  ]);
  const warnings: string[] = [];
  const lyrics =
    lyricResult.status === "fulfilled"
      ? lyricTextForEmbed(lyricResult.value)
      : null;
  if (lyricResult.status === "rejected") {
    warnings.push(t("download.metadataLyrics"));
  }
  const cover = coverResult.status === "fulfilled" ? coverResult.value : null;
  if (coverResult.status === "rejected") {
    warnings.push(t("download.metadataCover"));
  }

  let coverBase64: string | null = null;
  if (cover) {
    if (cover.bytes.byteLength > MAX_EMBED_COVER_IPC_BYTES) {
      warnings.push(t("download.metadataCover"));
    } else {
      coverBase64 = uint8ToBase64(cover.bytes);
    }
  }
  return { lyrics, coverBase64, warnings };
}

async function embedMetadataInMemory(
  task: DownloadTask,
  audio: Uint8Array,
  payload: EmbedPayload,
): Promise<{ bytes: Uint8Array; warnings: string[] }> {
  const warnings = [...payload.warnings];
  if (!isTauri || (task.embedLyrics === false && task.embedCover === false)) {
    return { bytes: audio, warnings };
  }
  if (audio.byteLength > MAX_IN_MEMORY_EMBED_BYTES) {
    warnings.push(t("download.metadataWrite"));
    return { bytes: audio, warnings };
  }
  try {
    const taggedChunks = await invoke<string[]>("embed_download_metadata", {
      audioChunksBase64: uint8ToBase64Chunks(audio),
      title: task.song.name,
      artist: task.song.singer,
      album: task.song.albumName,
      lyrics: payload.lyrics,
      coverBase64: payload.coverBase64,
    });
    if (!Array.isArray(taggedChunks) || taggedChunks.length === 0) {
      warnings.push(t("download.metadataWrite"));
      return { bytes: audio, warnings };
    }
    return { bytes: concatBase64Chunks(taggedChunks), warnings };
  } catch (error) {
    console.error("[museek] embed_download_metadata", error);
    warnings.push(t("download.metadataWrite"));
    return { bytes: audio, warnings };
  }
}

async function deleteFileIfNeeded(filePath: string | undefined) {
  if (!filePath || !isTauri) return;
  if (!useSettingsStore.getState().deleteDownloadFiles) return;
  try {
    if (await exists(filePath)) await remove(filePath);
  } catch {
    /* ignore — task still removed from the list */
  }
}

function persist(tasks: DownloadTask[]) {
  // Device-local only — deliberately excluded from config sync (see configIO DB_FILES).
  writeData(STORE_FILE, tasks);
}

function isTask(v: unknown): v is DownloadTaskSnapshot {
  if (!v || typeof v !== "object") return false;
  const t = v as DownloadTaskSnapshot;
  return (
    typeof t.id === "string" &&
    !!t.song &&
    typeof t.song === "object" &&
    typeof t.song.name === "string" &&
    QUALITIES.includes(t.quality) &&
    STATUSES.includes(t.status) &&
    typeof t.progress === "number" &&
    (t.embedLyrics === undefined || typeof t.embedLyrics === "boolean") &&
    (t.embedCover === undefined || typeof t.embedCover === "boolean")
  );
}

function normalizeTask(task: DownloadTaskSnapshot): DownloadTask {
  return {
    ...task,
    embedLyrics: task.embedLyrics ?? true,
    embedCover: task.embedCover ?? true,
  };
}

export const useDownloadStore = create<DownloadState>((set, get) => ({
  tasks: [],

  addTask(song, quality) {
    // No download location set yet → prompt the user (with a shortcut to Settings)
    // instead of silently saving somewhere. downloadDir is a device-local setting.
    if (!useSettingsStore.getState().downloadDir) {
      promptDownloadLocation();
      return;
    }
    const { downloadQuality, embedLyrics, embedCover } =
      useSettingsStore.getState();
    const q = quality ?? downloadQuality;
    const task: DownloadTask = {
      id: `dl_${Date.now()}_${song.id}`,
      song,
      quality: q,
      embedLyrics,
      embedCover,
      status: "waiting",
      progress: 0,
    };
    set((s) => {
      const tasks = [...s.tasks, task];
      persist(tasks);
      return { tasks };
    });
    notify({
      message: t("download.added", { name: song.name }),
      variant: "success",
    });
    get()._pump();
  },

  removeTask(id) {
    const task = get().tasks.find((t) => t.id === id);
    void deleteFileIfNeeded(task?.filePath);
    set((s) => {
      const tasks = s.tasks.filter((t) => t.id !== id);
      persist(tasks);
      return { tasks };
    });
    get()._pump();
  },

  removeTasks(ids) {
    const idSet = new Set(ids);
    const toDelete = get().tasks.filter((t) => idSet.has(t.id));
    for (const task of toDelete) void deleteFileIfNeeded(task.filePath);
    set((s) => {
      const tasks = s.tasks.filter((t) => !idSet.has(t.id));
      persist(tasks);
      return { tasks };
    });
    get()._pump();
  },

  clearCompleted() {
    const done = get().tasks.filter((t) => t.status === "completed");
    for (const task of done) void deleteFileIfNeeded(task.filePath);
    set((s) => {
      const tasks = s.tasks.filter((t) => t.status !== "completed");
      persist(tasks);
      return { tasks };
    });
  },

  updateProgress(id, progress) {
    // Progress ticks are frequent — keep them in memory only; status changes persist.
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, progress } : t)),
    }));
  },

  updateStatus(id, status, error) {
    set((s) => {
      const tasks = s.tasks.map((t) =>
        t.id === id ? { ...t, status, error } : t,
      );
      persist(tasks);
      return { tasks };
    });
  },

  _pump() {
    const { maxConcurrent } = useSettingsStore.getState();
    // startTask flips a task to "downloading" synchronously (before its first
    // await), so this loop can fill all free slots in one pass.
    for (;;) {
      const running = get().tasks.filter(
        (t) => t.status === "downloading",
      ).length;
      if (running >= maxConcurrent) break;
      const next = get().tasks.find((t) => t.status === "waiting");
      if (!next) break;
      void get().startTask(next.id);
    }
  },

  async loadFromDisk() {
    const raw = await readData<unknown>(STORE_FILE, []);
    const list = Array.isArray(raw)
      ? raw.filter(isTask).map(normalizeTask)
      : [];
    const interrupted = list.some((task) => task.status === "downloading");
    // Interrupted mid-download → re-queue so _pump can finish them after launch.
    const tasks = list.map((task) =>
      task.status === "downloading"
        ? { ...task, status: "waiting" as const, progress: 0, error: undefined }
        : task,
    );
    set({ tasks });
    if (interrupted) persist(tasks);
    get()._pump();
  },

  async startTask(id) {
    const task = get().tasks.find((t) => t.id === id);
    if (!task || task.status === "downloading" || task.status === "completed")
      return;

    get().updateStatus(id, "downloading");
    get().updateProgress(id, 0);
    try {
      // Resolve URL with auto-downgrade; tell the user if the quality stepped down.
      const { url, quality: actual } = await resolveAdaptiveUrl(
        task.song,
        task.quality,
      );
      if (actual !== task.quality) {
        set((s) => {
          const tasks = s.tasks.map((t) =>
            t.id === id ? { ...t, quality: actual } : t,
          );
          persist(tasks);
          return { tasks };
        });
        notify({
          message: t("download.qualityDowngraded", {
            name: task.song.name,
            quality: t(`quality.${actual}`),
          }),
          variant: "info",
        });
      }

      const embedPromise = prepareEmbedPayload(task);
      const res = await tauriFetch(url, {
        method: "GET",
        headers: cdnHeadersForUrl(url),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const contentLength = parseInt(res.headers.get("content-length") || "0");
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const chunks: Uint8Array[] = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (contentLength > 0) {
          get().updateProgress(
            id,
            Math.min(85, Math.round((received / contentLength) * 85)),
          );
        }
      }

      // Merge chunks
      const total = chunks.reduce((s, c) => s + c.length, 0);
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) {
        merged.set(c, offset);
        offset += c.length;
      }

      const audio = maybeGunzipAudio(merged);
      const ext = suggestedDownloadExtension(audio, actual);
      const { downloadDir, fileNaming } = useSettingsStore.getState();
      // Guarded at addTask, but a queued task could outlive the user clearing it.
      if (!downloadDir) throw new Error(t("download.noLocationError"));
      const filename = buildFilename(task.song, fileNaming, ext);
      const dir = downloadDir.replace(/[/\\]+$/, "");
      const filePath = `${dir}/${filename}`;

      get().updateProgress(id, 86);
      const payload = await embedPromise;
      get().updateProgress(id, 90);
      const { bytes: output, warnings: metadataWarnings } =
        await embedMetadataInMemory(task, audio, payload);

      get().updateProgress(id, 96);
      await writeFile(filePath, output);

      set((s) => {
        const tasks = s.tasks.map((t) =>
          t.id === id
            ? { ...t, status: "completed" as const, progress: 100, filePath }
            : t,
        );
        persist(tasks);
        return { tasks };
      });
      if (metadataWarnings.length) {
        notify({
          message: t("download.completeMetadataWarning", {
            name: task.song.name,
            details: metadataWarnings.join(", "),
          }),
          variant: "info",
        });
      } else {
        notify({
          message: t("download.complete", { name: task.song.name }),
          variant: "success",
        });
      }
    } catch (err) {
      get().updateStatus(id, "error", (err as Error).message);
    } finally {
      // Free slot → kick off the next queued task.
      get()._pump();
    }
  },
}));
