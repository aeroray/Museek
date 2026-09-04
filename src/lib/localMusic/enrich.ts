import { searchWangyi, fetchWySongDetail } from "@/lib/search/wy";
import { matchScore, pickBestMatch } from "@/lib/lyrics/matchSong";
import type { LocalNameMode, LocalTrack, MusicInfo } from "@/types/music";
import type { ParsedLocalTags } from "./tags";
import { LocalEnrichmentQueue } from "./enrichmentQueue";
import {
  catalogIdentity,
  isPlaceholderArtist,
  isPlaceholderTitle,
  localCatalogQuery,
} from "./catalogQuery";
import { localResolvedTitle } from "./tags";

const enrichmentQueue = new LocalEnrichmentQueue<MusicInfo[]>({
  concurrency: 2,
  minIntervalMs: 120,
  cacheTtlMs: 5 * 60_000,
  cacheSize: 160,
});

function normalizeQuery(query: string): string {
  return query.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export type LocalEnrichStatus = "applied" | "unchanged" | "miss";

export type LocalCatalogPreview = {
  query: string;
  hits: MusicInfo[];
  recommended: MusicInfo | null;
};

/** Title or artist missing from tags — filename-only; 识曲 is offered as a fallback. */
export function localTagsIncomplete(tags: ParsedLocalTags): boolean {
  return !tags.hasTitleTag || !tags.hasArtistTag;
}

/** Picker 识曲: missing tags, or legacy rows that only show placeholders. */
export function localTrackUntagged(track: LocalTrack): boolean {
  if (track.hydrated === false) return true;
  if (track.hasTitleTag === false || track.hasArtistTag === false) return true;
  if (track.hasTitleTag === true && track.hasArtistTag === true) return false;
  return (
    isPlaceholderArtist(track.song.singer) ||
    isPlaceholderTitle(catalogIdentity(track.song).name)
  );
}

function catalogChanged(prev: MusicInfo, next: MusicInfo): boolean {
  return (
    prev.name !== next.name ||
    prev.singer !== next.singer ||
    prev.albumName !== next.albumName ||
    prev.meta.picUrl !== next.meta.picUrl ||
    prev.meta.wySongId !== next.meta.wySongId ||
    prev.meta.catalogName !== next.meta.catalogName ||
    prev.meta.catalogSinger !== next.meta.catalogSinger ||
    prev.meta.catalogInterval !== next.meta.catalogInterval
  );
}

async function searchWangyiCached(query: string): Promise<MusicInfo[]> {
  return enrichmentQueue.enqueue(normalizeQuery(query), async () => {
    const result = await searchWangyi(query, 1, 20);
    return result.list;
  });
}

/**
 * Apply a user-confirmed (or auto-picked) NetEase hit. Never changes source /
 * filePath / id. Only fills fields that lacked tags. Filename lock only hides
 * the catalog title; the match is still stored.
 */
export async function applyCatalogHit(
  song: MusicInfo,
  tags: ParsedLocalTags,
  nameMode: LocalNameMode,
  hit: MusicInfo,
  isCurrent?: () => boolean,
): Promise<{ song: MusicInfo; status: LocalEnrichStatus }> {
  if (isCurrent && !isCurrent()) return { song, status: "unchanged" };

  let picUrl = hit.meta.picUrl ?? null;
  if (!picUrl && hit.meta.songId) {
    const detailed = await fetchWySongDetail(hit.meta.songId);
    if (isCurrent && !isCurrent()) return { song, status: "unchanged" };
    picUrl = detailed?.meta.picUrl ?? null;
  }

  const catalogName = hit.name?.trim() || song.meta.catalogName;
  const filePath = song.meta.filePath ?? "";
  const next: MusicInfo = {
    ...song,
    name: localResolvedTitle({
      filePath,
      nameMode,
      hasTitleTag: tags.hasTitleTag,
      parsedName: song.name,
      catalogName,
    }),
    singer: tags.hasArtistTag ? song.singer : hit.singer || song.singer,
    albumName: tags.hasAlbumTag
      ? song.albumName
      : hit.albumName || song.albumName,
    meta: {
      ...song.meta,
      picUrl: tags.hasCover ? song.meta.picUrl : (picUrl ?? song.meta.picUrl),
      wySongId: hit.meta.songId || song.meta.wySongId,
      catalogName,
      catalogSinger: hit.singer?.trim() || song.meta.catalogSinger,
      catalogInterval: hit.interval || song.meta.catalogInterval,
    },
  };

  return {
    song: next,
    status: catalogChanged(song, next) ? "applied" : "unchanged",
  };
}

/** Ranked NetEase search for the single-track picker (includes low-score hits). */
export async function searchLocalCatalogCandidates(
  song: MusicInfo,
  options?: { bypassQueue?: boolean },
): Promise<LocalCatalogPreview> {
  const query = localCatalogQuery(song);
  if (!query) return { query: "", hits: [], recommended: null };

  try {
    const list = options?.bypassQueue
      ? (await searchWangyi(query, 1, 20)).list
      : await searchWangyiCached(query);
    const recommended = pickBestMatch(song, list);
    const hits = [...list].sort(
      (a, b) => matchScore(song, b) - matchScore(song, a),
    );
    return { query, hits, recommended };
  } catch {
    return { query, hits: [], recommended: null };
  }
}

/**
 * Fill missing display fields from a confident NetEase catalog match.
 * Batch Match online / Match on import — no picker, no play-time fill.
 */
export async function enrichLocalSong(
  song: MusicInfo,
  tags: ParsedLocalTags,
  nameMode: LocalNameMode = "smart",
  isCurrent?: () => boolean,
): Promise<{ song: MusicInfo; status: LocalEnrichStatus }> {
  const q = localCatalogQuery(song);
  if (!q) return { song, status: "miss" };
  if (isCurrent && !isCurrent()) return { song, status: "unchanged" };

  try {
    const list = await searchWangyiCached(q);
    if (isCurrent && !isCurrent()) return { song, status: "unchanged" };
    const hit = pickBestMatch(song, list);
    if (!hit) return { song, status: "miss" };
    return applyCatalogHit(song, tags, nameMode, hit, isCurrent);
  } catch {
    return { song, status: "miss" };
  }
}
