import { APP_ORIGIN } from './app-protocol'

interface SenderFrame {
  url: string
}

export interface IpcLike {
  handle(channel: string, listener: (event: { senderFrame?: SenderFrame | null }, ...args: unknown[]) => unknown): unknown
}

/**
 * Registers an `ipcMain.handle` listener that refuses any caller whose frame
 * was not served from app://launchkit/, before the handler runs.
 */
export function trustedHandle<Args extends unknown[], Result>(
  ipc: IpcLike,
  channel: string,
  handler: (event: unknown, ...args: Args) => Result,
): void {
  ipc.handle(channel, (event: { senderFrame?: SenderFrame | null }, ...args: unknown[]) => {
    const url = event.senderFrame?.url
    if (typeof url !== 'string' || !url.startsWith(`${APP_ORIGIN}/`)) {
      throw new Error(`Untrusted sender for ${channel}`)
    }
    return handler(event, ...(args as unknown as Args))
  })
}
