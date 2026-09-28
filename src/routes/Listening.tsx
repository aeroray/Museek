import { useEffect, useMemo, useState } from "react";
import {
  Footprints,
  ListFilter,
  Play,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TrackRow } from "@/components/common/TrackRow";
import {
  LastfmStatsPanel,
  type LastfmStatsView,
} from "@/components/listening/LastfmStatsPanel";
import { useListeningStore } from "@/stores/listeningStore";
import {
  cachedStatsFor,
  useLastfmStore,
  type LastfmPeriod,
} from "@/stores/lastfmStore";
import { usePlayerStore } from "@/stores/playerStore";
import { useUiStore } from "@/stores/uiStore";
import {
  aggregateListening,
  eventsWithLive,
  RECENT_LIMIT,
  type ListenPeriod,
  type PlayEvent,
  type TopArtistStat,
  type TopSongStat,
} from "@/lib/listenLog";
import { formatListenDuration, formatRelativePlayed } from "@/lib/listenFormat";
import { useMinuteTick } from "@/hooks/useMinuteTick";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const PERIODS: ListenPeriod[] = ["today", "week", "month", "all"];
/**
 * Last.fm's own period enum. Kept separate from the local `PERIODS` because the
 * two sets genuinely differ ("today" has no Last.fm equivalent, and Last.fm
 * offers 3/12 months).
 */
const LASTFM_PERIODS: LastfmPeriod[] = [
  "overall",
  "7day",
  "1month",
  "3month",
  "12month",
];
/**
 * The Last.fm tab is prepended only while the integration is on, so the tab bar
 * is unchanged for anyone who has not set it up.
 */
const LOCAL_TABS = ["songs", "artists", "recent"] as const;
type ListenTab = "lastfm" | (typeof LOCAL_TABS)[number];

/**
 * The three Last.fm lists, in the order they are shown. The keys match the
 * `lastfm.stats.*` labels, which are also the section titles they replaced.
 */
const LASTFM_VIEWS: LastfmStatsView[] = ["topArtists", "topTracks", "recent"];

function matchesQuery(
  query: string,
  ...fields: Array<string | undefined>
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((field) => (field ?? "").toLowerCase().includes(q));
}

/**
 * First user-perceived character of a name, for the artist monogram.
 *
 * `Array.from` rather than `name[0]` so a CJK or emoji name is not cut in half
 * by slicing a surrogate pair, and the locale-aware uppercase gives a Latin name
 * a capital while leaving CJK unchanged.
 */
function firstGrapheme(name: string): string {
  const [first] = Array.from(name.trim());
  return first ? first.toLocaleUpperCase() : "?";
}

/**
 * Placeholder for the Last.fm list while the first fetch of a launch is in
 * flight. Mirrors {@link LastfmStatsPanel}'s row geometry — `px-3 py-2` with an
 * h-10 avatar — so the list does not jump when the real rows arrive, and it sits
 * in the same `px-4 py-2` body.
 */
function LastfmStatsSkeleton() {
  return (
    <div className="px-4 py-2" aria-busy="true">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2">
          <Skeleton className="h-4 w-5 shrink-0" />
          <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-2/5 max-w-[12rem]" />
            <Skeleton className="h-3 w-1/4 max-w-[8rem]" />
          </div>
          <Skeleton className="h-3 w-12 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function Listening() {
  const t = useT();
  const events = useListeningStore((s) => s.events);
  const live = useListeningStore((s) => s.live);
  const playAll = usePlayerStore((s) => s.playAll);
  const tab = useUiStore((s) => s.listeningTab);
  const setTab = useUiStore((s) => s.setListeningTab);
  const lastfmEnabled = useLastfmStore((s) => s.enabled);
  const lastfmApiKey = useLastfmStore((s) => s.apiKey);
  const lastfmUsername = useLastfmStore((s) => s.username);
  const statsCache = useLastfmStore((s) => s.statsCache);
  const lastfmStatsLoading = useLastfmStore((s) => s.statsLoading);
  const lastfmStatsError = useLastfmStore((s) => s.statsError);
  const loadStats = useLastfmStore((s) => s.loadStats);
  const loadStatsForTab = useLastfmStore((s) => s.loadStatsForTab);
  // Build the tab list once: the Last.fm tab leads because it is the only one
  // backed by an account rather than this device's log.
  const tabs: ListenTab[] = useMemo(
    () => (lastfmEnabled ? ["lastfm", ...LOCAL_TABS] : [...LOCAL_TABS]),
    [lastfmEnabled],
  );
  // The stored tab survives switching the integration off (the choice is kept so
  // it comes back), but a tab that no longer exists must not render an empty
  // page — fall back to the default without overwriting the stored value.
  const activeTab: ListenTab = tabs.includes(tab) ? tab : "songs";
  const [period, setPeriod] = useState<ListenPeriod>("week");
  const [lastfmPeriod, setLastfmPeriod] = useState<LastfmPeriod>("overall");
  const [lastfmView, setLastfmView] = useState<LastfmStatsView>("topArtists");
  const [artist, setArtist] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const hasHistory = events.length > 0 || live !== null;

  // Stats are read with an api_key alone, so a username is what is actually
  // required — the same rule the panel used before it moved here.
  const lastfmCanLoad = Boolean(lastfmApiKey.trim() && lastfmUsername.trim());
  const stats = cachedStatsFor(statsCache, lastfmPeriod, lastfmUsername);

  // Fetch when the tab is opened. `loadStatsForTab` decides whether that means a
  // real request: it refreshes once per launch and fills in any period that has
  // never been fetched, so returning to a period during the same run is instant.
  //
  // No `if (stats) return` guard here: a cached period must still refresh on the
  // first visit of a launch, which is the whole point.
  useEffect(() => {
    if (activeTab !== "lastfm" || !lastfmCanLoad) return;
    void loadStatsForTab(lastfmPeriod);
  }, [activeTab, lastfmCanLoad, lastfmPeriod, loadStatsForTab]);

  // One clock for both the period boundaries and the relative labels, so a page
  // left open does not keep saying "刚刚" an hour later.
  const now = useMinuteTick(hasHistory);

  const allEvents = useMemo(
    () => eventsWithLive(events, live),
    [events, live],
  );
  const periodStats = useMemo(
    () => aggregateListening(allEvents, period, now),
    [allEvents, period, now],
  );
  const scopedStats = useMemo(
    () =>
      artist
        ? aggregateListening(allEvents, period, now, artist)
        : periodStats,
    [allEvents, period, now, artist, periodStats],
  );

  const empty = events.length === 0 && !live;

  const songs = useMemo(
    () =>
      scopedStats.topSongs.filter((row) =>
        matchesQuery(query, row.song.name, row.song.singer, row.song.albumName),
      ),
    [scopedStats.topSongs, query],
  );
  const artists = useMemo(
    () =>
      periodStats.topArtists.filter((row) =>
        matchesQuery(query, row.singer),
      ),
    [periodStats.topArtists, query],
  );
  const recents = useMemo(
    () =>
      scopedStats.recents.filter((event) =>
        matchesQuery(
          query,
          event.song.name,
          event.song.singer,
          event.song.albumName,
        ),
      ),
    [scopedStats.recents, query],
  );

  const switchTab = (next: ListenTab) => {
    setTab(next);
    if (next !== "songs") setArtist(null);
  };

  const openArtist = (singer: string) => {
    setArtist(singer);
    setQuery("");
    setTab("songs");
  };

  const playable =
    activeTab === "artists" || activeTab === "lastfm"
      ? []
      : activeTab === "recent"
        ? recents.map((event) => event.song)
        : songs.map((row) => row.song);

  const searchPlaceholder =
    activeTab === "artists"
      ? t("listening.searchArtists")
      : activeTab === "recent"
        ? t("listening.searchRecent")
        : t("listening.searchSongs");

  const searching = query.trim().length > 0;

  return (
    <div className="flex h-full flex-col">
      <div className="p-4 border-b border-border flex items-center gap-3">
        <Footprints size={20} className="shrink-0" />
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-tight">
            {t("listening.title")}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {activeTab === "lastfm"
              ? t("lastfm.stats.desc")
              : empty
                ? t("listening.subtitle")
                : t("listening.summary", {
                    period: t(`listening.period.${period}`),
                    time: formatListenDuration(periodStats.listenedMs, t),
                    songs: periodStats.uniqueSongs,
                    artists: periodStats.uniqueArtists,
                  })}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {playable.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              className="h-8"
              onClick={() => playAll(playable)}
            >
              <Play
                size={14}
                className="mr-1.5"
                fill="currentColor"
                strokeWidth={0}
              />
              {t("common.playAll")}
            </Button>
          )}
          <div className="inline-flex items-center gap-1 rounded-full bg-muted/70 p-1">
            {tabs.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => switchTab(id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium transition-colors",
                  activeTab === id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(
                  id === "lastfm"
                    ? "lastfm.tab"
                    : id === "songs"
                      ? "listening.tabSongs"
                      : id === "artists"
                        ? "listening.tabArtists"
                        : "listening.tabRecent",
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* The filter bar is shared by both sources. The Last.fm tab swaps the
          local period menu for Last.fm's own periods, and adds its three list
          views, so the whole page keeps one control row. */}
      {activeTab === "lastfm" ? (
        <div className="flex h-12 min-h-12 max-h-12 shrink-0 items-center gap-2 overflow-hidden border-b border-border px-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 gap-1.5"
              >
                <ListFilter size={14} />
                <span>{t(`lastfm.period.${lastfmPeriod}`)}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {LASTFM_PERIODS.map((id) => (
                <DropdownMenuCheckboxItem
                  key={id}
                  checked={lastfmPeriod === id}
                  showUncheckedIndicator
                  onCheckedChange={() => setLastfmPeriod(id)}
                >
                  {t(`lastfm.period.${id}`)}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* The three Last.fm lists, presented exactly like the page's own
              tabs so the two halves of the page agree on how a list is chosen.
              `text-xs` to match the search page's 歌曲/歌手/专辑 scope picker —
              these are a secondary choice inside one tab, so they sit a step
              below the page-level tabs rather than competing with them. */}
          <div className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-muted/70 p-1">
            {LASTFM_VIEWS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setLastfmView(id)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  lastfmView === id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`lastfm.stats.${id}`)}
              </button>
            ))}
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            // Disabled while a fetch is running so a second one cannot overlap,
            // and when there is nothing to fetch with.
            disabled={lastfmStatsLoading || !lastfmCanLoad}
            onClick={() => void loadStats(lastfmPeriod)}
            title={
              stats ? t("lastfm.stats.reload") : t("lastfm.stats.load")
            }
          >
            <RefreshCw
              size={15}
              className={cn(lastfmStatsLoading && "animate-spin")}
            />
          </Button>
        </div>
      ) : !empty ? (
        <div className="flex h-12 min-h-12 max-h-12 shrink-0 items-center gap-2 overflow-hidden border-b border-border px-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 gap-1.5"
              >
                <ListFilter size={14} />
                <span className="hidden sm:inline">
                  {t(`listening.period.${period}`)}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {PERIODS.map((id) => (
                <DropdownMenuCheckboxItem
                  key={id}
                  checked={period === id}
                  showUncheckedIndicator
                  onCheckedChange={() => setPeriod(id)}
                >
                  {t(`listening.period.${id}`)}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {artist && activeTab === "songs" && (
            <Button
              variant="secondary"
              size="sm"
              className="h-8 max-w-40 shrink-0 gap-1"
              onClick={() => setArtist(null)}
              title={t("listening.clearArtist")}
            >
              <span className="truncate">{artist}</span>
              <X size={12} className="shrink-0" />
            </Button>
          )}

          <div className="relative min-w-0 flex-1">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              className="h-8 py-0 pl-9"
              placeholder={searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
      ) : null}

      {activeTab === "lastfm" ? (
        // Independent of local history: the account may have plays from other
        // clients even on a machine that has never played anything.
        <ScrollArea className="flex-1">
          {stats ? (
            // Cached data stays on screen during a background refresh, so the tab
            // never blanks out to show something it already has. The refresh
            // button carries the spinner in that case.
            <LastfmStatsPanel stats={stats} view={lastfmView} />
          ) : lastfmStatsLoading ? (
            // Nothing cached to show, so the wait gets a placeholder shaped like
            // the list it will become rather than a bare line of text.
            <LastfmStatsSkeleton />
          ) : (
            <div className="flex flex-col items-center justify-center px-4 py-20 text-center">
              <p className="text-sm text-muted-foreground">
                {lastfmStatsError ??
                  (lastfmCanLoad
                    ? t("lastfm.stats.empty")
                    : t("lastfm.err.notConnected"))}
              </p>
              {/* The button is kept here as well as in the filter bar: this is
                  where the eye already is when the list is empty, and an empty
                  state that only says "no data" gives no way forward. */}
              <Button
                variant="secondary"
                size="sm"
                className="mt-4"
                disabled={!lastfmCanLoad}
                onClick={() => void loadStats(lastfmPeriod)}
              >
                <RefreshCw size={13} className="mr-1.5" />
                {t("lastfm.stats.load")}
              </Button>
            </div>
          )}
        </ScrollArea>
      ) : empty ? (
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl p-4">
            <div className="flex min-h-[18rem] flex-col items-center justify-center px-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/70 text-muted-foreground">
                <Footprints size={28} strokeWidth={1.6} />
              </div>
              <p className="mt-4 text-sm font-medium">{t("listening.empty")}</p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground text-pretty">
                {t("listening.emptyHint")}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="px-4 py-2">
            {activeTab === "songs" ? (
              <SongList
                rows={songs}
                emptyLabel={
                  searching || artist
                    ? t("listening.noMatch")
                    : t("listening.topSongsEmpty")
                }
                playCountLabel={(count) =>
                  t("listening.playCount", { count })
                }
              />
            ) : activeTab === "artists" ? (
              <ArtistList
                rows={artists}
                emptyLabel={
                  searching
                    ? t("listening.noMatch")
                    : t("listening.topArtistsEmpty")
                }
                playCountLabel={(count) =>
                  t("listening.playCount", { count })
                }
                durationLabel={(ms) => formatListenDuration(ms, t)}
                onOpen={openArtist}
              />
            ) : (
              <RecentList
                rows={recents}
                emptyLabel={
                  searching || artist
                    ? t("listening.noMatch")
                    : t("listening.recentEmpty")
                }
                formatPlayed={(startedAt) =>
                  formatRelativePlayed(startedAt, now, t)
                }
                footer={
                  searching || recents.length === 0
                    ? null
                    : t("listening.recentLimit", { count: RECENT_LIMIT })
                }
              />
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

function SongList({
  rows,
  emptyLabel,
  playCountLabel,
}: {
  rows: TopSongStat[];
  emptyLabel: string;
  playCountLabel: (count: number) => string;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground py-12">
        {emptyLabel}
      </p>
    );
  }
  return (
    <>
      {rows.map((row, i) => (
        <TrackRow
          key={row.song.id}
          song={row.song}
          rank={i + 1}
          stat={playCountLabel(row.playCount)}
          showAlbum={false}
          showQuality={false}
          showPlatform
        />
      ))}
    </>
  );
}

function ArtistList({
  rows,
  emptyLabel,
  playCountLabel,
  durationLabel,
  onOpen,
}: {
  rows: TopArtistStat[];
  emptyLabel: string;
  playCountLabel: (count: number) => string;
  durationLabel: (ms: number) => string;
  onOpen: (singer: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground py-12">
        {emptyLabel}
      </p>
    );
  }
  return (
    <>
      {rows.map((row, i) => (
        <button
          key={row.singer}
          type="button"
          onClick={() => onOpen(row.singer)}
          className="flex w-full items-center gap-3 px-3 py-2 rounded-xl text-left transition-[background-color,transform] duration-200 ease-out hover:bg-accent/55 active:scale-[0.995]"
        >
          <span className="w-6 text-center text-sm text-muted-foreground tabular-nums shrink-0 font-medium">
            {i + 1}
          </span>
          {/* No artwork: an artist has no cover of its own, and borrowing a
              song's cover to stand in for one is misleading — it reads as the
              artist's image while actually being a track they appear on, and it
              changes depending on which song happened to be played last. A
              monogram is honest about being a placeholder. */}
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/70 text-sm font-medium text-muted-foreground shadow-[var(--shadow-border)]"
          >
            {firstGrapheme(row.singer)}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm truncate font-medium">{row.singer}</p>
          </div>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground text-right min-w-[4.5rem]">
            {durationLabel(row.listenedMs)}
          </span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground text-right min-w-[3rem]">
            {playCountLabel(row.playCount)}
          </span>
        </button>
      ))}
    </>
  );
}

function RecentList({
  rows,
  emptyLabel,
  formatPlayed,
  footer,
}: {
  rows: PlayEvent[];
  emptyLabel: string;
  formatPlayed: (startedAt: number) => string;
  footer?: string | null;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground py-12">
        {emptyLabel}
      </p>
    );
  }
  return (
    <>
      {rows.map((event) => (
        <TrackRow
          key={event.song.id}
          song={event.song}
          stat={formatPlayed(event.startedAt)}
          showAlbum={false}
          showQuality={false}
          showPlatform
        />
      ))}
      {/* States the cap outright, so the list ending is understood as a limit
          rather than as history having been lost. */}
      {footer && (
        <p className="pt-3 pb-1 text-center text-xs text-muted-foreground">
          {footer}
        </p>
      )}
    </>
  );
}
