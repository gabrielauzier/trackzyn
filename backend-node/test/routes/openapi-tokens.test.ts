import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TOKEN_ROUTES, routeKey } from '../support/token-routes.ts'
import { type TestApp, createTestApp } from '../support/test-app.ts'

type Operation = { security?: unknown; description?: string }
type Document = { components: { securitySchemes?: Record<string, unknown> }; paths: Record<string, Record<string, Operation>> }

let t: TestApp
let document: Document

beforeAll(async () => {
  t = await createTestApp()
  document = (await t.app.inject({ method: 'GET', url: '/api/openapi.json' })).json() as Document
})
afterAll(async () => {
  await t.close()
})

const openapiPath = (url: string) => url.replace(/:([^/]+)/g, '{$1}')

describe('/api/openapi.json', () => {
  it('API-11 declares the token scheme', () => {
    expect(document.components.securitySchemes?.personalAccessToken).toMatchObject({ type: 'http', scheme: 'bearer' })
  })

  it.each(TOKEN_ROUTES)('API-11 $method $url carries its scope and the security', ({ method, url, scope }) => {
    const operation = document.paths[openapiPath(url)]?.[method.toLowerCase()]
    expect(operation?.security).toEqual([{ personalAccessToken: [] }])
    expect(operation?.description).toContain(`\`${scope}\``)
  })

  it('API-11 no other route carries a scope or the security', () => {
    const inTable = new Set(TOKEN_ROUTES.map((route) => routeKey({ method: route.method, url: openapiPath(route.url) })))
    const others = Object.entries(document.paths).flatMap(([path, operations]) =>
      Object.entries(operations)
        .filter(([method]) => !inTable.has(`${method.toUpperCase()} ${path}`))
        .map(([method, operation]) => ({ route: `${method} ${path}`, operation })),
    )
    expect(others.length).toBeGreaterThan(50)
    for (const { route, operation } of others) {
      expect(operation.security, route).toBeUndefined()
      expect(operation.description ?? '', route).not.toContain('token scope')
    }
  })
})
