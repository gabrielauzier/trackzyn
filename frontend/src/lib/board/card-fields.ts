import { useQuery } from '@tanstack/react-query'

import { cardFields } from '@/lib/api'
import type { CardField } from '@/types'

/** The fields of the board card each user can turn off (AD-011), in the order of the popover. */
export const CARD_FIELDS: readonly CardField[] = ['priority', 'due', 'flag', 'waiting']

/** Which new fields the card shows; name, estimate and time spent always show (FIELDS-01). */
export type CardFieldsState = Record<CardField, boolean>

/** Every field on: the default while the user has not chosen (FIELDS-03). */
export const ALL_CARD_FIELDS: CardFieldsState = { priority: true, due: true, flag: true, waiting: true }

/** The fields shown, from the hidden ones the server keeps. */
export const shownFields = (hidden: readonly CardField[]): CardFieldsState =>
  Object.fromEntries(CARD_FIELDS.map((field) => [field, !hidden.includes(field)])) as CardFieldsState

/** The query key of the user's card fields of a list, under `lists` like the board. */
export const cardFieldsKey = (listId: string) => ['lists', listId, 'card-fields'] as const

/** The new fields the user shows on the board of `listId`: all on until the server answers (FIELDS-03). */
export function useCardFields(listId: string): { fields: CardFieldsState; hidden: CardField[] | undefined } {
  const { data } = useQuery({ queryKey: cardFieldsKey(listId), queryFn: () => cardFields.get(listId) })
  return { fields: data ? shownFields(data.hidden) : ALL_CARD_FIELDS, hidden: data?.hidden }
}
