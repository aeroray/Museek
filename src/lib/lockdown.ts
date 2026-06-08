// App lockdown: disable the right-click context menu everywhere, and (in
// production builds only) swallow the common keyboard shortcuts that open the
// browser/WebView devtools. We keep devtools reachable during development so
// debugging still works; release builds also have devtools compiled out by
// Tauri, so the key-blocking is just defense-in-depth.

export function installLockdown(): void {
  // No native context menu anywhere in the app.
  window.addEventListener("contextmenu", (e) => e.preventDefault())

  if (!import.meta.env.PROD) return

  window.addEventListener(
    "keydown",
    (e) => {
      const key = e.key.toUpperCase()
      const isDevtools =
        key === "F12" ||
        (e.ctrlKey && e.shiftKey && (key === "I" || key === "J" || key === "C")) ||
        (e.ctrlKey && key === "U") // view-source
      if (isDevtools) {
        e.preventDefault()
        e.stopPropagation()
      }
    },
    { capture: true },
  )
}
