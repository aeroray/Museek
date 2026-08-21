import { httpFetch } from "@/lib/http";
import { signatureParams } from "@/lib/platforms/kg/sign";
import { formatCommentTime } from "./time";
import type { CommentPage, CommentSort, SongComment } from "./types";

const ENTITY_MAP: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#039;": "'",
};

function decodeName(str: string | null | undefined): string {
  return (
    str?.replace(
      /(?:&amp;|&lt;|&gt;|&quot;|&apos;|&#039;|&nbsp;)/gm,
      (s) => ENTITY_MAP[s] ?? s,
    ) ?? ""
  );
}

interface KgAtUser {
  id?: number | string;
  name?: string;
}

interface KgCommentRaw {
  id?: number | string;
  content?: string;
  pcontent?: string;
  addtime?: string;
  location?: string;
  user_name?: string;
  user_pic?: string;
  user_id?: number | string;
  puser?: string;
  puser_id?: number | string;
  reply_num?: number;
  atlist?: KgAtUser[];
  images?: Array<{ url?: string }>;
  like?: { likenum?: number };
}

interface KgCommentResponse {
  err_code?: number;
  count?: number;
  list?: KgCommentRaw[];
}

function replaceAt(raw: string, atList: KgAtUser[] | undefined): string {
  if (!atList?.length) return raw;
  let next = raw;
  for (const at of atList) {
    if (at.id == null) continue;
    next = next.split(`[at=${at.id}]`).join(`@${at.name ?? ""} `);
  }
  return next;
}

function mapComment(item: KgCommentRaw): SongComment {
    const parsed = item.addtime ? new Date(item.addtime).getTime() : NaN;
    const time = Number.isFinite(parsed) ? parsed : null;
  const data: SongComment = {
    id: String(item.id ?? ""),
    text: decodeName(replaceAt(item.content ?? "", item.atlist)),
    images: item.images?.map((i) => i.url).filter((url): url is string => Boolean(url)),
    location: item.location,
    time,
    timeStr: formatCommentTime(time),
    userName: item.user_name ?? "",
    avatar: item.user_pic ?? null,
    userId: String(item.user_id ?? ""),
    likedCount: item.like?.likenum ?? null,
    replyNum: item.reply_num,
    reply: [],
  };
  if (!item.pcontent) return data;
  return {
    id: data.id,
    text: decodeName(item.pcontent),
    time: null,
    timeStr: "",
    userName: item.puser ?? "",
    avatar: null,
    userId: String(item.puser_id ?? ""),
    likedCount: null,
    reply: [data],
  };
}

export async function fetchKgComments(
  hash: string,
  sort: CommentSort,
  page: number,
  limit: number,
  signal?: AbortSignal,
): Promise<CommentPage> {
  const timestamp = Date.now();
  const params =
    `dfid=0&mid=16249512204336365674023395779019&clienttime=${timestamp}` +
    `&uuid=0&extdata=${hash}&appid=1005&code=fc4be23b4e972707f36b8a828a93ba8a` +
    `&schash=${hash}&clientver=11409&p=${page}&clienttoken=&pagesize=${limit}` +
    `&ver=10&kugouid=0`;
  const path = sort === "hot" ? "rank/topliked" : "rank/newest";
  const url =
    `http://m.comment.service.kugou.com/r/v1/${path}?${params}` +
    `&signature=${signatureParams(params)}`;
  const res = await httpFetch(url, {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36",
    },
    signal,
  });
  if (!res.ok) throw new Error(`KuGou comments HTTP ${res.status}`);
  const body = (await res.json()) as KgCommentResponse;
  if (body.err_code !== 0) throw new Error("KuGou comments failed");
  const total = body.count ?? 0;
  return {
    source: "kg",
    comments: (body.list ?? []).map(mapComment),
    total,
    page,
    limit,
    maxPage: Math.ceil(total / limit) || 1,
  };
}
