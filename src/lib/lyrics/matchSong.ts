import {
  lyricSearchIdentity,
  isPlaceholderArtist,
  isPlaceholderTitle,
} from "@/lib/localMusic/catalogQuery"
import { parseLyricDuration } from "@/lib/lyrics/timing"
import type { MusicInfo } from "@/types/music"

const TITLE_MIN = 0.88
const ARTIST_MIN = 0.55
const DURATION_REJECT_SEC = 15
const UNKNOWN_ARTIST_DURATION_SEC = 8

function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/【/g, "[")
    .replace(/】/g, "]")
    .replace(/&/g, " ")
    .replace(/[、,/;|+]+/g, " ")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/\b(feat|ft|with)\b\.?/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function coreTitle(name: string): string {
  if (isPlaceholderTitle(name)) return ""
  return fold(name)
}

function tokenSet(value: string): Set<string> {
  return new Set(fold(value).split(" ").filter(Boolean))
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const item of a) if (b.has(item)) inter++
  return inter / (a.size + b.size - inter)
}

function textScore(left: string, right: string): number {
  const a = fold(left)
  const b = fold(right)
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.includes(b) || b.includes(a)) {
    const shorter = Math.min(a.length, b.length)
    const longer = Math.max(a.length, b.length)
    const ratio = shorter / longer
    // A short token inside a long title ("BGM" ⊂ "Epic Battle BGM") is not a match.
    if (ratio < 0.85) return 0
    return 0.88 + 0.12 * ratio
  }
  const jac = jaccard(tokenSet(left), tokenSet(right))
  return jac >= 0.85 ? jac : 0
}

/**
 * Split a platform's credit list into individual artists.
 *
 * Platforms write collaborations as one field — "元、鱼骨妹", "A feat. B",
 * "A & B", "A/B" — while other services (Last.fm among them) usually store only
 * the first artist. The separators are deliberately greedy: splitting a genuine
 * name that contains "&" only produces parts that then have to match on their
 * own, which they will not, so the extra parts cannot cause a false match.
 */
export function splitArtists(singer: string): string[] {
  return singer
    .split(/[、,，/;；]|&|\bfeat\.?\b|\bft\.?\b|\bwith\b/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function durationScore(left: string, right: string): number {  const a = parseLyricDuration(left)
  const b = parseLyricDuration(right)
  if (!a || !b) return 0.5
  const diff = Math.abs(a - b)
  if (diff <= 3) return 1
  if (diff <= 8) return 0.7
  if (diff <= DURATION_REJECT_SEC) return 0.35
  return 0
}

/** Title/artist used to search and score lyrics. Matched local uses catalog, not the file clock. */
export function lyricProbeSong(song: MusicInfo): MusicInfo {
  const { name, singer } = lyricSearchIdentity(song)
  const nextName = name || song.name
  const nextSinger = singer || song.singer
  const matchedLocal = song.source === "local" && Boolean(song.meta.wySongId)
  if (matchedLocal) {
    const catalogInterval = song.meta.catalogInterval?.trim()
    return {
      ...song,
      name: nextName,
      singer: nextSinger,
      interval: catalogInterval || "",
    }
  }
  if (nextName === song.name && nextSinger === song.singer) return song
  return { ...song, name: nextName, singer: nextSinger }
}

/** 0 = reject. Same recording only: tight title, artist (when known), duration. */
export function matchScore(song: MusicInfo, hit: MusicInfo): number {
  const probe = lyricProbeSong(song)
  const title = textScore(probe.name, hit.name)
  if (title < TITLE_MIN) return 0

  const localDur = parseLyricDuration(probe.interval)
  const hitDur = parseLyricDuration(hit.interval)
  if (localDur && hitDur && Math.abs(localDur - hitDur) > DURATION_REJECT_SEC) {
    return 0
  }
  const duration = durationScore(probe.interval, hit.interval)

  const artistUnknown =
    isPlaceholderArtist(probe.singer) || isPlaceholderArtist(hit.singer)
  if (artistUnknown) {
    if (title < 0.95) return 0
    if (
      !localDur ||
      !hitDur ||
      Math.abs(localDur - hitDur) > UNKNOWN_ARTIST_DURATION_SEC
    ) {
      return 0
    }
    return title * 0.9 + duration * 0.1
  }

  const artist = textScore(probe.singer, hit.singer)
  if (artist < ARTIST_MIN) return 0
  return title * 0.55 + artist * 0.35 + duration * 0.1
}

export function pickBestMatch(
  song: MusicInfo,
  list: MusicInfo[],
): MusicInfo | null {
  let best: MusicInfo | null = null
  let bestScore = 0
  for (const hit of list) {
    const score = matchScore(song, hit)
    if (score > bestScore) {
      best = hit
      bestScore = score
    }
  }
  return best
}

/**
 * Match hits when the platform spells the artist differently.
 *
 * The same artist is 爱缪 on QQ Music and あいみょん on NetEase/KuGou. `fold()`
 * cannot relate spellings that share no characters, so `matchScore` rejects
 * every hit and the caller sees "no lyrics on this platform" — measured, every
 * Aimyon hit scored exactly 0.000 across platforms. The platforms know their own
 * spelling, so each alternate is offered to the SAME scorer on its own: the
 * title strictness, the duration gate and every other rule are untouched, and
 * the alternate still has to clear `ARTIST_MIN` by itself.
 *
 * The alternates come from `platformArtistName`, which only reports a name the
 * platform confidently answered about, and a name that does not fit simply fails
 * to match — it cannot make a wrong song pass.
 */
export function pickBestMatchAcrossArtists(
  song: MusicInfo,
  list: MusicInfo[],
  alternateArtists: readonly string[],
): MusicInfo | null {
  const direct = pickBestMatch(song, list)
  if (direct) return direct

  const probe = lyricProbeSong(song)
  for (const candidate of alternateArtists) {
    const artist = candidate.trim()
    if (!artist || artist === probe.singer) continue
    const matched = pickBestMatch({ ...probe, singer: artist }, list)
    if (matched) return matched
  }
  return null
}

export function lyricSearchQueries(song: MusicInfo): string[] {
  const probe = lyricProbeSong(song)
  const name = isPlaceholderTitle(probe.name) ? "" : probe.name.trim()
  const singer = isPlaceholderArtist(probe.singer) ? "" : probe.singer.trim()
  const core = coreTitle(probe.name)
  const catalog = song.meta.catalogName?.trim()
  const queries: string[] = []
  for (const query of [
    [name, singer].filter(Boolean).join(" "),
    [core, singer].filter(Boolean).join(" "),
    catalog && catalog !== name ? [catalog, singer].filter(Boolean).join(" ") : "",
    singer ? "" : name,
    singer ? "" : core,
  ]) {
    if (query && !queries.includes(query)) queries.push(query)
  }
  return queries
}
