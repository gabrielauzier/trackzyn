# Listas e quadro Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/listas-e-quadro/design.md`
**Status**: Draft

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `CONTRIBUTING.md` (testes do frontend com `renderWithProviders`, afirmando o que o usuário vê), `backend-node/vitest.config.ts` (cobertura mínima de 60% de linhas), `.github/workflows/ci.yml` (lint, typecheck, test, build). Onde os guias não definem profundidade, valem os padrões fortes da skill.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Schema e migrations | integration | Migrations aplicam num banco vazio e numa base `0000`; constraints (CHECK, FK em cascata, índices únicos) provadas | `backend-node/test/db/*.test.ts` | `npm --prefix backend-node test` |
| Serviços do backend | integration (PGlite) | Todos os ramos; 1:1 com os ACs da spec; todos os Edge Cases listados | `backend-node/test/services/*.test.ts` | `npm --prefix backend-node test` |
| Rotas do backend | integration (`app.inject`) | Toda rota: caminho feliz + validação 422 + 403 `viewer` + 404 de outro workspace | `backend-node/test/routes/*.test.ts` | `npm --prefix backend-node test` |
| Funções puras do frontend | unit | Todos os ramos e valores de fronteira | `frontend/src/**/*.test.ts` | `npm --prefix frontend test` |
| Componentes e páginas | unit (Testing Library) | Cada AC visível: estados vazio, carregando, erro, `viewer`; interações | `frontend/src/**/*.test.tsx` | `npm --prefix frontend test` |
| Cliente HTTP e tipos | none | build gate (typecheck); exercitado pelos testes de página com a API simulada | - | `npm --prefix frontend run typecheck` |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Tasks com testes de unidade do frontend | `npm --prefix frontend test` |
| Full | Tasks do backend (integration) ou que mexem em dependências | `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test -- --coverage` (backend) ou `npm --prefix frontend run lint && npm --prefix frontend run typecheck && npm --prefix frontend test` (frontend) |
| Build | Fim de cada fase e tasks de tipos | `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test -- --coverage && npm --prefix frontend run lint && npm --prefix frontend run typecheck && npm --prefix frontend test && npm --prefix frontend run build` |

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Dados

```
T1
T2
```

### Phase 2: API de listas

```
T3 → T4
```

### Phase 3: API de tarefas e quadro

```
T5 → T6 → T7
T5 → T7
T5 → T8 → T9
T10
```

### Phase 4: Base do frontend

```
T11
T12
T13
T14
T15
```

### Phase 5: Home de listas

```
T16 → T17 → T19 → T20
T16 → T18 → T19
T17 → T20
```

### Phase 6: Quadro

```
T21 → T25 → T26
T22 → T25
T23 → T24 → T26
```

---

## Task Breakdown

### Phase 1: Dados

#### T1: Tabelas lists, tasks e subtasks com a migration 0001

**What**: Adicionar `lists`, `tasks` e `subtasks` ao schema do Drizzle como no design (CHECK de coluna, de estimativa e `done ⇔ completed_at`; FKs em cascata; índice `(list_id, column, position)`), gerar `drizzle/0001_lists_tasks.sql`, reescrever as provas de `test/db/baseline.test.ts` e `test/db/pglite.test.ts` para aceitar migrations novas, regenerar `test/fixtures/pg-columns.json` num Postgres 16 e atualizar o comentário de paridade com o Alembic.
**Where**: `backend-node/src/db/schema.ts`
**Depends on**: None
**Reuses**: padrão de `files` e `workspaces` em `db/schema.ts`; `drizzle-kit generate`
**Requirement**: TASK-08, LIST-09, TASK-05

**Tools**:

- MCP: NONE
- Skill: `supabase-postgres-best-practices`

**Done when**:

- [x] Banco vazio recebe as 6 tabelas originais e as 3 novas; base `0000` recebe só a DDL da `0001`, com as 6 tabelas originais mantendo oid e colunas
- [x] Testes provam: `UPDATE` que deixa `column = 'done'` sem `completed_at` falha (TASK-08); excluir a lista apaga tarefas e subtarefas; `estimate_minutes = 0` e `1441` falham
- [x] Gate check passes: Full (backend)
- [x] Test count: a contagem do backend só aumenta

**Status**: ✅ Done

**Tests**: integration
**Gate**: full

**Commit**: `feat(db): add lists, tasks and subtasks tables`

---

#### T2: Fuso do dia

**What**: Criar `dayTimezone(db, workspace)` e os fragmentos SQL de início do dia e da semana (segunda-feira) no fuso, como no design.
**Where**: `backend-node/src/services/day.ts`
**Depends on**: None
**Reuses**: `applicationTimezone` de `services/timezones.ts`

**Requirement**: BOARD-04, BOARD-05, BOARD-16, LIST-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Workspace com `timezone` usa o dele; sem, usa o da aplicação
- [x] Teste em PGlite: `now()` às 02:30 UTC de um sábado em `America/Sao_Paulo` cai na sexta e na semana iniciada na segunda anterior
- [x] Gate check passes: Full (backend)
- [x] Test count: a contagem do backend só aumenta

**Status**: ✅ Done

**Tests**: integration
**Gate**: full

**Commit**: `feat(api): resolve the workspace day timezone`

---

### Phase 2: API de listas

#### T3: Serviço de listas

**What**: Listar (com `pending_count` e as 4 prévias Hoje → Esta semana → Backlog), criar no fim, renomear, trocar cor, arquivar, desarquivar, mover antes de outra lista (renumerando em transação) e excluir.
**Where**: `backend-node/src/services/lists.ts`
**Depends on**: T1, T2
**Reuses**: padrão de `services/files.ts`; `HttpError`
**Requirement**: LIST-03, LIST-05, LIST-06, LIST-07, LIST-08, LIST-09, LIST-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Um teste por AC citado, incluindo prévia com 2 de Hoje + 1 de Esta semana + 1 de Backlog e lista de outro workspace → 404
- [x] Mover renumera de 0 a n-1 sem posições repetidas, também com dois movimentos concorrentes
- [x] Gate check passes: Full (backend)
- [x] Test count: a contagem do backend só aumenta

**Status**: ✅ Done

**Tests**: integration
**Gate**: full

**Commit**: `feat(api): add the lists service`

---

#### T4: Rotas de listas

**What**: `GET/POST /api/lists`, `PATCH/DELETE /api/lists/:id` e `POST /api/lists/:id/move`, com zod e guards, registradas em `src/app.ts`.
**Where**: `backend-node/src/routes/lists.ts`
**Depends on**: T3
**Reuses**: `routes/files.ts` (guards, `toXRead`, `UUID_PATTERN`)
**Requirement**: LIST-01, LIST-04, LIST-10, LIST-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Cada rota testada com `app.inject`: caminho feliz, 422 (nome vazio e com 101 caracteres), 403 `Read-only role` para `viewer`, 404 de outro workspace
- [x] `GET /api/lists` devolve `timezone` e só as não arquivadas por padrão
- [x] Gate check passes: Full (backend)
- [x] Test count: a contagem do backend só aumenta

**Status**: ✅ Done

**Tests**: integration
**Gate**: full

**Commit**: `feat(api): add the lists routes`

---

### Phase 3: API de tarefas e quadro

#### T5: Serviço de tarefas

**What**: Criar no fim da coluna, ler, editar título/estimativa/anotações, mover para uma coluna antes de outra tarefa (renumerando; `done` grava `completed_at`, sair limpa) e excluir.
**Where**: `backend-node/src/services/tasks.ts`
**Depends on**: T3
**Reuses**: verificação de lista do workspace de `services/lists.ts`
**Requirement**: TASK-01, TASK-03, TASK-05, TASK-08, BOARD-03, BOARD-07, BOARD-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Um teste por AC citado; mover de `done` para `today` limpa `completed_at` e mantém a tarefa
- [x] Dois movimentos concorrentes na mesma coluna deixam posições 0..n-1 sem repetição e a última gravação na ordem final
- [x] Gate check passes: Full (backend)
- [x] Test count: a contagem do backend só aumenta

**Status**: ✅ Done

**Tests**: integration
**Gate**: full

**Commit**: `feat(api): add the tasks service`

---

#### T6: Serviço de subtarefas

**What**: Criar no fim, renomear, marcar/desmarcar e excluir subtarefas de uma tarefa do workspace.
**Where**: `backend-node/src/services/subtasks.ts`
**Depends on**: T5
**Reuses**: verificação de tarefa do workspace de `services/tasks.ts`
**Requirement**: TASK-06, TASK-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Testes de criar, renomear, marcar e excluir; subtarefa de tarefa de outro workspace → 404
- [x] Gate check passes: Full (backend)
- [x] Test count: a contagem do backend só aumenta

**Status**: ✅ Done

**Tests**: integration
**Gate**: full

**Commit**: `feat(api): add the subtasks service`

---

#### T7: Rotas de tarefas e subtarefas

**What**: `POST /api/tasks`, `GET/PATCH/DELETE /api/tasks/:id`, `POST /api/tasks/:id/move`, `POST /api/tasks/:id/subtasks`, `PATCH/DELETE /api/subtasks/:id`, registradas em `src/app.ts`.
**Where**: `backend-node/src/routes/tasks.ts`
**Depends on**: T5, T6
**Reuses**: `routes/files.ts`
**Requirement**: TASK-02, TASK-04, TASK-07, BOARD-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] 422 testado para título vazio e com 256 caracteres, estimativa 0 e 1441, anotações com 10 001 caracteres, subtarefa vazia
- [x] 403 `Read-only role` para `viewer` em toda escrita; 404 de outro workspace; id que não é UUID → 422
- [x] Gate check passes: Full (backend)
- [x] Test count: a contagem do backend só aumenta

**Status**: ✅ Done

**Tests**: integration
**Gate**: full

**Commit**: `feat(api): add the tasks and subtasks routes`

---

#### T8: Serviço do quadro

**What**: Montar `Board` (pendentes e somas por coluna, barras `x/y` de Hoje e Esta semana no fuso do dia, Concluídas com hoje + o último dia anterior com conclusões, `N tarefas hoje`, `spent_seconds` vindo de `spentSecondsByTask`, que nesta feature devolve 0).
**Where**: `backend-node/src/services/board.ts`
**Depends on**: T5
**Reuses**: `services/day.ts`
**Requirement**: BOARD-01, BOARD-02, BOARD-04, BOARD-05, BOARD-06, BOARD-09, BOARD-10, BOARD-16

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Teste do cenário do print: 11 concluídas na semana, 0 hoje, 1 pendente em Hoje → `11/12` e `0/1`
- [ ] Concluídas: com conclusões hoje, ontem e há 3 dias, só hoje e ontem; sem conclusões hoje, só o último dia anterior; virada do dia não move tarefas de Hoje (BOARD-16)
- [ ] Lista vazia → somas 0 e `today_count` 0 (Edge Case)
- [ ] Gate check passes: Full (backend)
- [ ] Test count: a contagem do backend só aumenta

**Tests**: integration
**Gate**: full

**Commit**: `feat(api): build the list board`

---

#### T9: Rota do quadro

**What**: `GET /api/lists/:id/board`, registrada em `src/app.ts`.
**Where**: `backend-node/src/routes/board.ts`
**Depends on**: T8
**Reuses**: guards de leitura
**Requirement**: BOARD-01, LIST-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Caminho feliz, 404 de outro workspace, `viewer` lê com 200
- [ ] Gate check passes: Full (backend)
- [ ] Test count: a contagem do backend só aumenta

**Tests**: integration
**Gate**: full

**Commit**: `feat(api): add the board route`

---

#### T10: Exportar e importar listas no modo local

**What**: Provar que a exportação e a importação do modo local levam listas, tarefas e subtarefas com as mesmas contagens e ids.
**Where**: `backend-node/test/local/data-transfer.test.ts`
**Depends on**: T1
**Reuses**: casos que já existem nesse arquivo
**Requirement**: TASK-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Teste novo: 2 listas, 3 tarefas, 2 subtarefas exportadas e importadas num banco limpo com os mesmos ids
- [ ] Gate check passes: Full (backend)
- [ ] Test count: a contagem do backend só aumenta

**Tests**: integration
**Gate**: full

**Commit**: `test(local): export and import lists, tasks and subtasks`

---

### Phase 4: Base do frontend

#### T11: Formatação de duração

**What**: `formatDuration(seconds, locale)` → `0min`, `27min`, `1h`, `1h 27min` (pt-BR) e `1hr 27min` (en).
**Where**: `frontend/src/components/board/format-duration.ts`
**Depends on**: None
**Reuses**: `lib/format.ts` (padrão de testes de formatação)
**Requirement**: TASK-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Testes de 0, 59, 60, 3600, 5220 e 86400 segundos nos dois idiomas
- [ ] Gate check passes: Quick
- [ ] Test count: a contagem do frontend só aumenta

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): format durations`

---

#### T12: Saudação por período

**What**: `greetingFor(hour)` e as chaves de tradução das 4 saudações e frases (pt-BR e en), com a hora calculada no fuso do workspace.
**Where**: `frontend/src/components/lists/greeting.ts`
**Depends on**: None
**Reuses**: `lib/i18n.ts`; `Intl.DateTimeFormat`
**Requirement**: LIST-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Testes de fronteira: 04:59 → madrugada, 05:00 → manhã, 11:59, 12:00, 17:59, 18:00, 23:59
- [ ] Hora calculada em `America/Sao_Paulo` a partir de um instante UTC fixo
- [ ] Gate check passes: Quick
- [ ] Test count: a contagem do frontend só aumenta

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): greet by time of day`

---

#### T13: Componente checkbox

**What**: Primitivo shadcn `Checkbox` sobre `radix-ui`.
**Where**: `frontend/src/components/ui/checkbox.tsx`
**Depends on**: None
**Reuses**: estilo de `components/ui/switch.tsx`
**Requirement**: BOARD-07, TASK-06

**Tools**:

- MCP: NONE
- Skill: `frontend-design`

**Done when**:

- [ ] Teste: alterna com clique e teclado, expõe `role="checkbox"` e `aria-checked`
- [ ] Gate check passes: Quick
- [ ] Test count: a contagem do frontend só aumenta

**Tests**: unit
**Gate**: quick

**Commit**: `feat(ui): add the checkbox primitive`

---

#### T14: Componente progress

**What**: Primitivo shadcn `Progress` sobre `radix-ui`.
**Where**: `frontend/src/components/ui/progress.tsx`
**Depends on**: None
**Reuses**: tokens de `index.css`
**Requirement**: BOARD-04, BOARD-05

**Tools**:

- MCP: NONE
- Skill: `frontend-design`

**Done when**:

- [ ] Teste: `aria-valuenow` e largura do indicador para 0, 50 e 100
- [ ] Gate check passes: Quick
- [ ] Test count: a contagem do frontend só aumenta

**Tests**: unit
**Gate**: quick

**Commit**: `feat(ui): add the progress primitive`

---

#### T15: Cliente HTTP e tipos de listas e tarefas

**What**: Funções de `lib/api.ts` para listas, tarefas, subtarefas e quadro, e os tipos em `types/index.ts`.
**Where**: `frontend/src/lib/api.ts`
**Depends on**: T4, T7, T9
**Reuses**: instância axios que já envia token e workspace
**Requirement**: LIST-01, BOARD-01, TASK-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Tipos batem com as respostas das rotas (`Board`, `ListCard`, `Task`, `Subtask`)
- [ ] Gate check passes: Build
- [ ] Test count: a contagem do frontend não diminui

**Tests**: none
**Gate**: build

**Commit**: `feat(web): add the lists and tasks api client`

---

### Phase 5: Home de listas

#### T16: Selo da lista

**What**: `ListBadge` com a inicial maiúscula na cor `--chart-N`.
**Where**: `frontend/src/components/lists/list-badge.tsx`
**Depends on**: None
**Reuses**: `components/icon-badge.tsx`
**Requirement**: LIST-03

**Tools**:

- MCP: NONE
- Skill: `frontend-design`

**Done when**:

- [ ] Teste: "week" → `W`; cor 3 usa `var(--chart-3)`
- [ ] Gate check passes: Quick
- [ ] Test count: a contagem do frontend só aumenta

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): add the list badge`

---

#### T17: Cartão de lista

**What**: Cartão com selo, nome, menu `⋮` (renomear, arquivar, desarquivar, excluir), 4 linhas de prévia e `N tarefas pendentes`; ações escondidas para `viewer`.
**Where**: `frontend/src/components/lists/list-card.tsx`
**Depends on**: T16
**Reuses**: `ui/card`, `ui/dropdown-menu`, `delete-confirmation-dialog`
**Requirement**: LIST-03, LIST-05, LIST-08, LIST-09, LIST-10

**Tools**:

- MCP: NONE
- Skill: `react-best-practices`

**Done when**:

- [ ] Testes: 2 prévias → 2 linhas com título + 2 vazias; `viewer` não vê o menu; excluir pede confirmação com o nome
- [ ] Gate check passes: Quick
- [ ] Test count: a contagem do frontend só aumenta

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): add the list card`

---

#### T18: Diálogo de lista

**What**: Criar e renomear lista com nome (1–100) e as 8 cores; mostra o 422 do servidor sem fechar.
**Where**: `frontend/src/components/lists/list-dialog.tsx`
**Depends on**: T16
**Reuses**: `ui/dialog`, `ui/form`, `react-hook-form` + zod
**Requirement**: LIST-03, LIST-04, LIST-07

**Tools**:

- MCP: NONE
- Skill: `react-best-practices`

**Done when**:

- [ ] Testes: nome vazio bloqueia; 422 simulado mostra a mensagem e mantém o diálogo; a cor escolhida vai no corpo
- [ ] Gate check passes: Quick
- [ ] Test count: a contagem do frontend só aumenta

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): add the list dialog`

---

#### T19: Página home

**What**: `/` com saudação, grade de cartões arrastável (`@dnd-kit/core` e `@dnd-kit/sortable`, adicionados aqui), cartão tracejado `Criar lista`, menu lateral `Criar nova lista` / `Todas as minhas listas` / `Listas arquivadas`; remove `pages/dashboard.tsx` e ajusta `App.tsx`, `nav-items.ts` e os testes do layout.
**Where**: `frontend/src/pages/home.tsx`
**Depends on**: T17, T18
**Reuses**: `page-header`, `useAuth`, `greeting.ts`, cliente de T15
**Requirement**: LIST-01, LIST-02, LIST-06, LIST-10

**Tools**:

- MCP: NONE
- Skill: `react-composition-patterns`

**Done when**:

- [ ] Testes: workspace sem listas mostra só `Criar lista`; saudação usa `display_name` e, sem ele, o e-mail antes do `@`; reordenar chama `move` com `before_list_id`; `viewer` sem criar nem arrastar
- [ ] `@dnd-kit` instalado com `npm install` respeitando `frontend/.npmrc` e lockfile commitado
- [ ] Gate check passes: Full (frontend)
- [ ] Test count: a contagem do frontend só aumenta (testes de `dashboard` substituídos, não apagados sem substituto)

**Tests**: unit
**Gate**: full

**Commit**: `feat(web): replace the dashboard with the lists home`

---

#### T20: Página de listas arquivadas

**What**: `/lists/archived` com os cartões arquivados e `Desarquivar`.
**Where**: `frontend/src/pages/archived-lists.tsx`
**Depends on**: T17, T19
**Reuses**: `list-card.tsx`
**Requirement**: LIST-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Testes: lista arquivada aparece aqui e não na home; `Desarquivar` chama `PATCH is_archived=false`; vazio mostra estado vazio
- [ ] Gate check passes: Quick
- [ ] Test count: a contagem do frontend só aumenta

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): add the archived lists page`

---

### Phase 6: Quadro

#### T21: Cartão de tarefa

**What**: Título, estimativa, tempo gasto, número de ordem em Hoje, check de concluir, riscado em Concluídas e o resumo `x/y Subtarefas`.
**Where**: `frontend/src/components/board/task-card.tsx`
**Depends on**: T11, T13
**Reuses**: `ui/card`, `format-duration`
**Requirement**: BOARD-06, BOARD-07, TASK-06

**Tools**:

- MCP: NONE
- Skill: `react-best-practices`

**Done when**:

- [ ] Testes: tarefa sem estimativa não mostra estimativa; em Hoje mostra `1`; concluída aparece riscada
- [ ] Gate check passes: Quick
- [ ] Test count: a contagem do frontend só aumenta

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): add the task card`

---

#### T22: Formulário de nova tarefa

**What**: `+ Adicionar tarefa` inline com título e estimativa em minutos, validando 1–255 e 1–1440.
**Where**: `frontend/src/components/board/add-task-form.tsx`
**Depends on**: None
**Reuses**: `ui/input`, `react-hook-form` + zod
**Requirement**: TASK-01, TASK-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Testes: título vazio bloqueia; estimativa 1441 bloqueia; sem estimativa envia `null`; 422 do servidor aparece
- [ ] Gate check passes: Quick
- [ ] Test count: a contagem do frontend só aumenta

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): add the new task form`

---

#### T23: Lista de subtarefas

**What**: Lista de subtarefas que podem ser marcadas, com adicionar, renomear e excluir.
**Where**: `frontend/src/components/board/subtask-list.tsx`
**Depends on**: T13
**Reuses**: `ui/checkbox`
**Requirement**: TASK-06, TASK-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Testes: marcar chama `PATCH done`; título vazio bloqueia; contador `x/y` atualiza
- [ ] Gate check passes: Quick
- [ ] Test count: a contagem do frontend só aumenta

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): add the subtask list`

---

#### T24: Diálogo da tarefa

**What**: Editar título, estimativa, anotações (até 10 000) e subtarefas; excluir com confirmação.
**Where**: `frontend/src/components/board/task-dialog.tsx`
**Depends on**: T23
**Reuses**: `ui/dialog`, `delete-confirmation-dialog`
**Requirement**: TASK-03, TASK-04, TASK-05

**Tools**:

- MCP: NONE
- Skill: `react-best-practices`

**Done when**:

- [ ] Testes: anotações com 10 001 caracteres bloqueiam; salvar envia só os campos alterados; excluir pede confirmação
- [ ] Gate check passes: Quick
- [ ] Test count: a contagem do frontend só aumenta

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): add the task dialog`

---

#### T25: Coluna do quadro

**What**: Coluna com título, soma de estimativas, barra `x/y Concluídas` (Hoje e Esta semana), `Tudo limpo`, `+ Adicionar tarefa`, `Focar agora` (habilitado ou não) no rodapé de Hoje e a variante Concluídas agrupada por dia com `N tarefas hoje`.
**Where**: `frontend/src/components/board/board-column.tsx`
**Depends on**: T21, T22
**Reuses**: `ui/progress`, `task-card`
**Requirement**: BOARD-02, BOARD-04, BOARD-05, BOARD-09, BOARD-12, BOARD-13

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Testes: coluna vazia mostra `Tudo limpo`; `Focar agora` desabilitado sem pendentes; Concluídas mostra 2 grupos de dia e o contador do dia
- [ ] Gate check passes: Quick
- [ ] Test count: a contagem do frontend só aumenta

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): add the board column`

---

#### T26: Página do quadro

**What**: `/lists/:listId` com `Voltar`, seletor de lista, resumo, 4 colunas com arrastar e soltar entre colunas, abas abaixo de 768px, diálogo da tarefa e bloqueios de `viewer`.
**Where**: `frontend/src/pages/list-board.tsx`
**Depends on**: T24, T25
**Reuses**: `@dnd-kit` (de T19), `ui/tabs`, cliente de T15
**Requirement**: BOARD-01, BOARD-03, BOARD-08, BOARD-11, BOARD-14, BOARD-15

**Tools**:

- MCP: NONE
- Skill: `react-composition-patterns`

**Done when**:

- [ ] Testes: resumo com contagem e estimativa; arrastar para Concluídas chama `move` com `done`; trocar no seletor navega para a outra lista; com `matchMedia` < 768px aparecem as abas; `viewer` não arrasta
- [ ] Gate check passes: Build
- [ ] Test count: a contagem do frontend só aumenta

**Tests**: unit
**Gate**: build

**Commit**: `feat(web): add the list board page`

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | - | ✅ Match |
| T2 | None | - | ✅ Match |
| T3 | T1, T2 (fase anterior) | - | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T3 (fase anterior) | - | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T5, T6 | T5 → T7, T6 → T7 | ✅ Match |
| T8 | T5 | T5 → T8 | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |
| T10 | T1 (fase anterior) | - | ✅ Match |
| T11–T14 | None | - | ✅ Match |
| T15 | T4, T7, T9 (fases anteriores) | - | ✅ Match |
| T16 | None | - | ✅ Match |
| T17 | T16 | T16 → T17 | ✅ Match |
| T18 | T16 | T16 → T18 | ✅ Match |
| T19 | T17, T18 | T17 → T19, T18 → T19 | ✅ Match |
| T20 | T17, T19 | T17 → T20, T19 → T20 | ✅ Match |
| T21 | T11, T13 (fase anterior) | - | ✅ Match |
| T22 | None | - | ✅ Match |
| T23 | T13 (fase anterior) | - | ✅ Match |
| T24 | T23 | T23 → T24 | ✅ Match |
| T25 | T21, T22 | T21 → T25, T22 → T25 | ✅ Match |
| T26 | T24, T25 | T24 → T26, T25 → T26 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Schema e migrations | integration | integration | ✅ OK |
| T2–T3, T5–T6, T8 | Serviços do backend | integration | integration | ✅ OK |
| T4, T7, T9 | Rotas do backend | integration | integration | ✅ OK |
| T10 | Teste de modo local (serviço) | integration | integration | ✅ OK |
| T11, T12 | Funções puras do frontend | unit | unit | ✅ OK |
| T13, T14, T16–T26 | Componentes e páginas | unit | unit | ✅ OK |
| T15 | Cliente HTTP e tipos | none | none | ✅ OK |
