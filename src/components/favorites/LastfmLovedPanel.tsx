import { ExternalLink, Loader2, Music, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CoverImage } from "@/components/common/CoverImage";
import { openExternal } from "@/components/settings/LastfmSettings";
import { useT } from "@/lib/i18n";
import type { LovedTrack } from "@/stores/lastfmStore";

/** Stable key for one loved row, used to mark the row being resolved. */
export function lovedTrackKey(track: Pick<LovedTrack, "name" | "artist">): string {
  return `${track.artist}\u0000${track.name}`;
}

/**
 * The Last.fm tab body on the 收藏 page.
 *
 * A list of what the ACCOUNT loves, which is not the same set as this device's
 * favourites: it includes songs loved in the Last.fm app, on the website, or
 * before this install existed. That is the point of showing it — it is the one
 * view of "songs I like" that is not tied to this machine.
 *
 * Laid out with `TrackRow`'s anatomy deliberately — same `gap-3 px-3 py-2
 * rounded-xl`, same `h-10 w-10 rounded-xl` cover with the play button revealed
 * ON the cover, same `h-8 w-8` ghost icon actions on the right — because a row
 * that looks almost like the 歌曲 tab's rows reads as a bug. The play action
 * lives on the cover rather than the row because the row also has to hold a
 * different action ("open on Last.fm"), and a row that plays when you meant to
 * navigate is worse than one extra click.
 */
export function LastfmLovedPanel({
  tracks,
  resolvingKey,
  onPlay,
}: {
  tracks: LovedTrack[];
  /** Key of the row currently being looked up on a platform, if any. */
  resolvingKey: string | null;
  onPlay: (track: LovedTrack) => void;
}) {
  const t = useT();

  if (!tracks.length) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-20 text-center">
        <Music size={22} className="text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">
          {t("favorites.lastfm.empty")}
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 py-2">
      {tracks.map((track) => {
        const key = lovedTrackKey(track);
        const busy = resolvingKey === key;
        return (
          <div
            key={key}
            className="group flex items-center gap-3 rounded-xl px-3 py-2 transition-[background-color,transform] duration-200 ease-out hover:bg-accent/55 active:scale-[0.995]"
            onDoubleClick={() => onPlay(track)}
          >
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-muted shadow-[var(--shadow-border)]">
              {track.image ? (
                <CoverImage src={track.image} />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <Music size={16} />
                </div>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  onPlay(track);
                }}
                title={t("favorites.lastfm.play")}
                className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 focus-visible:opacity-100"
              >
                {busy ? (
                  <Loader2 size={16} className="animate-spin text-white" />
                ) : (
                  <Play
                    size={16}
                    className="ml-0.5 text-white icon-play-pop"
                    fill="currentColor"
                    strokeWidth={0}
                  />
                )}
              </button>
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{track.name}</p>
              {track.artist && (
                <p className="truncate text-xs text-muted-foreground">
                  {track.artist}
                </p>
              )}
            </div>

            {busy && (
              <span className="shrink-0 text-xs text-muted-foreground">
                {t("favorites.lastfm.searching")}
              </span>
            )}

            {track.url && (
              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    void openExternal(track.url);
                  }}
                  title={t("favorites.lastfm.open")}
                >
                  <ExternalLink size={14} />
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Loading placeholder, mirroring the row geometry above so the list does not
 * jump when the tracks arrive.
 */
export function LastfmLovedSkeleton() {
  return (
    <div className="px-4 py-2" aria-busy="true">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2">
          <div className="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-muted" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-3.5 w-2/5 max-w-[12rem] animate-pulse rounded-md bg-muted" />
            <div className="h-3 w-1/4 max-w-[8rem] animate-pulse rounded-md bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Shown when the fetch failed, or the account cannot be read. */
export function LastfmLovedError({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-20 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
