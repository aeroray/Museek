import { searchKugou } from "@/lib/search/kg";
import { searchKuwo } from "@/lib/search/kuwo";
import { searchMigu } from "@/lib/search/mg";
import { searchTx } from "@/lib/search/tx";
import { searchWangyi } from "@/lib/search/wy";
import type { MusicInfo, OnlineSource } from "@/types/music";

/**
 * Matching a song across platforms, where the artist name is spelled differently.
 *
 * The same artist is 爱缪 on QQ Music, あいみょん on NetEase and KuGou, and
 * "Aimyon" in Last.fm's data. A `fold()`-based comparison cannot relate spellings
 * that share no characters, so a strict artist gate rejects every hit — which
 * silently disables two features at once: cross-platform lyrics, and playing a
 * Last.fm loved track.
 *
 * The platforms know the mapping themselves: searching the bare artist name on
 * QQ returns songs by 爱缪, and on NetEase returns songs by あいみょん. So the
 * platform's own spelling is read off the majority singer in its own results and
 * used for the comparison. Measured: "Aimyon" resolves to あいみょん on
 * NetEase/KuGou/KuWo and 爱缪 on QQ; "Kenshi Yonezu" to 米津玄師 on all four.
 *
 * The result is only ever used as a NAME to search and compare with — it never
 * decides a match by itself. A platform that does not know the artist can return
 * an unrelated one (KuWo answers "Ado" with 阿杜), so the resolved name still has
 * to pass the caller's own strict comparison, and one hit is not treated as
 * evidence that the platform knows the artist at all.
 */

export type PlatformSearch = (
  query: string,
  page?: number,
  limit?: number,
) => Promise<{ list: MusicInfo[] }>;

/** Every platform's song search, so callers do not each keep their own copy. */
export const platformSearchFns: Record<OnlineSource, PlatformSearch> = {
  kw: searchKuwo,
  kg: searchKugou,
  tx: searchTx,
  wy: searchWangyi,
  mg: searchMigu,
};

/** Hits consulted when reading an artist's local spelling off a platform. */
const ARTIST_PROBE_LIMIT = 10;
const ARTIST_PROBE_TAKE = 5;
/**
 * How many of those hits the winning spelling must account for.
 *
 * One song by a name is not evidence that the platform knows the ARTIST — it can
 * be a single unrelated result — and acting on it would let the resolved name be
 * an arbitrary artist whose same-titled song then passes the strict comparison.
 * A real artist answers with several songs, so this is cheap and almost never
 * binding in the case the step exists for.
 */
const ARTIST_PROBE_MIN_HITS = 2;

/**
 * The platform's own spelling of an artist, or "" when it is not confidently
 * answering about a single artist.
 */
export async function platformArtistName(
  platform: OnlineSource,
  artist: string,
): Promise<string> {
  const name = artist.trim();
  if (!name) return "";
  const { list } = await platformSearchFns[platform](
    name,
    1,
    ARTIST_PROBE_LIMIT,
  );
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
