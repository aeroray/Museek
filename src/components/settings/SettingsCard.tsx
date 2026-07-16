import { type ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * A grouped settings card — a bordered, rounded container whose children are
 * rendered as divider-separated rows (iOS / macOS "grouped" settings style).
 * Used across the settings tabs to give the page structure and stop controls
 * from floating in empty space.
 */
export function SettingsCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl bg-card/50 divide-y divide-border shadow-[var(--shadow-border)]", className)}>
      {children}
    </div>
  )
}

/**
 * One row inside a SettingsCard. Title + inline description sit on the left.
 * Pass `control` for a right-aligned control (a switch or single button); pass
 * `children` for a wide control (e.g. a button group) that wraps below the label.
 */
export function SettingRow({
  title,
  desc,
  control,
  children,
}: {
  title?: string
  desc?: string
  control?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="p-4">
      {(title || control) && (
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            {title && <h3 className="text-sm font-medium leading-snug">{title}</h3>}
            {desc && <p className="text-xs leading-relaxed text-muted-foreground">{desc}</p>}
          </div>
          {control && <div className="shrink-0 pt-0.5">{control}</div>}
        </div>
      )}
      {children && <div className={cn(title && "mt-3")}>{children}</div>}
    </div>
  )
}
