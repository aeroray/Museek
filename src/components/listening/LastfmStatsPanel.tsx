import { useState } from "react";
import { ExternalLink, Radio, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLastfmStore, type LastfmPeriod } from "@/stores/lastfmStore";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const PERIODS: LastfmPeriod[] = ["overall", "7day", "1month", "3month", "12month"];

async function openExternal(url: string) {
  try {
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(url);
  } catch {
    window.open(url, "_blank");
  }
}

function formatCount(n: number): string {
  return n.toLocaleString();
}

/**
 * The user's Last.fm profile, shown above the local history on the 足迹 page.
 *
 * Deliberately a self-contained section rather than a replacement for the local
 * stats: the local log is what this device played, Last.fm is what the account
 * has accumulated across every client. Showing both lets them be compared
 * instead of one silently standing in for the other.
 */
export function LastfmStatsPanel() {
  const t = useT();
  const {
    stats,
    statsLoading,
    statsError,
    username,
    sessionKey,
    apiKey,
    enabled,
    loadStats,
    clearStats,
  } = useLastfmStore();
  const [period, setPeriod] = useState<LastfmPeriod>("overall");

  const connected = Boolean(sessionKey);
  // Stats are readable with an api_key alone, so the section is offered whenever
  // there is a username to read — not only when a session exists.
  const canLoad = Boolean(apiKey && username);

  const reload = (next: LastfmPeriod) => {
    setPeriod(next);
    void loadStats(next);
  };

  return (
    <section className="mx-auto w-full max-w-5xl px-4 pt-4">
      <div className="rounded-2xl bg-card/60 p-4 shadow-[var(--shadow-border)]">
        <div className="flex flex-wrap items-center gap-2">
          <Radio size={16} className="shrink-0 text-muted-foreground" />
          <h3 className="text-sm font-medium">{t("lastfm.stats.title")}</h3>
          <span className="text-xs text-muted-foreground">
            {connected ? `@${username}` : t("lastfm.stats.desc")}
          </span>

          <div className="ml-auto flex items-center gap-2">
            {stats && (
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
            )}
            <Button
              variant="secondary"
              size="sm"
              className="h-8"
              disabled={statsLoading || !canLoad}
              onClick={() => void loadStats(period)}
            >
              <RefreshCw
                size={13}
                className={cn("mr-1.5", statsLoading && "animate-spin")}
              />
              {stats ? t("lastfm.stats.reload") : t("lastfm.stats.load")}
            </Button>
            {stats && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={clearStats}
              >
                {t("lastfm.stats.hide")}
              </Button>
            )}
          </div>
        </div>

        {!enabled && (
          <p className="mt-3 text-xs text-muted-foreground">
            {t("lastfm.enableDesc")}
          </p>
        )}

        {statsError && (
          <p className="mt-3 text-xs text-destructive" role="alert">
            {statsError}
          </p>
        )}

        {statsLoading && !stats && (
          <p className="mt-4 text-xs text-muted-foreground">
            {t("lastfm.stats.loading")}
          </p>
        )}

        {!stats && !statsLoading && !statsError && (
          <p className="mt-3 text-xs text-muted-foreground">
            {t("lastfm.stats.empty")}
          </p>
        )}

        {stats && (
          <>
            <p className="mt-3 text-xs text-muted-foreground">
              {t("lastfm.stats.playcount")}:{" "}
              <span className="font-medium tabular-nums text-foreground">
                {formatCount(stats.playcount)}
              </span>
            </p>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <StatColumn title={t("lastfm.stats.topArtists")}>
                {stats.topArtists.length === 0 ? (
                  <EmptyRow />
                ) : (
                  stats.topArtists.map((a, i) => (
                    <StatRow
                      key={`${a.name}-${i}`}
                      rank={i + 1}
                      image={a.image}
                      // An artist has no artwork of its own, so the monogram is
                      // used rather than borrowing a track cover (the same rule
                      // the local artist ranking follows).
                      monogram={a.name.slice(0, 1)}
                      title={a.name}
                      meta={t("listening.playCount", { count: a.playcount })}
                      url={a.url}
                    />
                  ))
                )}
              </StatColumn>

              <StatColumn title={t("lastfm.stats.topTracks")}>
                {stats.topTracks.length === 0 ? (
                  <EmptyRow />
                ) : (
                  stats.topTracks.map((tr, i) => (
                    <StatRow
                      key={`${tr.name}-${i}`}
                      rank={i + 1}
                      image={tr.image}
                      title={tr.name}
                      subtitle={tr.artist}
                      meta={t("listening.playCount", { count: tr.playcount })}
                      url={tr.url}
                    />
                  ))
                )}
              </StatColumn>

              <StatColumn title={t("lastfm.stats.recent")}>
                {stats.recent.length === 0 ? (
                  <EmptyRow />
                ) : (
                  stats.recent.map((tr, i) => (
                    <StatRow
                      key={`${tr.name}-${i}`}
                      image={tr.image}
                      title={tr.name}
                      subtitle={tr.artist}
                      meta={
                        tr.nowPlaying
                          ? t("lastfm.stats.nowPlaying")
                          : undefined
                      }
                      highlight={tr.nowPlaying}
                      url={tr.url}
                    />
                  ))
                )}
              </StatColumn>
            </div>
          </>
        )}
      </div>
    </section>
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

function EmptyRow() {
  return <p className="py-2 text-xs text-muted-foreground">—</p>;
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
