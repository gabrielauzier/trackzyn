/** Why an `HH:MM` estimate is refused: not a whole HH:MM, minutes above 59, or outside 00:01 to 24:00. */
export type DurationError = 'format' | 'minutes' | 'limit'

/** The locale key of each refusal: the same messages on the card, the task dialog and the forms. */
export const DURATION_ERROR_KEY: Record<DurationError, string> = {
  format: 'board.estimateFormat',
  minutes: 'board.estimateMinutesRange',
  limit: 'board.estimateLimit',
}

const MAX_MINUTES = 24 * 60

/** An `HH:MM` estimate as minutes (null when empty), from 00:01 to 24:00 with minutes up to 59. */
export function parseDuration(value: string): { minutes: number | null } | { error: DurationError } {
  const text = value.trim()
  if (text === '') return { minutes: null }
  const match = /^(\d{2}):(\d{2})$/.exec(text)
  if (!match) return { error: 'format' }
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (minutes > 59) return { error: 'minutes' }
  const total = hours * 60 + minutes
  if (total < 1 || total > MAX_MINUTES) return { error: 'limit' }
  return { minutes: total }
}

/** Minutes as `HH:MM`; no estimate is an empty field. */
export function toDuration(minutes: number | null): string {
  if (minutes === null) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
}

/** A validated `HH:MM` estimate as the API takes it: minutes, or null when empty. */
export function durationMinutes(value: string): number | null {
  const parsed = parseDuration(value)
  return 'minutes' in parsed ? parsed.minutes : null
}
