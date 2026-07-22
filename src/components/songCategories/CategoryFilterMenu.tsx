import { Check, Pencil, Plus, Tags, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { CategoryFilter, CategoryRecord } from "@/lib/songCategories"
import { cn } from "@/lib/utils"

type Props = {
  categories: CategoryRecord[]
  filter: CategoryFilter
  filterLabel: string
  activeCategory?: CategoryRecord
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

export function CategoryFilterMenu({
  categories,
  filter,
  filterLabel,
  activeCategory,
  onFilter,
  onCreate,
  onRename,
  onDelete,
  labels,
}: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 shrink-0 gap-1.5">
          <Tags size={14} />
          <span className="hidden sm:inline max-w-28 truncate">{filterLabel}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
        <DropdownMenuItem onClick={() => onFilter("all")}>
          <Check size={14} className={cn("mr-2", filter === "all" ? "opacity-100" : "opacity-0")} />
          {labels.all}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onFilter("none")}>
          <Check size={14} className={cn("mr-2", filter === "none" ? "opacity-100" : "opacity-0")} />
          {labels.none}
        </DropdownMenuItem>
        {categories.length > 0 && <DropdownMenuSeparator />}
        {categories.map((cat) => (
          <DropdownMenuItem key={cat.id} onClick={() => onFilter(cat.id)}>
            <Check
              size={14}
              className={cn("mr-2", filter === cat.id ? "opacity-100" : "opacity-0")}
            />
            {cat.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onCreate}>
          <Plus size={14} className="mr-2" />
          {labels.add}
        </DropdownMenuItem>
        {activeCategory && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onRename(activeCategory.id, activeCategory.name)}>
              <Pencil size={14} className="mr-2" />
              {labels.rename}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onDelete(activeCategory.id)}
            >
              <Trash2 size={14} className="mr-2" />
              {labels.delete}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
