import type { MusicInfo, Source } from "@/types/music";

const UNKNOWN_ARTISTS = new Set(["未知歌手", "Unknown artist"]);
const UNKNOWN_TITLES = new Set(["未知歌曲", "Unknown title"]);
const ARTIST_TITLE_SPLIT = /\s[-–—]\s/;

export function isPlaceholderArtist(singer: string): boolean {
  const s = singer.trim();
  return !s || UNKNOWN_ARTISTS.has(s);
}

export function isPlaceholderTitle(name: string): boolean {
  const s = name.trim();
  return !s || UNKNOWN_TITLES.has(s);
}

type CatalogSong = Pick<MusicInfo, "name" | "singer"> & {
  meta?: Pick<
    MusicInfo["meta"],
    "catalogName" | "catalogSinger" | "catalogInterval" | "filePath" | "wySongId"
  >;
};

function splitArtistTitle(
  name: string,
): { artist: string; title: string } | null {
  const parts = name
    .split(ARTIST_TITLE_SPLIT)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  return { artist: parts[0], title: parts.slice(1).join(" - ") };
}

function guessFromPath(path: string): { name: string; singer: string } {
  const base = path.split(/[/\\]/).pop() ?? path;
  const raw = base.replace(/\.[^.]+$/, "").trim();
  const split = raw ? splitArtistTitle(raw) : null;
  if (split) return { name: split.title, singer: split.artist };
  return { name: raw, singer: "" };
}

/**
 * Title/artist for online search and lyric scoring.
 * Prefer Match-online catalog title; otherwise peel `Artist - Title` filenames.
 */
export function catalogIdentity(song: CatalogSong): {
  name: string;
  singer: string;
} {
  const catalog = song.meta?.catalogName?.trim();
  let singer = isPlaceholderArtist(song.singer) ? "" : song.singer.trim();
  if (catalog) return { name: catalog, singer };

  let name = isPlaceholderTitle(song.name) ? "" : song.name.trim();
  const split = name ? splitArtistTitle(name) : null;
  if (split) {
    const singerIsPrefix =
      !singer ||
      singer === split.artist ||
      name.startsWith(`${singer} - `) ||
      name.startsWith(`${singer} – `) ||
      name.startsWith(`${singer} — `);
    if (singerIsPrefix) {
      name = split.title;
      if (!singer) singer = split.artist;
    }
  }
  return { name, singer };
}

/** Import-time or manual NetEase match — play may use this catalog identity. */
export function localSongMatched(
  song: Pick<MusicInfo, "source"> & { meta?: { wySongId?: string } },
): boolean {
  return song.source === "local" && Boolean(song.meta?.wySongId);
}

/**
 * Identity used to *score* lyric hits for a local file.
 * Matched tracks use the confirmed catalog title. Unmatched files stay on
 * the filename so play-time search is not silently bound to a guess.
 */
export function lyricSearchIdentity(
  song: CatalogSong & { source?: Source },
): { name: string; singer: string } {
  if (song.source && song.source !== "local") return catalogIdentity(song);
  if (song.meta?.wySongId) {
    const catalog = catalogIdentity(song);
    const singer = song.meta.catalogSinger?.trim() || catalog.singer;
    return { name: catalog.name, singer };
  }

  const path = song.meta?.filePath ?? "";
  const display = catalogIdentity({
    name: song.name,
    singer: song.singer,
    meta: { filePath: path },
  });
  const catalog = song.meta?.catalogName?.trim();
  if (!path || !catalog || song.name.trim() !== catalog) return display;

  const guessed = guessFromPath(path);
  if (
    guessed.name &&
    !isPlaceholderTitle(guessed.name) &&
    guessed.name !== catalog
  ) {
    return {
      name: guessed.name,
      singer: display.singer || guessed.singer,
    };
  }
  return display;
}

/** NetEase search string for a local track — never appends placeholder artist/title. */
export function localCatalogQuery(song: CatalogSong): string {
  const { name, singer } = catalogIdentity(song);
  return [name, singer].filter(Boolean).join(" ").trim();
}
