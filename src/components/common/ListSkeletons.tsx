import { Skeleton } from "@/components/ui/skeleton"

/**
 * Loading placeholder that mirrors {@link TrackRow} geometry:
 * optional rank → 40×40 rounded-xl cover → title/artist → album (lg+) →
 * quality chip → duration. Hover-only action buttons are omitted (they don't
 * affect the resting layout much and clutter the pulse).
 */
export function TrackRowSkeleton({ showRank = false }: { showRank?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      {showRank && <Skeleton className="h-4 w-6 shrink-0" />}
      <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-2/5 max-w-[12rem]" />
        <Skeleton className="h-3 w-1/4 max-w-[8rem]" />
      </div>
      <Skeleton className="hidden h-3 w-24 max-w-32 lg:block" />
      <Skeleton className="h-4 w-8 shrink-0 rounded-sm" />
      <Skeleton className="h-3 w-12 shrink-0" />
    </div>
  )
}

/**
 * Loading placeholder that mirrors {@link PlaylistCard}:
 * square rounded-2xl cover → 2-line title block → meta row.
 */
export function PlaylistCardSkeleton() {
  return (
    <div className="min-w-0">
      <Skeleton className="aspect-square w-full rounded-2xl" />
      <div className="mt-2.5 min-h-[2.5rem] space-y-1.5">
        <Skeleton className="h-3.5 w-[85%]" />
        <Skeleton className="h-3.5 w-[55%]" />
      </div>
      <Skeleton className="mt-0.5 h-3 w-2/3" />
    </div>
  )
}
