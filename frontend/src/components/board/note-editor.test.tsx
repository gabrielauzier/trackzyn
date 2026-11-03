import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'

import { NoteEditor } from '@/components/board/note-editor'
import { placeCaretAtEnd, renderWithProviders } from '@/test/utils'

describe('NoteEditor', () => {
  it('offers bold, italic, underline, both lists, undo and redo', async () => {
    renderWithProviders(<NoteEditor value="" onChange={vi.fn()} aria-label="Notes" />)

    const toolbar = await screen.findByRole('toolbar', { name: 'Text formatting' })
    expect(Array.from(toolbar.querySelectorAll('button'), (button) => button.getAttribute('aria-label'))).toEqual([
      'Bold',
      'Italic',
      'Underline',
      'Bulleted list',
      'Numbered list',
      'Undo',
      'Redo',
    ])
  })

  it('shows a plain-text note as a paragraph per line, without calling it a change', async () => {
    const onChange = vi.fn()
    renderWithProviders(<NoteEditor value={'first\nsecond'} onChange={onChange} aria-label="Notes" />)

    const notes = await screen.findByRole('textbox', { name: 'Notes' })
    expect(Array.from(notes.querySelectorAll('p'), (paragraph) => paragraph.textContent)).toEqual(['first', 'second'])
    expect(onChange).not.toHaveBeenCalled()
  })

  it('makes a bulleted list and reports the HTML', async () => {
    const onChange = vi.fn()
    const { user } = renderWithProviders(<NoteEditor value="" onChange={onChange} aria-label="Notes" />)
    const notes = await screen.findByRole('textbox', { name: 'Notes' })

    placeCaretAtEnd(notes)
    await user.click(screen.getByRole('button', { name: 'Bulleted list' }))
    expect(screen.getByRole('button', { name: 'Bulleted list' })).toHaveAttribute('aria-pressed', 'true')
    await user.paste('milk')

    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(expect.stringContaining('<ul><li><p>milk</p></li></ul>')))
  })

  it('is read-only without the toolbar when it cannot be edited', async () => {
    renderWithProviders(<NoteEditor value="<p>Kept</p>" onChange={vi.fn()} editable={false} aria-label="Notes" />)

    const notes = await screen.findByRole('textbox', { name: 'Notes' })
    expect(notes).toHaveTextContent('Kept')
    expect(notes).toHaveAttribute('contenteditable', 'false')
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
  })
})
