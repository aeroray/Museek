import { useState, type SyntheticEvent } from "react"
import { Pencil, Plus, Tags, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { CategoryFilter, CategoryRecord } from "@/lib/songCategories"
import { cn } from "@/lib/utils"

type Props = {
  categories: CategoryRecord[]
  filter: CategoryFilter
  filterLabel: string
  onFilter: (filter: CategoryFilter) => void
  onCreate: () => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  labels: {
    all: string
    none: string
    add: string
    rename: string
    delete: string
  }
}

function stopItemSelect(event: SyntheticEvent) {
  event.preventDefault()
  event.stopPropagation()
}

export function CategoryFilterMenu({
  categories,
  filter,
  filterLabel,
  onFilter,
  onCreate,
  onRename,
  onDelete,
  labels,
}: Props) {
  const [open, setOpen] = useState(false)

  const runAction = (action: () => void) => {
    setOpen(false)
    action()
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 shrink-0 gap-1.5">
          <Tags size={14} />
          <span className="hidden sm:inline max-w-28 truncate">{filterLabel}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className={cn(
          "max-h-72 overflow-y-auto",
          categories.length > 0 && "min-w-[12rem]",
        )}
      >
        <DropdownMenuCheckboxItem
          checked={filter === "all"}
          showUncheckedIndicator
          onCheckedChange={() => onFilter("all")}
        >
          {labels.all}
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={filter === "none"}
          showUncheckedIndicator
          onCheckedChange={() => onFilter("none")}
        >
          {labels.none}
        </DropdownMenuCheckboxItem>
        {categories.map((cat) => (
          <div key={cat.id} className="relative">
            <DropdownMenuCheckboxItem
              className="pr-12"
              checked={filter === cat.id}
              showUncheckedIndicator
              onCheckedChange={() => onFilter(cat.id)}
            >
              <span className="min-w-0 truncate">{cat.name}</span>
            </DropdownMenuCheckboxItem>
            <div className="absolute right-1 top-1/2 z-10 flex -translate-y-1/2">
              <button
                type="button"
                className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                title={labels.rename}
                aria-label={labels.rename}
                onPointerDown={stopItemSelect}
                onPointerUp={stopItemSelect}
                onClick={(event) => {
                  stopItemSelect(event)
                  runAction(() => onRename(cat.id, cat.name))
                }}
              >
                <Pencil size={13} />
              </button>
              <button
                type="button"
                className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-destructive hover:bg-accent hover:text-destructive"
                title={labels.delete}
                aria-label={labels.delete}
                onPointerDown={stopItemSelect}
                onPointerUp={stopItemSelect}
                onClick={(event) => {
                  stopItemSelect(event)
                  runAction(() => onDelete(cat.id))
                }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
        <DropdownMenuItem className="relative pl-8" onSelect={() => onCreate()}>
          <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
            <Plus size={14} />
          </span>
          {labels.add}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
