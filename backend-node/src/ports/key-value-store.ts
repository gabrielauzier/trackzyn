/**
 * Short-lived shared state: 2FA temp tokens, OIDC state, WebAuthn challenges and the
 * rate-limit windows. Redis in deployments, memory in tests and in the desktop app.
 *
 * Values are strings (the callers store JSON); every implementation must give the same
 * answers, which test/ports/key-value-store.test.ts asserts for each of them.
 */
export interface KeyValueStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string, options?: { ttlSeconds?: number }): Promise<void>
  /** Reads and removes in one step: the first caller gets the value, any later one `null`. */
  getdel(key: string): Promise<string | null>
  del(key: string): Promise<void>
  /**
   * Sliding-window hit: drops entries at or before `nowSeconds - windowSeconds`, counts what
   * is left, records this call at `nowSeconds`, and returns the count from *before* it was
   * recorded. Atomic.
   */
  rateLimitHit(key: string, nowSeconds: number, windowSeconds: number): Promise<number>
  close(): Promise<void>
}
