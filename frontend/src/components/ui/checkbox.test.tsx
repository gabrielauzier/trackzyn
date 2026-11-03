import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'

import { Checkbox } from '@/components/ui/checkbox'
import { renderWithProviders } from '@/test/utils'

function Controlled() {
  const [checked, setChecked] = useState(false)
  return <Checkbox aria-label="Done" checked={checked} onCheckedChange={(value) => setChecked(value === true)} />
}

describe('Checkbox', () => {
  it('exposes the checkbox role and its state', () => {
    renderWithProviders(<Controlled />)

    const box = screen.getByRole('checkbox', { name: 'Done' })
    expect(box).toHaveAttribute('aria-checked', 'false')
  })

  it('toggles on click', async () => {
    const { user } = renderWithProviders(<Controlled />)
    const box = screen.getByRole('checkbox', { name: 'Done' })

    await user.click(box)
    expect(box).toHaveAttribute('aria-checked', 'true')

    await user.click(box)
    expect(box).toHaveAttribute('aria-checked', 'false')
  })

  it('toggles from the keyboard with Space', async () => {
    const { user } = renderWithProviders(<Controlled />)
    const box = screen.getByRole('checkbox', { name: 'Done' })

    await user.tab()
    expect(box).toHaveFocus()
    await user.keyboard(' ')
    expect(box).toHaveAttribute('aria-checked', 'true')
  })
})
