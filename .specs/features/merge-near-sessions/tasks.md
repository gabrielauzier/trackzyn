# Juntar sessões próximas Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/merge-near-sessions/design.md`
**Status**: Draft
**Pré-requisito**: a Agenda (#19) e o esconder sessões curtas (#22), na branch `feat/agenda`, de onde esta feature parte.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `CONTRIBUTING.md` (testes do backend e do frontend antes do PR), `backend-node/vitest.config.ts` (60% de linhas), `frontend/vitest.config.ts`; lição candidata L-034 (#22: um teste de página na largura de celular para o que vale nas duas visões). Onde os guias não definem profundidade, valem os padrões fortes da skill.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Migration e schema | integration (PGlite) | Workspace existente lê `null`; o `CHECK` recusa 0 e 61; catálogo de colunas lido de um PostgreSQL 16 real | `backend-node/test/db/*.test.ts` | `npm --prefix backend-node test` |
| Rotas do workspace | integration (`app.inject`) | Leitura por todos os papéis; `PATCH` feliz, `null`, ausente, 422 (0, 61, 1.5, texto), 403 de editor e leitor, `manager` aceito | `backend-node/test/routes/workspaces.test.ts` | `npm --prefix backend-node test` |
| Funções puras do frontend | unit | 1:1 com MERGE-11 a MERGE-18 e MERGE-22: exatamente X e X + 1 s, cadeia, sobreposição, outra lista, outro tipo, intervalo no meio, sessão aberta, meia-noite, `apartId`, desligado | `frontend/src/lib/agenda/*.test.ts` | `npm --prefix frontend test` |
| Componentes e páginas | unit (Testing Library) | Cada AC visível: contador, nome acessível, tooltip, faixas, total do dia, clique, lista, detalhes com voltar, sessão escolhida com alças, configuração e estado sem permissão; a semana e o dia | `frontend/src/**/*.test.tsx` | `npm --prefix frontend test` |
| Tipos, cliente HTTP e traduções | none | build gate (typecheck) | - | `npm --prefix frontend run typecheck` |

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

### Phase 1: Configuração no backend

```
T1 → T2
```

### Phase 2: Junção e blocos

```
T3 → T4 → T5 → T6
```

### Phase 3: Painel, página e configuração

```
T7 → T8 → T9
```

---

## Task Breakdown

### T1: Coluna `merge_gap_minutes` do workspace

**What**: Migration `0008_workspace_merge_gap.sql` com `ALTER TABLE workspaces ADD COLUMN merge_gap_minutes smallint` e `CONSTRAINT ck_workspaces_merge_gap_minutes CHECK (merge_gap_minutes BETWEEN 1 AND 60)`, a coluna `mergeGapMinutes` no schema, e o catálogo `pg-columns.json` lido de novo de um PostgreSQL 16 real.
**Where**: `backend-node/drizzle/0008_workspace_merge_gap.sql`
**Depends on**: None
**Reuses**: `backend-node/drizzle/0007_workspace_min_session.sql` e `backend-node/test/db/workspace-min-session-schema.test.ts`
**Requirement**: MERGE-01

**Tools**:

- MCP: NONE
- Skill: `supabase-postgres-best-practices`

**Done when**:

- [x] Um workspace gravado antes da migration lê `merge_gap_minutes = null` depois dela
- [x] O banco recusa 0 e 61 e aceita 1 e 60
- [x] `pg-columns.json` lido de um PostgreSQL 16 numa base temporária, apagada em seguida; o baseline C38 espera exatamente as duas colunas novas de `workspaces`
- [x] Gate check passes: Full (backend)

**Tests**: integration
**Gate**: full

**Commit**: `feat(backend): add the join gap of a workspace`

---

### T2: Ler e gravar a junção no workspace

**What**: `merge_gap_minutes` na leitura do workspace e no `PATCH`, como `z.number().int().min(1).max(60).nullable().optional()`.
**Where**: `backend-node/src/routes/workspaces.ts`
**Depends on**: T1
**Reuses**: o tratamento de `min_session_minutes` em `routes/workspaces.ts` e `routes/schemas.ts`
**Requirement**: MERGE-02, MERGE-03, MERGE-04, MERGE-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Dono, editor e leitor leem `merge_gap_minutes` (`null` por padrão) na lista e em `current`
- [x] O dono grava 5, lê 5; `null` desliga; um `PATCH` sem o campo mantém o valor; o gestor (`manager`) também grava
- [x] 0, 61, 1.5 e `"5"` respondem 422 e mantêm o valor
- [x] Editor e leitor recebem 403 e o valor fica
- [x] Gate check passes: Build

**Tests**: integration
**Gate**: build

**Commit**: `feat(backend): read and set the workspace join gap`

---

### T3: A regra `joinPieces`

**What**: Função pura que junta os pedaços visíveis de um dia em grupos da mesma lista e tipo, a até X minutos, e o campo `members` em `Piece`; o campo `merge_gap_minutes` no tipo `Workspace`.
**Where**: `frontend/src/lib/agenda/join.ts`
**Depends on**: None
**Reuses**: `Piece` de `frontend/src/lib/agenda/layout.ts`
**Requirement**: MERGE-11, MERGE-12, MERGE-13, MERGE-14, MERGE-15, MERGE-16, MERGE-17, MERGE-18, MERGE-22

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Com 5: 10:20–11:01 e 11:05–11:16 da mesma lista viram um pedaço de 10:20 a 11:16, com os dois em `members`, em ordem de início
- [x] Exatamente 5 min se junta; 5 min e 1 s não
- [x] A cadeia: três sessões a 4 e 2 min viram um pedaço só
- [x] Duas sessões sobrepostas da mesma lista e tipo se juntam
- [x] Outra lista, ou uma tarefa e um intervalo, ficam separados
- [x] Um intervalo entre duas tarefas da mesma lista não impede a junção das tarefas
- [x] A sessão aberta, a que passa da meia-noite e a `apartId` ficam fora de qualquer grupo
- [x] Com o espaço nulo, os pedaços voltam sem mudança
- [x] Gate check passes: Quick

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): add the rule for joining near agenda sessions`

---

### T4: O bloco unido

**What**: `SessionBlock` com `piece.members` mostra o contador no canto, o nome acessível `<lista>, N sessões, HH:MM – HH:MM` e o tooltip do grupo.
**Where**: `frontend/src/components/agenda/session-block.tsx`
**Depends on**: T3
**Reuses**: o `Tooltip` e as classes de repouso e hover do bloco
**Requirement**: MERGE-25, MERGE-26, MERGE-32

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] O bloco de 3 sessões de Produto mostra `3` e nenhum outro texto
- [x] O nome acessível é `Produto, 3 sessions, 10:20 – 11:40` (em inglês nos testes) e `Produto, 3 sessões, …` em português
- [x] O tooltip mostra `Produto · 3 sessions`, uma linha por sessão com o título (ou `Break`) e o horário, e `Click to pick a session`
- [x] Um bloco comum fica como hoje (os testes atuais passam sem mudança)
- [x] Gate check passes: Quick

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): draw a joined agenda block with its sessions`

---

### T5: Juntar na semana

**What**: `WeekGrid` passa os pedaços visíveis por `joinPieces` antes das faixas, sem alças nem arraste no bloco unido, e chama `onSelectGroup` no clique.
**Where**: `frontend/src/components/agenda/week-grid.tsx`
**Depends on**: T4
**Reuses**: `joinPieces`, `assignLanes`, o filtro `hiddenIds`
**Requirement**: MERGE-11, MERGE-19, MERGE-20, MERGE-21, MERGE-23, MERGE-27, MERGE-30

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Com 5, as duas sessões de Produto viram um bloco; uma de outra lista no mesmo horário fica ao lado, com `width: 50%`
- [x] O total do cabeçalho do dia é a soma das sessões, sem os espaços
- [x] Uma sessão escondida não emenda um espaço nem entra no bloco
- [x] Arrastar o bloco unido não chama `onCommit`; ele não tem alças
- [x] Clicar nele chama `onSelectGroup` com as sessões em ordem de início, e ele fica selecionado quando um membro está em `selectedGroup`
- [x] Com `apartId`, a sessão aparece sozinha e o resto do grupo se redesenha sem ela
- [x] Gate check passes: Quick

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): join near sessions in the agenda week`

---

### T6: Juntar no dia

**What**: `DayTimeline` com a mesma junção, clique e `apartId` da semana.
**Where**: `frontend/src/components/agenda/day-timeline.tsx`
**Depends on**: T5
**Reuses**: o mesmo caminho de T5
**Requirement**: MERGE-19, MERGE-20, MERGE-21, MERGE-23, MERGE-27, MERGE-30

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Com 5, as duas sessões de Produto viram um bloco, e o título do dia mostra a soma das sessões
- [x] Clicar no bloco chama `onSelectGroup`; ele não tem alças
- [x] Com `apartId`, a sessão aparece sozinha
- [x] Gate check passes: Build

**Tests**: unit
**Gate**: build

**Commit**: `feat(frontend): join near sessions in the agenda day view`

---

### T7: O painel do grupo e o voltar

**What**: `SessionGroupList`, com o título `<lista> · N sessões`, o dia, o intervalo, a instrução e um botão por sessão; e a prop `onBack` em `SessionDetails`, com o botão `‹ <lista> · N sessões`.
**Where**: `frontend/src/components/agenda/session-group-list.tsx`
**Depends on**: None
**Reuses**: o cartão e os formatos de `SessionDetails` em `frontend/src/components/agenda/session-panel.tsx`
**Requirement**: MERGE-27, MERGE-28, MERGE-33

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] O painel mostra `Produto · 3 sessions`, o dia, `10:20 – 11:40` e `Pick a session to see its details, edit or delete it.`
- [x] Cada sessão é um botão com o título, `recorded by the focus` ou `recorded on the agenda`, `HH:MM – HH:MM · <duração>`, em ordem de início
- [x] Clicar num botão chama `onPick` com a sessão
- [x] `SessionDetails` com `onBack` mostra `‹ Produto · 3 sessions` e o chama; sem `onBack`, fica como hoje
- [x] Os textos em português: `Produto · 3 sessões`, `Escolha uma sessão para ver os detalhes, editar ou excluir.`
- [x] Gate check passes: Quick

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): list the sessions of a joined agenda block`

---

### T8: Ligar a junção na página da Agenda

**What**: A página lê `current.merge_gap_minutes`, passa a junção às duas visões, guarda o grupo clicado, mostra a lista e os detalhes com o voltar, e tira da junção a sessão escolhida.
**Where**: `frontend/src/pages/agenda.tsx`
**Depends on**: T7
**Reuses**: `select`, `closeSelected`, `hidden` e o painel de hoje
**Requirement**: MERGE-24, MERGE-27, MERGE-28, MERGE-29, MERGE-31

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Com 5, as duas sessões de Produto aparecem como um bloco; com nulo, como dois
- [x] Clicar no bloco abre a lista; escolher a de 11:05 mostra os detalhes dela com `Edit` e `Delete`
- [x] Com a sessão escolhida, ela aparece sozinha com as alças, e o voltar mostra a lista de novo
- [x] Fechar o painel junta a sessão de novo com a vizinha
- [x] Trocar o espaço do workspace atual redesenha a grade sem uma nova leitura das sessões
- [x] Na largura de 390 px, as duas sessões de Produto aparecem como um bloco no dia (L-034)
- [x] Gate check passes: Full (frontend)

**Tests**: unit
**Gate**: full

**Commit**: `feat(frontend): apply the workspace join gap to the agenda`

---

### T9: A configuração na tela do workspace

**What**: Abaixo de `Esconder sessões curtas`, o interruptor `Juntar sessões próximas` e, enquanto ligado, o campo `Até [n] minutos`, salvos no mesmo `PATCH`, com as traduções e o campo no cliente HTTP.
**Where**: `frontend/src/pages/workspace-settings.tsx`
**Depends on**: T8
**Reuses**: o par interruptor e minutos de `min_session_minutes` e a validação `minValid`
**Requirement**: MERGE-06, MERGE-07, MERGE-08, MERGE-09, MERGE-10

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] O interruptor aparece abaixo de `Hide short sessions`, desligado com o valor nulo; o campo só aparece com ele ligado
- [x] Ligar com o valor nulo preenche 1
- [x] Salvar com 5 envia `merge_gap_minutes: 5`; desligado, envia `null`
- [x] 0, 61 e 1.5 mostram `Between 1 and 60 minutes.` e não enviam nada; o campo de sessões curtas não é afetado
- [x] Editor e leitor veem os dois desabilitados, com o valor salvo
- [x] Em português: `Juntar sessões próximas`, `Até`, `minutos`
- [x] Gate check passes: Build

**Tests**: unit
**Gate**: build

**Commit**: `feat(frontend): set the join gap in the workspace settings`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3

Phase 1:  T1 ------→ T2
Phase 2:  T3 ------→ T4 ------→ T5 ------→ T6
Phase 3:  T7 ------→ T8 ------→ T9
```

9 tasks: dois batches por fases inteiras (Phase 1 + Phase 2 = 6 tasks; Phase 3 = 3 tasks). O Verifier roda depois de T9.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: Coluna | 1 migration + a coluna no schema | ✅ Granular |
| T2: Contrato | 1 rota (leitura e escrita do mesmo campo) | ✅ Granular |
| T3: `joinPieces` | 1 função + 1 campo de tipo | ✅ Granular |
| T4: Bloco unido | 1 componente | ✅ Granular |
| T5: Semana | 1 componente | ✅ Granular |
| T6: Dia | 1 componente | ✅ Granular |
| T7: Painel do grupo | 1 componente + 1 prop em `SessionDetails` | ✅ Granular |
| T8: Página da Agenda | 1 página | ✅ Granular |
| T9: Configuração | 1 página + traduções | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | início da Phase 1 | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | None | início da Phase 2 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | None | início da Phase 3 | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1: Coluna | Migration e schema | integration | integration | ✅ OK |
| T2: Contrato | Rotas do workspace | integration | integration | ✅ OK |
| T3: `joinPieces` | Funções puras do frontend + tipos | unit | unit | ✅ OK |
| T4: Bloco unido | Componentes | unit | unit | ✅ OK |
| T5: Semana | Componentes | unit | unit | ✅ OK |
| T6: Dia | Componentes | unit | unit | ✅ OK |
| T7: Painel do grupo | Componentes | unit | unit | ✅ OK |
| T8: Página da Agenda | Componentes e páginas | unit | unit | ✅ OK |
| T9: Configuração | Componentes e páginas + traduções | unit | unit | ✅ OK |
