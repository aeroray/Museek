import { useEffect, useRef, type RefObject } from "react"

type Options = {
  /**
   * The element that actually scrolls (the Radix ScrollArea viewport).
   *
   * Accepts the element directly OR a ref. Prefer the element when the caller
   * already tracks it in state (e.g. `useScrollAreaViewport`): passing a ref
   * whose `.current` is filled by another effect creates an ordering dependency
   * between two effects, and if this hook's effect runs first it sees `null` and
   * — with `hasMore`/`isLoading` unchanged — never re-runs.
   */
  scrollElement?: HTMLElement | null
  scrollRef?: RefObject<HTMLElement | null>
  /** False once the last page is known to be reached — stops all further loads. */
  hasMore: boolean
  /** True while a page is in flight; blocks duplicate requests. */
  isLoading: boolean
  onLoadMore: () => void
  /** Distance from the bottom, in px, that triggers the next page. */
  threshold?: number
}

/**
 * Calls `onLoadMore` when the user scrolls near the bottom of the scroll
 * container.
 *
 * Deliberately a scroll listener rather than an IntersectionObserver: the
 * observer only fires when a sentinel *crosses* a threshold, so a page that
 * lands without pushing the sentinel out of view never triggers again. A scroll
 * listener re-evaluates on every scroll, and the effect re-runs whenever its
 * state deps change, so chained loads and short content still make progress.
 *
 * Every entry point is guarded by `hasMore` and `isLoading`, so a source that
 * ignores pagination and replays the same page cannot spin.
 */
export function useInfiniteScroll({
  scrollElement,
  scrollRef,
  hasMore,
  isLoading,
  onLoadMore,
  threshold = 320,
}: Options): void {
  // Hold the latest values in a ref so the bound listener never closes over
  // stale state between re-binds.
  const latest = useRef({ hasMore, isLoading, onLoadMore })
  latest.current = { hasMore, isLoading, onLoadMore }
  // A page can be asked for by several triggers at once (the listener, plus the
  // effect re-running on its state deps). The parent only flips `isLoading` on
  // its next render, so a burst of synchronous triggers would otherwise request
  // the same page twice.
  const cooldown = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (cooldown.current) clearTimeout(cooldown.current)
    },
    [],
  )

  useEffect(() => {
    let bound: HTMLElement | null = null
    let detach: (() => void) | null = null

    const maybeLoad = () => {
      const s = latest.current
      if (!s.hasMore || s.isLoading) return
      if (cooldown.current) return
      if (!bound) return
      const { scrollTop, clientHeight, scrollHeight } = bound
      // Content that does not fill the viewport reports scrollHeight≈clientHeight,
      // which also counts as "at the bottom" — intended, so the list keeps
      // loading until it overflows or the source runs dry.
      if (scrollHeight - scrollTop - clientHeight > threshold) return
      cooldown.current = setTimeout(() => {
        cooldown.current = null
      }, 250)
      s.onLoadMore()
    }

    // The viewport node can be replaced while this effect is mounted — the search
    // page swaps its ScrollArea when the scope changes (songs → playlists →
    // albums), and each swap unmounts the old node. A one-shot bind would leave
    // the listener attached to the discarded element and never fire again, so
    // re-bind whenever the resolved element changes.
    //
    // The caller may pass `null` even though a viewport exists (Radix renders it
    // in a child effect, so a state-based lookup can miss it), hence the DOM
    // fallback: if no element was supplied, adopt the scroll area that is
    // actually on screen.
    const resolve = (): HTMLElement | null => {
      const given = scrollElement ?? scrollRef?.current ?? null
      if (given) return given
      const vp = document.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]")
      return vp
    }

    const sync = () => {
      const el = resolve()
      if (el === bound) return
      detach?.()
      bound = el
      if (!el) {
        detach = null
        return
      }
      el.addEventListener("scroll", maybeLoad, { passive: true })
      detach = () => el.removeEventListener("scroll", maybeLoad)
      maybeLoad()
    }

    sync()
    // Cheap identity check; nothing is read from the DOM unless the node changed.
    const timer = setInterval(sync, 300)
    return () => {
      clearInterval(timer)
      detach?.()
    }
  }, [scrollElement, scrollRef, hasMore, isLoading, threshold])
}
