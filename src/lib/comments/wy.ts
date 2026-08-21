import { httpFetch } from "@/lib/http";
import { weapi } from "@/lib/platforms/wy/weapi";
import { asTimeMs, formatCommentTime } from "./time";
import type { CommentPage, CommentSort, SongComment } from "./types";

const WY_HEADERS = {
  "Content-Type": "application/x-www-form-urlencoded",
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36",
  origin: "https://music.163.com",
  Referer: "https://music.163.com/",
  Cookie: "os=pc",
};

const EMOJIS: [string, string][] = [
  ["大笑", "😃"],
  ["可爱", "😊"],
  ["憨笑", "☺️"],
  ["色", "😍"],
  ["亲亲", "😙"],
  ["惊恐", "😱"],
  ["流泪", "😭"],
  ["亲", "😚"],
  ["呆", "😳"],
  ["哀伤", "😔"],
  ["呲牙", "😁"],
  ["吐舌", "😝"],
  ["撇嘴", "😒"],
  ["怒", "😡"],
  ["奸笑", "😏"],
  ["汗", "😓"],
  ["痛苦", "😖"],
  ["惶恐", "😰"],
  ["生病", "😨"],
  ["口罩", "😷"],
  ["大哭", "😂"],
  ["晕", "😵"],
  ["发怒", "👿"],
  ["开心", "😄"],
  ["鬼脸", "😜"],
  ["皱眉", "😞"],
  ["流感", "😢"],
  ["爱心", "❤️"],
  ["心碎", "💔"],
  ["钟情", "💘"],
  ["星星", "⭐️"],
  ["生气", "💢"],
  ["便便", "💩"],
  ["强", "👍"],
  ["弱", "👎"],
  ["拜", "🙏"],
];

function applyEmoji(text: string): string {
  let next = text;
  for (const [name, emoji] of EMOJIS) {
    next = next.split(`[${name}]`).join(emoji);
  }
  return next;
}

interface WyUser {
  nickname?: string;
  avatarUrl?: string;
  userId?: number | string;
}

interface WyCommentRaw {
  commentId?: number | string;
  content?: string;
  time?: number;
  likedCount?: number;
  ipLocation?: { location?: string };
  user?: WyUser;
  beReplied?: Array<{
    beRepliedCommentId?: number | string;
    content?: string;
    ipLocation?: { location?: string };
    user?: WyUser;
  }>;
}

interface WyNewCommentResponse {
  code?: number;
  data?: {
    comments?: WyCommentRaw[];
    totalCount?: number;
    cursor?: string;
  };
}

interface WyHotCommentResponse {
  code?: number;
  total?: number;
  hotComments?: WyCommentRaw[];
}

const latestCursor = new Map<string, string>();

function mapComment(item: WyCommentRaw): SongComment {
  const time = asTimeMs(item.time);
  const main: SongComment = {
    id: String(item.commentId ?? ""),
    text: item.content ? applyEmoji(item.content) : "",
    time,
    timeStr: formatCommentTime(time),
    userName: item.user?.nickname ?? "",
    avatar: item.user?.avatarUrl ?? null,
    userId: String(item.user?.userId ?? ""),
    likedCount: item.likedCount ?? null,
    location: item.ipLocation?.location,
    reply: [],
  };
  const quoted = item.beReplied?.[0];
  if (!quoted) return main;
  return {
    ...main,
    reply: [
      {
        id: String(quoted.beRepliedCommentId ?? `${main.id}-quoted`),
        text: quoted.content ? applyEmoji(quoted.content) : "",
        time: null,
        timeStr: "",
        userName: quoted.user?.nickname ?? "",
        avatar: quoted.user?.avatarUrl ?? null,
        userId: String(quoted.user?.userId ?? ""),
        likedCount: null,
        location: quoted.ipLocation?.location,
        reply: [],
      },
    ],
  };
}

async function postWeapi<T>(
  url: string,
  payload: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const res = await httpFetch(url, {
    method: "POST",
    headers: WY_HEADERS,
    body: new URLSearchParams(weapi(payload)).toString(),
    signal,
  });
  if (!res.ok) throw new Error(`NetEase comments HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function fetchWyComments(
  songId: string,
  sort: CommentSort,
  page: number,
  limit: number,
  signal?: AbortSignal,
): Promise<CommentPage> {
  const threadId = `R_SO_4_${songId}`;

  if (sort === "hot") {
    const body = await postWeapi<WyHotCommentResponse>(
      `https://music.163.com/weapi/v1/resource/hotcomments/${threadId}`,
      {
        rid: threadId,
        limit,
        offset: limit * (page - 1),
        beforeTime: Date.now().toString(),
      },
      signal,
    );
    if (body.code !== 200) throw new Error("NetEase hot comments failed");
    const total = body.total ?? 0;
    return {
      source: "wy",
      comments: (body.hotComments ?? []).map(mapComment),
      total,
      page,
      limit,
      maxPage: Math.ceil(total / limit) || 1,
    };
  }

  if (page === 1) latestCursor.delete(songId);
  const cursor =
    page === 1 ? String(Date.now()) : (latestCursor.get(songId) ?? String(Date.now()));
  const body = await postWeapi<WyNewCommentResponse>(
    "https://music.163.com/weapi/comment/resource/comments/get",
    {
      cursor,
      offset: 0,
      orderType: 1,
      pageNo: page,
      pageSize: limit,
      rid: threadId,
      threadId,
    },
    signal,
  );
  if (body.code !== 200) throw new Error("NetEase comments failed");
  if (body.data?.cursor) latestCursor.set(songId, String(body.data.cursor));
  const total = body.data?.totalCount ?? 0;
  return {
    source: "wy",
    comments: (body.data?.comments ?? []).map(mapComment),
    total,
    page,
    limit,
    maxPage: Math.ceil(total / limit) || 1,
  };
}
