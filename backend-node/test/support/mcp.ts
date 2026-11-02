import type { AddressInfo } from 'node:net'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { TestApp } from './test-app.ts'

/** Makes the app listen on a real port, as an MCP client needs, and gives the URL of `/api/mcp`. */
export async function listen(t: TestApp): Promise<string> {
  await t.app.listen({ host: '127.0.0.1', port: 0 })
  return `http://127.0.0.1:${(t.app.server.address() as AddressInfo).port}/api/mcp`
}

/** The SDK's own client, past `initialize`, sending the token the way a configured MCP client does. */
export async function connect(url: string, token: string): Promise<Client> {
  const client = new Client({ name: 'test-client', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { authorization: `Bearer ${token}` } } }))
  return client
}

/** One JSON-RPC message by hand, for what the SDK's client would not send. */
export function post(url: string, message: object, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
    body: JSON.stringify(message),
  })
}

export const INITIALIZE = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'by-hand', version: '1.0.0' } },
}
