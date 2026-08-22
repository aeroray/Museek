import type { Quality, MusicInfo, LyricInfo } from "./music";

export interface SourceInfo {
  type: "music";
  actions: Array<"musicUrl" | "lyric" | "pic">;
  qualitys: Quality[];
}

export interface SourceScript {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  rawScript: string;
  enabled: boolean;
  sources?: Record<string, SourceInfo>;
  /** Import origin: `local:` + path for file imports, or a historical remote URL. */
  url?: string;
}

export interface SourceRegistry {
  getScripts: () => SourceScript[];
  setScripts: (scripts: SourceScript[]) => void;
}

export interface LxRequestPayload {
  source: string;
  action: "musicUrl" | "lyric" | "pic";
  info: MusicInfo;
  type?: string;
}

export type LxRequestResult = string | LyricInfo;
