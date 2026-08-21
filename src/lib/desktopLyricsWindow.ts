import {
  availableMonitors,
  currentMonitor,
  getCurrentWindow,
  type Monitor,
} from "@tauri-apps/api/window";
import {
  LogicalSize,
  PhysicalPosition,
  PhysicalSize,
} from "@tauri-apps/api/dpi";
import {
  loadDesktopLyricsGeometry,
  saveDesktopLyricsGeometry,
  type DesktopLyricsGeometry,
} from "@/lib/desktopLyricsStorage";
import type { DesktopLyricsInteractionMode } from "@/lib/desktopLyricsProtocol";

export const DEFAULT_HEIGHT = 160;
export const DEFAULT_BOTTOM_GAP = 24;
export const FONT_MIN = 0.85;
export const FONT_MAX = 2.5;
export const FONT_STEP = 0.15;
export const DEFAULT_FONT_SCALE = 1.15;
export const TOOLBAR_HEIGHT = 36;
export const MIN_HEIGHT =
  Math.round(DEFAULT_HEIGHT * FONT_MIN) + TOOLBAR_HEIGHT;
export const MAX_HEIGHT =
  Math.round(DEFAULT_HEIGHT * FONT_MAX) + TOOLBAR_HEIGHT;
export const DEFAULT_WINDOW_HEIGHT =
  Math.round(DEFAULT_HEIGHT * DEFAULT_FONT_SCALE) + TOOLBAR_HEIGHT;

export interface DesktopLyricsDragState {
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

export function isInteractionMode(
  value: unknown,
): value is DesktopLyricsInteractionMode {
  return value === "interactive" || value === "locked";
}

export function pointInMonitor(
  x: number,
  y: number,
  monitor: Monitor,
): boolean {
  const { position, size } = monitor;
  return (
    x >= position.x &&
    x < position.x + size.width &&
    y >= position.y &&
    y < position.y + size.height
  );
}

export function monitorForRect(
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

export function clamp(value: number, min: number, max: number): number {
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

export function pointInElement(
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

export async function restoreDesktopLyricsGeometry(): Promise<void> {
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
  await persistDesktopLyricsGeometry();
}

export async function persistDesktopLyricsGeometry(): Promise<void> {
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

export async function clampAndPersistDesktopLyricsGeometry(
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
  await persistDesktopLyricsGeometry();
}

export async function resizeDesktopLyricsWindowForFontScale(
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
    await clampAndPersistDesktopLyricsGeometry(visualElement);
  } catch {
    /* Best-effort while the native window is being resized or hidden. */
  }
}

export async function nudgeDesktopLyricsHeight(
  delta: number,
  visualElement?: HTMLElement | null,
): Promise<void> {
  if (!delta) return;
  try {
    const window = getCurrentWindow();
    const [position, size, scaleFactor] = await Promise.all([
      window.outerPosition(),
      window.outerSize(),
      window.scaleFactor(),
    ]);
    const scale = scaleFactor || 1;
    const currentSize = size.toLogical(scale);
    const height = clamp(
      Math.round(currentSize.height + delta),
      MIN_HEIGHT,
      MAX_HEIGHT,
    );
    if (height === currentSize.height) {
      await clampAndPersistDesktopLyricsGeometry(visualElement);
      return;
    }
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
    await clampAndPersistDesktopLyricsGeometry(visualElement);
  } catch {
    /* Best-effort while the native window is being resized or hidden. */
  }
}

export async function applyDesktopLyricsInteractionMode(
  mode: DesktopLyricsInteractionMode,
): Promise<void> {
  const window = getCurrentWindow();
  try {
    if (mode === "interactive") {
      await window.setFocusable(true);
      await window.setIgnoreCursorEvents(true);
    } else {
      await window.setIgnoreCursorEvents(true);
      await window.setFocusable(false);
    }
  } catch {
    /* best-effort while the native window is being created or hidden */
  }
}

export function getDesktopLyricsDragTarget(
  drag: DesktopLyricsDragState,
): { x: number; y: number } | null {
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
}

export function queueDesktopLyricsDragPosition(
  drag: DesktopLyricsDragState,
  isCurrent: () => boolean,
  force = false,
): Promise<void> {
  drag.positionPromise = drag.positionPromise
    .catch(() => {})
    .then(async () => {
      if (!force && (drag.finished || !isCurrent())) return;
      const target = getDesktopLyricsDragTarget(drag);
      if (!target) return;
      await getCurrentWindow()
        .setPosition(new PhysicalPosition(target.x, target.y))
        .catch(() => {});
    });
  return drag.positionPromise;
}

export function scheduleDesktopLyricsDragPosition(
  drag: DesktopLyricsDragState,
  isCurrent: () => boolean,
): void {
  if (!drag.ready || drag.finished || drag.frameId !== null || !isCurrent()) {
    return;
  }
  drag.frameId = window.requestAnimationFrame(() => {
    drag.frameId = null;
    if (drag.finished || !isCurrent()) return;
    void queueDesktopLyricsDragPosition(drag, isCurrent);
  });
}
