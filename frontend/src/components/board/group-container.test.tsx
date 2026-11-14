import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'

import { GroupContainer } from '@/components/board/group-container'
import { TaskCard } from '@/components/board/task-card'
import type { CardFieldsState } from '@/lib/board/card-fields'
import { i18n, renderWithProviders, PLAIN_TASK_FIELDS } from '@/test/utils'
import type { TaskCardView } from '@/types'

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

describe('GroupContainer with Campos do card (FIELDS-06)', () => {
  const ALL: CardFieldsState = { priority: true, due: true, flag: true, waiting: true }
  const LOADED: TaskCardView = {
    ...PLAIN_TASK_FIELDS,
    id: '11111111-1111-4111-8111-111111111111',
    title: 'DEV-1',
    estimate_minutes: 60,
    spent_seconds: 0,
    position: 0,
    subtasks: { done: 0, total: 0 },
    created_via: null,
    scheduled_on: null,
    scheduled_time: null,
    series: null,
    group_id: GROUP.id,
    priority: 'high',
    due_on: '2099-01-01',
    waiting: true,
    waiting_for: 'QA',
    flagged: true,
    flag_reason: 'Bloqueada',
  }
  const show = (fields: CardFieldsState) =>
    renderWithProviders(
      <GroupContainer group={GROUP} count={1}>
        <TaskCard task={LOADED} column="this_week" fields={fields} canWrite onOpen={vi.fn()} />
      </GroupContainer>,
    )
  const container = () => within(screen.getByRole('group', { name: 'Grupo Pipeline de scripts' }))
  const shown = {
    priority: () => container().queryByRole('img', { name: 'Prioridade alta' }),
    due: () => container().queryByText(/^Prazo /),
    flag: () => container().queryByText('Bloqueada'),
    waiting: () => container().queryByText('Aguardando · QA'),
  }

  it('with every field on, the cards inside show the four fields', () => {
    show(ALL)
    for (const [field, find] of Object.entries(shown)) expect(find(), field).toBeInTheDocument()
  })

  it.each(Object.keys(shown) as Array<keyof typeof shown>)('with %s off, the cards inside hide it and the container still shows', (field) => {
    show({ ...ALL, [field]: false })

    expect(container().getByText('Pipeline de scripts')).toBeInTheDocument()
    expect(container().getByText('1 tarefa')).toBeInTheDocument()
    expect(container().getByRole('button', { name: 'DEV-1' })).toBeInTheDocument()
    expect(shown[field]()).not.toBeInTheDocument()
    for (const [other, find] of Object.entries(shown)) if (other !== field) expect(find(), other).toBeInTheDocument()
  })
})
