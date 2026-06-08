import { Info } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/**
 * A settings option title with an info (ⓘ) icon beside it; the description shows
 * on hover instead of taking up a permanent line below the title.
 */
export function SettingHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <h3 className="text-base font-medium">{title}</h3>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            tabIndex={-1}
            aria-label={desc}
            className="text-muted-foreground/50 hover:text-foreground transition-colors"
          >
            <Info size={14} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs whitespace-pre-line">
          {desc}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
