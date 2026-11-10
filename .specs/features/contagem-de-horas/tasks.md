# Contagem de horas Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/contagem-de-horas/design.md`
**Status**: In Progress
**Base**: `main` (`0cfb40d`), issue #42.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `CONTRIBUTING.md` (testes do backend e do frontend antes do PR), `backend-node/vitest.config.ts` (60% de linhas), `frontend/vitest.config.ts`; lições confirmadas L-044 (cada edge case com seu próprio teste) e L-048 (provar o recorte "da própria tarefa" com outra tarefa no mesmo estado); candidatas L-013, L-015, L-016.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Migration e schema | integration (PGlite) | Workspace existente lê `gross`; `CHECK` recusa `liquid`; migration no journal depois de `0015` | `backend-node/test/db/*.test.ts` | `npm --prefix backend-node test` |
| Rotas do workspace | integration (`app.inject`) | Leitura com o campo; `PATCH` `gross`/`net`; ausente mantém; 422 para `null` e `liquid`; 403 de editor e leitor; gestor aceito | `backend-node/test/routes/workspaces.test.ts` | `npm --prefix backend-node test` |
| Serviços de tempo (SQL) | integration (PGlite) | 1:1 com HOURS-15 a 17, 22 a 26 e 32 a 39, nos dois modos; relógio fixo (L-015) | `backend-node/test/services/*.test.ts`, `backend-node/test/routes/reports.test.ts` | `npm --prefix backend-node test` |
| Funções puras do frontend | unit | `measure`, `dayTotal`, `joinNear`, `capacity` nos dois modos; encosta, contida, cadeia, recorte, exclusão | `frontend/src/lib/**/*.test.ts` | `npm --prefix frontend test` |
| Componentes e páginas | unit (Testing Library) | Cada texto visível: opções e estado sem permissão, tooltip do total, aviso de sobreposição, aviso e `Bruto` nos Relatórios, barra do plano | `frontend/src/**/*.test.tsx` | `npm --prefix frontend test` |
| Tipos, cliente HTTP e traduções | unit + build | Uma chamada de `workspacesApi.update` com `hours_count_mode` (L-007); typecheck; chaves nas duas línguas (`i18n.test.ts`) | `frontend/src/lib/api.test.ts` | `npm --prefix frontend run typecheck` |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Tasks só com testes de unidade do frontend | `npm --prefix frontend test` |
| Full | Tasks do backend, e as do frontend que tocam uma página | `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test` (backend) ou `npm --prefix frontend run lint && npm --prefix frontend run typecheck && npm --prefix frontend test` (frontend) |
| Build | Fim de cada fase | os dois Full acima + `npm --prefix frontend run build` |

---

## Execution Plan

Phases run sequentially; tasks within a phase run in order.

### Phase 1: Configuração

```
T1 → T2
```

### Phase 2: Contas no backend e helper

```
T1 → T3
T1 → T4
T5
```

### Phase 3: Telas

```
T2 → T6
T5 → T6
T2 → T7
T5 → T7
T4 → T8
```

---

## Task Breakdown

### T1: Coluna e API do modo de contagem

**What**: Migration `0016_workspace_hours_count_mode.sql`, coluna `hours_count_mode` no schema, campo na leitura e no `PATCH` do workspace.
**Where**: `backend-node/drizzle/0016_workspace_hours_count_mode.sql`, `backend-node/drizzle/meta/`, `backend-node/src/db/schema.ts`, `backend-node/src/routes/workspaces.ts`, `backend-node/src/routes/schemas.ts`
**Depends on**: None
**Reuses**: `0008_workspace_merge_gap.sql`, `merge_gap_minutes` no `PATCH`
**Requirement**: HOURS-01, HOURS-02, HOURS-03, HOURS-04, HOURS-05

**Tools**:

- MCP: NONE
- Skill: `supabase-postgres-best-practices`

**Done when**:

- [x] Workspace existente lê `gross`; workspace novo nasce `gross`
- [x] `CHECK` recusa um valor fora de `gross`/`net` direto no banco
- [x] `PATCH` grava `net` e `gross`; sem o campo mantém; `null` e `liquid` → 422 sem gravar; editor e leitor → 403; gestor aceito
- [x] Gate check passes: Full (backend)

**Also touched**: `backend-node/src/services/workspaces.ts` (os dois workspaces novos montados em memória nascem `gross`), `backend-node/test/fixtures/pg-columns.json`, `backend-node/test/db/pglite.test.ts` e `backend-node/test/db/baseline.test.ts` (catálogo relido de um PostgreSQL 16.15 em 2026-11-10; a única mudança é a coluna nova).
**Status**: ✅ Done

**Tests**: integration
**Gate**: full

---

### T2: Opção na tela do workspace

**What**: Card `Contagem de horas` (descrição; `Horas totais` e `Horas líquidas` com exemplo e explicação) abaixo de `Juntar sessões próximas`, como no desenho https://claude.ai/artifact/Lq85wA2HSJT7BVYpBBtC4r, tipo `Workspace.hours_count_mode` e traduções.
**Where**: `frontend/src/types/index.ts`, `frontend/src/lib/api.ts`, `frontend/src/pages/workspace-settings.tsx`, `frontend/src/locales/pt-BR.json`, `frontend/src/locales/en.json`
**Depends on**: T1
**Reuses**: card `Formato de data` de `frontend/src/pages/admin/settings.tsx` (cabeçalho, linhas com rádio e exemplo), `canManage`, mutation com `refresh()` e `invalidateQueries()`
**Requirement**: HOURS-06, HOURS-07, HOURS-08

**Tools**:

- MCP: NONE
- Skill: `frete-frontend-engineering`

**Done when**:

- [x] O card mostra a descrição, e cada opção o nome, o exemplo e a explicação da spec; a opção guardada aparece marcada
- [x] Escolher a outra chama `workspacesApi.update({ hours_count_mode })` e invalida as consultas
- [x] Sem `canManage`, as duas opções ficam desabilitadas
- [x] Teste do cliente HTTP com o corpo do `PATCH` (L-007)
- [x] Gate check passes: Full (frontend)

**Status**: ✅ Done

**Tests**: unit
**Gate**: full

---

### T3: Tempo gasto líquido por tarefa

**What**: `spentMilliseconds` devolve a união das sessões da tarefa quando o workspace dela está em `net`.
**Where**: `backend-node/src/services/focus-settle.ts`
**Depends on**: T1
**Reuses**: expressão `end` atual, `ix_focus_sessions_task_id`
**Requirement**: HOURS-23, HOURS-24, HOURS-25, HOURS-26, HOURS-32, HOURS-33, HOURS-34, HOURS-35

**Tools**:

- MCP: NONE
- Skill: `supabase-postgres-best-practices`

**Done when**:

- [x] Foco 09:00–10:00 + manual 09:30–10:30 → `net` 1h30, `gross` 2h
- [x] Encostadas, contida, cadeia de três e sessão aberta sobreposta (até agora, nunca além de `deadline_at`), cada uma com seu teste (L-044)
- [x] Sessões de dois membros na mesma tarefa entram na mesma união
- [x] Outra tarefa no mesmo workspace, sem sobreposição, não muda (L-048)
- [x] `spent_seconds` do quadro e o prazo de uma sessão de foco nova usam o valor líquido (teste de serviço do foco)
- [x] Gate check passes: Full (backend)

**Status**: ✅ Done

**Tests**: integration
**Gate**: full

---

### T4: Overview dos Relatórios em horas líquidas

**What**: `overview` fatia unidades líquidas (tarefas unidas; pausas unidas menos tarefas) no modo `net`, mantém `lists_time` bruto e devolve `hours_count_mode` e `gross_task_seconds`.
**Where**: `backend-node/src/services/reports.ts`, `backend-node/src/routes/reports.ts`
**Depends on**: T1
**Reuses**: `clippedSessions`, fatiamento por hora, arredondamento único
**Requirement**: HOURS-15, HOURS-16, HOURS-17, HOURS-20, HOURS-21, HOURS-22, HOURS-36, HOURS-37, HOURS-38, HOURS-39

**Tools**:

- MCP: NONE
- Skill: `supabase-postgres-best-practices`

**Done when**:

- [x] Lista A 09:00–11:00 + lista B 10:00–12:00 em `net`: `task_seconds` 3h, `gross_task_seconds` 4h, dia 3h, listas 2h e 2h
- [x] Pausa 10:30–11:30 sobre tarefa 09:00–11:00: `break_seconds` 30 min em `net`, 1h em `gross`; período só com pausas devolve a pausa inteira (L-013)
- [x] Sobreposição que atravessa a meia-noite divide a união entre os dois dias, e a soma bate com o total
- [x] Filtro de lista une só as sessões da lista; sessões de outro membro não entram
- [x] `gross` devolve os mesmos números de antes (testes atuais sem mudança de valor)
- [x] Relógio fixo nos testes novos (L-015)
- [x] Gate check passes: Full (backend)

**Deviation**: o bruto saiu no nível de cima (`gross_task_seconds`), não dentro de `tiles`: oito testes atuais comparam `tiles` inteiro e continuam sem mudança (Done when "gross devolve os mesmos números"). Spec e design atualizados.
**Status**: ✅ Done

**Tests**: integration
**Gate**: full

---

### T5: Helper `measure` de intervalos

**What**: `merge` e `measure` (união com recorte e exclusão) em `frontend/src/lib/time/intervals.ts`.
**Where**: `frontend/src/lib/time/intervals.ts`, `frontend/src/lib/time/intervals.test.ts`
**Depends on**: None
**Reuses**: nada
**Requirement**: HOURS-32, HOURS-33, HOURS-34

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Encostados, contido, cadeia, desordenados, vazios (`end <= start`) ignorados
- [x] `within` corta nas duas pontas; `exclude` tira só a parte coberta
- [x] Gate check passes: Quick

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick

---

### T6: Agenda em horas líquidas

**What**: `dayTotal` e `joinNear` recebem o modo; o total do dia ganha o tooltip `Horas líquidas · bruto: X`; o aviso de sobreposição muda de texto no `net`.
**Where**: `frontend/src/lib/agenda/layout.ts`, `frontend/src/lib/agenda/join.ts`, `frontend/src/components/agenda/week-grid.tsx`, `frontend/src/pages/agenda.tsx`, `frontend/src/components/agenda/session-panel.tsx`, `frontend/src/components/agenda/session-move-confirm.tsx`, `frontend/src/locales/pt-BR.json`, `frontend/src/locales/en.json`
**Depends on**: T2, T5
**Reuses**: `measure`, tooltip dos blocos, `current` de `useWorkspace()`
**Requirement**: HOURS-09, HOURS-10, HOURS-11, HOURS-12, HOURS-13, HOURS-14

**Tools**:

- MCP: NONE
- Skill: `frete-frontend-engineering`

**Done when**:

- [ ] Foco 09:00–11:00 + manual 10:00–12:00: cabeçalho `3h` em `net` com tooltip `Horas líquidas · bruto: 4h`; `4h` sem tooltip em `gross`
- [ ] Intervalo sobreposto não entra no total nos dois modos
- [ ] Sessão escondida por `Esconder sessões curtas` entra na união (L-044)
- [ ] Bloco unido com membros sobrepostos mostra a união em `net`
- [ ] Aviso de sobreposição com o texto de cada modo, no painel e na confirmação de mover
- [ ] Gate check passes: Full (frontend)

**Tests**: unit
**Gate**: full

---

### T7: Barra do plano em horas líquidas

**What**: `capacity` recebe o modo e, no `net`, mede planejado, agendadas e pausas com `measure` e a precedência tarefa > agendada > pausa.
**Where**: `frontend/src/lib/plan/capacity.ts`, `frontend/src/pages/plan.tsx`
**Depends on**: T2, T5
**Reuses**: `measure`, `scheduledMinutes`, `minuteOfClock`
**Requirement**: HOURS-27, HOURS-28, HOURS-29, HOURS-30, HOURS-31

**Tools**:

- MCP: NONE
- Skill: `frete-frontend-engineering`

**Done when**:

- [ ] Expediente 09:00–18:00, blocos 10:00–12:00 e 11:00–13:00, almoço 12:00–13:00: `net` 3h planejadas de 9h livres, sem pausa; `gross` 4h de 8h, 1h em pausas
- [ ] Agendada sem bloco coberta por um bloco não conta como agendada no `net`
- [ ] Pausa coberta por uma agendada sai das pausas no `net`
- [ ] Página do plano passa o modo do workspace (teste de página com a barra no `net`)
- [ ] Gate check passes: Full (frontend)

**Tests**: unit
**Gate**: full

---

### T8: Aviso e bruto na página de Relatórios

**What**: Tipo do overview com `hours_count_mode` e `gross_task_seconds`; aviso acima dos cards e `Bruto: X` no card `Tempo trabalhado` quando a resposta vem em `net`.
**Where**: `frontend/src/types/index.ts`, `frontend/src/pages/reports*.tsx`, `frontend/src/components/reports/overview-tiles.tsx`, `frontend/src/locales/pt-BR.json`, `frontend/src/locales/en.json`
**Depends on**: T4
**Reuses**: `StatTile`, `formatDuration`
**Requirement**: HOURS-18, HOURS-19, HOURS-20

**Tools**:

- MCP: NONE
- Skill: `frete-frontend-engineering`

**Done when**:

- [ ] Resposta `net`: aviso com o texto da spec e `Bruto: 4h` no card
- [ ] Resposta `net` sem sobreposição: aviso e `Bruto` continuam (HOURS-38)
- [ ] Resposta `gross`: sem aviso e sem `Bruto`
- [ ] Gate check passes: Full (frontend), depois Build (fim da fase)

**Tests**: unit
**Gate**: full
