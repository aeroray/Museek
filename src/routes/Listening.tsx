import { useMemo, useState } from "react";
import {
  Footprints,
  ListFilter,
  Play,
  Search,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CoverImage } from "@/components/common/CoverImage";
import { TrackRow } from "@/components/common/TrackRow";
import { useListeningStore } from "@/stores/listeningStore";
import { usePlayerStore } from "@/stores/playerStore";
import { useUiStore } from "@/stores/uiStore";
import {
  aggregateListening,
  eventsWithLive,
  type ListenPeriod,
  type PlayEvent,
  type TopArtistStat,
  type TopSongStat,
} from "@/lib/listenLog";
import { formatListenDuration } from "@/lib/listenFormat";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const PERIODS: ListenPeriod[] = ["today", "week", "month", "all"];
const TABS = ["songs", "artists", "recent"] as const;
type ListenTab = (typeof TABS)[number];

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function formatRelativePlayed(
  startedAt: number,
  now: number,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  const delta = Math.max(0, now - startedAt);
  if (delta < 60_000) return t("listening.justNow");
  if (delta < 60 * 60_000) {
    return t("listening.minutesAgo", { count: Math.floor(delta / 60_000) });
  }
  const date = new Date(startedAt);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const time = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  if (startedAt >= today.getTime()) return time;
  if (startedAt >= yesterday.getTime()) return t("listening.yesterdayAt", { time });
  return t("listening.dateAt", {
    date: `${date.getMonth() + 1}/${date.getDate()}`,
    time,
  });
}

function matchesQuery(
  query: string,
  ...fields: Array<string | undefined>
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((field) => (field ?? "").toLowerCase().includes(q));
}

export function Listening() {
  const t = useT();
  const events = useListeningStore((s) => s.events);
  const live = useListeningStore((s) => s.live);
  const playAll = usePlayerStore((s) => s.playAll);
  const tab = useUiStore((s) => s.listeningTab);
  const setTab = useUiStore((s) => s.setListeningTab);
  const [period, setPeriod] = useState<ListenPeriod>("week");
  const [artist, setArtist] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const now = live?.playing ? Date.now() : live?.lastTick ?? Date.now();

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
    tab === "artists"
      ? []
      : tab === "recent"
        ? recents.map((event) => event.song)
        : songs.map((row) => row.song);

  const searchPlaceholder =
    tab === "artists"
      ? t("listening.searchArtists")
      : tab === "recent"
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
            {empty
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
            {TABS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => switchTab(id)}
                className={cn(
                  "px-3 py-1 rounded-full text-sm font-medium transition-colors",
                  tab === id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(
                  id === "songs"
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

      {!empty && (
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

          {artist && tab === "songs" && (
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
      )}

      {empty ? (
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
            {tab === "songs" ? (
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
            ) : tab === "artists" ? (
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
          <div className="relative h-10 w-10 shrink-0 rounded-xl overflow-hidden bg-muted shadow-[var(--shadow-border)]">
            {row.song.meta.picUrl ? (
              <CoverImage src={row.song.meta.picUrl} />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                <Users size={16} />
              </div>
            )}
          </div>
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
}: {
  rows: PlayEvent[];
  emptyLabel: string;
  formatPlayed: (startedAt: number) => string;
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
          key={event.id}
          song={event.song}
          stat={formatPlayed(event.startedAt)}
          showAlbum={false}
          showQuality={false}
          showPlatform
        />
      ))}
    </>
  );
}
