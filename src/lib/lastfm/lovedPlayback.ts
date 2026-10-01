import { pickBestMatch } from "@/lib/lyrics/matchSong";
import { sourceRunner } from "@/lib/sourceRunner";
import { searchKugou } from "@/lib/search/kg";
import { searchKuwo } from "@/lib/search/kuwo";
import { searchMigu } from "@/lib/search/mg";
import { searchTx } from "@/lib/search/tx";
import { searchWangyi } from "@/lib/search/wy";
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
/** Hits consulted when reading an artist's local spelling off a platform. */
const ARTIST_PROBE_LIMIT = 10;
const ARTIST_PROBE_TAKE = 5;
/**
 * How many of those hits the winning spelling must account for.
 *
 * One song by a name is not evidence that the platform knows the ARTIST — it can
 * be a single unrelated result — and acting on it would let the resolved name be
 * an arbitrary artist, whose same-titled song would then pass the strict
 * comparison. A real artist answers with several songs, so this is cheap and
 * almost never binding in the case the step exists for.
 */
const ARTIST_PROBE_MIN_HITS = 2;

const searchFns: Record<
  OnlineSource,
  (query: string, page?: number, limit?: number) => Promise<{ list: MusicInfo[] }>
> = {
  kw: searchKuwo,
  kg: searchKugou,
  tx: searchTx,
  wy: searchWangyi,
  mg: searchMigu,
};

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
 * The platform's own spelling of an artist.
 *
 * Searching the bare artist name returns that artist's songs, so the singer
 * shared by most of the answers is the name this platform uses. Measured:
 * "Aimyon" resolves to あいみょん on NetEase/KuGou/KuWo and to 爱缪 on QQ,
 * "Kenshi Yonezu" to 米津玄師 everywhere.
 *
 * It can be wrong when the platform does not know the artist at all — KuWo
 * answers "Ado" with 阿杜, a different Chinese singer — which is why the result
 * is only ever used as a NAME to search with and still has to survive the strict
 * comparison in `matchOn`. A bad spelling makes the lookup fail, not succeed
 * with the wrong song.
 *
 * Returns "" when the platform is not confidently answering about one artist, so
 * the caller skips the second attempt rather than searching for an arbitrary
 * name.
 */
async function platformArtistName(
  platform: OnlineSource,
  artist: string,
): Promise<string> {
  const { list } = await searchFns[platform](artist, 1, ARTIST_PROBE_LIMIT);
  const counts = new Map<string, number>();
  for (const hit of list.slice(0, ARTIST_PROBE_TAKE)) {
    const singer = (hit.singer ?? "").trim();
    if (singer) counts.set(singer, (counts.get(singer) ?? 0) + 1);
  }
  let best = "";
  let bestCount = 0;
  for (const [singer, count] of counts) {
    if (count > bestCount) {
      best = singer;
      bestCount = count;
    }
  }
  return bestCount >= ARTIST_PROBE_MIN_HITS ? best : "";
}

/** Queries to try for one spelling of the artist, most specific first. */
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
  const probe = probeFor(name, artist);
  for (const query of queriesFor(artist, name)) {
    try {
      const { list } = await searchFns[platform](query, 1, SEARCH_LIMIT);
      const hit = pickBestMatch(probe, list);
      if (hit) return hit;
    } catch {
      // A platform that is down or rate-limited must not stop the others.
    }
  }
  return null;
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
  return pickBestMatch(probeFor(track.name, track.artist), hits);
}
