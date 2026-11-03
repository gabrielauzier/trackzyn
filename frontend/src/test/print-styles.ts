/**
 * The print rules of `index.css` (REPORT-23), for tests.
 *
 * jsdom does not apply `@media print`, so the tests install the real rules
 * from `index.css` themselves: the top-level `.print-*` rules always, and the
 * body of `@media print` only for the printed page. A test then reads the
 * computed `display`, which breaks when either the class or the rule goes away.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

interface Block {
  prelude: string
  body: string
}

/** The top-level `prelude { body }` blocks of a stylesheet, comments removed. */
function topLevelBlocks(css: string): Block[] {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const blocks: Block[] = []
  let depth = 0
  let start = 0
  let open = 0
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (char === ';' && depth === 0) start = i + 1
    if (char === '{') {
      if (depth === 0) open = i
      depth++
    }
    if (char === '}') {
      depth--
      if (depth === 0) {
        blocks.push({ prelude: source.slice(start, open).trim(), body: source.slice(open + 1, i) })
        start = i + 1
      }
    }
  }
  return blocks
}

export const indexCss = readFileSync(path.resolve(import.meta.dirname, '../index.css'), 'utf8')

/** The `.print-*` rules outside any media query, plus the body of `@media print` when `media` is `print`. */
export function printRules(media: 'screen' | 'print'): string {
  const blocks = topLevelBlocks(indexCss)
  const screen = blocks.filter((b) => b.prelude.startsWith('.print-')).map((b) => `${b.prelude} {${b.body}}`)
  const print = blocks.filter((b) => b.prelude === '@media print').map((b) => b.body)
  return [...screen, ...(media === 'print' ? print : [])].join('\n')
}

/** Installs the print rules of `index.css` for `media`; returns the cleanup. */
export function installPrintStyles(media: 'screen' | 'print'): () => void {
  const style = document.createElement('style')
  style.textContent = printRules(media)
  document.head.appendChild(style)
  return () => style.remove()
}
