#!/usr/bin/env node
/**
 * Generate the macOS menu-bar tray mark as a single TEMPLATE image.
 *
 * A macOS template image is inked by the system from its ALPHA channel alone:
 * the opaque area is drawn white on a dark menu bar and black on a light one,
 * and the transparent area is knocked out so the wallpaper shows through.
 * One file therefore covers both appearances — there is no light/dark pair to
 * swap, and no appearance polling.
 *
 * Shape: the brand rounded square is OPAQUE, the EQ bars are TRANSPARENT.
 *
 * Geometry comes from root `app-icon.svg`; keep the two in sync.
 *
 *   node src-tauri/icons/gen-tray-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// This file sits next to the assets it writes.
const OUT = dirname(fileURLToPath(import.meta.url));

// --- Geometry, straight from app-icon.svg (1024x1024 canvas) --------------
const CANVAS = 1024;
const SQUARE_RADIUS = 256; // rx on the 1024 canvas (Tailwind rounded-xl ratio)
const BAR_SCALE = 1.185185185;
const BAR_OFFSET = 80;
const BARS = [
  [220, 467, 64, 90],
  [324, 347, 64, 330],
  [428, 242, 64, 540],
  [532, 407, 64, 210],
  [636, 317, 64, 390],
  [740, 467, 64, 90],
];

/** Canvas-space rounded rects, matching the SVG's scale/translate on the bars. */
const BAR_RECTS = BARS.map(([x, y, w, h]) => {
  const x2 = (x - BAR_OFFSET) * BAR_SCALE;
  const y2 = (y - BAR_OFFSET) * BAR_SCALE;
  const w2 = w * BAR_SCALE;
  const h2 = h * BAR_SCALE;
  return [x2, y2, w2, h2, w2 / 2]; // rx = half the bar width -> capsule ends
});

/** Is (px, py) inside the rounded rect at (x, y, w, h) with radius r? */
function inRoundRect(px, py, x, y, w, h, r) {
  if (px < x || px > x + w || py < y || py > y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

/** Opaque square minus the knocked-out bars. */
function isOpaque(px, py) {
  if (!inRoundRect(px, py, 0, 0, CANVAS, CANVAS, SQUARE_RADIUS)) return false;
  for (const [x, y, w, h, r] of BAR_RECTS) {
    if (inRoundRect(px, py, x, y, w, h, r)) return false;
  }
  return true;
}

// --- Rasterizer: render oversized, then box-downsample for clean edges -----
const RENDER_SCALE = 4; // render at 4x, average down -> 16x effective AA
const SUPERSAMPLE = 4; // samples per axis at render resolution

function renderAlpha(size) {
  const n = size * RENDER_SCALE;
  const coverage = new Float32Array(n * n);
  const step = CANVAS / n;
  const samples = SUPERSAMPLE * SUPERSAMPLE;

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      let hit = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        const py = (j + (sy + 0.5) / SUPERSAMPLE) * step;
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const px = (i + (sx + 0.5) / SUPERSAMPLE) * step;
          if (isOpaque(px, py)) hit++;
        }
      }
      coverage[j * n + i] = hit / samples;
    }
  }

  const alpha = Buffer.alloc(size * size);
  const block = RENDER_SCALE * RENDER_SCALE;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0;
      for (let dy = 0; dy < RENDER_SCALE; dy++) {
        const row = (y * RENDER_SCALE + dy) * n + x * RENDER_SCALE;
        for (let dx = 0; dx < RENDER_SCALE; dx++) sum += coverage[row + dx];
      }
      alpha[y * size + x] = Math.round((sum / block) * 255);
    }
  }
  return alpha;
}

// --- Minimal PNG writer (RGBA8, non-interlaced) ---------------------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, alpha) {
  const stride = size * 4;
  const raw = Buffer.alloc(size * (stride + 1));
  for (let y = 0; y < size; y++) {
    const at = y * (stride + 1);
    raw[at] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      // RGB is ignored by a template image; black keeps the file conventional.
      const px = at + 1 + x * 4;
      raw[px] = 0;
      raw[px + 1] = 0;
      raw[px + 2] = 0;
      raw[px + 3] = alpha[y * size + x];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- Emit -----------------------------------------------------------------
mkdirSync(OUT, { recursive: true });
for (const [size, suffix] of [
  [32, ""],
  [64, "@2x"],
]) {
  const path = join(OUT, `tray-template${suffix}.png`);
  writeFileSync(path, encodePng(size, renderAlpha(size)));
  console.log(`wrote ${path} (${size}x${size})`);
}
