import { httpFetch } from "@/lib/http";
import { asTimeMs, formatCommentTime } from "./time";
import type { CommentPage, CommentSort, SongComment } from "./types";

const TX_HEADERS = {
  Referer: "https://y.qq.com/",
  origin: "https://y.qq.com",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
};

const EMOJIS: Record<string, string> = {
  e400846: "😘",
  e400874: "😴",
  e400825: "😃",
  e400847: "😙",
  e400835: "😍",
  e400873: "😳",
  e400836: "😎",
  e400867: "😭",
  e400832: "😊",
  e400837: "😏",
  e400875: "😫",
  e400831: "😉",
  e400855: "😡",
  e400823: "😄",
  e400862: "😨",
  e400844: "😖",
  e400841: "😓",
  e400830: "😈",
  e400828: "😆",
  e400833: "😋",
  e400822: "😀",
  e400843: "😕",
  e400829: "😇",
  e400824: "😂",
  e400834: "😌",
  e400877: "😷",
  e400132: "🍉",
  e400181: "🍺",
  e401067: "☕️",
  e400343: "🐷",
  e400116: "🌹",
  e400613: "💋",
  e401236: "❤️",
  e400622: "💔",
  e400643: "💩",
  e400420: "👏",
  e400408: "👍",
  e400414: "👎",
  e400402: "👌",
  e400932: "🙏",
  e400644: "💪",
  e400768: "🔥",
  e400432: "👑",
};

function replaceEmoji(msg: string): string {
  const tokens = msg.match(/\[em\]e\d+\[\/em\]/g);
  if (!tokens) return msg;
  let next = msg;
  for (const token of new Set(tokens)) {
    const code = token.replace(/^\[em\](e\d+)\[\/em\]$/, "$1");
    next = next.split(token).join(EMOJIS[code] ?? "");
  }
  return next.replace(/\\n/g, "\n");
}

interface TxTrackInfoResponse {
  code?: number;
  req?: {
    code?: number;
    data?: { track_info?: { id?: number | string } };
  };
}

interface TxH5CommentRaw {
  commentid?: string;
  rootcommentid?: string;
  rootcommentcontent?: string;
  rootcommentnick?: string;
  avatarurl?: string;
  encrypt_rootcommentuin?: string;
  praisenum?: number;
  time?: number | string;
  middlecommentcontent?: Array<{
    subcommentid?: string;
    subcommentcontent?: string;
    replynick?: string;
    avatarurl?: string;
    encrypt_replyuin?: string;
    praisenum?: number;
  }>;
}

interface TxH5CommentResponse {
  code?: number;
  comment?: {
    commentlist?: TxH5CommentRaw[];
    commenttotal?: number;
  };
}

interface TxHotCommentRaw {
  SeqNo?: string;
  CmId?: string;
  Content?: string;
  PubTime?: number | string;
  Nick?: string;
  Pic?: string;
  Avatar?: string;
  Location?: string;
  EncryptUin?: string;
  PraiseNum?: number;
  SubComments?: TxHotCommentRaw[];
}

interface TxHotCommentResponse {
  code?: number;
  req?: {
    code?: number;
    data?: {
      CommentList?: {
        Comments?: TxHotCommentRaw[];
        Total?: number;
      };
    };
  };
}

const songIdCache = new Map<string, Promise<string | null>>();

async function getNumericSongId(
  songmid: string,
  signal?: AbortSignal,
): Promise<string | null> {
  if (/^\d+$/.test(songmid)) return songmid;
  const cached = songIdCache.get(songmid);
  if (cached) return cached;

  const request = (async () => {
    const res = await httpFetch("https://u.y.qq.com/cgi-bin/musicu.fcg", {
      method: "POST",
      headers: {
        ...TX_HEADERS,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        comm: { ct: "19", cv: "1859", uin: "0" },
        req: {
          module: "music.pf_song_detail_svr",
          method: "get_song_detail_yqq",
          param: { song_type: 0, song_mid: songmid },
        },
      }),
      signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as TxTrackInfoResponse;
    const id = data.req?.data?.track_info?.id;
    return data.code === 0 && data.req?.code === 0 && id != null
      ? String(id)
      : null;
  })();

  songIdCache.set(songmid, request);
  try {
    return await request;
  } catch {
    songIdCache.delete(songmid);
    return null;
  }
}

function mapH5Comment(item: TxH5CommentRaw): SongComment {
  const time = asTimeMs(
    String(item.time ?? "").length < 10 ? null : Number(item.time) * 1000,
  );
  return {
    id: `${item.rootcommentid ?? ""}_${item.commentid ?? ""}`,
    text: item.rootcommentcontent
      ? replaceEmoji(item.rootcommentcontent)
      : "",
    time,
    timeStr: formatCommentTime(time),
    userName: item.rootcommentnick ? item.rootcommentnick.replace(/^@/, "") : "",
    avatar: item.avatarurl ?? null,
    userId: item.encrypt_rootcommentuin ?? "",
    likedCount: item.praisenum ?? null,
    reply: (item.middlecommentcontent ?? []).map((c) => ({
      id: `sub_${item.rootcommentid ?? ""}_${c.subcommentid ?? ""}`,
      text: c.subcommentcontent ? replaceEmoji(c.subcommentcontent) : "",
      time: null,
      timeStr: "",
      userName: c.replynick ? c.replynick.replace(/^@/, "") : "",
      avatar: c.avatarurl ?? null,
      userId: c.encrypt_replyuin ?? "",
      likedCount: c.praisenum ?? null,
      reply: [],
    })),
  };
}

function mapHotComment(item: TxHotCommentRaw): SongComment {
  const pub = item.PubTime;
  const time = asTimeMs(
    pub == null || String(pub).length < 10 ? null : Number(pub) * 1000,
  );
  return {
    id: `${item.SeqNo ?? ""}_${item.CmId ?? ""}`,
    text: item.Content ? replaceEmoji(item.Content) : "",
    time,
    timeStr: formatCommentTime(time),
    userName: item.Nick ?? "",
    images: item.Pic ? [item.Pic] : [],
    avatar: item.Avatar ?? null,
    location: item.Location,
    userId: item.EncryptUin ?? "",
    likedCount: item.PraiseNum ?? null,
    reply: (item.SubComments ?? []).map(mapHotComment),
  };
}

export async function fetchTxComments(
  songmid: string,
  sort: CommentSort,
  page: number,
  limit: number,
  signal?: AbortSignal,
): Promise<CommentPage> {
  const songId = await getNumericSongId(songmid, signal);
  if (!songId) throw new Error("QQ comments: missing song id");

  if (sort === "hot") {
    const res = await httpFetch("https://u.y.qq.com/cgi-bin/musicu.fcg", {
      method: "POST",
      headers: {
        ...TX_HEADERS,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        comm: {
          cv: 4747474,
          ct: 24,
          format: "json",
          inCharset: "utf-8",
          outCharset: "utf-8",
          notice: 0,
          platform: "yqq.json",
          needNewCode: 1,
          uin: 0,
        },
        req: {
          module: "music.globalComment.CommentRead",
          method: "GetHotCommentList",
          param: {
            BizType: 1,
            BizId: String(songId),
            LastCommentSeqNo: "",
            PageSize: limit,
            PageNum: page - 1,
            HotType: 1,
            WithAirborne: 0,
            PicEnable: 1,
          },
        },
      }),
      signal,
    });
    if (!res.ok) throw new Error(`QQ hot comments HTTP ${res.status}`);
    const body = (await res.json()) as TxHotCommentResponse;
    if (body.code !== 0 || body.req?.code !== 0) {
      throw new Error("QQ hot comments failed");
    }
    const list = body.req?.data?.CommentList;
    const total = list?.Total ?? 0;
    return {
      source: "tx",
      comments: (list?.Comments ?? []).map(mapHotComment),
      total,
      page,
      limit,
      maxPage: Math.ceil(total / limit) || 1,
    };
  }

  const form = {
    uin: "0",
    format: "json",
    cid: "205360772",
    reqtype: "2",
    biztype: "1",
    topid: songId,
    cmd: "8",
    needmusiccrit: "1",
    pagenum: String(page - 1),
    pagesize: String(limit),
  };
  const res = await httpFetch(
    "https://c.y.qq.com/base/fcgi-bin/fcg_global_comment_h5.fcg",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent":
          "Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; WOW64; Trident/5.0)",
      },
      body: new URLSearchParams(form).toString(),
      signal,
    },
  );
  if (!res.ok) throw new Error(`QQ comments HTTP ${res.status}`);
  const body = (await res.json()) as TxH5CommentResponse;
  if (body.code !== 0) throw new Error("QQ comments failed");
  const total = body.comment?.commenttotal ?? 0;
  return {
    source: "tx",
    comments: (body.comment?.commentlist ?? []).map(mapH5Comment),
    total,
    page,
    limit,
    maxPage: Math.ceil(total / limit) || 1,
  };
}
