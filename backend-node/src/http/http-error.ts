/**
 * An error that becomes `{"detail": <detail>}` with the given status, like FastAPI's HTTPException.
 * `extra` adds fields next to `detail`, such as the `code` of the focus errors.
 */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly detail: unknown,
    readonly headers: Record<string, string> = {},
    readonly extra: Record<string, unknown> = {},
  ) {
    super(typeof detail === 'string' ? detail : JSON.stringify(detail))
    this.name = 'HttpError'
  }
}

export const unauthorized = () => new HttpError(401, 'Unauthorized')
export const forbidden = (detail = 'Forbidden') => new HttpError(403, detail)
