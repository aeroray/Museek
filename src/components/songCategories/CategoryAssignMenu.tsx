import { Tags } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CategoryAssignItems } from "@/components/songCategories/CategoryAssignItems"
import type { CategoryRecord } from "@/lib/songCategories"

type Props = {
  categories: CategoryRecord[]
  disabled?: boolean
  /** `null` = uncategorized. Omit when the selection is mixed. */
  selectedId?: string | null
  onAssign: (categoryId: string | null) => void
  onCreate: () => void
  labels: {
    move: string
    none: string
    add: string
  }
}

/** Batch / row “move to category” menu. */
export function CategoryAssignMenu({
  categories,
  disabled,
  selectedId,
  onAssign,
  onCreate,
  labels,
}: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8" disabled={disabled}>
          <Tags size={14} className="mr-1.5" />
          {labels.move}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
        <CategoryAssignItems
          categories={categories}
          selectedId={selectedId}
          onAssign={onAssign}
          onCreate={onCreate}
          labels={{ none: labels.none, add: labels.add }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
