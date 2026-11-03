import { TOKEN_SCOPES, type TokenScope } from '../../src/db/schema.ts'
import { type TestApp, bearer } from './test-app.ts'

let counter = 0

/** A new access token of the session's user, created through `POST /api/tokens`. */
export async function mintToken(t: TestApp, sessionToken: string, workspaceId: string, scopes: readonly TokenScope[] = TOKEN_SCOPES) {
  const reply = await t.app.inject({
    method: 'POST',
    url: '/api/tokens',
    headers: bearer(sessionToken),
    payload: { name: `token-${++counter}`, workspace_id: workspaceId, scopes, expires_in_days: 30 },
  })
  if (reply.statusCode !== 201) throw new Error(`could not mint a token: ${reply.body}`)
  const { id, token } = reply.json() as { id: string; token: string }
  return { id, value: token }
}
