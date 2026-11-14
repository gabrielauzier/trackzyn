import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'

import { CardFieldsSettings } from '@/components/board/card-fields-settings'
import { cardFields } from '@/lib/api'
import { i18n, renderWithProviders } from '@/test/utils'
import { toast } from 'sonner'

vi.mock('@/lib/api', () => ({ cardFields: { get: vi.fn(), set: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const LIST = '11111111-1111-4111-8111-111111111111'

beforeEach(async () => {
  vi.clearAllMocks()
  await i18n.changeLanguage('pt-BR')
  vi.mocked(cardFields.get).mockResolvedValue({ hidden: [] })
})
afterEach(async () => {
  await i18n.changeLanguage('en')
})

const switchOf = (name: string) => screen.getByRole('switch', { name })

describe('CardFieldsSettings (FIELDS-02, FIELDS-03, FIELDS-04)', () => {
  it('FIELDS-02 the gear opens Campos do card with the four switches, all on by default, and the note', async () => {
    const { user } = renderWithProviders(<CardFieldsSettings listId={LIST} />)

    await user.click(screen.getByRole('button', { name: 'Campos do card' }))

    expect(await screen.findByRole('heading', { name: 'Campos do card' })).toBeInTheDocument()
    await waitFor(() => expect(cardFields.get).toHaveBeenCalledWith(LIST))
    expect(screen.getAllByRole('switch')).toHaveLength(4)
    for (const name of ['Prioridade', 'Prazo', 'Flag', 'Aguardando']) expect(switchOf(name)).toBeChecked()
    expect(screen.getByText('Nome, estimativa e tempo registrado aparecem sempre.')).toBeInTheDocument()
  })

  it('FIELDS-03 shows off the fields the server keeps hidden', async () => {
    vi.mocked(cardFields.get).mockResolvedValue({ hidden: ['flag', 'waiting'] })
    const { user } = renderWithProviders(<CardFieldsSettings listId={LIST} />)

    await user.click(screen.getByRole('button', { name: 'Campos do card' }))

    await waitFor(() => expect(switchOf('Flag')).not.toBeChecked())
    expect(switchOf('Aguardando')).not.toBeChecked()
    expect(switchOf('Prioridade')).toBeChecked()
    expect(switchOf('Prazo')).toBeChecked()
  })

  it('FIELDS-04 turning Prazo off saves hidden: ["due"] for this list', async () => {
    vi.mocked(cardFields.set).mockResolvedValue({ hidden: ['due'] })
    const { user } = renderWithProviders(<CardFieldsSettings listId={LIST} />)
    await user.click(screen.getByRole('button', { name: 'Campos do card' }))
    await waitFor(() => expect(switchOf('Prazo')).toBeEnabled())

    await user.click(switchOf('Prazo'))

    expect(cardFields.set).toHaveBeenCalledWith(LIST, ['due'])
    expect(switchOf('Prazo')).not.toBeChecked()
  })

  it('turning a field back on saves without it, keeping the others hidden', async () => {
    vi.mocked(cardFields.get).mockResolvedValue({ hidden: ['priority', 'due'] })
    vi.mocked(cardFields.set).mockResolvedValue({ hidden: ['due'] })
    const { user } = renderWithProviders(<CardFieldsSettings listId={LIST} />)
    await user.click(screen.getByRole('button', { name: 'Campos do card' }))
    await waitFor(() => expect(switchOf('Prioridade')).not.toBeChecked())

    await user.click(switchOf('Prioridade'))

    expect(cardFields.set).toHaveBeenCalledWith(LIST, ['due'])
  })

  it('a failed save puts the switch back and shows the error', async () => {
    vi.mocked(cardFields.set).mockRejectedValue(new Error('offline'))
    const { user } = renderWithProviders(<CardFieldsSettings listId={LIST} />)
    await user.click(screen.getByRole('button', { name: 'Campos do card' }))
    await waitFor(() => expect(switchOf('Prazo')).toBeEnabled())

    await user.click(switchOf('Prazo'))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(switchOf('Prazo')).toBeChecked()
  })
})
