import { httpFetch } from "@/lib/http";
import { asTimeMs, formatCommentTime } from "./time";
import type { CommentPage, CommentSort, SongComment } from "./types";

interface KwCommentRaw {
  id?: number | string;
  msg?: string;
  time?: number | string;
  u_name?: string;
  u_pic?: string;
  u_id?: number | string;
  like_num?: number | string;
  mpic?: string;
  child_comments?: KwCommentRaw[];
}

interface KwCommentResponse {
  code?: number | string;
  comments_counts?: number;
  hot_comments_counts?: number;
  comments?: KwCommentRaw[];
  hot_comments?: KwCommentRaw[];
}

/**
 * Decode a KuWo image path, tolerating malformed escapes.
 *
 * `decodeURIComponent` throws `URIError` on a lone `%` or an invalid sequence,
 * and KuWo's `mpic` field is remote data. A single bad path in one comment used
 * to abort the whole page's mapping, so the user saw "comments failed to load"
 * because of one broken avatar/attachment URL. One unusable image should cost one
 * image, not the page.
 */
function decodeImageUrl(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    // Already-encoded or malformed: the raw value is still the best guess.
    return raw || null;
  }
}

function mapComment(item: KwCommentRaw): SongComment {
  const time = asTimeMs(item.time);
  const image = item.mpic ? decodeImageUrl(item.mpic) : null;
  return {
    id: String(item.id ?? ""),
    text: item.msg ?? "",
    time,
    timeStr: formatCommentTime(time),
    userName: item.u_name ?? "",
    avatar: item.u_pic ?? null,
    userId: String(item.u_id ?? ""),
    likedCount: item.like_num != null ? Number(item.like_num) : null,
    images: image ? [image] : [],
    reply: (item.child_comments ?? []).map(mapComment),
  };
}

export async function fetchKwComments(
  songId: string,
  sort: CommentSort,
  page: number,
  limit: number,
  signal?: AbortSignal,
): Promise<CommentPage> {
  const type = sort === "hot" ? "get_rec_comment" : "get_comment";
  const start = limit * (page - 1);
  const url =
    `http://ncomment.kuwo.cn/com.s?f=web&type=${type}&aapiver=1` +
    `&prod=kwplayer_ar_10.5.2.0&digest=15&sid=${encodeURIComponent(songId)}` +
    `&start=${start}&msgflag=1&count=${limit}&newver=3&uid=0`;
  const res = await httpFetch(url, {
    method: "GET",
    headers: {
      "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 9;)",
    },
    signal,
  });
  if (!res.ok) throw new Error(`KuWo comments HTTP ${res.status}`);
  const body = (await res.json()) as KwCommentResponse;
  if (String(body.code) !== "200") throw new Error("KuWo comments failed");
  const raw = sort === "hot" ? body.hot_comments : body.comments;
  const total =
    (sort === "hot" ? body.hot_comments_counts : body.comments_counts) ?? 0;
  return {
    source: "kw",
    comments: (raw ?? []).map(mapComment),
    total,
    page,
    limit,
    maxPage: Math.ceil(total / limit) || 1,
  };
}
