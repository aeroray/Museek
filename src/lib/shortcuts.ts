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
      let handled = true
      switch (e.key) {
        case " ":
          if (p.currentSong) p.togglePlay()
          else handled = false
          break
        case "ArrowLeft":
          if (mod) void p.prev()
          else p.seek(p.currentTime - SEEK_STEP)
          break
        case "ArrowRight":
          if (mod) void p.next()
          else p.seek(p.currentTime + SEEK_STEP)
          break
        case "ArrowUp":
          if (p.muted) p.setMuted(false)
          p.setVolume(Math.min(1, p.volume + VOL_STEP))
          break
        case "ArrowDown":
          if (p.muted) p.setMuted(false)
          p.setVolume(Math.max(0, p.volume - VOL_STEP))
          break
        case "m":
        case "M":
          p.setMuted(!p.muted)
          break
        case "l":
        case "L":
          if (p.currentSong) p.setShowLyrics(!p.showLyrics)
          else handled = false
          break
        default:
          handled = false
      }
      if (!handled) return
      e.preventDefault()
      // Drop focus from any control so the same keypress can't also activate it
      // or leave a focus-visible ring (e.g. Space right after clicking a button
      // or a playlist card's "play all").
      const active = document.activeElement
      if (active instanceof HTMLElement && active !== document.body) active.blur()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
}
