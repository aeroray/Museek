import { ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLastfmStore, type LastfmPeriod } from "@/stores/lastfmStore";
import { openExternal } from "@/components/settings/LastfmSettings";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * The Last.fm tab body on the 足迹 page.
 *
 * A tab rather than a banner above the local stats: the two are alternative
 * views of "what have I been listening to", and stacking them made the page open
 * with a section most users never look at. The tab only exists while the
 * integration is switched on, so the page is unchanged for everyone else.
 *
 * Laid out like the other tabs on purpose — a `px-4 py-2` list of rows that
 * share TrackRow's spacing, radius and hover, with the period selector living in
 * the page's shared filter bar rather than inside the panel. An earlier version
 * was a self-contained card with its own header and three columns, which read as
 * a different kind of screen bolted onto the page.
 */
export function LastfmStatsPanel({ period }: { period: LastfmPeriod }) {
  const t = useT();
  const { stats, statsLoading, statsError, username, apiKey, loadStats } =
    useLastfmStore();

  // Stats read with an api_key alone, so a username is what is actually required.
  const canLoad = Boolean(apiKey && username);

  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-20 text-center">
        <p className="text-sm text-muted-foreground">
          {statsError ?? t("lastfm.stats.empty")}
        </p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-4"
          disabled={statsLoading || !canLoad}
          onClick={() => void loadStats(period)}
        >
          <RefreshCw
            size={13}
            className={cn("mr-1.5", statsLoading && "animate-spin")}
          />
          {statsLoading ? t("lastfm.stats.loading") : t("lastfm.stats.load")}
        </Button>
      </div>
    );
  }

  return (
    <div className="px-4 py-2">
      <Section title={t("lastfm.stats.topArtists")}>
        {stats.topArtists.map((a, i) => (
          <StatRow
            key={`${a.name}-${i}`}
            rank={i + 1}
            image={a.image}
            // An artist has no artwork of its own, so the monogram is used rather
            // than borrowing a track cover — the same rule the local artist
            // ranking follows.
            monogram={a.name.slice(0, 1)}
            title={a.name}
            stat={t("listening.playCount", { count: a.playcount })}
            url={a.url}
          />
        ))}
      </Section>

      <Section title={t("lastfm.stats.topTracks")}>
        {stats.topTracks.map((tr, i) => (
          <StatRow
            key={`${tr.name}-${i}`}
            rank={i + 1}
            image={tr.image}
            title={tr.name}
            subtitle={tr.artist}
            stat={t("listening.playCount", { count: tr.playcount })}
            url={tr.url}
          />
        ))}
      </Section>

      <Section title={t("lastfm.stats.recent")}>
        {stats.recent.map((tr, i) => (
          <StatRow
            key={`${tr.name}-${i}`}
            image={tr.image}
            title={tr.name}
            subtitle={tr.artist}
            stat={tr.nowPlaying ? t("lastfm.stats.nowPlaying") : undefined}
            highlight={tr.nowPlaying}
            url={tr.url}
          />
        ))}
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4 last:mb-0">
      <h4 className="px-3 pb-1 text-xs font-medium text-muted-foreground">
        {title}
      </h4>
      {children}
    </section>
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
