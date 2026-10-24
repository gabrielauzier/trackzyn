import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Coffee } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

const SHORTCUTS = [5, 10, 15]
const MIN_MINUTES = 1
const MAX_MINUTES = 120

interface BreakPickerProps {
  /** Called with the break length in minutes, 1 to 120. */
  onPick: (minutes: number) => void
  disabled?: boolean
}

/** `Intervalo`: shortcuts of 5, 10 and 15 min, or any whole number of minutes from 1 to 120 (BREAK-01, BREAK-02). */
export function BreakPicker({ onPick, disabled }: BreakPickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [invalid, setInvalid] = useState(false)

  const pick = (minutes: number) => {
    setOpen(false)
    setTyped('')
    setInvalid(false)
    onPick(minutes)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const minutes = Number(typed)
    if (!/^\d+$/.test(typed.trim()) || minutes < MIN_MINUTES || minutes > MAX_MINUTES) {
      setInvalid(true)
      return
    }
    pick(minutes)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          <Coffee /> {t('focus.break.open')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-64 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {SHORTCUTS.map((minutes) => (
            <Button key={minutes} variant="secondary" size="sm" onClick={() => pick(minutes)}>
              {t('focus.break.shortcut', { minutes })}
            </Button>
          ))}
        </div>
        <form className="space-y-2" onSubmit={submit} noValidate>
          <label htmlFor="break-minutes" className="text-sm font-medium">
            {t('focus.break.minutes')}
          </label>
          <div className="flex gap-2">
            <Input
              id="break-minutes"
              inputMode="numeric"
              value={typed}
              aria-invalid={invalid}
              aria-describedby={invalid ? 'break-minutes-error' : undefined}
              onChange={(event) => {
                setTyped(event.target.value)
                setInvalid(false)
              }}
            />
            <Button type="submit" size="sm" className="h-9">
              {t('focus.break.start')}
            </Button>
          </div>
          {invalid && (
            <p id="break-minutes-error" role="alert" className="text-sm text-destructive">
              {t('focus.break.range')}
            </p>
          )}
        </form>
      </PopoverContent>
    </Popover>
  )
}
