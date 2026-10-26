import { useEffect, useRef, type ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Bold, Italic, List, ListOrdered, Redo2, Underline, Undo2 } from 'lucide-react'
import { notesToHtml } from '@/lib/notes'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface NoteEditorProps extends Pick<ComponentProps<'div'>, 'id' | 'aria-label' | 'aria-invalid' | 'aria-describedby'> {
  /** The note as it is stored: the editor's HTML, or plain text from before the editor. */
  value: string
  /** Called with the HTML to store, or '' when the note is empty. */
  onChange: (notes: string) => void
  onBlur?: () => void
  /** False for a `viewer`: the note is shown, not edited. */
  editable?: boolean
  autoFocus?: boolean
  className?: string
}

/** The rich text of a task's notes: bold, italic, underline, lists, undo and redo. */
export function NoteEditor({
  value,
  onChange,
  onBlur,
  editable = true,
  autoFocus,
  className,
  id,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: NoteEditorProps) {
  const { t } = useTranslation()
  const shown = useRef(value)
  shown.current = value
  const editor = useEditor({
    // Only the formatting of the toolbar: whatever else is pasted in is dropped.
    extensions: [
      StarterKit.configure({
        blockquote: false,
        code: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        link: false,
        strike: false,
      }),
    ],
    content: notesToHtml(value),
    editable,
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        role: 'textbox',
        'aria-multiline': 'true',
        ...(ariaLabel ? { 'aria-label': ariaLabel } : {}),
        ...(ariaInvalid ? { 'aria-invalid': String(ariaInvalid) } : {}),
        ...(ariaDescribedBy ? { 'aria-describedby': ariaDescribedBy } : {}),
        class: cn(
          'min-h-20 px-3 py-2 text-base outline-none md:text-sm',
          '[&_p]:my-0 [&_ul]:my-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-0 [&_ol]:list-decimal [&_ol]:pl-5',
        ),
      },
    },
    onUpdate: ({ editor: current }) => {
      const written = current.isEmpty ? '' : current.getHTML()
      // A plain-text note read into the editor is not a change until it is edited.
      if (written !== notesToHtml(shown.current)) onChange(written)
    },
    onBlur: () => onBlur?.(),
  })

  // Follows a value set from outside, such as a form that was reset; what the editor itself wrote is left alone.
  useEffect(() => {
    if (!editor) return
    const written = editor.isEmpty ? '' : editor.getHTML()
    if (written !== notesToHtml(value)) editor.commands.setContent(notesToHtml(value), { emitUpdate: false })
  }, [editor, value])
  useEffect(() => {
    editor?.setEditable(editable)
  }, [editor, editable])

  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current?.isActive('bold') ?? false,
      italic: current?.isActive('italic') ?? false,
      underline: current?.isActive('underline') ?? false,
      bulletList: current?.isActive('bulletList') ?? false,
      orderedList: current?.isActive('orderedList') ?? false,
      canUndo: current?.can().undo() ?? false,
      canRedo: current?.can().redo() ?? false,
    }),
  })

  if (!editor) return null
  const tools = [
    { key: 'bold', icon: Bold, label: t('board.noteBold'), active: state.bold, run: () => editor.chain().focus().toggleBold().run() },
    { key: 'italic', icon: Italic, label: t('board.noteItalic'), active: state.italic, run: () => editor.chain().focus().toggleItalic().run() },
    { key: 'underline', icon: Underline, label: t('board.noteUnderline'), active: state.underline, run: () => editor.chain().focus().toggleUnderline().run() },
    { key: 'bullet', icon: List, label: t('board.noteBulletList'), active: state.bulletList, run: () => editor.chain().focus().toggleBulletList().run() },
    { key: 'ordered', icon: ListOrdered, label: t('board.noteOrderedList'), active: state.orderedList, run: () => editor.chain().focus().toggleOrderedList().run() },
    { key: 'undo', icon: Undo2, label: t('board.noteUndo'), disabled: !state.canUndo, run: () => editor.chain().focus().undo().run() },
    { key: 'redo', icon: Redo2, label: t('board.noteRedo'), disabled: !state.canRedo, run: () => editor.chain().focus().redo().run() },
  ]

  return (
    <div
      className={cn(
        'border-input dark:bg-input/30 rounded-md border bg-card shadow-xs',
        'focus-within:border-ring focus-within:ring-ring/30 focus-within:ring-[2px]',
        !editable && 'opacity-70',
        className,
      )}
    >
      {editable && (
        <div role="toolbar" aria-label={t('board.noteFormatting')} className="flex flex-wrap items-center gap-0.5 border-b px-1.5 py-1">
          {tools.map(({ key, icon: Icon, label, active, disabled, run }) => (
            <Button
              key={key}
              type="button"
              variant={active ? 'secondary' : 'ghost'}
              size="icon-sm"
              aria-label={label}
              aria-pressed={active}
              disabled={disabled}
              // Keeps the selection in the text while a tool is used.
              onMouseDown={(event) => event.preventDefault()}
              onClick={run}
            >
              <Icon size={14} />
            </Button>
          ))}
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  )
}
