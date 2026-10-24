/** An empty estimate is allowed; otherwise a whole number of minutes from 1 to 1440. */
export function isValidEstimate(value: string): boolean {
  const text = value.trim()
  if (text === '') return true
  if (!/^\d+$/.test(text)) return false
  const minutes = Number(text)
  return minutes >= 1 && minutes <= 1440
}

/** The estimate field's text as the API takes it: minutes, or null when empty. */
export function toEstimate(value: string): number | null {
  const text = value.trim()
  return text === '' ? null : Number(text)
}
