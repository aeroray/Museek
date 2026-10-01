import { ExternalLink, Heart, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { openExternal } from "@/components/settings/LastfmSettings";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
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
 * A row plays rather than opening Last.fm, so unlike the stats rows it keeps an
 * explicit "open on Last.fm" affordance. The two actions are genuinely
 * different, and a play row that silently navigated away would be worse.
 *
 * Laid out with TrackRow's geometry (`gap-3 px-3 py-2 rounded-xl`, h-10 cover)
 * so it does not read as a different component from the rest of the app.
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
        <Heart size={22} className="text-muted-foreground" />
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
            className="group flex w-full items-center rounded-xl transition-colors duration-200 hover:bg-accent/55"
          >
            <button
              type="button"
              onClick={() => onPlay(track)}
              disabled={busy}
              title={t("favorites.lastfm.play")}
              className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left"
            >
              <span className="flex w-5 shrink-0 items-center justify-center text-muted-foreground">
                {busy ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Play
                    size={13}
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    fill="currentColor"
                    strokeWidth={0}
                  />
                )}
              </span>
              {track.image ? (
                <img
                  src={track.image}
                  alt=""
                  loading="lazy"
                  className="h-10 w-10 shrink-0 rounded-xl object-cover shadow-[var(--shadow-border)]"
                />
              ) : (
                <span
                  aria-hidden
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/70 text-sm font-medium text-muted-foreground shadow-[var(--shadow-border)]"
                >
                  {Array.from(track.name.trim())[0]?.toLocaleUpperCase() ?? "?"}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {track.name}
                </span>
                {track.artist && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {track.artist}
                  </span>
                )}
              </span>
              {busy && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {t("favorites.lastfm.searching")}
                </span>
              )}
            </button>

            {track.url && (
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => void openExternal(track.url)}
                    aria-label={t("favorites.lastfm.open")}
                    className="mr-2 shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <ExternalLink size={12} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {t("favorites.lastfm.open")}
                </TooltipContent>
              </Tooltip>
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
          <span className="w-5 shrink-0" />
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

/** The empty state shown when the account has no loved tracks yet. */
export function LastfmLovedError({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-20 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

/** Kept next to the panel so the "load" affordance matches the other tabs. */
export function LastfmLovedLoadButton({
  loading,
  disabled,
  onClick,
}: {
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const t = useT();
  return (
    <Button
      variant="secondary"
      size="sm"
      className={cn("h-8")}
      disabled={disabled}
      onClick={onClick}
    >
      {loading ? (
        <Loader2 size={13} className="mr-1.5 animate-spin" />
      ) : (
        <Heart size={13} className="mr-1.5" />
      )}
      {loading ? t("favorites.lastfm.loading") : t("favorites.lastfm.load")}
    </Button>
  );
}
