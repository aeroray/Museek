import { Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { QualityBadge } from "@/components/common/MetaBadges";
import { usePlayerStore } from "@/stores/playerStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useT } from "@/lib/i18n";
import { QUALITY_LADDER } from "@/lib/quality";
import { cn } from "@/lib/utils";
import type { Quality } from "@/types/music";

/**
 * The player-bar quality badge, made clickable so one track can be played at a
 * different quality without changing the global default.
 *
 * Only `QUALITY_LADDER` tiers are offered. 192k/256k exist purely to label
 * local files and are not in the ladder, so offering them would produce an
 * empty candidate list and throw.
 */
export function SongQualityMenu() {
  const currentSong = usePlayerStore((s) => s.currentSong);
  const currentQuality = usePlayerStore((s) => s.currentQuality);
  const queue = usePlayerStore((s) => s.queue);
  const setSongQuality = usePlayerStore((s) => s.setSongQuality);
  const defaultQuality = useSettingsStore((s) => s.playQuality);
  const t = useT();

  // A local file's quality is a property of the file, so there is nothing to
  // choose — show the plain badge instead of a dead menu.
  const isLocal = currentSong?.source === "local";
  const override = queue.find(
    (item) => item.music.id === currentSong?.id,
  )?.qualityOverride;

  if (isLocal) return <QualityBadge quality={currentQuality} />;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={!currentSong}
        className={cn(
          "rounded transition-opacity outline-none",
          "hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          "disabled:pointer-events-none",
        )}
        title={t("player.qualityMenuTitle")}
        aria-label={t("player.qualityMenuTitle")}
      >
        {/* A dot marks a track that differs from the default, so the state is
            visible without opening the menu. */}
        <span className="relative inline-flex">
          <QualityBadge quality={currentQuality} />
          {override && (
            <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
          )}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-52">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {t("player.qualityMenuTitle")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {QUALITY_LADDER.map((q: Quality) => {
          // What is checked is the track's effective target, not what happened
          // to be delivered — a source may have downgraded it.
          const target = override ?? defaultQuality;
          const selected = target === q;
          return (
            <DropdownMenuItem
              key={q}
              onSelect={() => void setSongQuality(q)}
              className="gap-2"
            >
              <Check
                size={14}
                className={cn("shrink-0", !selected && "opacity-0")}
              />
              <span className="flex-1">{t(`quality.${q}`)}</span>
              {q === defaultQuality && (
                <span className="text-[10px] text-muted-foreground">
                  {t("player.qualityDefaultTag")}
                </span>
              )}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
          {t("player.qualityMenuHint")}
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
