import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'

import { ElsewhereDialog } from '@/components/focus/elsewhere-dialog'
import { i18n, renderWithProviders } from '@/test/utils'

const TASK = 'task-a'

/** The focus page keeps the refused task until the dialog closes. */
function Harness({ start }: { start: (taskId: string, takeover: boolean) => void }) {
  const [taskId, setTaskId] = useState<string | null>(TASK)
  return <ElsewhereDialog taskId={taskId} onTakeOver={start} onClose={() => setTaskId(null)} />
}

describe('ElsewhereDialog (SYNC-02, SYNC-03, SYNC-04)', () => {
  it('says focus is running on another device, with Take over and Cancel', () => {
    renderWithProviders(<Harness start={vi.fn()} />)

    const dialog = screen.getByRole('dialog', { name: 'You are already focusing on another device.' })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Take over' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('sends start again with takeover from Take over, and closes', async () => {
    const start = vi.fn()
    const { user } = renderWithProviders(<Harness start={start} />)

    await user.click(screen.getByRole('button', { name: 'Take over' }))

    expect(start).toHaveBeenCalledTimes(1)
    expect(start).toHaveBeenCalledWith(TASK, true)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes from Cancel without any action', async () => {
    const start = vi.fn()
    const { user } = renderWithProviders(<Harness start={start} />)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(start).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the message in Portuguese', async () => {
    await i18n.changeLanguage('pt-BR')
    try {
      renderWithProviders(<Harness start={vi.fn()} />)

      expect(screen.getByRole('dialog', { name: 'Você já está focando em outro dispositivo.' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Assumir' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
    } finally {
      await i18n.changeLanguage('en')
    }
  })
})
