import { searchWangyi, fetchWySongDetail } from "@/lib/search/wy";
import type { LocalNameMode, MusicInfo } from "@/types/music";
import type { ParsedLocalTags } from "./tags";
import { LocalEnrichmentQueue } from "./enrichmentQueue";
import { localCatalogQuery } from "./catalogQuery";
import { localResolvedTitle } from "./tags";

const enrichmentQueue = new LocalEnrichmentQueue<MusicInfo | null>({
  concurrency: 2,
  minIntervalMs: 120,
  cacheTtlMs: 5 * 60_000,
  cacheSize: 160,
});

function normalizeQuery(query: string): string {
  return query.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export type LocalEnrichStatus = "applied" | "unchanged" | "miss";

function catalogChanged(prev: MusicInfo, next: MusicInfo): boolean {
  return (
    prev.name !== next.name ||
    prev.singer !== next.singer ||
    prev.albumName !== next.albumName ||
    prev.meta.picUrl !== next.meta.picUrl ||
    prev.meta.wySongId !== next.meta.wySongId ||
    prev.meta.catalogName !== next.meta.catalogName
  );
}

/**
 * Fill missing display fields from the first NetEase search hit.
 * Call from Match online / Match on import, or play-time gap fill.
 * Never changes source / filePath / id. Only fills fields that lacked tags.
 * Filename lock only hides the catalog title; the match is still stored.
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
    const hit = await enrichmentQueue.enqueue(normalizeQuery(q), async () => {
      const result = await searchWangyi(q, 1, 5);
      return result.list[0] ?? null;
    });
    if (isCurrent && !isCurrent()) return { song, status: "unchanged" };
    if (!hit) return { song, status: "miss" };

    let picUrl = hit.meta.picUrl ?? null;
    if (!picUrl && hit.meta.songId) {
      const detailed = await fetchWySongDetail(hit.meta.songId);
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
        picUrl: tags.hasCover
          ? song.meta.picUrl
          : (picUrl ?? song.meta.picUrl),
        wySongId: hit.meta.songId || song.meta.wySongId,
        catalogName,
      },
    };

    return {
      song: next,
      status: catalogChanged(song, next) ? "applied" : "unchanged",
    };
  } catch {
    return { song, status: "miss" };
  }
}
