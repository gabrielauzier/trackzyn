import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'

import { GroupContainer } from '@/components/board/group-container'
import { i18n, renderWithProviders } from '@/test/utils'

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR')
})
afterEach(async () => {
  await i18n.changeLanguage('en')
})

const GROUP = { id: 'g1', name: 'Pipeline de scripts', priority: 'none' as const, due_on: null }

describe('GroupContainer (GRP-04)', () => {
  it('shows the name and <n> tarefas on top, and the cards inside', () => {
    renderWithProviders(
      <GroupContainer group={GROUP} count={3}>
        <p>DEV-1</p>
        <p>DEV-2</p>
        <p>DEV-3</p>
      </GroupContainer>,
    )

    const container = screen.getByRole('group', { name: 'Grupo Pipeline de scripts' })
    expect(container).toHaveTextContent(/^Pipeline de scripts3 tarefasDEV-1DEV-2DEV-3$/)
    expect(screen.getByText('3 tarefas')).toBeInTheDocument()
  })

  it('counts one task in the singular', () => {
    renderWithProviders(
      <GroupContainer group={GROUP} count={1}>
        <p>DEV-1</p>
      </GroupContainer>,
    )

    expect(screen.getByText('1 tarefa')).toBeInTheDocument()
  })
})
