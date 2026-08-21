import { isMacOs } from "@/lib/os";

/**
 * Canonical shortcut strings use Tauri accelerators with CommandOrControl so
 * Windows Ctrl and macOS ⌘ stay the same value across sync.
 * Allowed modifiers: Ctrl/⌘, Alt/⌥, Shift. Win/Super is rejected.
 * F1–F12 may be used with or without those modifiers.
 */

export const SHORTCUT_ACTIONS = [
  "playPause",
  "prev",
  "next",
  "seekBack",
  "seekForward",
  "volumeUp",
  "volumeDown",
  "mute",
  "lyrics",
  "desktopLyrics",
  "desktopLyricsLock",
  "mini",
] as const;

export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number];
export type ShortcutMap = Record<ShortcutAction, string>;

export const DEFAULT_SHORTCUTS: ShortcutMap = {
  playPause: "CommandOrControl+Shift+Enter",
  prev: "CommandOrControl+Shift+Left",
  next: "CommandOrControl+Shift+Right",
  seekBack: "CommandOrControl+Shift+,",
  seekForward: "CommandOrControl+Shift+.",
  volumeUp: "CommandOrControl+Shift+Up",
  volumeDown: "CommandOrControl+Shift+Down",
  mute: "CommandOrControl+Shift+M",
  lyrics: "CommandOrControl+Shift+Y",
  desktopLyrics: "CommandOrControl+Shift+D",
  desktopLyricsLock: "CommandOrControl+Shift+L",
  mini: "CommandOrControl+Shift+U",
};

/** First global-hotkey defaults; migrate unchanged copies to the current set. */
const LEGACY_DEFAULTS: ShortcutMap = {
  playPause: "CommandOrControl+Alt+P",
  seekBack: "CommandOrControl+Shift+Left",
  seekForward: "CommandOrControl+Shift+Right",
  prev: "CommandOrControl+Left",
  next: "CommandOrControl+Right",
  volumeUp: "CommandOrControl+Shift+Up",
  volumeDown: "CommandOrControl+Shift+Down",
  mute: "CommandOrControl+Alt+M",
  lyrics: "CommandOrControl+Alt+L",
  desktopLyrics: "CommandOrControl+L",
  desktopLyricsLock: "CommandOrControl+Shift+L",
  mini: "CommandOrControl+Shift+P",
};

const PRIMARY = new Set([
  "control",
  "ctrl",
  "command",
  "cmd",
  "meta",
  "commandorcontrol",
  "cmdorctrl",
  "cmdorcontrol",
]);

const RESERVED = new Set([
  "Alt+F4",
  "Alt+Tab",
  "CommandOrControl+W",
  "CommandOrControl+Q",
  "CommandOrControl+Tab",
  "CommandOrControl+Space",
  "CommandOrControl+Escape",
  "CommandOrControl+Shift+Escape",
  "CommandOrControl+Alt+Delete",
  "CommandOrControl+C",
  "CommandOrControl+V",
  "CommandOrControl+X",
  "CommandOrControl+A",
  "CommandOrControl+Z",
  "CommandOrControl+M",
  "CommandOrControl+H",
]);

const KEY_ALIASES: Record<string, string> = {
  arrowleft: "Left",
  arrowright: "Right",
  arrowup: "Up",
  arrowdown: "Down",
  left: "Left",
  right: "Right",
  up: "Up",
  down: "Down",
  space: "Space",
  spacebar: "Space",
  esc: "Escape",
  escape: "Escape",
  plus: "=",
  minus: "-",
  equal: "=",
};

export interface ParsedShortcut {
  primary: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
}

function isFunctionKey(key: string): boolean {
  return /^F([1-9]|1[0-2])$/.test(key);
}

export function canonicalizeShortcut(raw: string): string | null {
  const tokens = raw
    .split("+")
    .map((t) => t.trim())
    .filter(Boolean);
  if (!tokens.length) return null;
  let primary = false;
  let alt = false;
  let shift = false;
  let key: string | null = null;
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (PRIMARY.has(lower)) primary = true;
    else if (lower === "alt" || lower === "option" || lower === "opt") alt = true;
    else if (lower === "shift") shift = true;
    else if (lower === "super" || lower === "win" || lower === "windows")
      return null;
    else key = normalizeKeyToken(token);
  }
  if (!key) return null;
  const parts: string[] = [];
  if (primary) parts.push("CommandOrControl");
  if (alt) parts.push("Alt");
  if (shift) parts.push("Shift");
  parts.push(key);
  return parts.join("+");
}

function normalizeKeyToken(token: string): string | null {
  const aliased = KEY_ALIASES[token.toLowerCase()];
  if (aliased) return aliased;
  if (/^f([1-9]|1[0-2])$/i.test(token)) return token.toUpperCase();
  if (/^[a-z]$/i.test(token)) return token.toUpperCase();
  if (/^[0-9]$/.test(token)) return token;
  if (["Left", "Right", "Up", "Down", "Space", "Tab", "Enter", "Backspace", "Delete", "Home", "End", "PageUp", "PageDown"].includes(token))
    return token;
  if (token.length === 1) return token.toUpperCase();
  return null;
}

export function parseShortcut(accel: string): ParsedShortcut | null {
  const canonical = canonicalizeShortcut(accel);
  if (!canonical) return null;
  const parts = canonical.split("+");
  const key = parts[parts.length - 1];
  if (!key) return null;
  const mods = new Set(parts.slice(0, -1));
  return {
    primary: mods.has("CommandOrControl"),
    alt: mods.has("Alt"),
    shift: mods.has("Shift"),
    key,
  };
}

/**
 * Global hotkeys: Ctrl/⌘, Alt/⌥, and/or Shift, or a bare F1–F12.
 * Shift alone is not enough. Win/Super is never accepted.
 */
export function isValidGlobalShortcut(accel: string): boolean {
  const parsed = parseShortcut(accel);
  if (!parsed) return false;
  if (!parsed.primary && !parsed.alt && !isFunctionKey(parsed.key)) return false;
  const canonical = canonicalizeShortcut(accel);
  if (!canonical || RESERVED.has(canonical)) return false;
  return true;
}

export function parseShortcutMap(raw: unknown): ShortcutMap {
  const user: Partial<ShortcutMap> = {};
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const action of SHORTCUT_ACTIONS) {
      if (typeof obj[action] !== "string") continue;
      const canonical = canonicalizeShortcut(obj[action]);
      if (canonical && isValidGlobalShortcut(canonical)) user[action] = canonical;
    }
  }
  const used = new Set<string>();
  const out = { ...DEFAULT_SHORTCUTS };
  for (const action of SHORTCUT_ACTIONS) {
    const binding = user[action];
    if (binding && !used.has(binding)) {
      out[action] = binding;
      used.add(binding);
    }
  }
  for (const action of SHORTCUT_ACTIONS) {
    if (user[action] && out[action] === user[action]) continue;
    const def = DEFAULT_SHORTCUTS[action];
    if (!used.has(def)) {
      out[action] = def;
      used.add(def);
    }
  }
  if (SHORTCUT_ACTIONS.every((action) => out[action] === LEGACY_DEFAULTS[action])) {
    return { ...DEFAULT_SHORTCUTS };
  }
  return out;
}

export function shortcutMapEquals(a: ShortcutMap, b: unknown): boolean {
  if (!b || typeof b !== "object") return false;
  const o = b as Record<string, unknown>;
  return SHORTCUT_ACTIONS.every((action) => o[action] === a[action]);
}

export function shortcutConflict(
  map: ShortcutMap,
  action: ShortcutAction,
  accel: string,
): ShortcutAction | null {
  for (const other of SHORTCUT_ACTIONS) {
    if (other === action) continue;
    if (map[other] === accel) return other;
  }
  return null;
}

export function keyTokenFromEvent(e: KeyboardEvent): string | null {
  if (e.code.startsWith("Key") && e.code.length === 4) return e.code.slice(3);
  if (e.code.startsWith("Digit") && e.code.length === 6) return e.code.slice(5);
  if (/^F([1-9]|1[0-2])$/.test(e.code)) return e.code;
  const fromCode: Record<string, string> = {
    Space: "Space",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    ArrowUp: "Up",
    ArrowDown: "Down",
    Minus: "-",
    Equal: "=",
    BracketLeft: "[",
    BracketRight: "]",
    Backslash: "\\",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Backquote: "`",
    Tab: "Tab",
    Enter: "Enter",
    Backspace: "Backspace",
    Delete: "Delete",
    Home: "Home",
    End: "End",
    PageUp: "PageUp",
    PageDown: "PageDown",
  };
  return fromCode[e.code] ?? null;
}

export function isModifierKey(e: KeyboardEvent): boolean {
  return (
    e.key === "Control" ||
    e.key === "Meta" ||
    e.key === "Alt" ||
    e.key === "Shift" ||
    e.key === "OS"
  );
}

/** True when Win (Windows) or Control (macOS) is held — outside the shared set. */
export function hasForbiddenModifier(e: KeyboardEvent): boolean {
  return isMacOs() ? e.ctrlKey : e.metaKey;
}

export function shortcutFromEvent(e: KeyboardEvent): string | null {
  const key = keyTokenFromEvent(e);
  if (!key) return null;
  if (hasForbiddenModifier(e)) return null;
  const mac = isMacOs();
  const parts: string[] = [];
  if (mac ? e.metaKey : e.ctrlKey) parts.push("CommandOrControl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  parts.push(key);
  return canonicalizeShortcut(parts.join("+"));
}

/** Live combo while keys are held, including incomplete modifier-only chords. */
export function formatHeldShortcut(e: KeyboardEvent): string {
  const mac = isMacOs();
  const parts: string[] = [];
  if (e.ctrlKey) parts.push(mac ? "Ctrl" : "Ctrl/⌘");
  if (e.metaKey) parts.push(mac ? "⌘" : "Win");
  if (e.altKey) parts.push("Alt/⌥");
  if (e.shiftKey) parts.push("Shift");
  if (!isModifierKey(e)) {
    const key = keyTokenFromEvent(e);
    if (key) parts.push(formatKey(key));
  }
  return parts.join(" + ");
}

export function eventMatchesShortcut(e: KeyboardEvent, accel: string): boolean {
  const parsed = parseShortcut(accel);
  if (!parsed) return false;
  const mac = isMacOs();
  if (mac ? e.ctrlKey : e.metaKey) return false;
  const primary = mac ? e.metaKey : e.ctrlKey;
  if (parsed.primary !== primary) return false;
  if (parsed.alt !== e.altKey) return false;
  if (parsed.shift !== e.shiftKey) return false;
  return keyTokenFromEvent(e) === parsed.key;
}

export function formatShortcut(accel: string, _mac = false): string {
  const parsed = parseShortcut(accel);
  if (!parsed) return accel;
  const parts: string[] = [];
  if (parsed.primary) parts.push("Ctrl/⌘");
  if (parsed.alt) parts.push("Alt/⌥");
  if (parsed.shift) parts.push("Shift");
  parts.push(formatKey(parsed.key));
  return parts.join(" + ");
}

function formatKey(key: string): string {
  const map: Record<string, string> = {
    Left: "←",
    Right: "→",
    Up: "↑",
    Down: "↓",
  };
  return map[key] ?? key;
}

/** True while the settings recorder is capturing a combo (skip dispatch). */
let captureLock = false;

export function setShortcutCaptureLock(locked: boolean) {
  captureLock = locked;
}

export function isShortcutCaptureLocked(): boolean {
  return captureLock;
}
