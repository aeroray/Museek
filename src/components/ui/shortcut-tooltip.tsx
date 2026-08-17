import * as React from "react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useSettingsStore } from "@/stores/settingsStore"
import { formatShortcut, type ShortcutAction } from "@/lib/shortcutKeys"
import { cn } from "@/lib/utils"

/** Live formatted combo for a shortcut action (follows Settings → Shortcuts). */
export function useShortcutCombo(action: ShortcutAction): string {
  return useSettingsStore((s) => formatShortcut(s.shortcuts[action]))
}

export function shortcutTitle(label: string, combo: string): string {
  return combo ? `${label} (${combo})` : label
}

/**
 * Same chrome as shortcut hints: label plus an optional kbd chip.
 * Wrap disabled icon buttons so hover still works.
 */
export function HintTooltip({
  label,
  hint,
  side = "top",
  children,
  className,
}: {
  label: string
  hint?: string
  side?: "top" | "bottom" | "left" | "right"
  children: React.ReactElement
  className?: string
}) {
  const described = shortcutTitle(label, hint ?? "")
  const child = React.cloneElement(children, {
    "aria-label": described,
  } as { "aria-label": string })

  return (
    <Tooltip delayDuration={350}>
      <TooltipTrigger asChild>
        <span className="inline-flex">{child}</span>
      </TooltipTrigger>
      <TooltipContent
        side={side}
        className={cn(
          "flex items-center gap-2 px-2.5 py-1 text-xs",
          className,
        )}
      >
        <span>{label}</span>
        {hint ? (
          <kbd className="rounded-md border border-border/80 bg-muted px-1.5 py-px font-medium text-[10px] leading-none text-muted-foreground">
            {hint}
          </kbd>
        ) : null}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * Hover label + current hotkey for icon controls.
 * Reads the synced shortcut map; pass `combo` only when the store is not hydrated
 * (desktop lyrics window).
 */
export function ShortcutTooltip({
  label,
  action,
  combo: comboProp,
  side = "top",
  children,
  className,
}: {
  label: string
  action: ShortcutAction
  combo?: string
  side?: "top" | "bottom" | "left" | "right"
  children: React.ReactElement
  className?: string
}) {
  const stored = useShortcutCombo(action)
  const combo = comboProp ?? stored
  return (
    <HintTooltip label={label} hint={combo} side={side} className={className}>
      {children}
    </HintTooltip>
  )
}
