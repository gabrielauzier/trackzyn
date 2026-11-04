# Agenda Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/agenda/design.md`
**Status**: Approved
**Pré-requisito**: PR #20 (lote do foco #14, #15, #16), mergeado na `main` em 2026-11-04; a branch `feat/agenda` parte dela.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `CONTRIBUTING.md` (testes do backend e do frontend antes do PR), `backend-node/vitest.config.ts` (60% de linhas), `frontend/vitest.config.ts`. Onde os guias não definem profundidade, valem os padrões fortes da skill.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Migration e schema | integration (PGlite) | As linhas que já existem ficam `origin = 'focus'` | `backend-node/test/db/*.test.ts` | `npm --prefix backend-node test` |
| Serviço de sessões | integration (PGlite) | Todos os ramos; 1:1 com os ACs de backend; meia-noite no fuso do workspace, sessão aberta, sobreposição, liquidação antes de ler | `backend-node/test/services/sessions.test.ts` | `npm --prefix backend-node test` |
| Rotas de sessões | integration (`app.inject`) | Cada rota: feliz + 403 viewer + 404 + 409 + 422; só os dados do usuário; fechadas a token | `backend-node/test/routes/sessions.test.ts` | `npm --prefix backend-node test` |
| Funções puras do frontend | unit | Todos os ramos: meia-noite, faixas sobrepostas, encaixe de 15 min, limite em agora | `frontend/src/lib/agenda/*.test.ts` | `npm --prefix frontend test` |
| Hooks e componentes | unit (Testing Library) | Cada AC visível, estados vazio, de erro e de viewer | `frontend/src/**/*.test.tsx` | `npm --prefix frontend test` |
| Cliente HTTP e tipos | none | build gate (typecheck) | - | `npm --prefix frontend run typecheck` |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Tasks com testes de unidade do frontend | `npm --prefix frontend test` |
| Full | Tasks do backend, e as do frontend que tocam a página | `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test` (backend) ou `npm --prefix frontend run lint && npm --prefix frontend run typecheck && npm --prefix frontend test` (frontend) |
| Build | Fim de cada fase e tasks de tipos | os dois Full acima + `npm --prefix frontend run build` |

---

## Execution Plan

Phases run sequentially; tasks within a phase run in order.

### Phase 1: Backend das sessões

```
T1 → T2 → T3 → T4 → T5
```

### Phase 2: Base do frontend

```
T6 → T7 → T8 → T9 → T10
```

### Phase 3: Semana e criação

```
T11 → T12 → T13 → T14
```

### Phase 4: Ajuste, dia e calendário

```
T15 → T16 → T17 → T18 → T19
```

### Phase 5: Fixes do Verifier (rodada 1)

```
T20 → T21 → T22 → T23 → T24 → T25 → T26 → T27 → T28 → T29
```

---

## Task Breakdown

### T1: Coluna `origin` e o motivo de fim `manual`

**What**: Migration `0005_session_origin.sql` com `ALTER TABLE focus_sessions ADD COLUMN origin varchar(8) NOT NULL DEFAULT 'focus'`, e no schema a coluna `origin` (`'focus' | 'manual'`) e `'manual'` em `FOCUS_END_REASONS`.
**Where**: `backend-node/drizzle/0005_session_origin.sql`
**Depends on**: None
**Reuses**: o padrão de `backend-node/drizzle/0003_tasks_completed_by.sql` e o journal em `drizzle/meta`
**Requirement**: AGENDA-20, AGENDA-27

**Tools**:

- MCP: NONE
- Skill: `supabase-postgres-best-practices`

**Done when**:

- [x] A migration roda no PGlite dos testes, e uma sessão gravada antes dela lê `origin = 'focus'`
- [x] `backend-node/src/db/schema.ts` tem `origin` e `'manual'` em `FOCUS_END_REASONS`
- [x] Gate check passes: Full (backend)

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): add the origin of a focus session`

---

### T2: Ler as sessões de um intervalo

**What**: `listSessions` em `services/sessions.ts`: liquida (AD-001), devolve as sessões do usuário no workspace que tocam `[from 00:00, to+1 00:00)` no fuso do workspace, com o filtro de lista, sem cortar, com `task_title`, `list_name`, `list_color` e `origin`, e a aberta com `ended_at: null`.
**Where**: `backend-node/src/services/sessions.ts`
**Depends on**: T1
**Reuses**: `settle` (`services/focus-settle.ts`), o recorte de `clippedSessions` e `reportScope` (`services/reports.ts:104`)
**Requirement**: AGENDA-01, AGENDA-05, AGENDA-07, AGENDA-09, AGENDA-10, AGENDA-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Uma sessão de 23:30 a 00:30 aparece ao pedir só o primeiro dia e ao pedir só o segundo
- [x] Uma sessão de outro usuário ou de outro workspace não aparece
- [x] Uma sessão com o prazo vencido vem fechada no prazo (liquidada)
- [x] O filtro de lista deixa só as sessões dela
- [x] Gate check passes: Full (backend)

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): list the sessions of a period for the agenda`

---

### T3: Criar uma sessão manual

**What**: `createSession` em `services/sessions.ts`: numa transação que trava o usuário, valida o horário (fim até agora com 5 s de tolerância, de 1 min a 24 h), a tarefa (do workspace, de lista ativa) ou a lista do intervalo, e grava com `origin = 'manual'`, `device_id = 'agenda'`, `end_reason = 'manual'`, `last_seen_at = ended_at`.
**Where**: `backend-node/src/services/sessions.ts` (modify)
**Depends on**: T2
**Reuses**: `findTask` (`services/focus.ts`), o `invalidTime` de `services/focus.ts`
**Requirement**: AGENDA-20, AGENDA-21, AGENDA-22, AGENDA-23, AGENDA-24, AGENDA-25

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Uma sessão manual de 1h 15min soma 4500 s no tempo gasto da tarefa (`spentSeconds`)
- [x] O relatório do dia (`overview`) soma a sessão manual em `task_seconds`
- [x] Fim no futuro recusa com `invalid_time`; duração de 0 s, 30 s e 24 h + 1 s recusa com `invalid_duration`; 1 min e 24 h passam
- [x] Tarefa de outro workspace ou de lista arquivada recusa com 404
- [x] Gate check passes: Full (backend)

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): create a manual session from the agenda`

---

### T4: Editar e excluir uma sessão encerrada

**What**: `updateSession` e `deleteSession` em `services/sessions.ts`: só a sessão do usuário (senão 404), só encerrada (senão 409 `session_running`), com as mesmas validações da criação, mantendo `origin`.
**Where**: `backend-node/src/services/sessions.ts` (modify)
**Depends on**: T3
**Reuses**: as validações de T3
**Requirement**: AGENDA-29, AGENDA-30, AGENDA-31, AGENDA-32, AGENDA-33, AGENDA-34

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Editar uma sessão do foco de 14:00–15:00 para 14:00–15:30 soma 1800 s no tempo gasto e mantém `origin = 'focus'`
- [x] Excluir tira a duração do tempo gasto
- [x] Editar ou excluir a sessão aberta recusa com 409 `session_running`
- [x] Sessão de outro usuário recusa com 404
- [x] Gate check passes: Full (backend)

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): edit and delete an ended session`

---

### T5: Rotas `/api/sessions`

**What**: `routes/sessions.ts` com `GET /api/sessions`, `POST /api/sessions`, `PATCH /api/sessions/:id` e `DELETE /api/sessions/:id`, schemas zod (período de até 42 dias), `requireWrite` nas escritas, registro em `app.ts` e as quatro rotas como fechadas a token em `test/support/token-routes.ts`.
**Where**: `backend-node/src/routes/sessions.ts`
**Depends on**: T4
**Reuses**: `routes/reports.ts` (`period`), `routes/tasks.ts` (guardas)
**Requirement**: AGENDA-44, AGENDA-45

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Cada rota responde o status da tabela `Surface` do design no caminho feliz e em cada erro listado
- [x] Um `viewer` lê (200) e recebe 403 `Read-only role` em `POST`, `PATCH` e `DELETE`
- [x] Um período de 43 dias responde 422
- [x] `test/routes/token-scopes.test.ts` passa com as rotas novas fechadas a token
- [x] Gate check passes: Full (backend)

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): expose the agenda sessions API`

---

### T6: Cliente e tipos da API de sessões

**What**: `sessions.list`, `sessions.create`, `sessions.update` e `sessions.remove` em `lib/api.ts`, e o tipo `AgendaSession` em `types/index.ts`.
**Where**: `frontend/src/lib/api.ts` (modify)
**Depends on**: None
**Reuses**: o padrão de `reports` e `tasks` em `lib/api.ts`
**Requirement**: AGENDA-01, AGENDA-20

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Os quatro métodos e o tipo existem com a forma da tabela `Surface`
- [x] Gate check passes: Build

**Tests**: none
**Gate**: build

**Commit**: `feat(frontend): add the agenda sessions API client`

---

### T7: Blocos posicionados da semana

**What**: `lib/agenda/layout.ts` com `dayPieces` (corte na meia-noite do fuso, sessão aberta até agora), `assignLanes` (faixas lado a lado) e `dayTotal` (só sessões de tarefa).
**Where**: `frontend/src/lib/agenda/layout.ts`
**Depends on**: T6
**Reuses**: `date-fns`
**Requirement**: AGENDA-01, AGENDA-03, AGENDA-05, AGENDA-06, AGENDA-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Uma sessão de 23:30 a 00:30 em `America/Sao_Paulo` vira dois pedaços, 30 min em cada dia
- [x] Duas sessões sobrepostas recebem `lanes = 2` e faixas 0 e 1; uma terceira que não se sobrepõe fica com `lanes = 1`
- [x] `dayTotal` não soma intervalos
- [x] Gate check passes: Quick

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): lay out the agenda sessions by day and lane`

---

### T8: Query e mutações da Agenda

**What**: `lib/agenda/use-agenda.ts` com a query da semana (`['agenda', from, to, listId]`) e as mutações de criar, editar e excluir, otimistas, que voltam em erro com toast e invalidam `['agenda']`, `['lists']`, `['focus']` e `['reports']`.
**Where**: `frontend/src/lib/agenda/use-agenda.ts`
**Depends on**: T7
**Reuses**: o padrão de mutação de `components/board/subtask-list.tsx`
**Requirement**: AGENDA-12, AGENDA-35, AGENDA-46

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Uma edição que falha volta a sessão ao horário anterior e mostra o toast com a mensagem da API
- [x] Depois de criar, as queries `['lists']` e `['focus']` ficam invalidadas
- [x] Gate check passes: Quick

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): load and change the agenda sessions`

---

### T9: Arraste na grade

**What**: `lib/agenda/use-grid-drag.ts` com eventos de ponteiro para criar sobre o vazio, puxar a borda de cima ou a de baixo e mover o bloco, encaixando em 15 min, sem passar de agora e mantendo de 1 min a 24 h.
**Where**: `frontend/src/lib/agenda/use-grid-drag.ts`
**Depends on**: T8
**Reuses**: nenhum (padrão novo, ver Risks do design)
**Requirement**: AGENDA-14, AGENDA-18, AGENDA-23, AGENDA-29, AGENDA-30

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Arrastar de 17:32 a 18:41 dá o rascunho 17:30–18:45
- [x] Arrastar além de agora para no último passo antes de agora
- [x] Mover um bloco de 1h mantém 1h
- [x] Gate check passes: Quick

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): drag to create, resize and move agenda blocks`

---

### T10: Item `Agenda` e a rota `/agenda`

**What**: o item `Agenda` em `lib/nav-items.ts`, entre as listas e `Relatórios`, a rota `/agenda` em `App.tsx` dentro do `AppLayout` e as chaves `nav.agenda` em `en.json` e `pt-BR.json`.
**Where**: `frontend/src/lib/nav-items.ts` (modify)
**Depends on**: T9
**Reuses**: os itens que já existem em `nav-items.ts`
**Requirement**: AGENDA-13

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] A barra lateral mostra `Agenda` antes de `Relatórios`, com link para `/agenda`
- [x] Gate check passes: Quick

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): add the Agenda item to the sidebar`

---

### T11: Bloco de sessão

**What**: `components/agenda/session-block.tsx`: título (ou `Intervalo`), `HH:MM – HH:MM` com dois dígitos, cor da lista, intervalo tracejado em cinza, sessão aberta com borda índigo e `agora`, linha única para blocos de menos de 40 min.
**Where**: `frontend/src/components/agenda/session-block.tsx`
**Depends on**: None
**Reuses**: a paleta de `ListBadge`, `formatClock`
**Requirement**: AGENDA-03, AGENDA-04, AGENDA-05

**Tools**:

- MCP: NONE
- Skill: `frontend-design`

**Done when**:

- [x] Uma sessão de 13:01 a 13:26 mostra `13:01 – 13:26`
- [x] Um intervalo tem borda tracejada; a sessão aberta tem `agora`
- [x] Gate check passes: Quick

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): draw an agenda session block`

---

### T12: Grade da semana

**What**: `components/agenda/week-grid.tsx`: cabeçalho com dia da semana, número e total; grade de 00:00 a 24:00 que rola até 07:00; blocos posicionados; linha da hora atual em hoje; tempo depois de agora hachurado; arraste de criação ligado a `use-grid-drag`.
**Where**: `frontend/src/components/agenda/week-grid.tsx`
**Depends on**: T11
**Reuses**: `layout.ts`, `use-grid-drag.ts`, `session-block.tsx`
**Requirement**: AGENDA-01, AGENDA-02, AGENDA-05, AGENDA-06, AGENDA-07, AGENDA-11, AGENDA-14, AGENDA-23

**Tools**:

- MCP: NONE
- Skill: `frontend-design`

**Done when**:

- [x] A grade mostra 7 colunas de segunda a domingo, com o total do dia (`6h 15min`)
- [x] Ao abrir, o scroll fica em 07:00
- [x] Duas sessões sobrepostas aparecem lado a lado
- [x] O arraste sobre o hachurado não cria rascunho
- [x] Gate check passes: Quick

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): draw the agenda week grid`

---

### T13: Painel `Nova sessão`

**What**: `components/agenda/session-panel.tsx` no modo nova: `Tarefa` ou `Intervalo`, tarefa agrupada por lista (ou a lista do intervalo), data, início, fim, duração, aviso de sobreposição, `Cancelar`/Esc e `Salvar`, com as mensagens de erro da API.
**Where**: `frontend/src/components/agenda/session-panel.tsx`
**Depends on**: T12
**Reuses**: `ui/select.tsx`, `ui/input.tsx`, `use-agenda.ts`
**Requirement**: AGENDA-15, AGENDA-16, AGENDA-17, AGENDA-19, AGENDA-20, AGENDA-23, AGENDA-24, AGENDA-26

**Tools**:

- MCP: NONE
- Skill: `frontend-design`

**Done when**:

- [x] Mudar o fim de 18:45 para 19:00 muda a duração para `1h 30min`
- [x] Um horário sobreposto mostra `Sobrepõe <título> (<HH:MM> – <HH:MM>). O tempo em comum conta nas duas.` e `Salvar` continua habilitado
- [x] Um 422 `invalid_time` mostra `A sessão não pode terminar no futuro.`
- [x] Esc fecha sem chamar `sessions.create`
- [x] Gate check passes: Quick

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): add the new session panel`

---

### T14: Página da Agenda (semana)

**What**: `pages/agenda.tsx`: barra com `Hoje`, setas de semana, intervalo da semana, filtro de lista, alternância Dia/Semana e `Nova sessão`; estados de carregando, erro com `Tentar de novo` e viewer sem controles de escrita.
**Where**: `frontend/src/pages/agenda.tsx`
**Depends on**: T13
**Reuses**: `week-grid.tsx`, `session-panel.tsx`, `use-agenda.ts`, `PageHeader`
**Requirement**: AGENDA-08, AGENDA-09, AGENDA-10, AGENDA-12, AGENDA-15, AGENDA-44, AGENDA-47

**Tools**:

- MCP: NONE
- Skill: `frontend-design`

**Done when**:

- [x] `Próxima semana` muda o cabeçalho de `2 – 8 de novembro de 2026` para `9 – 15 de novembro de 2026`
- [x] Uma falha da query mostra `Não foi possível carregar a agenda.` e `Tentar de novo` chama a query de novo
- [x] Um `viewer` não vê `Nova sessão`
- [x] Gate check passes: Full (frontend)

**Tests**: unit
**Gate**: full

**Commit**: `feat(frontend): add the agenda week page`

---

### T15: Detalhes, edição e exclusão no painel

**What**: os modos detalhes e editar de `session-panel.tsx`: tarefa, lista, data, horário, duração, origem, `Editar`, `Excluir` com o diálogo de confirmação, `Fechar`; para a sessão aberta, a mensagem e o link `Abrir o foco` sem `Editar` nem `Excluir`.
**Where**: `frontend/src/components/agenda/session-panel.tsx` (modify)
**Depends on**: None
**Reuses**: `delete-confirmation-dialog.tsx`
**Requirement**: AGENDA-27, AGENDA-31, AGENDA-32, AGENDA-33

**Tools**:

- MCP: NONE
- Skill: `frontend-design`

**Done when**:

- [x] O painel de uma sessão do foco mostra `registrada pelo foco`
- [x] Confirmar `Excluir` chama `sessions.remove` e o bloco some
- [x] A sessão aberta mostra `A sessão em andamento não tem alças: o fim é agora. Para ajustar, pause no foco.` e não mostra `Editar`
- [x] Gate check passes: Quick

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): show, edit and delete a session from the agenda`

---

### T16: Alças e mover bloco na grade

**What**: em `week-grid.tsx`, o bloco selecionado e encerrado ganha as alças de cima e de baixo e pode ser arrastado inteiro; ao soltar, chama `sessions.update`; a sessão aberta não tem alças nem é arrastável.
**Where**: `frontend/src/components/agenda/week-grid.tsx` (modify)
**Depends on**: T15
**Reuses**: `use-grid-drag.ts`, `use-agenda.ts`
**Requirement**: AGENDA-28, AGENDA-29, AGENDA-30, AGENDA-33, AGENDA-35

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Puxar o fim de um bloco de 14:00–15:00 até 15:30 chama `sessions.update` com `ended_at` 15:30
- [x] O bloco da sessão aberta não tem alças
- [x] Uma falha da atualização volta o bloco para 14:00–15:00
- [x] Gate check passes: Quick

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): resize and move agenda blocks`

---

### T17: Chip `Hoje` com o calendário

**What**: `components/agenda/date-picker-chip.tsx`: chip `Hoje` com ícone de calendário que abre o calendário do mês (hoje em índigo, setas de mês, `Ir para hoje`) e devolve o dia escolhido.
**Where**: `frontend/src/components/agenda/date-picker-chip.tsx`
**Depends on**: T16
**Reuses**: `ui/calendar.tsx`, `ui/popover.tsx`
**Requirement**: AGENDA-39, AGENDA-40, AGENDA-41

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Escolher 12 de novembro chama `onPick` com `2026-11-12` e fecha o calendário
- [x] `Ir para hoje` chama `onPick` com hoje
- [x] Gate check passes: Quick

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): pick the agenda day from a calendar`

---

### T18: Timeline do dia

**What**: `components/agenda/day-timeline.tsx`: pílulas dos 7 dias com ponto nos dias com sessões, setas de semana, `<dia da semana>, <dia> de <mês> de <ano> · <total>`, timeline de uma coluna, as mensagens de dia vazio e de dia futuro e o botão `+`.
**Where**: `frontend/src/components/agenda/day-timeline.tsx`
**Depends on**: T17
**Reuses**: `layout.ts`, `session-block.tsx`
**Requirement**: AGENDA-36, AGENDA-37, AGENDA-38, AGENDA-42, AGENDA-43

**Tools**:

- MCP: NONE
- Skill: `frontend-design`

**Done when**:

- [x] Domingo aparece como a sétima pílula
- [x] Um dia passado sem sessões mostra `Nenhuma sessão neste dia. Toque em + para registrar uma.`
- [x] Um dia futuro mostra `Este dia ainda não chegou. As sessões aparecem aqui quando você focar.`
- [x] Gate check passes: Quick

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): add the agenda day timeline`

---

### T19: Página responsiva e calendário ligado

**What**: em `pages/agenda.tsx`, abaixo de 768 px mostra `day-timeline.tsx` no lugar de `week-grid.tsx`, e o chip `Hoje` abre a semana do dia escolhido (semana) ou o próprio dia (dia).
**Where**: `frontend/src/pages/agenda.tsx` (modify)
**Depends on**: T18
**Reuses**: `date-picker-chip.tsx`, `day-timeline.tsx`
**Requirement**: AGENDA-36, AGENDA-40, AGENDA-41

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Com 390 px de largura a página mostra a timeline do dia, com 1024 px a grade da semana
- [x] Na semana, escolher 12 de novembro no calendário mostra `9 – 15 de novembro de 2026`; no dia, mostra a quinta, 12 de novembro
- [x] Gate check passes: Build

**Tests**: unit
**Gate**: build

**Commit**: `feat(frontend): switch the agenda to a day view on narrow screens`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phase 1:  T1 → T2 → T3 → T4 → T5
Phase 2:  T6 → T7 → T8 → T9 → T10
Phase 3:  T11 → T12 → T13 → T14
Phase 4:  T15 → T16 → T17 → T18 → T19
Phase 5:  T20 → T21 → T22 → T23 → T24 → T25 → T26 → T27 → T28 → T29
```

19 tasks em 4 fases: no Execute, cabem em 3 lotes (Fase 1 · Fases 2 e 3 · Fase 4) com um worker cada, depois da confirmação.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | 1 migration + a coluna no schema | ✅ Granular |
| T2, T3, T4 | 1 função de serviço cada (T4: editar e excluir, coesas) | ✅ Granular |
| T5 | 1 arquivo de rotas (4 rotas do mesmo recurso) | ⚠️ OK, coeso |
| T6 | cliente + 1 tipo | ✅ Granular |
| T7, T8, T9 | 1 módulo cada | ✅ Granular |
| T10 | 1 item de navegação + a rota | ✅ Granular |
| T11 a T19 | 1 componente ou 1 modo de componente cada | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | início da Fase 1 | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | None | início da Fase 2 (a ordem das fases garante a Fase 1) | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |
| T10 | T9 | T9 → T10 | ✅ Match |
| T11 | None | início da Fase 3 (a ordem das fases garante a Fase 2) | ✅ Match |
| T12 | T11 | T11 → T12 | ✅ Match |
| T13 | T12 | T12 → T13 | ✅ Match |
| T14 | T13 | T13 → T14 | ✅ Match |
| T15 | None | início da Fase 4 (a ordem das fases garante a Fase 3) | ✅ Match |
| T16 | T15 | T15 → T16 | ✅ Match |
| T17 | T16 | T16 → T17 | ✅ Match |
| T18 | T17 | T17 → T18 | ✅ Match |
| T19 | T18 | T18 → T19 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer | Matrix Requires | Task Says | Status |
| ---- | ---------- | --------------- | --------- | ------ |
| T1 | Migration e schema | integration | integration | ✅ |
| T2 a T4 | Serviço de sessões | integration | integration | ✅ |
| T5 | Rotas de sessões | integration | integration | ✅ |
| T6 | Cliente HTTP e tipos | none | none | ✅ |
| T7, T9 | Funções puras do frontend | unit | unit | ✅ |
| T8 | Hooks | unit | unit | ✅ |
| T10 a T19 | Componentes e páginas | unit | unit | ✅ |

---

## Fix Tasks (Verifier round 1)

Origem: `.specs/features/agenda/validation.md` (FAIL, 2026-11-04). Uma task por lacuna, na ordem do ranking do Verifier.

### T20: Mover um bloco para outro dia

**What**: testes que movem um bloco para outro dia: em `use-grid-drag.test.tsx`, um `dayAt` que devolve outro dia e o `onCommit` com o dia novo e a mesma duração, e o dia futuro recusado; na página, a geometria das colunas simulada (`getBoundingClientRect`) para que `columnDayAt` ache a coluna sob o ponteiro e o soltar chame `sessions.update` com o dia novo e a mesma duração.
**Where**: `frontend/src/pages/agenda.test.tsx` (modify)
**Depends on**: None
**Reuses**: `lib/agenda/use-grid-drag.test.tsx` (`Column`, `drag`), o bloco `adjusting a block` de `pages/agenda.test.tsx`
**Requirement**: AGENDA-30

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Mover um bloco de 14:00–15:00 de terça para quarta, às 09:00, chama `onCommit` com `day` quarta, 09:00–10:00
- [x] Mover para um dia futuro não muda o dia do bloco
- [x] Na página, soltar o bloco de terça na coluna de segunda chama `sessions.update` com `started_at` e `ended_at` de segunda, 1 h de duração
- [x] O mutante "move ignora `dayAt`" (`use-grid-drag.ts:105`) falha nesses testes
- [x] Gate check passes: Full (frontend)

**Tests**: unit
**Gate**: full

**Commit**: `test(frontend): prove a block moves to another day`

---

### T21: Editar e excluir só no workspace atual

**What**: testes de serviço e de rota em que o mesmo usuário edita e exclui, pelo workspace A, uma sessão dele no workspace B, e recebe 404 `Session not found` sem mudar a linha; o código já filtra por `workspace_id` em `endedSession` (`services/sessions.ts:190`) e deve continuar.
**Where**: `backend-node/test/services/sessions.test.ts` (modify)
**Depends on**: T20
**Reuses**: `otherWorkspaceTask` e o teste `AGENDA-34` de `test/services/sessions.test.ts`; `test/routes/sessions.test.ts`
**Requirement**: AGENDA-10, AGENDA-34

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `updateSession` e `deleteSession` com o workspace A numa sessão do usuário no workspace B recusam com 404 `Session not found`, e a linha fica igual
- [x] `PATCH` e `DELETE /api/sessions/:id` com `x-workspace-id` de A numa sessão do usuário em B respondem 404 `{ detail: 'Session not found' }`
- [x] O mutante "sem `workspaceId` na busca" falha nesses testes
- [x] Gate check passes: Full (backend)

**Tests**: integration
**Gate**: full

**Commit**: `test(backend): prove a session edits and deletes only in its workspace`

---

### T22: Volta do bloco sem a releitura

**What**: em `use-agenda.test.tsx`, uma edição recusada em que a releitura da agenda também falha: o cache volta ao horário anterior só pela restauração do snapshot.
**Where**: `frontend/src/lib/agenda/use-agenda.test.tsx` (modify)
**Depends on**: T21
**Reuses**: o teste `AGENDA-35` de `use-agenda.test.tsx`
**Requirement**: AGENDA-35

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Com `sessions.list` falhando depois da primeira leitura, uma edição recusada deixa a sessão no cache com `ended_at` 18:00 e mostra o toast
- [x] O mutante "sem `restore(snapshot)`" (`use-agenda.ts:100`) falha nesse teste
- [x] Gate check passes: Quick

**Tests**: unit
**Gate**: quick

**Commit**: `test(frontend): prove a refused edit restores the block without a refetch`

---

### T23: Rota das tarefas que podem receber sessão

**What**: `listSessionTasks` em `services/sessions.ts` e `GET /api/sessions/tasks` em `routes/sessions.ts`: as tarefas das listas ativas do workspace, em qualquer coluna, Concluídas de qualquer data inclusive, com `id`, `title`, `list_id`, `list_name`, `list_color` e `column`; leitura para qualquer membro, fechada a token (AD-007) em `test/support/token-routes.ts`; a rota entra na tabela `Surface` de `design.md`.
**Where**: `backend-node/src/services/sessions.ts` (modify)
**Depends on**: T22
**Reuses**: `selectSessions` (forma da consulta), as guardas `reading` de `routes/sessions.ts`
**Requirement**: AGENDA-16, AGENDA-44

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Uma tarefa concluída há 10 dias vem na resposta com `column: 'done'`
- [x] Tarefas de lista arquivada e de outro workspace não vêm
- [x] `GET /api/sessions/tasks` responde 200 a um viewer e 403 `Route not available for tokens` a um token
- [x] `design.md` lista a rota na tabela `Surface`
- [x] Gate check passes: Full (backend)

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): list the tasks a session can go to`

---

### T24: Painel com todas as tarefas das listas ativas

**What**: `sessions.tasks()` em `lib/api.ts` e o tipo `AgendaTask`; `session-panel.tsx` lê as tarefas dessa rota em vez dos quadros e agrupa por lista; sai o `SPEC_DEVIATION` de AGENDA-16.
**Where**: `frontend/src/components/agenda/session-panel.tsx` (modify)
**Depends on**: T23
**Reuses**: `lib/api.ts` (`sessions`), os grupos por lista de `session-panel.tsx`
**Requirement**: AGENDA-16

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] O painel oferece, no grupo da lista, uma tarefa Concluída que a rota devolve e que nenhum quadro mostra
- [x] O painel não lê `lists.board`
- [x] Não há `SPEC_DEVIATION` de AGENDA-16 em `session-panel.tsx`
- [x] Gate check passes: Full (frontend)

**Tests**: unit
**Gate**: full

**Commit**: `fix(frontend): offer every task of the active lists in the session panel`

---

### T25: Sobreposição com o filtro de lista ligado

**What**: em `pages/agenda.tsx`, o aviso de sobreposição do painel usa as sessões do usuário no período sem o filtro de lista (uma query da mesma semana com `listId: null`), não só as da lista filtrada.
**Where**: `frontend/src/pages/agenda.tsx` (modify)
**Depends on**: T24
**Reuses**: `useAgenda` / `agendaKey` (`lib/agenda/use-agenda.ts`)
**Requirement**: AGENDA-19

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Com o filtro na lista `Work`, um rascunho sobre uma sessão da lista `Home` mostra `Overlaps <título> (<HH:MM> – <HH:MM>). The time in common counts in both.`
- [ ] Gate check passes: Full (frontend)

**Tests**: unit
**Gate**: full

**Commit**: `fix(frontend): warn about an overlap on another list while a filter is on`

---

### T26: Rascunho e painel ligados na página

**What**: testes de página para a metade de interface de AGENDA-14, 17, 18 e 20: arrastar na grade abre o painel com o dia e os horários; mudar um horário no painel move o rascunho; puxar uma alça do rascunho muda os campos em passos de 15 min; salvar mostra o bloco na cor da lista e tira o rascunho. Corrige o código se um teste achar um bug.
**Where**: `frontend/src/pages/agenda.test.tsx` (modify)
**Depends on**: T25
**Reuses**: `pages/agenda.test.tsx`, `PX_PER_MINUTE`
**Requirement**: AGENDA-14, AGENDA-17, AGENDA-18, AGENDA-20

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Arrastar na terça de 17:32 a 18:41 abre `New session` com `2026-11-03`, `17:30` e `18:45`
- [ ] Mudar o fim para `19:00` no painel deixa o rascunho em `17:30 – 19:00`
- [ ] Puxar a alça de baixo do rascunho até 19:22 deixa o campo fim em `19:15`; a de cima até 17:08, o início em `17:15`
- [ ] Salvar mostra o bloco da tarefa com a cor da lista e sem `[data-draft]`
- [ ] Gate check passes: Full (frontend)

**Tests**: unit
**Gate**: full

**Commit**: `test(frontend): prove the agenda draft and the panel follow each other`

---

### T27: Faixas de sessões encadeadas

**What**: em `layout.test.ts`, A sobrepõe B e B só encosta em C (termina quando C começa): A e B ficam lado a lado, C fica com a largura toda.
**Where**: `frontend/src/lib/agenda/layout.test.ts` (modify)
**Depends on**: T26
**Reuses**: `piece` de `layout.test.ts`
**Requirement**: AGENDA-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] A 10:00–11:00, B 10:30–11:30, C 11:30–12:30 dão A `{lane 0, lanes 2}`, B `{lane 1, lanes 2}`, C `{lane 0, lanes 1}`
- [ ] O mutante F1 (`layout.ts:122`, `>=` para `>`) falha nesse teste
- [ ] Gate check passes: Quick

**Tests**: unit
**Gate**: quick

**Commit**: `test(frontend): prove a session that only touches a group keeps the full width`

---

### T28: Erro de edição mostrado uma vez

**What**: uma edição feita pelo painel e recusada mostra o erro só no painel, sem o toast; um ajuste pela grade continua com o toast (AGENDA-35).
**Where**: `frontend/src/lib/agenda/use-agenda.ts` (modify)
**Depends on**: T27
**Reuses**: `sessionErrorMessage`, o `onSave` de `pages/agenda.tsx`
**Requirement**: AGENDA-31, AGENDA-35

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Salvar uma edição recusada com 404 `Task not found` mostra `Task not found` no painel e não chama `toast.error`
- [ ] Um ajuste recusado pela grade ainda chama `toast.error` com a mensagem da API
- [ ] Gate check passes: Full (frontend)

**Tests**: unit
**Gate**: full

**Commit**: `fix(frontend): show a refused panel edit once`

---

### T29: Coluna `origin` lida de um PostgreSQL

**What**: refazer `backend-node/test/fixtures/pg-columns.json` com `information_schema.columns` de um PostgreSQL real que rodou as migrations até 0005, e atualizar o comentário do teste para a 0005; se nenhum PostgreSQL estiver ao alcance, deixar a linha e dizer no comentário que ela espera essa leitura.
**Where**: `backend-node/test/fixtures/pg-columns.json` (modify)
**Depends on**: T28
**Reuses**: o procedimento descrito em `backend-node/test/db/pglite.test.ts:30-63`
**Requirement**: AGENDA-20, AGENDA-27

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] A linha `origin` de `focus_sessions` vem de um PostgreSQL real, e o comentário de `pglite.test.ts` diz de qual versão e para quais migrations
- [ ] `matches the PostgreSQL column catalog` passa
- [ ] Gate check passes: Build

**Tests**: integration
**Gate**: build

**Commit**: `test(backend): read the session origin column from PostgreSQL`
