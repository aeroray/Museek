import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

/**
 * A cover <img> with an elegant blur-up fade-in: it starts blurred + transparent
 * (revealing the muted placeholder behind it) and eases to sharp + opaque once it
 * loads. Render your own fallback when `src` is empty — this returns null then.
 */
export function CoverImage({
  src,
  alt = "",
  className,
  loading = "lazy",
  onLoaded,
}: {
  src?: string | null
  alt?: string
  className?: string
  loading?: "lazy" | "eager"
  /** Fires when load state flips (false on src change, true once ready). */
  onLoaded?: (loaded: boolean) => void
}) {
  const ref = useRef<HTMLImageElement>(null)
  const [loaded, setLoaded] = useState(false)

  // A cached image can finish loading before React attaches onLoad, which would
  // otherwise leave the cover stuck transparent. Reconcile against `.complete`.
  useEffect(() => {
    setLoaded(false)
    onLoaded?.(false)
    if (ref.current?.complete) {
      setLoaded(true)
      onLoaded?.(true)
    }
    // onLoaded is intentionally omitted — callers pass inline lambdas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  if (!src) return null

  const markLoaded = () => {
    setLoaded(true)
    onLoaded?.(true)
  }

  return (
    <img
      ref={ref}
      src={src}
      alt={alt}
      loading={loading}
      onLoad={markLoaded}
      onError={markLoaded}
      className={cn(
        "h-full w-full object-cover transition-[opacity,filter] duration-700 ease-out",
        "outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10",
        loaded ? "opacity-100 blur-0" : "opacity-0 blur-md",
        className,
      )}
    />
  )
}
