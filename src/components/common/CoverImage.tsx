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
}: {
  src?: string | null
  alt?: string
  className?: string
}) {
  const ref = useRef<HTMLImageElement>(null)
  const [loaded, setLoaded] = useState(false)

  // A cached image can finish loading before React attaches onLoad, which would
  // otherwise leave the cover stuck transparent. Reconcile against `.complete`.
  useEffect(() => {
    setLoaded(false)
    if (ref.current?.complete) setLoaded(true)
  }, [src])

  if (!src) return null
  return (
    <img
      ref={ref}
      src={src}
      alt={alt}
      loading="lazy"
      onLoad={() => setLoaded(true)}
      onError={() => setLoaded(true)}
      className={cn(
        "h-full w-full object-cover transition-[opacity,filter] duration-700 ease-out",
        "outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10",
        loaded ? "opacity-100 blur-0" : "opacity-0 blur-md",
        className,
      )}
    />
  )
}
