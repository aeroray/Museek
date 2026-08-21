/**
 * Paint the Museek tray mark to match the in-app BrandMark:
 * rounded square = --primary, EQ bars = --primary-foreground.
 * Covers every accent palette (graphite / violet / …) and light↔dark swaps.
 */
import { invoke } from "@tauri-apps/api/core";

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const isMacOS =
  typeof navigator !== "undefined" && navigator.platform.startsWith("Mac");

/** Last CSS color keys we sent — skip identical redraws. */
let lastKey: string | null = null;

function readCssHsl(varName: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
}

/** Parse `H S% L%` (as stored in our CSS variables) into an hsl() color. */
function cssHslToColor(raw: string): string {
  if (!raw) return "#000000";
  if (raw.startsWith("#") || raw.startsWith("rgb") || raw.startsWith("hsl"))
    return raw;
  return `hsl(${raw})`;
}

function paintRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
  ctx.fill();
}

/** Geometry mirrors `app-icon.svg` (1024 canvas, rx=256, EQ after scale/translate). */
function renderTrayMarkPng(bgRaw: string, fgRaw: string): Promise<Uint8Array> {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("canvas unavailable"));

  const s = size / 1024;
  const scale = 1.185185185;
  const bg = cssHslToColor(bgRaw);
  const fg = cssHslToColor(fgRaw);

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = bg;
  paintRoundedRect(ctx, 0, 0, size, size, 256 * s);

  ctx.fillStyle = fg;
  const bars: Array<[number, number, number, number]> = [
    [220, 467, 64, 90],
    [324, 347, 64, 330],
    [428, 242, 64, 540],
    [532, 407, 64, 210],
    [636, 317, 64, 390],
    [740, 467, 64, 90],
  ];
  for (const [x, y, w, h] of bars) {
    const x2 = (x - 80) * scale;
    const y2 = (y - 80) * scale;
    const w2 = w * scale;
    const h2 = h * scale;
    paintRoundedRect(ctx, x2 * s, y2 * s, w2 * s, h2 * s, (w2 * s) / 2);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("tray mark encode failed"));
        return;
      }
      void blob
        .arrayBuffer()
        .then((buf) => resolve(new Uint8Array(buf)), reject);
    }, "image/png");
  });
}

/** Push the current theme mark to the native tray on non-macOS platforms. */
export function syncTrayMark(): void {
  // macOS status items use the native light/dark logo selected by Rust from
  // the system appearance instead of the app's accent-colored mark.
  if (!isTauri || isMacOS) return;
  const primary = readCssHsl("--primary");
  const foreground = readCssHsl("--primary-foreground");
  const key = `${primary}|${foreground}`;
  if (key === lastKey || !primary) return;
  lastKey = key;

  void renderTrayMarkPng(primary, foreground)
    .then((png) => invoke("set_tray_mark_icon", { png: Array.from(png) }))
    .catch(() => {
      // Allow a later theme change to retry.
      lastKey = null;
    });
}

/** Force a redraw even if colors look unchanged (e.g. after recreating the tray). */
export function syncTrayMarkForce(): void {
  lastKey = null;
  syncTrayMark();
}
