import { useMemo, useState } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { quoteFontFamily } from "@/lib/uiFonts";
import { useFontStore } from "@/stores/fontStore";
import { useT } from "@/lib/i18n";

export function FontFamilyPicker({
  value,
  extraLabel,
  extraSelected,
  onSelectExtra,
  onChange,
}: {
  value: string | null;
  extraLabel?: string;
  extraSelected?: boolean;
  onSelectExtra?: () => void;
  onChange: (family: string) => void;
}) {
  const t = useT();
  const families = useFontStore((s) => s.families);
  const familiesStatus = useFontStore((s) => s.familiesStatus);
  const ensureFamilies = useFontStore((s) => s.ensureFamilies);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const loading = familiesStatus !== "ready";
  const preview = t("theme.fontPreview");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return families;
    return families.filter((family) => family.toLowerCase().includes(needle));
  }, [families, query]);
  const extraVisible =
    !!extraLabel &&
    (!query.trim() || extraLabel.toLowerCase().includes(query.trim().toLowerCase()));
  const triggerLabel = extraSelected
    ? (extraLabel ?? t("theme.fontSystem"))
    : (value ?? extraLabel ?? t("theme.fontCustom"));
  const triggerFace = extraSelected || !value ? undefined : quoteFontFamily(value);

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) ensureFamilies();
        else setQuery("");
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          static
          className="h-9 w-full min-w-0 justify-between gap-2 font-normal"
        >
          <span
            className="min-w-0 truncate"
            style={triggerFace ? { fontFamily: triggerFace } : undefined}
          >
            {triggerLabel}
          </span>
          {open && loading ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin opacity-70" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[var(--radix-dropdown-menu-trigger-width)] p-0"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <div className="p-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("theme.fontSearch")}
            className="h-8"
            disabled={loading}
            onKeyDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          />
        </div>
        <ScrollArea className="h-64">
          <div className="p-1 pt-0">
            {extraVisible && extraLabel && (
              <>
                <FontMenuRow
                  label={extraLabel}
                  preview={preview}
                  active={!!extraSelected}
                  onSelect={() => onSelectExtra?.()}
                />
                <DropdownMenuSeparator />
              </>
            )}
            {loading ? (
              <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
                <p className="text-xs">{t("theme.fontLoading")}</p>
              </div>
            ) : filtered.length === 0 ? (
              <p className="px-2.5 py-2 text-xs text-muted-foreground">
                {t("theme.fontEmpty")}
              </p>
            ) : (
              filtered.map((family) => (
                <FontMenuRow
                  key={family}
                  label={family}
                  preview={preview}
                  face={quoteFontFamily(family)}
                  active={!extraSelected && value === family}
                  onSelect={() => onChange(family)}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FontMenuRow({
  label,
  preview,
  face,
  active,
  onSelect,
}: {
  label: string;
  preview: string;
  face?: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem
      className="items-center gap-3 py-2"
      onSelect={onSelect}
    >
      <span className="flex size-4 shrink-0 items-center justify-center">
        {active ? (
          <Check className="size-4" />
        ) : (
          <span className="size-1.5 rounded-full bg-muted-foreground/45" />
        )}
      </span>
      <span
        className="min-w-0 flex-1 truncate"
        style={face ? { fontFamily: face } : undefined}
      >
        {label}
      </span>
      <span
        className="shrink-0 text-xs text-muted-foreground"
        style={face ? { fontFamily: face } : undefined}
      >
        {preview}
      </span>
    </DropdownMenuItem>
  );
}
