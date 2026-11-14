import { useTranslation } from 'react-i18next'
import { Inbox } from 'lucide-react'
import { toast } from 'sonner'

import { useCapture } from '@/lib/inbox/use-capture'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type { InboxItem } from '@/types'

const Key = ({ children }: { children: React.ReactNode }) => (
  <kbd className="inline-flex h-5 items-center rounded border border-border bg-muted/60 px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
    {children}
  </kbd>
)

/**
 * The one field of a capture (CAP-01): Enter keeps the text in the inbox and calls `onSaved`; an empty text
 * sends nothing (CAP-02); over 500 characters or a failed capture keep the text with the reason (CAP-03).
 * The overlay of the app and the capture window of the desktop both draw it.
 */
export function CaptureField({ source, onSaved }: { source: 'app' | 'desktop'; onSaved: (item: InboxItem) => void }) {
  const { t } = useTranslation()
  const { text, change, submit, problem, pending } = useCapture(source, onSaved)

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      className="flex flex-col"
    >
      <div className="flex items-center gap-3 px-4 py-3.5">
        <Inbox size={20} aria-hidden className="shrink-0 text-primary" />
        <input
          // The field is the whole overlay: it takes the focus as it opens (CAP-04).
          autoFocus
          value={text}
          onChange={(event) => change(event.target.value)}
          readOnly={pending}
          aria-label={t('capture.label')}
          aria-invalid={problem === 'tooLong' || undefined}
          aria-describedby={problem ? 'capture-problem' : undefined}
          placeholder={t('inbox.captureLabel')}
          className="h-9 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none caret-primary placeholder:text-muted-foreground/70"
        />
      </div>
      {problem && (
        <p id="capture-problem" role="alert" className="px-4 pb-2 text-xs text-destructive">
          {t(problem === 'tooLong' ? 'inbox.tooLong' : 'inbox.captureFailed')}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/60 px-4 py-2.5 text-xs text-muted-foreground">
        <span>{t('capture.goesTo')}</span>
        <span className="flex-1" />
        <span className="flex items-center gap-1.5">
          <Key>↵</Key> {t('capture.hintSave')}
        </span>
        <span className="flex items-center gap-1.5">
          <Key>Esc</Key> {t('capture.hintClose')}
        </span>
      </div>
    </form>
  )
}

/**
 * The capture overlay of the app (CAP-04, CAP-05): opened by Mod+Shift+Space, the palette and the sidebar's
 * `Capturar`; Enter keeps the item with the origin `app` and closes, Esc closes without keeping anything.
 */
export function CaptureOverlay({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[22%] translate-y-0 gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[600px]"
      >
        <DialogTitle className="sr-only">{t('capture.title')}</DialogTitle>
        <DialogDescription className="sr-only">{t('capture.goesTo')}</DialogDescription>
        {/* Mounted only while open, so a closed overlay forgets the text (CAP-05). */}
        {open && (
          <CaptureField
            source="app"
            onSaved={() => {
              toast.success(t('capture.saved'))
              onOpenChange(false)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
