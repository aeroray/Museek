import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type WheelEvent,
} from "react";
import {
  X,
  Loader2,
  Music,
  Captions,
  CaptionsOff,
  Maximize,
  Minimize,
  ScanEye,
  MessageCircle,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  HintTooltip,
  ShortcutTooltip,
} from "@/components/ui/shortcut-tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Controls } from "@/components/player/Controls";
import { CoverImage } from "@/components/common/CoverImage";
import { ProgressSlider } from "@/components/player/ProgressSlider";
import { SpecularFrame } from "@/components/common/SpecularFrame";
import { usePlayerStore } from "@/stores/playerStore";
import { useDesktopLyricsStore } from "@/stores/desktopLyricsStore";
import { hiResCover } from "@/lib/cover";
import { notify } from "@/lib/notify";
import { saveCoverToDisk } from "@/lib/saveCover";
import { canToggleDesktopLyrics, hideDesktopLyrics, openDesktopLyrics } from "@/lib/desktopLyrics";
import {
  clampLyricFontScale,
  readLyricFontScale,
  writeLyricFontScale,
} from "@/lib/lyrics/fontScale";
import {
  enterLyricsFullscreen,
  exitLyricsFullscreen,
  findActiveLyricIndex,
  isLyricsFullscreenSession,
  syncLyricsFullscreenState,
} from "@/lib/lyrics";
import { useT } from "@/lib/i18n";
import { isMacOs } from "@/lib/os";
import { getLyricTime, usePlaybackLyricIndex } from "@/lib/playback/clock";
import { cn } from "@/lib/utils";
import { hasKaraokeTiming, PlaybackKaraokeText } from "./KaraokeText";
import { CommentsPanel } from "./CommentsPanel";
import { LyricSourceMenu } from "./LyricSourceMenu";

const FONT_MIN = 0.85;
const FONT_MAX = 2.5;
const FONT_STEP = 0.15;
const SLIDE_MS = 320;
const COVER_MS = 300;
/** After the user scrolls lyrics, wait this long before snapping back to the sung line. */
const FOLLOW_RESUME_MS = 2000;
/** Hide immersive close + right-rail chrome after the pointer goes idle. */
const IMMERSIVE_CHROME_IDLE_MS = 2000;
const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const FADE =
  "linear-gradient(to bottom, transparent 0%, #000 16%, #000 84%, transparent 100%)";
const MAIN_FONT_POLICY = { min: FONT_MIN, max: FONT_MAX, defaultValue: 1 };

export function LyricsPanel() {
  const currentSong = usePlayerStore((s) => s.currentSong);
  const lyricLines = usePlayerStore((s) => s.lyricLines);
  const currentLyricIndex = usePlaybackLyricIndex(lyricLines);
  const showLyrics = usePlayerStore((s) => s.showLyrics);
  const lyricsLoading = usePlayerStore((s) => s.lyricsLoading);
  const currentPicUrl = usePlayerStore((s) => s.currentPicUrl);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const desktopLyricsVisible = useDesktopLyricsStore(
    (state) => state.isVisible,
  );
  const setShowLyrics = usePlayerStore((s) => s.setShowLyrics);
  const seek = usePlayerStore((s) => s.seek);
  const t = useT();
  const desktopLyricsControlsDisabled = !canToggleDesktopLyrics({
    hasSong: Boolean(currentSong),
    hasLyrics: lyricLines.length > 0,
    visible: desktopLyricsVisible,
  });
  const isLocalSong = currentSong?.source === "local";
  const commentsDisabled = !currentSong || isLocalSong;
  const [fontScale, setFontScale] = useState(() =>
    readLyricFontScale(MAIN_FONT_POLICY),
  );
  const fontScaleRef = useRef(fontScale);
  const [rendered, setRendered] = useState(showLyrics);
  const [entered, setEntered] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [lyricsOnly, setLyricsOnly] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  /** Cover is hidden in either exclusive mode: lyrics-only or comments. */
  const hideCover = lyricsOnly || commentsOpen;
  const pinningLayoutRef = useRef(false);
  const skipLayoutPinRef = useRef(true);
  const browsingUntilRef = useRef(0);
  const programmaticScrollRef = useRef(false);
  const followResumeTimerRef = useRef<number>(0);
  const progScrollTimerRef = useRef<number>(0);
  const [loadedHeroSrc, setLoadedHeroSrc] = useState<string | null>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);
  const [savingCover, setSavingCover] = useState(false);
  const savingCoverRef = useRef(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const chromeVisibleRef = useRef(true);
  const chromeHoldRef = useRef(false);
  const chromeMenuOpenRef = useRef(false);
  const commentsOpenRef = useRef(false);
  const immersiveRef = useRef(false);
  const chromeHideTimerRef = useRef(0);
  commentsOpenRef.current = commentsOpen;
  immersiveRef.current = immersive;

  const thumbSrc = currentPicUrl ?? currentSong?.meta.picUrl ?? null;
  const heroSrc = thumbSrc
    ? (hiResCover(thumbSrc, currentSong?.source) ?? thumbSrc)
    : null;
  const needsHeroUpgrade = !!heroSrc && !!thumbSrc && heroSrc !== thumbSrc;
  const heroReady = !needsHeroUpgrade || loadedHeroSrc === heroSrc;

  useEffect(() => {
    if (isLocalSong) setCommentsOpen(false);
  }, [isLocalSong]);

  const scheduleImmersiveChromeHide = useCallback(() => {
    window.clearTimeout(chromeHideTimerRef.current);
    if (!immersiveRef.current) return;
    chromeHideTimerRef.current = window.setTimeout(() => {
      if (
        chromeHoldRef.current ||
        chromeMenuOpenRef.current ||
        commentsOpenRef.current
      ) {
        return;
      }
      chromeVisibleRef.current = false;
      setChromeVisible(false);
    }, IMMERSIVE_CHROME_IDLE_MS);
  }, []);

  const revealImmersiveChrome = useCallback(() => {
    if (!chromeVisibleRef.current) {
      chromeVisibleRef.current = true;
      setChromeVisible(true);
    }
    scheduleImmersiveChromeHide();
  }, [scheduleImmersiveChromeHide]);

  const onImmersiveChromeEnter = useCallback(() => {
    chromeHoldRef.current = true;
    window.clearTimeout(chromeHideTimerRef.current);
    if (!chromeVisibleRef.current) {
      chromeVisibleRef.current = true;
      setChromeVisible(true);
    }
  }, []);

  const onImmersiveChromeLeave = useCallback(() => {
    chromeHoldRef.current = false;
    scheduleImmersiveChromeHide();
  }, [scheduleImmersiveChromeHide]);

  const onLyricSourceMenuOpenChange = useCallback(
    (open: boolean) => {
      chromeMenuOpenRef.current = open;
      if (open) {
        if (!chromeVisibleRef.current) {
          chromeVisibleRef.current = true;
          setChromeVisible(true);
        }
        window.clearTimeout(chromeHideTimerRef.current);
        return;
      }
      scheduleImmersiveChromeHide();
    },
    [scheduleImmersiveChromeHide],
  );

  useEffect(() => {
    if (!immersive) {
      chromeHoldRef.current = false;
      chromeVisibleRef.current = true;
      setChromeVisible(true);
      window.clearTimeout(chromeHideTimerRef.current);
      return;
    }
    const onMove = () => revealImmersiveChrome();
    window.addEventListener("pointermove", onMove, { passive: true });
    revealImmersiveChrome();
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.clearTimeout(chromeHideTimerRef.current);
    };
  }, [immersive, revealImmersiveChrome]);

  useEffect(() => {
    if (!immersive) return;
    if (commentsOpen) {
      chromeVisibleRef.current = true;
      setChromeVisible(true);
      window.clearTimeout(chromeHideTimerRef.current);
      return;
    }
    scheduleImmersiveChromeHide();
  }, [commentsOpen, immersive, scheduleImmersiveChromeHide]);

  useEffect(() => {
    if (showLyrics) {
      closingRef.current = false;
      setRendered(true);
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setEntered(true));
      });
      return () => cancelAnimationFrame(id);
    }
    setEntered(false);
    setImmersive(false);
    setCommentsOpen(false);
    void exitLyricsFullscreen();
    const timer = window.setTimeout(() => setRendered(false), SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [showLyrics]);

  useEffect(() => {
    if (!showLyrics || !isTauri || !immersive) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      unlisten = await win.onResized(() => {
        void (async () => {
          const still = await syncLyricsFullscreenState();
          if (!cancelled && !still) setImmersive(false);
        })();
      });
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [showLyrics, immersive]);

  const centerActiveLine = useCallback((behavior: ScrollBehavior) => {
    const state = usePlayerStore.getState();
    const idx = findActiveLyricIndex(state.lyricLines, getLyricTime());
    const line = lineRefs.current[idx];
    const root = scrollRef.current;
    if (idx < 0 || !line || !root) return;
    const viewport = root.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );
    if (!viewport) return;
    const vp = viewport.getBoundingClientRect();
    const lr = line.getBoundingClientRect();
    const delta = lr.top + lr.height / 2 - (vp.top + vp.height / 2);
    programmaticScrollRef.current = true;
    viewport.scrollTo({ top: viewport.scrollTop + delta, behavior });
    window.clearTimeout(progScrollTimerRef.current);
    progScrollTimerRef.current = window.setTimeout(
      () => {
        programmaticScrollRef.current = false;
      },
      behavior === "smooth" ? 480 : 40,
    );
  }, []);

  useEffect(() => {
    if (currentLyricIndex >= 0 && entered) {
      if (performance.now() < browsingUntilRef.current) return;
      centerActiveLine(pinningLayoutRef.current ? "auto" : "smooth");
    }
  }, [currentLyricIndex, centerActiveLine, entered]);

  useEffect(() => {
    if (!entered || lyricLines.length === 0) return;
    const root = scrollRef.current;
    const viewport = root?.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );
    if (!viewport) return;

    const linger = () => {
      browsingUntilRef.current = performance.now() + FOLLOW_RESUME_MS;
      window.clearTimeout(followResumeTimerRef.current);
      followResumeTimerRef.current = window.setTimeout(() => {
        browsingUntilRef.current = 0;
        if (usePlayerStore.getState().showLyrics) centerActiveLine("smooth");
      }, FOLLOW_RESUME_MS);
    };

    const onWheel = (event: globalThis.WheelEvent) => {
      const zooming = isMacOs() ? event.metaKey : event.ctrlKey;
      if (zooming) return;
      linger();
    };
    const onScroll = () => {
      if (programmaticScrollRef.current) return;
      linger();
    };

    viewport.addEventListener("wheel", onWheel, { passive: true });
    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("scroll", onScroll);
      window.clearTimeout(followResumeTimerRef.current);
    };
  }, [entered, lyricLines.length, centerActiveLine]);

  useEffect(() => {
    if (
      !entered ||
      (lyricsLoading && lyricLines.length === 0) ||
      lyricLines.length === 0
    )
      return;
    const id = requestAnimationFrame(() => centerActiveLine("auto"));
    return () => cancelAnimationFrame(id);
  }, [entered, lyricsLoading, lyricLines.length, centerActiveLine]);

  useEffect(() => {
    if (skipLayoutPinRef.current) {
      skipLayoutPinRef.current = false;
      return;
    }
    pinningLayoutRef.current = true;
    const started = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      centerActiveLine("auto");
      if (now - started < COVER_MS + 40) {
        raf = requestAnimationFrame(tick);
        return;
      }
      pinningLayoutRef.current = false;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      pinningLayoutRef.current = false;
    };
  }, [commentsOpen, lyricsOnly, centerActiveLine]);

  useEffect(() => {
    if (!showLyrics) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (commentsOpen) {
        e.preventDefault();
        setCommentsOpen(false);
        return;
      }
      if (isLyricsFullscreenSession() || immersive) {
        e.preventDefault();
        void (async () => {
          await exitLyricsFullscreen();
          setImmersive(false);
        })();
        return;
      }
      setShowLyrics(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showLyrics, setShowLyrics, immersive, commentsOpen]);

  const toggleImmersive = async () => {
    if (!isTauri) return;
    if (immersive || isLyricsFullscreenSession()) {
      await exitLyricsFullscreen();
      setImmersive(false);
      return;
    }
    const ok = await enterLyricsFullscreen();
    setImmersive(ok);
  };

  const closeLyrics = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    void (async () => {
      try {
        if (immersive || isLyricsFullscreenSession()) {
          await exitLyricsFullscreen();
          setImmersive(false);
        }
        setShowLyrics(false);
      } catch {
        setImmersive(false);
        setShowLyrics(false);
      }
    })();
  };

  const saveCover = () => {
    if (!currentSong || !thumbSrc || savingCoverRef.current) return;
    savingCoverRef.current = true;
    setSavingCover(true);
    void (async () => {
      try {
        const result = await saveCoverToDisk({
          song: currentSong,
          displayUrl: heroSrc ?? thumbSrc,
        });
        if (result === "saved") {
          notify({ message: t("lyrics.coverSaved"), variant: "success" });
        }
      } catch {
        notify({ message: t("lyrics.coverSaveFailed"), variant: "error" });
      } finally {
        savingCoverRef.current = false;
        setSavingCover(false);
      }
    })();
  };

  if (!rendered) return null;

  const fontShortcut = t(
    isMacOs() ? "lyrics.fontShortcutMac" : "lyrics.fontShortcutCtrl",
  );
  const setScale = (v: number) => {
    const nextScale = clampLyricFontScale(v, MAIN_FONT_POLICY);
    fontScaleRef.current = nextScale;
    setFontScale(nextScale);
    writeLyricFontScale(nextScale);
  };
  const handleLyricWheel = (event: WheelEvent<HTMLDivElement>) => {
    const modifierPressed = isMacOs() ? event.metaKey : event.ctrlKey;
    if (!modifierPressed || event.deltaY === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const direction = event.deltaY < 0 ? 1 : -1;
    const steps = Math.max(
      1,
      Math.min(3, Math.round(Math.abs(event.deltaY) / 100)),
    );
    setScale(
      +(fontScaleRef.current + direction * FONT_STEP * steps).toFixed(2),
    );
  };
  const toggleLyricsOnly = () => {
    if (lyricsOnly) {
      setLyricsOnly(false);
      return;
    }
    setCommentsOpen(false);
    setLyricsOnly(true);
  };

  const toggleComments = () => {
    if (commentsOpen) {
      setCommentsOpen(false);
      return;
    }
    if (commentsDisabled) return;
    setLyricsOnly(false);
    setCommentsOpen(true);
  };
  const hideImmersiveChrome = immersive && !chromeVisible;
  const immersiveChromeClass = cn(
    "z-20 transition-opacity duration-200 ease-emphasized",
    hideImmersiveChrome && "pointer-events-none opacity-0",
  );
  const showBlur = !!thumbSrc;

  const coverArt = (
    <div className="group/cover relative h-full w-full bg-muted/50">
      {thumbSrc ? (
        <>
          <img
            src={thumbSrc}
            alt=""
            className={cn(
              "absolute inset-0 h-full w-full object-cover transition-[filter,transform,opacity] duration-700 ease-out",
              needsHeroUpgrade && "scale-105 blur-md opacity-80",
            )}
            decoding="async"
          />
          {needsHeroUpgrade && (
            <div
              className={cn(
                "absolute inset-0 transition-opacity duration-700 ease-out",
                heroReady ? "opacity-100" : "pointer-events-none opacity-0",
              )}
            >
              <CoverImage
                src={heroSrc}
                alt="album"
                loading="eager"
                showOutline={false}
                className="absolute inset-0"
                onLoaded={(loaded) => {
                  if (loaded && heroSrc) setLoadedHeroSrc(heroSrc);
                }}
              />
            </div>
          )}
          <div
            className={cn(
              "absolute inset-0 z-10 flex items-end justify-end bg-gradient-to-t from-black/50 via-black/10 to-transparent p-2.5 opacity-0 transition-opacity duration-200 ease-emphasized",
              "pointer-events-none group-hover/cover:pointer-events-auto group-hover/cover:opacity-100",
              "group-focus-within/cover:pointer-events-auto group-focus-within/cover:opacity-100",
              savingCover && "pointer-events-auto opacity-100",
            )}
          >
            <HintTooltip label={t("lyrics.downloadCover")} side="top">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full bg-black/55 text-white shadow-sm backdrop-blur-sm hover:bg-black/70 hover:text-white icon-hover-download"
                disabled={savingCover}
                onClick={(event) => {
                  event.stopPropagation();
                  saveCover();
                }}
              >
                {savingCover ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Download size={16} />
                )}
              </Button>
            </HintTooltip>
          </div>
        </>
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted/60 text-muted-foreground/50">
          <Music size={36} strokeWidth={1.5} className="animate-pulse" />
          <span className="text-xs">{t("lyrics.noCover")}</span>
        </div>
      )}
    </div>
  );

  return (
    <div
      className={cn(
        "absolute inset-0 z-40 flex flex-col overflow-hidden bg-background",
        "transition-transform duration-320 will-change-transform",
        entered ? "translate-y-0 ease-out" : "translate-y-full ease-in",
      )}
      aria-hidden={!entered}
    >
      {thumbSrc ? (
        <div
          className={cn(
            "absolute inset-0 scale-125 bg-cover bg-center transition-opacity duration-500 ease-out",
            showBlur ? "opacity-100" : "opacity-0",
          )}
          style={{
            backgroundImage: `url(${thumbSrc})`,
            filter: "blur(80px) saturate(1.5)",
          }}
        />
      ) : null}
      <div
        className={cn(
          "absolute inset-0 bg-gradient-to-br from-primary/30 via-background to-secondary/30 transition-opacity duration-500 ease-out",
          showBlur ? "opacity-0" : "opacity-100",
        )}
      />
      <div className="absolute inset-0 bg-background/65" />

      <div
        className={cn("absolute top-4 right-4", immersiveChromeClass)}
        onPointerEnter={onImmersiveChromeEnter}
        onPointerLeave={onImmersiveChromeLeave}
        onFocusCapture={onImmersiveChromeEnter}
        onBlurCapture={(event) => {
          if (
            !event.currentTarget.contains(event.relatedTarget as Node | null)
          ) {
            onImmersiveChromeLeave();
          }
        }}
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground/70 hover:text-foreground"
          onClick={closeLyrics}
        >
          <X size={20} />
        </Button>
      </div>

      <div
        className={cn(
          "absolute right-4 top-1/2 flex -translate-y-1/2 flex-col items-center gap-1",
          immersiveChromeClass,
        )}
        onPointerEnter={onImmersiveChromeEnter}
        onPointerLeave={onImmersiveChromeLeave}
        onFocusCapture={onImmersiveChromeEnter}
        onBlurCapture={(event) => {
          if (
            !event.currentTarget.contains(event.relatedTarget as Node | null)
          ) {
            onImmersiveChromeLeave();
          }
        }}
      >
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-9 w-9 icon-hover-captions",
            lyricsOnly
              ? "text-primary"
              : "text-muted-foreground/55 hover:text-muted-foreground",
          )}
          onClick={toggleLyricsOnly}
          title={t(lyricsOnly ? "lyrics.exitSolo" : "lyrics.solo")}
          aria-label={t(lyricsOnly ? "lyrics.exitSolo" : "lyrics.solo")}
          aria-pressed={lyricsOnly}
        >
          <ScanEye size={16} />
        </Button>
        {isTauri && (
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground/55 hover:text-muted-foreground icon-hover-maximize"
            onClick={() => void toggleImmersive()}
            title={t(immersive ? "lyrics.exitFullscreen" : "lyrics.fullscreen")}
          >
            {immersive ? <Minimize size={18} /> : <Maximize size={18} />}
          </Button>
        )}
        <LyricSourceMenu
          song={currentSong}
          onOpenChange={onLyricSourceMenuOpenChange}
        />
        <HintTooltip
          label={isLocalSong ? t("comments.local") : t("comments.title")}
          side="left"
        >
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-9 w-9 icon-hover-comments",
              commentsOpen
                ? "text-primary"
                : "text-muted-foreground/55 hover:text-muted-foreground",
            )}
            onClick={toggleComments}
            aria-pressed={commentsOpen}
            disabled={commentsDisabled}
          >
            <MessageCircle size={16} />
          </Button>
        </HintTooltip>
        <ShortcutTooltip
          label={t(
            desktopLyricsVisible
              ? "player.desktopLyricsClose"
              : "player.desktopLyrics",
          )}
          action="desktopLyrics"
          side="left"
        >
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-9 w-9 icon-hover-captions",
              desktopLyricsVisible
                ? "text-primary"
                : "text-muted-foreground/55 hover:text-muted-foreground",
            )}
            onClick={() =>
              void (desktopLyricsVisible
                ? hideDesktopLyrics()
                : openDesktopLyrics())
            }
            disabled={desktopLyricsControlsDisabled}
          >
            {desktopLyricsVisible ? (
              <CaptionsOff size={16} />
            ) : (
              <Captions size={16} />
            )}
          </Button>
        </ShortcutTooltip>
      </div>

      <div className="relative z-10 flex h-full min-h-0">
        <div
          className={cn(
            "flex shrink-0 flex-col items-center justify-center gap-6 transition-[width,opacity,transform,padding] duration-300 ease-out",
            hideCover
              ? "pointer-events-none w-0 -translate-x-4 overflow-hidden p-0 opacity-0"
              : "w-2/5 overflow-visible p-12",
          )}
        >
          {currentSong && (
            <div className="text-center max-w-xs">
              <p
                className="text-2xl font-semibold truncate tracking-tight"
                title={currentSong.name}
              >
                {currentSong.name}
              </p>
              <p
                className="text-muted-foreground mt-1.5 truncate"
                title={currentSong.singer}
              >
                {currentSong.singer}
              </p>
            </div>
          )}
          <div
            className={cn(
              "lyric-cover-float w-60 shrink-0",
              !isPlaying && "is-paused",
            )}
          >
            <SpecularFrame
              autoAnimate
              paused={!isPlaying}
              followMouse={false}
              className="h-60 w-60"
              radius={16}
              lineColor="#ffffff"
              baseColor="#9ca3af"
              intensity={1.85}
              shineSize={18}
              shineFade={28}
              thickness={0.8}
              speed={-0.5}
            >
              {coverArt}
            </SpecularFrame>
          </div>
          <Controls />
        </div>

        <div
          className="relative flex-1 min-h-0"
          onWheel={handleLyricWheel}
          style={{ maskImage: FADE, WebkitMaskImage: FADE }}
        >
          {lyricsLoading && lyricLines.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 size={28} className="animate-spin" />
              <p className="text-sm">{t("lyrics.loading")}</p>
            </div>
          ) : lyricLines.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
              {currentSong ? t("lyrics.empty") : t("lyrics.selectSong")}
            </div>
          ) : (
            <>
              <ScrollArea ref={scrollRef} className="lyrics-scroll h-full">
                <div
                  className={cn(
                    "py-[42vh] text-center animate-in fade-in duration-300",
                    hideCover ? "px-4" : "pl-4 pr-24",
                  )}
                >
                  {!lyricsOnly && (
                    <p className="pointer-events-none select-none py-2 font-sans text-xs font-medium leading-5 text-muted-foreground/55">
                      {t("lyrics.fontHint", { shortcut: fontShortcut })}
                    </p>
                  )}
                  {lyricLines.map((line, i) => {
                    const active = i === currentLyricIndex;
                    return (
                      <div
                        key={i}
                        ref={(el) => {
                          lineRefs.current[i] = el;
                        }}
                        onClick={() => seek(line.time)}
                        className={cn(
                          "py-2.5 cursor-pointer transition-[color,font-size] duration-300 ease-out",
                          active
                            ? "text-primary font-semibold"
                            : "text-muted-foreground/50 hover:text-muted-foreground",
                        )}
                        style={{
                          fontSize: `${(active ? 1.4 : 0.95) * fontScale}rem`,
                        }}
                      >
                        <p className="transition-colors duration-300 ease-out motion-reduce:transition-none">
                          {active && hasKaraokeTiming(line) ? (
                            <PlaybackKaraokeText line={line} />
                          ) : (
                            line.text
                          )}
                        </p>
                        {line.translation && (
                          <p
                            className="mt-1 opacity-80"
                            style={{
                              fontSize: `${(active ? 1 : 0.85) * fontScale}rem`,
                            }}
                          >
                            <span className="block transition-colors duration-300 ease-out motion-reduce:transition-none">
                              {line.translation}
                            </span>
                          </p>
                        )}
                      </div>
                    );
                  })}
                  {!lyricsOnly && (
                    <p className="pointer-events-none select-none py-2 font-sans text-xs font-medium leading-5 text-muted-foreground/55">
                      {t("lyrics.fontHint", { shortcut: fontShortcut })}
                    </p>
                  )}
                </div>
              </ScrollArea>
              <div
                className="lyrics-edge-blur lyrics-edge-blur--top"
                aria-hidden="true"
              />
              <div
                className="lyrics-edge-blur lyrics-edge-blur--bottom"
                aria-hidden="true"
              />
            </>
          )}
        </div>
        <CommentsPanel song={currentSong} open={commentsOpen} />
      </div>
      <ProgressSlider flush />
      <div
        data-tauri-drag-region
        className={cn(
          "absolute left-0 top-0 z-10 h-10 select-none",
          commentsOpen ? "right-[22rem]" : "right-0",
        )}
        aria-hidden="true"
      />
    </div>
  );
}
