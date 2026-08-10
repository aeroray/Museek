import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type WheelEvent,
} from "react";
import { emitTo, listen } from "@tauri-apps/api/event";
import {
  availableMonitors,
  cursorPosition,
  getCurrentWindow,
  type Monitor,
} from "@tauri-apps/api/window";
import { Lock, LockOpen, X } from "lucide-react";
import { applyLanguageSnapshot, useT } from "@/lib/i18n";
import { KaraokeText } from "./KaraokeText";
import { LyricTransition } from "./LyricTransition";
import {
  clampLyricFontScale,
  readLyricFontScale,
  writeLyricFontScale,
} from "@/lib/lyrics/fontScale";
import { isMacOs } from "@/lib/os";
import { findActiveLyricIndex } from "@/lib/lyrics";
import { applyThemeSnapshot } from "@/stores/themeStore";
import {
  DEFAULT_FONT_SCALE,
  FONT_MAX,
  FONT_MIN,
  FONT_STEP,
  applyDesktopLyricsInteractionMode,
  clampAndPersistDesktopLyricsGeometry,
  isInteractionMode,
  monitorForRect,
  pointInElement,
  pointInMonitor,
  persistDesktopLyricsGeometry,
  queueDesktopLyricsDragPosition,
  resizeDesktopLyricsWindowForFontScale,
  restoreDesktopLyricsGeometry,
  scheduleDesktopLyricsDragPosition,
  type DesktopLyricsDragState,
} from "@/lib/desktopLyricsWindow";
import {
  DESKTOP_LYRICS_APPEARANCE_EVENT,
  DESKTOP_LYRICS_CLOSED_EVENT,
  DESKTOP_LYRICS_INTERACTION_EVENT,
  DESKTOP_LYRICS_REQUEST_EVENT,
  DESKTOP_LYRICS_SET_INTERACTION_EVENT,
  DESKTOP_LYRICS_STATE_EVENT,
  DESKTOP_LYRICS_TIME_EVENT,
  type DesktopLyricsAppearanceSnapshot,
  type DesktopLyricsInteractionMode,
  type DesktopLyricsSnapshot,
} from "@/lib/desktopLyricsProtocol";

const EMPTY_SNAPSHOT: DesktopLyricsSnapshot = {
  song: null,
  lines: [],
  currentTime: 0,
  currentLyricIndex: -1,
  isPlaying: false,
  status: "idle",
  lyricsLoading: false,
};

const LYRIC_FONT_SIZE = 28;
const DEFAULT_LYRIC_PADDING = {
  top: 10,
  horizontal: 14,
  bottom: 8,
} as const;
const DESKTOP_FONT_POLICY = {
  min: FONT_MIN,
  max: FONT_MAX,
  defaultValue: DEFAULT_FONT_SCALE,
};

export function DesktopLyricsApp() {
  const t = useT();
  const [snapshot, setSnapshot] =
    useState<DesktopLyricsSnapshot>(EMPTY_SNAPSHOT);
  const [currentTime, setCurrentTime] = useState(EMPTY_SNAPSHOT.currentTime);
  const [interactionMode, setInteractionMode] =
    useState<DesktopLyricsInteractionMode>("interactive");
  const [capsuleVisible, setCapsuleVisible] = useState(true);
  const [fontScale, setFontScale] = useState(() =>
    readLyricFontScale(DESKTOP_FONT_POLICY),
  );
  const [isLyricsHovered, setIsLyricsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fontScaleRef = useRef(fontScale);
  const resizePromiseRef = useRef(Promise.resolve());
  const headingGroupRef = useRef<HTMLDivElement | null>(null);
  const lyricShellRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const ignoreCursorEventsRef = useRef<boolean | null>(null);
  const isDraggingRef = useRef(false);
  const dragRef = useRef<DesktopLyricsDragState | null>(null);
  const hasLyricContent = Boolean(snapshot.song && snapshot.lines.length > 0);

  const finishDragging = (pointerId?: number) => {
    const drag = dragRef.current;
    if (
      !drag ||
      drag.finished ||
      (pointerId !== undefined && drag.pointerId !== pointerId)
    ) {
      return;
    }

    drag.finished = true;
    if (drag.frameId !== null) {
      window.cancelAnimationFrame(drag.frameId);
      drag.frameId = null;
    }
    const finalize = async () => {
      const point = await cursorPosition().catch(() => null);
      if (point && dragRef.current === drag) {
        drag.latestCursorX = point.x;
        drag.latestCursorY = point.y;
      }
      await queueDesktopLyricsDragPosition(
        drag,
        () => dragRef.current === drag,
        true,
      );
      await clampAndPersistDesktopLyricsGeometry(headingGroupRef.current);
    };
    void finalize()
      .catch(() => {})
      .finally(() => {
        if (dragRef.current === drag) {
          dragRef.current = null;
          isDraggingRef.current = false;
          setIsDragging(false);
        }
      });
  };

  useEffect(() => {
    let disposed = false;
    let unlistenState: (() => void) | undefined;
    let unlistenTime: (() => void) | undefined;
    let unlistenAppearance: (() => void) | undefined;
    let unlistenInteraction: (() => void) | undefined;
    const retryTimers: number[] = [];
    const requestSync = () => {
      void emitTo("main", DESKTOP_LYRICS_REQUEST_EVENT, null).catch(() => {});
    };

    void (async () => {
      try {
        const [stopState, stopTime, stopAppearance, stopInteraction] =
          await Promise.all([
            listen<DesktopLyricsSnapshot>(
              DESKTOP_LYRICS_STATE_EVENT,
              (event) => {
                ignoreCursorEventsRef.current = null;
                setSnapshot(event.payload);
                setCurrentTime(event.payload.currentTime);
              },
            ),
            listen<number>(DESKTOP_LYRICS_TIME_EVENT, (event) => {
              if (Number.isFinite(event.payload)) {
                setCurrentTime(Math.max(0, event.payload));
              }
            }),
            listen<DesktopLyricsAppearanceSnapshot>(
              DESKTOP_LYRICS_APPEARANCE_EVENT,
              (event) => {
                applyThemeSnapshot(
                  event.payload.themeMode,
                  event.payload.palette,
                );
                applyLanguageSnapshot(event.payload.lang);
                setCapsuleVisible(event.payload.capsuleVisible !== false);
              },
            ),
            listen<DesktopLyricsInteractionMode>(
              DESKTOP_LYRICS_INTERACTION_EVENT,
              (event) => {
                if (!isInteractionMode(event.payload)) return;
                ignoreCursorEventsRef.current = null;
                setIsLyricsHovered(false);
                setInteractionMode(event.payload);
                void applyDesktopLyricsInteractionMode(event.payload);
              },
            ),
          ]);
        if (disposed) {
          stopState();
          stopTime();
          stopAppearance();
          stopInteraction();
          return;
        }
        unlistenState = stopState;
        unlistenTime = stopTime;
        unlistenAppearance = stopAppearance;
        unlistenInteraction = stopInteraction;
        requestSync();
        retryTimers.push(
          window.setTimeout(requestSync, 250),
          window.setTimeout(requestSync, 1000),
        );
      } catch {
        /* The window can be opened before the main window has finished booting. */
      }
    })();

    return () => {
      disposed = true;
      unlistenState?.();
      unlistenTime?.();
      unlistenAppearance?.();
      unlistenInteraction?.();
      retryTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let checking = false;
    const lyricsWindow = getCurrentWindow();

    const setCursorPassthrough = async (ignore: boolean) => {
      if (disposed || ignoreCursorEventsRef.current === ignore) return;
      ignoreCursorEventsRef.current = ignore;
      await lyricsWindow.setIgnoreCursorEvents(ignore).catch(() => {});
    };

    const syncCursorHitArea = async () => {
      if (disposed || checking) return;
      checking = true;
      try {
        if (interactionMode !== "interactive" || !hasLyricContent) {
          setIsLyricsHovered(false);
          await setCursorPassthrough(true);
          return;
        }

        if (isDraggingRef.current) {
          await setCursorPassthrough(false);
          const drag = dragRef.current;
          if (drag?.ready && !drag.finished) {
            const point = await cursorPosition().catch(() => null);
            if (point) {
              drag.latestCursorX = point.x;
              drag.latestCursorY = point.y;
              scheduleDesktopLyricsDragPosition(
                drag,
                () => dragRef.current === drag,
              );
            }
          }
          return;
        }

        const lyricShell = lyricShellRef.current;
        if (!lyricShell) {
          await setCursorPassthrough(true);
          return;
        }

        const [point, position, scaleFactor] = await Promise.all([
          cursorPosition(),
          lyricsWindow.outerPosition(),
          lyricsWindow.scaleFactor(),
        ]);
        const scale = scaleFactor || window.devicePixelRatio || 1;
        let inside = pointInElement(point, lyricShell, position, scale);
        if (!inside && isLyricsHovered && toolbarRef.current) {
          inside = pointInElement(point, toolbarRef.current, position, scale);
        }
        setIsLyricsHovered((current) =>
          current === inside ? current : inside,
        );
        await setCursorPassthrough(!inside);
      } catch {
        setIsLyricsHovered(false);
        await setCursorPassthrough(true);
      } finally {
        checking = false;
      }
    };

    void syncCursorHitArea();
    const timer = window.setInterval(() => {
      void syncCursorHitArea();
    }, 50);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [hasLyricContent, interactionMode, isLyricsHovered]);

  useEffect(() => {
    const stopDragging = () => {
      finishDragging();
    };
    window.addEventListener("pointerup", stopDragging, true);
    window.addEventListener("pointercancel", stopDragging, true);
    return () => {
      window.removeEventListener("pointerup", stopDragging, true);
      window.removeEventListener("pointercancel", stopDragging, true);
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let saveTimer: number | undefined;
    let unlistenMoved: (() => void) | undefined;
    let unlistenResized: (() => void) | undefined;
    let unlistenScaleChanged: (() => void) | undefined;

    void (async () => {
      await restoreDesktopLyricsGeometry().catch(() => {});
      if (disposed) return;

      const schedulePersist = () => {
        if (saveTimer !== undefined) window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(() => {
          saveTimer = undefined;
          if (isDraggingRef.current) return;
          void persistDesktopLyricsGeometry();
        }, 220);
      };
      const restoreLogicalSizeAfterScaleChange = () => {
        if (disposed) return;
        void restoreDesktopLyricsGeometry()
          .then(async () => {
            if (disposed) return;
            await new Promise<void>((resolve) => {
              window.requestAnimationFrame(() => resolve());
            });
            await clampAndPersistDesktopLyricsGeometry(headingGroupRef.current);
            if (!disposed) schedulePersist();
          })
          .catch(() => {});
      };
      const currentWindow = getCurrentWindow();
      const [moved, resized, scaleChanged] = await Promise.all([
        currentWindow.onMoved(schedulePersist),
        currentWindow.onResized(schedulePersist),
        currentWindow.onScaleChanged(restoreLogicalSizeAfterScaleChange),
      ]);
      if (disposed) {
        moved();
        resized();
        scaleChanged();
        return;
      }
      unlistenMoved = moved;
      unlistenResized = resized;
      unlistenScaleChanged = scaleChanged;
    })();

    return () => {
      disposed = true;
      if (saveTimer !== undefined) window.clearTimeout(saveTimer);
      unlistenMoved?.();
      unlistenResized?.();
      unlistenScaleChanged?.();
      void persistDesktopLyricsGeometry().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!hasLyricContent) return;
    let disposed = false;
    const frameId = window.requestAnimationFrame(() => {
      if (disposed) return;
      void clampAndPersistDesktopLyricsGeometry(headingGroupRef.current);
    });
    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
    };
  }, [hasLyricContent]);

  const setScale = (value: number) => {
    const previousScale = fontScaleRef.current;
    const nextScale = clampLyricFontScale(value, DESKTOP_FONT_POLICY);
    if (nextScale === previousScale) return;

    fontScaleRef.current = nextScale;
    setFontScale(nextScale);
    writeLyricFontScale(nextScale);
    const resizePromise = resizePromiseRef.current.then(() =>
      resizeDesktopLyricsWindowForFontScale(
        previousScale,
        nextScale,
        headingGroupRef.current,
      ),
    );
    resizePromiseRef.current = resizePromise.catch(() => {});
    void resizePromise;
  };
  const handleLyricWheel = (event: WheelEvent<HTMLDivElement>) => {
    const modifierPressed = isMacOs() ? event.metaKey : event.ctrlKey;
    if (
      interactionMode !== "interactive" ||
      !modifierPressed ||
      event.deltaY === 0
    ) {
      return;
    }
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
  const close = () => {
    void emitTo("main", DESKTOP_LYRICS_CLOSED_EVENT, null).catch(() => {});
    void getCurrentWindow().hide();
  };

  const toggleInteractionMode = () => {
    const next = interactionMode === "interactive" ? "locked" : "interactive";
    ignoreCursorEventsRef.current = null;
    setIsLyricsHovered(false);
    setInteractionMode(next);
    void applyDesktopLyricsInteractionMode(next);
    void emitTo("main", DESKTOP_LYRICS_SET_INTERACTION_EVENT, next).catch(
      () => {},
    );
  };

  const updateDragging = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.finished || drag.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    void cursorPosition()
      .then((point) => {
        if (dragRef.current !== drag || drag.finished) return;
        drag.latestCursorX = point.x;
        drag.latestCursorY = point.y;
        scheduleDesktopLyricsDragPosition(drag, () => dragRef.current === drag);
      })
      .catch(() => {});
  };

  const startDragging = (event: PointerEvent<HTMLDivElement>) => {
    if (
      interactionMode !== "interactive" ||
      event.button !== 0 ||
      (event.target as HTMLElement).closest("button")
    )
      return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const groupRect = event.currentTarget.getBoundingClientRect();
    const drag: DesktopLyricsDragState = {
      pointerId: event.pointerId,
      startCursorX: event.screenX,
      startCursorY: event.screenY,
      startPosition: null,
      width: 0,
      height: 0,
      monitors: [],
      monitor: null,
      visualLeftOffset: 0,
      visualRightOffset: 0,
      visualTopOffset: 0,
      visualBottomOffset: 0,
      latestCursorX: event.screenX,
      latestCursorY: event.screenY,
      ready: false,
      finished: false,
      frameId: null,
      positionPromise: Promise.resolve(),
    };
    dragRef.current = drag;
    isDraggingRef.current = true;
    setIsDragging(true);
    const currentWindow = getCurrentWindow();
    void Promise.all([
      currentWindow.outerPosition(),
      currentWindow.outerSize(),
      availableMonitors().catch(() => [] as Monitor[]),
      cursorPosition(),
      currentWindow.scaleFactor(),
    ])
      .then(([position, size, monitors, point, scaleFactor]) => {
        if (dragRef.current !== drag || drag.finished) return;
        drag.startCursorX = point.x;
        drag.startCursorY = point.y;
        drag.startPosition = { x: position.x, y: position.y };
        drag.width = size.width;
        drag.height = size.height;
        drag.latestCursorX = point.x;
        drag.latestCursorY = point.y;
        drag.monitors = monitors;
        const scale = scaleFactor || 1;
        drag.visualLeftOffset = Math.round(groupRect.left * scale);
        drag.visualRightOffset = Math.round(groupRect.right * scale);
        drag.visualTopOffset = Math.round(groupRect.top * scale);
        drag.visualBottomOffset = Math.round(groupRect.bottom * scale);
        drag.monitor =
          monitors.find((monitor) =>
            pointInMonitor(point.x, point.y, monitor),
          ) ??
          monitorForRect(
            {
              x: position.x,
              y: position.y,
              width: size.width,
              height: size.height,
            },
            monitors,
          ) ??
          null;
        drag.ready = true;
        scheduleDesktopLyricsDragPosition(drag, () => dragRef.current === drag);
      })
      .catch(() => finishDragging(event.pointerId));
  };

  const actionTabIndex = interactionMode === "interactive" ? 0 : -1;

  const activeLyricIndex = findActiveLyricIndex(snapshot.lines, currentTime);
  const displayedLyricIndex = activeLyricIndex >= 0 ? activeLyricIndex : 0;
  const activeLine = snapshot.lines[displayedLyricIndex] ?? null;
  const lyricPaddingScale = fontScale / DEFAULT_FONT_SCALE;

  return (
    <div
      className="desktop-lyrics-window"
      data-capsule-visible={capsuleVisible ? "true" : "false"}
      data-interaction-mode={interactionMode}
    >
      <main className="desktop-lyrics-body" aria-live="polite">
        <section className="desktop-lyrics-stage">
          {snapshot.lyricsLoading && snapshot.lines.length === 0 ? (
            <p className="desktop-lyrics-message">{t("lyrics.loading")}</p>
          ) : !snapshot.song ? (
            <p className="desktop-lyrics-message">
              {t("desktopLyrics.noSong")}
            </p>
          ) : snapshot.lines.length === 0 ? (
            <p className="desktop-lyrics-message">{t("lyrics.empty")}</p>
          ) : (
            <div
              ref={headingGroupRef}
              className="desktop-lyrics-heading-group"
              data-lyrics-active={isLyricsHovered ? "true" : undefined}
              data-lyrics-dragging={isDragging ? "true" : undefined}
              onPointerDown={startDragging}
              onPointerMove={updateDragging}
              onPointerUp={(event) => finishDragging(event.pointerId)}
              onPointerCancel={() => finishDragging()}
              onLostPointerCapture={() => finishDragging()}
              onPointerLeave={() => setIsLyricsHovered(false)}
            >
              <div
                ref={toolbarRef}
                className="desktop-lyrics-toolbar"
                role="toolbar"
                aria-label={t("desktopLyrics.controls")}
              >
                <button
                  type="button"
                  className="desktop-lyrics-mode"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={toggleInteractionMode}
                  aria-pressed={interactionMode === "locked"}
                  aria-label={t(
                    interactionMode === "interactive"
                      ? "desktopLyrics.lock"
                      : "desktopLyrics.unlock",
                  )}
                  tabIndex={actionTabIndex}
                  title={t(
                    interactionMode === "interactive"
                      ? "desktopLyrics.lock"
                      : "desktopLyrics.unlock",
                  )}
                >
                  {interactionMode === "interactive" ? (
                    <Lock size={14} strokeWidth={1.8} />
                  ) : (
                    <LockOpen size={14} strokeWidth={1.8} />
                  )}
                </button>
                <button
                  type="button"
                  className="desktop-lyrics-close"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={close}
                  aria-label={t("desktopLyrics.close")}
                  tabIndex={actionTabIndex}
                  title={t("desktopLyrics.close")}
                >
                  <X size={15} strokeWidth={1.8} />
                </button>
              </div>
              <div
                ref={lyricShellRef}
                className="desktop-lyrics-heading-shell"
                onWheel={handleLyricWheel}
                style={{
                  padding: `${DEFAULT_LYRIC_PADDING.top * lyricPaddingScale}px ${DEFAULT_LYRIC_PADDING.horizontal * lyricPaddingScale}px ${DEFAULT_LYRIC_PADDING.bottom * lyricPaddingScale}px`,
                }}
              >
                <LyricTransition
                  transitionKey={`${displayedLyricIndex}:${activeLine.time}`}
                  className="w-max"
                  animateSize
                >
                  <KaraokeText
                    line={activeLine}
                    currentTime={currentTime}
                    className="desktop-lyrics-heading"
                    style={{ fontSize: `${LYRIC_FONT_SIZE * fontScale}px` }}
                    onPointerEnter={() => setIsLyricsHovered(true)}
                  />
                </LyricTransition>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
