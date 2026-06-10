import { useEffect } from "react"
import { usePlayerStore } from "@/stores/playerStore"
import { useSettingsStore } from "@/stores/settingsStore"

const SEEK_STEP = 5 // seconds
const VOL_STEP = 0.05

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable
}

/**
 * Global media keyboard shortcuts, registered once at the app root. Active only
 * when enabled in Settings and when focus isn't in a text field (so typing in
 * the search box never triggers playback). Modifier = Ctrl (Windows) / ⌘ (mac).
 *
 *  Space            play / pause
 *  ← / →            seek −/+ 5s
 *  Ctrl/⌘ + ← / →   previous / next track
 *  ↑ / ↓            volume up / down
 *  M                mute toggle
 *  L                lyrics view toggle
 */
export function useGlobalShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!useSettingsStore.getState().shortcutsEnabled) return
      if (e.altKey || isTypingTarget(e.target)) return
      const p = usePlayerStore.getState()
      const mod = e.ctrlKey || e.metaKey
      switch (e.key) {
        case " ":
          if (!p.currentSong) return
          e.preventDefault()
          p.togglePlay()
          break
        case "ArrowLeft":
          e.preventDefault()
          if (mod) void p.prev()
          else p.seek(p.currentTime - SEEK_STEP)
          break
        case "ArrowRight":
          e.preventDefault()
          if (mod) void p.next()
          else p.seek(p.currentTime + SEEK_STEP)
          break
        case "ArrowUp":
          e.preventDefault()
          if (p.muted) p.setMuted(false)
          p.setVolume(Math.min(1, p.volume + VOL_STEP))
          break
        case "ArrowDown":
          e.preventDefault()
          if (p.muted) p.setMuted(false)
          p.setVolume(Math.max(0, p.volume - VOL_STEP))
          break
        case "m":
        case "M":
          e.preventDefault()
          p.setMuted(!p.muted)
          break
        case "l":
        case "L":
          if (!p.currentSong) return
          e.preventDefault()
          p.setShowLyrics(!p.showLyrics)
          break
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
}
