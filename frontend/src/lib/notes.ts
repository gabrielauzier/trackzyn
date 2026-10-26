const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Notes are kept as the editor's HTML. A note written before the editor is plain text, one paragraph
 * per line, and is shown the same way.
 */
export function notesToHtml(notes: string): string {
  if (notes.trim() === '') return ''
  if (/^\s*<(p|ul|ol)[\s>]/i.test(notes)) return notes
  return notes
    .split('\n')
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('')
}

/** The text of a note without its formatting, one line per paragraph or list item. */
export function notesToText(notes: string): string {
  if (!/^\s*<(p|ul|ol)[\s>]/i.test(notes)) return notes
  return notes
    .replace(/<\/(p|li)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\n{2,}/g, '\n')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim()
}
