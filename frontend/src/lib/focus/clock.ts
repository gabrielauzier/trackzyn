/**
 * The server's clock as this device estimates it (FOCUS-03). Every focus response carries `server_now`;
 * the difference to the local clock is measured on each one, so the timer and the `occurred_at` of the
 * offline queue stay right with the local clock minutes off.
 */
let offsetMs = 0

/** Records the difference between the server's clock (an ISO instant) and the local one. */
export function updateOffset(serverNow: string): void {
  offsetMs = Date.parse(serverNow) - Date.now()
}

/** Now on the server's clock, in epoch milliseconds. */
export function serverNow(): number {
  return Date.now() + offsetMs
}
