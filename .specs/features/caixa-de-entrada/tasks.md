# Caixa de entrada Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/caixa-de-entrada/design.md`
**Status**: Draft
**Base**: `main` (`d7e18fe`), branch `claude/gtd-capture-system-440984`.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `CONTRIBUTING.md` (testes do backend e do frontend antes do PR), `backend-node/vitest.config.ts` (60% de linhas), `frontend/vitest.config.ts`, `desktop/vitest.config.mts`; lições confirmadas L-044 (cada edge case com o próprio teste, com a condição montada) e L-048 (provar um recorte "do próprio item" com outro item no mesmo estado: aqui, a caixa de outro usuário e a configuração de outra lista).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Migration e schema | integration (PGlite) | Cada `CHECK` novo recusa o valor proibido direto no banco; padrões (`kind`, `priority`, `waiting`, `flagged`); cascatas e `set null`; migration depois de `0016` | `backend-node/test/db/*.test.ts` | `npm --prefix backend-node test` |
| Serviços (SQL) | integration (PGlite) | 1:1 com os ACs de cada serviço; todo edge case com a condição montada (L-044); relógio fixo | `backend-node/test/services/*.test.ts` | `npm --prefix backend-node test` |
| Rotas e MCP | integration (`app.inject`) | Toda rota nova: caminho feliz, 404 de item de outro usuário, 403 de papel e de token, 409 e 422 da spec; tabela de escopos atualizada | `backend-node/test/routes/*.test.ts`, `backend-node/test/mcp/*.test.ts` | `npm --prefix backend-node test` |
| Funções puras (shared e frontend) | unit | `targetColumn`, `parseTaskLine`, `normalizeBlocks`, `columnItems`, `dueState`, `dropTarget`: cada regra e borda | `backend-node/test/**/*.test.ts`, `frontend/src/lib/**/*.test.ts`, `frontend/src/components/board/*.test.ts` | `npm --prefix backend-node test`, `npm --prefix frontend test` |
| Componentes e páginas | unit (Testing Library) | Cada texto visível da spec, cada campo ligado e desligado (AD-011), interação de arraste por regra GRP-06 a GRP-09 | `frontend/src/**/*.test.tsx` | `npm --prefix frontend test` |
| Tipos, cliente HTTP e traduções | unit + build | Uma chamada por método novo do cliente; chaves iguais em `pt-BR` e `en` | `frontend/src/lib/api.test.ts`, `frontend/src/locales/*.test.ts` | `npm --prefix frontend run typecheck` |
| Processo principal do desktop | unit | Registro, troca, recusa e liberação do atalho; janela de captura; IPC confiável; exceção nomeada do WIDGET-05 | `desktop/src/main/*.test.ts` | `npm --prefix desktop test` |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Tasks só com testes de unidade do frontend | `npm --prefix frontend test` |
| Full | Tasks do backend; do frontend que tocam página ou cliente; do desktop | backend: `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test` · frontend: `npm --prefix frontend run lint && npm --prefix frontend run typecheck && npm --prefix frontend test` · desktop: `npm --prefix desktop run lint && npm --prefix desktop run typecheck && npm --prefix desktop test` |
| Build | Fim de cada fase | os Full das pastas tocadas + `npm --prefix frontend run build` |

---

## Execution Plan

Phases run sequentially; tasks within a phase run in order.

### Phase 1: Modelo e campos da tarefa (backend)

```
T1 → T2
T2 → T3
T2 → T4
T2 → T5
T4 → T6
```

### Phase 2: Grupos e campos do card (backend)

```
T32
T7 → T8
T8 → T9
T10
T33
```

### Phase 3: Caixa de entrada (backend)

```
T11 → T13
T12 → T13
T13 → T14
T12 → T15
```

### Phase 4: Quadro (frontend)

```
T16 → T17
T17 → T18
T18 → T19
T18 → T20
T20 → T21
T17 → T22
```

### Phase 5: Caixa de entrada (frontend)

```
T23 → T24
T23 → T25
T24 → T26
T26 → T27
T28
```

### Phase 6: Desktop

```
T29 → T30
T30 → T31
```


### Phase 7: Correções da verificação

Gaps do Verifier (`validation.md`, 1ª rodada) e decisões do usuário de 2026-11-13 sobre PROC-03, MODAL-06, CAP-04/CAP-06 e INBOX-04.

```
T34 → T35
T36
T37
T38
T39
T40
T41
```

---

## Task Breakdown

### T1: Migration e schema da feature

**What**: Migration `0017_caixa_de_entrada.sql` com `inbox_items`, `task_groups`, `list_card_fields` e as colunas novas de `tasks` (`kind`, `priority`, `due_on`, `waiting`, `waiting_for`, `flagged`, `flag_reason`, `group_id`), com os `CHECK`s e índices do design.
**Where**: `backend-node/drizzle/0017_caixa_de_entrada.sql`, `backend-node/drizzle/meta/`, `backend-node/src/db/schema.ts`
**Depends on**: None
**Reuses**: `0016_workspace_hours_count_mode.sql`, `test/db/workspace-hours-count-mode-schema.test.ts`
**Requirement**: PRI-01, DUE-01, WAIT-01, FLAG-01, REM-02

**Tools**:

- MCP: NONE
- Skill: `supabase-postgres-best-practices`

**Done when**:

- [x] Tarefa existente lê `kind = 'task'`, `priority = 'none'`, `waiting = false`, `flagged = false`
- [x] O banco recusa: `priority` fora da lista, lembrete com estimativa, `waiting_for` sem `waiting`, `flag_reason` sem `flagged`, tarefa em `done` com `flagged`, texto de item vazio ou com 501 caracteres
- [x] Apagar a lista apaga os grupos e `list_card_fields`; apagar o grupo deixa `tasks.group_id` nulo; apagar a lista do item deixa `inbox_items.list_id` nulo
- [x] Catálogo de colunas dos testes de baseline atualizado
- [x] Gate check passes: Full (backend)

**Also touched**: `backend-node/src/services/tasks.ts` (os dois literais de `Task` recebem os padrões das colunas novas para compilar; T2 liga os campos), `backend-node/test/fixtures/pg-columns.json`, `backend-node/test/db/pglite.test.ts` e `backend-node/test/db/baseline.test.ts` (as três tabelas novas e as oito colunas de `tasks`, lidas do PGlite em 2026-11-13, sem servidor PostgreSQL rodando).
**Status**: ✅ Done

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): add the inbox, task groups and new task fields to the schema`

---

### T2: Campos novos na criação, edição e leitura da tarefa

**What**: `createTask`, `updateTask`, `duplicateTask`, `getTask` e os schemas de `routes/tasks.ts` passam a aceitar e devolver `kind`, `priority`, `due_on`, `waiting`, `waiting_for`, `flagged`, `flag_reason` e `group_id`.
**Where**: `backend-node/src/services/tasks.ts`, `backend-node/src/routes/tasks.ts`
**Depends on**: T1
**Reuses**: `updateTaskAndSchedule`, `taskReadSchema`, `toTaskRead`
**Requirement**: PRI-01, DUE-01, WAIT-01, WAIT-03, WAIT-05, FLAG-01, FLAG-04, FLAG-06, REM-02, API-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `PATCH` grava e devolve cada campo novo; `priority: "urgent"`, `waiting_for` com 101 caracteres e `flag_reason` com 201 → 422 sem gravar
- [x] Marcar e desmarcar Aguardando não muda a coluna nem a posição
- [x] Desmarcar `waiting` apaga `waiting_for`; tirar `flagged` apaga `flag_reason`; pôr ou tirar a flag não muda coluna, prioridade nem Aguardando
- [x] Estimativa num lembrete → 422
- [x] `duplicateTask` copia os campos novos, menos a flag
- [x] Gate check passes: Full (backend)

**Also touched**: `backend-node/src/services/task-intake.ts` (os campos entram no `TaskIntake` e no hash da idempotência só quando enviados, então uma chave antiga mantém o hash), `backend-node/test/routes/tasks.test.ts` (o TASK-01 compara a leitura inteira e ganha os campos novos). Os campos ficam em `taskFields` e `toTaskFields`, exportados de `routes/tasks.ts`, fora de `createTaskBody` e `updateTaskBody`, para o MCP ganhá-los no T6. Nesta tarefa `group_id` só é gravado e conferido (grupo de outra lista → 422); o bloco do grupo vem no T8.
**Status**: ✅ Done

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): read and write priority, due date, waiting and flag on tasks`

---

### T3: Flag sai ao concluir e grupo sai ao trocar de lista

**What**: `moveTask` apaga `flagged` e `flag_reason` ao entrar em `done`; `moveTaskToList` limpa `group_id`.
**Where**: `backend-node/src/services/tasks.ts`
**Depends on**: T2
**Reuses**: bloco de conclusão em `moveTask` (`tasks.ts:179-184`)
**Requirement**: FLAG-05, EDGE-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tarefa com flag movida para Concluídas fica sem flag e sem motivo; movida de volta, continua sem
- [x] Concluir pelo foco (`complete`) também tira a flag
- [x] Tarefa de um grupo movida para outra lista fica sem grupo; outra tarefa do mesmo grupo continua nele (L-048)
- [x] Gate check passes: Full (backend)

**Status**: ✅ Done

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): clear the flag on completion and the group on list change`

---

### T4: Quadro devolve os campos novos e os grupos

**What**: `buildBoard` devolve os campos novos por card e `groups` da lista, e as somas de estimativa ignoram tarefas em Aguardando.
**Where**: `backend-node/src/services/board.ts`
**Depends on**: T2
**Reuses**: `TaskRow`, `view()`, `sum`
**Requirement**: WAIT-04, API-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Cada campo novo chega preenchido no card do `GET /api/lists/:id/board`
- [x] `groups` traz id, nome, prioridade e prazo dos grupos da lista, e não os de outra lista
- [x] Hoje com duas tarefas de 60 min, uma em Aguardando: `estimate_minutes` da coluna e `pending.estimate_minutes` valem 60; Esta semana e Backlog seguem a mesma regra
- [x] Gate check passes: Full (backend)

**Also touched**: `backend-node/src/routes/board.ts` (o schema de resposta do quadro ganha os campos e `groups`, senão a serialização os tiraria), `backend-node/test/routes/board.test.ts` e `backend-node/test/services/board.test.ts` (as comparações do card inteiro e do quadro vazio ganham os campos novos e `groups: []`). O card devolve `group_id` (nome do design); a spec API-01 chama o campo de `group`.
**Status**: ✅ Done

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): return the new card fields and groups on the board`

---

### T5: Lembrete fora do foco e com tipo na Agenda

**What**: `startFocus` recusa lembrete com 422; `todayTasks` e `startNext` ignoram lembretes; `listScheduled` devolve `kind`.
**Where**: `backend-node/src/services/focus.ts`
**Depends on**: T2
**Reuses**: `invalidTransition`, `listScheduled`
**Requirement**: REM-04, REM-05, REM-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `POST /api/focus/start` com um lembrete em Hoje → 422 `Reminders have no focus`; com uma tarefa em Hoje continua funcionando
- [x] Lembrete movido para Concluídas recebe `completed_at` e `completed_by` como uma tarefa
- [x] O próximo foco automático pula um lembrete que esteja antes da tarefa em Hoje
- [x] `GET /api/agenda/scheduled` devolve `kind: "reminder"` para o lembrete com hora
- [x] Gate check passes: Full (backend)

**Also touched**: `backend-node/src/services/scheduled.ts`, `backend-node/src/routes/scheduled.ts` (o schema de resposta da Agenda ganha `kind`), `backend-node/test/routes/scheduled.test.ts` e `backend-node/test/services/scheduled.test.ts` (as comparações da tarefa inteira ganham `kind: 'task'`). O `readFocusState` (`services/focus-state.ts`) ainda mostra um lembrete que esteja primeiro em Hoje como a tarefa do foco e o lista em `today.tasks`, porque lê do quadro; ficou fora do escopo desta tarefa.
**Status**: ✅ Done

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): keep reminders out of focus and tag them in the agenda`

---

### T6: Campos novos no MCP

**What**: `get_task`, `get_board`, `create_task` e `update_task` leem e gravam os campos novos com as validações da API.
**Where**: `backend-node/src/mcp/tools.ts`
**Depends on**: T4
**Reuses**: schemas de `routes/tasks.ts`
**Requirement**: API-01, API-02, API-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `update_task` com `priority: "high"` e `due_on` grava; `get_task` e `get_board` devolvem os dois
- [x] Valor inválido → `isError` com a mensagem de 422, sem gravar
- [x] Gate check passes: Full (backend)

**Also touched**: `backend-node/test/mcp/create-task.test.ts` (o MCP-03 lista os campos do `create_task` e ganha os oito novos). `get_task` e `get_board` já devolviam os campos desde o T2 e o T4; esta tarefa abre `create_task` e `update_task` com `taskFields`.
**Status**: ✅ Done

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): expose the new task fields in the MCP tools`

---

### T32: Tela do foco ignora lembretes

**What**: `readFocusState` deixa lembretes fora da tarefa do foco e de `today.tasks`, como `todayTasks` já faz.
**Where**: `backend-node/src/services/focus-state.ts`
**Depends on**: None
**Reuses**: filtro `kind = 'task'` de `todayTasks` (T5)
**Requirement**: REM-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Com um lembrete antes de uma tarefa em Hoje, `GET /api/focus` mostra a tarefa como a do foco e não lista o lembrete
- [x] Com só um lembrete em Hoje, o foco fica sem tarefa
- [x] Gate check passes: Full (backend)

**Also touched**: `backend-node/test/routes/reminders.test.ts`. `today.pending` também conta só as tarefas, porque a tela do foco só percorre elas.
**Status**: ✅ Done

**Tests**: integration
**Gate**: full

**Commit**: `fix(backend): keep reminders off the focus screen`

---

### T7: Serviço de grupos e normalização de blocos

**What**: `services/groups.ts` com `createGroup`, `listGroups`, `normalizeBlocks` e `hasOpenTasks`, e a rota `GET /api/lists/:id/groups`.
**Where**: `backend-node/src/services/groups.ts`
**Depends on**: None
**Reuses**: `lockList`; padrão de rota de `routes/lists.ts`
**Requirement**: GRP-01, GRP-04, MODAL-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `normalizeBlocks` junta o grupo na posição da primeira tarefa, mantém a ordem entre elas e não mexe nas avulsas; lista vazia, um grupo só e dois grupos intercalados cobertos
- [x] `GET /api/lists/:id/groups` devolve só os grupos da lista; outra lista do workspace não aparece; token com `tasks:read` passa
- [x] Gate check passes: Full (backend)

**Also touched**: `backend-node/src/routes/groups.ts`, `backend-node/src/app.ts`, `backend-node/test/support/token-routes.ts`, `backend-node/test/routes/token-scopes.test.ts` (a rota aberta a `tasks:read` leva a tabela de 15 para 16 rotas, com a chamada de exemplo; o T15 leva de 16 para 17). A rota devolve um array de `{id, list_id, name, notes, priority, due_on, created_at}`, do mais antigo ao mais novo.

**Status**: ✅ Done

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): add task groups with contiguous blocks per column`

---

### T8: Mover tarefa para dentro e para fora do grupo

**What**: `moveTask` recebe `group?: string | null`, normaliza os blocos e devolve `group_without_next_action`; `createTask` com `group_id` põe a tarefa no fim do bloco; trocar `group_id` no `PATCH` segue o mesmo caminho.
**Where**: `backend-node/src/services/tasks.ts`
**Depends on**: T7
**Reuses**: `moveTask`, `normalizeBlocks`, `hasOpenTasks`
**Requirement**: GRP-06, GRP-07, GRP-08, GRP-10, GRP-11, MODAL-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Soltar dentro do bloco do mesmo grupo em outra coluna: muda de coluna e continua no grupo, junto das outras
- [x] `group: null`: sai do grupo e fica onde foi solta, fora do bloco
- [x] Tarefa avulsa com `group: <id>` entra no bloco; grupo de outra lista → 422
- [x] Concluir a última tarefa aberta do grupo devolve `{id, name}`; concluir uma que não é a última devolve `null`
- [x] Gate check passes: Full (backend)

**Also touched**: `backend-node/src/routes/tasks.ts` (`POST /api/tasks/:id/move` aceita `group_id`: ausente mantém o grupo, `null` tira, um id põe; a resposta ganha `group_without_next_action: {id, name} | null`; o `move_task` do MCP fica igual), `backend-node/test/routes/tasks-group-move.test.ts`. `duplicateTask` também põe a cópia de uma tarefa de grupo no fim do bloco (AD-013). `applyDueSchedules` (`services/schedule.ts`) ainda move tarefas para Hoje sem `normalizeBlocks`; ficou fora do escopo.

**Status**: ✅ Done

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): move tasks into and out of a group`

---

### T9: Mover o contêiner inteiro

**What**: `moveGroupBlock` e a rota `POST /api/groups/:id/move` levam as tarefas do grupo de uma coluna para outra, na mesma ordem.
**Where**: `backend-node/src/routes/groups.ts`
**Depends on**: T8
**Reuses**: renumeração de `moveTask`, bloco de conclusão
**Requirement**: GRP-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Três tarefas do grupo em Esta semana vão para Hoje antes de uma tarefa avulsa, na mesma ordem; a tarefa do grupo que estava em Backlog fica lá
- [x] Para Concluídas, cada tarefa recebe `completed_at` e `completed_by` e perde a flag
- [x] Viewer → 403; token → 403
- [x] Gate check passes: Full (backend)

**Also touched**: `backend-node/src/services/groups.ts` (`moveGroupBlock` e `findGroup`; cada tarefa passa por `moveTask` na mesma transação), `backend-node/test/routes/groups.test.ts`. A resposta é `{tasks: TaskRead[], group_without_next_action: {id, name} | null}`; um grupo de outro workspace responde 404.

**Status**: ✅ Done

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): move a whole group container between columns`

---

### T10: Configuração dos campos do card

**What**: Serviço e rotas `GET` e `PUT /api/lists/:id/card-fields` guardando os campos escondidos por usuário e lista.
**Where**: `backend-node/src/routes/card-fields.ts`
**Depends on**: None
**Reuses**: guardas `reading`
**Requirement**: FIELDS-03, FIELDS-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Sem linha, `GET` devolve os quatro campos ligados
- [x] `PUT {hidden: ["due"]}` esconde Prazo só para o usuário e só naquela lista; outro usuário e outra lista continuam com tudo ligado (L-048)
- [x] Campo desconhecido → 422; token → 403
- [x] Gate check passes: Full (backend)

**Also touched**: `backend-node/src/services/card-fields.ts`, `backend-node/src/app.ts`, `backend-node/test/routes/card-fields.test.ts`, `backend-node/test/support/roles.ts` (`inWorkspace` aceita `PUT`). `GET` e `PUT` respondem `{hidden: CardField[]}` na ordem de `CARD_FIELDS`; lista vazia é tudo ligado. Qualquer membro, `viewer` inclusive, escolhe os próprios campos.

**Status**: ✅ Done

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): store the card fields each user shows per list`

---

### T33: Ida para Hoje mantém o bloco do grupo

**What**: `applyDueSchedules` roda `normalizeBlocks` nas colunas que mexe, para a tarefa agendada de um grupo não partir o bloco em Hoje (AD-013).
**Where**: `backend-node/src/services/schedule.ts`
**Depends on**: None
**Reuses**: `normalizeBlocks` (T7)
**Requirement**: GRP-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Duas tarefas do grupo em Hoje e uma terceira do grupo agendada para hoje em Backlog: depois da leitura, as três ficam juntas em Hoje
- [x] Uma tarefa avulsa agendada para hoje continua indo para o fim de Hoje
- [x] Gate check passes: Full (backend)

**Also touched**: `backend-node/test/services/schedule.test.ts` (o helper `task` aceita `groupId`). Só a coluna Hoje é normalizada: tirar tarefas de Backlog e Esta semana não parte um bloco.

**Status**: ✅ Done

**Tests**: integration
**Gate**: full

**Commit**: `fix(backend): keep a group's block together when a schedule moves a task to today`

---

### T11: Decisão do processamento

**What**: `services/decision.ts` com o `decisionSchema`, `targetColumn` e `parseTaskLine` (em `shared/`).
**Where**: `backend-node/src/services/decision.ts`
**Depends on**: None
**Reuses**: `daySql`, regra de semana do AD-004
**Requirement**: PROC-03, PROC-04, GRP-02, GRP-03, REM-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `targetColumn`: sem dia → Backlog; hoje → Hoje; outro dia da semana (incluindo domingo) → Esta semana; segunda seguinte → Backlog; `column` explícita vence
- [x] `parseTaskLine("Validar 0:30")` → título `Validar`, 30 min; sem `HH:MM` → sem estimativa; `24:01` não vira estimativa
- [x] O schema recusa grupo sem tarefas, lembrete com estimativa e nome com 256 caracteres
- [x] Gate check passes: Full (backend)

**Also touched**: `backend-node/test/services/decision.test.ts`. `parseTaskLine` fica em `services/decision.ts` (SPEC_DEVIATION: o repositório não tem `shared/`; o frontend espelha a regra). `name` é opcional na decisão: ausente, o envio usa o texto do item (QUICK-04, QUICK-07). `targetColumn(scheduledOn, today, weekEnd, chosen?)` manda um dia já passado para Hoje (D31). A narrowing de `inboxItems.draft` para `Decision` vai no T12.

**Status**: ✅ Done

**Tests**: unit
**Gate**: full

**Commit**: `feat(backend): define the inbox decision and its target column`

---

### T12: Capturar e manter a caixa

**What**: `services/inbox.ts` (`captureItem`, `listItems` com a limpeza de 30 dias, `countCurrent`, `updateItem`, `discardItem`, `restoreItem`) e as rotas `POST /api/inbox`, `GET /api/inbox`, `GET /api/inbox/count`, `PATCH /api/inbox/:id`, `discard` e `restore`.
**Where**: `backend-node/src/routes/inbox.ts`
**Depends on**: None
**Reuses**: guardas `reading`, `createdVia`
**Requirement**: CAP-01, CAP-02, CAP-03, INBOX-01, INBOX-02, INBOX-03, INBOX-04, INBOX-05, INBOX-06, QUICK-02, QUICK-05, EDGE-03, EDGE-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Capturar `"  Ligar  "` grava `Ligar`, origem `app`; `source: "desktop"` grava `desktop`; vazio e 501 caracteres → 422
- [x] Viewer captura; dois usuários do workspace veem e contam só o próprio item; `PATCH` no item do outro → 404
- [x] Atuais do mais antigo ao mais novo; descartar leva à Lixeira; restaurar devolve com lista e estimativa
- [x] Item descartado há 31 dias some na leitura; há 29, continua
- [x] Item do workspace B não aparece no A
- [x] Gate check passes: Full (backend)

**Also touched**: `backend-node/src/services/inbox.ts`, `backend-node/src/app.ts`, `backend-node/src/db/schema.ts` (`inboxItems.draft` passa a `Decision`, só o tipo), `backend-node/test/routes/inbox.test.ts`. O item lido é `{id, text, source, created_via, list_id, estimate_minutes, draft, discarded_at, created_at}`; `GET /api/inbox` responde `{timezone, items}` e `GET /api/inbox/count` responde `{count}`. Texto vazio responde 422 `code: text_empty`, acima de 500 `text_too_long`.

**Status**: ✅ Done

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): capture items into a personal inbox`

---

### T13: Enviar um item

**What**: `sendItem` e `POST /api/inbox/:id/send`: tira o item com `DELETE … RETURNING` e cria tarefa, lembrete, grupo ou tarefa concluída na mesma transação.
**Where**: `backend-node/src/services/inbox.ts`
**Depends on**: T11, T12
**Reuses**: `createTask`, `createGroup`
**Requirement**: QUICK-04, QUICK-06, QUICK-07, PROC-05, PROC-06, PROC-07, PROC-08, REM-01, GRP-01, EDGE-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Envio rápido cria a tarefa no fim do Backlog com a estimativa e tira o item
- [x] Tarefa agendada para hoje cai em Hoje; lembrete sem estimativa; grupo com 4 tarefas na coluna escolhida; `done` cria em Concluídas com `completed_by`
- [x] Lista arquivada → 409, item continua com a lista limpa; lista em que o usuário é viewer → 409
- [x] Texto com 300 caracteres sem `name` → 422
- [x] Dois envios simultâneos do mesmo item: uma tarefa e um 409
- [x] Falha na criação (lista apagada no meio) deixa o item na caixa
- [x] Gate check passes: Full (backend)

**Also touched**: `backend-node/src/routes/inbox.ts`, `backend-node/src/plugins/workspace.ts` (exporta `canWrite`), `backend-node/test/routes/inbox-send.test.ts`. `POST /api/inbox/:id/send` recebe `{decision}` e responde `{tasks: TaskRead[], group: GroupRead | null}`. 409 leva `reason`: `list_archived`, `list_read_only` (os dois limpam a lista do item) ou `already_processed`; um id que nenhuma caixa tem mais também responde 409 `already_processed`, porque no PGlite o segundo envio pode chegar depois do commit do primeiro; o item de outro usuário continua 404. Sem `name`, o nome é o texto (422 `name_too_long` acima de 255); sem `estimate_minutes`, a tarefa usa a estimativa da linha. O agendamento é gravado direto, com `schedule_applied_at` quando o dia é hoje ou antes, para a coluna do `Vai para` valer (PROC-04).

**Status**: ✅ Done

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): send an inbox item to a list`

---

### T14: Confirmar o Processar tudo

**What**: `commitDrafts` e `POST /api/inbox/commit`: valida todos os rascunhos e aplica tudo numa transação, ou responde 409 com o motivo de cada item.
**Where**: `backend-node/src/services/inbox.ts`
**Depends on**: T13
**Reuses**: `applyDecision`
**Requirement**: ALL-06, ALL-07, ALL-09, EDGE-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Três itens (tarefa, descarte, sem rascunho): uma tarefa criada, um na Lixeira, um em Atuais
- [x] Um rascunho com lista arquivada: 409 com `[{item_id, reason: "list_archived"}]` e nada criado
- [x] Enviar avulso um item com rascunho apaga o rascunho
- [x] Gate check passes: Full (backend)

**Also touched**: `backend-node/src/routes/inbox.ts`, `backend-node/test/routes/inbox-commit.test.ts`. `POST /api/inbox/commit` aceita `{item_ids?: string[]}` ou nenhum corpo (sem ids, envia todos os rascunhos) e responde `{tasks: TaskRead[], groups: GroupRead[], discarded: string[]}`. O 409 é `{detail, items: [{item_id, reason}]}`, com `reason` `list_archived`, `list_read_only`, `list_not_found`, `name_too_long` ou `already_processed` (id da revisão que não está mais em Atuais com rascunho). O descarte pelo commit apaga o rascunho do item.

**Status**: ✅ Done

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): commit the process-all drafts in one transaction`

---

### T15: Captura por token e MCP, e saída do membro

**What**: Escopo `inbox:create` em `TOKEN_SCOPES` e em `POST /api/inbox`, ferramenta MCP `capture`, e `removeMember` apagando os itens do membro.
**Where**: `backend-node/src/mcp/tools.ts`
**Depends on**: T12
**Reuses**: `createTaskFromToken`, `callTool`
**Requirement**: CAP-09, CAP-10, EDGE-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Token com `inbox:create` cria item com origem `api` e o token; `capture` pelo MCP cria com origem `mcp`
- [x] Token sem o escopo → 403; ler a caixa por token → 403
- [x] Tabela de rotas de token passa de 15 para 16, com a chamada de exemplo
- [x] Membro removido perde os itens daquele workspace; os de outro workspace continuam
- [x] Gate check passes: Full (backend)

**Also touched**: `backend-node/src/db/schema.ts`, `backend-node/src/routes/inbox.ts`, `backend-node/src/services/workspaces.ts`, `backend-node/test/support/token-routes.ts`, `backend-node/test/routes/token-scopes.test.ts` (a tabela passa de 16 para 17, porque o T7 já abriu `GET /api/lists/:id/groups`; o SCOPE-07 aceita `inbox:create` para o viewer, que captura), `backend-node/test/mcp/write-tools.test.ts` (`inbox:create` mostra `capture`), `backend-node/test/routes/inbox-capture-tokens.test.ts`. A ferramenta `capture` (`{text}`) é `write: false` e devolve o item lido. O frontend ainda não conhece o escopo `inbox:create` (`types/index.ts`, `access-tokens-dialog.tsx`).

**Status**: ✅ Done

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): capture to the inbox from tokens and the MCP`

---

### T16: Tipos e cliente HTTP

**What**: Tipos dos campos novos, `Board.groups`, `InboxItem`, `Decision`, `CardField`; `inboxApi`, `groupsApi`, `cardFieldsApi` e os campos novos em `tasksApi`; escopo `inbox:create` no diálogo de tokens.
**Where**: `frontend/src/lib/api.ts`
**Depends on**: None
**Reuses**: `tasksApi`, `listsApi`
**Requirement**: API-01, CAP-10

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Um teste por método novo confere URL, verbo e corpo
- [x] O diálogo de tokens lista `Capturar na caixa de entrada`
- [x] Gate check passes: Full (frontend)

**Also touched**: `frontend/src/types/index.ts`, `frontend/src/components/access-tokens-dialog.tsx`, `frontend/src/locales/pt-BR.json`, `frontend/src/locales/en.json`, `frontend/src/lib/api.test.ts`, `frontend/src/components/access-tokens-dialog.test.tsx`, `frontend/src/test/utils.tsx` (`PLAIN_TASK_FIELDS`, os campos novos no padrão), e os fixtures de `Task`, `TaskCardView` e `Board` que o typecheck pediu (`new-schedule-panel`, `add-task-form`, `board-column`, `drop-target`, `subtask-list`, `task-card`, `task-dialog`, `focus-notes`, `focus-subtasks`, `widget-notes`, `agenda`, `focus`, `list-board`). Os clientes seguem o nome dos vizinhos do arquivo: `inbox`, `groups` e `cardFields` (o design os chama `inboxApi`, `groupsApi` e `cardFieldsApi`). `tasks.move` devolve `group_without_next_action` como opcional no tipo, para os mocks que devolvem só a `Task`.

**Status**: ✅ Done

**Tests**: unit
**Gate**: full

**Commit**: `feat(frontend): add the inbox, groups and card field clients`

---

### T17: Ícones de prioridade e estado do prazo

**What**: `PriorityIcon` e `PrioritySelect` em `components/board/priority.tsx` e `dueState` em `lib/board/due.ts`.
**Where**: `frontend/src/components/board/priority.tsx`
**Depends on**: T16
**Reuses**: lógica de dia de `lib/schedule.ts`
**Requirement**: PRI-02, PRI-03, PRI-04, DUE-02, DUE-03, DUE-04, DUE-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Cada prioridade tem o ícone, a cor e o rótulo `Prioridade <nome>`; `none` não renderiza nada; o select lista as cinco com ícone
- [x] `dueState`: amanhã e hoje → `soon`; ontem → `late`; ontem em `done` → `done`; depois de amanhã → `neutral`; virada do dia no fuso do workspace
- [x] Gate check passes: Quick

**Also touched**: `frontend/src/lib/board/due.ts`, `frontend/src/lib/board/due.test.ts`, `frontend/src/components/board/priority.test.tsx`, `frontend/src/locales/pt-BR.json` e `en.json` (namespace `priority`: os cinco nomes e o rótulo `Prioridade {{name}}`). `dueState(due_on, column, today)` recebe o `today` já no fuso do workspace (`todayInTimezone`). No select, o ícone fica ao lado do nome e é decorativo; o rótulo acessível `Prioridade <nome>` é do `PriorityIcon` do card.

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): add priority icons and due date states`

---

### T18: Card com os campos novos e card de lembrete

**What**: `TaskCard` recebe `fields` e mostra linha da flag, chips de prazo e Aguardando, ícone de prioridade e borda vermelha conforme os campos ligados; `ReminderCard` compacto.
**Where**: `frontend/src/components/board/task-card.tsx`
**Depends on**: T17
**Reuses**: `ScheduleBadgeView`
**Requirement**: FIELDS-01, FIELDS-05, FIELDS-06, FLAG-02, FLAG-03, WAIT-02, REM-03, EDGE-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Com tudo desligado, o card é igual ao de hoje (nome, estimativa, tempo)
- [x] Flag ligada: borda vermelha e motivo ou `Flag sem motivo`; Flag desligada: sem borda; tarefa sem flag nunca tem borda vermelha
- [x] `Aguardando · Fulano` e `Aguardando` sem o "de quem"
- [x] Agendamento e prazo no mesmo dia aparecem os dois
- [x] Lembrete: sino, sem checkbox, sem estimativa e sem tempo, com qualquer combinação de campos
- [x] Gate check passes: Quick

**Also touched**: `frontend/src/components/board/reminder-card.tsx`, `frontend/src/lib/board/card-fields.ts` (`CARD_FIELDS`, `CardFieldsState`, `ALL_CARD_FIELDS`, `shownFields`), `frontend/src/components/board/task-card.test.tsx`, `frontend/src/locales/pt-BR.json` e `en.json` (chaves `board.flagWithoutReason`, `waiting`, `waitingFor`, `due`, `dueOn`, `dueToday`, `dueTomorrow`, `dueLate`, `reminder`). `fields` é opcional e, sem ele, liga os quatro (FIELDS-03). O `TaskCard` desenha o `ReminderCard` quando `kind` é `reminder`, então o quadro não precisa escolher o card.

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): show the new fields on the task card`

---

### T19: Popover Campos do card

**What**: `CardFieldsSettings` na barra do quadro, lendo e gravando `card-fields`, ligado ao `TaskCard`.
**Where**: `frontend/src/components/board/card-fields-settings.tsx`
**Depends on**: T18
**Reuses**: `SoundSettings`
**Requirement**: FIELDS-02, FIELDS-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] A engrenagem abre `Campos do card` com os quatro switches e a nota `Nome, estimativa e tempo registrado aparecem sempre.`
- [x] Desligar Prazo grava `hidden: ["due"]` e tira os chips do quadro sem recarregar
- [x] Gate check passes: Full (frontend)

**Also touched**: `frontend/src/pages/list-board.tsx`, `frontend/src/locales/pt-BR.json`, `frontend/src/locales/en.json`, `frontend/src/lib/board/card-fields.ts` (`useCardFields` e `cardFieldsKey`, chave `['lists', listId, 'card-fields']`), `frontend/src/components/board/card-fields-settings.test.tsx`, `frontend/src/pages/list-board.test.tsx` (o mock da API ganha `cardFields`). O switch muda na hora (escrita otimista no cache) e volta se o `PUT` falhar, com o erro no toast.

**Status**: ✅ Done

**Tests**: unit
**Gate**: full

**Commit**: `feat(frontend): let each user choose the card fields of a board`

---

### T20: Contêiner do grupo no quadro

**What**: `columnItems` em `lib/board/blocks.ts` e `GroupContainer` desenhando o grupo em cada coluna onde ele tem tarefa.
**Where**: `frontend/src/components/board/group-container.tsx`
**Depends on**: T18
**Reuses**: `TaskCard`
**Requirement**: GRP-04, GRP-05, EDGE-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `columnItems` agrupa as consecutivas do mesmo grupo e deixa as avulsas
- [x] O contêiner mostra o nome e `<n> tarefas` contando só a coluna; some da coluna sem tarefa do grupo
- [x] Grupo com tarefas em Hoje e Concluídas aparece nas duas
- [x] Gate check passes: Quick

**Also touched**: `frontend/src/lib/board/blocks.ts`, `frontend/src/lib/board/blocks.test.ts`, `frontend/src/components/board/group-container.test.tsx`, `frontend/src/components/board/board-column.tsx` e o teste (props `groups` e `renderGroup`; o `renderGroup` padrão desenha o contêiner simples, e o quadro passa o arrastável no T21), `frontend/src/locales/pt-BR.json` e `en.json` (`board.groupLabel`). Em Concluídas, ordenada por dia, um grupo partido por uma tarefa avulsa vira dois contêineres, cada um com a própria contagem; nas colunas abertas o bloco é contíguo (AD-013) e a contagem é a da coluna.

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): draw task groups as containers on the board`

---

### T21: Arrastar para dentro, para fora e o contêiner inteiro

**What**: `dropTarget` devolve o grupo; `list-board.tsx` registra contêineres como droppables e títulos como sortables, chama `move` com o grupo ou `groupsApi.move`, e mostra o toast de grupo sem próxima ação.
**Where**: `frontend/src/pages/list-board.tsx`
**Depends on**: T20
**Reuses**: `collisionDetection`, `placeTask`, `moveMutation`
**Requirement**: GRP-06, GRP-07, GRP-08, GRP-09, GRP-10

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `dropTarget` (unidade): card do grupo, `group:<id>:<col>`, `container:<id>:<col>` e `column:<col>` dão o grupo e a coluna certos
- [x] Interação: soltar dentro mantém o grupo; fora tira; avulsa dentro entra; título move o bloco
- [x] Resposta com `group_without_next_action` mostra `<grupo> está sem próxima ação` e `Adicionar tarefa`
- [x] Gate check passes: Full (frontend)

**Also touched**: `frontend/src/components/board/drop-target.ts`, `frontend/src/locales/pt-BR.json`, `frontend/src/locales/en.json`, `frontend/src/components/board/drop-target.test.ts`, `frontend/src/pages/list-board.test.tsx` (mock de `groups` e `toast.info`), `frontend/src/components/board/group-container.tsx` (o `{...handle}` vem antes da classe do título), `frontend/src/components/board/add-task-form.tsx` e `frontend/src/lib/api.ts` (`AddTaskForm` aceita `groupId`, `defaultOpen` e `onClose`, e `tasks.create` aceita `group_id`: o `Adicionar tarefa` do toast abre um diálogo que cria a tarefa no fim do bloco do grupo, no Backlog). `groupDropTarget` fica em `drop-target.ts`. O título do contêiner é um `useSortable` (o teclado só move o que também é alvo) e a área do contêiner não recebe o próprio contêiner. Soltar em Concluídas mantém o grupo; a resposta traz o toast quando era a última aberta.

**Status**: ✅ Done

**Tests**: unit
**Gate**: full

**Commit**: `feat(frontend): drag tasks into, out of and with their group`

---

### T22: Modal da tarefa com os campos novos

**What**: `TaskDialog` na ordem de MODAL-01, com `FlagField`, prioridade, prazo, grupo e Aguardando no form, e os campos escondidos para lembrete.
**Where**: `frontend/src/components/board/task-dialog.tsx`
**Depends on**: T17
**Reuses**: `PrioritySelect`, react-hook-form do modal
**Requirement**: MODAL-01, MODAL-02, MODAL-03, MODAL-04, MODAL-05, MODAL-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Sem flag: `+ Flag` com a dica; clicar mostra o motivo e `Tirar flag`
- [x] Switch Aguardando abre `De quem`
- [x] Select de grupo com os grupos da lista e `Sem grupo`
- [x] `Salvar` manda só os campos mudados, incluindo os novos
- [x] Lembrete sem Estimativa, Grupo e Subtarefas
- [x] Gate check passes: Full (frontend)

**Also touched**: `frontend/src/locales/pt-BR.json`, `frontend/src/locales/en.json`, `frontend/src/components/board/task-dialog.test.tsx` (mock de `groups.list`), `frontend/src/components/board/priority.tsx` (`PrioritySelect` aceita `disabled`, para o `viewer`). O Prazo é um `input type="date"`; o switch leva o rótulo do design, `Aguardando outra pessoa`. Tirar a flag ou desligar Aguardando manda só `flagged: false` ou `waiting: false`, porque o servidor apaga o texto (FLAG-04, WAIT-05). Os grupos vêm de `['lists', list_id, 'groups']`.

**Status**: ✅ Done

**Tests**: unit
**Gate**: full

**Commit**: `feat(frontend): edit priority, due date, group, waiting and flag in the task dialog`

---

### T23: Página da caixa e item na barra lateral

**What**: Rota `/inbox`, `InboxPage` com campo de captura, abas Atuais e Lixeira, descartar e restaurar, estado vazio, e o item `Caixa de entrada` com contador na barra lateral.
**Where**: `frontend/src/pages/inbox.tsx`
**Depends on**: None
**Reuses**: `visibleNavItems`, badge do admin, `inboxApi`
**Requirement**: CAP-01, CAP-02, CAP-03, INBOX-01, INBOX-02, INBOX-04, INBOX-05, INBOX-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Contador `6` com seis itens e sem número com zero
- [x] Enter no campo guarda, limpa e o item aparece por último; vazio não envia; 501 caracteres mostra `Até 500 caracteres` e mantém o texto
- [x] Descartar leva à Lixeira; restaurar devolve
- [x] Atuais vazia mostra `Nada na caixa. Capture o que estiver na cabeça.`
- [x] Gate check passes: Full (frontend)

**Also touched**: `frontend/src/App.tsx`, `frontend/src/lib/nav-items.ts`, `frontend/src/components/app-layout.tsx`, `frontend/src/locales/pt-BR.json`, `frontend/src/locales/en.json`, `frontend/src/lib/inbox/age.ts` (idade e origem), `frontend/src/lib/inbox/errors.ts`, `frontend/src/lib/inbox/use-capture.ts` (o campo de captura, reaproveitado pelo overlay e pela janela do desktop), `frontend/src/lib/nav-items.test.ts` (a lista exata ganha `inbox`), `frontend/src/components/app-layout.test.tsx` (mock de `inbox.count` e os testes do contador). SPEC_DEVIATION: o item `Caixa de entrada` fica no fim da seção Workspace, depois de Relatórios e Arquivos, e não no topo como no design: os testes da barra lateral fixam a abertura da seção com as três entradas de lista e a ordem Agenda, Planejar, Relatórios, Arquivos.

**Status**: ✅ Done

**Tests**: unit
**Gate**: full

**Commit**: `feat(frontend): add the inbox page and its sidebar counter`

---

### T24: Linha com envio rápido

**What**: `InboxRow` com select de lista, estimativa, `Enviar`, descartar, a linha inteira abrindo o Processar e o hover.
**Where**: `frontend/src/components/inbox/inbox-row.tsx`
**Depends on**: T23
**Reuses**: `DurationInput`
**Requirement**: QUICK-01, QUICK-02, QUICK-03, QUICK-04, QUICK-05, QUICK-06, QUICK-07, QUICK-08, QUICK-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] O select lista só as listas ativas em que o usuário escreve
- [x] `Enviar` some sem lista e com texto de 256 caracteres; aparece com lista
- [x] Escolher lista e estimativa grava no item; estimativa `25:00` fica marcada como inválida e não grava
- [x] 409 de lista arquivada mostra o toast e limpa o select
- [x] Clicar fora dos controles abre `?process=<id>`; clicar no select, na estimativa, em `Enviar` ou no descartar não abre
- [x] Gate check passes: Full (frontend)

**Also touched**: `frontend/src/pages/inbox.tsx` (Atuais passa a usar `InboxRow`), `frontend/src/pages/inbox.test.tsx` (mocks de `lists` e do workspace), `frontend/src/lib/inbox/use-writable-lists.ts` (as listas ativas em que o usuário escreve, como o `canWrite` do quadro), `frontend/src/lib/inbox/errors.ts` (`sendRefusal`), `frontend/src/locales/pt-BR.json`, `frontend/src/locales/en.json`. Os toasts dos motivos do 409 não têm texto na spec: `A lista foi arquivada. Escolha outra lista.`, `Você não escreve mais nessa lista. Escolha outra lista.`, `Este item já foi processado.`; o envio mostra `Enviado para <lista> › Backlog`. O destaque do hover (QUICK-09) é CSS e o teste confere as classes.

**Status**: ✅ Done

**Tests**: unit
**Gate**: full

**Commit**: `feat(frontend): send inbox items straight from their row`

---

### T25: Overlay de captura no app

**What**: `CaptureOverlay`, `use-capture-hotkey` (Mod+Shift+Space), ação `Capturar` na paleta e botão na barra lateral.
**Where**: `frontend/src/components/capture/capture-overlay.tsx`
**Depends on**: T23
**Reuses**: `use-command-palette-hotkey.ts`, `QUICK_ACTIONS`
**Requirement**: CAP-04, CAP-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `⌘⇧Space` e `Ctrl+Shift+Space` abrem com o campo focado; a paleta e o botão também
- [x] Enter guarda com origem `app` e fecha; Esc fecha sem guardar
- [x] Erro de rede mantém o texto e mostra `Não deu para guardar. Tente de novo.`
- [x] Gate check passes: Full (frontend)

**Also touched**: `frontend/src/hooks/use-capture-hotkey.ts`, `frontend/src/components/command-palette.tsx`, `frontend/src/components/app-layout.tsx`, `frontend/src/locales/pt-BR.json`, `frontend/src/locales/en.json`, `frontend/src/components/command-palette.test.tsx` e `frontend/src/components/app-layout.test.tsx` (a ação da paleta, o botão da barra lateral e o atalho no layout). O overlay exporta `CaptureField` (o campo com Enter, Esc e as mensagens), que a janela de captura do desktop reaproveita com `source: 'desktop'`. A ação da paleta recebe `onCapture` do layout. O toast de sucesso é `Guardado na caixa` (design.md).

**Status**: ✅ Done

**Tests**: unit
**Gate**: full

**Commit**: `feat(frontend): capture from anywhere in the app`

---

### T26: Processar um item

**What**: `ProcessDialog` com os formulários de Tarefa, Lembrete e Grupo, o "Vai para" trocável e as ações `Descartar`, `Já fiz` e `Salvar`.
**Where**: `frontend/src/components/inbox/process-dialog.tsx`
**Depends on**: T24
**Reuses**: `PrioritySelect`, `targetColumn` e `parseTaskLine` de `shared/`
**Requirement**: PROC-01, PROC-02, PROC-03, PROC-04, PROC-05, PROC-06, PROC-07, PROC-08, REM-01, REM-02, GRP-02, GRP-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Abre com o texto, origem, idade, tipo Tarefa e lista e estimativa da linha
- [x] Sem nome ou sem lista, o salvar fica desabilitado com o campo marcado
- [x] Agendar para hoje mostra `Vai para <lista> › Hoje`; trocar a coluna muda o destino
- [x] Lembrete esconde a estimativa; grupo sem tarefas mostra `Adicione a primeira tarefa`; `Validar 0:30` vira tarefa de 30 min
- [x] Erro da API mantém os valores e mostra a mensagem no formulário
- [x] Gate check passes: Full (frontend)

**Also touched**: `frontend/src/locales/pt-BR.json`, `frontend/src/locales/en.json`, `frontend/src/lib/inbox/decision.ts` e o teste (`targetColumn` e `parseTaskLine` copiados de `backend-node/src/services/decision.ts`: o repositório não tem `shared/`), `frontend/src/pages/inbox.tsx` (`?process=<id>` abre o diálogo; decidido o item, abre o próximo de Atuais ou fecha). O botão de salvar se chama `Salvar e próximo` também no avulso (PROC-02), e depois do envio abre o próximo item. O toast do envio é `Enviado para <lista> › <coluna>`, com a coluna que a API devolveu.

**Status**: ✅ Done

**Tests**: unit
**Gate**: full

**Commit**: `feat(frontend): process an inbox item as a task, reminder or group`

---

### T27: Processar tudo e revisão

**What**: Modo `?process=all` com progresso, `Pular`, rascunhos por `PATCH`, `ReviewStep` com o resumo por lista, `Confirmar e enviar` e `Terminar depois`.
**Where**: `frontend/src/components/inbox/review-step.tsx`
**Depends on**: T26
**Reuses**: `ProcessDialog`
**Requirement**: ALL-01, ALL-02, ALL-03, ALL-04, ALL-05, ALL-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Abre no primeiro item sem rascunho com `Processar · 1 de 3`
- [x] Salvar guarda o rascunho e não cria tarefa; pular não guarda
- [x] A revisão lista tipo, nome, prioridade e destino; o resumo soma itens e estimativas por coluna
- [x] Clicar num item volta ao formulário e salvar retorna à revisão
- [x] 409 marca cada item com o motivo; `Terminar depois` fecha e o próximo `Processar tudo` continua
- [x] Gate check passes: Full (frontend)

**Also touched**: `frontend/src/components/inbox/process-dialog.tsx`, `frontend/src/locales/pt-BR.json`, `frontend/src/locales/en.json`, `frontend/src/pages/inbox.tsx` (botão `Processar tudo` e `?process=all`). `ProcessAllDialog` fica em `process-dialog.tsx` e o teste do fluxo inteiro em `review-step.test.tsx`. `ProcessForm` passa a abrir de um rascunho. Na revisão, `Descartar` e `Já fiz` também viram rascunho (`discard`, `done`). Os textos dos motivos do 409 que a spec não dá: `Sem permissão na lista`, `Lista não encontrada`, `Nome com mais de 255 caracteres`, `Já processado em outra janela` (`Lista arquivada` é o do EDGE-02).

**Status**: ✅ Done

**Tests**: unit
**Gate**: full

**Commit**: `feat(frontend): process the whole inbox with a final review`

---

### T28: Lembrete na Agenda

**What**: A Agenda desenha o lembrete com hora como marcador no horário, sem bloco de duração.
**Where**: `frontend/src/components/agenda/scheduled-block.tsx`
**Depends on**: None
**Reuses**: `ScheduledBlock`
**Requirement**: REM-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Lembrete às 10:00 vira um marcador com sino na linha das 10:00, sem altura de duração e sem arraste de duração
- [x] Tarefa agendada com hora continua como bloco
- [x] Gate check passes: Quick

**Also touched**: `frontend/src/types/index.ts` (`ScheduledTask.kind`, opcional porque as fixtures antigas não o têm), `frontend/src/components/agenda/scheduled-block.test.tsx`, `frontend/src/locales/pt-BR.json`, `frontend/src/locales/en.json` (`Lembrete · HH:MM`). O marcador continua arrastável para outro horário (mover, não mudar a duração). Fim da fase: build do frontend ok.

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): show reminders as markers in the agenda`

---

### T29: Atalho global de captura

**What**: `capture-shortcut.ts` registrando, trocando e liberando o atalho com `globalShortcut`, guardado no `config-store`; o teste do WIDGET-05 aceita só essa exceção nomeada (AD-012).
**Where**: `desktop/src/main/capture-shortcut.ts`
**Depends on**: None
**Reuses**: `config-store.ts`, injeção de dependências de `widget-controller.ts`
**Requirement**: CAP-07, CAP-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Padrão `CommandOrControl+Shift+Space` ligado; trocar libera o anterior antes de registrar
- [x] `register` falso grava `enabled: false` e devolve `in_use`
- [x] Desligar libera a combinação
- [x] O teste do WIDGET-05 falha se `globalShortcut` aparecer em qualquer outro arquivo
- [x] Gate check passes: Full (desktop)

**Also touched**: `desktop/src/main/config-store.ts` (`getCaptureShortcut`/`setCaptureShortcut`, padrão quando o valor salvo é inválido), `desktop/src/main/config-store.test.ts`, `desktop/src/main/capture-shortcut.test.ts`, `desktop/src/main/widget-shortcut.test.ts`. `globalShortcut` é o do Electron por padrão dentro de `capture-shortcut.ts`, para o `index.ts` não precisar citá-lo (AD-012). `register` que lança erro (combinação inválida ou sem suporte, como no Wayland) também vira `in_use`.

**Status**: ✅ Done

**Tests**: unit
**Gate**: full

**Commit**: `feat(desktop): register a global shortcut for capture only`

---

### T30: Janela de captura do desktop

**What**: `capture-window.ts`, rota `/capture` do frontend fora do layout, IPC `capture:get-shortcut`, `capture:set-shortcut` e `capture:close`, e a ligação no `index.ts`.
**Where**: `desktop/src/main/capture-window.ts`
**Depends on**: T29
**Reuses**: `widget-window.ts`, `trustedHandle`, `WINDOW_ROLE_ARG`
**Requirement**: CAP-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] O atalho abre a janela no topo, carregando `/capture`; um segundo toque só a foca
- [x] Guardar envia `source: "desktop"` e fecha a janela; perder o foco fecha
- [x] Os canais novos recusam remetente fora de `app://trackzyn/`; a contagem de membros da `TrackzynApi` foi atualizada
- [x] Gate check passes: Full (desktop)

**Also touched**: `desktop/src/main/index.ts`, `desktop/src/shared/ipc.ts`, `desktop/src/preload/index.ts`, `frontend/src/pages/capture-window.tsx`, `frontend/src/App.tsx`, `desktop/src/main/capture-window.test.ts`, `desktop/src/main/config-store.ts` (o tipo passa a vir de `shared/ipc.ts`), `desktop/src/preload/index.test.ts` (26 membros e o papel `capture`), `frontend/src/lib/platform.ts` (espelho dos 26 membros), `frontend/src/lib/desktop/focus-window.ts` (`windowRole` com `capture`), `frontend/src/pages/capture-window.test.tsx`, `frontend/src/App.test.tsx`, e as pontes falsas de sete testes do frontend que montam a `TrackzynApi` inteira. A janela tem 560×150, `center: true`, e o atalho chama `app.focus({ steal: true })` antes de abri-la, para as teclas chegarem ao campo com outro app na frente. O atalho é liberado no `will-quit`. Os canais novos entram na checagem de `ipc.test.ts`, que exige `trustedHandle` e recusa remetente fora de `app://trackzyn/` em todo canal de `IPC`.

**Status**: ✅ Done

**Tests**: unit
**Gate**: full

**Commit**: `feat(desktop): open a capture window from the global shortcut`

---

### T31: Card Neste computador

**What**: Card nas configurações do workspace, só no desktop, com o switch do atalho, o campo que grava a combinação e a mensagem de conflito.
**Where**: `frontend/src/components/capture/capture-shortcut-settings.tsx`
**Depends on**: T30
**Reuses**: `isDesktop`, `getDesktopApi`
**Requirement**: CAP-07, CAP-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Fora do desktop o card não aparece
- [x] Desligar e trocar chamam o IPC; resposta `in_use` mostra `Esse atalho já está em uso` e o switch desligado
- [x] Gate check passes: Full (frontend)

**Also touched**: `frontend/src/pages/workspace-settings.tsx`, `frontend/src/locales/pt-BR.json`, `frontend/src/locales/en.json` (`capture.computer.*`), `frontend/src/lib/desktop/accelerator.ts` e o teste (combinação apertada para acelerador do Electron e exibição `⌘⇧Space` / `Ctrl+Shift+Space`), `frontend/src/components/capture/capture-shortcut-settings.test.tsx`, `frontend/src/pages/workspace-settings.test.tsx`. O campo é um botão: clicar começa a gravar, a próxima combinação com Ctrl, ⌘ ou Alt vira o atalho (ligado), Esc cancela. Uma tecla sem modificador além de Shift não vale, para o atalho global não tomar uma tecla de todos os apps.

**Status**: ✅ Done

**Tests**: unit
**Gate**: full

**Commit**: `feat(frontend): change the capture shortcut on this computer`

---

### T34: Dono, rascunho, corrida e limite de 30 dias na caixa

**What**: `commitDrafts` responde 404 a um id de item de outro usuário; descartar apaga o rascunho; teste da corrida real em `takeItem`; testes do limite de 30 dias.
**Where**: `backend-node/src/services/inbox.ts`
**Depends on**: None
**Reuses**: `findItem`, `takeItem`
**Requirement**: INBOX-03, INBOX-04, INBOX-06, EDGE-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `POST /api/inbox/commit` com o id de um item de outro usuário → 404 e nada enviado; o mesmo pedido só com itens próprios continua funcionando (L-048)
- [x] Descartar um item com rascunho apaga o rascunho; restaurá-lo traz `draft: null`, e a próxima confirmação não o envia
- [x] Um teste chama `takeItem` (ou `sendItem` sem o pré-check) para um item já tirado e recebe 409 `already_processed`, matando a remoção do guarda `if (!taken)`
- [x] Item descartado há exatamente 30 dias continua; há 30 dias e 1 minuto some (mata `TRASH_DAYS` 29.5 e 30.5)
- [x] Gate check passes: Full (backend)

**Also touched**: `backend-node/test/routes/inbox.test.ts`, `backend-node/test/routes/inbox-send.test.ts`, `backend-node/test/routes/inbox-commit.test.ts`. O teste da corrida passa por `sendItem` com um `db` cujo `transaction` deixa outro envio terminar antes (depois do pré-check), sem exportar `takeItem`. O limite de 30 dias chama `listItems` com relógio fixo. Mutantes conferidos numa cópia: sem o `if (!taken)`, `TRASH_DAYS` 29.5 e 30.5, cada um derruba um teste.

**Status**: ✅ Done

**Tests**: integration
**Gate**: full

**Commit**: `fix(backend): guard the inbox commit, discard drafts and pin the trash window`

---

### T35: Envio: item sai, tarefa no fim, lembrete e dia passado

**What**: Testes de envio que provam que o item sai da caixa e a tarefa entra no fim da coluna, o lembrete com agendamento segue a regra de coluna, e o dia já passado da semana vai para Hoje nas duas cópias de `targetColumn`.
**Where**: `backend-node/test/routes/inbox-send.test.ts`
**Depends on**: T34
**Reuses**: fixtures de `inbox-send.test.ts`
**Requirement**: PROC-03, PROC-05, PROC-06, REM-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Envio avulso de tarefa: `GET /api/inbox` não lista mais o item e a tarefa tem a maior `position` da coluna, depois de uma tarefa que já estava lá
- [x] `done` (Já fiz): o item sai e a tarefa fica em Concluídas com `completed_by` do usuário
- [x] Lembrete agendado para hoje cai em Hoje; para outro dia ainda por vir da semana, em Esta semana; para a semana seguinte, em Backlog
- [x] Dia já passado da semana → Hoje em `backend-node/src/services/decision.ts` e em `frontend/src/lib/inbox/decision.ts`
- [x] Gate check passes: Full (backend) e Quick

**Also touched**: `backend-node/test/services/decision.test.ts`, `frontend/src/lib/inbox/decision.test.ts`. Só testes: o código já seguia a regra. O lembrete agendado passa por `sendItem` com relógio fixo (quarta, 2026-11-11), porque a leitura do quadro levaria a Hoje um dia já vencido no relógio real.

**Status**: ✅ Done

**Tests**: integration
**Gate**: full

**Commit**: `test(backend): prove where processed items land`

---

### T36: API recusa prazo, flag, Aguardando e grupo em lembrete

**What**: `resolveFields` responde 422 quando um lembrete recebe `due_on`, `flagged`, `waiting` ou `group_id`, na criação, na edição e no envio da caixa.
**Where**: `backend-node/src/services/tasks.ts`
**Depends on**: None
**Reuses**: `resolveFields`
**Requirement**: MODAL-06, REM-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `PATCH` de um lembrete com cada um dos quatro campos → 422 com `code: reminder_field` e nada gravado
- [x] Uma tarefa comum aceita os mesmos campos (L-048)
- [x] Decisão `reminder` com `due_on` → 422
- [x] Gate check passes: Full (backend)

**Also touched**: `backend-node/src/services/decision.ts` (a decisão `reminder` recusa `due_on` como já recusava a estimativa; vale no envio e no rascunho), `backend-node/test/routes/tasks-fields.test.ts`, `backend-node/test/routes/inbox-send.test.ts`, `backend-node/test/mcp/task-fields-tools.test.ts` (o teste que criava um lembrete com prazo pelo MCP passou a esperar o erro: MODAL-06 mudou em 2026-11-13). A regra olha o valor final: limpar os campos num lembrete (`due_on: null`, `flagged: false`) continua aceito. Fora do escopo: arrastar um lembrete para dentro de um contêiner (`moveTask`) ainda o põe no grupo.

**Status**: ✅ Done

**Tests**: integration
**Gate**: full

**Commit**: `fix(backend): keep reminders to name, priority and schedule`

---

### T37: Soma otimista ignora tarefas em Aguardando

**What**: `estimateOf` em `list-board.tsx` deixa de somar tarefas em Aguardando na coluna e no pendente de Hoje ao editar a estimativa na hora.
**Where**: `frontend/src/pages/list-board.tsx`
**Depends on**: None
**Reuses**: regra do `sum` do backend (WAIT-04)
**Requirement**: WAIT-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Editar a estimativa de uma tarefa em Hoje com outra tarefa em Aguardando: o cabeçalho e o pendente mostram a soma sem a tarefa em Aguardando, antes do refetch
- [x] Gate check passes: Full (frontend)

**Also touched**: `frontend/src/pages/list-board.test.tsx`.

**Status**: ✅ Done

**Tests**: unit
**Gate**: full

**Commit**: `fix(frontend): leave waiting tasks out of the optimistic column sums`

---

### T38: Lembrete sem foco, sem campos extras e com dia no card

**What**: O card de lembrete não oferece `Iniciar foco`; `Focar agora` fica desabilitado quando Hoje só tem lembretes; o modal do lembrete esconde Prazo, Flag e Aguardando; teste do card só com dia.
**Where**: `frontend/src/components/board/reminder-card.tsx`
**Depends on**: None
**Reuses**: `board-column.tsx`, `task-dialog.tsx`
**Requirement**: REM-03, REM-05, MODAL-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] O menu do card de lembrete não tem `Iniciar foco`; o de uma tarefa em Hoje tem (L-048)
- [x] Hoje só com lembretes: `Focar agora` desabilitado; com uma tarefa, habilitado
- [x] Modal de lembrete sem Prazo, Flag, Aguardando, Estimativa, Grupo e Subtarefas; o de tarefa mostra todos
- [x] Lembrete só com dia mostra o dia; com dia e hora, a hora
- [x] Gate check passes: Full (frontend)

**Also touched**: `frontend/src/components/board/board-column.tsx` (`Focar agora` e o botão de abrir o foco ficam desabilitados quando Hoje não tem uma tarefa que não seja lembrete), `frontend/src/components/board/task-dialog.tsx` (lembrete sem Prazo, Flag e Aguardando), `frontend/src/components/board/board-column.test.tsx`, `frontend/src/components/board/task-dialog.test.tsx` (o teste MODAL-06 que esperava Prazo, Flag e Aguardando num lembrete passou a esperar o contrário: a spec mudou em 2026-11-13), `frontend/src/components/board/task-card.test.tsx`, `frontend/src/pages/list-board.test.tsx`. `reminder-card.tsx` e `task-card-menu.tsx` não mudaram. Desvio: nenhum card, nem o de tarefa, tem `Iniciar foco` no menu; o foco começa por `Focar agora` e pela tela do foco, que já ignora lembretes (T32). Por isso o contraste do L-048 é feito em `Focar agora` (desabilitado só com lembretes, habilitado com uma tarefa), e o teste do menu confere a lista exata de itens do lembrete.

**Status**: ✅ Done

**Tests**: unit
**Gate**: full

**Commit**: `fix(frontend): keep reminders out of focus and trim their dialog`

---

### T39: Atalho no desktop, paleta, grupo e campos do card

**What**: No desktop com o atalho global ligado, o hook do overlay não reage a Mod+Shift+Space (a janelinha abre); testes: a paleta abre o overlay com o campo focado, o contêiner do grupo respeita Campos do card e o grupo do Processar aceita prioridade.
**Where**: `frontend/src/hooks/use-capture-hotkey.ts`
**Depends on**: None
**Reuses**: `isDesktop`, `getDesktopApi().getCaptureShortcut`
**Requirement**: CAP-04, CAP-06, FIELDS-06, PRI-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] No desktop com o atalho global ligado, Mod+Shift+Space não abre o overlay; com ele desligado, abre; no web, abre
- [x] `Capturar` na paleta abre o overlay e o campo tem o foco
- [x] Contêiner com cada campo desligado: os cards dentro escondem o campo; o contêiner continua aparecendo
- [x] No Processar como grupo, escolher Alta envia `priority: "high"` na decisão
- [x] Gate check passes: Full (frontend)

**Also touched**: `frontend/src/components/capture/capture-overlay.test.tsx` (o teste do hook), `frontend/src/components/command-palette.test.tsx` (a paleta ligada ao overlay como o layout liga), `frontend/src/components/board/group-container.test.tsx`, `frontend/src/components/inbox/process-dialog.test.tsx`. O hook lê `getCaptureShortcut()` a cada toque, porque o atalho pode mudar nas preferências (CAP-07); ligado com qualquer combinação, o overlay não abre por Mod+Shift+Space, como diz CAP-04.

**Status**: ✅ Done

**Tests**: unit
**Gate**: full

**Commit**: `fix(frontend): let the desktop shortcut own capture and cover group fields`

---

### T40: Tarefas do grupo valem como tarefas comuns

**What**: Testes que provam que uma tarefa de grupo entra no foco, na Agenda agendada, nos candidatos do planejamento e nos relatórios como qualquer tarefa.
**Where**: `backend-node/test/routes/group-tasks.test.ts`
**Depends on**: None
**Reuses**: fixtures de foco, Agenda, plano e relatórios
**Requirement**: GRP-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tarefa de grupo em Hoje inicia foco e conta tempo gasto
- [x] Tarefa de grupo agendada aparece em `GET /api/agenda/scheduled`
- [x] Tarefa de grupo aparece nos candidatos do plano
- [x] Sessão numa tarefa de grupo entra no total dos relatórios
- [x] Gate check passes: Full (backend)

**Also touched**: nenhum; só o arquivo de teste novo, sem mudança de código.

**Status**: ✅ Done

**Tests**: integration
**Gate**: full

**Commit**: `test(backend): treat group tasks as ordinary tasks`

---

### T41: Lembrete não entra em grupo pelo arraste

**What**: `moveTask` responde 422 `reminder_field` quando um lembrete terminaria num grupo, e `dropTarget` deixa o lembrete solto ao cair num contêiner ou num card de grupo.
**Where**: `backend-node/src/services/tasks.ts`
**Depends on**: None
**Reuses**: `fieldError('…', 'reminder_field')` de T36
**Requirement**: MODAL-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `POST /api/tasks/:id/move` de um lembrete com `group_id` → 422 `reminder_field`, e o lembrete continua na coluna e sem grupo; a mesma jogada com uma tarefa → 200 no grupo (L-048)
- [x] Lembrete sem `group_id` ou com `group_id: null` continua mudando de coluna
- [x] `dropTarget` de um lembrete sobre `group:`, `container:` ou um card do grupo devolve `group: undefined`; uma tarefa no mesmo lugar entra no grupo
- [x] Gate check passes: Full (backend) e Full (frontend)

**Also touched**: `frontend/src/components/board/drop-target.ts`, `backend-node/test/routes/tasks-group-move.test.ts`, `frontend/src/components/board/drop-target.test.ts`
**Status**: ✅ Done

**Tests**: integration
**Gate**: full

**Commit**: `fix(backend): keep reminders out of groups when they are moved`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7
```

As dependências de cada fase estão nos diagramas do Execution Plan.

Execution is strictly sequential: one task at a time, in order.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 | Uma migration e o schema | ✅ Granular |
| T2 | Campos novos no serviço e na rota de tarefa | ⚠️ Coeso: serviço + rota da mesma entidade |
| T3 | Duas regras em `tasks.ts` | ✅ Granular |
| T4 | `buildBoard` | ✅ Granular |
| T5 | Foco e Agenda recusam/marcam lembrete | ⚠️ Coeso: a mesma regra de lembrete |
| T6 | Ferramentas MCP | ✅ Granular |
| T32 | Um filtro em `focus-state.ts` | ✅ Granular |
| T7 | Serviço de grupos + uma rota | ✅ Granular |
| T8 | `moveTask` com grupo | ✅ Granular |
| T9 | Uma rota e uma função | ✅ Granular |
| T10 | Um serviço e uma rota | ✅ Granular |
| T33 | Uma chamada em `schedule.ts` | ✅ Granular |
| T11 | Um módulo de funções puras | ✅ Granular |
| T12 | Serviço da caixa + rotas de leitura e manutenção | ⚠️ Coeso: o CRUD do item |
| T13 | Um endpoint | ✅ Granular |
| T14 | Um endpoint | ✅ Granular |
| T15 | Escopo, ferramenta e limpeza de membro | ⚠️ Coeso: a captura fora do app |
| T16 | Cliente HTTP e tipos | ✅ Granular |
| T17 | Dois utilitários de exibição | ✅ Granular |
| T18 | Um componente (+ variante de lembrete) | ✅ Granular |
| T19 | Um componente | ✅ Granular |
| T20 | Um componente + uma função pura | ✅ Granular |
| T21 | DnD do quadro | ✅ Granular |
| T22 | Um componente | ✅ Granular |
| T23 | Uma página + item de navegação | ✅ Granular |
| T24 | Um componente | ✅ Granular |
| T25 | Um componente + um hook | ✅ Granular |
| T26 | Um componente | ✅ Granular |
| T27 | Um componente | ✅ Granular |
| T28 | Um componente | ✅ Granular |
| T29 | Um módulo do main | ✅ Granular |
| T30 | Uma janela + IPC | ✅ Granular |
| T31 | Um componente | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | — | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T2 | T2 → T4 | ✅ Match |
| T5 | T2 | T2 → T5 | ✅ Match |
| T6 | T4 | T4 → T6 | ✅ Match |
| T32 | None | — | ✅ Match |
| T7 | None | — | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |
| T10 | None | — | ✅ Match |
| T33 | None | — | ✅ Match |
| T11 | None | — | ✅ Match |
| T12 | None | — | ✅ Match |
| T13 | T11, T12 | T11 → T13, T12 → T13 | ✅ Match |
| T14 | T13 | T13 → T14 | ✅ Match |
| T15 | T12 | T12 → T15 | ✅ Match |
| T16 | None | — | ✅ Match |
| T17 | T16 | T16 → T17 | ✅ Match |
| T18 | T17 | T17 → T18 | ✅ Match |
| T19 | T18 | T18 → T19 | ✅ Match |
| T20 | T18 | T18 → T20 | ✅ Match |
| T21 | T20 | T20 → T21 | ✅ Match |
| T22 | T17 | T17 → T22 | ✅ Match |
| T23 | None | — | ✅ Match |
| T24 | T23 | T23 → T24 | ✅ Match |
| T25 | T23 | T23 → T25 | ✅ Match |
| T26 | T24 | T24 → T26 | ✅ Match |
| T27 | T26 | T26 → T27 | ✅ Match |
| T28 | None | — | ✅ Match |
| T29 | None | — | ✅ Match |
| T30 | T29 | T29 → T30 | ✅ Match |
| T31 | T30 | T30 → T31 | ✅ Match |
| T34 | None | — | ✅ Match |
| T35 | T34 | T34 → T35 | ✅ Match |
| T36 | None | — | ✅ Match |
| T37 | None | — | ✅ Match |
| T38 | None | — | ✅ Match |
| T39 | None | — | ✅ Match |
| T40 | None | — | ✅ Match |
| T41 | None | — | ✅ Match |

Fases anteriores são pré-requisito implícito de toda fase seguinte (a ordem das fases); nenhuma tarefa depende de uma fase posterior.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Migration e schema | integration | integration | ✅ OK |
| T2 | Serviços + rotas | integration | integration | ✅ OK |
| T3 | Serviços | integration | integration | ✅ OK |
| T4 | Serviços | integration | integration | ✅ OK |
| T5 | Serviços | integration | integration | ✅ OK |
| T6 | Rotas e MCP | integration | integration | ✅ OK |
| T32 | Serviços | integration | integration | ✅ OK |
| T7 | Serviços + rota + função pura | integration | integration | ✅ OK |
| T8 | Serviços + rota | integration | integration | ✅ OK |
| T9 | Serviços + rota | integration | integration | ✅ OK |
| T10 | Serviços + rota | integration | integration | ✅ OK |
| T33 | Serviços | integration | integration | ✅ OK |
| T11 | Funções puras | unit | unit | ✅ OK |
| T12 | Serviços + rotas | integration | integration | ✅ OK |
| T13 | Serviços + rota | integration | integration | ✅ OK |
| T14 | Serviços + rota | integration | integration | ✅ OK |
| T15 | Rotas e MCP | integration | integration | ✅ OK |
| T16 | Cliente HTTP e tipos | unit + build | unit | ✅ OK |
| T17 | Componentes + funções puras | unit | unit | ✅ OK |
| T18 | Componentes | unit | unit | ✅ OK |
| T19 | Componentes | unit | unit | ✅ OK |
| T20 | Componentes + funções puras | unit | unit | ✅ OK |
| T21 | Componentes + funções puras | unit | unit | ✅ OK |
| T22 | Componentes | unit | unit | ✅ OK |
| T23 | Páginas | unit | unit | ✅ OK |
| T24 | Componentes | unit | unit | ✅ OK |
| T25 | Componentes | unit | unit | ✅ OK |
| T26 | Componentes | unit | unit | ✅ OK |
| T27 | Componentes | unit | unit | ✅ OK |
| T28 | Componentes | unit | unit | ✅ OK |
| T29 | Processo principal do desktop | unit | unit | ✅ OK |
| T30 | Processo principal do desktop + página | unit | unit | ✅ OK |
| T31 | Componentes | unit | unit | ✅ OK |
| T34 | Serviços + rotas | integration | integration | ✅ OK |
| T35 | Rotas + funções puras | integration | integration | ✅ OK |
| T36 | Serviços | integration | integration | ✅ OK |
| T37 | Páginas | unit | unit | ✅ OK |
| T38 | Componentes | unit | unit | ✅ OK |
| T39 | Componentes + hook | unit | unit | ✅ OK |
| T40 | Rotas | integration | integration | ✅ OK |
| T41 | Serviços + funções puras | integration | integration | ✅ OK |

---

## Requirement Coverage

Todos os requisitos da spec estão em pelo menos uma tarefa (conferido por script). GRP-11 (tarefas do grupo valem como tarefas comuns) está em T8 sem mudança de código no foco, na Agenda, no planejamento e nos relatórios: eles leem `tasks` sem olhar `group_id`.
