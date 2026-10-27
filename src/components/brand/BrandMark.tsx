import { useMemo } from "react"
import { cn } from "@/lib/utils"
import iconSvg from "../../../app-icon.svg?raw"

type BrandMarkProps = {
  /** Animate equalizer bars (e.g. while audio is playing). */
  live?: boolean
  className?: string
  /** Hide the black rounded square — bars only. */
  barsOnly?: boolean
  title?: string
}

/**
 * Museek brand mark — geometry always comes from root `app-icon.svg`
 * (imported as raw SVG). Hover / `.live` equalizer motion is CSS-driven.
 */
/**
 * Escape a value for interpolation into an HTML attribute.
 *
 * `title` reaches this component from call sites as ordinary UI text, so it is
 * not attacker-controlled today — but it is spliced into the raw SVG string that
 * is then handed to `dangerouslySetInnerHTML`, and an unescaped `"` there ends
 * the attribute and starts markup. Escaping keeps that property local to this
 * component rather than depending on every caller staying trusted.
 */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

export function BrandMark({ live = false, className, barsOnly = false, title }: BrandMarkProps) {
  const html = useMemo(() => {
    let svg = iconSvg
      .replace(/\sxmlns="[^"]*"/, "")
      .replace(/\swidth="[^"]*"/, "")
      .replace(/\sheight="[^"]*"/, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .trim()

    svg = svg.replace(
      /<svg\b([^>]*)>/,
      `<svg$1 role="img" aria-hidden="${title ? "false" : "true"}"${title ? ` aria-label="${escapeAttr(title)}"` : ""}>`,
    )

    if (barsOnly) {
      svg = svg.replace(/\s*<rect\b[^>]*class="mark-bg"[^/]*\/>/, "")
    }

    return svg
  }, [barsOnly, title])

  return (
    <span
      className={cn("brand-mark", live && "live", barsOnly && "bars-only", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
