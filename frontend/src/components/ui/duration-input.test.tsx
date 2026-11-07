import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'

import { DurationInput } from '@/components/ui/duration-input'
import { renderWithProviders } from '@/test/utils'

function Field({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial)
  return <DurationInput aria-label="Duration" value={value} onChange={setValue} />
}

describe('DurationInput', () => {
  it('is as wide as HH:MM, with no room left on the right', () => {
    renderWithProviders(<Field />)
    const input = screen.getByRole('textbox', { name: 'Duration' })

    // jsdom has no layout: the width is five monospace characters plus the padding (px-1) and the border.
    expect(input.className).toMatch(/(^|\s)w-\[calc\(5ch\+0\.5rem\+2px\)\](\s|$)/)
    expect(input).toHaveClass('font-mono', 'px-1', 'border')
    expect(input.className).not.toMatch(/(^|\s)w-14(\s|$)/)
  })

  it('as a form field, is as wide as HH:MM instead of the whole row', () => {
    renderWithProviders(<DurationInput variant="field" aria-label="Duration" value="" onChange={() => {}} />)
    const input = screen.getByRole('textbox', { name: 'Duration' })

    // Five characters of its own size, plus the Input's px-3 and its border; the Input's w-full is replaced.
    expect(input.className).toMatch(/(^|\s)w-\[calc\(5ch\+1\.5rem\+2px\)\](\s|$)/)
    expect(input.className).not.toMatch(/(^|\s)w-full(\s|$)/)
    expect(input).toHaveClass('font-mono', 'px-3', 'border')
  })

  it('accepts digits only and keeps the colon', async () => {
    const { user } = renderWithProviders(<Field />)
    const input = screen.getByRole('textbox', { name: 'Duration' })

    await user.type(input, '0a1:b3c0x')
    expect(input).toHaveValue('01:30')

    // No room past HH:MM.
    await user.type(input, '9')
    expect(input).toHaveValue('01:30')

    // The colon shows once the hours are typed, and the caret goes past it.
    await user.clear(input)
    await user.type(input, '02')
    expect(input).toHaveValue('02:')
    expect(input).toHaveProperty('selectionStart', 3)
    await user.type(input, '4')
    expect(input).toHaveValue('02:4')

    // Erasing over the colon takes the digit before it, and the colon stays fixed.
    await user.type(input, '{Backspace}')
    expect(input).toHaveValue('02:')
    await user.type(input, '{Backspace}')
    expect(input).toHaveValue('0')
  })

  it('shows a saved value as it is and takes a pasted HH:MM', async () => {
    const { user } = renderWithProviders(<Field initial="01:30" />)
    const input = screen.getByRole('textbox', { name: 'Duration' })
    expect(input).toHaveValue('01:30')
    expect(input).toHaveAttribute('inputmode', 'numeric')

    await user.clear(input)
    await user.paste('12:45')
    expect(input).toHaveValue('12:45')
  })
})
