# Contagem de horas Design

**Spec**: `.specs/features/contagem-de-horas/spec.md`
**Context**: `.specs/features/contagem-de-horas/context.md`
**Status**: Approved (abordagem "Multirange no SQL", escolhida pelo usuário em 2026-11-10; design aprovado em 2026-11-10)

---

## Architecture Overview

Uma coluna nova, `workspaces.hours_count_mode` (`gross` | `net`, padrão `gross`), e duas formas da mesma conta, uma em cada lado:

- **Backend (SQL):** a união dos trechos é `range_agg(tstzrange(a, z))`, desdobrada com `unnest(...)` em trechos que não se sobrepõem; a pausa menos a tarefa é a diferença de multiranges (`-`). Funciona igual no Postgres 16 e no PGlite (PostgreSQL 18.6 no PGlite 0.5.10; conferido em 2026-11-10: 09–11 ∪ 10–12 menos 10:30–10:45 = 9900 s). As contas continuam em SQL, como pede AD-004.
- **Frontend (TS):** um helper puro, `measure`, mede a união de intervalos em minutos, com recorte e exclusão; a Agenda e a barra do plano o chamam quando o modo é `net`.

Nada é gravado além da configuração: cada leitura escolhe a conta pelo modo do workspace (AD-010).

```mermaid
graph TD
    S[Configurações do workspace] -->|PATCH hours_count_mode| W[(workspaces)]
    W -->|join por tarefa| SP[spentMilliseconds]
    SP --> B[Quadro / MCP get_board]
    SP --> F[Foco / widget / prazo e Estender]
    SP --> D[Feito × estimado]
    W -->|request.workspace| R[overview: unidades líquidas ou brutas]
    R --> RP[Página de Relatórios: aviso + Bruto]
    W -->|useWorkspace().current| A[Agenda: dayTotal, joinNear, aviso]
    W -->|useWorkspace().current| P[Plano: capacity]
    A --> M[lib/time/intervals.ts measure]
    P --> M
```

---

## Code Reuse Analysis

### Existing Components to Leverage

| Component | Location | How to Use |
| --- | --- | --- |
| Coluna de configuração com `CHECK` | `backend-node/src/db/schema.ts:90-97`, `drizzle/0008_workspace_merge_gap.sql` | Mesmo formato: `ALTER TABLE ... ADD COLUMN`, `--> statement-breakpoint`, `ADD CONSTRAINT CHECK` |
| `PATCH /api/workspaces/:id` | `backend-node/src/routes/workspaces.ts:39-49,97-131` | Campo novo no `workspaceUpdateBody` (`z.enum(['gross','net']).optional()`, sem `nullable`) |
| Serializador do workspace | `backend-node/src/routes/schemas.ts:29-31,47-48` | `hours_count_mode` em `toWorkspaceRead` e `workspaceReadSchema` |
| `clippedSessions` | `backend-node/src/services/reports.ts:104` | Base das unidades líquidas: a união parte dos trechos já cortados ao período e ao filtro de lista |
| Fatiamento por hora | `backend-node/src/services/reports.ts:143-148` | Passa a fatiar `units` (líquidas ou brutas) em vez de `s`; `lists_time` continua fatiando `s` |
| `spentMilliseconds` | `backend-node/src/services/focus-settle.ts:30-43` | Ganha a conta líquida por tarefa, escolhida pelo modo do workspace da tarefa no próprio SQL |
| Bloco de configuração com permissão | `frontend/src/pages/workspace-settings.tsx:451-534` (`canManage`, mutation 164-182) | Grupo `Contagem de horas` logo abaixo de `Juntar sessões próximas` |
| `useWorkspace().current` | `frontend/src/contexts/workspace-context.ts:22`, exemplo em `pages/agenda.tsx:120-140` | Fonte do modo na Agenda e no plano |
| `dayTotal`, `joinNear` | `frontend/src/lib/agenda/layout.ts:207`, `lib/agenda/join.ts:51` | Recebem o modo; no `net`, medem com `measure` |
| `capacity` | `frontend/src/lib/plan/capacity.ts:39-58` | Recebe o modo; no `net`, usa `measure` com exclusões |
| `StatTile` / `OverviewTiles` | `frontend/src/components/reports/overview-tiles.tsx:14-17` | Linha `Bruto` no card `Tempo trabalhado` |

### Integration Points

| System | Integration Method |
| --- | --- |
| Banco | Migration `0016_workspace_hours_count_mode.sql`, `NOT NULL DEFAULT 'gross'`, `CHECK (hours_count_mode IN ('gross','net'))`; snapshot e journal do Drizzle |
| API de Relatórios | `GET /api/reports/overview` ganha `hours_count_mode` e `tiles.gross_task_seconds` |
| API do workspace | Leitura e `PATCH` ganham `hours_count_mode` |
| Tempo gasto | Sem mudança de assinatura: `spentMilliseconds` lê o modo do workspace pela tarefa (`tasks → lists → workspaces`), então quadro, foco, widget, MCP, prazo, `Estender` e feito × estimado seguem sozinhos (HOURS-24, HOURS-25) |

---

## Components

### Coluna e API do modo

- **Purpose**: Guardar e expor o modo de contagem do workspace.
- **Location**: `backend-node/src/db/schema.ts`, `backend-node/drizzle/0016_workspace_hours_count_mode.sql`, `backend-node/src/routes/workspaces.ts`, `backend-node/src/routes/schemas.ts`
- **Interfaces**:
  - `workspaces.hoursCountMode: varchar('hours_count_mode', { length: 5 }).notNull().default('gross')` + `check('ck_workspaces_hours_count_mode', ...)`
  - `type HoursCountMode = 'gross' | 'net'` (exportado de `schema.ts`)
  - `PATCH` body: `hours_count_mode?: 'gross' | 'net'`; `null` ou outro valor → 422 pela validação do Zod (HOURS-04); papel abaixo de dono/gestor → 403 de `requireMembership` (HOURS-05)
- **Dependencies**: nenhuma
- **Reuses**: o padrão de `merge_gap_minutes`

### Tempo gasto líquido

- **Purpose**: O tempo gasto de cada tarefa no modo do workspace dela (HOURS-23 a HOURS-26).
- **Location**: `backend-node/src/services/focus-settle.ts`
- **Interfaces**:
  - `spentMilliseconds(tx, taskIds, now): Promise<Map<string, number>>` — mesma assinatura. Por tarefa: `gross = sum(end - started_at)`; `net = sum(upper(r) - lower(r))` sobre `unnest(range_agg(tstzrange(started_at, end)))`; devolve `CASE WHEN w.hours_count_mode = 'net' THEN net ELSE gross END`. `end` é a expressão atual (aberta até agora, nunca além de `deadline_at`).
- **Dependencies**: coluna do modo
- **Reuses**: a expressão `end` e o agrupamento atuais; `ix_focus_sessions_task_id`

### Unidades líquidas dos Relatórios

- **Purpose**: Os totais do overview no modo do workspace, com as listas sempre brutas (HOURS-15 a HOURS-22).
- **Location**: `backend-node/src/services/reports.ts` (`overview`), `backend-node/src/routes/reports.ts` (schema da resposta)
- **Interfaces**:
  - `overview(tx, userId, workspace: Pick<Workspace, 'id' | 'timezone' | 'hoursCountMode'>, filter, now)`
  - CTEs novos, depois de `s`:
    - `task_mr AS (SELECT coalesce(range_agg(tstzrange(a, z)), '{}') AS m FROM s WHERE kind = 'task' AND z > a)`
    - `break_mr AS (SELECT coalesce(range_agg(tstzrange(a, z)), '{}') AS m FROM s WHERE kind = 'break' AND z > a)`
    - `units AS (...)`: no `net`, `SELECT 'task' AS kind, lower(r) AS a, upper(r) AS z FROM task_mr, unnest(m) r UNION ALL SELECT 'break', lower(r), upper(r) FROM task_mr, break_mr, unnest(break_mr.m - task_mr.m) r`; no `gross`, `SELECT kind, a, z FROM s`
    - `slices` fatia `units`; `list_slices` fatia `s` (para `lists_time`)
  - O modo entra como parâmetro (`${mode} = 'net'`) num `WHERE` de cada ramo do `UNION ALL`, para a consulta ser uma só.
  - Resposta: `hours_count_mode`, `tiles.gross_task_seconds = floor(soma exata de s, kind task)`.
- **Dependencies**: coluna do modo; `request.workspace.workspace` já traz a linha inteira (`plugins/workspace.ts:48-68`)
- **Reuses**: `clippedSessions`, fatiamento por hora, arredondamento único (L-016)

### `measure` (frontend)

- **Purpose**: Medir a união de intervalos, com recorte e exclusão, sem depender de tela.
- **Location**: `frontend/src/lib/time/intervals.ts`
- **Interfaces**:
  - `type Interval = readonly [start: number, end: number]` (qualquer unidade; trechos com `end <= start` são ignorados)
  - `merge(intervals: Interval[]): Interval[]` — ordenados, sem sobreposição; trechos que só se encostam ficam juntos (o comprimento é o mesmo)
  - `measure(include: Interval[], options?: { within?: Interval; exclude?: Interval[] }): number` — comprimento de `(∪include ∩ within) \ ∪exclude`
- **Dependencies**: nenhuma
- **Reuses**: nada; função pura com testes de unidade

### Agenda

- **Purpose**: Total do dia, bloco unido e aviso de sobreposição no modo do workspace (HOURS-09 a HOURS-14).
- **Location**: `frontend/src/lib/agenda/layout.ts`, `frontend/src/lib/agenda/join.ts`, `frontend/src/components/agenda/week-grid.tsx`, `frontend/src/pages/agenda.tsx`, `frontend/src/components/agenda/session-panel.tsx`, `frontend/src/components/agenda/session-move-confirm.tsx`
- **Interfaces**:
  - `dayTotal(pieces, mode: HoursCountMode = 'gross'): number` — `net`: `Math.floor(measure(tarefas.map(p => [p.start, p.end])) * 60)`
  - `joinNear(pieces, gapMinutes, mode = 'gross')` — `net`: `seconds` do bloco = `Math.floor(measure(members) * 60)`
  - `WeekGrid` recebe `hoursCountMode`; no `net`, o total ganha `title`/tooltip acessível `Horas líquidas · bruto: <dayTotal(pieces, 'gross')>`
  - Aviso: `session.overlap` (gross) e `session.overlapNet` (net)
- **Dependencies**: `measure`; `current.hours_count_mode`
- **Reuses**: tooltip das sessões (`Tooltip` já usado nos blocos)

### Barra do plano

- **Purpose**: Capacidade no modo do workspace (HOURS-27 a HOURS-31).
- **Location**: `frontend/src/lib/plan/capacity.ts`, `frontend/src/pages/plan.tsx`
- **Interfaces**:
  - `capacity(blocks, fixedTimed, workday, mode: HoursCountMode = 'gross'): Capacity` — `net`: `T = blocos de tarefa`, `S = agendadas sem bloco`, `B = pausas`, `W = expediente`; `planned = measure(T)`, `scheduled = measure(S, { within: W, exclude: T })`, `breaks = measure(B, { within: W, exclude: [...T, ...S] })`, `free = |W| - breaks - scheduled`, `over = max(0, planned - free)`
- **Dependencies**: `measure`; `current.hours_count_mode`
- **Reuses**: `inside`, `scheduledMinutes`, `minuteOfClock`

### Página de Relatórios

- **Purpose**: Avisar o modo líquido e mostrar o bruto (HOURS-18, HOURS-19).
- **Location**: `frontend/src/types/index.ts` (tipo do overview), `frontend/src/pages/reports*.tsx`, `frontend/src/components/reports/overview-tiles.tsx`
- **Interfaces**: lê `overview.hours_count_mode` (o modo que o servidor usou, não o do contexto, para o aviso nunca discordar dos números); `net` → aviso acima dos cards e `Bruto: <gross_task_seconds>` no card `Tempo trabalhado`
- **Dependencies**: Unidades líquidas dos Relatórios
- **Reuses**: `StatTile`, `formatDuration`

### Configuração na tela do workspace

- **Purpose**: Escolher o modo (HOURS-06 a HOURS-08).
- **Location**: `frontend/src/pages/workspace-settings.tsx`, `frontend/src/types/index.ts`, `frontend/src/lib/api.ts`, `frontend/src/locales/{pt-BR,en}.json`
- **Interfaces**: um card no padrão de `Formato de data` (`frontend/src/pages/admin/settings.tsx:428-478`): cabeçalho com ícone `Clock`, título e descrição, e uma linha por opção com rádio, nome, exemplo (`text-xs tabular-nums text-muted-foreground`) e explicação, dentro de um `role="radiogroup"` com `role="radio"` e `aria-checked` em cada linha; desabilitado sem `canManage`. Desenho: https://claude.ai/artifact/Lq85wA2HSJT7BVYpBBtC4r; a escolha chama `workspacesApi.update({ hours_count_mode })`, depois `refresh()` e `invalidateQueries()` como as configurações irmãs (HOURS-07)
- **Dependencies**: Coluna e API do modo
- **Reuses**: mutation e `canManage` existentes

---

## Data Models

```typescript
// backend-node/src/db/schema.ts
export type HoursCountMode = 'gross' | 'net'
// workspaces.hoursCountMode: HoursCountMode, NOT NULL, default 'gross'

// frontend/src/types/index.ts
interface Workspace {
  // ...
  hours_count_mode: 'gross' | 'net'
}

interface ReportOverview {
  // ...
  hours_count_mode: 'gross' | 'net'
  tiles: {
    work_days: number
    tasks_done: number
    task_seconds: number        // líquido no modo net
    gross_task_seconds: number  // sempre a soma bruta
    avg_seconds_per_task: number | null
  }
}
```

---

## Error Handling Strategy

| Error Scenario | Handling | User Impact |
| --- | --- | --- |
| `hours_count_mode` inválido ou `null` no `PATCH` | Zod recusa: 422; nada gravado | A tela só envia os dois valores válidos |
| Membro sem permissão envia o campo | `requireMembership(..., 'owner')`: 403 | Opções desabilitadas na tela |
| Falha ao gravar na tela | Mesmo tratamento das configurações irmãs (toast de erro e opção anterior marcada) | Vê o erro; o modo não muda |
| Período sem sessões de um tipo | `coalesce(range_agg(...), '{}')` evita `NULL` na diferença de multiranges | Zeros, como hoje |

---

## Risks & Concerns

| Concern | Location (file:line) | Impact | Mitigation |
| --- | --- | --- | --- |
| `range_agg` sem linhas devolve `NULL`, e `NULL - m` some com as pausas | `reports.ts` (CTEs novos) | Tempo de pausa zerado quando não há tarefa | `coalesce(..., '{}'::tstzmultirange)` nos dois CTEs; teste com só pausas no período (L-013) |
| Trechos vazios (`a = z`) viram `empty` no `tstzrange` | `reports.ts:143` já filtra `z > a` | Nenhum, se o filtro vier antes do `range_agg` | `WHERE z > a` dentro dos CTEs de multirange |
| O foco soma o tempo corrido no cliente sobre `spent_seconds` | `frontend/src/lib/focus/display.ts:32-37` | Se uma sessão manual cobrisse o futuro, o líquido do cliente erraria | Sessão manual não termina depois de agora + 5 s (`sessions.ts:99-103`); o trecho corrido depois da leitura nunca se sobrepõe. Sem mudança no cliente |
| Totais da Agenda medidos em minutos fracionários de `Piece` | `layout.ts:127-129` | Arredondar por pedaço no `net` perderia segundos | `net` mede `start`/`end` fracionários e arredonda uma vez (`Math.floor(min * 60)`) |
| `lists_time` passa a ler outro CTE (`s`) que os totais (`units`) | `reports.ts:158-162` | Listas trocarem para líquido por engano | Teste de rota com duas listas sobrepostas: listas 2h e 2h, total 3h (HOURS-17) |
| Testes de Relatórios com datas relativas a agora | `backend-node/test/routes/reports.test.ts` | Falhas na virada do dia (L-015) | Relógio fixo nos testes novos |
| Narrowing por item (L-048) | tempo gasto por tarefa | Uma tarefa com sobreposição não pode mudar o tempo de outra | Teste com duas tarefas, só uma com sessões sobrepostas |

---

## Tech Decisions (only non-obvious ones)

| Decision | Choice | Rationale |
| --- | --- | --- |
| Onde unir no backend | `range_agg` + `unnest` + diferença de multiranges | Escolha do usuário; SQL curto, mesmo comportamento no Postgres 16 e no PGlite 18 |
| Como o tempo gasto acha o modo | Join `tasks → lists → workspaces` dentro de `spentMilliseconds` | Nenhum chamador muda; prazo e `Estender` seguem o mesmo número (HOURS-25) |
| Uma consulta para os dois modos nos Relatórios | Ramos do `UNION ALL` filtrados pelo parâmetro do modo | Um caminho só para testar; o modo `gross` lê os mesmos CTEs de hoje |
| Fonte do modo na página de Relatórios | O campo da resposta, não o contexto | O aviso nunca discorda dos números da mesma resposta |
| Precedência no plano líquido | Blocos de tarefa > agendadas > pausas | Decisão do usuário: o trecho sobreposto conta como tarefa |
| Tipo da coluna | `varchar(5)` + `CHECK`, não enum do Postgres | Mesmo estilo das outras colunas; enum exige migration para cada valor novo |

Decisão de projeto registrada em `.specs/STATE.md` como **AD-010**.
