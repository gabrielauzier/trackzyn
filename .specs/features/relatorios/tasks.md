# Relatórios Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/relatorios/design.md`
**Status**: Draft
**Pré-requisito**: `foco-e-sons` concluída (usa `focus_sessions` e `focus-settle.ts`).

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `CONTRIBUTING.md`, `backend-node/vitest.config.ts` (60% de linhas), `.github/workflows/ci.yml`. Onde os guias não definem profundidade, valem os padrões fortes da skill.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Serviços do backend | integration (PGlite) | Todos os ramos; 1:1 com os ACs; meia-noite, horário de verão (`America/New_York`), sessão aberta, empates | `backend-node/test/services/*.test.ts` | `npm --prefix backend-node test` |
| Rotas do backend | integration (`app.inject`) | Feliz + 422 de período + 404 de lista + só os dados do usuário | `backend-node/test/routes/*.test.ts` | `npm --prefix backend-node test` |
| Funções puras do frontend | unit | Todos os ramos | `frontend/src/**/*.test.ts` | `npm --prefix frontend test` |
| Componentes e páginas | unit (Testing Library) | Cada AC visível, estados vazios e de erro | `frontend/src/**/*.test.tsx` | `npm --prefix frontend test` |
| Cliente HTTP e tipos | none | build gate (typecheck) | - | `npm --prefix frontend run typecheck` |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Tasks com testes de unidade do frontend | `npm --prefix frontend test` |
| Full | Tasks do backend e a página | `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test -- --coverage` (backend) ou `npm --prefix frontend run lint && npm --prefix frontend run typecheck && npm --prefix frontend test` (frontend) |
| Build | Fim de cada fase e tasks de tipos | os dois Full acima + `npm --prefix frontend run build` |

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Consultas

```
T16 → T1 → T2 → T4
T1 → T3 → T4
```

### Phase 2: Componentes

```
T6 → T7
T6 → T10
T5
T8
T9
T11
T12
T13
```

### Phase 3: Página e PDF

```
T14 → T15
```

---

## Task Breakdown

### Phase 1: Consultas

#### T16: Gravar quem concluiu a tarefa

**What**: Adicionar `tasks.completed_by_user_id` (fk `users.id` `ON DELETE SET NULL`, CHECK que só permite valor em `done`) com uma migration nova, gravá-lo em toda conclusão (`move` para `done` no quadro e `complete` do foco) com o usuário da requisição, e limpá-lo quando a tarefa sai de `done`; atualizar as provas de `test/db/` e regenerar `pg-columns.json` num Postgres 16, como nas features anteriores.
**Where**: `backend-node/src/services/tasks.ts`
**Depends on**: None
**Reuses**: `move` de `services/tasks.ts`, `complete` de `services/focus.ts`, migrations de `listas-e-quadro` T1
**Requirement**: REPORT-09

**Tools**:

- MCP: NONE
- Skill: `supabase-postgres-best-practices`

**Done when**:

- [x] Concluir pelo quadro e pelo foco grava o id de quem fez a requisição; arrastar de volta limpa
- [x] Excluir o usuário deixa a coluna nula; a CHECK recusa valor fora de `done`
- [x] Tarefas já concluídas antes da migration ficam com a coluna nula
- [x] Gate check passes: Full (backend)
- [x] Test count: a contagem do backend só aumenta

**Status**: ✅ Done

**Nota**: A coluna também é gravada ao criar uma tarefa direto em `done` (`POST /api/tasks`), porque isso também é uma conclusão. `moveTask` recebe `byUserId` no alvo e `createTask` recebe `userId`, ambos obrigatórios; os testes que já chamavam essas funções passaram a informar o usuário. Reordenar dentro de `done` mantém quem concluiu.

**Tests**: integration
**Gate**: full

**Commit**: `feat(api): record who completed a task`

---

#### T1: Visão geral no SQL

**What**: `overview(tx, user, workspace, {from, to, listId}, now)`: liquida, fatia as sessões por dia e por hora no fuso do dia e devolve `tiles`, `daily`, `productive` (todos os empatados), `by_list` (com arquivadas) e `break_seconds`.
**Where**: `backend-node/src/services/reports.ts`
**Depends on**: T16
**Reuses**: `focus-settle.ts`, `services/day.ts`
**Requirement**: REPORT-02, REPORT-03, REPORT-04, REPORT-05, REPORT-06, REPORT-07, REPORT-08, REPORT-09, REPORT-10, REPORT-11, REPORT-12

**Tools**:

- MCP: NONE
- Skill: `supabase-postgres-best-practices`

**Done when**:

- [x] Teste do cenário de REPORT-02 (2 dias, `3h 30min`, `1h 45min`); sem conclusões → média `null`
- [x] Sessão 23:30–00:30 conta 30 min em cada dia; sessão aberta conta até `now`; sessões de outro usuário não entram; dia de mudança de horário em `America/New_York` soma certo
- [x] Empate de segunda e quarta devolve as duas; período sem sessões devolve zeros
- [x] 10 000 sessões num período de 366 dias respondem em menos de 2 s no PGlite
- [x] Gate check passes: Full (backend)
- [x] Test count: a contagem do backend só aumenta

**Status**: ✅ Done

**Nota**: As sessões são cortadas em cada hora do fuso (`generate_series` LATERAL a partir de `date_trunc('hour', início, fuso)`), e o dia, a hora, o dia da semana (ISO, 1 = segunda) e o mês (`YYYY-MM`) saem do início local de cada hora. Os segundos são truncados por grupo, e `task_seconds` é a soma dos dias. A média é arredondada para o segundo. Com filtro, os intervalos também são filtrados pela lista, e um `list_id` fora do workspace responde 404 no serviço. O teste de 10 000 sessões em 366 dias mediu de 59 a 68 ms no PGlite.

**Tests**: integration
**Gate**: full

**Commit**: `feat(api): compute the reports overview`

---

#### T2: Antes, no prazo e depois

**What**: `done` em `overview`: tarefas concluídas no período por dia, com o tempo total da tarefa, `verdict` pela tolerância de 5% e as porcentagens entre as que têm estimativa (vermelho = 100 − verde).
**Where**: `backend-node/src/services/reports.ts`
**Depends on**: T1
**Reuses**: `spentSeconds` de `focus-settle.ts`
**Requirement**: REPORT-14, REPORT-15, REPORT-16, REPORT-17, REPORT-18, REPORT-19

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Estimativa de 60 min com gastos de 50, 58, 63 e 80 min e uma sem estimativa → `early` (−10 min), `on_time`, `on_time`, `late` (+20 min), sem selo; 75% e 25%
- [x] 5 verdes e 6 vermelhos → `45.45` e `54.55`; tarefa concluída no período com tempo de antes usa o tempo total
- [x] Gate check passes: Full (backend)
- [x] Test count: a contagem do backend só aumenta

**Status**: ✅ Done

**Nota**: Os limites de 5% são inclusivos: com estimativa de 60 min, 57:00 e 63:00 ficam `on_time`, e 56:59 e 63:01 não. Dentro do dia, as tarefas vêm da conclusão mais recente para a mais antiga. Sem estimativa, `diff_seconds` é 0. O tempo do selo vem de `spentSeconds`, que soma todos os membros e todo o histórico da tarefa até `now`.

**Tests**: integration
**Gate**: full

**Commit**: `feat(api): compare done tasks with their estimates`

---

#### T3: Lista de sessões

**What**: `sessionsReport(tx, user, workspace, {from, to, listId}, now)`: sessões por dia com início, fim (nulo se aberta), tarefa ou intervalo, lista e duração.
**Where**: `backend-node/src/services/reports-sessions.ts`
**Depends on**: T1
**Reuses**: liquidação e fuso de T1
**Requirement**: REPORT-20, REPORT-21, REPORT-22

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Testes: 3 sessões e 1 intervalo em 2 dias agrupados; sessão aberta com `ended_at` nulo; período vazio → `days` vazio
- [x] Gate check passes: Full (backend)
- [x] Test count: a contagem do backend só aumenta

**Status**: ✅ Done

**Nota**: Uma sessão entra no dia local em que começa dentro do período (uma sessão que atravessa a meia-noite aparece uma vez, no dia do início). `seconds` é só a parte dentro do período. `started_at` e `ended_at` são os horários reais. Os dias e as sessões vêm do mais recente para o mais antigo. A liquidação, os limites e o filtro de lista são os mesmos da visão geral (`reportScope` e `clippedSessions`).

**Tests**: integration
**Gate**: full

**Commit**: `feat(api): list focus sessions for reports`

---

#### T4: Rotas de relatórios

**What**: `GET /api/reports/overview` e `GET /api/reports/sessions` com `from`, `to` e `list_id`, registradas em `src/app.ts`.
**Where**: `backend-node/src/routes/reports.ts`
**Depends on**: T2, T3
**Reuses**: `routes/files.ts`
**Requirement**: REPORT-01, REPORT-07, REPORT-09, REPORT-13

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Testes: `from` depois de `to` → 422; período de 367 dias → 422 e de 366 → 200; `list_id` de outro workspace → 404; um `viewer` lê o próprio relatório
- [x] Gate check passes: Build
- [x] Test count: a contagem do backend só aumenta

**Status**: ✅ Done

**Nota**: `from` e `to` são obrigatórios (`YYYY-MM-DD`); o período padrão da REPORT-01 fica com o cliente (T6). O 422 de período vem no formato das outras validações, em `loc: ['query', 'to']`. Os testes de limite (invertido, 367 e 366 dias) rodam nas duas rotas. As rotas usam o padrão de `routes/board.ts` (só leitura), não o de `files.ts`.

**Tests**: integration
**Gate**: build

**Commit**: `feat(api): add the reports routes`

---

### Phase 2: Componentes

#### T5: Cliente HTTP e tipos de relatórios

**What**: Funções de relatórios em `lib/api.ts` e os tipos `Overview` e `SessionsReport`.
**Where**: `frontend/src/lib/api.ts`
**Depends on**: T4
**Reuses**: instância axios
**Requirement**: REPORT-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tipos batem com as respostas
- [x] Gate check passes: Build
- [x] Test count: a contagem do frontend não diminui

**Status**: ✅ Done

**Nota**: Os tipos ficam em `src/types/index.ts`, junto dos outros. `reports.overview` e `reports.sessions` recebem `{ from, to, list_id? }`; sem lista, a query não leva `list_id`. Pela L-007, `api.test.ts` confere as duas requisições no nível HTTP.

**Tests**: none
**Gate**: build

**Commit**: `feat(web): add the reports api client`

---

#### T6: Período padrão e textos de produtividade

**What**: `defaultRange(timezone, now)` (da segunda corrente até hoje) e `formatProductive(values, kind, locale)` (`18–19h`, `Segunda e quarta`, `out. de 2026`).
**Where**: `frontend/src/lib/reports.ts`
**Depends on**: None
**Reuses**: `lib/date-fns-locale.ts`
**Requirement**: REPORT-01, REPORT-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Testes: num domingo, o período começa na segunda anterior; numa segunda, começa e termina no mesmo dia; 1, 2 e 3 valores empatados
- [x] Gate check passes: Quick
- [x] Test count: a contagem do frontend só aumenta

**Status**: ✅ Done

**Nota**: O "hoje" vem de `todayInTimezone` com o fuso do workspace, e `now` tem valor padrão (testado com relógio falso, L-008). Os empates são unidos com `Intl.ListFormat` (`Segunda, quarta e sexta`). Escolhas onde a spec é omissa: a faixa das 23h é `23–24h`; em inglês a hora segue o print (`6–7 PM`, `11 AM–12 PM`) e o dia vem por extenso (`Monday and Wednesday`); o mês segue o `Intl` (`out. de 2026`, `Oct 2026`) e só o dia da semana ganha maiúscula. Sem valores, `—`.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): add report range and labels`

---

#### T7: Filtros

**What**: Filtro de lista (`Todas as listas` + listas com o rótulo `arquivada`) e período; 422 mantém o filtro anterior com a mensagem; 404 de lista excluída mostra "A lista foi excluída." e volta para `Todas as listas`.
**Where**: `frontend/src/components/reports/report-filters.tsx`
**Depends on**: T6
**Reuses**: `ui/select`, `ui/date-range-picker`, `list-badge`
**Requirement**: REPORT-07, REPORT-08, REPORT-13

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Testes: lista arquivada aparece rotulada; 422 mantém o período anterior; 404 volta para `Todas as listas` com o aviso
- [x] Gate check passes: Quick
- [x] Test count: a contagem do frontend só aumenta

**Status**: ✅ Done

**Nota**: O estado do filtro fica no hook `use-report-filter.ts` (ao lado do componente, para não misturar hook e componente no mesmo arquivo). `run` envolve a consulta: a resposta aceita vira o último filtro válido; um 422 devolve esse filtro com a mensagem "O período precisa terminar depois do início e ter no máximo 366 dias."; um 404 com lista volta para `Todas as listas` com "A lista foi excluída.". O aviso aparece como `role="alert"` abaixo dos filtros e some na próxima troca. Sem o fuso do workspace, o período inicial usa o dia do navegador.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): add the report filters`

---

#### T8: Cartões de resumo

**What**: `Dias trabalhados`, `Tarefas concluídas`, `Tempo trabalhado`, `Média por tarefa` (com `—` sem conclusões).
**Where**: `frontend/src/components/reports/overview-tiles.tsx`
**Depends on**: None
**Reuses**: `charts/stat-tile.tsx`, `format-duration`
**Requirement**: REPORT-01, REPORT-02, REPORT-03, REPORT-12

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Testes: valores do cenário de REPORT-02; média `null` mostra `—`
- [x] Gate check passes: Quick
- [x] Test count: a contagem do frontend só aumenta

**Status**: ✅ Done

**Nota**: Cada `StatTile` fica num `role="group"` com o nome do cartão, para o teste ler o valor de cada um. Os tempos usam `formatDuration` (`3h 30min` em pt-BR, `3hr 30min` em inglês).

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): add the report tiles`

---

#### T9: Gráfico por dia

**What**: `BarChart` com `Tarefas`, `Intervalos` e `Total` por dia; sem atividade, `Sem atividade no período`.
**Where**: `frontend/src/components/reports/daily-chart.tsx`
**Depends on**: None
**Reuses**: `charts/bar-chart.tsx`
**Requirement**: REPORT-04, REPORT-12

**Tools**:

- MCP: NONE
- Skill: `dataviz`

**Done when**:

- [x] Testes: três séries com os rótulos certos; `Total` = tarefas + intervalos; vazio mostra o texto
- [x] Gate check passes: Quick
- [x] Test count: a contagem do frontend só aumenta

**Status**: ✅ Done

**Nota**: O gráfico usa o `BarChart` agrupado (não empilhado, como no print) com a paleta padrão, e os valores em horas para o eixo ter marcas redondas; o tooltip e o eixo mostram `formatDuration`. Uma tabela visível só para leitores de tela (`Tempo por dia`) repete os números, como pede a skill `dataviz`, e é por ela que o teste confere `Total` = tarefas + intervalos. Um dia com só intervalo conta como atividade, porque intervalo também é sessão (REPORT-12). O dia aparece como `seg., 19 de out.`.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): add the daily report chart`

---

#### T10: Cartões de produtividade

**What**: `Hora mais produtiva`, `Dia mais produtivo`, `Mês mais produtivo` com `formatProductive`; sem atividade, `—`.
**Where**: `frontend/src/components/reports/productive-cards.tsx`
**Depends on**: T6
**Reuses**: `ui/card`
**Requirement**: REPORT-05, REPORT-12

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Testes: hora 18 mostra `18–19h`; dias 1 e 3 mostram `Segunda e quarta`
- [x] Gate check passes: Quick
- [x] Test count: a contagem do frontend só aumenta

**Status**: ✅ Done

**Nota**: A spec e a task divergem no estado vazio: a REPORT-12 pede `Sem atividade no período` nos mais produtivos, e a task pede `—`. Os dois aparecem: cada cartão mostra `—`, e a linha abaixo dos cartões diz `Sem atividade no período`.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): add the productivity cards`

---

#### T11: Tempo por lista

**What**: `DonutChart` com uma fatia por lista e uma de `Intervalos`, legenda com tempo e porcentagem e cabeçalho `N listas, Tempo total: X`.
**Where**: `frontend/src/components/reports/time-by-list.tsx`
**Depends on**: None
**Reuses**: `charts/donut-chart.tsx`
**Requirement**: REPORT-06

**Tools**:

- MCP: NONE
- Skill: `dataviz`

**Done when**:

- [x] Testes: uma lista com 16h 52min e 10min de intervalo → cabeçalho `1 lista, Tempo total: 17h 2min` e fatias de 99% e 1%; duas listas → `2 listas`; porcentagens somam 100
- [x] Gate check passes: Quick
- [x] Test count: a contagem do frontend só aumenta

**Status**: ✅ Done

**Nota**: O `DonutChart` arredondava cada fatia sozinha, e três fatias iguais davam 99%. Ganhou a prop opcional `shares` (porcentagens inteiras em ordem); o relatório as calcula pelo maior resto, e as porcentagens somam 100. Cada lista usa a própria cor (`--chart-N`) e `Intervalos` usa o cinza `--muted-foreground`. Escolhas onde a spec é omissa: a fatia `Intervalos` aparece mesmo com 0min, e só com intervalos o cabeçalho diz `0 listas, Tempo total: 10min`. Sem sessão, `Sem atividade no período` no lugar da rosca.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): add time by list`

---

#### T12: Tarefas antes ou depois da estimativa

**What**: Tarefas concluídas por dia com o selo verde (`antes`, `No prazo`) ou vermelho (`depois`), sem selo sem estimativa, e o cabeçalho com as duas porcentagens e a barra.
**Where**: `frontend/src/components/reports/done-vs-estimate.tsx`
**Depends on**: None
**Reuses**: `ui/badge`, `format-duration`
**Requirement**: REPORT-14, REPORT-15, REPORT-16, REPORT-17, REPORT-18, REPORT-19

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Testes: os 4 selos do cenário de T2; `45,45%` e `54,55%` em pt-BR; sem tarefas com estimativa a barra some
- [x] Gate check passes: Quick
- [x] Test count: a contagem do frontend só aumenta

**Status**: ✅ Done

**Nota**: Os selos usam os tons de status (`text-status-good` e `text-status-critical`). A diferença do selo é `formatDuration(|diff_seconds|)`. As porcentagens usam `Intl.NumberFormat` com até 2 casas (`45,45%`, `75%`), e a barra é um `role="img"` com as duas partes na largura de cada porcentagem. Escolhas onde a spec é omissa: o dia aparece como `22 de out. de 2026`; a linha não mostra o selo da lista, porque `done` traz só o `list_id`; sem tarefas concluídas no período, aparece "Nenhuma tarefa concluída no período".

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): compare done tasks with estimates`

---

#### T13: Tabela de sessões

**What**: Sessões por dia com início, fim (ou `em andamento`), tarefa ou `Intervalo`, lista e duração; vazio mostra `Sem atividade no período`.
**Where**: `frontend/src/components/reports/sessions-table.tsx`
**Depends on**: None
**Reuses**: `ui/table`
**Requirement**: REPORT-20, REPORT-21, REPORT-22

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Testes: sessão aberta mostra `em andamento`; intervalo mostra `Intervalo`; vazio mostra o texto
- [x] Gate check passes: Quick
- [x] Test count: a contagem do frontend só aumenta

**Status**: ✅ Done

**Nota**: Uma tabela por dia, nomeada pelo título do dia (`22 de out. de 2026`), na ordem da resposta. Início e fim aparecem em `HH:mm` no fuso do relatório (prop `timezone`, que a página tira de `Overview.timezone` ou do workspace). A duração é só a parte dentro do período, como a API manda.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): add the sessions table`

---

### Phase 3: Página e PDF

#### T14: Página de relatórios

**What**: `/reports` com as abas `Visão geral` e `Sessões`, os filtros e os componentes; entrada `Relatórios` em `nav-items.ts`; rota em `App.tsx`.
**Where**: `frontend/src/pages/reports.tsx`
**Depends on**: T5, T7, T8, T9, T10, T11, T12, T13
**Reuses**: `ui/tabs`, `page-header`
**Requirement**: REPORT-01, REPORT-07, REPORT-12, REPORT-20

**Tools**:

- MCP: NONE
- Skill: `react-composition-patterns`

**Done when**:

- [ ] Testes: abrir pede o período da segunda até hoje e `Todas as listas`; trocar a lista refaz a consulta com `list_id`; a aba `Sessões` consulta `/api/reports/sessions`
- [ ] Gate check passes: Full (frontend)
- [ ] Test count: a contagem do frontend só aumenta

**Tests**: unit
**Gate**: full

**Commit**: `feat(web): add the reports page`

---

#### T15: Exportar PDF

**What**: Botão `Exportar PDF` que chama `window.print()`, `print-header` com o período e a lista, e `@media print` que esconde o menu lateral e os controles.
**Where**: `frontend/src/components/reports/print-header.tsx`
**Depends on**: T14
**Reuses**: `index.css`
**Requirement**: REPORT-23

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Testes: o botão chama `window.print`; o cabeçalho de impressão mostra o período e a lista
- [ ] Gate check passes: Build
- [ ] Test count: a contagem do frontend só aumenta

**Tests**: unit
**Gate**: build

**Commit**: `feat(web): export the reports overview to pdf`

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T16 | None | - | ✅ Match |
| T1 | T16 | T16 → T1 | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T1 | T1 → T3 | ✅ Match |
| T4 | T2, T3 | T2 → T4, T3 → T4 | ✅ Match |
| T5 | T4 (fase anterior) | - | ✅ Match |
| T6, T8, T9, T11, T12, T13 | None | - | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |
| T10 | T6 | T6 → T10 | ✅ Match |
| T14 | T5, T7–T13 (fase anterior) | - | ✅ Match |
| T15 | T14 | T14 → T15 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T16, T1–T3 | Serviços do backend | integration | integration | ✅ OK |
| T4 | Rotas do backend | integration | integration | ✅ OK |
| T5 | Cliente HTTP e tipos | none | none | ✅ OK |
| T6 | Funções puras do frontend | unit | unit | ✅ OK |
| T7–T15 | Componentes e páginas | unit | unit | ✅ OK |
