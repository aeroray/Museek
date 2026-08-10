import type { PointerEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
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
import { usePlaybackLyricIndex } from "@/lib/playback/clock";
import { cn } from "@/lib/utils";

/** Current lyric line for the top bar, or a warm welcome when no song is loaded. */
function TopBarLyrics() {
  const t = useT();
  const location = useLocation();
  const enabled = useUiStore((s) => s.topBarLyrics);
  const currentSong = usePlayerStore((s) => s.currentSong);
  const lyricLines = usePlayerStore((s) => s.lyricLines);
  const currentLyricIndex = usePlaybackLyricIndex(lyricLines);
  const lyricsLoading = usePlayerStore((s) => s.lyricsLoading);
  const searchContext = useSearchStore(
    (s) => `${s.query.trim() ? "searched" : "landing"}:${s.platform}`,
  );
  const startDragging = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    void getCurrentWindow().startDragging();
  };

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

  let text = "";
  let muted = true;
  if (lyricsLoading && lyricLines.length === 0) {
    text = t("lyrics.loading");
  } else if (lyricLines.length === 0) {
    text = currentSong.name;
  } else {
    const idx = Math.max(0, currentLyricIndex);
    text = lyricLines[idx]?.text?.trim() || currentSong.name;
    muted = false;
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
      className={cn(
        "mx-2 min-w-0 flex-1 select-none",
        // Stay inside the h-10 top bar; leave room for descenders (g/y/p).
        "flex h-8 items-center justify-center rounded-md px-3",
      )}
      onPointerDown={startDragging}
    >
      <span
        key={`${currentSong?.id ?? "none"}-${currentLyricIndex}-${text}`}
        className={cn(
          "block max-w-full truncate text-center text-base leading-tight tracking-tight",
          "animate-in fade-in duration-300",
          muted
            ? "text-muted-foreground/70 font-normal"
            : "text-primary font-medium",
        )}
      >
        {text}
      </span>
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
