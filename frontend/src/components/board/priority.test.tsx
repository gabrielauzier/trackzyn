import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'

import { PriorityIcon, PrioritySelect } from '@/components/board/priority'
import { i18n, renderWithProviders } from '@/test/utils'

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR')
})
afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('PriorityIcon (PRI-02, PRI-03)', () => {
  it.each([
    ['low', 'Prioridade baixa', 'text-blue-500', 'lucide-chevron-down'],
    ['medium', 'Prioridade média', 'text-amber-500', 'lucide-equal'],
    ['high', 'Prioridade alta', 'text-orange-500', 'lucide-chevron-up'],
    ['ultra', 'Prioridade ultra', 'text-rose-500', 'lucide-chevrons-up'],
  ] as const)('%s shows its icon and color, with the name as the accessible label and tooltip', (priority, label, color, icon) => {
    renderWithProviders(<PriorityIcon priority={priority} />)

    const shown = screen.getByRole('img', { name: label })
    expect(shown).toHaveClass(color)
    expect(shown).toHaveClass(icon)
    expect(shown.querySelector('title')).toHaveTextContent(label)
  })

  it('PRI-03 none renders nothing', () => {
    const { container } = renderWithProviders(<PriorityIcon priority="none" />)

    expect(container).toBeEmptyDOMElement()
  })
})

describe('PrioritySelect (PRI-04)', () => {
  it('lists the five priorities, each with its icon, and answers the one picked', async () => {
    const onChange = vi.fn()
    const { user } = renderWithProviders(<PrioritySelect value="none" onChange={onChange} aria-label="Prioridade" />)

    expect(screen.getByRole('combobox', { name: 'Prioridade' })).toHaveTextContent('Nenhuma')
    await user.click(screen.getByRole('combobox', { name: 'Prioridade' }))
    const options = await screen.findAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual(['Nenhuma', 'Baixa', 'Média', 'Alta', 'Ultra'])
    // The icon is beside the name, decorative there: the name says it.
    expect(options[0]!.querySelector('svg.lucide-chevron-down, svg.lucide-equal, svg.lucide-chevron-up, svg.lucide-chevrons-up')).toBeNull()
    expect(options[1]!.querySelector('svg.lucide-chevron-down.text-blue-500')).not.toBeNull()
    expect(options[2]!.querySelector('svg.lucide-equal.text-amber-500')).not.toBeNull()
    expect(options[3]!.querySelector('svg.lucide-chevron-up.text-orange-500')).not.toBeNull()
    expect(options[4]!.querySelector('svg.lucide-chevrons-up.text-rose-500')).not.toBeNull()

    await user.click(screen.getByRole('option', { name: 'Alta' }))
    expect(onChange).toHaveBeenCalledWith('high')
  })

  it('shows the chosen priority with its icon on the trigger', () => {
    renderWithProviders(<PrioritySelect value="ultra" onChange={vi.fn()} aria-label="Prioridade" />)

    const trigger = screen.getByRole('combobox', { name: 'Prioridade' })
    expect(trigger).toHaveTextContent('Ultra')
    expect(trigger.querySelector('svg.lucide-chevrons-up.text-rose-500')).not.toBeNull()
  })
})
