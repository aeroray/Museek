import { matchScore, splitArtists } from "@/lib/lyrics/matchSong";
import { platformArtistName, platformSearchFns } from "@/lib/platformArtist";
import { sourceRunner } from "@/lib/sourceRunner";
import type { MusicInfo, OnlineSource } from "@/types/music";

/**
 * Turning a Last.fm loved track into something playable.
 *
 * A loved track is an artist and a title and nothing else — Last.fm has no idea
 * which platform it came from, and no id any source script could resolve. So it
 * has to be FOUND on a platform first, and finding is fallible in a way that
 * playing is not: the search can return a different recording of the same title,
 * which is exactly the failure that makes a user say "I played X and heard Y".
 *
 * The matching is therefore strict, and a track that cannot be matched is
 * reported as not found rather than played as the closest thing.
 *
 * THE CATCH, and the reason this file is not a one-liner: strict artist matching
 * is impossible across services when the names share no characters. Last.fm
 * stores "Aimyon"; QQ Music calls the same artist 爱缪 and NetEase calls her
 * あいみょん. Measured against the live APIs, `matchScore` rejects every hit for
 * such a pair, so the naive version of this function played nothing at all for
 * any artist whose name is not already spelled the way the platform spells it.
 *
 * The platforms themselves know the mapping — searching "Aimyon" on QQ returns
 * songs by 爱缪 — so the platform's own spelling is asked for and then used for
 * the strict comparison. That keeps the comparison strict (no title-only
 * guessing) while removing the one thing that could never work.
 */

const SEARCH_LIMIT = 20;

/** The minimum a loved track has to carry to be looked up. */
export type LovedTrackRef = { name: string; artist: string };

/**
 * Where to look, best first.
 *
 * NetEase leads because it has a built-in URL resolver, so a loved track can
 * play with no source script for it at all. The rest are the platforms the
 * user's scripts actually declare — searching one they have no script for could
 * only produce a track that cannot be played.
 */
export function lovedTrackPlatforms(): OnlineSource[] {
  const out: OnlineSource[] = ["wy"];
  for (const platform of sourceRunner.servedPlatforms()) {
    if (!out.includes(platform)) out.push(platform);
  }
  return out;
}

/**
 * A stand-in song to score search hits against.
 *
 * `pickBestMatch` reads a `MusicInfo`, but a loved track is not one and inventing
 * a fake `songId` would be a lie the rest of the app might act on. The value is
 * never played, never dispatched and never persisted — it exists only to be
 * compared — so the id is marked as a probe and the duration is left unknown,
 * which makes the scorer skip its duration gate instead of rejecting every hit
 * for having no length to compare.
 */
function probeFor(name: string, artist: string): MusicInfo {
  return {
    id: `lastfm-probe:${artist}:${name}`,
    name,
    singer: artist,
    source: "wy",
    interval: "",
    albumName: "",
    meta: { songId: "", qualitys: [], _qualitys: {} },
  };
}

/**
 * Queries to try for one spelling of the artist, most specific first.
 */
function queriesFor(artist: string, name: string): string[] {
  const out: string[] = [];
  if (artist && name) out.push(`${artist} ${name}`);
  // A title-only QUERY is safe here because the artist is still enforced by the
  // strict comparison below; it only widens what the comparison gets to look at.
  if (name) out.push(name);
  return out;
}

/** Strict-match `name` by `artist` against a platform's hits. */
async function matchOn(
  platform: OnlineSource,
  artist: string,
  name: string,
): Promise<MusicInfo | null> {
  const loved = { name, artist };
  for (const query of queriesFor(artist, name)) {
    try {
      const { list } = await platformSearchFns[platform](query, 1, SEARCH_LIMIT);
      const hit = pickLovedMatch(loved, list);
      if (hit) return hit;
    } catch {
      // A platform that is down or rate-limited must not stop the others.
    }
  }
  return null;
}

/**
 * Score one hit against a loved track.
 *
 * `matchScore` compares the whole artist strings, which fails whenever the
 * platform credits more artists than Last.fm stored. Reported: the loved track
 * 冷冰冰 names only 元, NetEase credits 元、鱼骨妹, and `textScore("元",
 * "元 鱼骨妹")` is 0 — a one-character name inside a longer string is thrown out
 * by the ratio guard, which exists to stop "BGM" matching "Epic Battle BGM".
 * The song was therefore reported as not found even though the platform had it,
 * and even though the user had it in their own favourites.
 *
 * Each credited artist is offered to the SAME scorer on its own, so the title
 * strictness, the duration gate and every other rule are untouched — only the
 * set of names the artist may match grows, and each still has to clear
 * `ARTIST_MIN` by itself.
 */
export function lovedScore(loved: LovedTrackRef, hit: MusicInfo): number {
  const probe = probeFor(loved.name, loved.artist);
  const direct = matchScore(probe, hit);
  if (direct > 0) return direct;
  let best = 0;
  for (const part of splitArtists(hit.singer)) {
    if (part === hit.singer) continue;
    const score = matchScore(probe, { ...hit, singer: part });
    if (score > best) best = score;
  }
  return best;
}

/** The best hit for a loved track out of `list`, or null when none matches. */
export function pickLovedMatch(
  loved: LovedTrackRef,
  list: MusicInfo[],
): MusicInfo | null {
  let best: MusicInfo | null = null;
  let bestScore = 0;
  for (const hit of list) {
    const score = lovedScore(loved, hit);
    if (score > bestScore) {
      best = hit;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Find a playable track for a loved one, or null.
 *
 * Two attempts per platform. The first uses the artist name exactly as Last.fm
 * has it, which is all that is needed when the user loved the song from Museek
 * (the scrobble carried the platform's own spelling). The second asks the
 * platform what it calls that artist and retries, which is what makes a romaji
 * name resolvable at all.
 */
export async function resolveLovedTrack(
  track: LovedTrackRef,
  opts?: { platforms?: OnlineSource[] },
): Promise<MusicInfo | null> {
  const name = track.name.trim();
  const artist = track.artist.trim();
  if (!name) return null;
  const platforms = opts?.platforms ?? lovedTrackPlatforms();

  for (const platform of platforms) {
    const direct = await matchOn(platform, artist, name);
    if (direct) return direct;
    if (!artist) continue;
    try {
      const local = await platformArtistName(platform, artist);
      // Nothing gained when the platform spells it the same way.
      if (local && local !== artist) {
        const resolved = await matchOn(platform, local, name);
        if (resolved) return resolved;
      }
    } catch {
      // try the next platform
    }
  }
  return null;
}

/** Exposed for the check: whether a hit is the same song, without searching. */
export function lovedTrackMatches(
  track: LovedTrackRef,
  hits: MusicInfo[],
): MusicInfo | null {
  return pickLovedMatch(track, hits);
}
