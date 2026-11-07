# Planejamento diário Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/planejamento-diario/design.md`
**Status**: Approved (2026-11-07)

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `CONTRIBUTING.md` (testes no backend para toda funcionalidade nova; frontend com Vitest e Testing Library via `renderWithProviders`), `frontend/vitest.config.ts`, `backend-node/vitest.config.ts`. Nenhuma lição confirmada. Mesma matriz da feature `agendamento`, sem MCP e sem mobile (fora do escopo).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Schema e migrações (backend) | integration (PGlite) | Cada tabela, `check`, `unique` e cascata nova: valor aceito e valor recusado | `backend-node/test/db/*-schema.test.ts` | `npm --prefix backend-node test` |
| Serviços do backend | integration (PGlite) | Todos os ramos; 1:1 com os critérios do spec; fuso, dia passado, versão e lista arquivada | `backend-node/test/services/*.test.ts` | `npm --prefix backend-node test` |
| Rotas do backend | integration (Fastify inject) | Caminho feliz, 422 de validação, 409, 403 de `viewer`, 403 de token, 404 de outro workspace | `backend-node/test/routes/*.test.ts` | `npm --prefix backend-node test` |
| Funções puras e hooks do frontend | unit | Todos os ramos e casos de borda do spec | `frontend/src/lib/**/*.test.ts(x)` | `npm --prefix frontend test` |
| Componentes e páginas do frontend | unit (Testing Library) | Cada critério visível, `viewer`, teclado (Esc) e dia passado | `frontend/src/**/*.test.tsx` | `npm --prefix frontend test` |
| Traduções | none | build gate (typecheck e `i18n.test.ts`) | `frontend/src/locales/*.json` | `npm --prefix frontend test` |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Tasks com testes só do frontend | `npm --prefix frontend test` |
| Full | Tasks do backend (schema, serviço, rota) | `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test` |
| Build | Fim de cada fase e tasks que tocam páginas | Full + `npm --prefix frontend run lint && npm --prefix frontend run typecheck && npm --prefix frontend test && npm --prefix frontend run build && npm --prefix backend-node run build` |

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Backend

```
T1 → T2 → T3 → T4 → T5 → T6
```

### Phase 2: Lógica do frontend

```
T7 → T8 → T9 → T10
```

### Phase 3: Componentes do plano

```
T11 → T12 → T13 → T14 → T15 → T16 → T17
```

### Phase 4: Tela e Agenda

```
T18 → T19 → T20 → T21 → T22 → T23
```

### Phase 5: Encaixar (P3)

```
T24 → T25
```

---

## Task Breakdown

### T1: Tabelas do plano

**What**: Migração `0014_day_plans.sql` e `schema.ts` com `day_plans` (`unique (user_id, workspace_id, day)`, `version`) e `day_plan_blocks` (`kind`, `task_id`, `name`, `list_id`, `start_time`, `minutes`), com os `check`s de forma tarefa × pausa, limites de minutos e segundos zero, e as cascatas de usuário, workspace, plano, tarefa e lista.
**Where**: `backend-node/src/db/schema.ts`
**Depends on**: None
**Reuses**: `backend-node/drizzle/0013_task_time_any_minute.sql`, `backend-node/test/db/task-schedule-schema.test.ts`
**Requirement**: Modelo de dados; PLAN-17, PLAN-40, PLAN-43 (limites no banco)

**Tools**:

- MCP: NONE
- Skill: `supabase-postgres-best-practices`

**Done when**:

- [x] A migração, gerada com `npx drizzle-kit generate --name day_plans`, roda no PGlite
- [x] O banco recusa: bloco de tarefa sem `task_id`, pausa sem nome ou sem lista, pausa fora de 5–120 min, tarefa fora de 5–1440 min, hora com segundos e um segundo plano do mesmo usuário, workspace e dia
- [x] Excluir a tarefa apaga o bloco; excluir o plano apaga os blocos
- [x] Gate check passes: `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test`
- [x] Test count: os testes anteriores continuam passando, mais os novos de `day-plans-schema.test.ts`

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): add the day plan tables`

---

### T2: Ler o plano e as candidatas

**What**: `getPlan` (plano salvo ou vazio com `version = 0`, `editable = day >= hoje` no fuso do workspace, expediente das preferências com padrão 09:00–18:00, blocos de listas arquivadas fora) e `listCandidates` (tarefas pendentes de listas ativas com coluna, estimativa e `scheduled_on`, até 500).
**Where**: `backend-node/src/services/plans.ts`
**Depends on**: T1
**Reuses**: `workspaceClock` (`services/schedule.ts`), consultas de `services/scheduled.ts`
**Requirement**: PLAN-02, PLAN-11, PLAN-12, PLAN-34, PLAN-39, PLAN-40

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Um usuário não lê o plano de outro, nem de outro workspace (PLAN-12)
- [x] Ontem volta com `editable = false`; hoje e amanhã com `true`
- [x] Tarefa concluída volta com `done = true`; tarefa de lista arquivada some do plano e das candidatas
- [x] Gate check passes: `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test`
- [x] Test count: anteriores + os novos de `services/plans-read.test.ts`

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): read a day plan and its candidate tasks`

---

### T3: Salvar o plano

**What**: `savePlan` numa transação: recusa dia passado (422 `plan_day_past`), cria ou trava o cabeçalho, compara `base_version` (409 `plan_changed`), confere tarefas e listas do workspace (422), troca os blocos, soma 1 à versão e chama `setSchedule(day, null)` para cada tarefa sem `scheduled_on`, em ordem de `list_id`.
**Where**: `backend-node/src/services/plans.ts`
**Depends on**: T2
**Reuses**: `setSchedule` (`services/schedule.ts:54`)
**Requirement**: PLAN-08, PLAN-09, PLAN-10, PLAN-35, PLAN-38, PLAN-43

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Salvar troca o dia inteiro; reenviar o mesmo corpo com a versão nova dá o mesmo plano
- [x] Versão diferente responde 409 e não grava nada
- [x] Tarefa sem dia recebe o dia do plano, sem hora, com a regra D3 (Backlog → Esta semana ou Hoje)
- [x] Tarefa agendada para outro dia mantém o dia; nenhuma tarefa muda `scheduled_time` nem `estimate_minutes`
- [x] Tarefa de outro workspace e pausa com lista de outro workspace respondem 422
- [x] Gate check passes: `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test`
- [x] Test count: anteriores + os novos de `services/plans-save.test.ts`

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): save a day plan as a whole`

---

### T4: Blocos planejados do período

**What**: `listPlanned(from, to)` com os blocos salvos do usuário no período, cada um com o dia, para a Agenda.
**Where**: `backend-node/src/services/plans.ts`
**Depends on**: T3
**Reuses**: `MAX_AGENDA_DAYS`
**Requirement**: PLAN-24, PLAN-12

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Volta só os blocos do usuário no workspace, ordenados por dia e início, sem listas arquivadas
- [x] Gate check passes: `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test`
- [x] Test count: anteriores + os novos em `services/plans-read.test.ts`

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): list the planned blocks of a period`

---

### T5: Expediente do usuário

**What**: `setWorkday` mescla `{ start, end }` em `users.preferences.workday` sem apagar as outras preferências; 422 quando o fim não é depois do início.
**Where**: `backend-node/src/services/users.ts`
**Depends on**: T4
**Reuses**: `updateUser`
**Requirement**: PLAN-22, PLAN-23

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] As outras chaves de `preferences` continuam iguais depois de gravar o expediente
- [x] `18:00`–`09:00` e `09:00`–`09:00` são recusados
- [x] Gate check passes: `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test`
- [x] Test count: anteriores + os novos de `services/workday.test.ts`

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): keep the workday in the user preferences`

---

### T6: Rotas do plano

**What**: `GET`/`PUT /api/plans/:day`, `GET /api/plans/:day/candidates`, `GET /api/plans?from&to` e `PUT /api/users/me/workday`, registradas em `app.ts` e incluídas em `CLOSED_AGENDA_ROUTES` (AD-007).
**Where**: `backend-node/src/routes/plans.ts`
**Depends on**: T5
**Reuses**: `authGuards`, `workspaceContext`, `periodQuery`, `backend-node/test/support/token-routes.ts`
**Requirement**: PLAN-41, PLAN-42, PLAN-43, PLAN-35

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Cada rota: caminho feliz, 422 (dia inválido, `HH:MM` inválido, limites, pausa sem nome), 403 `Read-only role` para viewer nas escritas, 403 para token `tkz_`, 404 para outro workspace
- [x] `PUT` responde 409 `plan_changed` com versão velha
- [x] `token-scopes.test.ts` passa com as rotas novas fechadas
- [x] Gate check passes: `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test`
- [x] Test count: anteriores + os novos de `routes/plans.test.ts`

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): expose the day plan routes`

---

### T7: Rascunho do plano

**What**: `draftReducer` (`add`, `move`, `resize`, `edit`, `remove`, `reset`), `isDirty` e os limites `clampTask` (5–1440) e `clampBreak` (5–120, recusa com erro).
**Where**: `frontend/src/lib/plan/draft.ts`
**Depends on**: None (Fase 1 concluída)
**Reuses**: `scheduledMinutes` (`lib/agenda/layout.ts`)
**Requirement**: PLAN-04, PLAN-05, PLAN-06, PLAN-07, PLAN-11, PLAN-17

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Soltar tarefa sem estimativa cria 1h; com estimativa, a estimativa
- [x] Mover e redimensionar encaixam em 15 min; editar aceita qualquer minuto
- [x] `isDirty` é falso logo depois de `reset(saved)` e verdadeiro depois de qualquer mudança
- [x] Gate check passes: `npm --prefix frontend test`
- [x] Test count: anteriores + os novos de `draft.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): model the day plan draft`

---

### T8: Conta da capacidade

**What**: `capacity(blocks, fixedTimed, workday)` com `planned`, `breaks`, `scheduled`, `free` e `over`, contando só o tempo dentro do expediente e ignorando a tarefa com hora que tem bloco (PLAN-D7).
**Where**: `frontend/src/lib/plan/capacity.ts`
**Depends on**: T7
**Reuses**: NONE
**Requirement**: PLAN-19, PLAN-20

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Os dois exemplos do teste independente da história dão os números do spec (8h/1h/9h e 7h/1h/1h/9h)
- [x] Pausa que começa antes do expediente conta só a parte de dentro
- [x] Gate check passes: `npm --prefix frontend test`
- [x] Test count: anteriores + os novos de `capacity.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): compute the capacity of a planned day`

---

### T9: Dados do plano

**What**: Tipos, cliente `plansApi` em `lib/api.ts` e o hook `usePlan` (plano do dia, candidatas, salvar com invalidação de Agenda e quadro, expediente) com o tratamento de 409.
**Where**: `frontend/src/lib/plan/use-plan.ts`
**Depends on**: T8
**Reuses**: `lib/agenda/use-scheduled.ts`
**Requirement**: PLAN-08, PLAN-35, PLAN-37

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Salvar envia `base_version` e os blocos; 409 vira `conflict`, outra falha vira `failed`, sem perder o rascunho
- [x] Salvar invalida `['plan']`, `['plans']`, a Agenda agendada e o quadro
- [x] Gate check passes: `npm --prefix frontend test`
- [x] Test count: anteriores + os novos de `use-plan.test.tsx`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): load and save a day plan`

---

### T10: Arraste da grade do plano

**What**: `usePlanDrag`: soltar um item de fora da grade (tarefa ou pausa), mover um bloco e puxar a borda de baixo, no passo de 15 min, com pointer events.
**Where**: `frontend/src/lib/plan/use-plan-drag.ts`
**Depends on**: T9
**Reuses**: a conta de minuto de `lib/agenda/drop-zone.ts`
**Requirement**: PLAN-04, PLAN-05, PLAN-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Um ponteiro solto em 10:37 cria o bloco em 10:30; arrastar 50 px move o bloco no passo certo para a escala
- [x] Soltar fora da grade não cria nada; Esc cancela o arraste
- [x] Gate check passes: `npm --prefix frontend test`
- [x] Test count: anteriores + os novos de `use-plan-drag.test.tsx`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): drag tasks and breaks on the plan grid`

---

### T11: Bloco do plano

**What**: `PlanBlock` de tarefa (cor da lista, borda tracejada, riscado se concluída, selo `Agendada para <dia>`) e de pausa (cinza hachurado), com as traduções.
**Where**: `frontend/src/components/plan/plan-block.tsx`
**Depends on**: None (Fase 2 concluída)
**Reuses**: `components/agenda/scheduled-block.tsx`, `longDay`
**Requirement**: PLAN-15, PLAN-38, PLAN-39

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Título, horário e duração aparecem; pausa e tarefa têm aparência diferente
- [x] Tarefa concluída aparece riscada; tarefa de outro dia mostra o selo
- [x] Gate check passes: `npm --prefix frontend test`
- [x] Test count: anteriores + os novos de `plan-block.test.tsx`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): draw a block of the day plan`

---

### T12: Grade do plano

**What**: `PlanGrid` de um dia: horas de 00:00 a 24:00 roladas até o expediente, sessões e tarefas com hora fixas, blocos do rascunho com raias, expediente marcado e o corte em 24:00.
**Where**: `frontend/src/components/plan/plan-grid.tsx`
**Depends on**: T11
**Reuses**: `assignLanes`, `PX_PER_MINUTE`, `use-zoom-scroll.ts`
**Requirement**: PLAN-03, PLAN-21, PLAN-44

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Blocos fixos não têm alça nem arraste; blocos do rascunho têm
- [x] Blocos sobrepostos dividem a largura; um bloco que passa de 24:00 termina na borda
- [x] Gate check passes: `npm --prefix frontend test`
- [x] Test count: anteriores + os novos de `plan-grid.test.tsx`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): lay out the day plan grid`

---

### T13: Lateral de tarefas e pausas

**What**: `PlanSidebar` com `Café`, `Almoço`, `Nova pausa`, busca, filtro por lista e os grupos `Agendadas para o dia`, `Hoje`, `Esta semana` e `Backlog`, marcando as já planejadas.
**Where**: `frontend/src/components/plan/plan-sidebar.tsx`
**Depends on**: T12
**Reuses**: o filtro de listas da Agenda
**Requirement**: PLAN-02, PLAN-14

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Cada tarefa aparece no grupo certo; a busca filtra por título e o filtro por lista
- [x] Tarefas no rascunho aparecem marcadas, mas ainda podem ser arrastadas
- [x] Gate check passes: `npm --prefix frontend test`
- [x] Test count: anteriores + os novos de `plan-sidebar.test.tsx`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): list the tasks and breaks to plan`

---

### T14: Diálogo de nova pausa

**What**: `BreakDialog` com nome (1 a 40), duração HH:MM e lista do Intervalo (primeira lista ativa).
**Where**: `frontend/src/components/plan/break-dialog.tsx`
**Depends on**: T13
**Reuses**: `components/ui/dialog`, o campo HH:MM do `schedule-picker`
**Requirement**: PLAN-16, PLAN-17, PLAN-18

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Nome vazio ou com mais de 40 caracteres não cria; duração fora de 5 min a 2h mostra `A pausa vai de 5 min a 2h`
- [x] Esc fecha sem criar
- [x] Gate check passes: `npm --prefix frontend test`
- [x] Test count: anteriores + os novos de `break-dialog.test.tsx`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): create a custom break`

---

### T15: Editor do bloco

**What**: `BlockEditor` com início e duração em HH:MM, lista da pausa e `Tirar do plano`.
**Where**: `frontend/src/components/plan/block-editor.tsx`
**Depends on**: T14
**Reuses**: o campo HH:MM do `schedule-picker`
**Requirement**: PLAN-06, PLAN-17, PLAN-18

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Mudar início e duração altera só o bloco; o texto diz que a estimativa continua a mesma
- [x] `Tirar do plano` remove o bloco do rascunho
- [x] Gate check passes: `npm --prefix frontend test`
- [x] Test count: anteriores + os novos de `block-editor.test.tsx`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): edit a block of the day plan`

---

### T16: Barra de capacidade

**What**: `CapacityBar` com o texto do PLAN-19, a barra e o estado vermelho com `<excesso> além do expediente`.
**Where**: `frontend/src/components/plan/capacity-bar.tsx`
**Depends on**: T15
**Reuses**: `minuteClock`
**Requirement**: PLAN-19, PLAN-20

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `· <agendadas> agendadas` só aparece quando é maior que zero
- [x] Acima do livre, a barra fica vermelha e mostra o excesso
- [x] Gate check passes: `npm --prefix frontend test`
- [x] Test count: anteriores + os novos de `capacity-bar.test.tsx`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): show how much of the day is planned`

---

### T17: Editor do expediente

**What**: `WorkdayEditor` com início e fim em HH:MM, salvando pela rota do expediente.
**Where**: `frontend/src/components/plan/workday-editor.tsx`
**Depends on**: T16
**Reuses**: `usePlan`
**Requirement**: PLAN-22, PLAN-23

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Fim antes ou igual ao início mostra `O fim precisa ser depois do início` e não salva
- [x] Salvar recalcula a barra
- [x] Gate check passes: `npm --prefix frontend test`
- [x] Test count: anteriores + os novos de `workday-editor.test.tsx`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): edit the workday from the plan`

---

### T18: Guarda do rascunho

**What**: Contexto `DraftGuard` que guarda se há rascunho sujo, liga `beforeunload` e oferece `confirmLeave()` para links e setas, com o diálogo `Descartar o rascunho?`.
**Where**: `frontend/src/lib/plan/draft-guard.tsx`
**Depends on**: None (Fase 3 concluída)
**Reuses**: `delete-confirmation-dialog.tsx`
**Requirement**: PLAN-36

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Com rascunho sujo, sair pergunta; `Continuar planejando` fica, `Descartar` sai
- [x] Sem rascunho, sair não pergunta
- [x] Gate check passes: `npm --prefix frontend test`
- [x] Test count: anteriores + os novos de `draft-guard.test.tsx`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): ask before leaving an unsaved plan`

---

### T19: Tela de planejar

**What**: `PlanPage` em `/planejar/:day` (rota em `App.tsx`, sem dia vai para amanhã): cabeçalho com setas e calendário, barra, lateral, grade, rodapé `Rascunho — ainda não salvo` com `Descartar` e `Confirmar plano`, mensagens de salvo, conflito e falha, dia passado e viewer só para leitura.
**Where**: `frontend/src/pages/plan.tsx`
**Depends on**: T18
**Reuses**: `date-picker-chip.tsx`, componentes de T11 a T18
**Requirement**: PLAN-01, PLAN-07, PLAN-08, PLAN-11, PLAN-13, PLAN-34, PLAN-35, PLAN-37, PLAN-41

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Soltar duas tarefas e confirmar envia um único `PUT`; depois, o rodapé some e aparece `Plano salvo`
- [x] 409 mostra `O plano mudou em outro lugar` com `Recarregar`; falha mostra `Não foi possível salvar o plano.` com `Tentar de novo`
- [x] Dia passado e viewer: sem arraste e sem rodapé
- [x] Gate check passes: build gate
- [x] Test count: anteriores + os novos de `plan.test.tsx`

**Tests**: unit
**Gate**: build

**Commit**: `feat(frontend): plan a day on its own page`

---

### T20: Bloco planejado na Agenda

**What**: `PlannedBlock` para a Agenda: tarefa tracejada na cor da lista e pausa hachurada, com `Começar` só nas pausas de hoje.
**Where**: `frontend/src/components/agenda/planned-block.tsx`
**Depends on**: T19
**Reuses**: `PlanBlock` (T11)
**Requirement**: PLAN-24, PLAN-28

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Pausa de hoje mostra `Começar`; de outro dia, não
- [x] Gate check passes: `npm --prefix frontend test`
- [x] Test count: anteriores + os novos de `planned-block.test.tsx`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): draw planned blocks on the agenda`

---

### T21: Plano na grade da Agenda

**What**: Prop `planned` no `WeekGrid`, desenhada sem cobrir as sessões, e o bloco agendado da mesma tarefa no mesmo dia escondido.
**Where**: `frontend/src/components/agenda/week-grid.tsx`
**Depends on**: T20
**Reuses**: `assignLanes`
**Requirement**: PLAN-24, PLAN-25

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tarefa com bloco no plano e hora agendada no mesmo dia aparece uma vez, como bloco do plano
- [x] Sem `planned`, a grade fica igual (testes atuais passam)
- [x] Gate check passes: `npm --prefix frontend test`
- [x] Test count: anteriores + os novos em `week-grid.test.tsx`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): show the saved plan on the week grid`

---

### T22: Plano na página da Agenda

**What**: A Agenda lê `GET /api/plans` da semana, passa `planned` à grade e à visão de dia, abre o painel da pausa com `Começar` (chama `POST /api/focus/break` com a duração e a lista da pausa) e abre o plano ao clicar num bloco de tarefa; botão `Planejar amanhã` no cabeçalho.
**Where**: `frontend/src/pages/agenda.tsx`
**Depends on**: T21
**Reuses**: o cliente de intervalo do foco em `lib/api.ts`
**Requirement**: PLAN-01, PLAN-26, PLAN-27, PLAN-29, PLAN-45

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `Começar` envia `minutes` e `list_id` da pausa; erro do foco aparece no toast e não abre outro Intervalo
- [ ] Clicar num bloco de tarefa navega para `/planejar/<dia>`
- [ ] Gate check passes: build gate
- [ ] Test count: anteriores + os novos em `agenda.test.tsx`

**Tests**: unit
**Gate**: build

**Commit**: `feat(frontend): start a planned break from the agenda`

---

### T23: Atalhos para planejar

**What**: Item `Planejar` na navegação (abre amanhã), botão `Planejar amanhã` em Hoje e `Planejar dia` no cabeçalho de um dia da Agenda.
**Where**: `frontend/src/lib/nav-items.ts`
**Depends on**: T22
**Reuses**: `pages/home.tsx`, cabeçalho de dia do `WeekGrid`
**Requirement**: PLAN-01, PLAN-30, PLAN-31

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Os três atalhos levam ao dia certo
- [ ] Gate check passes: build gate
- [ ] Test count: anteriores + os novos em `app-layout.test.tsx`, `home.test.tsx` e `week-grid.test.tsx`

**Tests**: unit
**Gate**: build

**Commit**: `feat(frontend): reach the day plan from the nav, home and agenda`

---

### T24: Conta do encaixe

**What**: `fit(tasks, occupied, workday)`: coloca cada tarefa, na ordem dada, no primeiro buraco livre do expediente em que cabe, sem sobrepor blocos, sessões ou tarefas com hora, e devolve as que não couberam.
**Where**: `frontend/src/lib/plan/fit.ts`
**Depends on**: None (Fase 4 concluída)
**Reuses**: NONE
**Requirement**: PLAN-32, PLAN-33

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Três tarefas de 1h com o expediente livre desde 09:00 caem em 09:00, 10:00 e 11:00
- [ ] Uma tarefa maior que todo buraco volta em `left`
- [ ] Gate check passes: `npm --prefix frontend test`
- [ ] Test count: anteriores + os novos de `fit.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): fit tasks into the free time of the workday`

---

### T25: Botão Encaixar

**What**: Marcar tarefas na lateral e `Encaixar`, aplicando `fit` ao rascunho e mostrando `<n> tarefas não couberam`.
**Where**: `frontend/src/components/plan/plan-sidebar.tsx`
**Depends on**: T24
**Reuses**: `fit` (T24), `draftReducer` (T7)
**Requirement**: PLAN-32, PLAN-33

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `Encaixar` cria os blocos no rascunho sem salvar; as que não couberam continuam marcadas com o aviso
- [ ] Gate check passes: build gate
- [ ] Test count: anteriores + os novos em `plan-sidebar.test.tsx`

**Tests**: unit
**Gate**: build

**Commit**: `feat(frontend): fit the chosen tasks into the plan`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phase 1:  T1 → T2 → T3 → T4 → T5 → T6
Phase 2:  T7 → T8 → T9 → T10
Phase 3:  T11 → T12 → T13 → T14 → T15 → T16 → T17
Phase 4:  T18 → T19 → T20 → T21 → T22 → T23
Phase 5:  T24 → T25
```

Lotes para sub-agentes (~7 tarefas, fases inteiras): **A** = Fase 1 (6), **B** = Fases 2 (4), **C** = Fase 3 (7), **D** = Fases 4 e 5 (8).

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 | 2 tabelas no schema + migração gerada | ✅ Coeso (uma migração) |
| T2 | 2 funções de leitura no mesmo serviço | ⚠️ OK, mesmo arquivo e mesma consulta base |
| T3 | 1 função | ✅ |
| T4 | 1 função | ✅ |
| T5 | 1 função | ✅ |
| T6 | 1 arquivo de rotas + registro | ✅ |
| T7–T10 | 1 módulo cada | ✅ |
| T11–T17 | 1 componente cada | ✅ |
| T18 | 1 contexto | ✅ |
| T19 | 1 página + rota | ✅ |
| T20–T22 | 1 componente/arquivo cada | ✅ |
| T23 | 3 atalhos pequenos ligados à mesma entrada | ⚠️ OK, mesma mudança visível |
| T24–T25 | 1 função / 1 componente | ✅ |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | início da Fase 1 | ✅ |
| T2–T6 | a anterior | cadeia da Fase 1 | ✅ |
| T7 | None (Fase 1 concluída) | início da Fase 2 (após Fase 1) | ✅ |
| T8–T10 | a anterior | cadeia da Fase 2 | ✅ |
| T11 | None (Fase 2 concluída) | início da Fase 3 | ✅ |
| T12–T17 | a anterior | cadeia da Fase 3 | ✅ |
| T18 | None (Fase 3 concluída) | início da Fase 4 | ✅ |
| T19–T23 | a anterior | cadeia da Fase 4 | ✅ |
| T24 | None (Fase 4 concluída) | início da Fase 5 | ✅ |
| T25 | T24 | cadeia da Fase 5 | ✅ |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Schema e migrações | integration | integration | ✅ |
| T2–T5 | Serviços do backend | integration | integration | ✅ |
| T6 | Rotas do backend | integration | integration | ✅ |
| T7–T10 | Funções puras e hooks | unit | unit | ✅ |
| T11–T17 | Componentes (+ traduções) | unit | unit | ✅ |
| T18 | Hook/contexto | unit | unit | ✅ |
| T19 | Página (+ rota, traduções) | unit | unit | ✅ |
| T20–T23 | Componentes e páginas | unit | unit | ✅ |
| T24 | Função pura | unit | unit | ✅ |
| T25 | Componente | unit | unit | ✅ |
