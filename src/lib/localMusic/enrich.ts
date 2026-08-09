import { searchWangyi } from "@/lib/search/wy";
import type { LocalNameMode, MusicInfo } from "@/types/music";
import type { ParsedLocalTags } from "./tags";

function needsEnrich(tags: ParsedLocalTags): boolean {
  return (
    !tags.hasTitleTag ||
    !tags.hasArtistTag ||
    !tags.hasAlbumTag ||
    !tags.hasCover
  );
}

/**
 * Fill missing display fields from the first NetEase search hit.
 * Never changes source / filePath / id. Only fills fields that lacked tags.
 */
export async function enrichLocalSong(
  song: MusicInfo,
  tags: ParsedLocalTags,
  nameMode: LocalNameMode = "smart",
): Promise<MusicInfo> {
  if (nameMode === "filename" || !needsEnrich(tags)) return song;

  const q = [song.name, song.singer].filter(Boolean).join(" ").trim();
  if (!q) return song;

  try {
    const result = await searchWangyi(q, 1, 5);
    const hit = result.list[0];
    if (!hit) return song;

    return {
      ...song,
      name: tags.hasTitleTag ? song.name : hit.name || song.name,
      singer: tags.hasArtistTag ? song.singer : hit.singer || song.singer,
      albumName: tags.hasAlbumTag
        ? song.albumName
        : hit.albumName || song.albumName,
      meta: {
        ...song.meta,
        picUrl: tags.hasCover
          ? song.meta.picUrl
          : (hit.meta.picUrl ?? song.meta.picUrl),
      },
    };
  } catch {
    return song;
  }
}
