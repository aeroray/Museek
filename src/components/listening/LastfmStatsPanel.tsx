import { ExternalLink } from "lucide-react";
import type { LastfmStats } from "@/stores/lastfmStore";
import { openExternal } from "@/components/settings/LastfmSettings";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type LastfmStatsView = "topArtists" | "topTracks" | "recent";

/**
 * The Last.fm tab body on the 足迹 page.
 *
 * A tab rather than a banner above the local stats: the two are alternative
 * views of "what have I been listening to", and stacking them made the page open
 * with a section most users never look at. The tab only exists while the
 * integration is switched on, so the page is unchanged for everyone else.
 *
 * The three lists are sub-tabs rather than three stacked sections. Stacking made
 * the Last.fm tab the only page in the app that scrolled through every category
 * at once, while 歌曲/歌手/最近 all show one list — so the two halves of the same
 * page disagreed about how to present a list. The sub-tab choice lives in the
 * page's filter bar, next to the period, so the whole page keeps one control row.
 *
 * Laid out like the other tabs on purpose: a `px-4 py-2` list of rows that share
 * TrackRow's spacing, radius and hover.
 */
export function LastfmStatsPanel({
  stats,
  view,
}: {
  stats: LastfmStats | null;
  view: LastfmStatsView;
}) {
  const t = useT();

  if (!stats) return null;

  const rows =
    view === "topArtists"
      ? stats.topArtists.map((a, i) => ({
          key: `a-${a.name}-${i}`,
          rank: i + 1,
          image: a.image,
          // An artist has no artwork of its own, so the monogram is used rather
          // than borrowing a track cover — the same rule the local artist
          // ranking follows.
          monogram: a.name.slice(0, 1),
          title: a.name,
          subtitle: undefined,
          stat: t("listening.playCount", { count: a.playcount }),
          highlight: false,
          url: a.url,
        }))
      : view === "topTracks"
        ? stats.topTracks.map((tr, i) => ({
            key: `t-${tr.name}-${i}`,
            rank: i + 1,
            image: tr.image,
            monogram: undefined,
            title: tr.name,
            subtitle: tr.artist,
            stat: t("listening.playCount", { count: tr.playcount }),
            highlight: false,
            url: tr.url,
          }))
        : stats.recent.map((tr, i) => ({
            key: `r-${tr.name}-${i}`,
            rank: undefined,
            image: tr.image,
            monogram: undefined,
            title: tr.name,
            subtitle: tr.artist,
            stat: tr.nowPlaying ? t("lastfm.stats.nowPlaying") : undefined,
            highlight: tr.nowPlaying,
            url: tr.url,
          }));

  if (!rows.length) {
    return (
      <div className="px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          {t("lastfm.stats.noRows")}
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 py-2">
      {rows.map(({ key, ...row }) => (
        <StatRow key={key} {...row} />
      ))}
    </div>
  );
}

/**
 * One ranked row, sharing TrackRow's geometry (same padding, radius and hover)
 * so the Last.fm tab does not look like a different component from its
 * neighbours. Rows are links because the natural next step is the Last.fm page
 * for that artist or track.
 */
function StatRow({
  rank,
  image,
  monogram,
  title,
  subtitle,
  stat,
  highlight,
  url,
}: {
  rank?: number;
  image?: string;
  monogram?: string;
  title: string;
  subtitle?: string;
  stat?: string;
  highlight?: boolean;
  url?: string;
}) {
  return (
    <button
      type="button"
      disabled={!url}
      onClick={() => url && void openExternal(url)}
      className={cn(
        "group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-[background-color,transform] duration-200 ease-out",
        url && "hover:bg-accent/55 active:scale-[0.995]",
      )}
      title={url ? "Last.fm" : undefined}
    >
      {rank !== undefined && (
        <span className="w-5 shrink-0 text-center text-sm font-medium tabular-nums text-muted-foreground">
          {rank}
        </span>
      )}
      {image ? (
        <img
          src={image}
          alt=""
          loading="lazy"
          className="h-10 w-10 shrink-0 rounded-xl object-cover shadow-[var(--shadow-border)]"
        />
      ) : (
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/70 text-sm font-medium text-muted-foreground shadow-[var(--shadow-border)]"
        >
          {monogram ?? title.slice(0, 1)}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-sm font-medium",
            highlight && "text-primary",
          )}
        >
          {title}
        </span>
        {subtitle && (
          <span className="block truncate text-xs text-muted-foreground">
            {subtitle}
          </span>
        )}
      </span>
      {stat && (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {stat}
        </span>
      )}
      {url && (
        <ExternalLink
          size={12}
          className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
        />
      )}
    </button>
  );
}
