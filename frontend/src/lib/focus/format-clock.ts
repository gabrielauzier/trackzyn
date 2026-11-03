/** `HH:MM:SS` of a whole number of seconds; hours keep growing past 99. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`
}
