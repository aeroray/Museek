/**
 * Which focused elements should swallow the app's keyboard shortcuts.
 *
 * Kept dependency-free so it can be exercised in a real browser without
 * booting the stores (focus and `:focus-visible` are decided by the browser's
 * input pipeline, not by synthetic DOM events).
 */

/** Keys a focused slider legitimately consumes for its own seeking. */
export const SLIDER_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

/** Roles that own their keys outright (menus, dialogs, comboboxes…). */
const OPAQUE_ROLES =
  '[role="combobox"], [role="listbox"], [role="menu"], [role="menuitem"], [role="dialog"], [role="tablist"]';

/**
 * True when `el` (the keydown target) should stop the global shortcut handler
 * from acting on `key`.
 *
 * Text fields and composite widgets take every key. A `role="slider"` is
 * different: it only owns the keys that move it. Blocking *all* shortcuts there
 * meant that focusing the seek bar — which a mouse drag used to do — silently
 * disabled Space (play/pause) and every letter shortcut, so the user had to
 * click elsewhere before the keyboard worked again. Arrow keys still have to be
 * blocked, because the slider seeks on them *and* they are bound to
 * seekBack/seekForward, which would double-seek.
 */
export function isShortcutBlockedTarget(
  el: EventTarget | null,
  key: string,
): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable
  ) {
    return true;
  }
  if (el.closest('[role="slider"]')) return SLIDER_KEYS.has(key);
  return Boolean(el.closest(OPAQUE_ROLES));
}
