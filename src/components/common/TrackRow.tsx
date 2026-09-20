import { memo, useMemo } from "react";
import { Play, Plus, Heart, Download, Music, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconBurst, IconSwap } from "@/components/common/IconSwap";
import { CoverImage } from "@/components/common/CoverImage";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePlayerStore } from "@/stores/playerStore";
import { usePlaylistStore } from "@/stores/playlistStore";
import { useDownloadStore } from "@/stores/downloadStore";
import { PlatformBadge, QualityBadge } from "@/components/common/MetaBadges";
import { bestQuality } from "@/lib/quality";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { MusicInfo, Quality } from "@/types/music";

/**
 * Shared song row for the Search / Charts / Hot-playlist lists. Hover reveals
 * the play overlay + queue/download actions; the favorite heart stays visible
 * once a song is favorited so the state is obvious at a glance.
 *
 * Store subscriptions are narrow on purpose — a full `usePlayerStore()` would
 * re-render every row on each audio timeupdate and make large lists feel sticky.
 */
export const TrackRow = memo(function TrackRow({
  song,
  rank,
  fallbackImg,
  selectable = false,
  selected = false,
  onToggleSelect,
  stat,
  statWidth = "w-20",
  showAlbum = true,
  showQuality = true,
  showPlatform = false,
  className,
}: {
  song: MusicInfo;
  rank?: number;
  /** Shown when the song itself has no cover (e.g. kw/kg playlist songs inherit
   *  the playlist's cover). Display only — never written back to the song. */
  fallbackImg?: string | null;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  /** Extra trailing figure (play count, relative time). */
  stat?: string;
  /**
   * Width of the `stat` column. Must be a fixed width (not `max-w`) so the
   * column's left edge does not move with the text and shove its neighbours out
   * of line between rows.
   *
   * `w-20` (80px) is measured, not guessed: it fits the widest real value in
   * either tab — `12/31 20:00` at 74px and `1,234 plays` at 70px.
   */
  statWidth?: string;
  showAlbum?: boolean;
  showQuality?: boolean;
  showPlatform?: boolean;
  className?: string;
}) {
  const play = usePlayerStore((s) => s.play);
  const addToQueue = usePlayerStore((s) => s.addToQueue);
  const fav = usePlaylistStore((s) =>
    s.favorites.some((f) => f.id === song.id),
  );
  const addToFavorites = usePlaylistStore((s) => s.addToFavorites);
  const removeFromFavorites = usePlaylistStore((s) => s.removeFromFavorites);
  const addTask = useDownloadStore((s) => s.addTask);
  const t = useT();
  const thumb = song.meta.picUrl || fallbackImg;
  const best = useMemo(() => bestQuality(song), [song]);

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-xl group group/row cursor-pointer transition-[background-color,transform] duration-200 ease-out hover:bg-accent/55 active:scale-[0.995]",
        className,
        selectable && selected && "bg-primary/10",
      )}
      onClick={selectable ? onToggleSelect : undefined}
      onDoubleClick={selectable ? undefined : () => play(song)}
    >
      {selectable && (
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/40 text-transparent",
          )}
        >
          <Check size={12} strokeWidth={3} />
        </span>
      )}

      {rank != null && (
        <span className="w-6 text-center text-sm text-muted-foreground tabular-nums shrink-0 font-medium">
          {rank}
        </span>
      )}

      <div className="relative h-10 w-10 shrink-0 rounded-xl overflow-hidden bg-muted shadow-[var(--shadow-border)]">
        {thumb ? (
          <CoverImage src={thumb} />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-muted-foreground">
            <Music size={16} />
          </div>
        )}
        {!selectable && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              play(song);
            }}
            className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 focus-visible:opacity-100"
          >
            <Play
              size={16}
              className="ml-0.5 text-white icon-play-pop"
              fill="currentColor"
              strokeWidth={0}
            />
          </button>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm truncate font-medium">{song.name}</p>
        <p className="text-xs text-muted-foreground truncate">{song.singer}</p>
      </div>

      {showAlbum && song.albumName && (
        <p className="text-xs text-muted-foreground truncate max-w-32 hidden lg:block">
          {song.albumName}
        </p>
      )}

      {showQuality && best && <QualityBadge quality={best} />}

      {/* `stat` sits before the platform chip, not after the duration, so it
          reads as a fact about the song rather than as trailing metadata. The
          name column is `flex-1`, so it absorbs the slack either way: with short
          titles the empty space lands to the *left* of `stat`, which is where a
          wide fixed column used to leave an awkward hole.
          Right-aligned so every value ends at the same x, against the platform
          chip. The fixed `statWidth` (not `max-w`) is what keeps that x — and
          therefore the platform and duration columns — identical on every row. */}
      {stat && (
        <span
          className={cn(
            "text-xs text-muted-foreground shrink-0 tabular-nums truncate text-right",
            statWidth,
          )}
        >
          {stat}
        </span>
      )}

      {/* Platform labels differ in width by language and platform ("酷我" 46px
          vs "QQ Music" 74px). Because the name column is `flex-1`, every column
          to its right is anchored from the right edge, so a variable width here
          shoves the quality and duration of that row sideways relative to its
          neighbours. A fixed slot with the chip flush right keeps the column
          edge stable while still letting the chip size to its own label.
          Width covers the widest real chip ("QQ Music" / "NetEase" at 10px). */}
      {showPlatform && (
        <span className="flex w-20 shrink-0 justify-end">
          <PlatformBadge source={song.source} />
        </span>
      )}

      <span className="text-xs text-muted-foreground w-14 shrink-0 tabular-nums text-center">
        {song.interval}
      </span>

      {!selectable && (
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 icon-hover-plus"
            onClick={(e) => {
              e.stopPropagation();
              addToQueue([song]);
            }}
            title={t("common.addToQueue")}
          >
            <Plus size={14} />
          </Button>

          {song.source !== "local" && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  "h-8 w-8 icon-hover-heart",
                  fav
                    ? "text-red-500 opacity-100 hover:text-red-500"
                    : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  if (fav) removeFromFavorites(song.id);
                  else addToFavorites(song);
                }}
                title={t(fav ? "common.unfavorite" : "common.favorite")}
              >
                <IconBurst active={fav}>
                  <IconSwap
                    active={fav}
                    inactive={<Heart size={14} />}
                    activeNode={<Heart size={14} fill="currentColor" />}
                  />
                </IconBurst>
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 icon-hover-download"
                    onClick={(e) => e.stopPropagation()}
                    title={t("common.download")}
                  >
                    <Download size={14} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[11rem]">
                  {song.meta.qualitys.map((q) => (
                    <DropdownMenuItem
                      key={q.type}
                      onClick={() => addTask(song, q.type as Quality)}
                      className="justify-between gap-8"
                    >
                      <span>{t("search.download", { quality: q.type })}</span>
                      {q.size && (
                        <span className="text-muted-foreground text-xs tabular-nums">
                          {q.size}
                        </span>
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      )}
    </div>
  );
});
