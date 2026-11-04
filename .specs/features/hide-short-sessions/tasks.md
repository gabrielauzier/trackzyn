# Esconder sessões curtas Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/hide-short-sessions/design.md`
**Status**: In Progress
**Pré-requisito**: a Agenda (#19), na branch `feat/agenda`, de onde esta feature parte.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `CONTRIBUTING.md` (testes do backend e do frontend antes do PR), `backend-node/vitest.config.ts` (60% de linhas), `frontend/vitest.config.ts`. Onde os guias não definem profundidade, valem os padrões fortes da skill.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Migration e schema | integration (PGlite) | Workspace existente lê `null`; o `CHECK` recusa 0 e 61 | `backend-node/test/db/*.test.ts` | `npm --prefix backend-node test` |
| Rotas do workspace | integration (`app.inject`) | Leitura por todos os papéis; `PATCH` feliz, `null`, ausente, 422 (0, 61, 1.5, texto), 403 de editor e leitor | `backend-node/test/routes/workspaces.test.ts` | `npm --prefix backend-node test` |
| Serviço da aba Sessões | integration (PGlite) | 1:1 com HIDE-19 a HIDE-24, nas bordas X × 60 s − 1 s e exatamente X; meia-noite; sessão aberta | `backend-node/test/services/reports-sessions.test.ts` | `npm --prefix backend-node test` |
| Funções puras do frontend | unit | Todos os ramos de `isHiddenSession`: desligado, aberta, abaixo, exatamente X, acima | `frontend/src/lib/agenda/*.test.ts` | `npm --prefix frontend test` |
| Componentes e páginas | unit (Testing Library) | Cada AC visível: blocos, total do dia, faixas, aviso, painel, configuração e estado sem permissão | `frontend/src/**/*.test.tsx` | `npm --prefix frontend test` |
| Tipos e traduções | none | build gate (typecheck) | - | `npm --prefix frontend run typecheck` |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Tasks com testes de unidade do frontend | `npm --prefix frontend test` |
| Full | Tasks do backend, e as do frontend que tocam uma página | `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test` (backend) ou `npm --prefix frontend run lint && npm --prefix frontend run typecheck && npm --prefix frontend test` (frontend) |
| Build | Fim de cada fase | os dois Full acima + `npm --prefix frontend run build` |

---

## Execution Plan

Phases run sequentially; tasks within a phase run in order.

### Phase 1: Backend

```
T1 → T2 → T3
```

### Phase 2: Frontend

```
T4 → T5 → T6 → T7 → T8
```

### Phase 3: Fixes do Verifier (rodada 1)

```
T9 → T10 → T11
```

---

## Task Breakdown

### T1: Coluna `min_session_minutes` do workspace

**What**: Migration `0007_workspace_min_session.sql` com `ALTER TABLE workspaces ADD COLUMN min_session_minutes smallint CHECK (min_session_minutes BETWEEN 1 AND 60)`, nula por padrão, e no schema a coluna `minSessionMinutes`.
**Where**: `backend-node/drizzle/0007_workspace_min_session.sql`
**Depends on**: None
**Reuses**: o padrão de `backend-node/drizzle/0006_session_list_follows_task.sql` e o journal em `drizzle/meta`; o teste de migration de `backend-node/test/db/session-origin-schema.test.ts`
**Requirement**: HIDE-01

**Tools**:

- MCP: NONE
- Skill: `supabase-postgres-best-practices`

**Done when**:

- [x] Um workspace gravado antes da migration lê `min_session_minutes = null` depois dela
- [x] O banco recusa 0 e 61 e aceita 1 e 60
- [x] `backend-node/src/db/schema.ts` tem `minSessionMinutes`
- [x] Gate check passes: Full (backend)

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): add the minimum session length of a workspace`

---

### T2: Ler e gravar o mínimo no workspace

**What**: `min_session_minutes` em `workspaceReadSchema` e `toWorkspaceRead`, e no `workspaceUpdateBody` como `z.number().int().min(1).max(60).nullable().optional()`, gravado só quando vem no corpo (`null` desliga).
**Where**: `backend-node/src/routes/workspaces.ts`
**Depends on**: T1
**Reuses**: `backend-node/src/routes/schemas.ts` (leitura) e o tratamento de `timezone` no mesmo `PATCH`; `requireMembership(..., 'owner')`
**Requirement**: HIDE-02, HIDE-03, HIDE-04, HIDE-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `GET /api/workspaces` e `GET /api/workspaces/current` devolvem `min_session_minutes` (`null` por padrão) para dono, editor e leitor
- [x] O dono grava 5, lê 5; grava `null`, lê `null`; um `PATCH` sem o campo mantém o valor
- [x] 0, 61, 1.5 e `"5"` respondem 422 e mantêm o valor
- [x] Editor e leitor recebem 403 e o valor fica
- [x] Gate check passes: Full (backend)

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): read and set the workspace minimum session length`

---

### T3: Filtro da aba Sessões

**What**: `sessionsReport` recebe `minSessionMinutes` do workspace e deixa de fora os pedaços das sessões encerradas cuja duração inteira é menor que o mínimo; a sessão aberta fica sempre.
**Where**: `backend-node/src/services/reports-sessions.ts`
**Depends on**: T2
**Reuses**: o CTE `clippedSessions` (`started_at` e `ended_at` da sessão inteira) e a liquidação de `reportScope` (AD-001)
**Requirement**: HIDE-19, HIDE-20, HIDE-21, HIDE-22, HIDE-23, HIDE-24

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Com o mínimo em 5: some a sessão de 4 min 59 s, fica a de 5 min, nos dois sentidos da borda
- [x] Uma sessão de 3 h que atravessa a meia-noite com 2 min no segundo dia aparece nos dois dias
- [x] A sessão aberta de 1 min aparece
- [x] Um dia em que todas as sessões somem não aparece em `days`
- [x] `overview` dá os mesmos números com o mínimo ligado e desligado
- [x] Os testes atuais da aba Sessões passam sem mudança (mínimo desligado)
- [x] Gate check passes: Full (backend)

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): hide short sessions from the sessions report`

---

### T4: A regra `isHiddenSession`

**What**: Função pura que diz se a Agenda esconde uma sessão, e o campo `min_session_minutes` no tipo `Workspace`.
**Where**: `frontend/src/lib/agenda/hide.ts`
**Depends on**: None
**Reuses**: nada; o tipo `AgendaSession`
**Requirement**: HIDE-11, HIDE-12, HIDE-13, HIDE-16

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Falso com o mínimo nulo, qualquer que seja a duração
- [x] Falso para a sessão aberta (`ended_at: null`), mesmo de segundos
- [x] Com o mínimo em 5: verdadeiro para 4 min 59 s, falso para exatamente 5 min e para 6 min
- [x] `frontend/src/types/index.ts` tem `min_session_minutes: number | null` em `Workspace`
- [x] Gate check passes: Quick

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): add the rule for hidden agenda sessions`

---

### T5: Esconder os blocos na semana

**What**: `WeekGrid` recebe `hidden?: (session) => boolean`; o total do dia continua somando todos os pedaços, e os blocos e as faixas saem só dos visíveis.
**Where**: `frontend/src/components/agenda/week-grid.tsx`
**Depends on**: T4
**Reuses**: `dayPieces`, `assignLanes`, `dayTotal` de `frontend/src/lib/agenda/layout.ts`
**Requirement**: HIDE-11, HIDE-12, HIDE-14, HIDE-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Uma sessão escondida não tem bloco, e a visível do mesmo dia tem
- [x] O total do cabeçalho do dia soma a escondida
- [x] Um bloco que se sobrepõe só a uma escondida ocupa a largura inteira (`width: 100%`)
- [x] Sem `hidden`, todas as sessões aparecem (os testes atuais passam sem mudança)
- [x] Gate check passes: Quick

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): hide short sessions in the agenda week`

---

### T6: Esconder os blocos no dia

**What**: `DayTimeline` recebe o mesmo `hidden`; o total do dia soma todos, e a mensagem de dia vazio continua dependendo de haver sessões.
**Where**: `frontend/src/components/agenda/day-timeline.tsx`
**Depends on**: T5
**Reuses**: o mesmo filtro de T5
**Requirement**: HIDE-11, HIDE-14, HIDE-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Uma sessão escondida não tem bloco, e o total do dia a soma
- [x] Um dia com todas as sessões escondidas mostra o total, nenhum bloco e não mostra a mensagem de dia vazio
- [x] Um bloco que se sobrepõe só a uma escondida ocupa a largura inteira
- [x] Gate check passes: Quick

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): hide short sessions in the agenda day view`

---

### T7: Ligar a regra na página da Agenda

**What**: A página lê `current.min_session_minutes`, passa `hidden` às duas visões, dá ao painel só as sessões visíveis e procura a selecionada entre as visíveis.
**Where**: `frontend/src/pages/agenda.tsx`
**Depends on**: T6
**Reuses**: `useWorkspace()`; o fechamento do painel de AGENDA-32
**Requirement**: HIDE-11, HIDE-15, HIDE-16, HIDE-17, HIDE-18

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Com o mínimo em 5, a sessão de 2 min some da grade, e a de 1 h aparece
- [x] Criar uma sessão sobre o horário de uma escondida não mostra o aviso de sobreposição
- [x] Ajustar uma sessão para menos de 5 min tira o bloco e fecha o painel
- [x] Com o mínimo nulo, todas aparecem
- [x] Trocar o mínimo do workspace atual redesenha a grade sem recarregar a página
- [x] Gate check passes: Full (frontend)

**Tests**: unit
**Gate**: full

**Commit**: `feat(frontend): apply the workspace minimum session length to the agenda`

---

### T8: A configuração na tela do workspace

**What**: Abaixo do fuso, o interruptor `Esconder sessões curtas` e, enquanto ligado, o campo `Menos de [n] minutos`, salvos no mesmo `PATCH`, com as traduções em `en` e `pt-BR`.
**Where**: `frontend/src/pages/workspace-settings.tsx`
**Depends on**: T7
**Reuses**: `frontend/src/components/ui/switch.tsx`, `Input`, o formulário e o `refresh()` que já salvam nome, idioma e fuso; `canManage`
**Requirement**: HIDE-06, HIDE-07, HIDE-08, HIDE-09, HIDE-10

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] O dono vê o interruptor abaixo do fuso, desligado com o valor nulo, e o campo só aparece com ele ligado
- [x] Ligar com o valor nulo preenche 1
- [x] Salvar com 5 envia `min_session_minutes: 5`; desligado, envia `null`
- [x] 0, 61 e 1.5 mostram `Entre 1 e 60 minutos.` e não enviam nada
- [x] Editor e leitor veem os dois desabilitados, com o valor salvo
- [x] Gate check passes: Build

**Tests**: unit
**Gate**: build

**Commit**: `feat(frontend): set the minimum session length in the workspace settings`

---

### T9: Provar o dia escondendo sessões na página da Agenda

**What**: Teste da página na largura de celular (390 px) com o mínimo em 5: o bloco de 1 h aparece, o de 2 min não, e o total do dia soma os dois. Fecha o mutante F10 (tirar `hidden` do `DayTimeline` em `agenda.tsx`).
**Where**: `frontend/src/pages/agenda.test.tsx`
**Depends on**: None
**Reuses**: `setWidth` do bloco de telas estreitas do mesmo arquivo
**Requirement**: HIDE-11, HIDE-14

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Na largura de 390 px, com o mínimo em 5, o bloco 10:30 – 10:32 não aparece e o 10:00 – 11:00 aparece
- [x] O título do dia mostra o total com as duas sessões (1 h 2 min)
- [x] Tirar `hidden={hidden}` do `DayTimeline` faz o teste falhar
- [x] Gate check passes: Full (frontend)

**Tests**: unit
**Gate**: full

**Commit**: `test(frontend): prove the agenda day view hides short sessions`

---

### T10: Provar que a aba Sessões usa o mínimo de cada workspace

**What**: Teste de rota com dois workspaces do mesmo dono, um com o mínimo em 5 e outro desligado, cada um com uma sessão de 2 min: a aba Sessões esconde a do primeiro e lista a do segundo.
**Where**: `backend-node/test/routes/reports.test.ts`
**Depends on**: T9
**Reuses**: o teste HIDE-19 de rota do mesmo arquivo
**Requirement**: HIDE-19, HIDE-24

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] No workspace com o mínimo em 5, a sessão de 2 min não aparece
- [ ] No outro workspace, desligado, a sessão de 2 min aparece
- [ ] Gate check passes: Full (backend)

**Tests**: integration
**Gate**: full

**Commit**: `test(backend): prove the sessions report reads each workspace minimum`

---

### T11: Provar a mensagem de erro em português

**What**: O teste em português da tela do workspace também afirma `Entre 1 e 60 minutos.` para um valor fora da faixa.
**Where**: `frontend/src/pages/workspace-settings.test.tsx`
**Depends on**: T10
**Reuses**: o teste em português do mesmo arquivo
**Requirement**: HIDE-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Com o idioma em português e o valor 0, aparece `Entre 1 e 60 minutos.`
- [ ] Gate check passes: Build

**Tests**: unit
**Gate**: build

**Commit**: `test(frontend): prove the minimum error message in Portuguese`

---

## Phase Execution Map

```
Phase 1 → Phase 2

Phase 1:  T1 ------→ T2 ------→ T3
Phase 2:  T4 ------→ T5 ------→ T6 ------→ T7 ------→ T8
Phase 3:  T9 ------→ T10 -----→ T11
```

8 tasks: um batch só, executado no contexto principal, sem sub-agentes. O Verifier roda depois de T8.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: Coluna | 1 migration + a coluna no schema | ✅ Granular |
| T2: Contrato do workspace | 1 rota (leitura e escrita do mesmo campo) | ✅ Granular |
| T3: Filtro da aba Sessões | 1 função | ✅ Granular |
| T4: `isHiddenSession` | 1 função + 1 campo de tipo | ✅ Granular |
| T5: Semana | 1 componente | ✅ Granular |
| T6: Dia | 1 componente | ✅ Granular |
| T7: Página da Agenda | 1 página | ✅ Granular |
| T8: Configuração | 1 página + traduções | ✅ Granular |

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
| T8 | T7 | T7 → T8 | ✅ Match |

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1: Coluna | Migration e schema | integration | integration | ✅ OK |
| T2: Contrato | Rotas do workspace | integration | integration | ✅ OK |
| T3: Filtro | Serviço da aba Sessões | integration | integration | ✅ OK |
| T4: `isHiddenSession` | Funções puras do frontend + tipos | unit | unit | ✅ OK |
| T5: Semana | Componentes | unit | unit | ✅ OK |
| T6: Dia | Componentes | unit | unit | ✅ OK |
| T7: Página da Agenda | Componentes e páginas | unit | unit | ✅ OK |
| T8: Configuração | Componentes e páginas + traduções | unit | unit | ✅ OK |
