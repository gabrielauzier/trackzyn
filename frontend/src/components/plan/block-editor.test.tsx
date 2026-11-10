import { useReducer, useState } from 'react'
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { draftReducer, emptyDraft, type DraftBlock } from '@/lib/plan/draft'
import { i18n, renderWithProviders } from '@/test/utils'
import type { PlanBlock, PlanTaskRef } from '@/types'
import { BlockEditor } from './block-editor'

const work = { id: 'l1', name: 'Work', color: 4 }
const home = { id: 'l2', name: 'Home', color: 3 }
const study: PlanTaskRef = { id: 't1', title: 'Study module 4', list: work, done: false, scheduled_on: null, estimate_minutes: 90 }

const saved: PlanBlock[] = [
  { id: 'b1', kind: 'task', start: '16:15', minutes: 90, task: study },
  { id: 'b2', kind: 'break', start: '12:00', minutes: 60, name: 'Lunch', list: work },
]

/** The editor over a real draft: what it changes shows in the blocks below. */
function Harness({ openKey, readOnly = false, onClose = vi.fn() }: { openKey: string; readOnly?: boolean; onClose?: () => void }) {
  const [state, dispatch] = useReducer(draftReducer, draftReducer(emptyDraft, { type: 'reset', saved }))
  const [key, setKey] = useState<string | null>(openKey)
  const block = state.blocks.find((item) => item.key === key) ?? null
  return (
    <>
      <BlockEditor
        block={block}
        lists={[work, home]}
        error={state.error}
        readOnly={readOnly}
        onEdit={(change) => dispatch({ type: 'edit', key: key!, ...change })}
        onRemove={() => {
          dispatch({ type: 'remove', key: key! })
          setKey(null)
        }}
        onClose={() => {
          onClose()
          setKey(null)
        }}
      />
      <output data-testid="blocks">{JSON.stringify(state.blocks)}</output>
    </>
  )
}

const blocks = (): DraftBlock[] => JSON.parse(screen.getByTestId('blocks').textContent!)
const blockOf = (key: string) => blocks().find((block) => block.key === key)

describe('BlockEditor (PLAN-06)', () => {
  it('shows the title, the list and the estimate, with the start and the length in HH:MM', () => {
    renderWithProviders(<Harness openKey="b1" />)
    expect(screen.getByRole('dialog', { name: 'Study module 4' })).toHaveTextContent('Work · estimate 1hr 30min')
    expect(screen.getByLabelText('Start')).toHaveValue('16:15')
    expect(screen.getByLabelText('Duration')).toHaveValue('01:30')
  })

  it('changes the start and the length of the block only, keeping the estimate of the task', () => {
    renderWithProviders(<Harness openKey="b1" />)
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '14:00' } })
    fireEvent.change(screen.getByLabelText('Duration'), { target: { value: '02:15' } })
    expect(blockOf('b1')).toMatchObject({ start: 840, minutes: 135, task: { estimate_minutes: 90 } })
    expect(blockOf('b2')).toMatchObject({ start: 720, minutes: 60 })
    expect(screen.getByLabelText('Duration')).toHaveValue('02:15')
  })

  it('says the length is only for this plan and the estimate stays the same', async () => {
    await i18n.changeLanguage('pt-BR')
    try {
      renderWithProviders(<Harness openKey="b1" />)
      expect(document.querySelector('[data-slot="keeps-estimate"]')).toHaveTextContent(
        'A duração vale só para este plano. A estimativa da tarefa continua 1h 30min.',
      )
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('takes the block out of the draft with Tirar do plano', async () => {
    await i18n.changeLanguage('pt-BR')
    try {
      const { user } = renderWithProviders(<Harness openKey="b1" />)
      await user.click(screen.getByRole('button', { name: 'Tirar do plano' }))
      expect(blocks().map((block) => block.key)).toEqual(['b2'])
      expect(screen.queryByRole('dialog')).toBeNull()
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('closes on Esc and on Done, changing nothing', async () => {
    const onClose = vi.fn()
    const { user } = renderWithProviders(<Harness openKey="b1" onClose={onClose} />)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(blocks().map((block) => [block.key, block.start, block.minutes])).toEqual([
      ['b1', 975, 90],
      ['b2', 720, 60],
    ])
  })

  it('closes on Done', async () => {
    const onClose = vi.fn()
    const { user } = renderWithProviders(<Harness openKey="b1" onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('only shows the fields of a past day, without Tirar do plano (PLAN-34)', () => {
    renderWithProviders(<Harness openKey="b1" readOnly />)
    expect(screen.getByLabelText('Start')).toBeDisabled()
    expect(screen.getByLabelText('Duration')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Remove from plan' })).toBeNull()
  })
})

describe('BlockEditor of a break (PLAN-17, PLAN-18)', () => {
  it('refuses a length out of 5 min to 2h with A pausa vai de 5 min a 2h and keeps the length before', async () => {
    await i18n.changeLanguage('pt-BR')
    try {
      renderWithProviders(<Harness openKey="b2" />)
      fireEvent.change(screen.getByLabelText('Duração'), { target: { value: '02:30' } })
      expect(screen.getByRole('alert')).toHaveTextContent('A pausa vai de 5 min a 2h')
      expect(blockOf('b2')!.minutes).toBe(60)
      expect(screen.getByLabelText('Duração')).toHaveValue('01:00')
      fireEvent.change(screen.getByLabelText('Duração'), { target: { value: '00:04' } })
      expect(blockOf('b2')!.minutes).toBe(60)
      fireEvent.change(screen.getByLabelText('Duração'), { target: { value: '00:30' } })
      expect(blockOf('b2')!.minutes).toBe(30)
      expect(screen.queryByRole('alert')).toBeNull()
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('shows the list of the Intervalo and changes it', async () => {
    const { user } = renderWithProviders(<Harness openKey="b2" />)
    expect(screen.getByRole('combobox', { name: 'Break list' })).toHaveTextContent('Work')
    await user.click(screen.getByRole('combobox', { name: 'Break list' }))
    await user.click(await screen.findByRole('option', { name: 'Home' }))
    expect(blockOf('b2')).toMatchObject({ kind: 'break', list: home })
  })

  it('says nothing about an estimate', () => {
    renderWithProviders(<Harness openKey="b2" />)
    expect(document.querySelector('[data-slot="keeps-estimate"]')).toBeNull()
  })
})
