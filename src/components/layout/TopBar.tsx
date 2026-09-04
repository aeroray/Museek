import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeClosed,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { WindowControls } from "./WindowControls";
import { WarmWelcome } from "@/components/search/SearchWelcome";
import { useUiStore } from "@/stores/uiStore";
import { usePlayerStore } from "@/stores/playerStore";
import { useSearchStore } from "@/stores/searchStore";
import { useT } from "@/lib/i18n";
import { shortcutTitle, useShortcutCombo } from "@/components/ui/shortcut-tooltip";
import { usePlaybackLyricIndex } from "@/lib/playback/clock";
import { cn } from "@/lib/utils";
import { PlaybackKaraokeText } from "@/components/lyrics/KaraokeText";
import { LyricTransition } from "@/components/lyrics/LyricTransition";

/** Current lyric line for the top bar, or a warm welcome when no song is loaded. */
function TopBarLyrics() {
  const t = useT();
  const lyricsCombo = useShortcutCombo("lyrics");
  const location = useLocation();
  const enabled = useUiStore((s) => s.topBarLyrics);
  const currentSong = usePlayerStore((s) => s.currentSong);
  const setShowLyrics = usePlayerStore((s) => s.setShowLyrics);
  const lyricLines = usePlayerStore((s) => s.lyricLines);
  const currentLyricIndex = usePlaybackLyricIndex(lyricLines);
  const lyricsLoading = usePlayerStore((s) => s.lyricsLoading);
  const searchContext = useSearchStore(
    (s) => `${s.query.trim() ? "searched" : "landing"}:${s.platform}`,
  );
  if (!enabled) {
    return (
      <div
        data-tauri-drag-region
        className="mx-2 min-w-0 flex-1 select-none"
        aria-hidden
      />
    );
  }

  if (!currentSong) {
    return <WarmWelcome refreshKey={`${location.pathname}:${searchContext}`} />;
  }

  const activeLine = lyricLines[Math.max(0, currentLyricIndex)]?.text?.trim()
    ? lyricLines[Math.max(0, currentLyricIndex)]
    : null;
  let text = "";
  if (lyricsLoading && lyricLines.length === 0) {
    text = t("lyrics.loading");
  } else if (lyricLines.length === 0) {
    text = currentSong.name;
  } else {
    text = activeLine?.text.trim() || currentSong.name;
  }

  if (!text) {
    return (
      <div
        data-tauri-drag-region
        className="mx-2 min-w-0 flex-1 select-none"
        aria-hidden
      />
    );
  }

  return (
    <div
      data-tauri-drag-region
      className="mx-2 flex h-8 min-w-0 flex-1 items-center justify-center select-none"
    >
      <button
        type="button"
        className={cn(
          "inline-flex max-w-full min-w-0 items-center rounded-md px-2 py-0.5",
          "text-center",
          lyricLines.length > 0
            ? "cursor-pointer transition-[background-color,color] duration-200 ease-out hover:bg-accent/60"
            : "cursor-default",
        )}
        onClick={() => {
          if (lyricLines.length > 0) setShowLyrics(true);
        }}
        title={shortcutTitle(t("player.lyrics"), lyricsCombo)}
      >
        <LyricTransition
          transitionKey={`${currentSong.id}-${currentLyricIndex}-${text}`}
          className="w-max max-w-full min-w-0"
        >
          {activeLine ? (
            <PlaybackKaraokeText
              line={activeLine}
              className="top-bar-lyrics-text block max-w-full truncate text-center text-base leading-tight tracking-tight text-primary font-medium"
            />
          ) : (
            <span className="top-bar-lyrics-text block max-w-full truncate text-center text-base leading-tight tracking-tight text-muted-foreground/70 font-normal">
              {text}
            </span>
          )}
        </LyricTransition>
      </button>
    </div>
  );
}

/**
 * Slim top toolbar: sidebar toggle, top-bar lyrics toggle, live lyrics, nav + chrome.
 */
export function TopBar() {
  const navigate = useNavigate();
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const topBarLyrics = useUiStore((s) => s.topBarLyrics);
  const toggleTopBarLyrics = useUiStore((s) => s.toggleTopBarLyrics);
  const t = useT();

  return (
    <div
      data-tauri-drag-region
      className="h-10 shrink-0 flex items-center gap-0.5 border-b border-border/50 pl-2 pr-1"
    >
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground icon-hover-panel"
        onClick={toggleSidebar}
        title={sidebarCollapsed ? t("sidebar.expand") : t("sidebar.collapse")}
      >
        <span key={sidebarCollapsed ? "open" : "close"} className="icon-pop-in">
          {sidebarCollapsed ? (
            <PanelLeftOpen size={16} />
          ) : (
            <PanelLeftClose size={16} />
          )}
        </span>
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground icon-hover-captions"
        onClick={toggleTopBarLyrics}
        title={topBarLyrics ? t("topBar.lyricsHide") : t("topBar.lyricsShow")}
      >
        <span
          key={topBarLyrics ? "on" : "off"}
          className="icon-pop-in inline-flex"
        >
          {topBarLyrics ? (
            <Eye size={18} strokeWidth={2} />
          ) : (
            <EyeClosed size={18} strokeWidth={2} />
          )}
        </span>
      </Button>

      <TopBarLyrics />

      <div className="flex shrink-0 items-center gap-1">
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground icon-hover-arrow-left"
            onClick={() => navigate(-1)}
            title={t("nav.back")}
          >
            <ArrowLeft size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground icon-hover-arrow-right"
            onClick={() => navigate(1)}
            title={t("nav.forward")}
          >
            <ArrowRight size={16} />
          </Button>
        </div>
        <WindowControls />
      </div>
    </div>
  );
}
