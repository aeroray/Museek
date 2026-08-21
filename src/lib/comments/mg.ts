import { httpFetch } from "@/lib/http";
import { asTimeMs, formatCommentTime } from "./time";
import type { CommentPage, CommentSort, SongComment } from "./types";

const MG_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1",
};

interface MgUser {
  nickName?: string;
  userId?: string;
  middleIcon?: string;
  bigIcon?: string;
  smallIcon?: string;
}

interface MgReplyRaw {
  replyId?: string;
  replyInfo?: string;
  replyTime?: string;
  user?: MgUser;
}

interface MgCommentRaw {
  commentId?: string;
  commentInfo?: string;
  commentTime?: string;
  replyTotalCount?: number;
  user?: MgUser;
  opNumItem?: { thumbNum?: number };
  replyComments?: MgReplyRaw[];
}

interface MgCommentResponse {
  code?: string;
  data?: {
    comments?: MgCommentRaw[];
    hotComments?: MgCommentRaw[];
    commentNums?: string | number;
    cfgHotCount?: string | number;
  };
}

const lastCommentIds = new Map<string, string>();

function avatarOf(user: MgUser | undefined): string | null {
  return user?.middleIcon || user?.bigIcon || user?.smallIcon || null;
}

function mapReply(item: MgReplyRaw): SongComment {
  const time = asTimeMs(item.replyTime ? Date.parse(item.replyTime) : null);
  return {
    id: item.replyId ?? "",
    text: item.replyInfo ?? "",
    time,
    timeStr: formatCommentTime(time),
    userName: item.user?.nickName ?? "",
    avatar: avatarOf(item.user),
    userId: item.user?.userId ?? "",
    likedCount: null,
    reply: [],
  };
}

function mapComment(item: MgCommentRaw): SongComment {
  const time = asTimeMs(item.commentTime ? Date.parse(item.commentTime) : null);
  return {
    id: item.commentId ?? "",
    text: item.commentInfo ?? "",
    time,
    timeStr: formatCommentTime(time),
    userName: item.user?.nickName ?? "",
    avatar: avatarOf(item.user),
    userId: item.user?.userId ?? "",
    likedCount: item.opNumItem?.thumbNum ?? null,
    replyNum: item.replyTotalCount,
    reply: (item.replyComments ?? []).map(mapReply),
  };
}

export async function fetchMgComments(
  songId: string,
  sort: CommentSort,
  page: number,
  limit: number,
  signal?: AbortSignal,
): Promise<CommentPage> {
  if (sort === "hot") {
    const url =
      `https://app.c.nf.migu.cn/MIGUM3.0/user/comment/stack/v1.0` +
      `?pageSize=${limit}&queryType=2&resourceId=${encodeURIComponent(songId)}` +
      `&resourceType=2&hotCommentStart=${(page - 1) * limit}`;
    const res = await httpFetch(url, { method: "GET", headers: MG_HEADERS, signal });
    if (!res.ok) throw new Error(`Migu hot comments HTTP ${res.status}`);
    const body = (await res.json()) as MgCommentResponse;
    if (body.code !== "000000") throw new Error("Migu hot comments failed");
    const total = Number(body.data?.cfgHotCount ?? 0) || 0;
    return {
      source: "mg",
      comments: (body.data?.hotComments ?? []).map(mapComment),
      total,
      page,
      limit,
      maxPage: Math.ceil(total / limit) || 1,
    };
  }

  const key = songId;
  if (page === 1) lastCommentIds.delete(key);
  const lastId = lastCommentIds.get(`${key}:${page}`) ?? "";
  if (!lastId && page > 1) throw new Error("Migu comments: missing cursor");
  const url =
    `https://app.c.nf.migu.cn/MIGUM3.0/user/comment/stack/v1.0` +
    `?pageSize=${limit}&queryType=1&resourceId=${encodeURIComponent(songId)}` +
    `&resourceType=2&commentId=${encodeURIComponent(lastId)}`;
  const res = await httpFetch(url, { method: "GET", headers: MG_HEADERS, signal });
  if (!res.ok) throw new Error(`Migu comments HTTP ${res.status}`);
  const body = (await res.json()) as MgCommentResponse;
  if (body.code !== "000000") throw new Error("Migu comments failed");
  const list = (body.data?.comments ?? []).map(mapComment);
  const tail = list.length ? list[list.length - 1].id : "";
  lastCommentIds.set(`${key}:${page + 1}`, tail);
  const total = Number(body.data?.commentNums ?? 0) || 0;
  return {
    source: "mg",
    comments: list,
    total,
    page,
    limit,
    maxPage: Math.ceil(total / limit) || 1,
  };
}
