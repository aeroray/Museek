import { useEffect, useRef, type RefObject } from "react"

type Options = {
  /**
   * The element that actually scrolls (the Radix ScrollArea viewport).
   *
   * A ref rather than the element itself on purpose: during the first render the
   * node does not exist yet, so `scrollElement` would be `null` and an effect
   * keyed on it would return early and never re-run. Effects run after mount, so
   * reading `ref.current` inside one is safe.
   */
  scrollRef: RefObject<HTMLElement | null>
  /** False once the last page is known to be reached — stops all further loads. */
  hasMore: boolean
  /** True while a page is in flight; blocks duplicate requests. */
  isLoading: boolean
  onLoadMore: () => void
  /** Distance from the bottom, in px, that triggers the next page. */
  threshold?: number
}

/**
 * Calls `onLoadMore` when the user scrolls near the bottom of the referenced
 * scroll container.
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
    const el = scrollRef.current
    if (!el) return

    const maybeLoad = () => {
      const s = latest.current
      if (!s.hasMore || s.isLoading) return
      if (cooldown.current) return
      const { scrollTop, clientHeight, scrollHeight } = el
      // Content that does not fill the viewport reports scrollHeight≈clientHeight,
      // which also counts as "at the bottom" — intended, so the list keeps
      // loading until it overflows or the source runs dry.
      if (scrollHeight - scrollTop - clientHeight > threshold) return
      cooldown.current = setTimeout(() => {
        cooldown.current = null
      }, 250)
      s.onLoadMore()
    }

    maybeLoad()
    el.addEventListener("scroll", maybeLoad, { passive: true })
    return () => el.removeEventListener("scroll", maybeLoad)
  }, [scrollRef, hasMore, isLoading, threshold])
}
