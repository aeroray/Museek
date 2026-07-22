import { Plus } from "lucide-react"
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import type { CategoryRecord } from "@/lib/songCategories"

type Props = {
  categories: CategoryRecord[]
  onAssign: (categoryId: string | null) => void
  onCreate?: () => void
  labels: {
    none: string
    add?: string
  }
}

/** Items for an existing DropdownMenu — row-level or nested assign. */
export function CategoryAssignItems({ categories, onAssign, onCreate, labels }: Props) {
  return (
    <>
      <DropdownMenuItem onClick={() => onAssign(null)}>{labels.none}</DropdownMenuItem>
      {categories.length > 0 && <DropdownMenuSeparator />}
      {categories.map((cat) => (
        <DropdownMenuItem key={cat.id} onClick={() => onAssign(cat.id)}>
          {cat.name}
        </DropdownMenuItem>
      ))}
      {onCreate && labels.add && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onCreate}>
            <Plus size={14} className="mr-2" />
            {labels.add}
          </DropdownMenuItem>
        </>
      )}
    </>
  )
}
