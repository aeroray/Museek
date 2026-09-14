import type { ParsedLocalTags } from "./tags";

const INDEX_RX = /^(\d{1,3}):(\d{2}):(\d{2})$/;
const TRACK_RX = /^(\d{1,3})\b/;

export type CueFileGroup = {
  fileName: string;
  tracks: CueSheetTrack[];
};

export type CueSheetTrack = {
  trackNo: number;
  title: string;
  performer: string;
  index01: number;
};

export type ParsedCueSheet = {
  albumTitle: string;
  albumPerformer: string;
  files: CueFileGroup[];
};

export type CueImportTrack = {
  id: string;
  filePath: string;
  cueSheetPath: string;
  trackNo: number;
  title: string;
  performer: string;
  albumTitle: string;
  clipStart?: number;
  clipEnd?: number;
};

export type CueImportResult = {
  singles: string[];
  cueTracks: CueImportTrack[];
  tagsByPath: Map<string, ParsedLocalTags>;
  errors: string[];
};

export function pathKey(filePath: string): string {
  return filePath.replace(/\\/g, "/").toLowerCase();
}

export function isCueClipMeta(meta?: {
  clipStart?: number;
  clipEnd?: number;
} | null): boolean {
  if (!meta) return false;
  const start = meta.clipStart;
  const end = meta.clipEnd;
  return (
    typeof start === "number" &&
    typeof end === "number" &&
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    start >= 0 &&
    end > start
  );
}

/** CD INDEX MM:SS:FF — frames are 1/75 second. */
export function cueIndexToSeconds(index: string): number {
  const match = INDEX_RX.exec(index.trim());
  if (!match) return Number.NaN;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const frames = Number(match[3]);
  if (seconds > 59 || frames > 74) return Number.NaN;
  return minutes * 60 + seconds + frames / 75;
}

export function joinCueDir(cueDir: string, fileName: string): string {
  const name = fileName.replace(/\\/g, "/").trim();
  if (!name) return cueDir;
  if (/^[a-zA-Z]:/.test(name) || name.startsWith("/")) {
    const absSep = cueDir.includes("\\") ? "\\" : "/";
    return name.replace(/\//g, absSep);
  }
  const sep = cueDir.includes("\\") ? "\\" : "/";
  const base = cueDir.replace(/[/\\]+$/, "");
  return `${base}${sep}${name.split("/").join(sep)}`;
}

export function cueDirOf(cuePath: string): string {
  const norm = cuePath.replace(/\\/g, "/");
  const i = norm.lastIndexOf("/");
  if (i < 0) return cuePath.includes("\\") ? cuePath.replace(/[^\\]+$/, "") : "";
  const dir = cuePath.slice(0, cuePath.length - (norm.length - i));
  return dir.replace(/[/\\]+$/, "") || dir;
}

function unquote(raw: string): string {
  const s = raw.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/\\"/g, '"');
  }
  return s;
}

function parseQuotedName(args: string): { name: string; rest: string } {
  const trimmed = args.trim();
  if (trimmed.startsWith('"')) {
    let i = 1;
    let name = "";
    while (i < trimmed.length) {
      const ch = trimmed[i];
      if (ch === "\\" && i + 1 < trimmed.length) {
        name += trimmed[i + 1];
        i += 2;
        continue;
      }
      if (ch === '"') {
        return { name, rest: trimmed.slice(i + 1).trim() };
      }
      name += ch;
      i += 1;
    }
    return { name, rest: "" };
  }
  const sp = trimmed.search(/\s+/);
  if (sp < 0) return { name: trimmed, rest: "" };
  return { name: trimmed.slice(0, sp), rest: trimmed.slice(sp).trim() };
}

export function decodeCueBytes(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    for (const encoding of ["gb18030", "gbk"]) {
      try {
        return new TextDecoder(encoding).decode(bytes);
      } catch {
        /* try next */
      }
    }
    return new TextDecoder("utf-8").decode(bytes);
  }
}

export function parseCueSheet(text: string): ParsedCueSheet {
  const files: CueFileGroup[] = [];
  let albumTitle = "";
  let albumPerformer = "";
  let currentFile: CueFileGroup | null = null;
  let currentTrack: CueSheetTrack | null = null;

  const flushTrack = () => {
    if (!currentFile || !currentTrack) return;
    if (Number.isFinite(currentTrack.index01)) {
      currentFile.tracks.push(currentTrack);
    }
    currentTrack = null;
  };

  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || /^REM(\s|$)/i.test(line)) continue;
    const sp = line.search(/\s+/);
    const cmd = (sp < 0 ? line : line.slice(0, sp)).toUpperCase();
    const args = sp < 0 ? "" : line.slice(sp + 1).trim();

    if (cmd === "FILE") {
      flushTrack();
      const { name } = parseQuotedName(args);
      if (!name) continue;
      currentFile = { fileName: name, tracks: [] };
      files.push(currentFile);
      continue;
    }

    if (cmd === "TRACK") {
      flushTrack();
      const match = TRACK_RX.exec(args);
      const kind = args.replace(TRACK_RX, "").trim().toUpperCase();
      if (!match || (kind && kind !== "AUDIO")) {
        currentTrack = null;
        continue;
      }
      if (!currentFile) {
        currentFile = { fileName: "", tracks: [] };
        files.push(currentFile);
      }
      currentTrack = {
        trackNo: Number(match[1]),
        title: "",
        performer: "",
        index01: Number.NaN,
      };
      continue;
    }

    if (cmd === "TITLE") {
      const title = unquote(args);
      if (currentTrack) currentTrack.title = title;
      else if (!albumTitle) albumTitle = title;
      continue;
    }

    if (cmd === "PERFORMER") {
      const performer = unquote(args);
      if (currentTrack) currentTrack.performer = performer;
      else if (!albumPerformer) albumPerformer = performer;
      continue;
    }

    if (cmd === "INDEX") {
      if (!currentTrack) continue;
      const parts = args.split(/\s+/);
      const n = Number(parts[0]);
      const stamp = parts[1] ?? "";
      if (n === 1) {
        const seconds = cueIndexToSeconds(stamp);
        if (Number.isFinite(seconds)) currentTrack.index01 = seconds;
      }
    }
  }
  flushTrack();

  return {
    albumTitle,
    albumPerformer,
    files: files.filter((file) => file.tracks.length > 0),
  };
}

function siblingCuePath(audioPath: string): string {
  return audioPath.replace(/\.[^.\\/]+$/, ".cue");
}

async function pathExists(path: string): Promise<boolean> {
  try {
    const { exists } = await import("@tauri-apps/plugin-fs");
    return await exists(path);
  } catch {
    return false;
  }
}

async function readCueText(cuePath: string): Promise<string> {
  const { readFile } = await import("@tauri-apps/plugin-fs");
  const bytes = await readFile(cuePath);
  return decodeCueBytes(bytes);
}

function resolveCueFile(
  cuePath: string,
  fileName: string,
): string | null {
  if (!fileName) return null;
  const resolved = joinCueDir(cueDirOf(cuePath), fileName);
  return resolved || null;
}

function tracksFromSheet(
  sheet: ParsedCueSheet,
  cueSheetPath: string,
  resolvePath: (fileName: string) => string | null,
  ids: {
    clipId: (filePath: string, trackNo: number) => string;
    fileId: (filePath: string) => string;
  },
): Array<
  CueImportTrack & {
    start: number;
    nextStart: number;
    multi: boolean;
  }
> {
  const out: Array<
    CueImportTrack & { start: number; nextStart: number; multi: boolean }
  > = [];
  for (const file of sheet.files) {
    const filePath = resolvePath(file.fileName);
    if (!filePath) continue;
    const ordered = [...file.tracks].sort((a, b) => a.index01 - b.index01);
    const multi = ordered.length > 1;
    for (let i = 0; i < ordered.length; i++) {
      const track = ordered[i];
      const next = ordered[i + 1];
      out.push({
        id: multi
          ? ids.clipId(filePath, track.trackNo)
          : ids.fileId(filePath),
        filePath,
        cueSheetPath,
        trackNo: track.trackNo,
        title: track.title.trim(),
        performer: (track.performer || sheet.albumPerformer).trim(),
        albumTitle: sheet.albumTitle.trim(),
        start: track.index01,
        nextStart: next ? next.index01 : Number.POSITIVE_INFINITY,
        multi,
      });
    }
  }
  return out;
}

export function applyCueDurations(
  tracks: Array<
    CueImportTrack & { start: number; nextStart: number; multi: boolean }
  >,
  durationByPath: Map<string, number>,
): CueImportTrack[] {
  const out: CueImportTrack[] = [];
  for (const track of tracks) {
    const duration = durationByPath.get(pathKey(track.filePath)) ?? 0;
    if (!track.multi) {
      out.push({
        id: track.id,
        filePath: track.filePath,
        cueSheetPath: track.cueSheetPath,
        trackNo: track.trackNo,
        title: track.title,
        performer: track.performer,
        albumTitle: track.albumTitle,
      });
      continue;
    }
    const clipEnd = Number.isFinite(track.nextStart)
      ? Math.min(track.nextStart, duration || track.nextStart)
      : duration;
    if (clipEnd > track.start + 0.05) {
      out.push({
        id: track.id,
        filePath: track.filePath,
        cueSheetPath: track.cueSheetPath,
        trackNo: track.trackNo,
        title: track.title,
        performer: track.performer,
        albumTitle: track.albumTitle,
        clipStart: track.start,
        clipEnd,
      });
      continue;
    }
    // Last track with unknown album duration: keep a clip so import isn't dropped.
    if (!Number.isFinite(track.nextStart)) {
      const prev = out[out.length - 1];
      const gap =
        prev?.clipEnd != null && prev.clipStart != null
          ? prev.clipEnd - prev.clipStart
          : 180;
      out.push({
        id: track.id,
        filePath: track.filePath,
        cueSheetPath: track.cueSheetPath,
        trackNo: track.trackNo,
        title: track.title,
        performer: track.performer,
        albumTitle: track.albumTitle,
        clipStart: track.start,
        clipEnd: track.start + Math.max(30, gap),
      });
    }
  }
  return out;
}

export async function collectCueImport(paths: string[]): Promise<CueImportResult> {
  const {
    isCuePath,
    isLocalAudioPath,
    localCueTrackId,
    localTrackId,
    parseLocalFile,
  } = await import("./tags");
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const path of paths) {
    if (typeof path !== "string" || !path) continue;
    const key = pathKey(path);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(path);
  }

  const cues: string[] = [];
  const audios: string[] = [];
  const cueKeys = new Set<string>();
  for (const path of unique) {
    if (isCuePath(path)) {
      cues.push(path);
      cueKeys.add(pathKey(path));
    } else if (isLocalAudioPath(path)) {
      audios.push(path);
    }
  }

  for (const audio of audios) {
    const sibling = siblingCuePath(audio);
    if (cueKeys.has(pathKey(sibling))) continue;
    if (await pathExists(sibling)) {
      cues.push(sibling);
      cueKeys.add(pathKey(sibling));
    }
  }

  const errors: string[] = [];
  const pending: Array<
    CueImportTrack & { start: number; nextStart: number; multi: boolean }
  > = [];
  const referenced = new Set<string>();
  const neededAudio = new Map<string, string>();

  for (const cuePath of cues) {
    try {
      const sheet = parseCueSheet(await readCueText(cuePath));
      if (!sheet.files.length) {
        errors.push(cuePath);
        continue;
      }
      const missing: string[] = [];
      const resolved = tracksFromSheet(
        sheet,
        cuePath,
        (fileName) => {
          const full = resolveCueFile(cuePath, fileName);
          if (!full || !isLocalAudioPath(full)) {
            missing.push(fileName || cuePath);
            return null;
          }
          return full;
        },
        { clipId: localCueTrackId, fileId: localTrackId },
      );
      for (const name of missing) {
        errors.push(name);
      }
      for (const track of resolved) {
        referenced.add(pathKey(track.filePath));
        neededAudio.set(pathKey(track.filePath), track.filePath);
        pending.push(track);
      }
      if (!resolved.length && !missing.length) errors.push(cuePath);
    } catch {
      errors.push(cuePath);
    }
  }

  const { allowLocalFilePaths } = await import("./fsScope");
  await allowLocalFilePaths([...neededAudio.values(), ...cues]);

  const durationByPath = new Map<string, number>();
  const tagByPath = new Map<string, ParsedLocalTags>();
  await Promise.all(
    [...neededAudio.values()].map(async (filePath) => {
      if (!(await pathExists(filePath))) {
        errors.push(filePath);
        durationByPath.set(pathKey(filePath), 0);
        return;
      }
      try {
        const tags = await parseLocalFile(
          filePath,
          localTrackId(filePath),
          "smart",
          false,
        );
        tagByPath.set(pathKey(filePath), tags);
        durationByPath.set(pathKey(filePath), tags.durationSec);
      } catch {
        durationByPath.set(pathKey(filePath), 0);
        errors.push(filePath);
      }
    }),
  );

  const cueTracks = applyCueDurations(pending, durationByPath).filter((track) => {
    const key = pathKey(track.filePath);
    if (track.clipStart != null) return true;
    return tagByPath.has(key);
  });

  const singles = audios.filter((path) => !referenced.has(pathKey(path)));
  return {
    singles,
    cueTracks,
    tagsByPath: tagByPath,
    errors: [...new Set(errors)],
  };
}
