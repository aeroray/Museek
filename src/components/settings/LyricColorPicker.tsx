import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { sampleThemeLyricColor } from "@/lib/lyricColor";
import { cn } from "@/lib/utils";

export function LyricColorPicker({
  value,
  onFollowTheme,
  onChange,
}: {
  value: string | null;
  onFollowTheme: () => void;
  onChange: (hex: string) => void;
}) {
  const t = useT();
  const following = value === null;
  const pickerValue = value ?? sampleThemeLyricColor();

  return (
    <div className="flex items-center justify-end gap-2">
      <Button
        type="button"
        variant={following ? "default" : "outline"}
        size="sm"
        onClick={onFollowTheme}
      >
        {t("lyricsSettings.colorTheme")}
      </Button>
      <label
        className={cn(
          "relative size-8 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-border/80 shadow-[var(--shadow-border)]",
          !following && "ring-2 ring-ring ring-offset-2 ring-offset-background",
        )}
        style={{ backgroundColor: following ? "hsl(var(--primary))" : pickerValue }}
      >
        <span className="sr-only">{t("lyricsSettings.colorPick")}</span>
        <input
          type="color"
          value={pickerValue}
          className="absolute inset-0 cursor-pointer opacity-0"
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    </div>
  );
}
