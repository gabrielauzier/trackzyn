import { describe, expect, it } from 'vitest'
import { parseServerUrl } from './server-url'

describe('parseServerUrl', () => {
  it('strips the trailing slash', () => {
    expect(parseServerUrl('https://srv.example.com/')).toEqual({
      ok: true,
      url: 'https://srv.example.com',
      insecure: false,
    })
    expect(parseServerUrl('  https://srv.example.com///  ')).toMatchObject({
      ok: true,
      url: 'https://srv.example.com',
    })
  })

  it('rejects urls without an http or https scheme', () => {
    for (const input of ['srv.example.com', 'ftp://srv.example.com', '', '   ', 'http://', 'localhost:3000']) {
      expect(parseServerUrl(input), input).toEqual({ ok: false, reason: 'invalid-url' })
    }
  })

  it('classifies http urls by host', () => {
    const insecure = ['http://remote.example', 'http://192.168.1.10:8000', 'http://localhost.evil.example']
    const local = ['http://localhost', 'http://localhost:8000', 'http://127.0.0.1', 'http://127.0.0.1:8000', 'http://[::1]', 'http://[::1]:8000']
    for (const input of insecure) {
      expect(parseServerUrl(input), input).toMatchObject({ ok: true, insecure: true })
    }
    for (const input of local) {
      expect(parseServerUrl(input), input).toMatchObject({ ok: true, insecure: false })
    }
    expect(parseServerUrl('https://remote.example')).toMatchObject({ ok: true, insecure: false })
  })
})
