import { useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
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
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function FontFamilyPicker({
  value,
  families,
  extraLabel,
  extraSelected,
  onSelectExtra,
  onChange,
}: {
  value: string | null;
  families: string[];
  extraLabel?: string;
  extraSelected?: boolean;
  onSelectExtra?: () => void;
  onChange: (family: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
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
        if (!next) setQuery("");
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
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
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
            {filtered.length === 0 ? (
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
      <Check
        className={cn(
          "size-4 shrink-0",
          active ? "opacity-100" : "opacity-0",
        )}
      />
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
