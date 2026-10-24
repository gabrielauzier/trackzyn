// Copy of contracts/tests/support/idp.ts: backend-node tests must not depend on the contracts package.
import { createHash, randomBytes } from 'node:crypto'
import { type Server, createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { SignJWT, exportJWK, generateKeyPair } from 'jose'

export const CLIENT_ID = 'launchkit'
export const CLIENT_SECRET = 'contract-idp-client-secret'

export interface Grant {
  /** Claims the id_token carries (the signed ones). */
  claims: Record<string, unknown>
  /** What `userinfo` answers for the access token, when the provider has an endpoint. */
  userinfo?: Record<string, unknown>
  /** Extra id_token claim: `at_hash` computed from the access token, or this literal value. */
  atHash?: true | string
}

interface PendingCode extends Grant {
  nonce: string
  codeChallenge: string
}

/** A fake OpenID provider: discovery, JWKS, token and userinfo endpoints on a free port. */
export class FakeIdp {
  readonly clientId = CLIENT_ID
  private readonly codes = new Map<string, PendingCode>()
  private readonly tokens = new Map<string, Record<string, unknown>>()
  private server!: Server
  private privateKey!: CryptoKey
  private publicJwk!: Record<string, unknown>
  port = 0

  static async start(): Promise<FakeIdp> {
    const idp = new FakeIdp()
    const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true })
    idp.privateKey = privateKey
    idp.publicJwk = { ...(await exportJWK(publicKey)), kid: 'contract-key', alg: 'RS256', use: 'sig' }
    idp.server = createServer((req, res) => void idp.handle(req, res))
    await new Promise<void>((resolve) => idp.server.listen(0, '127.0.0.1', resolve))
    idp.port = (idp.server.address() as AddressInfo).port
    return idp
  }

  get issuer(): string {
    return `http://127.0.0.1:${this.port}`
  }

  get discoveryUrl(): string {
    return `${this.issuer}/.well-known/openid-configuration`
  }

  /** Environment that points a stack at this provider. */
  env(extra: Record<string, string> = {}): Record<string, string> {
    return {
      OIDC_ENABLED: 'true',
      OIDC_CLIENT_ID: CLIENT_ID,
      OIDC_CLIENT_SECRET: CLIENT_SECRET,
      OIDC_DISCOVERY_URL: this.discoveryUrl,
      OIDC_PROVIDER_NAME: 'Pocket ID',
      ...extra,
    }
  }

  /** The provider approves `code`: the next token request for it returns these claims. */
  grant(code: string, nonce: string, codeChallenge: string, grant: Grant): void {
    this.codes.set(code, { ...grant, nonce, codeChallenge })
  }

  async stop(): Promise<void> {
    this.server.closeAllConnections()
    await new Promise<void>((resolve) => this.server.close(() => resolve()))
  }

  private async body(req: import('node:http').IncomingMessage): Promise<string> {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    return Buffer.concat(chunks).toString()
  }

  private async handle(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) {
    const url = new URL(req.url ?? '/', this.issuer)
    const send = (status: number, payload: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(payload))
    }
    if (url.pathname === '/.well-known/openid-configuration') {
      return send(200, {
        issuer: this.issuer,
        authorization_endpoint: `${this.issuer}/authorize`,
        token_endpoint: `${this.issuer}/token`,
        userinfo_endpoint: `${this.issuer}/userinfo`,
        jwks_uri: `${this.issuer}/jwks`,
      })
    }
    if (url.pathname === '/jwks') return send(200, { keys: [this.publicJwk] })
    if (url.pathname === '/token' && req.method === 'POST') {
      const form = new URLSearchParams(await this.body(req))
      const pending = this.codes.get(form.get('code') ?? '')
      const verifier = form.get('code_verifier') ?? ''
      const challenge = createHash('sha256').update(verifier).digest('base64url')
      if (
        !pending ||
        form.get('client_id') !== CLIENT_ID ||
        form.get('client_secret') !== CLIENT_SECRET ||
        form.get('grant_type') !== 'authorization_code' ||
        challenge !== pending.codeChallenge
      ) {
        return send(400, { error: 'invalid_grant' })
      }
      this.codes.delete(form.get('code') as string)
      const accessToken = `idp-access-${randomBytes(12).toString('hex')}`
      this.tokens.set(accessToken, pending.userinfo ?? {})
      const now = Math.floor(Date.now() / 1000)
      const claims: Record<string, unknown> = {
        iss: this.issuer,
        aud: CLIENT_ID,
        nonce: pending.nonce,
        iat: now,
        exp: now + 600,
        ...pending.claims,
      }
      if (pending.atHash === true) {
        claims.at_hash = createHash('sha256').update(accessToken).digest().subarray(0, 16).toString('base64url')
      } else if (pending.atHash) {
        claims.at_hash = pending.atHash
      }
      const idToken = await new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256', kid: 'contract-key' })
        .sign(this.privateKey)
      return send(200, { id_token: idToken, access_token: accessToken, token_type: 'Bearer' })
    }
    if (url.pathname === '/userinfo') {
      const token = (req.headers.authorization ?? '').replace(/^Bearer /i, '')
      const info = this.tokens.get(token)
      return info ? send(200, info) : send(401, { error: 'invalid_token' })
    }
    return send(404, { error: 'not_found' })
  }
}
