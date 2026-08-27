import { Plus } from "lucide-react"
import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import type { CategoryRecord } from "@/lib/songCategories"

type Props = {
  categories: CategoryRecord[]
  /** `null` = uncategorized. Omit when the selection is mixed. */
  selectedId?: string | null
  onAssign: (categoryId: string | null) => void
  onCreate?: () => void
  labels: {
    none: string
    add?: string
  }
}

/** Items for an existing DropdownMenu — row-level or nested assign. */
export function CategoryAssignItems({
  categories,
  selectedId,
  onAssign,
  onCreate,
  labels,
}: Props) {
  return (
    <>
      <DropdownMenuCheckboxItem
        checked={selectedId === null}
        showUncheckedIndicator
        onCheckedChange={() => onAssign(null)}
      >
        {labels.none}
      </DropdownMenuCheckboxItem>
      {categories.map((cat) => (
        <DropdownMenuCheckboxItem
          key={cat.id}
          checked={selectedId === cat.id}
          showUncheckedIndicator
          onCheckedChange={() => onAssign(cat.id)}
        >
          {cat.name}
        </DropdownMenuCheckboxItem>
      ))}
      {onCreate && labels.add ? (
        <DropdownMenuItem className="relative pl-8" onClick={() => onCreate?.()}>
          <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
            <Plus size={14} />
          </span>
          {labels.add}
        </DropdownMenuItem>
      ) : null}
    </>
  )
}
