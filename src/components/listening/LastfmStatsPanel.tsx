import { useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLastfmStore, type LastfmPeriod } from "@/stores/lastfmStore";
import { openExternal } from "@/components/settings/LastfmSettings";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const PERIODS: LastfmPeriod[] = ["overall", "7day", "1month", "3month", "12month"];

function formatCount(n: number): string {
  return n.toLocaleString();
}

/**
 * The Last.fm tab body on the 足迹 page.
 *
 * A tab rather than a banner above the local stats: the two are alternative
 * views of "what have I been listening to", and stacking them made the page open
 * with a section most users never look at. The tab only exists while the
 * integration is switched on, so the page is unchanged for everyone else.
 */
export function LastfmStatsPanel() {
  const t = useT();
  const {
    stats,
    statsLoading,
    statsError,
    username,
    apiKey,
    loadStats,
  } = useLastfmStore();
  const [period, setPeriod] = useState<LastfmPeriod>("overall");

  // Stats read with an api_key alone, so a username is what is actually required.
  const canLoad = Boolean(apiKey && username);

  const reload = (next: LastfmPeriod) => {
    setPeriod(next);
    void loadStats(next);
  };

  if (!stats) {
    // One compact prompt. The previous version stacked a heading, a subtitle, a
    // button and an empty-state sentence for what is a single action.
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-muted-foreground">
          {t("lastfm.stats.playcount")}{" "}
          <span className="font-medium tabular-nums text-foreground">
            {formatCount(stats.playcount)}
          </span>
        </p>
        <span className="text-xs text-muted-foreground">·</span>
        <span className="text-xs text-muted-foreground">@{stats.username}</span>

        <div className="ml-auto flex items-center gap-2">
          <Select value={period} onValueChange={(v) => reload(v as LastfmPeriod)}>
            <SelectTrigger className="h-8 w-[9.5rem] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => (
                <SelectItem key={p} value={p} className="text-xs">
                  {t(`lastfm.period.${p}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            disabled={statsLoading}
            onClick={() => void loadStats(period)}
          >
            <RefreshCw
              size={13}
              className={cn(statsLoading && "animate-spin")}
            />
          </Button>
        </div>
      </div>

      {statsError && (
        <p className="text-xs text-destructive" role="alert">
          {statsError}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <StatColumn title={t("lastfm.stats.topArtists")}>
          {stats.topArtists.map((a, i) => (
            <StatRow
              key={`${a.name}-${i}`}
              rank={i + 1}
              image={a.image}
              // An artist has no artwork of its own, so the monogram is used
              // rather than borrowing a track cover (the same rule the local
              // artist ranking follows).
              monogram={a.name.slice(0, 1)}
              title={a.name}
              meta={t("listening.playCount", { count: a.playcount })}
              url={a.url}
            />
          ))}
        </StatColumn>

        <StatColumn title={t("lastfm.stats.topTracks")}>
          {stats.topTracks.map((tr, i) => (
            <StatRow
              key={`${tr.name}-${i}`}
              rank={i + 1}
              image={tr.image}
              title={tr.name}
              subtitle={tr.artist}
              meta={t("listening.playCount", { count: tr.playcount })}
              url={tr.url}
            />
          ))}
        </StatColumn>

        <StatColumn title={t("lastfm.stats.recent")}>
          {stats.recent.map((tr, i) => (
            <StatRow
              key={`${tr.name}-${i}`}
              image={tr.image}
              title={tr.name}
              subtitle={tr.artist}
              meta={tr.nowPlaying ? t("lastfm.stats.nowPlaying") : undefined}
              highlight={tr.nowPlaying}
              url={tr.url}
            />
          ))}
        </StatColumn>
      </div>
    </div>
  );
}

function StatColumn({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <h4 className="mb-1 text-xs font-medium text-muted-foreground">{title}</h4>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

/**
 * One ranked row. `image` falls back to a monogram when Last.fm has no artwork,
 * and rows are links because the natural next step is the Last.fm page for that
 * artist or track.
 */
function StatRow({
  rank,
  image,
  monogram,
  title,
  subtitle,
  meta,
  highlight,
  url,
}: {
  rank?: number;
  image?: string;
  monogram?: string;
  title: string;
  subtitle?: string;
  meta?: string;
  highlight?: boolean;
  url?: string;
}) {
  return (
    <button
      type="button"
      disabled={!url}
      onClick={() => url && void openExternal(url)}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors",
        url && "hover:bg-accent/55",
        highlight && "text-primary",
      )}
      title={url ? "Last.fm" : undefined}
    >
      {rank !== undefined && (
        <span className="w-4 shrink-0 text-center text-xs tabular-nums text-muted-foreground">
          {rank}
        </span>
      )}
      {image ? (
        <img
          src={image}
          alt=""
          loading="lazy"
          className="h-8 w-8 shrink-0 rounded-md object-cover shadow-[var(--shadow-border)]"
        />
      ) : (
        <span
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/70 text-xs font-medium text-muted-foreground shadow-[var(--shadow-border)]"
        >
          {monogram ?? title.slice(0, 1)}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{title}</span>
        {subtitle && (
          <span className="block truncate text-[11px] text-muted-foreground">
            {subtitle}
          </span>
        )}
      </span>
      {meta && (
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {meta}
        </span>
      )}
      {url && (
        <ExternalLink
          size={11}
          className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
        />
      )}
    </button>
  );
}
