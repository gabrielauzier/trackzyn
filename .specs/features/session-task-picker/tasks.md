# Tarefa da nova sessão Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: decisões abaixo; o desenho visual aprovado é o canvas `Agenda · escolher ou criar tarefa`
**Status**: In Progress
**Pré-requisito**: a Agenda (#19), na branch `feat/agenda`.

### Decisões técnicas

| Decisão | Escolha | Motivo |
| ------- | ------- | ------ |
| Data de atualização | Coluna `tasks.updated_at timestamptz NOT NULL`, migration `0009_task_updated_and_origin.sql` que preenche `greatest(created_at, coalesce(completed_at, created_at))` | Não existe hoje; PICK-01 e PICK-02 |
| Quem atualiza | Os serviços que escrevem: `createTask`, `duplicateTask` (a cópia nasce agora), `updateTask` quando muda um campo, `moveTask` quando a coluna muda, `moveTaskToList`, e `createSubtask`, `updateSubtask` e `deleteSubtask` na tarefa da subtarefa; renumerar posições não conta | Lista confirmada do que é atualizar (#27) |
| Origem | Coluna `tasks.created_from varchar(16)` nula, com `CHECK (created_from IN ('agenda'))`; a leitura do `created_via` passa a ser `coalesce(<nome do token>, CASE created_from WHEN 'agenda' THEN 'Agenda' END)`, no `getTask` (`services/tasks.ts`) e no quadro (`services/board.ts`) | A etiqueta de hoje vem só do token; o frontend já mostra `via {{name}}` |
| Pesquisa | `GET /api/sessions/tasks` ganha `q` (até 255 caracteres): `ILIKE` com `%`, `_` e `\` escapados, `ORDER BY updated_at DESC`, `LIMIT 50`; sem `q`, `LIMIT 10` | PICK-03 a PICK-05; o padrão de busca do Postgres e do PGlite |
| Criação | `POST /api/sessions/tasks` com `list_id`, `title`, `estimate_minutes?`, `notes?`: chama `createTask` com `column: 'done'`, `createdFrom: 'agenda'` e `rejectArchived`, exige escrita e fica fechado a tokens (AD-007) como as rotas da Agenda | Reaproveita a validação e a conclusão de `createTask` (AD-006) |
| Seletor | `SessionTaskPicker` num `Popover`, com a consulta por `useQuery(['agenda-tasks', q])` e o texto atrasado em 300 ms por um `useDebouncedValue` | PICK-06 a PICK-11 |
| Modal | `NewSessionTaskDialog` com `Dialog`, `react-hook-form` e as regras de `add-task-form.tsx` (título e estimativa), `Select` de listas, `Switch` e o `NoteEditor` de `task-dialog.tsx` | Mesmos campos e mensagens do quadro (PICK-14) e o mesmo editor (PICK-13) |

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `CONTRIBUTING.md`, `backend-node/vitest.config.ts`, `frontend/vitest.config.ts`. Onde os guias não definem profundidade, valem os padrões fortes da skill.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Migration e schema | integration (PGlite) | Tarefa antiga recebe `greatest(criação, conclusão)`; `created_from` nulo e o `CHECK`; catálogo lido de um PostgreSQL 16 real | `backend-node/test/db/*.test.ts` | `npm --prefix backend-node test` |
| Serviços de tarefa e subtarefa | integration (PGlite) | Cada escrita da lista de PICK-01 muda `updated_at`; renumerar não muda | `backend-node/test/services/*.test.ts` | `npm --prefix backend-node test` |
| Rotas | integration (`app.inject`) | `GET` sem e com `q` (10, 50, ordem, maiúsculas, `%` e `_` literais, espaços, listas arquivadas); `POST` feliz, 422, 403, lista arquivada, `via Agenda` no quadro e na tarefa | `backend-node/test/routes/*.test.ts` | `npm --prefix backend-node test` |
| Componentes e páginas | unit (Testing Library) | Cada AC visível do seletor e do modal, o debounce com timers falsos | `frontend/src/**/*.test.tsx` | `npm --prefix frontend test` |
| Cliente HTTP, tipos e traduções | none | build gate (typecheck) | - | `npm --prefix frontend run typecheck` |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Tasks com testes de unidade do frontend | `npm --prefix frontend test` |
| Full | Tasks do backend, e as do frontend que tocam uma página | `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test` (backend) ou `npm --prefix frontend run lint && npm --prefix frontend run typecheck && npm --prefix frontend test` (frontend) |
| Build | Fim de cada fase | os dois Full acima + `npm --prefix frontend run build` |

---

## Execution Plan

### Phase 1: Backend

```
T1 → T2 → T3 → T4 → T5
```

### Phase 2: Frontend

```
T6 → T7 → T8
```

---

## Task Breakdown

### T1: As colunas `updated_at` e `created_from`

**What**: Migration `0009_task_updated_and_origin.sql` com `updated_at` (preenchida com a maior entre criação e conclusão) e `created_from` (nula, `CHECK` em `'agenda'`), as colunas no schema, e o catálogo `pg-columns.json` lido de novo de um PostgreSQL 16 real.
**Where**: `backend-node/drizzle/0009_task_updated_and_origin.sql`
**Depends on**: None
**Reuses**: `0008_workspace_merge_gap.sql` e `test/db/workspace-min-session-schema.test.ts`
**Requirement**: PICK-01, PICK-02

**Tools**:

- MCP: NONE
- Skill: `supabase-postgres-best-practices`

**Done when**:

- [x] Uma tarefa de antes da migration lê `updated_at` igual à sua criação, e uma concluída depois de criada, igual à conclusão
- [x] `created_from` lê nulo; o banco recusa `'outro'` e aceita `'agenda'`
- [x] `pg-columns.json` lido de um PostgreSQL 16 numa base temporária, apagada em seguida
- [x] Gate check passes: Full (backend)

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): add the last update and the origin of a task`

---

### T2: Manter a data de atualização

**What**: Cada escrita que conta como atualização grava `updated_at = now` na tarefa.
**Where**: `backend-node/src/services/tasks.ts`
**Depends on**: T1
**Reuses**: o `now` que os serviços já recebem; `services/subtasks.ts` para as subtarefas
**Requirement**: PICK-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Criar e duplicar gravam `updated_at` igual ao `now` da criação
- [x] Mudar título, anotações ou estimativa grava; um `PATCH` sem mudança não grava
- [x] Mover para outra coluna grava; reordenar na mesma coluna não grava, nem renumerar as vizinhas
- [x] Mover para outra lista grava
- [x] Criar, mudar e excluir uma subtarefa gravam na tarefa dela
- [x] Gate check passes: Full (backend)

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): keep the last update of a task`

---

### T3: `via Agenda` na leitura da tarefa

**What**: `created_via` vale `Agenda` para uma tarefa com origem `agenda`, na tarefa e no quadro.
**Where**: `backend-node/src/services/board.ts`
**Depends on**: T2
**Reuses**: o `LEFT JOIN` do token em `services/board.ts` e `services/tasks.ts`
**Requirement**: PICK-17

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Uma tarefa com `created_from = 'agenda'` lê `created_via: "Agenda"` em `GET /api/tasks/:id` e no quadro
- [x] Uma tarefa de token continua com o nome do token; uma comum, `null`
- [x] Gate check passes: Full (backend)

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): read the agenda origin of a task as via Agenda`

---

### T4: As tarefas recentes e a pesquisa

**What**: `GET /api/sessions/tasks` responde as 10 tarefas atualizadas por último sem `q`, e até 50 com `q`, pelo título.
**Where**: `backend-node/src/services/sessions.ts`
**Depends on**: T3
**Reuses**: `listSessionTasks` e a rota de `routes/sessions.ts`
**Requirement**: PICK-03, PICK-04, PICK-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Com 12 tarefas, sem `q`, vêm as 10 mais recentes, da mais recente à menos
- [ ] Com `q=REVIS`, vêm só as com "revis" no título, de várias listas, concluídas também, até 50
- [ ] `q=50%` acha `50% pronto` e não `500 pronto`; `q=a_b` não acha `axb`
- [ ] `q="   "` responde como sem `q`; uma lista arquivada fica de fora
- [ ] Cada tarefa traz `updated_at`; um `q` com mais de 255 caracteres responde 422
- [ ] Gate check passes: Full (backend)

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): list the recent session tasks and search them by title`

---

### T5: Criar a tarefa pela Agenda

**What**: `POST /api/sessions/tasks` cria a tarefa concluída, com origem `agenda`, e responde a tarefa.
**Where**: `backend-node/src/routes/sessions.ts`
**Depends on**: T4
**Reuses**: `createTask` (com `column: 'done'` e `rejectArchived`), as regras de título e estimativa de `routes/tasks.ts`
**Requirement**: PICK-15, PICK-20

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Cria em `done`, com `completed_at`, concluída pelo usuário, `created_from = 'agenda'`, a estimativa e as anotações enviadas; responde 201 com `created_via: "Agenda"`
- [ ] Título vazio, com mais de 255 caracteres ou estimativa fora de 1 a 1440 respondem 422 e não criam nada
- [ ] Um leitor recebe 403; uma lista arquivada, 409; uma lista de outro workspace, 404
- [ ] A rota responde 403 a um token (`CLOSED_AGENDA_ROUTES`)
- [ ] Gate check passes: Build

**Tests**: integration
**Gate**: build

**Commit**: `feat(backend): create a concluded task from the agenda`

---

### T6: O seletor de tarefa

**What**: `SessionTaskPicker`: o botão do campo `Tarefa` e o popover com a pesquisa atrasada em 300 ms, os grupos por lista, `Concluída`, o destaque, o limpar, o vazio e o botão de criar.
**Where**: `frontend/src/components/agenda/session-task-picker.tsx`
**Depends on**: None
**Reuses**: `Popover`, os grupos de `session-panel.tsx`, o cliente `sessions.tasks`
**Requirement**: PICK-06, PICK-07, PICK-08, PICK-09, PICK-10, PICK-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Abrir mostra a pesquisa com o foco, `As 10 atualizadas por último` e as tarefas agrupadas por lista, com `Concluída` nas concluídas
- [ ] Digitar "revis" só consulta depois de 300 ms sem tecla, uma vez, e mostra `4 tarefas para “revis”, em todas as listas` com o trecho destacado
- [ ] O limpar volta às 10 recentes
- [ ] Sem resultado, mostra `Nenhuma tarefa encontrada` e `Criar “<texto>”`, que chama `onCreate` com o texto
- [ ] Escolher uma tarefa chama `onChange` e fecha o popover
- [ ] Gate check passes: Quick

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): add the session task picker with search`

---

### T7: O modal de nova tarefa

**What**: `NewSessionTaskDialog`: Lista, Título, Estimativa, `Adicionar anotações` com o `NoteEditor`, `Cancelar` e `Adicionar`, que chama `POST /api/sessions/tasks`.
**Where**: `frontend/src/components/agenda/new-session-task-dialog.tsx`
**Depends on**: T6
**Reuses**: `Dialog`, as regras de `components/board/add-task-form.tsx`, `NoteEditor`, `Switch`
**Requirement**: PICK-12, PICK-13, PICK-14, PICK-15, PICK-18, PICK-19

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Abre com a lista e o título recebidos, o interruptor desligado e o editor escondido; ligar mostra o editor
- [ ] Título vazio, com 256 caracteres e estimativa 0 mostram as mensagens do quadro e não enviam nada
- [ ] `Adicionar` envia lista, título, estimativa e, só com o interruptor ligado, as anotações; desligar depois de digitar não envia anotações
- [ ] Com a criação feita, chama `onCreated` com a tarefa; com erro da API, fica aberto com o que foi digitado e mostra o erro
- [ ] `Cancelar`, Esc e o fechar fecham sem enviar
- [ ] Gate check passes: Quick

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): add the new task dialog of the agenda`

---

### T8: Ligar o seletor e o modal no painel

**What**: O painel `Nova sessão` usa o `SessionTaskPicker` no lugar do select, abre o `NewSessionTaskDialog` pelo botão de criar (com a lista do filtro da Agenda ou a primeira) e escolhe a tarefa criada; editar uma sessão fica como hoje.
**Where**: `frontend/src/components/agenda/session-panel.tsx`
**Depends on**: T7
**Reuses**: o estado da tarefa escolhida do painel; o filtro de lista de `pages/agenda.tsx`
**Requirement**: PICK-06, PICK-12, PICK-16, PICK-19

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `Nova sessão` mostra o seletor; `Editar sessão` mostra o select de hoje
- [ ] Criar pela pesquisa "reunião com o jurídico" abre o modal com esse título e a lista do filtro, e depois de `Adicionar` o campo `Tarefa` mostra a tarefa nova, com o modal e o popover fechados
- [ ] Cancelar o modal deixa o popover aberto
- [ ] Sem nenhuma lista ativa, `Criar nova tarefa` fica desabilitado
- [ ] Gate check passes: Build

**Tests**: unit
**Gate**: build

**Commit**: `feat(frontend): pick or create the task of a new agenda session`

---

## Phase Execution Map

```
Phase 1 → Phase 2

Phase 1:  T1 ------→ T2 ------→ T3 ------→ T4 ------→ T5
Phase 2:  T6 ------→ T7 ------→ T8
```

8 tasks: um batch só, no contexto principal, sem sub-agentes. O Verifier roda depois de T8.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: Colunas | 1 migration + colunas no schema | ✅ Granular |
| T2: Data de atualização | os serviços de escrita de tarefa | ⚠️ Coeso: a mesma regra em cada escrita |
| T3: `via Agenda` | 1 leitura (quadro e tarefa) | ✅ Granular |
| T4: Recentes e pesquisa | 1 consulta + 1 rota | ✅ Granular |
| T5: Criar | 1 rota | ✅ Granular |
| T6: Seletor | 1 componente | ✅ Granular |
| T7: Modal | 1 componente | ✅ Granular |
| T8: Painel | 1 componente | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | início da Phase 1 | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | None | início da Phase 2 | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Migration e schema | integration | integration | ✅ OK |
| T2 | Serviços de tarefa e subtarefa | integration | integration | ✅ OK |
| T3 | Serviços / rotas | integration | integration | ✅ OK |
| T4 | Serviços e rotas | integration | integration | ✅ OK |
| T5 | Rotas | integration | integration | ✅ OK |
| T6 | Componentes | unit | unit | ✅ OK |
| T7 | Componentes | unit | unit | ✅ OK |
| T8 | Componentes e páginas | unit | unit | ✅ OK |
