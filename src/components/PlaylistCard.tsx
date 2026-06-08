import { Play, Music, X, Heart, User, Headphones, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { useT } from "@/lib/i18n"
import type { Playlist } from "@/lib/playlists"

/**
 * Square cover + (reserved) two-line title + an icon subtitle (creator / plays).
 * The fixed title height keeps every card the same shape so covers line up in
 * the grid even when titles wrap.
 *
 * Clicking the card body opens the playlist detail. Playing the whole list and
 * (un)favoriting are *separate* affordances so the semantics are clear:
 *  - `onPlay`           → a circular play button (does NOT open the detail)
 *  - `onToggleFavorite` → a heart toggle (pass `favorited` for its state)
 *  - `onRemove`         → a hover ✕ (used in Favorites to unfavorite)
 *
 * In `selectable` mode (batch edit) the card click toggles selection instead of
 * opening, a checkbox is shown, and the per-card action buttons are hidden.
 */
export function PlaylistCard({
  playlist,
  onOpen,
  onPlay,
  onRemove,
  onToggleFavorite,
  favorited,
  selectable,
  selected,
  onSelect,
}: {
  playlist: Playlist
  onOpen: () => void
  onPlay?: () => void
  onRemove?: () => void
  onToggleFavorite?: () => void
  favorited?: boolean
  selectable?: boolean
  selected?: boolean
  onSelect?: () => void
}) {
  const t = useT()
  const activate = selectable ? onSelect : onOpen
  return (
    <div className="group relative">
      <div
        role="button"
        tabIndex={0}
        onClick={() => activate?.()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            activate?.()
          }
        }}
        className="w-full text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
      >
        <div
          className={cn(
            "aspect-square rounded-xl overflow-hidden bg-muted relative shadow-sm",
            selectable && selected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
          )}
        >
          {playlist.img ? (
            <img
              src={playlist.img}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-muted-foreground">
              <Music size={28} />
            </div>
          )}
          {/* gentle darken on hover — affordance that the cover is clickable */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />

          {/* Selection checkbox (batch edit) */}
          {selectable && (
            <span
              className={cn(
                "absolute top-2 left-2 h-6 w-6 rounded-full border-2 flex items-center justify-center transition-colors",
                selected ? "bg-primary border-primary text-primary-foreground" : "border-white/80 bg-black/35 text-transparent"
              )}
            >
              <Check size={14} />
            </span>
          )}

          {/* Per-card actions — only when NOT selecting */}
          {!selectable && onToggleFavorite && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onToggleFavorite()
              }}
              title={t(favorited ? "hotPlaylists.favorited" : "hotPlaylists.favorite")}
              className={cn(
                "absolute top-2 left-2 h-7 w-7 rounded-full flex items-center justify-center transition-all bg-black/45 text-white hover:bg-black/65",
                favorited ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              )}
            >
              <Heart size={14} className={favorited ? "text-red-500" : ""} fill={favorited ? "currentColor" : "none"} />
            </button>
          )}

          {!selectable && onRemove && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onRemove()
              }}
              title={t("hotPlaylists.removeFavorite")}
              className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/55 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/75"
            >
              <X size={14} />
            </button>
          )}

          {!selectable && onPlay && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onPlay()
              }}
              title={t("common.playAll")}
              className="absolute bottom-2 right-2 h-10 w-10 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center opacity-0 translate-y-1.5 group-hover:opacity-100 group-hover:translate-y-0 transition-all hover:scale-105"
            >
              <Play size={18} className="ml-0.5" fill="currentColor" strokeWidth={0} />
            </button>
          )}
        </div>

        <p className="text-sm mt-2 leading-snug line-clamp-2 min-h-[2.5rem]" title={playlist.name}>
          {playlist.name}
        </p>
        {(playlist.author || playlist.playCount) && (
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            {playlist.author && (
              <span className="flex items-center gap-1 min-w-0" title={playlist.author}>
                <User size={11} className="shrink-0" />
                <span className="truncate">{playlist.author}</span>
              </span>
            )}
            {playlist.playCount && (
              <span className="flex items-center gap-1 shrink-0" title={t("hotPlaylists.playCountTip")}>
                <Headphones size={11} className="shrink-0" />
                {playlist.playCount}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
