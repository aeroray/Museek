import { useState } from "react";
import { Loader2, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSongComments } from "@/lib/comments/useSongComments";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { MusicInfo } from "@/types/music";
import type { CommentSort, SongComment } from "@/lib/comments";

function CommentAvatar({ name, src }: { name: string; src: string | null }) {
  const initial = name.trim().slice(0, 1) || "?";
  return (
    <div className="relative mt-0.5 h-8 w-8 shrink-0 overflow-hidden rounded-full bg-muted/80 text-[11px] font-medium text-muted-foreground">
      <span className="flex h-full w-full items-center justify-center">
        {initial}
      </span>
      {src ? (
        <img
          src={src}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : null}
    </div>
  );
}

function CommentItem({
  comment,
  nested = false,
}: {
  comment: SongComment;
  nested?: boolean;
}) {
  return (
    <article className={cn("flex gap-2.5", nested && "mt-2")}>
      <CommentAvatar name={comment.userName} src={comment.avatar} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className="truncate text-[13px] font-medium text-foreground/90">
            {comment.userName || "—"}
          </p>
          {comment.timeStr ? (
            <time className="shrink-0 font-sans text-[11px] tabular-nums text-muted-foreground/70">
              {comment.timeStr}
            </time>
          ) : null}
        </div>
        {comment.location ? (
          <p className="mt-0.5 text-[11px] text-muted-foreground/55">
            {comment.location}
          </p>
        ) : null}
        {comment.text ? (
          <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground/80">
            {comment.text}
          </p>
        ) : null}
        {comment.images?.map((src) => (
          <img
            key={src}
            src={src}
            alt=""
            className="mt-2 max-h-32 max-w-full rounded-md object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ))}
        {comment.likedCount != null && comment.likedCount > 0 ? (
          <p className="mt-1.5 flex items-center gap-1 text-[11px] tabular-nums text-muted-foreground/60">
            <ThumbsUp size={11} strokeWidth={2} />
            {comment.likedCount}
          </p>
        ) : null}
        {comment.reply.length > 0 ? (
          <div className="mt-2 rounded-lg bg-background/40 px-2.5 py-2">
            {comment.reply.map((reply) => (
              <CommentItem key={reply.id} comment={reply} nested />
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function CommentsPanel({
  song,
  open,
}: {
  song: MusicInfo | null;
  open: boolean;
}) {
  const t = useT();
  const [sort, setSort] = useState<CommentSort>("hot");
  const {
    comments,
    total,
    loading,
    loadingMore,
    failed,
    unsupported,
    hasMore,
    loadMore,
  } = useSongComments(song, sort, open);

  if (!open) return null;

  const empty = !loading && !failed && comments.length === 0;

  return (
    <aside
      className={cn(
        "flex h-full w-[22rem] shrink-0 flex-col border-l border-white/10 bg-background/45 backdrop-blur-xl",
        "animate-in fade-in slide-in-from-right-4 duration-300",
      )}
      aria-label={t("comments.title")}
    >
      <header className="flex items-start justify-between gap-3 px-4 pb-3 pt-4 pr-14">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">
            {t("comments.title")}
          </h2>
          {total > 0 ? (
            <p className="mt-0.5 font-sans text-[11px] tabular-nums text-muted-foreground/70">
              {t("comments.count", { n: total })}
            </p>
          ) : null}
        </div>
        <div className="flex rounded-lg bg-background/50 p-0.5">
          {(["hot", "new"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={cn(
                "rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors duration-150",
                sort === value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground/70 hover:text-foreground",
              )}
              onClick={() => setSort(value)}
            >
              {t(value === "hot" ? "comments.hot" : "comments.new")}
            </button>
          ))}
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Loader2 size={22} className="animate-spin" />
            <p className="text-xs">{t("comments.loading")}</p>
          </div>
        ) : failed ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            {t("comments.failed")}
          </div>
        ) : unsupported ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            {t("comments.local")}
          </div>
        ) : empty ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            {song ? t("comments.empty") : t("lyrics.selectSong")}
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-4 px-4 pb-8 pr-14">
              {comments.map((comment) => (
                <CommentItem key={comment.id} comment={comment} />
              ))}
              {hasMore ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="self-center text-muted-foreground"
                  onClick={loadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    t("comments.more")
                  )}
                </Button>
              ) : null}
            </div>
          </ScrollArea>
        )}
      </div>
    </aside>
  );
}
