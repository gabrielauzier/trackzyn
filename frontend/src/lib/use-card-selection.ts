import { useEffect, useState } from 'react'

/**
 * Where a press does not count as leaving the selected card: what a card opens outside itself, such as
 * its menu, a submenu, a dialog or a tooltip, all portaled to the end of the page.
 */
const OPENED_BY_A_CARD = '[data-radix-popper-content-wrapper], [role="menu"], [role="dialog"], [role="alertdialog"]'

/**
 * The card a press last landed in, among the elements carrying `attribute` (its value is the card's id).
 * A press anywhere in a card selects it, its buttons included, so the selection outlives the focus those
 * buttons and their menus take. A press outside every card and what they open clears it.
 * `select` lets the keyboard select a card it reaches.
 */
export function useCardSelection(attribute: string) {
  const [selected, select] = useState<string | null>(null)

  useEffect(() => {
    const onPress = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return
      const card = event.target.closest(`[${attribute}]`)
      if (card) {
        select(card.getAttribute(attribute))
        return
      }
      if (event.target.closest(OPENED_BY_A_CARD)) return
      select(null)
    }
    // Capture: the selection follows a press even where a control stops it from bubbling.
    document.addEventListener('pointerdown', onPress, true)
    return () => document.removeEventListener('pointerdown', onPress, true)
  }, [attribute])

  return { selected, select }
}
