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
 * The matching is therefore strict and deliberately does not guess. A track that
 * cannot be matched confidently is reported as not found rather than played as
 * the closest thing — playing the wrong song silently is worse than saying so.
 */

const SEARCH_LIMIT = 20;

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
function probeFor(track: LovedTrackRef): MusicInfo {
  return {
    id: `lastfm-probe:${track.artist}:${track.name}`,
    name: track.name,
    singer: track.artist,
    source: "wy",
    interval: "",
    albumName: "",
    meta: { songId: "", qualitys: [], _qualitys: {} },
  };
}

/** Queries to try, most specific first. */
function queriesFor(track: LovedTrackRef): string[] {
  const artist = track.artist.trim();
  const name = track.name.trim();
  const out: string[] = [];
  if (artist && name) out.push(`${artist} ${name}`);
  if (name) out.push(name);
  return out;
}

/**
 * Find a playable track for a loved one, or null.
 *
 * Both the artist and the title must match: a title-only match is rejected by
 * `pickBestMatch`, because titles are not unique — searching あのね returns rows
 * by several different artists, and picking the first would play the wrong song.
 * The title-only QUERY is still tried, because the artist is often spelled
 * differently across services ("Aimyon" vs "爱缪") and a broader search is what
 * surfaces the right row for the strict comparison to accept.
 */
export async function resolveLovedTrack(
  track: LovedTrackRef,
  opts?: { platforms?: OnlineSource[] },
): Promise<MusicInfo | null> {
  const name = track.name.trim();
  if (!name) return null;
  const probe = probeFor(track);
  const platforms = opts?.platforms ?? lovedTrackPlatforms();

  for (const platform of platforms) {
    for (const query of queriesFor(track)) {
      try {
        const { list } = await searchFns[platform](query, 1, SEARCH_LIMIT);
        const hit = pickBestMatch(probe, list);
        if (hit) return hit;
      } catch {
        // A platform that is down or rate-limited must not stop the others.
      }
    }
  }
  return null;
}

/** Exposed for the check: whether a hit is the same song, without searching. */
export function lovedTrackMatches(
  track: LovedTrackRef,
  hits: MusicInfo[],
): MusicInfo | null {
  return pickBestMatch(probeFor(track), hits);
}
