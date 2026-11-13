import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '@/test/utils'
import { TaskTile } from './task-tile'

const work = { id: 'l1', name: 'Work', color: 3 }

/** The outer card of the tile. */
const card = () => document.querySelector<HTMLElement>('[data-task-tile]')!
const dot = () => card().querySelector<HTMLElement>('[data-slot="tile-dot"]')

describe('TaskTile', () => {
  describe('pending (HOJE-24)', () => {
    it('draws the card of the plan side list: 1px edge, 8px corners, list dot, title, meta line and estimate pill', () => {
      renderWithProviders(<TaskTile variant="pending" title="Review the PR" list={work} meta={['3/5 subtasks']} estimateMinutes={90} />)
      expect(card()).toHaveClass('border', 'rounded-md')
      expect(dot()).toHaveStyle({ backgroundColor: 'var(--chart-3)' })
      expect(screen.getByText('Review the PR')).toBeInTheDocument()
      expect(screen.getByText('Work · 3/5 subtasks')).toBeInTheDocument()
      expect(screen.getByText('1hr 30min')).toBeInTheDocument()
    })

    it('says No estimate in the pill when the task has none', () => {
      renderWithProviders(<TaskTile variant="pending" title="Call the bank" list={work} estimateMinutes={null} />)
      expect(screen.getByText('Work')).toBeInTheDocument()
      expect(screen.getByText('No estimate')).toBeInTheDocument()
    })

    it('is not amber', () => {
      renderWithProviders(<TaskTile variant="pending" title="Review the PR" list={work} estimateMinutes={90} />)
      expect(card().className).not.toMatch(/amber/)
    })
  })

  describe('late (HOJE-27)', () => {
    it('draws the edge and the start time in amber', () => {
      renderWithProviders(
        <TaskTile variant="late" title="Review the PR" list={work} alert="13:00 · 1hr 20min ago" estimateMinutes={90} />,
      )
      expect(card()).toHaveClass('border-amber-500')
      expect(screen.getByText('13:00 · 1hr 20min ago')).toHaveClass('text-amber-600')
      expect(dot()).toBeInTheDocument()
    })
  })

  describe('done (HOJE-37)', () => {
    it('has a light gray fill and the done icon instead of the dot', () => {
      renderWithProviders(
        <TaskTile variant="done" title="Send the report" list={work} meta={['25min of 30min']} verdict={{ verdict: 'early', diff_seconds: -300 }} />,
      )
      expect(card()).toHaveClass('bg-muted/50')
      expect(dot()).toBeNull()
      expect(card().querySelector('[data-slot="tile-done-icon"]')).toBeInTheDocument()
      expect(screen.getByText('Work · 25min of 30min')).toBeInTheDocument()
    })

    it('draws an early badge in green with the difference', () => {
      renderWithProviders(<TaskTile variant="done" title="Send the report" list={work} verdict={{ verdict: 'early', diff_seconds: -300 }} />)
      expect(screen.getByText('5min early')).toHaveClass('text-status-good')
    })

    it('draws an on-time badge in green', () => {
      renderWithProviders(<TaskTile variant="done" title="Send the report" list={work} verdict={{ verdict: 'on_time', diff_seconds: 60 }} />)
      expect(screen.getByText('On time')).toHaveClass('text-status-good')
    })

    it('draws a late badge in red with the difference', () => {
      renderWithProviders(<TaskTile variant="done" title="Send the report" list={work} verdict={{ verdict: 'late', diff_seconds: 2400 }} />)
      expect(screen.getByText('40min late')).toHaveClass('text-status-critical')
    })

    it('draws no badge without a verdict and no estimate pill', () => {
      renderWithProviders(<TaskTile variant="done" title="Send the report" list={work} meta={['25min']} verdict={null} />)
      expect(screen.queryByText(/early|late|On time/)).toBeNull()
      expect(screen.queryByText('No estimate')).toBeNull()
    })
  })

  describe('ghost', () => {
    it('has a dashed edge and no list dot', () => {
      renderWithProviders(<TaskTile variant="ghost" title="3 tasks in This week without a day" />)
      expect(card()).toHaveClass('border-dashed')
      expect(dot()).toBeNull()
      expect(screen.getByText('3 tasks in This week without a day')).toBeInTheDocument()
    })
  })

  describe('opening', () => {
    it('is a button reachable by the keyboard when it opens something', async () => {
      const onOpen = vi.fn()
      const { user } = renderWithProviders(<TaskTile variant="pending" title="Review the PR" list={work} estimateMinutes={90} onOpen={onOpen} />)
      const button = screen.getByRole('button', { name: /Review the PR/ })
      await user.tab()
      expect(button).toHaveFocus()
      await user.keyboard('{Enter}')
      expect(onOpen).toHaveBeenCalledTimes(1)
    })

    it('is not a button without onOpen', () => {
      renderWithProviders(<TaskTile variant="pending" title="Review the PR" list={work} estimateMinutes={90} />)
      expect(screen.queryByRole('button')).toBeNull()
    })
  })
})
