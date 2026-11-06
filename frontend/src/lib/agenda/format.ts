/** `HH:MM` of an instant in `timeZone`, two digits and 24 hours in every language (AGENDA-03). */
export function clockTime(instant: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(
    typeof instant === 'string' ? new Date(instant) : instant,
  )
}

/** `HH:MM` of a minute of the day, 0..1440. */
export function minuteClock(minute: number): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`
}
