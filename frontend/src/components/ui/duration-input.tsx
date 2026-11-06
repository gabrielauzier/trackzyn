import { useLayoutEffect, useReducer, useRef, type ChangeEvent, type ComponentProps } from 'react'

import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

const MAX_DIGITS = 4

/** The digits as the field shows them: the colon follows the two digits of the hours. */
function mask(digits: string): string {
  return digits.length < 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`
}

/** Where the caret goes after `count` digits: past the colon once the hours are typed. */
const caretAfter = (count: number) => (count >= 2 ? count + 1 : count)

interface DurationInputProps extends Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type'> {
  /** The text as shown, `HH:MM` or part of it. */
  value: string
  onChange: (value: string) => void
  /**
   * `inline` is the bare field of the card (20 px tall, 12 px type, no Input chrome);
   * `field` looks like the other inputs of a form.
   */
  variant?: 'inline' | 'field'
}

/** A duration typed as `HH:MM`: digits only, with the colon fixed between hours and minutes. */
export function DurationInput({ value, onChange, variant = 'inline', className, ref: outerRef, ...props }: DurationInputProps) {
  const ref = useRef<HTMLInputElement>(null)
  const caret = useRef<number | null>(null)
  // A keystroke that changes nothing (a letter, a fifth digit) still re-renders, so the caret is put back.
  const [, rerender] = useReducer((n: number) => n + 1, 0)

  useLayoutEffect(() => {
    if (caret.current === null || !ref.current) return
    ref.current.setSelectionRange(caret.current, caret.current)
    caret.current = null
  })

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value
    const at = event.target.selectionStart ?? raw.length
    let digits = raw.replace(/\D/g, '')
    let before = raw.slice(0, at).replace(/\D/g, '').length
    // Erasing the colon erases the digit before it, so the colon itself never goes away.
    if (raw.length < value.length && digits === value.replace(/\D/g, '') && before > 0) {
      digits = digits.slice(0, before - 1) + digits.slice(before)
      before -= 1
    }
    digits = digits.slice(0, MAX_DIGITS)
    caret.current = caretAfter(Math.min(before, digits.length))
    const next = mask(digits)
    if (next === value) rerender()
    else onChange(next)
  }

  const shared = {
    ...props,
    ref: (node: HTMLInputElement | null) => {
      ref.current = node
      if (typeof outerRef === 'function') outerRef(node)
      else if (outerRef) outerRef.current = node
    },
    type: 'text',
    inputMode: 'numeric' as const,
    autoComplete: 'off',
    placeholder: props.placeholder ?? 'HH:MM',
    value,
    onChange: handleChange,
  }

  if (variant === 'field') return <Input {...shared} className={cn('font-mono tabular-nums', className)} />
  return (
    <input
      {...shared}
      data-slot="duration-input"
      className={cn(
        'h-5 w-14 rounded border border-input bg-card px-1 font-mono text-xs tabular-nums outline-none',
        'focus-visible:border-ring aria-invalid:border-destructive',
        className,
      )}
    />
  )
}
