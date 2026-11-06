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
