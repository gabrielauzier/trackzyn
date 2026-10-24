import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UploadCloud } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface FileDropzoneProps {
  /** Called with the accepted files (already filtered by type and size). */
  onFiles: (files: File[]) => void
  /** Called with a human message for every rejected file. */
  onReject?: (message: string) => void
  /** Allowed extensions without the dot, e.g. ['pdf', 'png']. Empty = any. */
  accept?: string[]
  maxSizeMb?: number
  multiple?: boolean
  disabled?: boolean
  className?: string
}

function extensionOf(name: string): string {
  return name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
}

/** Drag-and-drop (or click/keyboard) file picker with client-side validation. */
export function FileDropzone({
  onFiles,
  onReject,
  accept = [],
  maxSizeMb,
  multiple = true,
  disabled = false,
  className,
}: FileDropzoneProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const [dragging, setDragging] = useState(false)

  const handle = (list: FileList | null) => {
    if (!list || disabled) return
    const accepted: File[] = []
    for (const file of Array.from(list)) {
      if (accept.length > 0 && !accept.includes(extensionOf(file.name))) {
        onReject?.(t('files.rejectType', { name: file.name }))
        continue
      }
      if (maxSizeMb && file.size > maxSizeMb * 1024 * 1024) {
        onReject?.(t('files.rejectSize', { name: file.name, size: maxSizeMb }))
        continue
      }
      accepted.push(file)
    }
    if (accepted.length > 0) onFiles(multiple ? accepted : accepted.slice(0, 1))
  }

  return (
    <label
      htmlFor={inputId}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        handle(e.dataTransfer.files)
      }}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors',
        'focus-within:ring-2 focus-within:ring-ring',
        dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/40',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
        <UploadCloud size={20} />
      </span>
      <span className="text-sm font-medium">{t('files.dropzoneTitle')}</span>
      <span className="text-xs text-muted-foreground">
        {accept.length > 0 && accept.map((ext) => ext.toUpperCase()).join(', ')}
        {accept.length > 0 && maxSizeMb ? ' · ' : ''}
        {maxSizeMb ? t('files.maxSize', { size: maxSizeMb }) : ''}
      </span>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        className="sr-only"
        multiple={multiple}
        disabled={disabled}
        accept={accept.map((ext) => `.${ext}`).join(',') || undefined}
        onChange={(e) => {
          handle(e.target.files)
          e.target.value = ''
        }}
      />
    </label>
  )
}
