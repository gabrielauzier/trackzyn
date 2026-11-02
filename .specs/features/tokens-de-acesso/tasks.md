# Tokens de acesso pessoal Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/tokens-de-acesso/design.md`
**Status**: In Progress

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `CONTRIBUTING.md`, `backend-node/vitest.config.ts` (60% de linhas), `.github/workflows/ci.yml`. Onde os guias não definem profundidade, valem os padrões fortes da skill.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Concorrência | integration (Postgres real, `TEST_POSTGRES_URL`) | As corridas que a spec exige: TOKEN-15, TOKEN-16, IDEM-01 | `backend-node/test/postgres/*.test.ts` | `TEST_POSTGRES_URL=... npm --prefix backend-node test` |
| CI | unit (`unittest`) | O job tem o serviço e passa a variável | `.github/ci/test_*.py` | `python3 -m unittest discover .github/ci` |
| Schema e migrations | integration (PGlite) | Cascatas, `SET NULL`, colunas iguais a `pg-columns.json` | `backend-node/test/db/*.test.ts` | `npm --prefix backend-node test` |
| Serviços do backend | integration (PGlite) | Todos os ramos; 1:1 com os ACs; concorrência real onde a spec pede | `backend-node/test/services/*.test.ts` | `npm --prefix backend-node test` |
| Plugins e guards | integration (`app.inject`) | Todos os ramos: feliz, cada 401, 403, 404 e 429 | `backend-node/test/plugins/*.test.ts` | `npm --prefix backend-node test` |
| Rotas do backend | integration (`app.inject`) | Feliz + bordas + erros de cada rota tocada | `backend-node/test/routes/*.test.ts` | `npm --prefix backend-node test` |
| Servidor MCP | integration (`Client` do SDK contra servidor real) | Cada ferramenta: feliz, escopo, papel e validação | `backend-node/test/mcp/*.test.ts` | `npm --prefix backend-node test` |
| Build do desktop | integration | O bundle não contém o SDK e o modo local sobe | `desktop/scripts/*.test.ts` | `npm --prefix desktop test` |
| Componentes do frontend | unit (Testing Library) | Cada AC visível, estados vazios e de erro, nos dois idiomas | `frontend/src/**/*.test.tsx` | `npm --prefix frontend test` |
| Cliente HTTP e tipos | none | build gate (typecheck) | - | `npm --prefix frontend run typecheck` |
| Documentação | none | - | - | - |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Tasks de tipos e componentes do frontend | `npm --prefix frontend test` |
| Full | Tasks do backend | `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test -- --coverage` |
| Build | Fim de cada fase | o Full acima + `npm --prefix frontend run lint && npm --prefix frontend run typecheck && npm --prefix frontend test && npm --prefix frontend run build` |

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Tokens no banco e rotas de gestão

```
T1 → T2 → T3 → T4 → T5
T29 → T3
```

### Phase 2: Autenticação e autorização

```
T6 → T7 → T8 → T9
T6 → T10
```

### Phase 3: Criar tarefas por token

```
T11 → T12 → T13
T11 → T14 → T15
```

### Phase 4: Servidor MCP

```
T16 → T17 → T18 → T19
T16 → T20
```

### Phase 5: Interface e documentação

```
T21 → T22 → T23 → T24 → T25
T21 → T26 → T27
T28
```

---

## Task Breakdown

### Phase 1: Tokens no banco e rotas de gestão

#### T1: Criar as tabelas e a coluna de origem

**What**: Adicionar `personal_access_tokens`, `task_idempotency_keys` e `tasks.created_via_token_id` com o índice parcial, gerar a migration `0004` e regenerar `pg-columns.json` num Postgres 16, como nas features anteriores.
**Where**: `backend-node/src/db/schema.ts`
**Depends on**: None
**Reuses**: Modelos de `design.md`; `test/db/completed-by-schema.test.ts`
**Requirement**: AUTH-06, AUTH-07, ORIGIN-05

**Tools**:

- MCP: NONE
- Skill: `supabase-postgres-best-practices`

**Done when**:

- [x] Excluir o usuário ou o workspace apaga os tokens e, com eles, as chaves de idempotência
- [x] Apagar um token deixa `tasks.created_via_token_id` nulo e mantém a tarefa
- [x] Excluir uma tarefa mantém a linha de `task_idempotency_keys`
- [x] Gate check passes: Full
- [x] Test count: a contagem do backend só aumenta

**Status**: ✅ Done

**Tests**: integration
**Gate**: full

**Commit**: `feat(tokens): add access token tables and task origin column`

---

#### T2: Gerar e autenticar tokens

**What**: Criar `services/access-tokens.ts` com `TOKEN_SCOPES`, a geração do valor `tkz_`, o hash, `tokenStatus` e `authenticate`.
**Where**: `backend-node/src/services/access-tokens.ts`
**Depends on**: T1
**Reuses**: `randomBytes` e `createHash` de `node:crypto`
**Requirement**: TOKEN-04, TOKEN-05, MANAGE-02, MANAGE-03, AUTH-01, AUTH-02, AUTH-03, AUTH-05, AUTH-08, AUTH-10

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] O valor casa com `^tkz_[A-Za-z0-9_-]{43}$`, e dois valores gerados nunca coincidem
- [x] A linha guarda o SHA-256 e os 4 últimos caracteres, nunca o valor
- [x] `authenticate` devolve nulo para token inexistente, malformado, revogado, expirado e de dono inativo
- [x] `expires_at` igual ao instante atual conta como expirado (AUTH-10)
- [x] `tokenStatus` prioriza `revoked` sobre `expired`
- [x] Gate check passes: Full
- [x] Test count: a contagem do backend só aumenta

**Status**: ✅ Done

**Tests**: integration
**Gate**: full

**Commit**: `feat(tokens): generate and authenticate access tokens`

---

#### T3: Criar token com limites

**What**: Implementar `createToken` numa transação que trava a linha do usuário, confere o nome, o limite de 50, o membro do workspace e o papel.
**Where**: `backend-node/src/services/access-tokens.ts` (modify)
**Depends on**: T2, T29
**Reuses**: `getMembership`, `isWorkspaceManager` de `services/workspaces.ts`
**Requirement**: TOKEN-03, TOKEN-08, TOKEN-09, TOKEN-10, TOKEN-11, TOKEN-15, TOKEN-16

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Nome repetido entre ativos dá 409 `Token name already in use`; repetir o nome de um revogado ou expirado é aceito
- [x] O 51º token ativo dá 409 `Token limit reached`
- [x] Workspace de que o usuário não é membro dá 404 `Workspace not found`
- [x] Um `viewer` que pede escopo de escrita recebe 403 `Read-only role`; só leitura é aceito
- [x] Criações simultâneas nunca passam de 50 ativos nem repetem nome (TOKEN-15, TOKEN-16), provado com `Promise.all` no Postgres de T29
- [x] Gate check passes: Full
- [x] Test count: a contagem do backend só aumenta

**Status**: ✅ Done

**Tests**: integration
**Gate**: full, com `TEST_POSTGRES_URL` definida

**Commit**: `feat(tokens): create tokens with name, limit and role checks`

---

#### T4: Listar, revogar e limpar

**What**: Implementar `listTokens`, `revokeToken` e `purgeEnded`, chamando a limpeza em `createToken` e `revokeToken`.
**Where**: `backend-node/src/services/access-tokens.ts` (modify)
**Depends on**: T3
**Reuses**: `now` injetado, como em `services/tasks.ts`
**Requirement**: MANAGE-01, MANAGE-05, MANAGE-06, MANAGE-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] A lista traz só os tokens do usuário, com todos os campos de MANAGE-01 e nenhum com hash ou valor
- [x] Revogar de novo não altera `revoked_at`; revogar um expirado preenche `revoked_at`
- [x] Revogar token de outro usuário dá 404
- [x] Um token com 90 dias do fim é apagado na próxima escrita; com 89 dias, fica
- [x] Gate check passes: Full
- [x] Test count: a contagem do backend só aumenta

**Status**: ✅ Done

**Tests**: integration
**Gate**: full

**Commit**: `feat(tokens): list, revoke and purge access tokens`

---

#### T5: Expor as rotas de gestão

**What**: Criar `POST`, `GET` e `DELETE` de `/api/tokens` e registrá-las em `app.ts`.
**Where**: `backend-node/src/routes/access-tokens.ts`
**Depends on**: T4
**Reuses**: Padrão de `routes/lists.ts`, `requireUser`
**Requirement**: TOKEN-03, TOKEN-07, MANAGE-01, MANAGE-04, MANAGE-06, AUTH-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `POST` responde 201 com id, token completo e `expires_at`, para 30, 90 e 365 dias
- [x] Nome vazio ou com 101 caracteres, `scopes` vazio, escopo desconhecido e `expires_in_days` igual a 60 dão 422 no formato atual
- [x] `GET` nunca devolve o valor completo
- [x] `DELETE` responde 204
- [x] As três rotas respondem 401 sem sessão e com JWT expirado
- [x] Gate check passes: Build
- [x] Test count: a contagem do backend só aumenta

**Status**: ✅ Done

**Tests**: integration
**Gate**: build

**Commit**: `feat(tokens): add token management routes`

---

#### T29: Rodar testes de concorrência em Postgres real

**What**: Adicionar o serviço `postgres:16` ao job `backend-node-tests`, passar `TEST_POSTGRES_URL` e criar o helper que aplica as migrations num banco real, seguindo o padrão do `REDIS_URL`: sem a variável, esses testes não são coletados.
**Where**: `.github/workflows/ci.yml`
**Depends on**: None
**Reuses**: Serviço `redis` do job, `connectPostgres`, `applyMigrations`, `.github/ci/test_workflow_jobs.py`
**Requirement**: TOKEN-15, TOKEN-16, IDEM-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] O job do CI sobe o Postgres 16 e `test_workflow_jobs.py` confirma o serviço e a variável
- [x] Um teste de fumaça prova que duas transações reais esperam uma pela outra numa trava `FOR UPDATE`
- [x] Sem `TEST_POSTGRES_URL`, os testes não são coletados e a suíte de PGlite segue igual
- [x] Com a variável definida localmente, os testes rodam num Postgres 16 limpo
- [x] Gate check passes: Full com `TEST_POSTGRES_URL` definida + `python3 -m unittest discover .github/ci`

**Status**: ✅ Done

**Nota**: SPEC_DEVIATION: localmente os testes rodaram num Postgres 14.18, porque o daemon do Docker estava parado e não havia um 16. O CI usa `postgres:16`. Sem a variável, `vitest.config.ts` exclui `test/postgres/**`, então esses testes não aparecem nem como pulados. O helper cria um banco novo a cada teste e o apaga no fim.

**Tests**: integration
**Gate**: full

**Commit**: `test(backend): run concurrency tests on a real postgres`

---

### Phase 2: Autenticação e autorização

#### T6: Hook de autenticação por token

**What**: Criar `plugins/token-auth.ts`, com autenticação, limite de requisições, `last_used_at`, log e negação por padrão, e fazer `requireUser` e `requireSuperuser` aceitarem o principal.
**Where**: `backend-node/src/plugins/token-auth.ts`
**Depends on**: T2
**Reuses**: `rateLimitHit`, `HttpError`, `decorateRequest` de `plugins/auth.ts`
**Requirement**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-08, AUTH-10, SCOPE-03, SCOPE-05, SCOPE-06, RATE-01, OBS-01, MANAGE-07

**Tools**:

- MCP: NONE
- Skill: `security-best-practices`

**Done when**:

- [ ] Todo caso inválido dá o mesmo 401 com `WWW-Authenticate: Bearer`
- [ ] A requisição seguinte à revogação já dá 401
- [ ] `GET /api/users/me`, `/api/tokens`, `/api/admin/*`, `/api/health` e `/api/info` dão 403 `Route not available for tokens` com token válido
- [ ] Rota de teste com `tokenScope` responde 403 `Missing scope: x` sem o escopo e passa com ele
- [ ] A 60ª requisição em 60 s passa; a 61ª dá 429 com `Retry-After: 60`; outro token não é afetado
- [ ] `last_used_at` só é regravado depois de 60 s
- [ ] Um teste captura o log: tem `token_id` e `user_id`, e não tem o valor do token
- [ ] A suíte de JWT que já existe passa sem mudança
- [ ] Gate check passes: Full
- [ ] Test count: a contagem do backend só aumenta

**Tests**: integration
**Gate**: full

**Commit**: `feat(tokens): authenticate tkz tokens and deny routes by default`

---

#### T7: Fixar o workspace do token

**What**: Fazer `workspaceContext` usar o workspace do token e recusar `X-Workspace-Id` diferente.
**Where**: `backend-node/src/plugins/workspace.ts`
**Depends on**: T6
**Reuses**: As checagens atuais de membro e de arquivado; `test/support/roles.ts`
**Requirement**: SCOPE-01, SCOPE-02, SCOPE-07, SCOPE-08, SCOPE-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Sem o cabeçalho, usa o workspace do token mesmo que o padrão do usuário seja outro
- [ ] Cabeçalho igual é aceito; diferente dá 403 `Token is bound to another workspace`
- [ ] Membro removido e workspace arquivado dão 404 `Workspace not found`
- [ ] Rebaixar o dono a `viewer` faz a requisição seguinte de escrita dar 403 `Read-only role`
- [ ] Gate check passes: Full
- [ ] Test count: a contagem do backend só aumenta

**Tests**: integration
**Gate**: full

**Commit**: `feat(tokens): bind token requests to their workspace`

---

#### T8: Declarar os escopos nas rotas

**What**: Adicionar `config.tokenScope` às 14 rotas da tabela, aplicar SCOPE-09 em `GET /api/lists` e escrever o teste que percorre todas as rotas registradas.
**Where**: `backend-node/test/routes/token-scopes.test.ts`
**Depends on**: T7
**Reuses**: `onRoute` do Fastify; `routes/lists.ts`, `routes/board.ts`, `routes/tasks.ts`
**Requirement**: SCOPE-03, SCOPE-04, SCOPE-05, SCOPE-09, SCOPE-10

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] O teste compara as rotas com `tokenScope` à tabela da spec e falha se houver qualquer diferença
- [ ] Toda rota registrada fora da tabela responde 403 a um token válido
- [ ] Cada rota da tabela dá 403 `Missing scope` sem o escopo e não dá 403 com ele
- [ ] `GET /api/lists` devolve `preview` vazio sem `tasks:read` e preenchido com ele; com JWT, segue preenchido
- [ ] Gate check passes: Full
- [ ] Test count: a contagem do backend só aumenta

**Tests**: integration
**Gate**: full

**Commit**: `feat(tokens): declare token scopes on list, board and task routes`

---

#### T9: Documentar no OpenAPI

**What**: Envolver `jsonSchemaTransform` para preencher `security` e o escopo exigido, e declarar o `securityScheme`.
**Where**: `backend-node/src/app.ts`
**Depends on**: T8
**Reuses**: `route` recebido por `transform` em `@fastify/swagger`
**Requirement**: API-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `/api/openapi.json` traz o esquema `personalAccessToken`
- [ ] Cada rota da tabela traz o escopo na descrição e `security`; as demais não trazem
- [ ] Gate check passes: Full
- [ ] Test count: a contagem do backend só aumenta

**Tests**: integration
**Gate**: full

**Commit**: `docs(api): describe token auth and scopes in openapi`

---

#### T10: Desligar tokens no modo local

**What**: Adicionar `PERSONAL_TOKENS_ENABLED` em `config.ts`, não registrar rotas e hook quando falso, informar `features.personal_tokens` em `/api/info` e passar falso em `local-server.ts`.
**Where**: `backend-node/src/config.ts`
**Depends on**: T6
**Reuses**: `features` de `routes/info.ts`; `test/local/local-server.test.ts`
**Requirement**: TOKEN-13

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] No modo local, `/api/tokens` responde 404 com o token de sessão local
- [ ] `/api/info` traz `personal_tokens: false` no modo local e `true` no servidor
- [ ] Sem a variável, o padrão é ligado
- [ ] Gate check passes: Build
- [ ] Test count: a contagem do backend só aumenta

**Tests**: integration
**Gate**: build

**Commit**: `feat(tokens): disable access tokens in local mode`

---

### Phase 3: Criar tarefas por token

#### T11: Ampliar `createTask`

**What**: Aceitar `id`, `notes`, `subtasks`, `createdViaTokenId` e `rejectArchived`, tudo na mesma transação.
**Where**: `backend-node/src/services/tasks.ts`
**Depends on**: None
**Reuses**: `lockList`, `createTask` atual
**Requirement**: API-03, API-04, API-05, API-07, API-09, API-10, ORIGIN-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] As subtarefas ficam com `position` 0..n-1 na ordem enviada
- [ ] Uma falha forçada na gravação de uma subtarefa não deixa tarefa nem subtarefa no banco
- [ ] `rejectArchived` dá 409 `List is archived`; sem a opção, o comportamento atual continua
- [ ] Criar em `done` grava `completed_by_user_id` do dono
- [ ] Gate check passes: Full
- [ ] Test count: a contagem do backend só aumenta

**Tests**: integration
**Gate**: full

**Commit**: `feat(tasks): accept notes, subtasks and token origin on create`

---

#### T12: Criação com idempotência

**What**: Criar `createTaskFromToken` com os cinco passos do design.
**Where**: `backend-node/src/services/task-intake.ts`
**Depends on**: T11
**Reuses**: `createTask`, `getTask`, padrão de `focus_actions`
**Requirement**: API-09, IDEM-01, IDEM-02, IDEM-03, IDEM-04, IDEM-06, IDEM-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] 10 chamadas simultâneas com a mesma chave criam uma tarefa e devolvem o mesmo id, provado no Postgres de T29
- [ ] Mesma chave com corpo diferente dá 409; tarefa excluída dá 410
- [ ] Com 24h exatas, a chave ainda vale ou não conforme `created_at + 24h`, testado nos dois lados do limite com `now` injetado
- [ ] Dois tokens com a mesma chave criam duas tarefas
- [ ] Sem chave, cada chamada cria uma tarefa
- [ ] Gate check passes: Full
- [ ] Test count: a contagem do backend só aumenta

**Tests**: integration
**Gate**: full, com `TEST_POSTGRES_URL` definida

**Commit**: `feat(tasks): create tasks from tokens with idempotency keys`

---

#### T13: Ampliar `POST /api/tasks`

**What**: Tornar `column` opcional, aceitar `notes` e `subtasks` e, com token, ler `Idempotency-Key` e chamar `createTaskFromToken`.
**Where**: `backend-node/src/routes/tasks.ts`
**Depends on**: T12
**Reuses**: Schemas atuais da rota; formato de validação de `plugins/errors.ts`
**Requirement**: API-01, API-02, API-03, API-04, API-05, API-06, API-08, IDEM-02, IDEM-05, IDEM-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Só `list_id` e `title` criam no fim de `backlog`; com `column`, no fim dessa coluna
- [ ] 51 subtarefas, notas com 10 001 caracteres, estimativa 0 e 1441 dão 422 sem criar nada
- [ ] Lista de outro workspace dá 404
- [ ] O reenvio responde 201 com `Idempotency-Replayed: true`
- [ ] Chave vazia ou com 256 caracteres dá 422
- [ ] Com JWT, `Idempotency-Key` é ignorado: dois envios criam duas tarefas, e uma chave inválida não dá 422
- [ ] A sessão de login também envia `notes` e `subtasks`; os testes atuais da rota passam sem mudança
- [ ] Gate check passes: Full
- [ ] Test count: a contagem do backend só aumenta

**Tests**: integration
**Gate**: full

**Commit**: `feat(tasks): extend task creation route for automation`

---

#### T14: Devolver a origem nas respostas de tarefa

**What**: Resolver `createdVia` em `getTask` e em `createTask`, devolver `created_via` em `toTaskRead` e manter nulo na cópia de `duplicateTask`.
**Where**: `backend-node/src/services/tasks.ts` (modify)
**Depends on**: T11
**Reuses**: `getTask`, `toTaskRead`
**Requirement**: ORIGIN-02, ORIGIN-04, ORIGIN-05, ORIGIN-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Tarefa criada por token traz `created_via` com o nome; criada por sessão traz `null`
- [ ] Revogar o token mantém o nome; apagar o token deixa `null` e mantém a tarefa
- [ ] Editar e mover mantêm o valor; a cópia duplicada fica `null`, inclusive quando duplicada por token
- [ ] Gate check passes: Full
- [ ] Test count: a contagem do backend só aumenta

**Tests**: integration
**Gate**: full

**Commit**: `feat(tasks): return token origin on task responses`

---

#### T15: Devolver a origem no quadro

**What**: Fazer `LEFT JOIN` com o token na consulta do quadro e devolver `created_via` em `TaskCardView` e no schema da rota.
**Where**: `backend-node/src/services/board.ts`
**Depends on**: T14
**Reuses**: Consulta de `buildBoard`
**Requirement**: ORIGIN-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] O quadro traz `created_via` em todas as colunas, inclusive `done`
- [ ] Somas e contadores do quadro seguem iguais, com os testes atuais sem mudança
- [ ] Gate check passes: Build
- [ ] Test count: a contagem do backend só aumenta

**Tests**: integration
**Gate**: build

**Commit**: `feat(board): return token origin on board cards`

---

### Phase 4: Servidor MCP

#### T16: Provar o transporte MCP

**What**: Instalar `@modelcontextprotocol/sdk@1.32.2` sem `^` e criar `routes/mcp.ts` com `requireToken`, a checagem de `Origin`, o 405 e o `initialize`, sem ferramentas ainda.
**Where**: `backend-node/src/routes/mcp.ts`
**Depends on**: None
**Reuses**: `Server` e `StreamableHTTPServerTransport` do SDK; `PERSONAL_TOKENS_ENABLED`
**Requirement**: MCP-01, MCP-07, MCP-08, MCP-09, MCP-10, MCP-11, TOKEN-13

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] O `Client` do SDK, com `StreamableHTTPClientTransport`, conclui `initialize` contra o app ouvindo numa porta real, não por `inject`
- [ ] Sem token e com JWT, a resposta é 401 com `WWW-Authenticate: Bearer`
- [ ] `Origin` diferente de `FRONTEND_URL` dá 403; sem `Origin`, passa
- [ ] `GET` e `DELETE` dão 405
- [ ] Duas requisições seguidas não dependem de estado anterior
- [ ] Com o flag desligado, `/api/mcp` responde 404
- [ ] Gate check passes: Full
- [ ] Test count: a contagem do backend só aumenta

**Tests**: integration
**Gate**: full

**Commit**: `feat(mcp): serve stateless streamable http transport`

---

#### T17: Ferramentas de leitura

**What**: Criar `mcp/tools.ts` com o registro de ferramentas, o filtro de `tools/list`, a conversão de erros e as ferramentas `list_lists`, `get_board` e `get_task`.
**Where**: `backend-node/src/mcp/tools.ts`
**Depends on**: T16
**Reuses**: `listLists`, `buildBoard`, `getTask`, `toItem` exportada de `plugins/errors.ts`
**Requirement**: MCP-02, MCP-06, SCOPE-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `tools/list` devolve só as ferramentas dos escopos do token
- [ ] Chamar ferramenta sem o escopo devolve `isError: true` com `Missing scope: x`
- [ ] Recurso inexistente e argumento inválido devolvem `isError: true` com o texto da rota REST
- [ ] `list_lists` devolve `preview` vazio sem `tasks:read`
- [ ] Gate check passes: Full
- [ ] Test count: a contagem do backend só aumenta

**Tests**: integration
**Gate**: full

**Commit**: `feat(mcp): add read tools filtered by token scope`

---

#### T18: Ferramenta `create_task`

**What**: Adicionar `create_task` com os campos de `POST /api/tasks` e `idempotency_key`, chamando `createTaskFromToken`.
**Where**: `backend-node/src/mcp/tools.ts` (modify)
**Depends on**: T17
**Reuses**: `createTaskFromToken`, schema de criação exportado de `routes/tasks.ts`
**Requirement**: MCP-03, MCP-04, MCP-05, ORIGIN-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] O schema em `tools/list` traz os mesmos campos e limites da rota, mais `idempotency_key`
- [ ] A tarefa criada aparece no quadro com `created_via`
- [ ] A mesma chave não duplica; a mesma chave usada em REST e em MCP pelo mesmo token também não
- [ ] Lista arquivada devolve `isError: true` com `List is archived`
- [ ] Um `viewer` com escopo de escrita recebe `isError: true` com `Read-only role`
- [ ] Gate check passes: Full
- [ ] Test count: a contagem do backend só aumenta

**Tests**: integration
**Gate**: full

**Commit**: `feat(mcp): add create_task tool`

---

#### T19: Ferramentas de escrita e exclusão

**What**: Adicionar `update_task`, `move_task`, `add_subtask` e `delete_task`.
**Where**: `backend-node/src/mcp/tools.ts` (modify)
**Depends on**: T18
**Reuses**: `updateTask`, `moveTask`, `createSubtask`, `deleteTask`
**Requirement**: MCP-02, MCP-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Cada ferramenta aplica a mudança e aparece só com o escopo certo
- [ ] `delete_task` não aparece sem `tasks:delete`
- [ ] Tarefa de outro workspace devolve `isError: true` com `Task not found`
- [ ] Um `viewer` recebe `Read-only role` em todas
- [ ] Gate check passes: Build
- [ ] Test count: a contagem do backend só aumenta

**Tests**: integration
**Gate**: build

**Commit**: `feat(mcp): add task write and delete tools`

---

#### T20: Tirar o SDK do bundle do desktop

**What**: Marcar o SDK como `external` em `build-backend.mjs`, para que ele não entre no modo local.
**Where**: `desktop/scripts/build-backend.mjs`
**Depends on**: T16
**Reuses**: Lista `external` atual; `desktop/scripts/builder-config.test.ts`
**Requirement**: TOKEN-13

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Um teste confirma que o bundle gerado não contém o código do SDK
- [ ] O backend empacotado sobe sem o SDK instalado e responde 404 em `/api/mcp`
- [ ] Gate check passes: `npm --prefix desktop test`
- [ ] Test count: a contagem do desktop só aumenta

**Tests**: integration
**Gate**: build

**Commit**: `build(desktop): keep the mcp sdk out of the local backend`

---

### Phase 5: Interface e documentação

#### T21: Cliente HTTP e tipos

**What**: Adicionar o grupo `accessTokens` em `lib/api.ts` e os tipos de token, além de `created_via` em tarefa e cartão.
**Where**: `frontend/src/lib/api.ts`
**Depends on**: None
**Reuses**: Grupos atuais de `lib/api.ts`, `frontend/src/types/index.ts`
**Requirement**: TOKEN-03, MANAGE-01, ORIGIN-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Typecheck passa com os novos tipos e `created_via` nulo nos fixtures atuais
- [ ] Gate check passes: Quick + `npm --prefix frontend run typecheck`

**Tests**: none
**Gate**: quick

**Commit**: `feat(web): add access token api client and types`

---

#### T22: Diálogo com lista e revogação

**What**: Criar `access-tokens-dialog.tsx` com a lista, os estados e a revogação com confirmação, com textos em `en.json` e `pt-BR.json`.
**Where**: `frontend/src/components/access-tokens-dialog.tsx`
**Depends on**: T21
**Reuses**: `passkey-management-dialog.tsx`, diálogo de confirmação existente
**Requirement**: TOKEN-01, TOKEN-12, MANAGE-04

**Tools**:

- MCP: NONE
- Skill: `react-best-practices`

**Done when**:

- [ ] Mostra nome, workspace, escopos, `display_hint`, expiração, último uso e estado de cada token
- [ ] Sem tokens, mostra o estado vazio com `Gerar token`
- [ ] Revogar pede confirmação e atualiza a linha para `revoked`
- [ ] Erro de rede mostra a mensagem de `extractApiError`
- [ ] Os testes de paridade de `locales` passam
- [ ] Gate check passes: Quick
- [ ] Test count: a contagem do frontend só aumenta

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): list and revoke access tokens`

---

#### T23: Formulário de gerar token

**What**: Adicionar o formulário com nome, workspace, escopos e validade, com os valores iniciais da spec e o aviso sobre o nome visível.
**Where**: `frontend/src/components/access-tokens-dialog.tsx` (modify)
**Depends on**: T22
**Reuses**: Componentes `Input`, `Label`, `Checkbox`, `Select`; lista de workspaces do `workspace-switcher`
**Requirement**: TOKEN-02, TOKEN-12, ORIGIN-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Abre com o workspace atual, `lists:read` e `tasks:create` marcados e 90 dias
- [ ] O aviso de ORIGIN-07 aparece no formulário
- [ ] Nome repetido, limite e `Read-only role` mostram a mensagem no formulário, que continua aberto
- [ ] Sem nenhum escopo, o envio fica desabilitado
- [ ] Gate check passes: Quick
- [ ] Test count: a contagem do frontend só aumenta

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): add form to generate access tokens`

---

#### T24: Mostrar o token uma única vez

**What**: Mostrar o token criado com o botão de copiar, o aviso, o exemplo de `curl` e a configuração MCP, guardando o valor só no estado do componente.
**Where**: `frontend/src/components/access-tokens-dialog.tsx` (modify)
**Depends on**: T23
**Reuses**: `sonner` para confirmar a cópia
**Requirement**: TOKEN-06, TOKEN-12, MCP-12

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] O valor aparece com o aviso `Copie agora; este token não será mostrado de novo`
- [ ] Copiar grava o valor na área de transferência
- [ ] A tela mostra a URL de `/api/mcp` e a configuração com o cabeçalho `Authorization`
- [ ] Fechar e reabrir o diálogo não mostra o valor, e ele não aparece em `localStorage` nem no cache do TanStack Query
- [ ] Gate check passes: Quick
- [ ] Test count: a contagem do frontend só aumenta

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): show a new access token once with setup examples`

---

#### T25: Item no menu da conta

**What**: Adicionar `Tokens de acesso` ao menu, condicionado a `features.personal_tokens`, e abrir o diálogo a partir de `app-layout.tsx`.
**Where**: `frontend/src/components/workspace-switcher.tsx`
**Depends on**: T24
**Reuses**: `onPasskeys`, `useFeatureFlags`
**Requirement**: TOKEN-01, TOKEN-14

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Com o flag ligado, o item aparece e abre o diálogo
- [ ] Com o flag desligado, o item não aparece
- [ ] Gate check passes: Quick
- [ ] Test count: a contagem do frontend só aumenta

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): open access tokens from the account menu`

---

#### T26: Selo no cartão

**What**: Mostrar `via <nome>` em `task-card.tsx` quando `created_via` não é nulo.
**Where**: `frontend/src/components/board/task-card.tsx`
**Depends on**: T21
**Reuses**: `task-card.test.tsx`, chaves de `locales`
**Requirement**: ORIGIN-03, TOKEN-12

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] O selo aparece com `created_via` e não aparece com `null`
- [ ] O selo aparece também com `canWrite` falso
- [ ] Um nome de 100 caracteres não quebra o layout do cartão, com truncamento e `title`
- [ ] Gate check passes: Quick
- [ ] Test count: a contagem do frontend só aumenta

**Tests**: unit
**Gate**: quick

**Commit**: `feat(board): show token origin on task cards`

---

#### T27: Selo no diálogo da tarefa

**What**: Mostrar `via <nome>` em `task-dialog.tsx`.
**Where**: `frontend/src/components/board/task-dialog.tsx`
**Depends on**: T26
**Reuses**: `task-dialog.test.tsx`
**Requirement**: ORIGIN-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] O selo aparece com `created_via` e não aparece com `null`
- [ ] Gate check passes: Build
- [ ] Test count: a contagem do frontend só aumenta

**Tests**: unit
**Gate**: build

**Commit**: `feat(board): show token origin on the task dialog`

---

#### T28: Guia de uso

**What**: Escrever o guia de automação com `curl`, escopos, idempotência e configuração MCP, incluindo que o cliente precisa enviar o cabeçalho `Authorization`, e citá-lo no `README.md`.
**Where**: `docs/tokens-de-acesso.md`
**Depends on**: None
**Reuses**: Tabela "Escopos e rotas" da spec
**Requirement**: API-11, MCP-12

**Tools**:

- MCP: NONE
- Skill: `docs-writer`

**Done when**:

- [ ] O `curl` do guia, executado contra o servidor de desenvolvimento, cria uma tarefa
- [ ] A configuração MCP do guia conecta ao servidor de desenvolvimento usando o `Client` do SDK
- [ ] Gate check passes: Build

**Tests**: none
**Gate**: build

**Commit**: `docs: add access token and mcp guide`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phase 1:  T1 → T2 → T3 → T4 → T5
          T29 → T3
Phase 2:  T6 → T7 → T8 → T9
          T6 → T10
Phase 3:  T11 → T12 → T13
          T11 → T14 → T15
Phase 4:  T16 → T17 → T18 → T19
          T16 → T20
Phase 5:  T21 → T22 → T23 → T24 → T25
          T21 → T26 → T27
          T28
```

Execution is strictly sequential: uma tarefa por vez, na ordem. São 29 tarefas, divididas em 5 lotes de fases inteiras. Na Phase 1, T29 roda antes de T3.

| Lote | Fases | Tarefas | Nível sugerido |
| ---- | ----- | ------- | -------------- |
| 1 | Phase 1 | T1 a T5, T29 | Médio |
| 2 | Phase 2 | T6 a T10 | Alto: segurança |
| 3 | Phase 3 | T11 a T15 | Alto: concorrência |
| 4 | Phase 4 | T16 a T20 | Alto: integração não provada |
| 5 | Phase 5 | T21 a T28 | Médio |

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | Schema e sua migration | ✅ Granular |
| T2, T3, T4 | Um grupo de funções do mesmo service | ✅ Granular |
| T5 | Um arquivo de rotas | ✅ Granular |
| T6 | Um hook e o ajuste nos guards que o tornam testável | ⚠️ Coeso |
| T7 | Um guard | ✅ Granular |
| T8 | Uma linha de `config` em 14 rotas e um teste | ⚠️ Coeso: mudança mecânica, com a prova junto |
| T9, T10 | Uma configuração | ✅ Granular |
| T11 a T15 | Uma função ou rota | ✅ Granular |
| T16 | Uma rota | ✅ Granular |
| T17, T18, T19 | Um grupo de ferramentas | ✅ Granular |
| T20 | Um script | ✅ Granular |
| T21 a T27 | Um componente ou uma etapa dele | ✅ Granular |
| T28 | Um documento | ✅ Granular |
| T29 | Um serviço de CI e o helper que o usa | ⚠️ Coeso |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | Início da Phase 1 | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2, T29 | T2 → T3, T29 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T29 | None | Início da Phase 1, antes de T3 | ✅ Match |
| T6 | T2 | Início da Phase 2; dependência de fase anterior | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |
| T10 | T6 | T6 → T10 | ✅ Match |
| T11 | None | Início da Phase 3 | ✅ Match |
| T12 | T11 | T11 → T12 | ✅ Match |
| T13 | T12 | T12 → T13 | ✅ Match |
| T14 | T11 | T11 → T14 | ✅ Match |
| T15 | T14 | T14 → T15 | ✅ Match |
| T16 | None | Início da Phase 4 | ✅ Match |
| T17 | T16 | T16 → T17 | ✅ Match |
| T18 | T17 | T17 → T18 | ✅ Match |
| T19 | T18 | T18 → T19 | ✅ Match |
| T20 | T16 | T16 → T20 | ✅ Match |
| T21 | None | Início da Phase 5 | ✅ Match |
| T22 | T21 | T21 → T22 | ✅ Match |
| T23 | T22 | T22 → T23 | ✅ Match |
| T24 | T23 | T23 → T24 | ✅ Match |
| T25 | T24 | T24 → T25 | ✅ Match |
| T26 | T21 | T21 → T26 | ✅ Match |
| T27 | T26 | T26 → T27 | ✅ Match |
| T28 | None | Sozinha na Phase 5 | ✅ Match |

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Schema | integration | integration | ✅ OK |
| T2, T3, T4 | Serviço | integration | integration | ✅ OK |
| T5 | Rota | integration | integration | ✅ OK |
| T6, T7 | Plugin e guard | integration | integration | ✅ OK |
| T8, T9, T10 | Rota e configuração | integration | integration | ✅ OK |
| T11, T12, T14, T15 | Serviço | integration | integration | ✅ OK |
| T13 | Rota | integration | integration | ✅ OK |
| T16 a T19 | Servidor MCP | integration | integration | ✅ OK |
| T20 | Build do desktop | integration | integration | ✅ OK |
| T21 | Cliente HTTP e tipos | none | none | ✅ OK |
| T22 a T27 | Componente | unit | unit | ✅ OK |
| T28 | Documentação | none | none | ✅ OK |
| T29 | CI e helper de concorrência | integration | integration | ✅ OK |
