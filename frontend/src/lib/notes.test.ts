import { describe, expect, it } from 'vitest'
import { notesToHtml, notesToText } from '@/lib/notes'

describe('notes', () => {
  it('shows a plain-text note as one paragraph per line, escaped', () => {
    expect(notesToHtml('one\n<b>two</b>')).toBe('<p>one</p><p>&lt;b&gt;two&lt;/b&gt;</p>')
  })

  it('keeps a note that is already HTML, and an empty one empty', () => {
    expect(notesToHtml('<p>Hi</p>')).toBe('<p>Hi</p>')
    expect(notesToHtml('  ')).toBe('')
  })

  it('reads the text of a formatted note, line by line', () => {
    expect(notesToText('<p>Hello <strong>you</strong> &amp; me</p><ul><li><p>a</p></li><li><p>b</p></li></ul>')).toBe(
      'Hello you & me\na\nb',
    )
    expect(notesToText('plain <b>text</b>')).toBe('plain <b>text</b>')
  })
})
