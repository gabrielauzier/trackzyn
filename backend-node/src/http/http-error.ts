/** An error that becomes `{"detail": <detail>}` with the given status, like FastAPI's HTTPException. */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly detail: unknown,
    readonly headers: Record<string, string> = {},
  ) {
    super(typeof detail === 'string' ? detail : JSON.stringify(detail))
    this.name = 'HttpError'
  }
}

export const unauthorized = () => new HttpError(401, 'Unauthorized')
export const forbidden = (detail = 'Forbidden') => new HttpError(403, detail)
