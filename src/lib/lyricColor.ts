const HEX = /^#([0-9a-fA-F]{6})$/;

export function parseLyricColor(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value || value === "theme") return null;
  const match = HEX.exec(value);
  return match ? `#${match[1].toLowerCase()}` : null;
}

function rgbToHex(r: number, g: number, b: number): string {
  const hex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** Resolve a CSS color (including `hsl(var(--primary))`) to `#rrggbb`. */
export function sampleCssColor(cssColor: string, fallback = "#c4b5a5"): string {
  if (typeof document === "undefined") return fallback;
  const probe = document.createElement("span");
  probe.style.color = cssColor;
  document.body.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  document.body.removeChild(probe);
  const match = computed.match(
    /rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)/i,
  );
  if (!match) return fallback;
  return rgbToHex(Number(match[1]), Number(match[2]), Number(match[3]));
}

export function sampleThemeLyricColor(): string {
  return sampleCssColor("hsl(var(--primary))");
}
