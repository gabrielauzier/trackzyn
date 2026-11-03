import { describe, expect, it } from 'vitest'
import { resolveClientIp } from '../src/plugins/rate-limit.ts'

const peer = '172.26.0.3'

describe('resolveClientIp', () => {
  it('C13 resolveClientIp over the 7 cases of backend/tests/test_rate_limit.py', () => {
    const cases: Array<[string, string | undefined, string | undefined, number, string]> = [
      // name, socket peer, X-Forwarded-For, trusted hops, expected key
      ['untrusted uses the socket peer', peer, '1.2.3.4', 0, peer],
      ['no socket peer is unknown', undefined, undefined, 0, 'unknown'],
      ['one trusted hop', peer, '203.0.113.9', 1, '203.0.113.9'],
      ['client supplied prefix is ignored', peer, '1.1.1.1, 203.0.113.9', 1, '203.0.113.9'],
      ['two trusted hops', peer, '203.0.113.9, 10.0.0.5', 2, '203.0.113.9'],
      ['a chain shorter than the hops is unknown', peer, '10.0.0.5', 2, 'unknown'],
      ['a missing header is unknown', peer, undefined, 1, 'unknown'],
    ]
    expect(cases).toHaveLength(7)
    for (const [name, socket, forwardedFor, hops, expected] of cases) {
      expect(resolveClientIp({ socketAddress: socket, forwardedFor }, hops), name).toBe(expected)
    }
  })

  it('C13 hops=1 with "a, b" picks b, and hops=2 with a single value is unknown', () => {
    expect(resolveClientIp({ socketAddress: peer, forwardedFor: 'a, b' }, 1)).toBe('b')
    expect(resolveClientIp({ socketAddress: peer, forwardedFor: 'a' }, 2)).toBe('unknown')
  })
})
