# Dashboard Hoje Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/dashboard-hoje/design.md`
**Status**: Approved (2026-11-11)

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `CONTRIBUTING.md` (testes no backend para toda funcionalidade nova; frontend com Vitest e Testing Library via `renderWithProviders`), `frontend/vitest.config.ts`, `backend-node/vitest.config.ts`. Lições confirmadas aplicadas: L-044 (cada caso de borda do spec tem o próprio teste, com a condição montada) e L-048 (quando um critério restringe a "o próprio" item, um teste age sobre outro item no mesmo estado). Mesma matriz de `planejamento-diario`, sem schema novo.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Serviços do backend | integration (PGlite) | Todos os ramos; 1:1 com os critérios do spec; fuso, virada de dia, outro membro, outro workspace, lista arquivada | `backend-node/test/services/*.test.ts` | `npm --prefix backend-node test` |
| Rotas do backend | integration (Fastify inject) | Caminho feliz, 422 de validação, 403 de `viewer` (escrita), 403 de token, 404/422 de outro workspace | `backend-node/test/routes/*.test.ts` | `npm --prefix backend-node test` |
| Funções puras e hooks do frontend | unit | Todos os ramos e casos de borda do spec | `frontend/src/lib/**/*.test.ts(x)` | `npm --prefix frontend test` |
| Componentes e páginas do frontend | unit (Testing Library) | Cada critério visível, vazio, `viewer`, erro da API | `frontend/src/**/*.test.tsx` | `npm --prefix frontend test` |
| Traduções | none | build gate (typecheck e `i18n.test.ts`) | `frontend/src/locales/*.json` | `npm --prefix frontend test` |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Tasks com testes só do frontend | `npm --prefix frontend test` |
| Full | Tasks do backend (serviço, rota) | `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test` |
| Build | Fim de cada fase e tasks que tocam páginas ou rotas do app | Full + `npm --prefix frontend run lint && npm --prefix frontend run typecheck && npm --prefix frontend test && npm --prefix frontend run build && npm --prefix backend-node run build` |

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Leitura do dia (backend, P1)

```
T1 → T2 → T3
```

### Phase 2: Base do frontend (P1)

```
T4 → T5 → T6 → T7
```

### Phase 3: Página e cards (P1)

```
T8 → T9 → T10 → T11 → T12 → T13 → T14
```

### Phase 4: Plano × real, números e amanhã (P2)

```
T15 → T16 → T17 → T18 → T19
```

### Phase 5: Fechar o dia (P3)

```
T20 → T21 → T22 → T23
```

### Phase 6: Correções da verificação 1

```
T24 → T25 → T26 → T27 → T28 → T29
```

---

## Task Breakdown

### T1: `readToday` com relógio, jornada, Pendente, plano e sessões

**What**: Criar `readToday(db, actor, now)` com `server_now`, `day`, `tomorrow`, `timezone`, `now_minute`, `workday`, `pending`, `plan` (blocos de hoje, com os de tarefa feita) e `sessions` (recortadas ao dia), na ordem `settle` → `applyDueSchedules` → `workspaceClock`.
**Where**: `backend-node/src/services/today.ts`
**Depends on**: None
**Reuses**: `settle`, `applyDueSchedules`, `workspaceClock`, `dayTimezone`, `listPlanned`, `workdayOf`, o SQL de `clippedSessions`
**Requirement**: HOJE-06, HOJE-23, HOJE-25, HOJE-28, HOJE-68, HOJE-69

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `pending` traz só tarefas não concluídas da coluna `Hoje` de listas não arquivadas do workspace, sem a tarefa da sessão aberta; uma tarefa de `Hoje` de lista arquivada e uma de outro workspace ficam de fora (testes próprios, L-048)
- [x] `scheduled_minute` só existe quando `scheduled_on` é hoje; `plan_minute` é o início do primeiro bloco da tarefa; `has_session_today` e `days_late` (hoje − `scheduled_on`) conferidos com valores concretos
- [x] Uma tarefa agendada para hoje ainda em `Esta semana` aparece em `pending` depois da leitura (AD-009)
- [x] `sessions` traz só sessões do leitor no workspace; a de outro membro no mesmo dia fica de fora (L-048); uma sessão de 23:30 a 00:30 vira 00:00–00:30 (HOJE-68); a soma bate com `overview` dos Relatórios de hoje
- [x] Trocar o fuso do workspace muda `day` e `now_minute` na leitura seguinte (HOJE-69)
- [x] `plan.saved` é `false` sem plano salvo
- [x] Gate check passes: `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test`

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): read the user's day for the Hoje dashboard`

---

### T2: `readToday` com `Feito hoje`

**What**: Somar a `readToday` o campo `done`: tarefas concluídas hoje pelo leitor, mais recentes primeiro, com `spent_seconds` de todos os membros, `verdict` e `diff_seconds` de `verdictOf`, e `series`.
**Where**: `backend-node/src/services/today.ts` (modify)
**Depends on**: T1
**Reuses**: `verdictOf`, `spentSecondsByTask`
**Requirement**: HOJE-35, HOJE-36, HOJE-38, HOJE-40

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tarefa concluída hoje pelo leitor aparece; a concluída hoje por outro membro e a que o leitor concluiu ontem ficam de fora (um teste cada, L-044 e L-048)
- [x] Ordem pela conclusão, a mais recente primeiro
- [x] Estimativa de 30 min com 25 min gastos dá `early` e −300 s; sem estimativa, `verdict` nulo
- [x] Gate check passes: `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test`

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): list the tasks the user completed today`

---

### T3: Rota `GET /api/today`

**What**: Criar `routes/today.ts` com `GET /api/today` (schema zod de `TodayRead`), registrá-la no app e somá-la às rotas fechadas a tokens em `test/support/token-routes.ts`.
**Where**: `backend-node/src/routes/today.ts`
**Depends on**: T2
**Reuses**: padrão de `routes/plans.ts` (`requireUser`, `workspaceContext`, `typed.get`)
**Requirement**: HOJE-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Owner e `viewer` recebem 200 com o dia; sem `X-Workspace-Id` de um workspace do usuário, 403/404 como as outras rotas
- [x] Um token `tkz_` recebe 403 e `token-scopes.test.ts` passa com a rota na lista fechada (AD-007)
- [x] Gate check passes: `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test`

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): serve the day at GET /api/today`

---

### T4: Contas por minuto do dia

**What**: Criar `groupPending`, `capacity` e `suggestedBlock` como funções puras.
**Where**: `frontend/src/lib/today/rules.ts`
**Depends on**: None
**Reuses**: nenhum
**Requirement**: HOJE-11, HOJE-25, HOJE-26, HOJE-29, HOJE-30, HOJE-31, HOJE-32

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Uma tarefa que vale para dois grupos cai só no primeiro da ordem `Atrasada`, `Com horário`, `No plano`, `Veio de dias anteriores`, `Sem plano`; grupos vazios não voltam
- [x] `Atrasada` exige início anterior a agora e nenhuma sessão hoje: um teste com sessão hoje mostra a mesma tarefa em `Com horário`
- [x] Ordem dentro do grupo: início de hoje, depois `position`
- [x] `capacity` às 14:20 com fim 19:00, 4h estimadas e 58 min de foco restante dá `over` de 18 min; com fim 18:00 depois das 18:00, `left` é 0; tarefas sem estimativa contam 0 e saem em `withoutEstimate`
- [x] `suggestedBlock` ignora bloco de pausa e de tarefa feita; com dois blocos sobrepostos, pega o que começou mais tarde; fora de blocos, `null`
- [x] Gate check passes: `npm --prefix frontend test`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): group the pending tasks and size them against the workday`

---

### T5: Cliente e hook do dia

**What**: Criar `useToday()` (`useQuery(['today', workspaceId])`, `refetchInterval` de 60 s, `refetchOnWindowFocus`, mantém os dados anteriores em erro), com o tipo `TodayRead` em `@/types` e `today.get()` em `lib/api.ts`.
**Where**: `frontend/src/lib/today/use-today.ts`
**Depends on**: T4
**Reuses**: padrão de `lib/agenda/use-scheduled.ts`
**Requirement**: HOJE-71, HOJE-73

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] O hook relê ao ganhar o foco da janela e a cada 60 s (testado com timers falsos)
- [x] Uma leitura que falha depois de uma boa expõe `isError` e mantém os dados anteriores
- [x] A chave muda com o workspace atual
- [x] Gate check passes: `npm --prefix frontend test`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): read the day from GET /api/today`

---

### T6: Minuto atual no fuso do workspace

**What**: Criar `useNowMinute(timeZone)`, que devolve `{ minute, day }` pelo relógio do servidor (`serverNow`) e só re-renderiza na virada do minuto, chamando `onDayChange` quando o dia muda.
**Where**: `frontend/src/lib/today/use-now-minute.ts`
**Depends on**: T5
**Reuses**: `serverNow` de `lib/focus/clock.ts`, `hourIn` de `components/lists/greeting.ts`
**Requirement**: HOJE-04, HOJE-70

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Às 14:19:59 em `America/Sao_Paulo`, um segundo depois o minuto é 860
- [x] Passar de 23:59 para 00:00 chama `onDayChange` uma vez com o novo dia
- [x] Gate check passes: `npm --prefix frontend test`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): tick the current minute in the workspace timezone`

---

### T7: Grade de listas em `/lists`

**What**: Mover a página da grade de listas de `home.tsx` para `pages/lists.tsx` em `/lists`, apontar `allLists` para `/lists` e `newList` para `/lists?new=1` em `nav-items.ts`, e trocar os links de volta de `list-board.tsx` para `/lists`.
**Where**: `frontend/src/pages/lists.tsx`
**Depends on**: T6
**Reuses**: `pages/home.tsx` inteiro, `home.test.tsx`
**Requirement**: HOJE-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `/lists` mostra a grade com arrastar, renomear e criar; `/lists?new=1` abre o diálogo de nova lista (testes de `home.test.tsx` movidos para `lists.test.tsx` sem perder nenhum)
- [x] O breadcrumb de uma lista e o redirecionamento de lista excluída levam para `/lists`
- [x] `nav-items.test.ts` atualizado
- [x] Gate check passes: Build

**Tests**: unit
**Gate**: build

**Commit**: `refactor(frontend): move the list grid to /lists`

---

### T8: Card de tarefa no visual do Planejar

**What**: Criar `TaskTile` com as variantes `pending`, `late`, `done` e `ghost`, nas classes do item da lista lateral do Planejar.
**Where**: `frontend/src/components/today/task-tile.tsx`
**Depends on**: None (fases anteriores)
**Reuses**: classes de `components/plan/plan-sidebar.tsx:229-260`, `formatDuration`
**Requirement**: HOJE-24, HOJE-27, HOJE-37

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `pending`: borda de 1px, cantos de 8px, ponto da cor da lista, título, linha `<lista> · <detalhes>`, pílula de estimativa ou `Sem estimativa`
- [x] `late`: borda e hora em âmbar
- [x] `done`: fundo cinza claro, ícone de concluída no lugar do ponto, selo com o texto e a cor do veredito
- [x] `ghost`: borda tracejada, sem ponto colorido
- [x] É um botão acessível pelo teclado quando recebe `onOpen`
- [x] Gate check passes: `npm --prefix frontend test`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): draw a task tile like the plan side list`

---

### T9: Card `Pendente`

**What**: Criar `PendingCard` com o total no título, a capacidade, os grupos com contagem, `há N dias`, `passou há`, o vazio e o clique que abre o `TaskDialog`.
**Where**: `frontend/src/components/today/pending-card.tsx`
**Depends on**: T8
**Reuses**: `TaskTile`, `groupPending`, `capacity`, `TaskDialog`
**Requirement**: HOJE-23, HOJE-26, HOJE-27, HOJE-28, HOJE-29, HOJE-30, HOJE-31, HOJE-32, HOJE-33, HOJE-34, HOJE-72

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Título `5 tarefas · 4h 58min estimadas` com os dados de exemplo do mockup
- [x] `Não cabe no dia: sobram 18min de tarefa` com a parte listrada; `Cabe no dia: 40min livre` quando cabe; `2 sem estimativa, contadas como 0`
- [x] `13:00 · passou há 1h 20min` às 14:20; `há 3 dias` com `days_late` 3
- [x] Clique abre o `TaskDialog` da tarefa
- [x] Vazio: `Nada pendente para hoje`, sem capacidade; sem listas ativas, o link `Criar lista` (HOJE-72)
- [x] Gate check passes: `npm --prefix frontend test`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): show the pending tasks and whether they fit the day`

---

### T10: Card `Feito hoje`

**What**: Criar `DoneCard` com o total no título, as tarefas com `<tempo> de <estimativa>` e selo, e o vazio.
**Where**: `frontend/src/components/today/done-card.tsx`
**Depends on**: T9
**Reuses**: `TaskTile` (`done`), `TaskDialog`
**Requirement**: HOJE-35, HOJE-36, HOJE-37, HOJE-38, HOJE-39

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Título soma o tempo das sessões de hoje do leitor nessas tarefas: `3h 22min em 4 tarefas`
- [x] Selos `No prazo`, `5min antes` (verde) e `40min depois` (vermelho); sem estimativa, só o tempo e nenhum selo
- [x] Vazio: `Nada concluído hoje ainda`
- [x] Gate check passes: `npm --prefix frontend test`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): show the tasks completed today`

---

### T11: Card `Agora` com sessão aberta

**What**: Criar `NowCard` com os estados `focus`, `extend`, `break` e `elsewhere`, o link `Abrir foco`, o título como link, as ações do `useFocus` e o tratamento de erro.
**Where**: `frontend/src/components/today/now-card.tsx`
**Depends on**: T10
**Reuses**: `useFocus().actions`, `deriveDisplay`, `BreakPicker`, `extractApiError`
**Requirement**: HOJE-07, HOJE-08, HOJE-09, HOJE-10, HOJE-17, HOJE-19, HOJE-20, HOJE-21, HOJE-22, HOJE-74

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `focus`: `32min de 1h 30min`, `faltam 58min · termina às 15:18`, `Concluir`, `Pausar`, `Intervalo`; sem estimativa, só o decorrido
- [x] `Concluir`, `Pausar` e a escolha do `Intervalo` chamam a ação certa do `useFocus` (com a lista da sessão no intervalo)
- [x] `extend`: `Estimativa esgotada`, `Estender` e `Concluir`
- [x] `break`: `Agora · intervalo`, nome, tempo restante e `Encerrar intervalo`
- [x] `elsewhere`: `Em foco em outro workspace: <nome>` sem botões
- [x] `Abrir foco` e o título levam a `/focus/<lista da sessão>`
- [x] `viewer` não vê nenhum botão de ação; um conflito do servidor vira toast
- [x] Gate check passes: `npm --prefix frontend test`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): show the open focus session on the Hoje card`

---

### T12: Seletor de tarefa do card `Agora`

**What**: Criar `TaskPicker`, um popover com busca que lista as tarefas de `Pendente` e devolve a escolhida.
**Where**: `frontend/src/components/today/task-picker.tsx`
**Depends on**: T11
**Reuses**: `TaskTile`, `Popover` de `components/ui`
**Requirement**: HOJE-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Lista as tarefas de `Pendente` na ordem dos grupos; a busca filtra pelo título
- [x] Escolher chama `onPick(task)` e fecha; Esc fecha sem escolher
- [x] Gate check passes: `npm --prefix frontend test`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): pick a pending task to focus on`

---

### T13: Card `Agora` sem sessão aberta

**What**: Somar ao `NowCard` os estados `suggested` e `empty`, o rodapé sem foco, `Começar foco` (levando a tarefa para `Hoje` antes, se preciso), `Outra tarefa` / `Escolher tarefa`, `Planejar hoje` e as regras de destino de `Abrir foco`.
**Where**: `frontend/src/components/today/now-card.tsx` (modify)
**Depends on**: T12
**Reuses**: `suggestedBlock`, `TaskPicker`, `tasks.move`, `useFocus().actions.start`
**Requirement**: HOJE-11, HOJE-12, HOJE-13, HOJE-14, HOJE-16, HOJE-17, HOJE-18

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `suggested`: `Pelo plano, agora seria`, tarefa com borda tracejada na cor fraca da lista, `13:30–15:00`, `começou há 50min`
- [x] `empty`: `Nada planejado para agora`, `5 tarefas`, `4h 58min`, `Escolher tarefa` e `Planejar hoje` (`/planejar/<hoje>`)
- [x] Rodapé `Sem foco há 1h · última sessão: Almoço, até 13:20`; sem sessões, `Nenhuma sessão hoje`
- [x] `Começar foco` numa tarefa de `Esta semana` chama `tasks.move` para o topo de `Hoje` e só então `start`; se o `move` falha, `start` não é chamado e aparece o toast
- [x] `Abrir foco` vai à lista da tarefa sugerida; sem sugerida, à da primeira de `Pendente`; sem nenhuma, some
- [x] Gate check passes: `npm --prefix frontend test`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): suggest the planned task when nothing is in focus`

---

### T14: Página Hoje em `/`

**What**: Criar `TodayPage` em `/`, com o cabeçalho (saudação, dia, hora, tempo até o fim da jornada ou `Jornada encerrada`), `Planejar amanhã`, o card `Agora`, `Pendente` e `Feito hoje`; o item `Hoje` no topo da barra lateral; a faixa `Não foi possível atualizar`; e a releitura do dia quando a sessão ou a tarefa do foco mudam.
**Where**: `frontend/src/pages/today.tsx`
**Depends on**: T13
**Reuses**: `PageHeader`, `greetingFor`, `tomorrowPath`, `useToday`, `useNowMinute`, `useFocus`
**Requirement**: HOJE-01, HOJE-03, HOJE-04, HOJE-05, HOJE-06, HOJE-71, HOJE-73

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `/` mostra o dashboard e a barra lateral tem `Hoje` como primeiro item, marcado
- [x] Cabeçalho `Terça, 11 de novembro · 14:20 · 4h 40min até o fim do dia (19:00)`; depois do fim, `Jornada encerrada às 19:00`
- [x] `Planejar amanhã` abre `/planejar/<amanhã>`
- [x] Concluir pelo card invalida o dia e a tarefa passa para `Feito hoje` sem esperar 60 s
- [x] Erro de leitura mostra a faixa com `Tentar de novo` e mantém os cards
- [x] Gate check passes: Build

**Tests**: unit
**Gate**: build

**Commit**: `feat(frontend): open the app on the Hoje dashboard`

---

### T15: `readToday` com amanhã

**What**: Somar a `readToday` os campos `tomorrow_tasks` (não concluídas com `scheduled_on` igual a amanhã, as com hora primeiro), `tomorrow_plan_blocks` e `week_unscheduled`.
**Where**: `backend-node/src/services/today.ts` (modify)
**Depends on**: None (fases anteriores)
**Reuses**: `listPlanned`
**Requirement**: HOJE-54, HOJE-55, HOJE-56

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tarefa agendada para amanhã às 10:00 vem com `scheduled_minute` 600; a de depois de amanhã e a concluída ficam de fora
- [x] Ordem: com hora, por hora; depois as sem hora
- [x] `series` verdadeiro para ocorrência de série
- [x] `week_unscheduled` conta só `Esta semana` sem dia e não concluídas; `tomorrow_plan_blocks` conta os blocos do plano de amanhã do leitor, não os de outro membro (L-048)
- [x] Gate check passes: `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test`

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): add tomorrow to the day read`

---

### T16: Contas de aderência, trocas e escala

**What**: Somar a `rules.ts` as funções `adherence`, `switches` e `timelineRange`.
**Where**: `frontend/src/lib/today/rules.ts` (modify)
**Depends on**: T15
**Reuses**: nenhum
**Requirement**: HOJE-43, HOJE-52, HOJE-53

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Bloco 13:30–15:00 e sessão da mesma tarefa 13:48–14:20, às 14:20: aderência 64% (32/50); sessão de outra tarefa no mesmo horário não conta; sem blocos até agora, `null`
- [x] Sessões A, B, A e um intervalo: 2 trocas
- [x] Jornada 09:00–18:00 com sessão 08:40 e bloco até 18:30: escala de 08h a 19h
- [x] Gate check passes: `npm --prefix frontend test`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): measure plan adherence and task switches`

---

### T17: `Plano × real`

**What**: Criar `PlanVsReal` com as duas faixas, a escala, os estilos de bloco e sessão, a linha `agora`, as dicas, o vazio sem plano e a rolagem horizontal, e pô-lo na página.
**Where**: `frontend/src/components/today/plan-vs-real.tsx`
**Depends on**: T16
**Reuses**: `timelineRange`, estilos de `components/plan/plan-block.tsx`
**Requirement**: HOJE-42, HOJE-43, HOJE-44, HOJE-45, HOJE-46, HOJE-47, HOJE-48

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Bloco de tarefa tracejado, sessão sólida com texto branco, pausa cinza; a posição em `%` bate com a escala
- [x] Sessão aberta vai até agora; a linha `agora` fica no minuto certo
- [x] Passar o mouse mostra título e horário
- [x] Sem plano: `Sem plano para hoje` com link para `/planejar/<hoje>`
- [x] O conteúdo tem largura mínima dentro de um contêiner com `overflow-x: auto`
- [x] Gate check passes: `npm --prefix frontend test`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): compare the plan with the sessions of today`

---

### T18: Números do dia

**What**: Criar `DayStats` com `Tempo focado`, `Concluídas`, `Aderência ao plano` e `Trocas de tarefa`, e pô-lo ao lado do card `Agora`.
**Where**: `frontend/src/components/today/day-stats.tsx`
**Depends on**: T17
**Reuses**: `adherence`, `switches`, `formatDuration`
**Requirement**: HOJE-49, HOJE-50, HOJE-51, HOJE-52, HOJE-53

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `Tempo focado` soma sessões de tarefa com a aberta até agora, e `intervalos` à parte
- [x] `4 de 9 no plano` com um segmento por tarefa planejada (verde feita, índigo em foco, cinza); sem plano, `sem plano hoje`
- [x] Aderência `—` com `sem blocos até agora`
- [x] Trocas e a duração média das sessões de tarefa
- [x] Gate check passes: `npm --prefix frontend test`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): show the numbers of the day`

---

### T19: Card `Amanhã`

**What**: Criar `TomorrowCard` com o dia por extenso, as tarefas, a linha tracejada de `Esta semana`, o rodapé do plano e o vazio, e pô-lo abaixo de `Feito hoje`.
**Where**: `frontend/src/components/today/tomorrow-card.tsx`
**Depends on**: T18
**Reuses**: `TaskTile` (`pending`, `ghost`), `tomorrowPath`
**Requirement**: HOJE-54, HOJE-55, HOJE-56, HOJE-57

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `quarta, 12 de novembro`; `FIAP · 10:00 · agendada` e `Frete · 09:30 · recorrente`
- [x] `3 tarefas em Esta semana sem dia` tracejada
- [x] `Amanhã ainda não tem plano` ou `Plano de amanhã: 4 blocos`, e `Planejar amanhã`
- [x] Vazio: `Nada marcado para amanhã`
- [x] Gate check passes: `npm --prefix frontend test`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): show what is already set for tomorrow`

---

### T20: `closeDay`

**What**: Criar `closeDay(db, actor, moves, now)`: numa transação, `settle`, pausar a sessão de tarefa aberta, validar as tarefas e aplicar os destinos (`tomorrow`: `this_week` + `scheduled_on` amanhã sem hora; `this_week`: sem dia; `backlog`: sem dia), passando o `tx` a `moveTask` e `setSchedule`; devolver `readToday`.
**Where**: `backend-node/src/services/today.ts` (modify)
**Depends on**: None (fases anteriores)
**Reuses**: `settle`, caminho de pausa do `pauseFocus`, `moveTask`, `setSchedule`
**Requirement**: HOJE-61, HOJE-62, HOJE-65

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Os três destinos deixam cada tarefa na coluna e no dia esperados; no dia seguinte, a de `tomorrow` volta para `Hoje` na leitura
- [x] Com sessão de tarefa aberta, ela termina com `end_reason = 'pause'` antes de mover
- [x] Três movimentos com o terceiro numa tarefa concluída: 422 `close_task_not_pending` e as duas primeiras continuam onde estavam
- [x] Tarefa de outro workspace: 422 e nada se move
- [x] Repetir o mesmo fechamento deixa tudo igual
- [x] Gate check passes: `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test`

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): close the day by moving the pending tasks`

---

### T21: Rota `POST /api/today/close`

**What**: Somar `POST /api/today/close` a `routes/today.ts`, com o corpo validado (0 a 500 movimentos, `to` em três valores, sem `task_id` repetido), `writing` no `preValidation` e a rota na lista fechada a tokens.
**Where**: `backend-node/src/routes/today.ts` (modify)
**Depends on**: T20
**Reuses**: `closeDay`
**Requirement**: HOJE-61, HOJE-67

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Owner recebe 200 com o dia novo; `viewer` recebe 403; token recebe 403
- [x] `to` inválido, `task_id` repetido e 501 itens recebem 422
- [x] Gate check passes: `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test`

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): accept the close of the day at POST /api/today/close`

---

### T22: Resumo do dia em Markdown

**What**: Criar `summaryMarkdown(input)`, que monta o título com o workspace e a data, os números, `### Feito` e `### Ficou para depois`, e a nota no fim.
**Where**: `frontend/src/lib/today/summary.ts`
**Depends on**: T21
**Reuses**: `formatDuration`
**Requirement**: HOJE-63

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Saída exata para o exemplo do mockup (snapshot em texto)
- [x] Sem feitas, `### Feito` diz `- nada concluído`; sem nota, nada depois de `### Ficou para depois`
- [x] Gate check passes: `npm --prefix frontend test`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): write the summary of the day in Markdown`

---

### T23: Diálogo `Fechar o dia`

**What**: Criar `CloseDayDialog` (números, tempo por lista, pendências com destino, `Adiada N dias seguidos`, nota, `Copiar ao fechar`, erros) e o botão `Fechar o dia` no cabeçalho do Hoje, escondido para `viewer`.
**Where**: `frontend/src/components/today/close-day-dialog.tsx`
**Depends on**: T22
**Reuses**: `Dialog` de `components/ui`, `summaryMarkdown`, `today.close`
**Requirement**: HOJE-41, HOJE-58, HOJE-59, HOJE-60, HOJE-63, HOJE-64, HOJE-65, HOJE-66, HOJE-67

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Números `Focado`, `Concluídas`, `Aderência ao plano`, `No prazo`; barra por lista com legenda
- [x] Cada pendência e a tarefa em foco começam em `Amanhã`; `Adiada 4 dias seguidos` com `days_late` 4, e nada com 2
- [x] Confirmar envia os movimentos escolhidos, copia o resumo e mostra `Resumo copiado`
- [x] Erro da API mantém o diálogo aberto com as escolhas; cópia recusada fecha o dia e mostra `Não foi possível copiar o resumo` com `Copiar de novo`
- [x] `viewer` não vê o botão
- [x] Gate check passes: Build

**Tests**: unit
**Gate**: build

**Commit**: `feat(frontend): close the day from the Hoje header`

---

### T24: Recorrente só vai para amanhã ao fechar o dia

**What**: Somar `series` a cada tarefa de `pending` em `readToday` e fazer `closeDay` recusar `this_week` ou `backlog` para uma ocorrência de série com 422 `close_series_needs_tomorrow`, antes de qualquer movimento.
**Where**: `backend-node/src/services/today.ts` (modify)
**Depends on**: None (fases anteriores)
**Reuses**: `closeDay`, `readToday`
**Requirement**: HOJE-75

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `pending[].series` verdadeiro para ocorrência de série e falso para tarefa comum
- [x] `this_week` e `backlog` para uma ocorrência de série: 422 `close_series_needs_tomorrow`, nenhuma tarefa movida e a série continua aberta (`task_series.ended_at` nulo); um teste para cada destino (L-044)
- [x] `tomorrow` para a mesma ocorrência continua funcionando e a série continua aberta
- [x] Gate check passes: `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test`

**Tests**: integration
**Gate**: full

**Commit**: `fix(backend): keep a series open when the day is closed`

---

### T25: Atomicidade do fechamento provada

**What**: Escrever o teste que força uma falha no meio dos movimentos de `closeDay` (por exemplo, `vi.spyOn` em `setSchedule` ou `moveTask` lançando no terceiro movimento) e prova que os dois primeiros não ficam gravados.
**Where**: `backend-node/test/services/today.test.ts` (modify)
**Depends on**: T24
**Reuses**: fixtures do próprio arquivo
**Requirement**: HOJE-61, HOJE-65

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Com três movimentos válidos e uma falha injetada no terceiro, as três tarefas continuam na coluna e no dia de antes e a sessão aberta não foi pausada
- [x] O teste falha se `closeDay` passar `db` em vez do `tx` (conferido localmente trocando e desfazendo; não commitar a troca)
- [x] Gate check passes: `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test`

**Tests**: integration
**Gate**: full

**Commit**: `test(backend): prove the close of the day rolls back a failed move`

---

### T26: Segundos nas sessões do dia

**What**: Somar a cada `DaySession` os instantes `started_at` e `ended_at` (ISO, recortados ao dia; a aberta até `server_now`), mantendo `start_minute` e `end_minute` para a linha do tempo.
**Where**: `backend-node/src/services/today.ts` (modify)
**Depends on**: T25
**Reuses**: o recorte de `clippedSessions`
**Requirement**: HOJE-49

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Sessões que começam e terminam no meio do minuto (ex.: 09:00:40–09:30:20 e 10:10:50–10:40:10) somadas em segundos dão o mesmo total, truncado uma vez, que `/api/reports/overview` de hoje
- [x] O schema da rota devolve os campos novos
- [x] Gate check passes: `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test`

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): send the session instants of the day`

---

### T27: `Tempo focado` em segundos

**What**: Fazer `DayStats` e o `Focado` do diálogo somarem os segundos das sessões (a aberta até agora) e truncarem uma vez, usando os campos de T26.
**Where**: `frontend/src/components/today/day-stats.tsx` (modify)
**Depends on**: T26
**Reuses**: `formatDuration`
**Requirement**: HOJE-49

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Duas sessões de 29min 40s e 29min 20s mostram `59min`, não `58min` nem `1h`; o mesmo no `Focado` do `CloseDayDialog`
- [x] Gate check passes: `npm --prefix frontend test`

**Tests**: unit
**Gate**: quick

**Commit**: `fix(frontend): sum the focused time in seconds`

---

### T28: Mensagem da API na fila do foco

**What**: Fazer a fila offline do foco guardar a mensagem de erro da API em cada conflito, e o card `Agora` mostrar essa mensagem no toast de uma ação recusada (tirando o `SPEC_DEVIATION`).
**Where**: `frontend/src/lib/focus/queue.ts` (modify)
**Depends on**: T27
**Reuses**: `extractApiError`
**Requirement**: HOJE-22

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Um conflito guarda `message` com o texto da API; conflitos antigos sem `message` continuam carregando da área de armazenamento
- [x] O toast do card mostra exatamente a mensagem da API de uma ação recusada; sem mensagem, usa o texto genérico de antes
- [x] Os testes existentes do foco continuam passando sem mudança de asserção
- [x] Gate check passes: Build

**Tests**: unit
**Gate**: build

**Commit**: `fix(frontend): keep the API message of a refused focus action`

---

### T29: Destinos da recorrente e `Abrir foco` em outro workspace

**What**: No `CloseDayDialog`, deixar só `Amanhã` habilitado para uma ocorrência de série, com `Esta semana` e `Backlog` desabilitados e a dica `Encerraria a recorrência`; e somar ao teste do `NowCard` a asserção de que `Abrir foco` não aparece no estado `elsewhere`.
**Where**: `frontend/src/components/today/close-day-dialog.tsx` (modify)
**Depends on**: T28
**Reuses**: `pending[].series` de T24
**Requirement**: HOJE-75, HOJE-20

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Ocorrência de série: `Esta semana` e `Backlog` desabilitados com a dica `Encerraria a recorrência`; tarefa comum na mesma lista continua com os três destinos (L-048)
- [ ] Um 422 `close_series_needs_tomorrow` do servidor mantém o diálogo aberto com o erro
- [ ] No estado `elsewhere`, nenhum link `Abrir foco`
- [ ] Gate check passes: Build

**Tests**: unit
**Gate**: build

**Commit**: `fix(frontend): offer only tomorrow to a recurring task when closing the day`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6

Phase 1:  T1 → T2 → T3
Phase 2:  T4 → T5 → T6 → T7
Phase 3:  T8 → T9 → T10 → T11 → T12 → T13 → T14
Phase 4:  T15 → T16 → T17 → T18 → T19
Phase 5:  T20 → T21 → T22 → T23
Phase 6:  T24 → T25 → T26 → T27 → T28 → T29
```

Execution is strictly sequential - there is no intra-phase parallelism.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: `readToday` base | 1 função, 1 arquivo | ✅ Granular |
| T2: `done` | 1 campo da mesma função | ✅ Granular |
| T3: `GET /api/today` | 1 endpoint (registro e lista de tokens acompanham) | ✅ Granular |
| T4: contas por minuto | 3 funções puras coesas, 1 arquivo | ⚠️ OK, coesas |
| T5: `useToday` | 1 hook (tipo e cliente acompanham) | ✅ Granular |
| T6: `useNowMinute` | 1 hook | ✅ Granular |
| T7: `/lists` | 1 página movida (links acompanham) | ✅ Granular |
| T8: `TaskTile` | 1 componente | ✅ Granular |
| T9: `PendingCard` | 1 componente | ✅ Granular |
| T10: `DoneCard` | 1 componente | ✅ Granular |
| T11: `NowCard` com sessão | 1 componente | ✅ Granular |
| T12: `TaskPicker` | 1 componente | ✅ Granular |
| T13: `NowCard` sem sessão | 2 estados do mesmo componente | ✅ Granular |
| T14: `TodayPage` | 1 página | ✅ Granular |
| T15: amanhã no `readToday` | 3 campos da mesma função | ✅ Granular |
| T16: aderência, trocas, escala | 3 funções puras coesas | ⚠️ OK, coesas |
| T17: `PlanVsReal` | 1 componente | ✅ Granular |
| T18: `DayStats` | 1 componente | ✅ Granular |
| T19: `TomorrowCard` | 1 componente | ✅ Granular |
| T20: `closeDay` | 1 função | ✅ Granular |
| T21: `POST /api/today/close` | 1 endpoint | ✅ Granular |
| T22: `summaryMarkdown` | 1 função | ✅ Granular |
| T23: `CloseDayDialog` | 1 componente (botão no cabeçalho acompanha) | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | início da Phase 1 | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | None | início da Phase 2 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |
| T8 | None | início da Phase 3 (após T7) | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |
| T10 | T9 | T9 → T10 | ✅ Match |
| T11 | T10 | T10 → T11 | ✅ Match |
| T12 | T11 | T11 → T12 | ✅ Match |
| T13 | T12 | T12 → T13 | ✅ Match |
| T14 | T13 | T13 → T14 | ✅ Match |
| T15 | None | início da Phase 4 (após T14) | ✅ Match |
| T16 | T15 | T15 → T16 | ✅ Match |
| T17 | T16 | T16 → T17 | ✅ Match |
| T18 | T17 | T17 → T18 | ✅ Match |
| T19 | T18 | T18 → T19 | ✅ Match |
| T20 | None | início da Phase 5 (após T19) | ✅ Match |
| T21 | T20 | T20 → T21 | ✅ Match |
| T22 | T21 | T21 → T22 | ✅ Match |
| T23 | T22 | T22 → T23 | ✅ Match |
| T24 | None | início da Phase 6 (após T23) | ✅ Match |
| T25 | T24 | T24 → T25 | ✅ Match |
| T26 | T25 | T25 → T26 | ✅ Match |
| T27 | T26 | T26 → T27 | ✅ Match |
| T28 | T27 | T27 → T28 | ✅ Match |
| T29 | T28 | T28 → T29 | ✅ Match |

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1, T2, T15, T20, T24, T25, T26 | Serviços do backend | integration | integration | ✅ OK |
| T3, T21 | Rotas do backend | integration | integration | ✅ OK |
| T4, T5, T6, T16, T22, T28 | Funções puras e hooks do frontend | unit | unit | ✅ OK |
| T7, T8, T9, T10, T11, T12, T13, T14, T17, T18, T19, T23, T27, T29 | Componentes e páginas do frontend | unit | unit | ✅ OK |

---

## Requirement Coverage

Todos os 74 requisitos têm tarefa: HOJE-01 (T14), 02 (T7), 03–06 (T14; 06 também T1, T3), 07–10 (T11), 11 (T4, T13), 12–14 (T13), 15 (T12), 16 (T13), 17 (T11, T13), 18 (T13), 19–22 (T11), 23 (T1, T9), 24 (T8), 25 (T1, T4), 26 (T4, T9), 27 (T8, T9), 28 (T1, T9), 29–32 (T4, T9), 33–34 (T9), 35–36 (T2, T10), 37 (T8, T10), 38 (T2, T10), 39 (T10), 40 (T2), 41 (T23), 42 (T17), 43 (T16, T17), 44–48 (T17), 49–51 (T18), 52–53 (T16, T18), 54–56 (T15, T19), 57 (T19), 58–60 (T23), 61 (T20, T21), 62 (T20), 63 (T22, T23), 64 (T23), 65 (T20, T23), 66 (T23), 67 (T21, T23), 68–69 (T1), 70 (T6), 71 (T5, T14), 72 (T9), 73 (T5, T14), 74 (T11).
