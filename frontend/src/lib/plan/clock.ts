/** The minutes of an `HH:MM` field, or null while it holds no whole time (the `schedule-picker` pattern). */
export function clockMinutes(value: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(value)) return null
  const [hours, minutes] = value.split(':').map(Number)
  return hours! * 60 + minutes!
}
