import { useEffect, useRef, useState } from "react";
import { Loader2, ScanSearch, AudioLines } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CoverImage } from "@/components/common/CoverImage";
import { recognizeLocalFile, localTrackUntagged } from "@/lib/localMusic";
import { useLocalMusicStore } from "@/stores/localMusicStore";
import type { MusicInfo } from "@/types/music";
import { useT, t as translate } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function MatchOnlineDialog({
  trackId,
  open,
  onOpenChange,
  onApplied,
}: {
  trackId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied: (status: "applied" | "unchanged" | "miss" | "error") => void;
}) {
  const t = useT();
  const applyOnlineMatch = useLocalMusicStore((s) => s.applyOnlineMatch);
  const track = useLocalMusicStore((s) =>
    trackId ? (s.tracks.find((item) => item.id === trackId) ?? null) : null,
  );

  const [loading, setLoading] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [hits, setHits] = useState<MusicInfo[]>([]);
  const [recommendedId, setRecommendedId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [canRecognize, setCanRecognize] = useState(false);
  const [fromRecognize, setFromRecognize] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    if (!open || !trackId) return;
    let cancelled = false;
    setLoading(true);
    setRecognizing(false);
    setApplying(false);
    setHits([]);
    setRecommendedId(null);
    setSelectedId(null);
    setQuery("");
    setCanRecognize(false);
    setFromRecognize(false);
    setError(null);

    const watchdog = window.setTimeout(() => {
      if (cancelled) return;
      setLoading(false);
      const current = useLocalMusicStore
        .getState()
        .tracks.find((item) => item.id === trackId);
      if (current && localTrackUntagged(current)) setCanRecognize(true);
    }, 8_000);

    void useLocalMusicStore
      .getState()
      .previewOnlineMatch(trackId)
      .then((preview) => {
        if (cancelled) return;
        setLoading(false);
        if (!preview) {
          setError(
            translate("local.matchFailed", {
              msg: translate("local.fileUnreadable"),
            }),
          );
          return;
        }
        setHits(preview.hits);
        setRecommendedId(preview.recommended?.id ?? null);
        setSelectedId(preview.recommended?.id ?? preview.hits[0]?.id ?? null);
        setQuery(preview.query);
        setCanRecognize(preview.canRecognize);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
        setError(
          translate("local.matchFailed", {
            msg: translate("local.matchEmpty"),
          }),
        );
      })
      .finally(() => {
        window.clearTimeout(watchdog);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(watchdog);
    };
  }, [open, trackId]);

  const onRecognize = async () => {
    if (!track?.filePath || recognizing || applying) return;
    setRecognizing(true);
    setError(null);
    try {
      const songs = await recognizeLocalFile(track.filePath);
      if (!openRef.current) return;
      if (!songs.length) {
        setError(t("local.matchRecognizeNone"));
        return;
      }
      setHits(songs);
      setRecommendedId(songs[0]?.id ?? null);
      setSelectedId(songs[0]?.id ?? null);
      setFromRecognize(true);
    } catch (e) {
      if (!openRef.current) return;
      setError((e as Error).message || t("local.matchRecognizeFailed"));
    } finally {
      setRecognizing(false);
    }
  };

  const onConfirm = async () => {
    if (!trackId || !selectedId || applying) return;
    const hit = hits.find((item) => item.id === selectedId);
    if (!hit) return;
    setApplying(true);
    try {
      const status = await applyOnlineMatch(trackId, hit);
      onApplied(status);
      if (status !== "error") onOpenChange(false);
    } finally {
      setApplying(false);
    }
  };

  const selected = hits.find((item) => item.id === selectedId) ?? null;
  const busy = loading || recognizing || applying;
  const untagged = Boolean(
    canRecognize || (track && localTrackUntagged(track)),
  );
  const recognizeHint =
    untagged && !fromRecognize
      ? recommendedId
        ? "local.matchRecognizeHintWeak"
        : "local.matchRecognizeHintEmpty"
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("local.matchPickTitle")}</DialogTitle>
          <DialogDescription className="truncate">
            {track
              ? `${track.song.name} · ${track.song.singer}`
              : t("local.matchPickDesc")}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-4 py-10">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin" />
              {t("local.matchSearching")}
            </div>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        ) : (
          <div className="min-w-0 space-y-3 overflow-x-hidden">
            {query && !fromRecognize ? (
              <p className="truncate text-xs text-muted-foreground">
                {t("local.matchQuery", { q: query })}
              </p>
            ) : null}
            {fromRecognize ? (
              <p className="text-xs text-muted-foreground">
                {t("local.matchRecognizeResults")}
              </p>
            ) : null}
            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : null}
            {hits.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t("local.matchEmpty")}
              </p>
            ) : (
              <div className="max-h-[min(20rem,50vh)] min-w-0 overflow-y-auto overflow-x-hidden">
                <div className="flex min-w-0 flex-col gap-1">
                  {hits.map((hit) => {
                    const isSel = hit.id === selectedId;
                    const isRec = hit.id === recommendedId;
                    return (
                      <button
                        key={hit.id}
                        type="button"
                        disabled={busy}
                        onClick={() => setSelectedId(hit.id)}
                        className={cn(
                          "flex min-w-0 w-full items-center gap-3 overflow-hidden rounded-xl px-2.5 py-2 text-left transition-colors",
                          isSel
                            ? "bg-primary/10 ring-1 ring-primary/30"
                            : "hover:bg-accent/60",
                        )}
                      >
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                          {hit.meta.picUrl ? (
                            <CoverImage
                              src={hit.meta.picUrl}
                              className="h-10 w-10"
                              showOutline={false}
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                              <ScanSearch size={16} />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <p className="min-w-0 truncate text-sm font-medium">
                              {hit.name}
                            </p>
                            {isRec ? (
                              <Badge
                                variant="secondary"
                                className="shrink-0 rounded-md px-1.5 py-0 text-[10px] font-medium"
                              >
                                {t("local.matchRecommended")}
                              </Badge>
                            ) : null}
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {hit.singer}
                            {hit.albumName ? ` · ${hit.albumName}` : ""}
                          </p>
                        </div>
                        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                          {hit.interval}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {loading ? null : (
          <DialogFooter className="sm:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {untagged ? (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void onRecognize()}
                >
                  {recognizing ? (
                    <Loader2 size={14} className="mr-1.5 animate-spin" />
                  ) : (
                    <AudioLines size={14} className="mr-1.5" />
                  )}
                  {t(
                    recognizing
                      ? "local.matchRecognizing"
                      : "local.matchRecognize",
                  )}
                </Button>
              ) : (
                <span />
              )}
              {recognizeHint ? (
                <p className="min-w-0 truncate text-[11px] leading-none text-muted-foreground">
                  {t(recognizeHint)}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                disabled={loading || recognizing || applying || !selected}
                onClick={() => void onConfirm()}
              >
                {applying ? (
                  <Loader2 size={14} className="mr-1.5 animate-spin" />
                ) : null}
                {t("local.matchConfirm")}
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
