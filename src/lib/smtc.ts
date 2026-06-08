// Bridge to the OS media controls (Windows SMTC etc.) exposed by the Rust side.
// No-ops in the browser preview (Tauri IPC unavailable).

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

export async function updateMediaControls(
  title: string,
  artist: string,
  album: string,
  cover: string | null,
  playing: boolean,
): Promise<void> {
  if (!isTauri) return
  try {
    const { invoke } = await import("@tauri-apps/api/core")
    await invoke("media_update", { title, artist, album, cover, playing })
  } catch {
    /* media controls are best-effort */
  }
}

let attached = false

// Wire OS media-control button events (play/pause/toggle/next/previous) to the
// player. Safe to call multiple times — only the first attaches.
export async function attachMediaControls(handlers: {
  play: () => void
  pause: () => void
  toggle: () => void
  next: () => void
  previous: () => void
}): Promise<void> {
  if (!isTauri || attached) return
  attached = true
  try {
    const { listen } = await import("@tauri-apps/api/event")
    await listen<string>("media-control", (e) => {
      const fn = handlers[e.payload as keyof typeof handlers]
      if (typeof fn === "function") fn()
    })
  } catch {
    attached = false
  }
}
