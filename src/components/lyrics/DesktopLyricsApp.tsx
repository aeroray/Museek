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
  currentMonitor,
  cursorPosition,
  getCurrentWindow,
  type Monitor,
} from "@tauri-apps/api/window";
import {
  LogicalSize,
  PhysicalPosition,
  PhysicalSize,
} from "@tauri-apps/api/dpi";
import { Lock, LockOpen, X } from "lucide-react";
import { applyLanguageSnapshot, useT } from "@/lib/i18n";
import { isMacOs } from "@/lib/os";
import { findActiveLyricIndex } from "@/lib/lyrics";
import { applyThemeSnapshot } from "@/stores/themeStore";
import type { LyricLine } from "@/types/music";
import {
  loadDesktopLyricsGeometry,
  saveDesktopLyricsGeometry,
  type DesktopLyricsGeometry,
} from "@/lib/desktopLyricsStorage";
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

const DEFAULT_HEIGHT = 160;
const DEFAULT_BOTTOM_GAP = 24;
const FONT_MIN = 0.85;
const FONT_MAX = 2.5;
const FONT_STEP = 0.15;
const LYRIC_FONT_KEY = "museek.lyricFontScale";
const DEFAULT_FONT_SCALE = 1.15;
const LYRIC_FONT_SIZE = 28;
const TOOLBAR_HEIGHT = 36;
const DEFAULT_LYRIC_PADDING = {
  top: 10,
  horizontal: 14,
  bottom: 8,
} as const;
const MIN_HEIGHT = Math.round(DEFAULT_HEIGHT * FONT_MIN) + TOOLBAR_HEIGHT;
const MAX_HEIGHT = Math.round(DEFAULT_HEIGHT * FONT_MAX) + TOOLBAR_HEIGHT;
const DEFAULT_WINDOW_HEIGHT =
  Math.round(DEFAULT_HEIGHT * DEFAULT_FONT_SCALE) + TOOLBAR_HEIGHT;

interface KaraokeHeadingProps {
  line: LyricLine;
  currentTime: number;
  fontSize: number;
  onPointerEnter: () => void;
}

function KaraokeHeading({
  line,
  currentTime,
  fontSize,
  onPointerEnter,
}: KaraokeHeadingProps) {
  const clipReveal = (right: string) => `inset(0 ${right} -0.18em 0)`;
  const words = line.words?.filter((word) => word.text.length > 0) ?? [];
  const hasWordTiming =
    (line.karaoke === "native" || line.karaoke === "estimated") &&
    words.length > 0;
  return (
    <p
      className="desktop-lyrics-heading"
      onPointerEnter={onPointerEnter}
      style={{ fontSize: `${fontSize}px` }}
    >
      {hasWordTiming ? (
        <span className="desktop-lyrics-heading-words">
          {words.map((word, index) => {
            const wordProgress = clamp(
              (currentTime - word.time) / word.duration,
              0,
              1,
            );
            const wordReveal = `${(1 - wordProgress) * 100}%`;
            return (
              <span
                className="desktop-lyrics-heading-word"
                key={`${word.time}:${index}`}
              >
                <span className="desktop-lyrics-heading-word-text">
                  {word.text}
                </span>
                <span
                  className="desktop-lyrics-heading-word-sung"
                  aria-hidden="true"
                  style={{ clipPath: clipReveal(wordReveal) }}
                >
                  {word.text}
                </span>
              </span>
            );
          })}
        </span>
      ) : (
        <span className="desktop-lyrics-heading-text">{line.text}</span>
      )}
    </p>
  );
}

function isInteractionMode(
  value: unknown,
): value is DesktopLyricsInteractionMode {
  return value === "interactive" || value === "locked";
}

function pointInMonitor(x: number, y: number, monitor: Monitor): boolean {
  const { position, size } = monitor;
  return (
    x >= position.x &&
    x < position.x + size.width &&
    y >= position.y &&
    y < position.y + size.height
  );
}

function monitorForRect(
  rect: DesktopLyricsGeometry,
  monitors: Monitor[],
): Monitor | undefined {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  let overlappingMonitor: Monitor | undefined;
  let largestOverlap = 0;
  for (const monitor of monitors) {
    const overlapWidth = Math.max(
      0,
      Math.min(right, monitor.position.x + monitor.size.width) -
        Math.max(rect.x, monitor.position.x),
    );
    const overlapHeight = Math.max(
      0,
      Math.min(bottom, monitor.position.y + monitor.size.height) -
        Math.max(rect.y, monitor.position.y),
    );
    const overlap = overlapWidth * overlapHeight;
    if (overlap > largestOverlap) {
      largestOverlap = overlap;
      overlappingMonitor = monitor;
    }
  }
  if (overlappingMonitor) return overlappingMonitor;

  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const containingMonitor = monitors.find((monitor) =>
    pointInMonitor(centerX, centerY, monitor),
  );
  if (containingMonitor) return containingMonitor;

  const distanceToRange = (value: number, start: number, size: number) => {
    const end = start + size;
    return value < start ? start - value : value > end ? value - end : 0;
  };
  return monitors.reduce<Monitor | undefined>((closest, monitor) => {
    if (!closest) return monitor;
    const distance =
      distanceToRange(centerX, monitor.position.x, monitor.size.width) ** 2 +
      distanceToRange(centerY, monitor.position.y, monitor.size.height) ** 2;
    const closestDistance =
      distanceToRange(centerX, closest.position.x, closest.size.width) ** 2 +
      distanceToRange(centerY, closest.position.y, closest.size.height) ** 2;
    return distance < closestDistance ? monitor : closest;
  }, undefined);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function clampWindowYToVisualBounds(
  y: number,
  monitor: Monitor | undefined,
  visualTopOffset: number,
  visualBottomOffset: number,
): number {
  if (!monitor) return Math.round(y);
  return Math.round(
    clamp(
      y,
      monitor.position.y - visualTopOffset,
      monitor.position.y + monitor.size.height - visualBottomOffset,
    ),
  );
}

function clampWindowXToVisualBounds(
  x: number,
  monitor: Monitor | undefined,
  visualLeftOffset: number,
  visualRightOffset: number,
): number {
  if (!monitor) return Math.round(x);
  return Math.round(
    clamp(
      x,
      monitor.position.x - visualLeftOffset,
      monitor.position.x + monitor.size.width - visualRightOffset,
    ),
  );
}

function pointInElement(
  point: { x: number; y: number },
  element: HTMLElement,
  windowPosition: { x: number; y: number },
  scale: number,
): boolean {
  const rect = element.getBoundingClientRect();
  const left = windowPosition.x + rect.left * scale;
  const top = windowPosition.y + rect.top * scale;
  const right = left + rect.width * scale;
  const bottom = top + rect.height * scale;
  return (
    point.x >= left && point.x <= right && point.y >= top && point.y <= bottom
  );
}

interface DesktopLyricsDragState {
  pointerId: number;
  startCursorX: number;
  startCursorY: number;
  startPosition: { x: number; y: number } | null;
  width: number;
  height: number;
  monitors: Monitor[];
  monitor: Monitor | null;
  visualLeftOffset: number;
  visualRightOffset: number;
  visualTopOffset: number;
  visualBottomOffset: number;
  latestCursorX: number;
  latestCursorY: number;
  ready: boolean;
  finished: boolean;
  frameId: number | null;
  positionPromise: Promise<void>;
}

async function restoreGeometry(): Promise<void> {
  const window = getCurrentWindow();
  const saved = await loadDesktopLyricsGeometry();
  const monitors = await availableMonitors().catch(() => [] as Monitor[]);
  const activeMonitor = await currentMonitor().catch(() => null);
  const monitor = saved
    ? (monitorForRect(saved, monitors) ?? activeMonitor ?? monitors[0])
    : (activeMonitor ?? monitors[0]);
  if (!monitor) return;

  const scale = monitor.scaleFactor || (await window.scaleFactor()) || 1;
  const bottomInset = Math.round(DEFAULT_BOTTOM_GAP * scale);
  const maxPhysicalHeight = Math.max(1, monitor.size.height);
  const savedHeight = saved
    ? saved.heightIncludesToolbar
      ? saved.height
      : saved.height + TOOLBAR_HEIGHT
    : undefined;
  const logicalHeight = clamp(
    savedHeight ?? DEFAULT_WINDOW_HEIGHT,
    MIN_HEIGHT,
    MAX_HEIGHT,
  );
  const width = monitor.size.width;
  const height = Math.min(
    new LogicalSize(1, logicalHeight).toPhysical(scale).height,
    maxPhysicalHeight,
  );
  const initialX = saved?.x ?? monitor.position.x;
  const defaultY =
    monitor.position.y + monitor.size.height - height - bottomInset;

  await window.setSize(new PhysicalSize(width, height)).catch(() => {});
  await window
    .setPosition(
      new PhysicalPosition(initialX, Math.round(saved?.y ?? defaultY)),
    )
    .catch(() => {});
  await persistGeometry();
}

async function persistGeometry(): Promise<void> {
  const window = getCurrentWindow();
  const [position, size, scale] = await Promise.all([
    window.outerPosition(),
    window.innerSize(),
    window.scaleFactor(),
  ]);
  const logical = size.toLogical(scale || 1);
  const geometry: DesktopLyricsGeometry = {
    x: Math.round(position.x),
    y: Math.round(position.y),
    width: Math.round(logical.width),
    height: Math.round(logical.height),
    heightIncludesToolbar: true,
  };
  await saveDesktopLyricsGeometry(geometry).catch(() => {});
}

async function clampAndPersistGeometry(
  visualElement?: HTMLElement | null,
): Promise<void> {
  const window = getCurrentWindow();
  const [position, size, monitors, scaleFactor] = await Promise.all([
    window.outerPosition(),
    window.outerSize(),
    availableMonitors().catch(() => [] as Monitor[]),
    window.scaleFactor(),
  ]);
  const rect: DesktopLyricsGeometry = {
    x: position.x,
    y: position.y,
    width: size.width,
    height: size.height,
  };
  const monitor = monitorForRect(rect, monitors);
  const visualRect = visualElement?.getBoundingClientRect();
  const scale = scaleFactor || 1;
  const visualLeftOffset = visualRect ? visualRect.left * scale : 0;
  const visualRightOffset = visualRect ? visualRect.right * scale : size.width;
  const visualTopOffset = visualRect ? visualRect.top * scale : 0;
  const visualBottomOffset = visualRect
    ? visualRect.bottom * scale
    : size.height;
  const x = clampWindowXToVisualBounds(
    position.x,
    monitor,
    visualLeftOffset,
    visualRightOffset,
  );
  const y = clampWindowYToVisualBounds(
    position.y,
    monitor,
    visualTopOffset,
    visualBottomOffset,
  );
  if (x !== position.x || y !== position.y) {
    await window.setPosition(new PhysicalPosition(x, y)).catch(() => {});
  }
  await persistGeometry();
}

async function resizeWindowForFontScale(
  previousScale: number,
  nextScale: number,
  visualElement?: HTMLElement | null,
): Promise<void> {
  if (previousScale <= 0 || nextScale <= 0 || previousScale === nextScale) {
    return;
  }

  try {
    const window = getCurrentWindow();
    const [position, size, scaleFactor] = await Promise.all([
      window.outerPosition(),
      window.outerSize(),
      window.scaleFactor(),
    ]);
    const scale = scaleFactor || 1;
    const currentSize = size.toLogical(scale);
    const ratio = nextScale / previousScale;
    const currentContentHeight = Math.max(
      0,
      currentSize.height - TOOLBAR_HEIGHT,
    );
    const height = clamp(
      Math.round(currentContentHeight * ratio) + TOOLBAR_HEIGHT,
      MIN_HEIGHT,
      MAX_HEIGHT,
    );
    const nextPhysicalSize = new LogicalSize(
      currentSize.width,
      height,
    ).toPhysical(scale);

    await window.setSize(new LogicalSize(currentSize.width, height));
    await window.setPosition(
      new PhysicalPosition(
        position.x,
        position.y + Math.round((size.height - nextPhysicalSize.height) / 2),
      ),
    );
    await new Promise<void>((resolve) => {
      globalThis.requestAnimationFrame(() => resolve());
    });
    await clampAndPersistGeometry(visualElement);
  } catch {
    /* Best-effort while the native window is being resized or hidden. */
  }
}

async function applyInteractionMode(
  mode: DesktopLyricsInteractionMode,
): Promise<void> {
  const window = getCurrentWindow();
  try {
    if (mode === "interactive") {
      await window.setFocusable(true);
      await window.setIgnoreCursorEvents(false);
    } else {
      await window.setIgnoreCursorEvents(true);
      await window.setFocusable(false);
    }
  } catch {
    /* best-effort while the native window is being created or hidden */
  }
}

export function DesktopLyricsApp() {
  const t = useT();
  const [snapshot, setSnapshot] =
    useState<DesktopLyricsSnapshot>(EMPTY_SNAPSHOT);
  const [currentTime, setCurrentTime] = useState(EMPTY_SNAPSHOT.currentTime);
  const [interactionMode, setInteractionMode] =
    useState<DesktopLyricsInteractionMode>("interactive");
  const [capsuleVisible, setCapsuleVisible] = useState(true);
  const [fontScale, setFontScale] = useState(() => {
    const value = parseFloat(localStorage.getItem(LYRIC_FONT_KEY) ?? "");
    return Number.isFinite(value)
      ? Math.min(FONT_MAX, Math.max(FONT_MIN, value))
      : DEFAULT_FONT_SCALE;
  });
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

  const getDragTarget = (drag: DesktopLyricsDragState) => {
    if (!drag.ready || !drag.startPosition) return null;
    const x = Math.round(
      drag.startPosition.x + drag.latestCursorX - drag.startCursorX,
    );
    const y = Math.round(
      drag.startPosition.y + drag.latestCursorY - drag.startCursorY,
    );
    const monitor =
      drag.monitor ??
      monitorForRect(
        {
          x,
          y,
          width: drag.width,
          height: drag.height,
        },
        drag.monitors,
      );
    return {
      x: clampWindowXToVisualBounds(
        x,
        monitor,
        drag.visualLeftOffset,
        drag.visualRightOffset,
      ),
      y: clampWindowYToVisualBounds(
        y,
        monitor,
        drag.visualTopOffset,
        drag.visualBottomOffset,
      ),
    };
  };

  const queueDragPosition = (
    drag: DesktopLyricsDragState,
    force = false,
  ): Promise<void> => {
    drag.positionPromise = drag.positionPromise
      .catch(() => {})
      .then(async () => {
        if (!force && (drag.finished || dragRef.current !== drag)) return;
        const target = getDragTarget(drag);
        if (!target) return;
        await getCurrentWindow()
          .setPosition(new PhysicalPosition(target.x, target.y))
          .catch(() => {});
      });
    return drag.positionPromise;
  };

  const scheduleDragPosition = (drag: DesktopLyricsDragState) => {
    if (
      !drag.ready ||
      drag.finished ||
      drag.frameId !== null ||
      dragRef.current !== drag
    ) {
      return;
    }
    drag.frameId = window.requestAnimationFrame(() => {
      drag.frameId = null;
      if (drag.finished || dragRef.current !== drag) return;
      void queueDragPosition(drag);
    });
  };

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
      await queueDragPosition(drag, true);
      await clampAndPersistGeometry(headingGroupRef.current);
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
                setInteractionMode(event.payload);
                void applyInteractionMode(event.payload);
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
              scheduleDragPosition(drag);
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
      await restoreGeometry().catch(() => {});
      if (disposed) return;

      const schedulePersist = () => {
        if (saveTimer !== undefined) window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(() => {
          saveTimer = undefined;
          if (isDraggingRef.current) return;
          void persistGeometry();
        }, 220);
      };
      const restoreLogicalSizeAfterScaleChange = () => {
        if (disposed) return;
        void restoreGeometry()
          .then(async () => {
            if (disposed) return;
            await new Promise<void>((resolve) => {
              window.requestAnimationFrame(() => resolve());
            });
            await clampAndPersistGeometry(headingGroupRef.current);
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
      void persistGeometry().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!hasLyricContent) return;
    let disposed = false;
    const frameId = window.requestAnimationFrame(() => {
      if (disposed) return;
      void clampAndPersistGeometry(headingGroupRef.current);
    });
    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
    };
  }, [hasLyricContent]);

  const setScale = (value: number) => {
    const previousScale = fontScaleRef.current;
    const nextScale = clamp(value, FONT_MIN, FONT_MAX);
    if (nextScale === previousScale) return;

    fontScaleRef.current = nextScale;
    setFontScale(nextScale);
    localStorage.setItem(LYRIC_FONT_KEY, String(nextScale));
    const resizePromise = resizePromiseRef.current.then(() =>
      resizeWindowForFontScale(
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
    setInteractionMode(next);
    void applyInteractionMode(next);
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
        scheduleDragPosition(drag);
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
        scheduleDragPosition(drag);
      })
      .catch(() => finishDragging(event.pointerId));
  };

  const actionTabIndex = interactionMode === "interactive" ? 0 : -1;

  const activeLyricIndex = findActiveLyricIndex(snapshot.lines, currentTime);
  const activeLine =
    snapshot.lines[activeLyricIndex >= 0 ? activeLyricIndex : 0] ?? null;
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
                <KaraokeHeading
                  key={`${activeLyricIndex}:${activeLine.time}`}
                  line={activeLine}
                  currentTime={currentTime}
                  fontSize={LYRIC_FONT_SIZE * fontScale}
                  onPointerEnter={() => setIsLyricsHovered(true)}
                />
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
