// Copy of contracts/tests/support/authenticator.ts: backend-node tests must not depend on the contracts package.
import { type KeyObject, createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto'

const b64u = (bytes: Buffer): string => bytes.toString('base64url')
const sha256 = (bytes: Buffer | string): Buffer => createHash('sha256').update(bytes).digest()

/** Just enough CBOR for a COSE key and an attestation object. */
function head(major: number, value: number): Buffer {
  const m = major << 5
  if (value < 24) return Buffer.from([m | value])
  if (value < 256) return Buffer.from([m | 24, value])
  return Buffer.from([m | 25, value >> 8, value & 255])
}

type Cbor = number | string | Buffer | Map<Cbor, Cbor>

function cbor(value: Cbor): Buffer {
  if (typeof value === 'number') return value >= 0 ? head(0, value) : head(1, -1 - value)
  if (typeof value === 'string') {
    const text = Buffer.from(value)
    return Buffer.concat([head(3, text.length), text])
  }
  if (Buffer.isBuffer(value)) return Buffer.concat([head(2, value.length), value])
  const entries = [...value.entries()].flatMap(([k, v]) => [cbor(k), cbor(v)])
  return Buffer.concat([head(5, value.size), ...entries])
}

const FLAG_UP = 0x01
const FLAG_UV = 0x04
const FLAG_BE = 0x08
const FLAG_BS = 0x10
const FLAG_AT = 0x40

export interface AuthenticatorOptions {
  /** A synced passkey: reports backup eligibility and backup state. */
  backedUp?: boolean
}

/** A software ES256 authenticator speaking the browser's JSON shapes, with "none" attestation. */
export class VirtualAuthenticator {
  readonly credentialId = randomBytes(32)
  readonly cosePublicKey: Buffer
  private readonly privateKey: KeyObject
  readonly backedUp: boolean
  signCount = 0

  constructor(options: AuthenticatorOptions = {}) {
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    this.privateKey = privateKey
    this.backedUp = options.backedUp ?? false
    const jwk = publicKey.export({ format: 'jwk' })
    this.cosePublicKey = cbor(
      new Map<Cbor, Cbor>([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, Buffer.from(jwk.x as string, 'base64url')],
        [-3, Buffer.from(jwk.y as string, 'base64url')],
      ]),
    )
  }

  get id(): string {
    return b64u(this.credentialId)
  }

  get publicKey(): string {
    return b64u(this.cosePublicKey)
  }

  private flags(extra: number): number {
    return FLAG_UP | FLAG_UV | extra | (this.backedUp ? FLAG_BE | FLAG_BS : 0)
  }

  private counterBytes(count: number): Buffer {
    const bytes = Buffer.alloc(4)
    bytes.writeUInt32BE(count)
    return bytes
  }

  /** The `PublicKeyCredential` JSON a browser sends to `register/verify`. */
  createCredential(
    options: { rp: { id: string }; challenge: string },
    origin: string,
    extra: { transports?: string[] } = {},
  ) {
    const clientData = Buffer.from(
      JSON.stringify({ type: 'webauthn.create', challenge: options.challenge, origin, crossOrigin: false }),
    )
    const idLength = Buffer.alloc(2)
    idLength.writeUInt16BE(this.credentialId.length)
    const authData = Buffer.concat([
      sha256(options.rp.id),
      Buffer.from([this.flags(FLAG_AT)]),
      this.counterBytes(this.signCount),
      Buffer.alloc(16),
      idLength,
      this.credentialId,
      this.cosePublicKey,
    ])
    const attestationObject = cbor(
      new Map<Cbor, Cbor>([
        ['fmt', 'none'],
        ['attStmt', new Map()],
        ['authData', authData],
      ]),
    )
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key',
      response: {
        attestationObject: b64u(attestationObject),
        clientDataJSON: b64u(clientData),
        ...(extra.transports ? { transports: extra.transports } : {}),
      },
      clientExtensionResults: {},
    }
  }

  /** The assertion JSON a browser sends to `authenticate/verify` and `2fa/verify`. */
  getAssertion(
    options: { rpId: string; challenge: string },
    origin: string,
    extra: { counter?: number } = {},
  ) {
    const counter = extra.counter ?? this.signCount + 1
    this.signCount = counter
    const clientData = Buffer.from(
      JSON.stringify({ type: 'webauthn.get', challenge: options.challenge, origin, crossOrigin: false }),
    )
    const authData = Buffer.concat([sha256(options.rpId), Buffer.from([this.flags(0)]), this.counterBytes(counter)])
    const signature = sign('sha256', Buffer.concat([authData, sha256(clientData)]), this.privateKey)
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key',
      response: {
        authenticatorData: b64u(authData),
        clientDataJSON: b64u(clientData),
        signature: b64u(signature),
        userHandle: null,
      },
      clientExtensionResults: {},
    }
  }
}
