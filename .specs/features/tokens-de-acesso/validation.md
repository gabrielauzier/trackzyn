# Tokens de acesso Validation

## Validation: tokens-de-acesso - PASS (iteração 3)

**Date**: 2026-11-02
**Spec**: `.specs/features/tokens-de-acesso/spec.md` (89 requisitos, texto de `2d92cb9`)
**Diff range**: `80991dd..2d92cb9`; desde a iteração 2, `f1ca14a..2d92cb9` (1 commit)
**Verifier**: sub-agente independente (autor ≠ verificador)

Os 89 requisitos têm evidência, os gates passaram e nenhum mutante sobreviveu. As 3 lacunas da iteração 2 fecharam: os 5 sobreviventes agora morrem, cada um na asserção do requisito. Um ponto pede leitura: `GET` e `DELETE` com `tkz_` inválido respondem 401, sem teste, e o critério MCP-10 sozinho pediria 405. A tabela de premissas da spec fixa esse 401, por isso segue como observação (Observação 1).

---

## Lacunas da iteração 2

| Lacuna | Prova em HEAD | Conclusão |
| ------ | ------------- | --------- |
| API-12: NUL em subtarefas fora da criação (N09, N10) | Testes novos de `POST /api/tasks/:id/subtasks`, `PATCH /api/subtasks/:id` e `add_subtask`; mutantes reinjetados | **Fechada.** N09 e N10 morrem. |
| MCP-13: lote de um item (B2) | Teste novo com array de 1 item; mutante reinjetado | **Fechada.** B2 morre com 200 no lugar de 400. |
| MCP-09: precedência (O3, O4) | Testes novos com os 2 motivos de recusa na mesma requisição; mutantes reinjetados | **Fechada.** O3 morre com 403 no lugar de 401; O4, com 422 no lugar de 403. |
| NUL em `idempotency_key` (fora da spec na iteração 2) | Agora é MCP-14; teste novo, mutante novo N12 e sonda em PGlite e Postgres 14 | **Fechada.** `isError: true`, 0 tarefas. |

---

## Sonda independente

Teste descartável no worktree, com socket HTTP real, repetido em PGlite e em Postgres 14.18. Os resultados foram iguais nos dois bancos. Serve de apoio: a evidência dos requisitos é a tabela seguinte.

| Credencial | `POST` sem `Origin` | `POST` com `Origin` estranho | `GET`/`DELETE` sem `Origin` | `GET`/`DELETE` com `Origin` estranho |
| ---------- | ------------------- | ---------------------------- | --------------------------- | ------------------------------------ |
| sem token | 401 | 401 | 405 | 403 |
| JWT de sessão | 401 | 401 | 405 | 403 |
| token válido | 200 | 403 | 405 | 403 |
| `tkz_` desconhecido, malformado ou revogado | 401 | 401 | **401** | **401** |

Todo 401 de `POST` trouxe `WWW-Authenticate: Bearer`. `FRONTEND_URL` como `Origin` deu o mesmo resultado que a ausência de `Origin`.

- **Lote**: arrays vazio, de 1, de 2 e aninhado responderam 400 com `-32600`, e 0 tarefas foram criadas.
- **MCP-14**: `isError: true` com `loc` em `idempotency_key` e 0 tarefas. Controle: uma chave válida criou 1 tarefa e a repetição devolveu `replayed: true` com o mesmo id.
- **NUL em REST**: 422 nas 7 combinações de campo e rota, sem alterar a tarefa nem a subtarefa.
- **NUL em MCP**: `isError: true` em `create_task` (3 campos), `update_task` (2) e `add_subtask`.

---

## Task Completion

`tasks.md` tem 166 caixas marcadas e 0 abertas. Esse número não foi usado como prova.

---

## Spec-Anchored Acceptance Criteria

Toda citação herdada foi conferida por script: a expressão existia na linha citada em `f1ca14a` e existe na linha correspondente em `2d92cb9`, com o deslocamento calculado dos hunks do diff. Das 180 citações, 36 mudaram de linha e nenhuma sumiu. As linhas de API-12, MCP-07, MCP-09, MCP-13 e MCP-14 foram levantadas de novo, e a tabela final foi conferida outra vez em HEAD.

| Requisito | Resultado definido na spec | `file:line` + asserção | Result |
| --------- | -------------------------- | ---------------------- | ------ |
| TOKEN-01 | menu abre diálogo com lista e `Gerar token` | `frontend/src/components/app-layout.test.tsx:236` - `findByRole('dialog', { name: t('accessTokens.title') })`<br>`frontend/src/components/access-tokens-dialog.test.tsx:110` - `getByRole('button', { name: 'Generate token' })` | ✅ PASS |
| TOKEN-02 | workspace atual, `lists:read` + `tasks:create`, 90 dias | `frontend/src/components/access-tokens-dialog.test.tsx:211` - `toHaveTextContent('Synthetic workspace')`<br>`frontend/src/components/access-tokens-dialog.test.tsx:212` - `toHaveTextContent('90 days')`<br>`frontend/src/components/access-tokens-dialog.test.tsx:219` - `expect(checks).toEqual({` | ✅ PASS |
| TOKEN-03 | 201 com id, token, `expires_at` | `backend-node/test/routes/access-tokens.test.ts:47` - `expect(reply.statusCode).toBe(201)`<br>`backend-node/test/routes/access-tokens.test.ts:49` - `expect(Object.keys(body).sort()).toEqual(['expires_at', 'id', 'token'])`<br>`backend-node/test/routes/access-tokens.test.ts:53` - `expect(expiresAt).toBeGreaterThanOrEqual(before + days * DAY_MS)` | ✅ PASS |
| TOKEN-04 | `tkz_` + 43 base64url de 32 bytes | `backend-node/test/services/access-tokens.test.ts:61` - `toMatch(/^tkz_[A-Za-z0-9_-]{43}$/)` | ✅ PASS |
| TOKEN-05 | só SHA-256 guardado | `backend-node/test/services/access-tokens.test.ts:212` - `expect(row?.tokenHash).toBe(createHash('sha256').update(plaintext).digest('hex'))`<br>`backend-node/test/services/access-tokens.test.ts:214` - `expect(JSON.stringify(row)).not.toContain(plaintext)` | ✅ PASS |
| TOKEN-06 | valor uma vez, botão de copiar, aviso exato | `frontend/src/components/access-tokens-dialog.test.tsx:392` - `findByText('Copie agora; este token não será mostrado de novo')`<br>`frontend/src/components/access-tokens-dialog.test.tsx:402` - `expect(await navigator.clipboard.readText()).toBe(TOKEN)`<br>`frontend/src/components/access-tokens-dialog.test.tsx:485` - `expect(document.body.textContent).not.toContain(TOKEN)` | ✅ PASS |
| TOKEN-07 | 422 no formato existente | `backend-node/test/routes/access-tokens.test.ts:64` - `expect(reply.statusCode).toBe(422)`<br>`backend-node/test/routes/access-tokens.test.ts:94` - `detail[0]?.loc).toEqual(loc)` | ✅ PASS |
| TOKEN-08 | 409 `Token name already in use` | `backend-node/test/routes/access-tokens.test.ts:103` - `expect(reply.json()).toEqual({ detail: 'Token name already in use' })` | ✅ PASS |
| TOKEN-09 | 409 `Token limit reached` | `backend-node/test/routes/access-tokens.test.ts:123` - `expect(reply.json()).toEqual({ detail: 'Token limit reached' })`<br>`backend-node/test/services/access-tokens.test.ts:242` - `toHaveLength(50)` | ✅ PASS |
| TOKEN-10 | 404 `Workspace not found` | `backend-node/test/routes/access-tokens.test.ts:129` - `expect(reply.json()).toEqual({ detail: 'Workspace not found' })` | ✅ PASS |
| TOKEN-11 | 403 `Read-only role` ao viewer | `backend-node/test/routes/access-tokens.test.ts:135` - `expect(refused.json()).toEqual({ detail: 'Read-only role' })`<br>`backend-node/test/services/access-tokens.test.ts:268` - `detail: 'Read-only role'` | ✅ PASS |
| TOKEN-12 | textos em pt e en | `frontend/src/locales/desktop-keys.test.ts:15` - `'only in en').toEqual([])`<br>`frontend/src/components/access-tokens-dialog.test.tsx:521` - `findByLabelText('Nome')` | ✅ PASS |
| TOKEN-13 | 404 em `/api/tokens` e `/api/mcp` no modo local | `backend-node/test/local/local-server.test.ts:75` - `expect(reply.status, `${method} ${path}`).toBe(404)`<br>`backend-node/test/mcp/transport.test.ts:198` - `expect(reply.statusCode, method).toBe(404)` | ✅ PASS |
| TOKEN-14 | item escondido no modo local | `frontend/src/components/app-layout.test.tsx:243` - `queryByRole('menuitem', { name: t('accessTokens.title') })).not.toBeInTheDocument()` | ✅ PASS |
| TOKEN-15 | concorrência: só o que cabe em 50, demais 409 | `backend-node/test/postgres/access-tokens.test.ts:57` - `expect(refusals(results)).toEqual(Array(5).fill('Token limit reached'))`<br>`backend-node/test/postgres/access-tokens.test.ts:58` - `expect(await stored()).toHaveLength(50)` | ✅ PASS |
| TOKEN-16 | concorrência: um por nome, demais 409 | `backend-node/test/postgres/access-tokens.test.ts:65` - `expect(refusals(results)).toEqual(Array(7).fill('Token name already in use'))` | ✅ PASS |
| TOKEN-17 | `name` com NUL: 422 sem criar | `backend-node/test/routes/access-tokens.test.ts:73` - `expect(reply.statusCode).toBe(422)`<br>`backend-node/test/routes/access-tokens.test.ts:74` - `expect(reply.json().detail[0].loc).toEqual(['body', 'name'])`<br>`backend-node/test/routes/access-tokens.test.ts:75` - `toHaveLength(countBefore)` | ✅ PASS |
| MANAGE-01 | só os do usuário, com todos os campos | `backend-node/test/routes/access-tokens.test.ts:151` - `expect(row).toEqual({`<br>`backend-node/test/routes/access-tokens.test.ts:168` - `expect(await listed(viewer.token, created.id)).toBeUndefined()` | ✅ PASS |
| MANAGE-02 | `tkz_…` + 4 últimos; nunca o valor | `backend-node/test/routes/access-tokens.test.ts:157` - `display_hint: `tkz_…${created.token.slice(-4)}``<br>`backend-node/test/routes/access-tokens.test.ts:148` - `expect(reply.body).not.toContain(created.token)`<br>`backend-node/test/services/access-tokens.test.ts:80` - `toBe('tkz_…a1B2')` | ✅ PASS |
| MANAGE-03 | revoked > expired > active | `backend-node/test/services/access-tokens.test.ts:96` - `.toBe('revoked')`<br>`backend-node/test/services/access-tokens.test.ts:333` - `expect(status).toEqual({ [active.id]: 'active', [expired.id]: 'expired', [revoked.id]: 'revoked' })` | ✅ PASS |
| MANAGE-04 | confirma, DELETE, 204, mostra `revoked` | `backend-node/test/routes/access-tokens.test.ts:177` - `expect(reply.statusCode).toBe(204)`<br>`backend-node/test/routes/access-tokens.test.ts:180` - `expect(row?.status).toBe('revoked')`<br>`frontend/src/components/access-tokens-dialog.test.tsx:147` - `expect(accessTokens.revoke).toHaveBeenCalledWith(active.id)`<br>`frontend/src/components/access-tokens-dialog.test.tsx:144` - `getByRole('button', { name: t('accessTokens.revoke') })` | ✅ PASS |
| MANAGE-05 | 204 sem alterar `revoked_at` | `backend-node/test/routes/access-tokens.test.ts:189` - `expect((await revoke(owner.token, created.id)).statusCode).toBe(204)`<br>`backend-node/test/routes/access-tokens.test.ts:190` - `?.revoked_at).toBe(first)`<br>`backend-node/test/services/access-tokens.test.ts:356` - `?.revokedAt).toEqual(NOW)` | ✅ PASS |
| MANAGE-06 | 404 a token de outro usuário | `backend-node/test/routes/access-tokens.test.ts:195` - `expect((await revoke(viewer.token, created.id)).statusCode).toBe(404)` | ✅ PASS |
| MANAGE-07 | token autenticado, mesmo com erro depois, e nulo ou >60 s: grava a hora | `backend-node/test/plugins/token-auth.test.ts:188` - `.toBe(403)`<br>`backend-node/test/plugins/token-auth.test.ts:189` - `lastUsedAt!.getTime()).toBeGreaterThanOrEqual(before)`<br>`backend-node/test/plugins/token-auth.test.ts:198` - `expect((await row(token.id)).lastUsedAt).toEqual(recent)`<br>`backend-node/test/plugins/token-auth.test.ts:204` - `lastUsedAt!.getTime()).toBeGreaterThanOrEqual(before)` | ✅ PASS |
| MANAGE-08 | apaga aos 90 dias na próxima escrita, mantém tarefas | `backend-node/test/services/access-tokens.test.ts:292` - `expect(left).toHaveLength(3)`<br>`backend-node/test/services/access-tokens.test.ts:376` - `expect(await readRow(revoked90.id)).toBeUndefined()`<br>`backend-node/test/services/access-tokens.test.ts:397` - `expect(task?.createdViaTokenId).toBeNull()` | ✅ PASS |
| AUTH-01 | autentica como o dono | `backend-node/test/plugins/token-auth.test.ts:53` - `expect(reply.json()).toEqual({ user_id: owner.id })` | ✅ PASS |
| AUTH-02 | 401 `Unauthorized` | `backend-node/test/plugins/token-auth.test.ts:63` - `expectSame401(await call(generateToken().plaintext, '/test/any'))`<br>`backend-node/test/plugins/token-auth.test.ts:44` - `expect(reply.json()).toEqual({ detail: 'Unauthorized' })` | ✅ PASS |
| AUTH-03 | 401 `Unauthorized` | `backend-node/test/plugins/token-auth.test.ts:74` - `expectSame401(await call(token.value, '/test/any'))` | ✅ PASS |
| AUTH-04 | 401 na primeira requisição seguinte | `backend-node/test/plugins/token-auth.test.ts:81` - `expectSame401(await call(token.value, '/test/any'))` | ✅ PASS |
| AUTH-05 | 401 `Unauthorized` | `backend-node/test/plugins/token-auth.test.ts:89` - `expectSame401(await call(token.value, '/test/any'))` | ✅ PASS |
| AUTH-06 | cascata ao excluir usuário | `backend-node/test/db/access-tokens-schema.test.ts:36` - `expect(await count('personal_access_tokens')).toBe(0)` | ✅ PASS |
| AUTH-07 | cascata ao excluir workspace | `backend-node/test/db/access-tokens-schema.test.ts:42` - `expect(await count('personal_access_tokens')).toBe(0)` | ✅ PASS |
| AUTH-08 | 401 `Unauthorized` | `backend-node/test/plugins/token-auth.test.ts:67` - `expectSame401(await call('tkz_short', '/test/any'))` | ✅ PASS |
| AUTH-09 | 401 `Unauthorized` | `backend-node/test/routes/access-tokens.test.ts:221` - `expect(reply.json()).toEqual({ detail: 'Unauthorized' })` | ✅ PASS |
| AUTH-10 | `expires_at` = agora é expirado | `backend-node/test/services/access-tokens.test.ts:131` - `expect(await authenticate(db, token.plaintext, NOW)).toBeNull()`<br>`backend-node/test/services/access-tokens.test.ts:92` - `.toBe('expired')` | ✅ PASS |
| SCOPE-01 | usa o workspace do token | `backend-node/test/plugins/token-workspace.test.ts:51` - `expect(reply.json().workspace_id).toBe(bound)` | ✅ PASS |
| SCOPE-02 | 403 `Token is bound to another workspace` | `backend-node/test/plugins/token-workspace.test.ts:69` - `expect(reply.json()).toEqual({ detail: 'Token is bound to another workspace' })` | ✅ PASS |
| SCOPE-03 | rota registrada fora da tabela: 403 `Route not available for tokens`. Exceções da spec: inexistente 404; `OPTIONS` pelo CORS antes do hook (só a lista de rotas tem asserção; comportamento por sonda) | `backend-node/test/routes/token-scopes.test.ts:98` - `toBe('Route not available for tokens')`<br>`backend-node/test/plugins/token-auth.test.ts:112` - `expect(reply.json()).toEqual({ detail: 'Route not available for tokens' })`<br>`backend-node/test/plugins/token-auth.test.ts:141` - `expect(reply.statusCode).toBe(404)`<br>`backend-node/test/routes/token-scopes.test.ts:87` - `toEqual(['*'])` | ✅ PASS |
| SCOPE-04 | rota nova sem declaração é negada | `backend-node/test/routes/token-scopes.test.ts:80` - `expect(declared.toSorted(byKey)).toEqual([...TOKEN_ROUTES, ...MCP_ROUTES].toSorted(byKey))`<br>`backend-node/test/routes/token-scopes.test.ts:97` - `expect(reply.statusCode, routeKey(route)).toBe(403)` | ✅ PASS |
| SCOPE-05 | 403 `Missing scope: <escopo>` | `backend-node/test/routes/token-scopes.test.ts:111` - `expect(reply.json()).toEqual({ detail: `Missing scope: ${scope}` })` | ✅ PASS |
| SCOPE-06 | 403 em `/api/tokens` com token | `backend-node/test/plugins/token-auth.test.ts:111` - `expect(reply.statusCode).toBe(403)` | ✅ PASS |
| SCOPE-07 | 403 `Read-only role` | `backend-node/test/routes/token-scopes.test.ts:135` - `expect(reply.json(), routeKey(route)).toEqual({ detail: 'Read-only role' })` | ✅ PASS |
| SCOPE-08 | 404 `Workspace not found` | `backend-node/test/plugins/token-workspace.test.ts:82` - `expect(reply.json()).toEqual({ detail: 'Workspace not found' })`<br>`backend-node/test/plugins/token-workspace.test.ts:94` - `expect(reply.json()).toEqual({ detail: 'Workspace not found' })` | ✅ PASS |
| SCOPE-09 | `preview` vazio sem `tasks:read` | `backend-node/test/routes/token-scopes.test.ts:165` - `expect(await previewOf(token.value)).toEqual([])`<br>`backend-node/test/mcp/read-tools.test.ts:75` - `expect(list.preview).toEqual([])` | ✅ PASS |
| SCOPE-10 | JWT sem mudança | `backend-node/test/plugins/token-auth.test.ts:264` - `toBe(200)`<br>`backend-node/test/plugins/token-auth.test.ts:272` - `expect(reply.headers['www-authenticate']).toBeUndefined()`<br>`backend-node/test/routes/token-scopes.test.ts:175` - `expect(await previewOf(owner.token)).toEqual(['A secret title'])` | ✅ PASS |
| SCOPE-11 | papel atual já na requisição seguinte | `backend-node/test/plugins/token-workspace.test.ts:107` - `expect(after.json()).toEqual({ detail: 'Read-only role' })` | ✅ PASS |
| RATE-01 | 61ª em 60 s: 429 `Too many requests`, `Retry-After: 60`, REST+MCP juntos. O contorno por lote da iteração 1 fechou: nenhum formato de corpo executou chamada | `backend-node/test/plugins/token-auth.test.ts:174` - `expect(limited.statusCode).toBe(429)`<br>`backend-node/test/plugins/token-auth.test.ts:175` - `expect(limited.json()).toEqual({ detail: 'Too many requests' })`<br>`backend-node/test/plugins/token-auth.test.ts:176` - `expect(limited.headers['retry-after']).toBe('60')`<br>`backend-node/test/mcp/transport.test.ts:159` - `expect(reply.status).toBe(429)` | ✅ PASS |
| OBS-01 | `token_id` e `user_id` em cada requisição; nunca o valor | `backend-node/test/plugins/token-auth.test.ts:232` - `expect(entry.token_id).toBe(token.id)`<br>`backend-node/test/plugins/token-auth.test.ts:233` - `expect(entry.user_id).toBe(me.id)`<br>`backend-node/test/plugins/token-auth.test.ts:235` - `expect(lines.join('')).not.toContain(token.value)` | ✅ PASS |
| API-01 | 201, fim de `backlog` | `backend-node/test/routes/tasks-intake.test.ts:37` - `expect(first.statusCode).toBe(201)`<br>`backend-node/test/routes/tasks-intake.test.ts:38` - `column: 'backlog', position: 0`<br>`backend-node/test/routes/tasks-intake.test.ts:39` - `column: 'backlog', position: 1` | ✅ PASS |
| API-02 | fim da coluna dada | `backend-node/test/routes/tasks-intake.test.ts:50` - `expect(reply.json()).toMatchObject({ column: 'today', position: 1 })` | ✅ PASS |
| API-03 | grava estimativa 1..1440 | `backend-node/test/routes/tasks-intake.test.ts:62` - `expect(body).toMatchObject({ estimate_minutes: 1440, notes })`<br>`backend-node/test/routes/tasks-intake.test.ts:66` - `estimate_minutes: 1, subtasks` | ✅ PASS |
| API-04 | grava notas até 10 000 | `backend-node/test/routes/tasks-intake.test.ts:65` - `expect((await stored())[0]).toMatchObject({ estimateMinutes: 1440, notes })` | ✅ PASS |
| API-05 | até 50, em ordem | `backend-node/test/routes/tasks-intake.test.ts:63` - `expect(body.subtasks.map((subtask) => subtask.title)).toEqual(titles)` | ✅ PASS |
| API-06 | 422 sem criar nada | `backend-node/test/routes/tasks-intake.test.ts:82` - `expect(reply.statusCode).toBe(422)`<br>`backend-node/test/routes/tasks-intake.test.ts:84` - `expect(await stored()).toEqual([])` | ✅ PASS |
| API-07 | desfaz tudo se uma subtarefa falha | `backend-node/test/services/tasks.test.ts:274` - `rejects`<br>`backend-node/test/services/task-intake.test.ts:246` - `expect(await storedTasks()).toEqual([])` | ✅ PASS |
| API-08 | 404 | `backend-node/test/routes/tasks-intake.test.ts:92` - `expect(foreign.statusCode).toBe(404)` | ✅ PASS |
| API-09 | 409 `List is archived` | `backend-node/test/routes/tasks-intake.test.ts:103` - `expect(refused.json()).toEqual({ detail: 'List is archived' })` | ✅ PASS |
| API-10 | conclusão conta para o dono | `backend-node/test/routes/tasks-intake.test.ts:129` - `expect(await completedBy(t, reply.json().id)).toBe(owner.id)` | ✅ PASS |
| API-11 | esquema e escopo por rota no OpenAPI | `backend-node/test/routes/openapi-tokens.test.ts:23` - `toMatchObject({ type: 'http', scheme: 'bearer' })`<br>`backend-node/test/routes/openapi-tokens.test.ts:29` - `expect(operation?.description).toContain(`\`${scope}\``)` | ✅ PASS |
| API-12 | `title`, `notes` ou título de subtarefa com NUL: 422 sem gravar | `backend-node/test/routes/tasks-intake.test.ts:147` - `expect(reply.statusCode).toBe(422)`<br>`backend-node/test/routes/tasks-intake.test.ts:149` - `expect(await stored()).toEqual([])`<br>`backend-node/test/routes/tasks-intake.test.ts:159` - `expect(reply.statusCode).toBe(422)`<br>`backend-node/test/routes/tasks-intake.test.ts:170` - `expect(reply.statusCode).toBe(422)`<br>`backend-node/test/routes/tasks-intake.test.ts:173` - `expect(after.json().subtasks).toEqual([])`<br>`backend-node/test/routes/tasks-intake.test.ts:181` - `expect(reply.statusCode).toBe(422)`<br>`backend-node/test/routes/tasks-intake.test.ts:184` - `expect(after.json().subtasks[0].title).toBe('before')`<br>`backend-node/test/mcp/create-task.test.ts:127` - `expect(result.isError).toBe(true)`<br>`backend-node/test/mcp/create-task.test.ts:129` - `.subtasks).toEqual([])` | ✅ PASS |
| IDEM-01 | uma tarefa, mesma resposta, inclusive em paralelo | `backend-node/test/postgres/task-intake.test.ts:45` - `expect(stored).toHaveLength(1)`<br>`backend-node/test/postgres/task-intake.test.ts:46` - `expect(new Set(results.map((result) => result.task.id))).toEqual(new Set([stored[0]!.id]))`<br>`backend-node/test/services/task-intake.test.ts:150` - `replayed: true` | ✅ PASS |
| IDEM-02 | 201, estado atual, `Idempotency-Replayed: true` | `backend-node/test/routes/tasks-intake.test.ts:198` - `expect(replay.statusCode).toBe(201)`<br>`backend-node/test/routes/tasks-intake.test.ts:199` - `expect(replay.headers['idempotency-replayed']).toBe('true')`<br>`backend-node/test/routes/tasks-intake.test.ts:209` - `title: 'After'` | ✅ PASS |
| IDEM-03 | 409 com o texto da spec | `backend-node/test/routes/tasks-intake.test.ts:231` - `expect(different.json()).toEqual({ detail: 'Idempotency key reused with a different payload' })`<br>`backend-node/test/services/task-intake.test.ts:107` - `detail: 'Idempotency key reused with a different payload'` | ✅ PASS |
| IDEM-04 | 410 `Task was deleted` | `backend-node/test/routes/tasks-intake.test.ts:252` - `expect(again.json()).toEqual({ detail: 'Task was deleted' })`<br>`backend-node/test/routes/tasks-intake.test.ts:253` - `expect(await stored()).toEqual([])` | ✅ PASS |
| IDEM-05 | 422 para vazio ou >255 | `backend-node/test/routes/tasks-intake.test.ts:264` - `expect(reply.statusCode).toBe(422)`<br>`backend-node/test/routes/tasks-intake.test.ts:274` - `headers['idempotency-replayed']).toBe('true')` | ✅ PASS |
| IDEM-06 | depois de 24h cria outra | `backend-node/test/services/task-intake.test.ts:160` - `expect(second.replayed).toBe(false)`<br>`backend-node/test/services/task-intake.test.ts:161` - `expect(second.task.id).not.toBe(first.task.id)` | ✅ PASS |
| IDEM-07 | uma tarefa por token | `backend-node/test/services/task-intake.test.ts:185` - `expect(await storedTasks()).toHaveLength(2)` | ✅ PASS |
| IDEM-08 | JWT ignora o cabeçalho | `backend-node/test/routes/tasks-intake.test.ts:293` - `expect(replies[0]?.json().id).not.toBe(replies[1]?.json().id)`<br>`backend-node/test/routes/tasks-intake.test.ts:308` - `expect(reply.statusCode).toBe(201)` | ✅ PASS |
| MCP-01 | nome, versão, capacidade `tools` | `backend-node/test/mcp/transport.test.ts:35` - `expect(client.getServerVersion()).toMatchObject({ name: 'trackzyn-test', version: '0.1.0' })`<br>`backend-node/test/mcp/transport.test.ts:36` - `expect(client.getServerCapabilities()?.tools).toEqual({})` | ✅ PASS |
| MCP-02 | só as ferramentas dos escopos | `backend-node/test/mcp/write-tools.test.ts:54` - `expect(await toolNames(client)).toEqual(names)`<br>`backend-node/test/mcp/write-tools.test.ts:62` - `not.toContain('delete_task')` | ✅ PASS |
| MCP-03 | campos e limites + `idempotency_key` | `backend-node/test/mcp/create-task.test.ts:54` - `expect(Object.keys(fields).sort()).toEqual(['column', 'estimate_minutes', 'idempotency_key', 'list_id', 'notes', 'subtasks', 'title'])`<br>`backend-node/test/mcp/create-task.test.ts:56` - `expect(fields.title).toMatchObject({ type: 'string', minLength: 1, maxLength: 255 })` | ✅ PASS |
| MCP-04 | cria e devolve id e título | `backend-node/test/mcp/create-task.test.ts:74` - `expect(first.json()).toMatchObject({ title: 'First', column: 'backlog', replayed: false })`<br>`backend-node/test/mcp/create-task.test.ts:76` - `expect(rows.find((row) => row.id === first.json().id))` | ✅ PASS |
| MCP-05 | regras IDEM-01 a -07 | `backend-node/test/mcp/create-task.test.ts:204` - `expect(second.json().id).toBe(first.json().id)`<br>`backend-node/test/mcp/create-task.test.ts:224` - `text: 'Idempotency key reused with a different payload'`<br>`backend-node/test/mcp/create-task.test.ts:232` - `text: 'Task was deleted'`<br>`backend-node/test/mcp/create-task.test.ts:263` - `expect(await stored()).toHaveLength(2)` | ✅ PASS |
| MCP-06 | `isError: true` com o texto da rota REST | `backend-node/test/mcp/create-task.test.ts:162` - `expect(JSON.parse(result.text)).toEqual(reply.json().detail)`<br>`backend-node/test/mcp/create-task.test.ts:183` - `text: 'Missing scope: tasks:create'`<br>`backend-node/test/mcp/create-task.test.ts:191` - `text: 'Read-only role'`<br>`backend-node/test/mcp/create-task.test.ts:170` - `text: reply.json().detail` | ✅ PASS |
| MCP-07 | `POST` sem token válido: HTTP 401 com `WWW-Authenticate: Bearer` | `backend-node/test/mcp/transport.test.ts:61` - `expect(reply.status).toBe(401)`<br>`backend-node/test/mcp/transport.test.ts:62` - `expect(reply.headers.get('www-authenticate')).toBe('Bearer')`<br>`backend-node/test/mcp/transport.test.ts:87` - `expect(reply.status).toBe(401)`<br>`backend-node/test/mcp/transport.test.ts:88` - `expect(reply.headers.get('www-authenticate')).toBe('Bearer')` | ✅ PASS |
| MCP-08 | JWT: HTTP 401 | `backend-node/test/mcp/transport.test.ts:74` - `expect(reply.status).toBe(401)` | ✅ PASS |
| MCP-09 | `Origin` diferente, salvo recusa antes por token inválido: 403 | `backend-node/test/mcp/transport.test.ts:102` - `expect((await post(url, INITIALIZE, headers)).status).toBe(401)`<br>`backend-node/test/mcp/transport.test.ts:108` - `expect(reply.status).toBe(403)`<br>`backend-node/test/mcp/transport.test.ts:113` - `expect(reply.status).toBe(403)`<br>`backend-node/test/mcp/transport.test.ts:118` - `expect(reply.status).toBe(403)`<br>`backend-node/test/mcp/transport.test.ts:124` - `toBe(403)`<br>`backend-node/test/mcp/transport.test.ts:130` - `expect(reply.status).toBe(200)` | ✅ PASS |
| MCP-10 | `GET`/`DELETE` fora de MCP-09: 405 | `backend-node/test/mcp/transport.test.ts:142` - `expect(reply.status).toBe(405)`<br>`backend-node/test/mcp/transport.test.ts:143` - `expect(reply.headers.get('allow')).toBe('POST')`<br>`backend-node/test/mcp/transport.test.ts:147` - `toBe(405)` | ✅ PASS |
| MCP-11 | sem estado entre requisições | `backend-node/test/mcp/transport.test.ts:44` - `expect(reply.headers.get('mcp-session-id')).toBeNull()`<br>`backend-node/test/mcp/transport.test.ts:52` - `expect(reply.status).toBe(200)`<br>`backend-node/test/mcp/transport.test.ts:181` - `expect(close).toHaveBeenCalledTimes(1)` | ✅ PASS |
| MCP-12 | URL e configuração com `Authorization` | `frontend/src/components/access-tokens-dialog.test.tsx:422` - `expect(await screen.findByText(url)).toBeInTheDocument()`<br>`frontend/src/components/access-tokens-dialog.test.tsx:425` - `expect(config.mcpServers.trackzyn).toEqual({ type: 'http', url, headers: { Authorization: `Bearer ${TOKEN}` } })` | ✅ PASS |
| MCP-13 | corpo em array: HTTP 400, `-32600`, nada executado | `backend-node/test/mcp/create-task.test.ts:110` - `expect(reply.status).toBe(400)`<br>`backend-node/test/mcp/create-task.test.ts:111` - `error: { code: -32600, message: 'Batch requests are not supported' }`<br>`backend-node/test/mcp/create-task.test.ts:112` - `toEqual([])`<br>`backend-node/test/mcp/create-task.test.ts:119` - `expect(reply.status).toBe(400)`<br>`backend-node/test/mcp/create-task.test.ts:120` - `expect(await stored()).toEqual([])` | ✅ PASS |
| MCP-14 | `idempotency_key` de `create_task` com NUL: `isError: true`, sem criar | `backend-node/test/mcp/create-task.test.ts:135` - `expect(result.isError).toBe(true)`<br>`backend-node/test/mcp/create-task.test.ts:136` - `expect(JSON.parse(result.text)[0].loc).toEqual(['body', 'idempotency_key'])`<br>`backend-node/test/mcp/create-task.test.ts:137` - `expect(await stored()).toEqual([])` | ✅ PASS |
| ORIGIN-01 | registra o token criador (REST e MCP) | `backend-node/test/routes/tasks-intake.test.ts:135` - `expect((await stored())[0]?.createdViaTokenId).toBe(token.id)`<br>`backend-node/test/mcp/create-task.test.ts:93` - `expect(result.json().created_via).toBe(row!.name)` | ✅ PASS |
| ORIGIN-02 | `created_via` nome ou null em tarefa e quadro; foco sem o campo | `backend-node/test/routes/tasks-origin.test.ts:38` - `expect(created.json().created_via).toBe(tokenName)`<br>`backend-node/test/routes/tasks-origin.test.ts:54` - `expect(created.json().created_via).toBeNull()`<br>`backend-node/test/routes/board.test.ts:73` - `expect(byToken.json().columns.backlog.tasks).toMatchObject(expected)`<br>`backend-node/test/services/focus-state.test.ts:40` - `expect(state).toEqual({` | ✅ PASS |
| ORIGIN-03 | selo `via <nome>` no cartão do quadro e no diálogo, em todos os papéis | `frontend/src/components/board/task-card.test.tsx:39` - `expect(screen.getByText('via n8n flow')).toBeInTheDocument()`<br>`frontend/src/components/board/task-dialog.test.tsx:49` - `getByText('via n8n flow')` | ✅ PASS |
| ORIGIN-04 | mantém o selo | `backend-node/test/routes/tasks-origin.test.ts:62` - `expect((await read()).json().created_via).toBe(tokenName)`<br>`backend-node/test/routes/tasks-origin.test.ts:68` - `expect((await read()).json().created_via).toBe(tokenName)` | ✅ PASS |
| ORIGIN-05 | mantém a tarefa, `created_via` nulo | `backend-node/test/routes/tasks-origin.test.ts:79` - `expect(reply.json()).toMatchObject({ title: 'Via token', created_via: null })` | ✅ PASS |
| ORIGIN-06 | editar mantém; cópia nula | `backend-node/test/routes/tasks-origin.test.ts:87` - `expect(edited.json()).toMatchObject({ title: 'Edited', created_via: tokenName })`<br>`backend-node/test/routes/tasks-origin.test.ts:114` - `expect(row?.via).toBeNull()` | ✅ PASS |
| ORIGIN-07 | aviso no diálogo `Gerar token` | `frontend/src/components/access-tokens-dialog.test.tsx:232` - `getByText("The token's name is visible to workspace members on the tasks it creates.")`<br>`frontend/src/components/access-tokens-dialog.test.tsx:523` - `getByText('O nome do token fica visível aos membros do workspace nas tarefas criadas por ele.')` | ✅ PASS |

**Status**: ✅ 89/89 com resultado da spec; 0 lacunas de precisão marcadas. Ver Observação 1 sobre MCP-10.

---

## Discrimination Sensor

Worktree temporário em `2d92cb9`, `node_modules` por symlink, só os arquivos de teste relevantes, sem `TEST_POSTGRES_URL`. Controle sem mutação: 89 de 89 passaram nos 3 arquivos. Nenhuma falha veio de timeout: cada teste que falhou levou menos de 225 ms.

### Executadas nesta iteração

| Mutação | Requisito | File:line | Descrição | Killed? | Teste que falhou e motivo |
| ------- | --------- | --------- | --------- | ------- | ------------------------- |
| N09 | API-12 | `backend-node/src/routes/tasks.ts:58` | `withoutNul` fora de `addSubtaskBody` | ✅ Killed | `tasks-intake`: "API-12 adding one answers 422", `expected 500 to be 422`. `create-task`: "API-12 add_subtask with a NUL character", `callTool` rejeitou com `-32603` |
| N10 | API-12 | `backend-node/src/routes/tasks.ts:228` | `withoutNul` fora do título de `PATCH /api/subtasks/:id` | ✅ Killed | "API-12 renaming one answers 422", `expected 500 to be 422` |
| B2 | MCP-13 | `backend-node/src/routes/mcp.ts:74` | guarda só para arrays com mais de um item | ✅ Killed | "MCP-13 a batch of one item", `expected 200 to be 400` |
| O3 | MCP-09 | `backend-node/src/routes/mcp.ts:69` | `Origin` conferido antes do token | ✅ Killed | "MCP-09 an invalid token answers 401 even from another origin", `expected 403 to be 401` |
| O4 | MCP-09 | `backend-node/src/routes/mcp.ts:87` | `Origin` de `GET`/`DELETE` em `preValidation` | ✅ Killed | "MCP-09 DELETE from another origin", `expected 422 to be 403` |
| N12 | MCP-14 | `backend-node/src/mcp/tools.ts:76` | `withoutNul` fora de `idempotency_key` | ✅ Killed | "MCP-06 an idempotency_key with a NUL character", `callTool` rejeitou com `-32603` |

Em N09 (MCP) e N12 a falha não vem de um `expect`: o `callTool` rejeita com o erro `-32603`, antes da asserção de `isError`. É o defeito que o requisito proíbe, então conta como morte legítima.

### Reaproveitadas da iteração 2 (não reexecutadas)

O diff `f1ca14a..2d92cb9` muda em `backend-node/src` só `mcp/tools.ts`: um import e o campo `idempotency_key`. Nos testes, as únicas linhas removidas são 3 de comentário em `token-scopes.test.ts`, e o resto é acréscimo. Nada do que estas mutações tocam mudou, e os testes que as mataram seguem iguais. P6 e P7 só mudaram de linha, pelo import novo.

| Mutação | Requisito | File:line | Descrição | Killed? | Primeiro teste a falhar |
| ------- | --------- | --------- | --------- | ------- | ----------------------- |
| B1 | MCP-13 | `backend-node/src/routes/mcp.ts:74` | batch guard removed | ✅ Killed | failures MCP-13 a JSON-RPC batch answers 400 and runs none of its calls |
| B3 | MCP-13 | `backend-node/src/routes/mcp.ts:75` | batch answers HTTP 200 | ✅ Killed | failures MCP-13 a JSON-RPC batch answers 400 and runs none of its calls |
| B4 | MCP-13 | `backend-node/src/routes/mcp.ts:75` | batch error code changed | ✅ Killed | failures MCP-13 a JSON-RPC batch answers 400 and runs none of its calls |
| N01 | TOKEN-17 | `backend-node/src/routes/access-tokens.ts:54` | withoutNul removed from the token name | ✅ Killed | POST /api/tokens TOKEN-17 answers 422 for a name with a NUL character and creates nothing |
| N02 | API-12 | `backend-node/src/routes/tasks.ts:41` | withoutNul removed from the shared title | ✅ Killed | failures API-12 a title with a NUL character is a tool error, like the 422 of the route |
| N03 | API-12 | `backend-node/src/routes/tasks.ts:42` | withoutNul removed from the shared notes | ✅ Killed | NUL characters API-12 notes with one answers 422 and creates nothing |
| N04 | API-12 | `backend-node/src/routes/tasks.ts:48` | createTaskBody.title unguarded | ✅ Killed | failures API-12 a title with a NUL character is a tool error, like the 422 of the route |
| N05 | API-12 | `backend-node/src/routes/tasks.ts:52` | createTaskBody.notes unguarded | ✅ Killed | NUL characters API-12 notes with one answers 422 and creates nothing |
| N06 | API-12 | `backend-node/src/routes/tasks.ts:53` | createTaskBody.subtasks unguarded | ✅ Killed | NUL characters API-12 a subtask with one answers 422 and creates nothing |
| N07 | API-12 | `backend-node/src/routes/tasks.ts:56` | updateTaskBody.title unguarded (PATCH task, update_task) | ✅ Killed | NUL characters API-12 editing title with one answers 422 and changes nothing |
| N08 | API-12 | `backend-node/src/routes/tasks.ts:56` | updateTaskBody.notes unguarded (PATCH task, update_task) | ✅ Killed | NUL characters API-12 editing notes with one answers 422 and changes nothing |
| N11 | API-12 | `backend-node/src/routes/schemas.ts:6` | withoutNul always accepts | ✅ Killed | NUL characters API-12 title with one answers 422 and creates nothing |
| O1 | MCP-07,MCP-08,MCP-09 | `backend-node/src/routes/mcp.ts:69` | POST guards back to preValidation | ✅ Killed | without a valid token MCP-07 no token answers 401 before the body is read, even when it is not  |
| O2 | MCP-07,MCP-08 | `backend-node/src/routes/mcp.ts:69` | Origin checked after body parse | ✅ Killed | Origin MCP-09 another origin answers 403 before the body is read |
| L1 | MANAGE-04 | `frontend/src/components/delete-confirmation-dialog.tsx:56` | confirmLabel ignored | ✅ Killed | AccessTokensDialog revocation asks for confirmation and then shows the token as revoked |
| L2 | MANAGE-04 | `frontend/src/components/access-tokens-dialog.tsx:222` | dialog stops passing confirmLabel | ✅ Killed | AccessTokensDialog revocation asks for confirmation and then shows the token as revoked |
| P1 | SCOPE-03,SCOPE-04 | `backend-node/src/plugins/token-auth.ts:22` | deny by default removed | ✅ Killed | deny by default SCOPE-03 SCOPE-06 GET /api/users/me answers 403 to a token with every scope |
| P2 | SCOPE-05 | `backend-node/src/plugins/token-auth.ts:23` | scope check removed | ✅ Killed | deny by default SCOPE-05 a route answers 403 without its scope and passes with it |
| P3 | AUTH-03 | `backend-node/src/services/access-tokens.ts:73` | expired token accepted | ✅ Killed | authentication AUTH-03 AUTH-10 an expired token gets the same 401 |
| P4 | SCOPE-02 | `backend-node/src/plugins/workspace.ts:41` | other X-Workspace-Id no longer refused | ✅ Killed | the workspace of a token SCOPE-02 refuses another workspace in the header, even one the owner b |
| P5 | SCOPE-01,SCOPE-02 | `backend-node/src/plugins/workspace.ts:44` | token does not default to its workspace | ✅ Killed | the workspace of a token SCOPE-01 without the header uses the workspace of the token, not the d |
| P6 | MCP-02 | `backend-node/src/mcp/tools.ts:148` | tools/list filter removed | ✅ Killed | tools/list MCP-02 shows create_task only with tasks:create |
| P7 | MCP-06 | `backend-node/src/mcp/tools.ts:166` | tools/call scope check removed | ✅ Killed | failures MCP-06 list_lists without lists:read answers Missing scope |
| P8 | SCOPE-09 | `backend-node/src/routes/lists.ts:56` | preview not emptied | ✅ Killed | list_lists SCOPE-09 answers the lists with an empty preview without tasks:read |
| P9 | RATE-01 | `backend-node/src/plugins/token-auth.ts:52` | rate limit off by one | ✅ Killed | the rate limit RATE-01 REST and MCP count together |
| P10 | SCOPE-03 | `backend-node/src/plugins/token-auth.ts:59` | 404 exception of SCOPE-03 removed | ✅ Killed | deny by default a route that does not exist still answers 404 to a valid token |
| X2 | ORIGIN-02 | `backend-node/src/routes/focus.ts:36` | focus view starts carrying created_via | ✅ Killed | readFocusState FOCUS-02 without a session, shows the first pending task of Today |

**Sensor depth**: P0, 33 mutações manuais: 6 executadas agora e 27 reaproveitadas.
**Mutantes**: 33 killed, 0 survived. **Result**: ✅ PASS.

---

## Interactive UAT Results

Não realizado: este Verifier não tem usuário para conduzir o UAT. Seguem sem teste humano gerar e copiar um token no diálogo e conectar um cliente MCP real pela configuração mostrada (só o `Client` do SDK foi exercitado).

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ |
| Surgical changes | ✅ |
| No scope creep | ✅ |
| Matches patterns | ✅ |
| Spec-anchored outcome check (asserted values match spec) | ✅ |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ✅ |
| Every test maps to a spec requirement - no unclaimed tests | ⚠️ alguns testes de apoio sem ID, como nas iterações anteriores; o teste de MCP-14 traz o ID MCP-06 (Observação 2) |
| Documented guidelines followed: `.claude/skills/tlc-spec-driven/references/coding-principles.md` | ✅ |

---

## Edge Cases

- [x] AUTH-08, AUTH-09, AUTH-10, TOKEN-15, TOKEN-16, TOKEN-17, SCOPE-11: tratados e provados.
- [x] API-12, MCP-13, MCP-14: tratados e provados, com mutante morto em cada caminho novo.

---

## Gate Check

| Suíte | Comando | Exit | Contagem |
| ----- | ------- | ---- | -------- |
| backend lint | `npm --prefix backend-node run lint` | 0 | - |
| backend typecheck | `npm --prefix backend-node run typecheck` | 0 | - |
| backend test | `npm --prefix backend-node test -- --coverage` | 0 | 706 passed, 9 skipped; linhas 88,75% |
| backend Postgres real | `vitest run test/postgres` com `TEST_POSTGRES_URL`, no worktree em `2d92cb9` | 0 | 7 passed (PostgreSQL 14.18, cluster temporário, só TCP em 127.0.0.1:54397) |
| frontend lint | `npm --prefix frontend run lint` | 0 | - |
| frontend typecheck | `npm --prefix frontend run typecheck` | 0 | - |
| frontend test | `npm --prefix frontend test` | 0 | 1029 passed |
| frontend build | `npm --prefix frontend run build` | 0 | - |
| desktop test | `npm --prefix desktop test` | 0 | 250 passed, 3 skipped |
| CI | `python3 -m unittest discover .github/ci` | 0 | 15 passed |

- **Test count before feature**: backend 358, frontend 984 (medidos na iteração 1, em `80991dd`).
- **Test count after feature**: backend 715, frontend 1029, mais 7 em `test/postgres`.
- **Delta**: backend +357, frontend +45. Desde a iteração 2, backend +7 e frontend igual; a contagem não caiu.
- **Skipped tests**: backend 9, de um único arquivo; desktop 3. Mesmas contagens da iteração 2, que os atribuiu a `RedisStore` (exige `REDIS_URL`) e ao pacote gerado do desktop. Nesta iteração só conferi as contagens.
- **Failures**: nenhuma.

---

## Observações (fora do veredito)

1. **`GET`/`DELETE /api/mcp` com `tkz_` inválido respondem 401, sem teste.** Vale também com `Origin` estranho. Lidos sozinhos, MCP-10 pediria 405 e MCP-09 pediria 403, porque MCP-07 agora fala só de `POST`. Mas AUTH-02, AUTH-04 e AUTH-08 pedem 401 sem limitar a rota, e a premissa "Precedência em `/api/mcp`" da spec põe o 401 antes do `Origin`, e este antes do 405. O código segue essa ordem, por isso não contei como lacuna. A premissa ainda está com `Confirmed? n`. Para fechar: citar AUTH-02 nas exceções de MCP-09 e MCP-10 e fixar o 401 com um teste.
2. **MCP-14 sem o próprio ID**: o teste em `backend-node/test/mcp/create-task.test.ts:132` se chama "MCP-06 an idempotency_key...", e o ID MCP-14 não aparece em nenhum teste. `tasks.md` e `design.md` também não citam MCP-13 nem MCP-14, embora a spec os dê como mapeados a Tasks.
3. **Duas premissas da spec seguem com `Confirmed? n`**: `last_used_at` e precedência em `/api/mcp` (`spec.md:55-56`). Falta a confirmação do usuário.
4. **`update_task` com NUL não tem teste próprio**, embora o Fix 1 da iteração 2 o pedisse. Usa o mesmo `updateTaskBody` da rota, que tem teste (N07 e N08 morrem), e a sonda deu `isError: true`.
5. **`OPTIONS`**: a exceção de SCOPE-03 continua com asserção só sobre a lista de rotas (`backend-node/test/routes/token-scopes.test.ts:87`). O comportamento veio de sonda na iteração 2 e não foi repetido.
6. **Suítes lentas**: `data-transfer.test.ts` e `baseline.test.ts` estouraram o `hookTimeout` na iteração 2. Agora não apareceram, mas o sensor rodou só os arquivos relevantes e o gate rodou sozinho, então a causa segue não investigada.

---

## Fix Plans

Nenhum obrigatório. Sugestão opcional, pela Observação 1: decidir e registrar na spec a resposta de `GET`/`DELETE` com token inválido, com um teste que a fixe.

---

## Requirement Traceability Update

`spec.md` não foi alterado: este Verifier escreve só este relatório e as lições.

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| API-12, MCP-13, MCP-09 | ❌ Needs Fix | ✅ Verified |
| MCP-14 | novo | ✅ Verified |
| Os outros 85 | ✅ Verified | ✅ Verified |

---

## Lições

Nenhuma lição nova: esta iteração não teve falha, sobrevivente nem lacuna de precisão marcada. A Observação 1 é uma decisão de spec ainda em aberto, sem falha verificada que a sustente como lição. L-023, L-024 e L-025 seguem candidatas, e o commit as aplicou.

---

## Summary

**Overall**: ✅ Ready, pelo critério automatizado. Falta o UAT humano.

**Spec-anchored check**: 89/89 com resultado da spec; 0 lacunas de precisão marcadas.
**Sensor**: 33/33 mutações killed (6 executadas agora, 27 reaproveitadas), 0 survived.
**Gate**: todas as suítes com exit 0.

**What works**: autenticação, negação por padrão, escopo, workspace, limite de requisições sem contorno por lote, NUL em todos os campos de texto, idempotência, origem da tarefa, servidor MCP e diálogo.

**Not verified**: Postgres 16 (só 14.18 nesta máquina); `RedisStore` (exige `REDIS_URL`); cliente MCP real além do `Client` do SDK; UAT humano.

**Next steps**: conduzir o UAT humano e decidir a Observação 1.
