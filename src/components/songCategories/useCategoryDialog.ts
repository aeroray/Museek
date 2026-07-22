import { useRef, useState } from "react"
import type { CatDialog, CategoryRecord } from "@/lib/songCategories"

type CreateResult = CategoryRecord | null

/**
 * Shared create/rename dialog state for song categories.
 * Persistence stays in the caller's adapters (local / favorites stores).
 */
export function useCategoryDialog(opts: {
  addCategory: (name: string) => CreateResult
  renameCategory: (id: string, name: string) => void
  onExists: () => void
  onCreated?: (cat: CategoryRecord, assignSelected: boolean) => void
}) {
  const [catDialog, setCatDialog] = useState<CatDialog>(null)
  const [catName, setCatName] = useState("")
  const [assignAfterCreate, setAssignAfterCreate] = useState(false)
  const catInputRef = useRef<HTMLInputElement>(null)

  const openCreate = (assignSelected = false) => {
    setAssignAfterCreate(assignSelected)
    setCatName("")
    setCatDialog({ mode: "create" })
  }

  const openRename = (id: string, name: string) => {
    setAssignAfterCreate(false)
    setCatName(name)
    setCatDialog({ mode: "rename", id, name })
  }

  const close = () => {
    setCatDialog(null)
    setAssignAfterCreate(false)
  }

  const submit = () => {
    const name = catName.trim()
    if (!name || !catDialog) return
    if (catDialog.mode === "create") {
      const cat = opts.addCategory(name)
      if (!cat) {
        opts.onExists()
        return
      }
      opts.onCreated?.(cat, assignAfterCreate)
    } else {
      opts.renameCategory(catDialog.id, name)
    }
    close()
  }

  return {
    catDialog,
    catName,
    setCatName,
    catInputRef,
    openCreate,
    openRename,
    close,
    submit,
    setCatDialog,
  }
}
