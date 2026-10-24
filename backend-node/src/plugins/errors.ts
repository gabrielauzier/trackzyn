import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod'
import { HttpError } from '../http/http-error.ts'

type Loc = Array<string | number>

const CONTEXT_TO_LOC: Record<string, string> = {
  body: 'body',
  querystring: 'query',
  params: 'path',
  headers: 'header',
}

const EXPECTED_TO_TYPE: Record<string, string> = {
  string: 'string_type',
  number: 'float_type',
  int: 'int_type',
  boolean: 'bool_type',
  array: 'list_type',
  object: 'dict_type',
}

interface ValidationItem {
  type: string
  loc: Loc
  msg: string
  input?: unknown
}

/** One FastAPI/pydantic-shaped item per zod issue. */
function toItem(issue: { keyword: string; instancePath: string; message: string; params: Record<string, unknown> }, root: string): ValidationItem {
  const path = issue.instancePath.split('/').slice(1).filter((part) => part !== '')
  const loc: Loc = [root, ...path.map((part) => (/^\d+$/.test(part) ? Number(part) : part))]
  const message = issue.message ?? ''

  if (issue.keyword === 'invalid_type') {
    if (/received undefined/i.test(message)) return { type: 'missing', loc, msg: 'Field required' }
    const expected = String(issue.params.expected ?? '')
    return { type: EXPECTED_TO_TYPE[expected] ?? 'type_error', loc, msg: `Input should be a valid ${expected}` }
  }
  if (issue.keyword === 'invalid_format' && issue.params.format === 'email') {
    return { type: 'value_error', loc, msg: 'value is not a valid email address' }
  }
  if (issue.keyword === 'too_small' && issue.params.origin === 'string') {
    return {
      type: 'string_too_short',
      loc,
      msg: `String should have at least ${String(issue.params.minimum)} characters`,
    }
  }
  if (issue.keyword === 'too_big' && issue.params.origin === 'string') {
    return {
      type: 'string_too_long',
      loc,
      msg: `String should have at most ${String(issue.params.maximum)} characters`,
    }
  }
  return { type: issue.keyword, loc, msg: message }
}

function unprocessable(reply: FastifyReply, detail: ValidationItem[]) {
  return reply.code(422).send({ detail })
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ detail: 'Not Found' }))

  app.setErrorHandler((error: FastifyError | HttpError, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).headers(error.headers).send({ ...error.extra, detail: error.detail })
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      const root = CONTEXT_TO_LOC[error.validationContext ?? 'body'] ?? 'body'
      return unprocessable(
        reply,
        error.validation.map((issue) => toItem(issue as never, root)),
      )
    }

    const fastifyError = error as FastifyError
    if (fastifyError.code === 'FST_ERR_CTP_EMPTY_JSON_BODY') {
      return unprocessable(reply, [{ type: 'missing', loc: ['body'], msg: 'Field required' }])
    }
    if (fastifyError.code === 'FST_ERR_CTP_INVALID_JSON_BODY' || fastifyError.code === 'FST_ERR_CTP_INVALID_CONTENT_LENGTH') {
      return unprocessable(reply, [{ type: 'json_invalid', loc: ['body', 0], msg: 'JSON decode error' }])
    }
    if (fastifyError.statusCode === 415) {
      return unprocessable(reply, [{ type: 'missing', loc: ['body'], msg: 'Field required' }])
    }

    // Like Starlette: a plain-text 500 that says nothing about the cause (the log keeps it).
    request.log.error({ err: error }, 'unhandled error')
    return reply.code(500).type('text/plain; charset=utf-8').send('Internal Server Error')
  })
}
