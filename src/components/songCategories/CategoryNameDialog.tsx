import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { CatDialog } from "@/lib/songCategories"
import type { RefObject } from "react"

type Props = {
  dialog: CatDialog
  name: string
  onNameChange: (v: string) => void
  inputRef: RefObject<HTMLInputElement | null>
  onClose: () => void
  onSubmit: () => void
  labels: {
    add: string
    rename: string
    placeholder: string
    cancel: string
    confirm: string
  }
}

export function CategoryNameDialog({
  dialog,
  name,
  onNameChange,
  inputRef,
  onClose,
  onSubmit,
  labels,
}: Props) {
  return (
    <Dialog
      open={!!dialog}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="sm:max-w-sm" initialFocus={inputRef}>
        <DialogHeader>
          <DialogTitle>{dialog?.mode === "rename" ? labels.rename : labels.add}</DialogTitle>
        </DialogHeader>
        <Input
          ref={inputRef}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={labels.placeholder}
          maxLength={32}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              onSubmit()
            }
          }}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {labels.cancel}
          </Button>
          <Button disabled={!name.trim()} onClick={onSubmit}>
            {labels.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
