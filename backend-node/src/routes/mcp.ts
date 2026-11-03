import type { FastifyInstance, FastifyReply, FastifyRequest, onRequestAsyncHookHandler } from 'fastify'
import type { AppContext } from '../context.ts'
import { forbidden } from '../http/http-error.ts'
import { callTool, listTools } from '../mcp/tools.ts'
import { requireToken } from '../plugins/token-auth.ts'
import { workspaceContext } from '../plugins/workspace.ts'

const SERVER_VERSION = '0.1.0'

/**
 * One `Server` and one transport per request, closed at the end: nothing survives between requests
 * (MCP-11). The SDK loads here, on the first request, so the local mode never loads it (TOKEN-13).
 * After `hijack` the error handler of the app no longer acts: the failures are answered here.
 */
async function answer(ctx: AppContext, request: FastifyRequest, reply: FastifyReply): Promise<void> {
  reply.hijack()
  // What the hooks set on `reply`, such as the CORS headers, does not reach `reply.raw` on its own.
  for (const [name, value] of Object.entries(reply.getHeaders())) {
    if (value !== undefined) reply.raw.setHeader(name, value)
  }

  let close = async (): Promise<void> => undefined
  try {
    const [{ Server }, { StreamableHTTPServerTransport }, { CallToolRequestSchema, ListToolsRequestSchema }] = await Promise.all([
      import('@modelcontextprotocol/sdk/server/index.js'),
      import('@modelcontextprotocol/sdk/server/streamableHttp.js'),
      import('@modelcontextprotocol/sdk/types.js'),
    ])
    const server = new Server({ name: ctx.config.appName, version: SERVER_VERSION }, { capabilities: { tools: {} } })
    close = () => server.close()
    const principal = request.tokenPrincipal!
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: listTools(principal) }))
    server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
      try {
        return await callTool({ ctx, workspace: request.workspace, principal }, params.name, params.arguments)
      } catch (error) {
        // The SDK would send this message to the client as it is.
        request.log.error({ err: error }, 'mcp tool failed')
        throw new Error('Internal server error', { cause: error })
      }
    })
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    await server.connect(transport)
    await transport.handleRequest(request.raw, reply.raw, request.body)
  } catch (error) {
    request.log.error({ err: error }, 'mcp request failed')
    if (!reply.raw.headersSent) reply.raw.writeHead(500, { 'content-type': 'application/json' })
    const id = (request.body as { id?: unknown } | null)?.id ?? null
    reply.raw.end(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32603, message: 'Internal server error' } }))
  } finally {
    await close()
  }
}

export function mcpRoutes(ctx: AppContext) {
  return async (app: FastifyInstance): Promise<void> => {
    /** Stops DNS rebinding (MCP-09): a client outside a browser sends no `Origin`. */
    const rejectForeignOrigin: onRequestAsyncHookHandler = async (request) => {
      const { origin } = request.headers
      if (origin !== undefined && origin !== ctx.config.frontendUrl) throw forbidden()
    }

    app.post(
      '/api/mcp',
      {
        schema: { hide: true },
        config: { tokenScope: 'any' },
        // Before the body is parsed: without a token, a malformed body must still answer 401 (MCP-07).
        onRequest: [requireToken, rejectForeignOrigin],
        preValidation: [workspaceContext(ctx)],
      },
      async (request, reply) => {
        // A batch is one request to the limit of the hook but many calls: one token could run 100 per request (RATE-01).
        if (Array.isArray(request.body)) {
          return reply.code(400).send({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Batch requests are not supported' } })
        }
        await answer(ctx, request, reply)
        return reply
      },
    )

    // The server opens no event stream and keeps no session to end (MCP-10). They declare `any` or a
    // valid token would get the hook's 403 instead of this 405.
    const noStream = {
      schema: { hide: true },
      config: { tokenScope: 'any' as const },
      onRequest: [rejectForeignOrigin],
    }
    const methodNotAllowed = async (_request: FastifyRequest, reply: FastifyReply) =>
      reply.code(405).header('Allow', 'POST').send({ detail: 'Method Not Allowed' })
    app.get('/api/mcp', noStream, methodNotAllowed)
    app.delete('/api/mcp', noStream, methodNotAllowed)
  }
}
