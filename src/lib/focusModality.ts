/**
 * Whether the user's most recent interaction came from a pointer or the
 * keyboard, so focus can be restored with the matching modality.
 *
 * Radix restores focus to a menu's trigger when the menu closes. That is
 * correct for keyboard users — focus must not be lost to `<body>` — but the
 * browser then matches `:focus-visible` and paints the trigger's focus ring, so
 * a purely mouse-driven interaction ends with a keyboard affordance on screen.
 * Re-focusing with `focusVisible: false` keeps the focus (Tab order intact)
 * without the ring.
 *
 * The listeners are installed at import time on purpose: they must already be
 * recording before the first click, which is the very interaction they classify.
 */

let lastWasPointer = false;

function onPointerDown(): void {
  lastWasPointer = true;
}

function onKeyDown(): void {
  lastWasPointer = false;
}

if (typeof document !== "undefined") {
  // Capture phase, so the modality is recorded even when a handler for the
  // interaction stops propagation.
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("keydown", onKeyDown, true);
}

/** True when the last interaction was a pointer (mouse, pen or touch). */
export function isPointerModality(): boolean {
  return lastWasPointer;
}

/**
 * Move focus without painting the focus ring.
 *
 * `focus()` is a no-op on an already-focused element and the browser keeps the
 * existing `:focus-visible` state, so focus is cleared first — measured in
 * Chromium, which is the engine behind both WebView2 and WKWebView. The
 * `focusVisible` option is honoured by Chromium but is not yet in TypeScript's
 * `FocusOptions`, hence the cast.
 */
export function focusWithoutRing(el: HTMLElement): void {
  if (document.activeElement === el) el.blur();
  el.focus({ focusVisible: false } as FocusOptions);
}
