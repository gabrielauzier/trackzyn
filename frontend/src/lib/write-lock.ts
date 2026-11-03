let blocked = false

/** While the desktop app exports its data the client sends no writes (see `ExportModal`). */
export function setWritesBlocked(value: boolean): void {
  blocked = value
}

export function writesBlocked(): boolean {
  return blocked
}
