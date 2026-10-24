import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Inbox, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { PageHeader } from '@/components/page-header'
import { IconBadge } from '@/components/icon-badge'
import { IconPicker } from '@/components/icon-picker'
import { DeleteConfirmationDialog } from '@/components/delete-confirmation-dialog'
import { TimezoneSelect } from '@/components/timezone-select'
import { FileDropzone } from '@/components/file-dropzone'
import { usePrivacyMode } from '@/hooks/use-privacy-mode'
import { Caption, ShowcaseSection, Specimen, SpecimenGrid } from './layout'

const COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#4a3aa7', '#e34948', '#64748b']

function allTimezones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return ['UTC', 'America/Sao_Paulo', 'Europe/London', 'Asia/Tokyo']
  }
}

export function ComposedSection() {
  const { t } = useTranslation()
  const [icon, setIcon] = useState('rocket')
  const [color, setColor] = useState(COLORS[0])
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [timezone, setTimezone] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const { privacyMode, togglePrivacyMode, mask } = usePrivacyMode()

  return (
    <ShowcaseSection id="composed" title={t('showcase.composed.title')} description={t('showcase.composed.description')}>
      <SpecimenGrid>
        <Specimen name="PageHeader" importFrom="@/components/page-header" wide>
          <PageHeader
            section="Workspace"
            title="Projects"
            action={<Button size="sm"><Plus /> New project</Button>}
          />
        </Specimen>

        <Specimen name="IconBadge · IconPicker" importFrom="@/components/icon-picker">
          <div className="flex items-center gap-3">
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className="rounded-xl ring-offset-2 focus-visible:ring-2 focus-visible:ring-ring" aria-label="Choose icon">
                  <IconBadge icon={icon} color={color} size="xl" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <IconPicker value={icon} color={color} onChange={setIcon} />
              </PopoverContent>
            </Popover>
            <div className="flex gap-1.5">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Colour ${c}`}
                  aria-pressed={c === color}
                  className="h-6 w-6 rounded-full ring-offset-2 ring-offset-card aria-pressed:ring-2 aria-pressed:ring-foreground"
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <Caption>sizes</Caption>
          <div className="flex items-end gap-2">
            {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((size) => (
              <IconBadge key={size} icon={icon} color={color} size={size} />
            ))}
          </div>
        </Specimen>

        <Specimen name="TimezoneSelect" importFrom="@/components/timezone-select">
          <TimezoneSelect
            value={timezone}
            onChange={setTimezone}
            options={allTimezones()}
            emptyOption="Follow the application default"
            className="w-full"
          />
        </Specimen>

        <Specimen name="FileDropzone" importFrom="@/components/file-dropzone">
          <FileDropzone
            accept={['pdf', 'png', 'jpg']}
            maxSizeMb={10}
            onFiles={(files) => setPicked(files.map((f) => f.name))}
            onReject={(message) => toast.error(message)}
          />
          {picked.length > 0 && (
            <p className="mt-2 truncate text-xs text-muted-foreground">Picked: {picked.join(', ')}</p>
          )}
        </Specimen>

        <Specimen name="DeleteConfirmationDialog" importFrom="@/components/delete-confirmation-dialog">
          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>Delete project</Button>
          <DeleteConfirmationDialog
            open={deleteOpen}
            title="Delete project?"
            description="This permanently removes Apollo and everything in it."
            isPending={false}
            onClose={() => setDeleteOpen(false)}
            onConfirm={() => {
              setDeleteOpen(false)
              toast.success('Project deleted')
            }}
          />
        </Specimen>

        <Specimen name="Privacy mask" importFrom="@/hooks/use-privacy-mode">
          <div className="flex items-center justify-between gap-3">
            <p className="text-2xl font-semibold tabular-nums">{mask('$ 48,210.00')}</p>
            <Button variant="outline" size="sm" onClick={togglePrivacyMode}>
              {privacyMode ? 'Show values' : 'Hide values'}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Same toggle as the eye icon in the sidebar; persists per browser.</p>
        </Specimen>

        <Specimen name="Empty state" wide>
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Inbox size={20} />
            </span>
            <p className="text-sm font-medium">No projects yet</p>
            <p className="max-w-sm text-xs text-muted-foreground">Projects group your work. Create one to get started.</p>
            <Button size="sm" className="mt-2"><Plus /> New project</Button>
          </div>
        </Specimen>
      </SpecimenGrid>
    </ShowcaseSection>
  )
}
