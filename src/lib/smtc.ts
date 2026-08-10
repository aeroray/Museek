// Bridge to the OS media controls (Windows SMTC etc.) exposed by the Rust side.
// No-ops in the browser preview (Tauri IPC unavailable).

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const isWindows =
  typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);

function getBrowserMediaSession(): MediaSession | null {
  if (!isWindows || isTauri || typeof navigator === "undefined") return null;
  if (!("mediaSession" in navigator)) return null;
  return navigator.mediaSession;
}

function updateBrowserMediaControls(
  title: string,
  artist: string,
  album: string,
  cover: string | null,
  playing: boolean,
) {
  const session = getBrowserMediaSession();
  if (!session) return;
  try {
    if (!title.trim()) {
      session.metadata = null;
      session.playbackState = "none";
      return;
    }
    session.metadata = new MediaMetadata({
      title,
      artist,
      album,
      artwork: cover ? [{ src: cover }] : [],
    });
    session.playbackState = playing ? "playing" : "paused";
  } catch {
    /* browser media controls are best-effort */
  }
}

export async function updateMediaControls(
  title: string,
  artist: string,
  album: string,
  cover: string | null,
  playing: boolean,
): Promise<void> {
  updateBrowserMediaControls(title, artist, album, cover, playing);
  if (!isTauri) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("media_update", { title, artist, album, cover, playing });
  } catch {
    /* media controls are best-effort */
  }
}

let attached = false;

// Wire OS media-control button events (play/pause/toggle/next/previous) to the
// player. Safe to call multiple times — only the first attaches.
export async function attachMediaControls(handlers: {
  play: () => void;
  pause: () => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
}): Promise<void> {
  const mediaSession = getBrowserMediaSession();
  if ((!isTauri && !mediaSession) || attached) return;
  attached = true;

  if (mediaSession) {
    const actions = [
      ["play", handlers.play],
      ["pause", handlers.pause],
      ["previoustrack", handlers.previous],
      ["nexttrack", handlers.next],
    ] as const;
    for (const [action, handler] of actions) {
      try {
        mediaSession.setActionHandler(action, () => handler());
      } catch {
        /* action is not supported by this WebView */
      }
    }
  }

  if (!isTauri) return;
  try {
    const { listen } = await import("@tauri-apps/api/event");
    await listen<string>("media-control", (e) => {
      const fn = handlers[e.payload as keyof typeof handlers];
      if (typeof fn === "function") fn();
    });
  } catch {
    attached = false;
  }
}
