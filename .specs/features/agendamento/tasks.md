# Agendamento de tarefas Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Spec**: `.specs/features/agendamento/spec.md` (US-1 a US-14, D1 a D23)
**Design**: `.specs/features/agendamento/design.md` (desenho lógico) e as decisões abaixo; o desenho visual aprovado é o canvas `Agendamento de tarefas`, https://claude.ai/artifact/3PBEaM4xuqa4e2iB74KGnX (aprovado em 2026-11-07)
**Status**: Draft
**Pré-requisito**: a Agenda (#19) e os ajustes da Agenda (#29); o quadro de `listas-e-quadro`.

### Decisões técnicas

| Decisão | Escolha | Motivo |
| ------- | ------- | ------ |
| Colunas do agendamento | `tasks.scheduled_on date`, `tasks.scheduled_time time` (passo de 15 min, `check`), `tasks.schedule_applied_at timestamptz`; `check` de que a hora só existe com o dia | Modelo de dados do spec; dia e hora no fuso do workspace (`dayTimezone`) |
| Série | Tabela `task_series` com `freq`, `interval`, `weekdays smallint[]`, `month_day`, `until`, `count`, `created_count`, `ended_at`; `tasks.series_id` com `on delete set null` | Modelo do spec; regras estruturadas validadas por `check` e por zod |
| Ida para Hoje | `applyDueSchedules(db, workspaceId, now)` em `services/schedule.ts`, chamada no começo das leituras do quadro, da home, do foco e da Agenda, na mesma transação da leitura | Liquidação na leitura, como AD-001; funciona no PGlite sem worker (D1) |
| Regras ao salvar | `setSchedule` em `services/schedule.ts` aplica D3 e D21 e reaproveita `moveTask` para mudar de coluna | Uma regra só para PATCH, MCP, arraste e painel |
| Próxima ocorrência | `nextOccurrence(rule, afterDate, today)` pura em `services/recurrence.ts`; `moveTask` chama `createNextOccurrence` ao entrar em `done` na mesma transação | D13 e D17; a criação não depende de job |
| Projeções da Agenda | Calculadas na leitura de `GET /agenda/scheduled?from&to`, a partir da ocorrência aberta de cada série, sem gravar | D14; nada a sincronizar quando a regra muda |
| "Só esta / esta e as próximas" | Campo `scope: 'occurrence' \| 'series'` no `PATCH /tasks/:id` e no `DELETE /tasks/:id`; a pergunta mora no frontend | D16; a API não decide pela pessoa |
| Seletor | `SchedulePicker` e `CustomRecurrence` em `frontend/src/components/schedule/`, reaproveitados pelo menu do card, pelo diálogo, pelo painel `Novo agendamento` e pelo painel do dia | Um componente só para os quatro pontos de entrada |
| Arraste na Agenda | `useGridDrag` ganha os gestos `moveScheduled` e `dropUntimed`; o futuro só é bloqueado para sessões | US-6, US-14 e D22 sem duplicar o hook |
| Duração de exibição | Estimativa ou 60 min (D23), em `lib/agenda/layout.ts` | Mesmo número no quadro, no diálogo e na grade |

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `CONTRIBUTING.md` (testes no backend para toda funcionalidade nova; frontend com Vitest e Testing Library via `renderWithProviders`), `frontend/vitest.config.ts`, `backend-node/vitest.config.ts`. Nenhuma lição confirmada.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Schema e migrações (backend) | integration (PGlite) | Cada coluna, `check` e índice novo: valor aceito e valor recusado | `backend-node/test/db/*-schema.test.ts` | `npm --prefix backend-node test` |
| Serviços do backend | integration (PGlite) | Todos os ramos; 1:1 com os critérios do spec; fuso, virada do dia, fim de mês e `until`/`count` | `backend-node/test/services/*.test.ts` | `npm --prefix backend-node test` |
| Rotas do backend | integration (Fastify inject) | Caminho feliz, 422 de validação, 403 de `viewer`, 404 de outro workspace | `backend-node/test/routes/*.test.ts` | `npm --prefix backend-node test` |
| Ferramentas MCP | integration | Cada ferramenta alterada: leitura e escrita dos campos novos e o erro de validação | `backend-node/test/mcp/*.test.ts` | `npm --prefix backend-node test` |
| Funções puras e hooks do frontend | unit | Todos os ramos e casos de borda do spec | `frontend/src/lib/**/*.test.ts(x)` | `npm --prefix frontend test` |
| Componentes e páginas do frontend | unit (Testing Library) | Cada critério visível, `viewer`, teclado (Esc) e 390 px quando a tela tem visão móvel | `frontend/src/**/*.test.tsx` | `npm --prefix frontend test` |
| Traduções | none | build gate (typecheck e `i18n.test.ts`) | `frontend/src/locales/*.json` | `npm --prefix frontend test` |
| Modelo do mobile | unit | Leitura do JSON com e sem os campos novos | `mobile/test/*_test.dart` | `cd mobile && flutter test` |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Tasks com testes só do frontend | `npm --prefix frontend test` |
| Full | Tasks do backend (serviço, rota, MCP, schema) | `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test` |
| Build | Fim de cada fase e tasks que tocam páginas | Full + `npm --prefix frontend run lint && npm --prefix frontend run typecheck && npm --prefix frontend test && npm --prefix frontend run build && npm --prefix backend-node run build` |

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Agendamento no backend

```
T1 → T2 → T3 → T4 → T5 → T6 → T7
```

### Phase 2: Recorrência no backend

```
T8 → T9 → T10 → T11 → T12 → T13 → T14
```

### Phase 2b: Correções do backend (D24–D29)

Decisões tomadas depois dos lotes 1 e 2 (2026-11-07).

```
T38 → T39 → T40 → T41 → T42 → T43 → T44
```

### Phase 3: Leitura da Agenda e contrato externo

```
T15 → T16 → T17
```

### Phase 4: Frontend — dados e quadro

```
T18 → T19 → T20 → T21 → T22 → T23 → T24
```

### Phase 5: Frontend — série e grade da Agenda

```
T25 → T26 → T27 → T28 → T29 → T30 → T31
```

### Phase 6: Frontend — interações da Agenda

```
T32 → T33 → T34 → T35 → T36
```

### Phase 7: Mobile

```
T37
```

---

## Task Breakdown

### T1: Colunas do agendamento na tarefa

**What**: Migração `0010_task_schedule.sql` e `schema.ts` com `scheduled_on`, `scheduled_time` e `schedule_applied_at`, mais os `check`s de hora só com dia e passo de 15 min.
**Where**: `backend-node/src/db/schema.ts`
**Depends on**: None
**Reuses**: `backend-node/drizzle/0009_task_updated_and_origin.sql`, `backend-node/test/db/task-updated-origin-schema.test.ts`
**Requirement**: Modelo de dados; D21

**Tools**:

- MCP: NONE
- Skill: `supabase-postgres-best-practices`

**Done when**:

- [x] A migração roda no PGlite e no Postgres; tarefas existentes ficam com os três campos nulos
- [x] `scheduled_time` sem `scheduled_on` e hora fora do passo de 15 min são recusados pelo banco
- [x] Gate check passes: `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test`
- [x] Test count: os testes anteriores continuam passando, mais os novos de `task-schedule-schema.test.ts`

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): add the schedule columns to tasks`

---

### T2: Regras ao salvar o agendamento

**What**: `setSchedule(db, task, { on, time }, now)` aplica as regras ao salvar: zera `schedule_applied_at` quando o dia ou a hora mudam, leva Backlog com dia nesta semana para o fim de Esta semana, leva o dia de hoje para o fim de Hoje marcando `schedule_applied_at`, e mantém Esta semana e Hoje com dia futuro onde estão.
**Where**: `backend-node/src/services/schedule.ts`
**Depends on**: T1
**Reuses**: `moveTask` em `services/tasks.ts`, `dayTimezone` e `daySql` em `services/day.ts`
**Requirement**: US-1, US-2 (Regras ao salvar); D3, D21

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Cada regra tem teste com o fuso do workspace e com a semana de segunda a domingo
- [x] Recusa dia anterior a hoje e hora de hoje que já passou
- [x] Gate check passes (full)

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): apply the column rules when a task is scheduled`

---

### T3: Ida para Hoje na leitura

**What**: `applyDueSchedules(db, workspaceId, now)` move para o fim de Hoje as pendentes de Backlog e Esta semana com `scheduled_on <= hoje` e `schedule_applied_at` nulo, em ordem de dia, hora e `position`, mantendo dia e hora e gravando `schedule_applied_at`.
**Where**: `backend-node/src/services/schedule.ts` (modify)
**Depends on**: T2
**Reuses**: `moveTask`, `lockList`
**Requirement**: US-4; D1, D21

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tarefa tirada de Hoje à mão não volta; Hoje e Concluídas não mudam
- [x] Duas leituras concorrentes movem a tarefa uma vez só
- [x] Gate check passes (full)

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): move due scheduled tasks to today on read`

---

### T4: Ida para Hoje na leitura do quadro

**What**: `GET /lists/:id/board` chama `applyDueSchedules` antes de montar o quadro e devolve `scheduled_on`, `scheduled_time` e `series` em cada tarefa.
**Where**: `backend-node/src/routes/board.ts`
**Depends on**: T3
**Reuses**: `buildBoard` em `services/board.ts`
**Requirement**: US-3, US-4

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Uma tarefa agendada para hoje em Backlog aparece em Hoje na primeira leitura do dia
- [x] Gate check passes (full)

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): apply due schedules when the board is read`

---

### T5: Ida para Hoje na leitura da home

**What**: A leitura das listas da home chama `applyDueSchedules`, para a prévia do card de lista já mostrar a tarefa em Hoje.
**Where**: `backend-node/src/routes/lists.ts`
**Depends on**: T4
**Reuses**: `services/lists.ts`
**Requirement**: US-4

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] A prévia de 4 linhas (LIST-05) já conta a tarefa movida
- [x] Gate check passes (full)

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): apply due schedules when the home lists are read`

---

### T6: Ida para Hoje na leitura do foco e do widget

**What**: A leitura do foco (tela e widget) chama `applyDueSchedules` antes de listar as próximas tarefas de Hoje.
**Where**: `backend-node/src/routes/focus.ts`
**Depends on**: T5
**Reuses**: `services/focus-state.ts`
**Requirement**: US-4

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] A tarefa agendada para hoje entra nas próximas tarefas do foco
- [x] Gate check passes (full)

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): apply due schedules when the focus is read`

---

### T7: Agendamento no contrato da tarefa

**What**: `POST /tasks` e `PATCH /tasks/:id` aceitam `scheduled_on` (`YYYY-MM-DD` ou `null`) e `scheduled_time` (`HH:MM` múltiplo de 15 ou `null`) e chamam `setSchedule`; a resposta da tarefa devolve os dois campos.
**Where**: `backend-node/src/routes/tasks.ts`
**Depends on**: T6
**Reuses**: schemas zod de `routes/schemas.ts`, `test/routes/tasks.test.ts`
**Requirement**: US-1, US-2, US-7

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] 422 para hora sem dia, data inválida e hora fora do passo; 403 para `viewer`; o token com `tasks:write` agenda
- [x] Gate check passes (full)

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): accept the schedule on the task routes`

---

### T8: Tabela de séries

**What**: Migração `0011_task_series.sql` e `schema.ts` com `task_series` e `tasks.series_id`, com os `check`s de `freq`, `interval`, `weekdays`, `month_day` e de `until` e `count` não conviverem.
**Where**: `backend-node/src/db/schema.ts` (modify)
**Depends on**: None (a fase anterior termina antes)
**Reuses**: T1
**Requirement**: Modelo de dados (Recorrência); D15

**Tools**:

- MCP: NONE
- Skill: `supabase-postgres-best-practices`

**Done when**:

- [x] Cada `check` tem um caso aceito e um recusado; apagar o workspace apaga a série; apagar a série deixa as tarefas com `series_id` nulo
- [x] Gate check passes (full)

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): add the task series table`

---

### T9: Próxima data da regra

**What**: `nextOccurrence(rule, afterDate, today)` devolve a primeira data da regra depois do dia da ocorrência e depois de hoje, ou `null` quando `until` ou `count` encerram a série.
**Where**: `backend-node/src/services/recurrence.ts`
**Depends on**: T8
**Reuses**: NONE
**Requirement**: US-10; D17

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Diária, dias úteis, semanal com vários dias e intervalo 2, mensal no dia 31 em fevereiro, concluída atrasada (pula as perdidas) e adiantada (não duplica)
- [x] Gate check passes (full)

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): compute the next date of a recurrence rule`

---

### T10: Criar, mudar e encerrar a série

**What**: `setRecurrence(db, task, rule | null, now)` cria a série e liga a tarefa como ocorrência aberta (`created_count = 1`), muda a regra dali em diante ou encerra a série (`ended_at`), deixando a tarefa como comum.
**Where**: `backend-node/src/services/series.ts`
**Depends on**: T9
**Reuses**: `setSchedule` (T2)
**Requirement**: US-9; D15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Recusa regra sem dia agendado, semanal sem dias e `until` antes do dia
- [x] Gate check passes (full)

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): create, change and end a task series`

---

### T11: Concluir cria a próxima ocorrência

**What**: Ao entrar em `done`, `moveTask` cria na mesma transação a próxima ocorrência (título, anotações, estimativa, lista, subtarefas desmarcadas, mesma hora), soma `created_count` e grava `ended_at` quando a série acaba.
**Where**: `backend-node/src/services/tasks.ts` (modify)
**Depends on**: T10
**Reuses**: `duplicateTask`, `nextOccurrence` (T9), `setSchedule` (T2)
**Requirement**: US-10; D13, D19

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tempo e sessões ficam na concluída; voltar a concluída de Concluídas não apaga a nova
- [x] Gate check passes (full)

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): create the next occurrence when a series task is completed`

---

### T12: Excluir só esta ou encerrar a série

**What**: `DELETE /tasks/:id?scope=occurrence|series`: `occurrence` exclui e cria a próxima ocorrência; `series` exclui e encerra a série. Sem série, o `scope` é ignorado.
**Where**: `backend-node/src/routes/tasks.ts` (modify)
**Depends on**: T11
**Reuses**: `deleteTask`, `createNextOccurrence` (T11)
**Requirement**: US-12

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] As ocorrências concluídas continuam nos relatórios depois de encerrar a série
- [x] Gate check passes (full)

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): delete one occurrence or end the series`

---

### T13: Pular esta ocorrência

**What**: `POST /tasks/:id/skip` reagenda a mesma tarefa para a próxima data da regra, mantendo o tempo registrado e somando `created_count`.
**Where**: `backend-node/src/routes/tasks.ts` (modify)
**Depends on**: T12
**Reuses**: `nextOccurrence` (T9), `setSchedule` (T2)
**Requirement**: US-12; D18

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] 409 para tarefa sem série; ao passar do `count`, a série encerra e a tarefa vira comum
- [x] Gate check passes (full)

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): skip an occurrence of a series`

---

### T14: Mudar esta e as próximas

**What**: `PATCH /tasks/:id` com `scope: 'series'` muda a regra a partir da ocorrência (dia da semana ou do mês da nova data, nova hora); com `scope: 'occurrence'`, só a tarefa muda. `recurrence` no corpo chama `setRecurrence`.
**Where**: `backend-node/src/services/series.ts` (modify)
**Depends on**: T13
**Reuses**: `setRecurrence` (T10)
**Requirement**: US-9, US-12; D16

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Semanal de sábado movida para domingo "esta e as próximas" passa a repetir aos domingos; mensal muda o `month_day`
- [x] Gate check passes (full)

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): apply a schedule change to this and the next occurrences`

---

### T38: Ida para Hoje ignora listas arquivadas

**What**: `applyDueSchedules` não move tarefas de listas arquivadas; ao desarquivar, a próxima leitura aplica a regra.
**Where**: `backend-node/src/services/schedule.ts`
**Depends on**: None (a fase anterior termina antes)
**Reuses**: `applyDueSchedules`
**Requirement**: US-4; D25

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tarefa vencida em lista arquivada continua na coluna; depois de desarquivar, vai para Hoje na leitura seguinte
- [x] Gate check passes (full)

**Tests**: integration
**Gate**: full

**Commit**: `fix(backend): leave archived lists out of the move to today`

---

### T39: Mudar só a hora mantém a ida para Hoje

**What**: `setSchedule` zera `schedule_applied_at` só quando o dia muda; mudar só a hora o mantém.
**Where**: `backend-node/src/services/schedule.ts`
**Depends on**: T38
**Reuses**: `setSchedule`
**Requirement**: Regras ao salvar; D26

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tarefa tirada de Hoje à mão com dia passado: mudar a hora não a traz de volta; mudar o dia traz
- [x] Gate check passes (full)

**Tests**: integration
**Gate**: full

**Commit**: `fix(backend): keep a task out of today when only its time changes`

---

### T40: Agendamento no hash de idempotência

**What**: O hash da requisição de `POST /api/tasks` inclui `scheduled_on` e `scheduled_time`, para a mesma chave com outro agendamento responder 409.
**Where**: `backend-node/src/services/task-intake.ts`
**Depends on**: T39
**Reuses**: `requestHash` (IDEM-03)
**Requirement**: US-7

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Mesma chave e mesmo agendamento repete a resposta; mesma chave e agendamento diferente responde 409
- [x] Gate check passes (full)

**Tests**: integration
**Gate**: full

**Commit**: `fix(backend): include the schedule in the task idempotency hash`

---

### T41: Hora na série

**What**: Migração `0012_task_series_time.sql` e `schema.ts` com `task_series.time` (passo de 15 min), preenchida a partir da `scheduled_time` da ocorrência aberta das séries existentes.
**Where**: `backend-node/src/db/schema.ts`
**Depends on**: T40
**Reuses**: T8, `test/fixtures/pg-columns.json`
**Requirement**: Modelo de dados (Recorrência); D27

**Tools**:

- MCP: NONE
- Skill: supabase-postgres-best-practices

**Done when**:

- [x] Hora fora do passo recusada; séries existentes ficam com a hora da ocorrência aberta
- [x] Gate check passes (full)

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): store the time on the task series`

---

### T42: A próxima ocorrência usa a hora da série

**What**: `createNextOccurrence`, `setRecurrence` e `applyToSeries` passam a ler e gravar `task_series.time`: "Só esta" muda só a tarefa, "Esta e as próximas" muda as duas; a projeção usa a hora da série.
**Where**: `backend-node/src/services/series.ts`
**Depends on**: T41
**Reuses**: `createNextOccurrence`, `applyToSeries`
**Requirement**: US-10, US-12; D27

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Mudar a hora de uma ocorrência com "Só esta" e concluir: a próxima nasce com a hora da série
- [x] Gate check passes (full)

**Tests**: integration
**Gate**: full

**Commit**: `fix(backend): keep the series time when one occurrence moves`

---

### T43: Pular tira a ocorrência de Hoje

**What**: `skipOccurrence` leva a tarefa que está em Hoje ou Esta semana para a coluna da nova data e zera `schedule_applied_at`.
**Where**: `backend-node/src/services/series.ts`
**Depends on**: T42
**Reuses**: `skipOccurrence`, `moveTask`
**Requirement**: US-12; D28

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Pular em Hoje com próxima data na semana vai para Esta semana; com data depois, para Backlog; o tempo registrado continua na tarefa
- [x] Gate check passes (full)

**Tests**: integration
**Gate**: full

**Commit**: `fix(backend): move a skipped occurrence out of today`

---

### T44: Remover o agendamento encerra a série

**What**: `setSchedule` com dia nulo numa ocorrência encerra a série (`ended_at`) e deixa a tarefa comum, sem dia nem hora.
**Where**: `backend-node/src/services/schedule.ts`
**Depends on**: T43
**Reuses**: `setRecurrence(null)`
**Requirement**: US-12; D29

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `PATCH` com `scheduled_on: null` numa ocorrência devolve `series: null` e a série fica encerrada
- [x] Gate check passes (full)

**Tests**: integration
**Gate**: full

**Commit**: `fix(backend): end the series when an occurrence loses its day`

---

### T15: Tarefas agendadas de um período

**What**: `listScheduled(db, workspaceId, from, to, now)` aplica `applyDueSchedules` e devolve as tarefas pendentes agendadas no período (com e sem hora, com lista, coluna, estimativa e série) e as projeções das séries com hora.
**Where**: `backend-node/src/services/scheduled.ts`
**Depends on**: None (a fase anterior termina antes)
**Reuses**: `nextOccurrence` (T9)
**Requirement**: US-5, US-11, US-14; D9, D14

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Concluídas não entram; projeções respeitam `until` e `count`; séries sem hora não são projetadas
- [x] Gate check passes (full)

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): list the scheduled tasks of a period`

---

### T16: Rota das tarefas agendadas

**What**: `GET /agenda/scheduled?from&to` registrada no app, fechada a tokens (AD-007), devolve o resultado de `listScheduled`.
**Where**: `backend-node/src/routes/scheduled.ts`
**Depends on**: T15
**Reuses**: `routes/sessions.ts` (período e workspace)
**Requirement**: US-5, US-14

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] 422 para período inválido ou maior que 42 dias; token recebe 403
- [x] Gate check passes (full)

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): add the scheduled tasks route`

---

### T17: Agendamento nas ferramentas MCP

**What**: `create_task` e `update_task` aceitam `scheduled_on`, `scheduled_time` e `recurrence`; `get_board` e `get_task` devolvem os campos, a regra e a próxima data projetada.
**Where**: `backend-node/src/mcp/tools.ts`
**Depends on**: T16
**Reuses**: `setSchedule` (T2), `setRecurrence` (T10)
**Requirement**: US-7

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Erro de validação para `recurrence` sem `scheduled_on`
- [x] Gate check passes (full) e Build da fase

**Tests**: integration
**Gate**: build

**Commit**: `feat(backend): schedule tasks through the MCP tools`

---

### T18: Tipos e cliente da API

**What**: Os tipos de tarefa ganham `scheduled_on`, `scheduled_time` e `series`; o cliente ganha `scheduled(from, to)`, `skip`, o `scope` no `PATCH` e no `DELETE`.
**Where**: `frontend/src/lib/api.ts`
**Depends on**: None (a fase anterior termina antes)
**Reuses**: `frontend/src/types/index.ts`, `lib/api.test.ts`
**Requirement**: US-7

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Cada chamada nova monta a URL e o corpo certos
- [x] Gate check passes: `npm --prefix frontend test`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): add the schedule fields and calls to the API client`

---

### T19: Texto do selo e da regra

**What**: `scheduleBadge(task, column, now, tz)` devolve `Hoje`, `Amanhã`, `Qui`, `13 nov`, `Qui 14:00`, `14:00` ou `Agendada`, com a marca de repetição; `recurrenceSummary(rule)` devolve `Repete toda quinta` e `A cada 2 semanas, ter e qui, 5 vezes`.
**Where**: `frontend/src/lib/schedule.ts`
**Depends on**: T18
**Reuses**: `lib/date-utils.ts`, `lib/date-fns-locale.ts`
**Requirement**: US-3, US-11; D21

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Cada formato do spec tem caso, em pt-BR e inglês; Concluídas devolve nenhum selo
- [x] Gate check passes (quick)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): format the schedule badge and the recurrence summary`

---

### T20: Selo no card

**What**: O card mostra o selo com ícone de calendário, relógio ou check e o ícone de repetição, com o tooltip do dia, sem passar das 3 linhas do título.
**Where**: `frontend/src/components/board/task-card.tsx`
**Depends on**: T19
**Reuses**: `scheduleBadge` (T19)
**Requirement**: US-3, US-11

**Tools**:

- MCP: NONE
- Skill: `react-best-practices`

**Done when**:

- [x] Selo em Backlog, Esta semana e Hoje; nenhum em Concluídas
- [x] Gate check passes (quick)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): show the schedule badge on the task card`

---

### T21: Seletor de data, hora e repetição

**What**: `SchedulePicker` com calendário que começa na segunda (dias passados desabilitados, hoje marcado), hora opcional em passos de 15 min com `Limpar hora`, a seção `Repetir` montada a partir do dia e o resumo.
**Where**: `frontend/src/components/schedule/schedule-picker.tsx`
**Depends on**: T20
**Reuses**: `components/ui/calendar.tsx`, `components/ui/popover.tsx`, `recurrenceSummary` (T19)
**Requirement**: US-1, US-2, US-9

**Tools**:

- MCP: NONE
- Skill: `react-best-practices`

**Done when**:

- [x] Opção mensal do dia 29 a 31 diz "ou no último dia"; hora de hoje que já passou é recusada
- [x] Gate check passes (quick)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): add the date, time and repeat picker`

---

### T22: Repetição personalizada

**What**: `CustomRecurrence` com intervalo, período (dias, semanas, meses), dias da semana como botões de alternar, dia do mês, `Termina` (nunca, data, N vezes), resumo com as próximas datas e as mensagens de validação.
**Where**: `frontend/src/components/schedule/custom-recurrence.tsx`
**Depends on**: T21
**Reuses**: `recurrenceSummary` (T19)
**Requirement**: US-9; D15

**Tools**:

- MCP: NONE
- Skill: `react-best-practices`

**Done when**:

- [x] Intervalo de 1 a 99, de 1 a 999 vezes, ao menos um dia na semanal, fim não antes do início
- [x] Gate check passes (quick)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): add the custom recurrence editor`

---

### T23: Submenu Agendar no menu do card

**What**: `⋮ > Agendar` com o agendamento atual e a regra, os atalhos (mantêm a hora), `Escolher data, hora e repetição…`, `Parar de repetir`, `Remover agendamento`; `Pular esta ocorrência` no menu para tarefas de série; desabilitado em Concluídas e para `viewer`.
**Where**: `frontend/src/components/board/task-card-menu.tsx`
**Depends on**: T22
**Reuses**: `SchedulePicker` (T21)
**Requirement**: US-1, US-9, US-12

**Tools**:

- MCP: NONE
- Skill: `react-best-practices`

**Done when**:

- [x] Cada item chama a API certa; o card mostra o selo novo sem recarregar
- [x] Gate check passes (quick)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): schedule a task from the card menu`

---

### T24: Campo Agendamento no diálogo da tarefa

**What**: O diálogo mostra `Sem agendamento`, `Qui, 12 nov` ou `Qui, 12 nov · 10:00 – 12:00 · ↻ toda quinta`, com `+1h` sem estimativa, o seletor de T21 e o botão de remover.
**Where**: `frontend/src/components/board/task-dialog.tsx`
**Depends on**: T23
**Reuses**: `SchedulePicker` (T21), `scheduleBadge` (T19)
**Requirement**: US-2; D7, D23

**Tools**:

- MCP: NONE
- Skill: `react-best-practices`

**Done when**:

- [x] Limpar a hora mantém o dia; remover limpa os dois
- [x] Gate check passes (Build da fase)

**Tests**: unit
**Gate**: build

**Commit**: `feat(frontend): edit the schedule in the task dialog`

---

### T25: Pergunta "só esta ou esta e as próximas"

**What**: `SeriesScopeDialog` nas variantes mover (explica o efeito de cada opção) e excluir (mostra a data da próxima e lembra `Pular esta ocorrência`), com Esc para cancelar.
**Where**: `frontend/src/components/schedule/series-scope-dialog.tsx`
**Depends on**: None (a fase anterior termina antes)
**Reuses**: `components/ui/dialog.tsx`, `delete-confirmation-dialog.tsx`
**Requirement**: US-12; D16

**Tools**:

- MCP: NONE
- Skill: `react-best-practices`

**Done when**:

- [x] Cada variante devolve o `scope` escolhido; Cancelar não chama a API
- [x] Gate check passes (quick)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): ask whether a change applies to one occurrence or the series`

---

### T26: Pergunta da série no quadro

**What**: No quadro, mudar o dia ou a hora de uma ocorrência (menu e diálogo) e excluí-la abrem `SeriesScopeDialog` e enviam o `scope`.
**Where**: `frontend/src/pages/list-board.tsx`
**Depends on**: T25
**Reuses**: `SeriesScopeDialog` (T25)
**Requirement**: US-12

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tarefa sem série não abre a pergunta
- [x] Gate check passes (quick)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): ask for the series scope on the board`

---

### T27: Tarefas agendadas da semana

**What**: `useScheduled(from, to)` lê `GET /agenda/scheduled`, separa com hora, sem hora e projeções, e invalida junto com o quadro.
**Where**: `frontend/src/lib/agenda/use-scheduled.ts`
**Depends on**: T26
**Reuses**: `lib/agenda/use-agenda.ts`
**Requirement**: US-5, US-14

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Agendar no quadro atualiza a Agenda sem recarregar
- [x] Gate check passes (quick)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): read the scheduled tasks of the week`

---

### T28: Posição dos blocos agendados

**What**: O layout da grade posiciona os blocos agendados com a estimativa ou 60 min (D23), lado a lado com as sessões que se sobrepõem.
**Where**: `frontend/src/lib/agenda/layout.ts`
**Depends on**: T27
**Reuses**: o cálculo de faixas das sessões no mesmo arquivo
**Requirement**: US-5; D7, D23

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Sobreposição com sessão e com outro bloco agendado; bloco que passa da meia-noite
- [x] Gate check passes (quick)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): lay out the scheduled blocks next to the sessions`

---

### T29: Bloco agendado

**What**: `ScheduledBlock` sem texto, com fundo e contorno pontilhado na cor da lista em tom fraco, relógio (ou repetição) no canto superior direito, projeção com opacidade menor, e o tooltip do spec (título, `Est.`, `Agendada · HH:MM – HH:MM`, lista e coluna, ação).
**Where**: `frontend/src/components/agenda/scheduled-block.tsx`
**Depends on**: T28
**Reuses**: `components/agenda/session-block.tsx`, `components/ui/tooltip.tsx`
**Requirement**: US-5, US-11

**Tools**:

- MCP: NONE
- Skill: `react-best-practices`

**Done when**:

- [x] Tooltip das variantes com estimativa, sem estimativa `(1h)`, projeção e `viewer`
- [x] Gate check passes (quick)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): draw the scheduled block in the agenda`

---

### T30: Blocos agendados na grade

**What**: `WeekGrid` desenha os blocos agendados e as projeções, abre o diálogo da tarefa no clique, e deixa de hachurar o tempo depois de agora.
**Where**: `frontend/src/components/agenda/week-grid.tsx`
**Depends on**: T29
**Reuses**: `ScheduledBlock` (T29), `layout.ts` (T28)
**Requirement**: US-5; D10

**Tools**:

- MCP: NONE
- Skill: `react-best-practices`

**Done when**:

- [ ] Funciona na visão Semana e na visão Dia
- [ ] Gate check passes (quick)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): show the scheduled tasks on the agenda grid`

---

### T31: Linha Sem hora

**What**: `UntimedRow` entre o cabeçalho dos dias e a grade: ícone com tooltip `Agendadas sem hora definida`, até 3 tarefas por dia no estilo do bloco agendado (título e estimativa), `+X` com rótulo acessível, altura fixa para 3 tarefas.
**Where**: `frontend/src/components/agenda/untimed-row.tsx`
**Depends on**: T30
**Reuses**: estilos de `ScheduledBlock` (T29)
**Requirement**: US-14; D20

**Tools**:

- MCP: NONE
- Skill: `react-best-practices`

**Done when**:

- [ ] Ordem de coluna e `position`; dia vazio mantém a altura; série sem hora mostra a ocorrência aberta com o ícone de repetição
- [ ] Gate check passes (Build da fase)

**Tests**: unit
**Gate**: build

**Commit**: `feat(frontend): add the untimed row to the agenda`

---

### T32: Painel do dia

**What**: `DayScheduledPanel` com `<dia da semana>, <data>`, `N tarefas agendadas · Est. <soma>`, as seções `Sem hora` (com `Definir hora`) e `Com hora` (com a próxima ocorrência só leitura), no lugar do painel lateral.
**Where**: `frontend/src/components/agenda/day-scheduled-panel.tsx`
**Depends on**: None (a fase anterior termina antes)
**Reuses**: `session-panel.tsx` (moldura), `SchedulePicker` (T21)
**Requirement**: US-14

**Tools**:

- MCP: NONE
- Skill: `react-best-practices`

**Done when**:

- [ ] `viewer` não vê `Definir hora`; definir a hora tira a tarefa de `Sem hora`
- [ ] Gate check passes (quick)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): add the day panel with every scheduled task`

---

### T33: Arrastar o bloco agendado

**What**: `useGridDrag` ganha `moveScheduled`: arrasta o bloco da ocorrência aberta para outro dia e hora em passos de 15 min, inclusive no futuro, e não arrasta projeções; o bloqueio do futuro continua só para sessões.
**Where**: `frontend/src/lib/agenda/use-grid-drag.ts`
**Depends on**: T32
**Reuses**: o gesto `move` existente
**Requirement**: US-6

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Sessão continua sem arraste no futuro (AGENDA-23); `viewer` não arrasta
- [ ] Gate check passes (quick)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): drag a scheduled block to another time`

---

### T34: Arrastar entre Sem hora e a grade

**What**: `useGridDrag` ganha `dropUntimed`: da linha `Sem hora` para a grade com rascunho de 1h (ou da estimativa) e rótulo do horário; para a linha de outro dia, só muda o dia; do bloco para `Sem hora`, tira a hora; Esc cancela.
**Where**: `frontend/src/lib/agenda/use-grid-drag.ts` (modify)
**Depends on**: T33
**Reuses**: `moveScheduled` (T33)
**Requirement**: US-14; D22

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Os 6 estados do artboard `Estados do arraste` têm teste
- [ ] Gate check passes (quick)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): drag tasks between the untimed row and the grid`

---

### T35: Painel Novo agendamento

**What**: `NewSchedulePanel` com o dia e a janela, a busca de tarefas pendentes do workspace e `Criar tarefa "<busca>" e agendar` (Backlog da lista escolhida); sem estimativa, a tarefa recebe a duração da janela (D11).
**Where**: `frontend/src/components/agenda/new-schedule-panel.tsx`
**Depends on**: T34
**Reuses**: `session-task-picker.tsx`
**Requirement**: US-8; D11, D12

**Tools**:

- MCP: NONE
- Skill: `react-best-practices`

**Done when**:

- [ ] Escolher tarefa já agendada substitui o agendamento
- [ ] Gate check passes (quick)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): add the new schedule panel`

---

### T36: Agenda integrada

**What**: A página da Agenda mostra a toolbar com `Agendar` (secundário, relógio) antes de `Nova sessão`; seleção no futuro abre `Novo agendamento` e no passado `Nova sessão`; `+X` abre o painel do dia; soltar mostra `Agendada para <dia>, HH:MM` com `Desfazer`; série pergunta o `scope`.
**Where**: `frontend/src/pages/agenda.tsx`
**Depends on**: T35
**Reuses**: T25, T27, T30–T35
**Requirement**: US-6, US-8, US-12, US-14; D10

**Tools**:

- MCP: NONE
- Skill: `react-best-practices`

**Done when**:

- [ ] `viewer`: botão desabilitado, seleção no futuro não abre painel; testes a 390 px e 1280 px
- [ ] Gate check passes (Build da fase)

**Tests**: unit
**Gate**: build

**Commit**: `feat(frontend): schedule tasks from the agenda page`

---

### T37: Agendamento no modelo do mobile

**What**: O modelo de tarefa do mobile lê `scheduled_on`, `scheduled_time` e `series` como opcionais, sem quebrar com respostas antigas.
**Where**: `mobile/lib/domain/models/task.dart`
**Depends on**: None (a fase anterior termina antes)
**Reuses**: `task.g.dart` (regerado com `build_runner`)
**Requirement**: D4

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] JSON com e sem os campos novos
- [ ] Gate check passes: `cd mobile && flutter test`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(mobile): read the schedule fields of a task`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 2b → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7

Phase 1:  T1 → T2 → T3 → T4 → T5 → T6 → T7
Phase 2:  T8 → T9 → T10 → T11 → T12 → T13 → T14
Phase 2b: T38 → T39 → T40 → T41 → T42 → T43 → T44
Phase 3:  T15 → T16 → T17
Phase 4:  T18 → T19 → T20 → T21 → T22 → T23 → T24
Phase 5:  T25 → T26 → T27 → T28 → T29 → T30 → T31
Phase 6:  T32 → T33 → T34 → T35 → T36
Phase 7:  T37
```

Cada tarefa que mostra texto novo acrescenta as chaves em `frontend/src/locales/pt-BR.json` e `en.json` no mesmo commit.
