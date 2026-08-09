import { httpFetch as tauriFetch } from "@/lib/http";
import * as md5Lib from "js-md5";
import type {
  MusicInfo,
  MusicQuality,
  Quality,
  SearchResult,
} from "@/types/music";
import { indexQualitySizes } from "@/lib/quality";
import { formatDuration } from "@/lib/utils";

// Ported from lx-music-desktop: src/renderer/utils/musicSdk/mg/musicSearch.js
// Prefer the signed jadeite v3 searchAll endpoint, then fall back to Migu's
// still-live MIGUM2.0 search endpoint when jadeite rejects the request.

// js-md5 CommonJS/ESM interop (same pattern as src/lib/lxApi.ts)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const md5 = ((md5Lib as any).default ?? md5Lib) as (str: string) => string;

interface MgSingerRaw {
  name?: string;
}

interface MgAudioFormatRaw {
  formatType?: string;
  asize?: number | string;
  isize?: number | string;
  size?: number | string;
  androidSize?: number | string;
}

interface MgAlbumRaw {
  id?: string;
  name?: string;
}

interface MgImageRaw {
  img?: string;
}

interface MgSongRaw {
  songId?: string;
  id?: string;
  copyrightId?: string;
  name?: string;
  album?: string;
  albumId?: string;
  albums?: MgAlbumRaw[];
  duration?: number | string;
  singerList?: MgSingerRaw[];
  singers?: MgSingerRaw[];
  audioFormats?: MgAudioFormatRaw[];
  newRateFormats?: MgAudioFormatRaw[];
  rateFormats?: MgAudioFormatRaw[];
  img1?: string;
  img2?: string;
  img3?: string;
  imgItems?: MgImageRaw[];
}

interface MgSearchResponse {
  code?: string;
  info?: string;
  songResultData?: {
    resultList?: MgSongRaw[][];
    totalCount?: number | string;
  };
}

// Mirrors common/utils/common.ts sizeFormate
function sizeFormate(size: number): string {
  if (!size) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const number = Math.floor(Math.log(size) / Math.log(1024));
  return `${(size / Math.pow(1024, Math.floor(number))).toFixed(2)} ${units[number]}`;
}

function formatSingers(singers: MgSingerRaw[] | undefined): string {
  if (!Array.isArray(singers)) return "";
  return singers
    .map((s) => s.name)
    .filter(Boolean)
    .join("、");
}

// Ported from mg/util.js createSignature (static device id + salts).
function createSignature(
  time: string,
  str: string,
): { sign: string; deviceId: string } {
  const deviceId = "963B7AA0D21511ED807EE5846EC87D20";
  const signatureMd5 = "6cdc72a439cef99a3418d2a78aa28c73";
  const sign = md5(
    `${str}${signatureMd5}yyapp2d16148780a1dcc7408e06336b98cfd50${deviceId}${time}`,
  );
  return { sign, deviceId };
}

const formatTypeToQuality: Record<string, Quality> = {
  PQ: "128k",
  HQ: "320k",
  SQ: "flac",
  ZQ: "flac24bit",
  ZQ24: "flac24bit",
};

function normalizeMgSong(raw: MgSongRaw): MusicInfo {
  const qualitys: MusicQuality[] = [];
  const audioFormats =
    raw.audioFormats ?? raw.newRateFormats ?? raw.rateFormats ?? [];
  for (const fmt of audioFormats) {
    const q = fmt.formatType ? formatTypeToQuality[fmt.formatType] : undefined;
    if (!q) continue;
    const rawSize = fmt.asize ?? fmt.isize ?? fmt.size ?? fmt.androidSize;
    const size = rawSize != null ? sizeFormate(Number(rawSize)) : null;
    qualitys.push({ type: q, size });
  }
  if (qualitys.length === 0) qualitys.push({ type: "128k", size: null });

  const _qualitys = indexQualitySizes(qualitys);

  let img =
    raw.img3 ||
    raw.img2 ||
    raw.img1 ||
    raw.imgItems?.[2]?.img ||
    raw.imgItems?.[0]?.img ||
    null;
  if (img && !/^https?:/.test(img)) img = "http://d.musicapp.migu.cn" + img;

  const songId = String(raw.songId ?? raw.id ?? "");
  const album = raw.albums?.[0];

  return {
    id: `mg_${songId}`,
    name: raw.name ?? "",
    singer: formatSingers(raw.singerList ?? raw.singers),
    source: "mg",
    interval: formatDuration(Number(raw.duration ?? 0)),
    albumName: raw.album ?? album?.name ?? "",
    meta: {
      songId,
      albumId: String(raw.albumId ?? album?.id ?? ""),
      copyrightId: raw.copyrightId,
      picUrl: img,
      qualitys,
      _qualitys,
    },
  };
}

function filterData(rawData: MgSongRaw[][]): MusicInfo[] {
  const seen = new Set<string>();
  const list: MusicInfo[] = [];
  for (const group of rawData) {
    for (const data of group) {
      const songId = data.songId ?? data.id;
      if (!songId || !data.copyrightId || seen.has(data.copyrightId)) continue;
      seen.add(data.copyrightId);
      list.push(normalizeMgSong(data));
    }
  }
  return list;
}

export async function searchMigu(
  query: string,
  page = 1,
  limit = 30,
): Promise<SearchResult> {
  const time = Date.now().toString();
  const { sign, deviceId } = createSignature(time, query);

  const searchSwitch = encodeURIComponent(
    JSON.stringify({
      song: 1,
      album: 0,
      singer: 0,
      tagSong: 1,
      mvSong: 0,
      bestShow: 1,
      songlist: 0,
      lyricSong: 1,
    }),
  );
  const v3Url =
    `https://jadeite.migu.cn/music_search/v3/search/searchAll?isCorrect=0&isCopyright=1` +
    `&searchSwitch=${searchSwitch}&pageSize=${limit}&text=${encodeURIComponent(query)}` +
    `&pageNo=${page}&sort=0&sid=USS`;

  let data: MgSearchResponse | null = null;
  try {
    const v3Res = await tauriFetch(v3Url, {
      method: "GET",
      headers: {
        uiVersion: "A_music_3.6.1",
        deviceId,
        timestamp: time,
        sign,
        channel: "0146921",
        "User-Agent":
          "Mozilla/5.0 (Linux; U; Android 11.0.0; zh-cn; MI 11 Build/OPR1.170623.032) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30",
      },
    });
    if (v3Res.ok) {
      const candidate = (await v3Res.json()) as MgSearchResponse;
      if (candidate.code === "000000") data = candidate;
    }
  } catch {
    // The legacy endpoint below is the durable path when jadeite is unavailable.
  }

  if (!data) {
    const legacyUrl =
      `https://app.c.nf.migu.cn/MIGUM2.0/v1.0/content/search_all.do?isCopyright=1&isCorrect=1` +
      `&pageNo=${page}&pageSize=${limit}&searchSwitch=${encodeURIComponent(
        JSON.stringify({
          song: 1,
          album: 0,
          singer: 0,
          tagSong: 0,
          mvSong: 0,
          songlist: 0,
          bestShow: 0,
        }),
      )}&sort=0&text=${encodeURIComponent(query)}`;
    const legacyRes = await tauriFetch(legacyUrl, {
      method: "GET",
      headers: {
        Referer: "https://app.c.nf.migu.cn/",
        channel: "0146921",
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 11; MI 11) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36",
      },
    });
    if (!legacyRes.ok) {
      throw new Error(`Migu search failed: ${legacyRes.status}`);
    }
    const candidate = (await legacyRes.json()) as MgSearchResponse;
    if (candidate.code === "000000") data = candidate;
  }

  if (!data) {
    throw new Error("Migu search failed: bad response");
  }

  const result = data.songResultData ?? { resultList: [], totalCount: 0 };
  const list = filterData(result.resultList ?? []);
  const total = parseInt(String(result.totalCount ?? 0)) || 0;

  return {
    list,
    total,
    page,
    allPage: Math.ceil(total / limit),
    limit,
  };
}
