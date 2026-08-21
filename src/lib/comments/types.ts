import type { OnlineSource } from "@/types/music";

export type CommentSort = "hot" | "new";

export interface SongComment {
  id: string;
  text: string;
  time: number | null;
  timeStr: string;
  userName: string;
  avatar: string | null;
  userId: string;
  likedCount: number | null;
  location?: string;
  images?: string[];
  replyNum?: number;
  reply: SongComment[];
}

export interface CommentPage {
  source: OnlineSource | "local";
  comments: SongComment[];
  total: number;
  page: number;
  limit: number;
  maxPage: number;
  unsupported?: boolean;
}
