/**
 * Whether the mini-player toggle is allowed to run.
 *
 * Extracted from `miniPlayer.ts` so it can be pinned by a plain-node check:
 * that module owns Tauri windows and the player store, so importing it needs a
 * DOM and a live IPC bridge.
 *
 * The distinction this encodes is the bug it fixes. `currentSong` is required to
 * *enter* the mini player — there is nothing to show without a track — but not
 * to leave it. The shortcut used to gate both on `currentSong`, and the track can
 * disappear while the mini bar is up: the queue can finish, be cleared, or lose
 * the playing row through the mini queue's own remove button, and a local-file
 * play error nulls it too. The mini shell has no window controls, so a dead
 * shortcut left the user with only the small restore button.
 */
export function canToggleMini(opts: {
  hasSong: boolean;
  /** The store's `miniMode` flag. */
  miniMode: boolean;
  /** The module's own session flag (can be true before the store updates). */
  sessionActive: boolean;
}): boolean {
  if (opts.sessionActive || opts.miniMode) return true;
  return opts.hasSong;
}

/** Which way the toggle would go right now. */
export function miniToggleDirection(opts: {
  hasSong: boolean;
  miniMode: boolean;
  sessionActive: boolean;
}): "enter" | "exit" | null {
  if (opts.sessionActive || opts.miniMode) return "exit";
  return opts.hasSong ? "enter" : null;
}
