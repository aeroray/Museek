import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { virtualWindow } from "./virtualWindow"

const DEFAULT_ROW = 56
const OVERSCAN = 10

/**
 * Bind a Radix ScrollArea's viewport element for VirtualList.
 *
 * Attach the returned ref to a wrapper element that is mounted for as long as
 * the list should be virtualized — NOT to the ScrollArea itself when the
 * ScrollArea is conditionally rendered. The lookup searches the wrapper's
 * subtree, so the wrapper must outlive the ScrollArea for the observer to help.
 *
 * The ScrollArea is not necessarily present when this effect first runs — the
 * search page only renders it after a query (before that it shows the hot-search
 * cloud). A single bounded retry is not enough: it gives up while the node is
 * still missing, and since `deps` may never change again the caller is left
 * holding `null` forever — which silently disables virtualization and leaves the
 * list blank on scroll.
 *
 * So: poll a few frames (covers the common case, where Radix has already
 * rendered the viewport in the same commit), then fall back to a MutationObserver
 * that notices a node appearing much later.
 *
 * Two things this hook has to get right, both of which it previously did not:
 *
 * 1. The observer must be attachable *before* the ScrollArea exists. It used to
 *    be created only when `ref.current` was already non-null, which is precisely
 *    not the case in the scenario it was written for — so the safety net was
 *    dead code.
 * 2. When the subtree goes away, the caller must not keep pointing at a detached
 *    node: the viewport is cleared so consumers stop binding listeners to it.
 */
export function useScrollAreaViewport(
  deps: unknown[] = [],
): [React.RefObject<HTMLDivElement | null>, HTMLElement | null] {
  const ref = useRef<HTMLDivElement | null>(null)
  const [viewport, setViewport] = useState<HTMLElement | null>(null)
  useEffect(() => {
    let cancelled = false
    let raf = 0
    let tries = 0
    let observer: MutationObserver | null = null

    const find = (): HTMLElement | null => {
      const vp = ref.current?.querySelector("[data-radix-scroll-area-viewport]")
      return vp instanceof HTMLElement ? vp : null
    }

    const attachObserver = () => {
      if (observer || cancelled) return
      const root = ref.current
      if (!root) return
      observer = new MutationObserver(() => {
        if (cancelled) return
        const found = find()
        if (!found) return
        setViewport(found)
        observer?.disconnect()
        observer = null
      })
      // `subtree` + `childList` catches the ScrollArea (and Radix's viewport)
      // mounting anywhere under the wrapper, not just as a direct child.
      observer.observe(root, { childList: true, subtree: true })
    }

    const settle = () => {
      if (cancelled) return
      const vp = find()
      if (vp) {
        setViewport(vp)
        observer?.disconnect()
        observer = null
        return
      }
      if (++tries < 10) {
        raf = requestAnimationFrame(settle)
        return
      }
      // Not here yet: stop polling frames, but keep a cheap observer so a later
      // mount is still noticed.
      attachObserver()
    }

    // Attach up front too: if the ScrollArea arrives after the frame poll gives
    // up, this is what catches it. `ref.current` is set by the time effects run
    // for a wrapper that was part of the first render.
    attachObserver()
    settle()

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      observer?.disconnect()
      // Do not leave consumers holding a node that is about to be unmounted.
      // Setting state in cleanup is deliberate here: the alternative is a
      // listener bound to a detached element, which silently never fires.
      setViewport((current) => (current ? null : current))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return [ref, viewport]
}

/**
 * Windowed list for long song playlists. Only mounts rows near the viewport so
 * hover / paint stay snappy with hundreds of tracks. Expects a fixed-ish row
 * height (TrackRow ≈ 56px).
 */
export function VirtualList<T>({
  items,
  rowHeight = DEFAULT_ROW,
  scrollElement,
  getKey,
  children,
  className,
}: {
  items: T[]
  rowHeight?: number
  /** Radix ScrollArea viewport (or any overflow scroller). */
  scrollElement: HTMLElement | null
  getKey: (item: T, index: number) => string | number
  children: (item: T, index: number) => ReactNode
  className?: string
}) {
  const [scrollTop, setScrollTop] = useState(0)
  const [viewH, setViewH] = useState(0)
  const rafScroll = useRef(0)

  useEffect(() => {
    if (!scrollElement) return

    const onScroll = () => {
      cancelAnimationFrame(rafScroll.current)
      rafScroll.current = requestAnimationFrame(() => {
        setScrollTop(scrollElement.scrollTop)
      })
    }
    const measure = () => setViewH(scrollElement.clientHeight)

    measure()
    onScroll()
    scrollElement.addEventListener("scroll", onScroll, { passive: true })
    const ro = new ResizeObserver(measure)
    ro.observe(scrollElement)
    return () => {
      cancelAnimationFrame(rafScroll.current)
      scrollElement.removeEventListener("scroll", onScroll)
      ro.disconnect()
    }
  }, [scrollElement])

  // Pure maths lives in ./virtualWindow so scripts/check-virtual-list-window.mjs
  // can import the shipping code instead of re-implementing it.
  const { total, start, end, offset } = virtualWindow(
    scrollTop,
    viewH,
    items.length,
    rowHeight,
    OVERSCAN,
  )
  const slice = useMemo(() => items.slice(start, end), [items, start, end])

  return (
    <div className={className} style={{ height: total, position: "relative" }}>
      <div style={{ transform: `translateY(${offset}px)` }}>
        {slice.map((item, i) => {
          const index = start + i
          return (
            <div key={getKey(item, index)} style={{ height: rowHeight }}>
              {children(item, index)}
            </div>
          )
        })}
      </div>
    </div>
  )
}
