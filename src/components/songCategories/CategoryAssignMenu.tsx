import { Plus, Tags } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { CategoryRecord } from "@/lib/songCategories"

type Props = {
  categories: CategoryRecord[]
  disabled?: boolean
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
        <DropdownMenuItem onClick={() => onAssign(null)}>{labels.none}</DropdownMenuItem>
        {categories.length > 0 && <DropdownMenuSeparator />}
        {categories.map((cat) => (
          <DropdownMenuItem key={cat.id} onClick={() => onAssign(cat.id)}>
            {cat.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onCreate}>
          <Plus size={14} className="mr-2" />
          {labels.add}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
