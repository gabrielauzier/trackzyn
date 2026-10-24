# Foco e sons Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/foco-e-sons/design.md`
**Status**: Draft
**Pré-requisito**: `listas-e-quadro` concluída (usa `services/tasks.ts`, `services/lists.ts`, `services/board.ts` e a página do quadro).

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `CONTRIBUTING.md`, `backend-node/vitest.config.ts` (60% de linhas), `.github/workflows/ci.yml`. Onde os guias não definem profundidade, valem os padrões fortes da skill. Todo teste que depende de tempo usa `now` injetado (backend) ou `vi.useFakeTimers()` (frontend).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Schema e migrations | integration | Migration aplica; índice único parcial e cascatas provados | `backend-node/test/db/*.test.ts` | `npm --prefix backend-node test` |
| Serviços do backend | integration (PGlite) | Todos os ramos; 1:1 com os ACs; cada linha da tabela de transições; Edge Cases | `backend-node/test/services/*.test.ts` | `npm --prefix backend-node test` |
| Rotas do backend | integration (`app.inject`) | Toda rota: feliz + 409 + 422 + 403 `viewer` + reenvio do mesmo `action_id` | `backend-node/test/routes/*.test.ts` | `npm --prefix backend-node test` |
| Lógica pura do frontend (`lib/focus`, `lib/sounds`) | unit | Todos os ramos; a mesma tabela de transições do backend em `optimistic.ts` | `frontend/src/lib/**/*.test.ts` | `npm --prefix frontend test` |
| Hooks do frontend | unit (`renderHook` + timers falsos) | Polling, heartbeat, fila, `beforeunload`/`pagehide` | `frontend/src/lib/**/*.test.tsx` | `npm --prefix frontend test` |
| Componentes e páginas | unit (Testing Library) | Cada AC visível e cada diálogo | `frontend/src/**/*.test.tsx` | `npm --prefix frontend test` |
| Desktop main e preload | unit (fakes de Electron) | Todos os ramos | `desktop/src/**/*.test.ts` | `npm --prefix desktop test` |
| Cliente HTTP e tipos | none | build gate (typecheck) | - | `npm --prefix frontend run typecheck` |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Tasks com testes de unidade de um pacote | `npm --prefix frontend test` ou `npm --prefix desktop test` |
| Full | Tasks do backend, hooks e páginas | `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test -- --coverage` (backend) ou `npm --prefix frontend run lint && npm --prefix frontend run typecheck && npm --prefix frontend test` (frontend) ou `npm --prefix desktop run lint && npm --prefix desktop run typecheck && npm --prefix desktop test` (desktop) |
| Build | Fim de cada fase e tasks de tipos | os três Full acima + `npm --prefix frontend run build` |

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Sessões e liquidação

```
T1 → T2 → T3
T2 → T4
T2 → T5
```

### Phase 2: Transições no servidor

```
T6 → T7 → T8 → T9 → T10
```

### Phase 3: Foco no cliente

```
T11 → T13 → T14 → T17 → T18
T12 → T15 → T17
T13 → T17
T16 → T17
```

### Phase 4: Sons

```
T20 → T23
T19 → T24
T20 → T24
T21 → T24
T22 → T24
```

### Phase 5: Tela de foco

```
T25 → T31 → T32 → T33
T26 → T32
T27 → T32
T28 → T32
T29 → T32
T30 → T32
```

### Phase 6: Fechar o desktop com a tarefa contando

```
T34 → T35 → T36
```

---

## Task Breakdown

### Phase 1: Sessões e liquidação

#### T1: Tabelas focus_sessions e focus_actions com a migration 0002

**What**: Adicionar `focus_sessions` e `focus_actions` ao schema como no design (índice único parcial `(user_id) WHERE ended_at IS NULL`, índices `(user_id, started_at)` e `(task_id)`, cascatas de user, workspace, list e task), gerar `drizzle/0002_focus.sql`, atualizar as provas de `test/db/` e regenerar `pg-columns.json`.
**Where**: `backend-node/src/db/schema.ts`
**Depends on**: None
**Reuses**: tabelas de `listas-e-quadro` T1
**Requirement**: SYNC-01

**Tools**:

- MCP: NONE
- Skill: `supabase-postgres-best-practices`

**Done when**:

- [x] Inserir duas sessões abertas para o mesmo usuário falha; uma aberta e uma fechada passam (SYNC-01)
- [x] Excluir tarefa, lista ou usuário apaga as sessões dele
- [x] Gate check passes: Full (backend)
- [x] Test count: a contagem do backend só aumenta

**Status**: ✅ Done

**Tests**: integration
**Gate**: full

**Commit**: `feat(db): add focus sessions and actions tables`

---

#### T2: Liquidação e tempo gasto

**What**: `settle(tx, userId, now)` (fecha com `ended_at = deadline_at` e `end_reason` `estimate` ou `break_end`; apaga `focus_actions` com mais de 24h) e `spentSeconds(tx, taskIds, now)`.
**Where**: `backend-node/src/services/focus-settle.ts`
**Depends on**: T1
**Reuses**: nada
**Requirement**: FOCUS-10, FOCUS-11, BREAK-03, BREAK-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Sessão com prazo vencido é fechada exatamente no prazo, também quando `settle` roda 2h depois (FOCUS-11, BREAK-05)
- [x] Sessão sem prazo, ou com prazo no futuro, continua aberta; `spentSeconds` soma sessões fechadas e a aberta até `now`
- [x] Gate check passes: Full (backend)
- [x] Test count: a contagem do backend só aumenta

**Status**: ✅ Done

**Tests**: integration
**Gate**: full

**Commit**: `feat(api): settle due focus sessions`

---

#### T3: Tempo gasto no quadro

**What**: `spentSecondsByTask` de `services/board.ts` passa a usar `spentSeconds`, depois de liquidar o usuário.
**Where**: `backend-node/src/services/board.ts`
**Depends on**: T2
**Reuses**: `focus-settle.ts`
**Requirement**: TASK-01, BOARD-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tarefa com sessões de 10min e 17min mostra `spent_seconds` 1620 no quadro e na coluna Concluídas
- [x] Gate check passes: Full (backend)
- [x] Test count: a contagem do backend só aumenta

**Status**: ✅ Done

**Tests**: integration
**Gate**: full

**Commit**: `feat(api): show time spent on the board`

---

#### T4: Encerrar o foco quando a tarefa sai de Hoje

**What**: Em `services/tasks.ts`, mover para fora de `today` ou concluir pelo quadro encerra a sessão aberta da tarefa com `end_reason = 'task_left'` no mesmo instante.
**Where**: `backend-node/src/services/tasks.ts`
**Depends on**: T2
**Reuses**: transação de `move`
**Requirement**: FOCUS-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Mover a tarefa em foco para `this_week` fecha a sessão no horário do movimento; mover outra tarefa não mexe na sessão
- [x] Gate check passes: Full (backend)
- [x] Test count: a contagem do backend só aumenta

**Status**: ✅ Done

**Tests**: integration
**Gate**: full

**Commit**: `feat(api): end focus when its task leaves today`

---

#### T5: Encerrar o foco ao arquivar a lista

**What**: Em `services/lists.ts`, arquivar a lista encerra a sessão aberta nela com `end_reason = 'task_left'`.
**Where**: `backend-node/src/services/lists.ts`
**Depends on**: T2
**Reuses**: `archive` de `listas-e-quadro` T3
**Requirement**: FOCUS-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Arquivar a lista com tarefa ou intervalo em foco fecha a sessão no horário do arquivamento
- [x] Gate check passes: Full (backend)
- [x] Test count: a contagem do backend só aumenta

**Status**: ✅ Done

**Tests**: integration
**Gate**: full

**Commit**: `feat(api): end focus when its list is archived`

---

### Phase 2: Transições no servidor

#### T6: Leitura do estado do foco

**What**: `readFocusState(tx, user, listId, now)` → `FocusState` (sessão aberta, tarefa em foco ou primeira de Hoje com `spent_seconds` e `awaiting_extend`, totais de Hoje, `stale` quando a sessão está sem sinal há mais de 120 s).
**Where**: `backend-node/src/services/focus-state.ts`
**Depends on**: T2
**Reuses**: `focus-settle.ts`, `services/board.ts` (pendentes de Hoje)
**Requirement**: FOCUS-02, FOCUS-10, FOCUS-13, FOCUS-14, SYNC-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Testes: tarefa com última sessão `estimate` → `awaiting_extend = true`; gasto acima da estimativa sem prazo → `false`; `last_seen_at` há 121 s → `stale` preenchido, há 119 s → `null`
- [x] Gate check passes: Full (backend)
- [x] Test count: a contagem do backend só aumenta

**Status**: ✅ Done

**Tests**: integration
**Gate**: full

**Commit**: `feat(api): read the focus state`

---

#### T7: Moldura das ações, start e pause

**What**: `applyAction` (trava o usuário, devolve a resposta guardada para `action_id` repetido, valida `occurred_at` com +5 s de tolerância, anterior à última mudança e 24h, liquida, aplica e grava `focus_actions`), mais as ações `start` (com `focus_elsewhere`, `takeover` na mesma tarefa e troca de tarefa) e `pause`. Cria `docs/focus-transitions.json`, a tabela de casos (estado, ação, resultado) que os testes do backend e do frontend usam.
**Where**: `backend-node/src/services/focus.ts`
**Depends on**: T6
**Reuses**: `focus-state.ts`, `HttpError`
**Requirement**: FOCUS-02, FOCUS-04, FOCUS-05, FOCUS-18, SYNC-01, SYNC-02, SYNC-03, SYNC-04, SYNC-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Cada linha `start`/`pause` da tabela de casos vira um teste; `deadline_at` = início + (estimativa − gasto)
- [x] Mesmo `action_id` duas vezes → mesma resposta e uma sessão só; `occurred_at` 6 s no futuro, anterior à última mudança ou com 25h → 422 `invalid_time`
- [x] Duas chamadas `start` simultâneas deixam uma sessão aberta (SYNC-01)
- [x] Gate check passes: Full (backend)
- [x] Test count: a contagem do backend só aumenta

**Status**: ✅ Done

**Tests**: integration
**Gate**: full

**Commit**: `feat(api): apply focus start and pause actions`

---

#### T8: Ações skip, complete e extend

**What**: `skip` (fim de Hoje, próxima começa; 409 com uma só pendente), `complete` (para `done` com `completed_at = occurred_at`, próxima começa ou nenhuma sessão) e `extend` (só em `awaiting_extend`, sessão sem prazo).
**Where**: `backend-node/src/services/focus.ts`
**Depends on**: T7
**Reuses**: `move` de `services/tasks.ts`
**Requirement**: FOCUS-06, FOCUS-07, FOCUS-08, FOCUS-09, FOCUS-12, FOCUS-13, FOCUS-18

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Cada linha `skip`/`complete`/`extend` da tabela de casos vira um teste; concluir tarefa já concluída → 409 sem mudar `completed_at`
- [x] Gate check passes: Full (backend)
- [x] Test count: a contagem do backend só aumenta

**Status**: ✅ Done

**Tests**: integration
**Gate**: full

**Commit**: `feat(api): apply focus skip, complete and extend actions`

---

#### T9: Intervalo, heartbeat e recuperação

**What**: `break` (1–120 min, encerra a sessão da tarefa, abre `break` com prazo), `break/end` (registra o tempo decorrido), `heartbeat` (atualiza `last_seen_at` da sessão deste `device_id`) e `recover` (`keep` atualiza o sinal, `cut` fecha em `last_seen_at`).
**Where**: `backend-node/src/services/focus.ts`
**Depends on**: T8
**Reuses**: moldura de T7
**Requirement**: BREAK-01, BREAK-02, BREAK-03, BREAK-04, SYNC-10, SYNC-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Cada linha de intervalo e recuperação da tabela de casos vira um teste; `break` com 0 e 121 → 422
- [x] `recover cut` com último sinal às 10:00 fecha a sessão às 10:00
- [x] Gate check passes: Full (backend)
- [x] Test count: a contagem do backend só aumenta

**Status**: ✅ Done

**Tests**: integration
**Gate**: full

**Commit**: `feat(api): apply focus break, heartbeat and recover actions`

---

#### T10: Rotas de foco

**What**: `GET /api/focus` e os `POST /api/focus/*` do design, com zod e `requireWrite` nas ações, registradas em `src/app.ts`.
**Where**: `backend-node/src/routes/focus.ts`
**Depends on**: T9
**Reuses**: `routes/files.ts`
**Requirement**: FOCUS-17, FOCUS-18, BREAK-02, SYNC-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Toda rota: caminho feliz, 409 (`invalid_transition`, `focus_elsewhere`), 422, 403 `viewer`, reenvio do mesmo `action_id`
- [x] Toda resposta traz `server_now`
- [x] Gate check passes: Build
- [x] Test count: a contagem do backend só aumenta

**Status**: ✅ Done

**Tests**: integration
**Gate**: build

**Commit**: `feat(api): add the focus routes`

---

### Phase 3: Foco no cliente

#### T11: Relógio corrigido

**What**: `updateOffset(serverNow)` e `serverNow()` com a diferença para o servidor.
**Where**: `frontend/src/lib/focus/clock.ts`
**Depends on**: None
**Reuses**: nada
**Requirement**: FOCUS-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Teste: com o relógio local 5 min adiantado ou atrasado, `serverNow()` fica a menos de 1 s do servidor
- [x] Gate check passes: Quick
- [x] Test count: a contagem do frontend só aumenta

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): correct the local clock against the server`

---

#### T12: Id do dispositivo

**What**: `deviceId()` gera e guarda um UUID em `localStorage['trackzyn.device']`.
**Where**: `frontend/src/lib/focus/device-id.ts`
**Depends on**: None
**Reuses**: nada
**Requirement**: SYNC-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Teste: duas chamadas devolvem o mesmo id; `localStorage` limpo gera outro
- [x] Gate check passes: Quick
- [x] Test count: a contagem do frontend só aumenta

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): identify the device`

---

#### T13: O que o cronômetro mostra

**What**: `deriveDisplay(state, nowMs)` → modo (`countdown`, `countup`, `awaiting_extend`, `break`, `paused`, `idle`, `all_clear`) e segundos.
**Where**: `frontend/src/lib/focus/display.ts`
**Depends on**: T11
**Reuses**: nada
**Requirement**: FOCUS-02, FOCUS-03, FOCUS-10, FOCUS-12, FOCUS-13, FOCUS-14, FOCUS-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Testes: 1h de estimativa com 10 min gastos → `countdown` 3000; extend → `countup` a partir de 3600; sem estimativa → `countup` do gasto; intervalo de 5 min → `break` 300
- [x] Gate check passes: Quick
- [x] Test count: a contagem do frontend só aumenta

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): derive the focus timer display`

---

#### T14: Transição otimista

**What**: `applyOptimistic(state, action, nowMs)`, a mesma transição do servidor, para mostrar a ação sem conexão.
**Where**: `frontend/src/lib/focus/optimistic.ts`
**Depends on**: T13
**Reuses**: `docs/focus-transitions.json` (de T7)
**Requirement**: SYNC-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Cada linha da tabela de casos produz o mesmo resultado que o servidor
- [x] Gate check passes: Quick
- [x] Test count: a contagem do frontend só aumenta

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): apply focus actions optimistically`

---

#### T15: Fila offline

**What**: `enqueue`, `flush(send)`, `pending`, `conflicts`, `retry`, `discard` sobre `localStorage['trackzyn.focus.queue']`; descarta o que passa de 24h; 409/422 viram conflito; erro de rede mantém na fila.
**Where**: `frontend/src/lib/focus/queue.ts`
**Depends on**: T12
**Reuses**: nada
**Requirement**: SYNC-05, SYNC-06, SYNC-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Testes: ação de 24h01 descartada com aviso; 409 vira conflito com `retry` e `discard`; erro de rede mantém a ordem; recarregar a página mantém a fila
- [x] Gate check passes: Quick
- [x] Test count: a contagem do frontend só aumenta

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): queue focus actions while offline`

---

#### T16: Cliente HTTP e tipos do foco

**What**: Funções de foco em `lib/api.ts` e o tipo `FocusState`.
**Where**: `frontend/src/lib/api.ts`
**Depends on**: T10
**Reuses**: instância axios
**Requirement**: FOCUS-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tipos batem com a resposta de `GET /api/focus`
- [x] Gate check passes: Build
- [x] Test count: a contagem do frontend não diminui

**Status**: ✅ Done

**Tests**: none
**Gate**: build

**Commit**: `feat(web): add the focus api client`

---

#### T17: Hook useFocus

**What**: `useFocus(listId)`: consulta com `refetchInterval` de 15 s e ao focar a janela, ações pela fila com estado otimista, `updateOffset` em cada resposta e heartbeat a cada 60 s enquanto a sessão aberta é deste dispositivo.
**Where**: `frontend/src/lib/focus/use-focus.tsx`
**Depends on**: T13, T14, T15, T16
**Reuses**: QueryClient que já existe
**Requirement**: FOCUS-03, SYNC-05, SYNC-10

**Tools**:

- MCP: NONE
- Skill: `react-best-practices`

**Done when**:

- [x] Testes com timers falsos: heartbeat em 60 s e 120 s só para a sessão deste dispositivo; ação sem rede aparece na hora e é enviada quando a rede volta
- [x] Gate check passes: Full (frontend)
- [x] Test count: a contagem do frontend só aumenta

**Status**: ✅ Done

**Tests**: unit
**Gate**: full

**Commit**: `feat(web): add the focus hook`

---

#### T18: Proteção ao sair da página

**What**: `useLeaveGuard`: `beforeunload` com a tarefa contando e, em `pagehide`, `fetch('/api/focus/pause', { keepalive: true })` com `occurred_at` do fechamento.
**Where**: `frontend/src/lib/focus/use-leave-guard.tsx`
**Depends on**: T17
**Reuses**: cabeçalhos de `lib/api.ts`
**Requirement**: SYNC-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Testes: com a tarefa contando, `beforeunload` é cancelado e `pagehide` chama `fetch` com `keepalive` e token; pausada, nada acontece
- [x] Gate check passes: Build
- [x] Test count: a contagem do frontend só aumenta

**Status**: ✅ Done

**Tests**: unit
**Gate**: build

**Commit**: `feat(web): pause focus when the page closes`

---

### Phase 4: Sons

#### T19: Síntese dos 4 sons

**What**: `play(kind)` com Web Audio: `complete` (arpejo ascendente de 3 notas), `progress` (1 nota curta), `estimate` (2 notas descendentes), `break_end` (3 batidas iguais); retoma o `AudioContext` no primeiro `pointerdown`.
**Where**: `frontend/src/lib/sounds/synth.ts`
**Depends on**: None
**Reuses**: nada
**Requirement**: SOUND-05, SOUND-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Testes com `AudioContext` falso: cada som agenda uma sequência de frequências diferente das outras 3
- [x] Gate check passes: Quick
- [x] Test count: a contagem do frontend só aumenta

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): synthesize the focus sounds`

---

#### T20: Interruptores de som

**What**: `isEnabled(kind)` e `setEnabled(kind, on)` em `localStorage['trackzyn.sounds']`, todos ligados por padrão.
**Where**: `frontend/src/lib/sounds/prefs.ts`
**Depends on**: None
**Reuses**: nada
**Requirement**: SOUND-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Testes: padrão ligado; desligar `progress` não afeta os outros e sobrevive a recarregar
- [x] Gate check passes: Quick
- [x] Test count: a contagem do frontend só aumenta

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): store sound switches per device`

---

#### T21: Quando tocar

**What**: `soundsFor(prev, next)` → sons a tocar entre dois quadros do cronômetro.
**Where**: `frontend/src/lib/sounds/triggers.ts`
**Depends on**: None
**Reuses**: tipos de `lib/focus/display.ts`
**Requirement**: SOUND-01, SOUND-02, SOUND-03, SOUND-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Testes: gasto 599 → 600 toca `progress`; 600 → 601 não; passagem para `awaiting_extend` toca `estimate`; `break` → `paused` sem ação toca `break_end`; tarefa concluída toca `complete`; intervalos nunca tocam `progress`
- [x] Gate check passes: Quick
- [x] Test count: a contagem do frontend só aumenta

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): decide when focus sounds play`

---

#### T22: Qual janela toca

**What**: `shouldPlayHere()`: sempre no navegador; no desktop, decide pelo `windowRole` e pelo estado do widget (o widget estende em `widget-desktop`).
**Where**: `frontend/src/lib/sounds/gate.ts`
**Depends on**: None
**Reuses**: `lib/platform.ts`
**Requirement**: SOUND-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Testes: sem `window.trackzyn` → `true`; janela principal sem widget → `true`
- [x] Gate check passes: Quick
- [x] Test count: a contagem do frontend só aumenta

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): pick the window that plays sounds`

---

#### T23: Ajustes de som

**What**: Popover do ícone de ajustes da tela de foco com os 4 interruptores.
**Where**: `frontend/src/components/focus/sound-settings.tsx`
**Depends on**: T20
**Reuses**: `ui/popover`, `ui/switch`
**Requirement**: SOUND-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Teste: os 4 interruptores refletem e alteram `prefs`
- [x] Gate check passes: Quick
- [x] Test count: a contagem do frontend só aumenta

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): add the sound settings`

---

#### T24: Hook de sons do foco

**What**: `useFocusSounds(display)` liga `triggers`, `gate`, `prefs` e `synth`, e expõe `playComplete()` para o quadro.
**Where**: `frontend/src/lib/sounds/use-focus-sounds.tsx`
**Depends on**: T19, T20, T21, T22
**Reuses**: `lib/focus/display.ts`
**Requirement**: SOUND-01, SOUND-02, SOUND-03, SOUND-04, SOUND-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Testes com timers falsos: tarefa de 11 min toca `progress` aos 10 min e `estimate` aos 11, uma vez cada; som desligado não toca
- [x] Gate check passes: Build
- [x] Test count: a contagem do frontend só aumenta

**Status**: ✅ Done

**Tests**: unit
**Gate**: build

**Commit**: `feat(web): play focus sounds`

---

### Phase 5: Tela de foco

#### T25: Seletor de intervalo

**What**: Atalhos de 5, 10 e 15 min e campo livre de 1 a 120.
**Where**: `frontend/src/components/focus/break-picker.tsx`
**Depends on**: None
**Reuses**: `ui/popover`, `ui/input`
**Requirement**: BREAK-01, BREAK-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Testes: atalho de 10 envia 10; campo com 0 e 121 bloqueia; 120 envia
- [x] Gate check passes: Quick
- [x] Test count: a contagem do frontend só aumenta

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): add the break picker`

---

#### T26: Aviso de fim da estimativa

**What**: `00:00:00` com `Estender` e `Concluir`.
**Where**: `frontend/src/components/focus/extend-prompt.tsx`
**Depends on**: None
**Reuses**: `ui/button`
**Requirement**: FOCUS-10, FOCUS-12

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Testes: os dois botões chamam `extend` e `complete`
- [ ] Gate check passes: Quick
- [ ] Test count: a contagem do frontend só aumenta

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): add the estimate reached prompt`

---

#### T27: Diálogo de outro dispositivo

**What**: "Você já está focando em outro dispositivo." com `Assumir` e `Cancelar`.
**Where**: `frontend/src/components/focus/elsewhere-dialog.tsx`
**Depends on**: None
**Reuses**: `ui/dialog`
**Requirement**: SYNC-02, SYNC-03, SYNC-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Testes: `Assumir` reenvia `start` com `takeover: true`; `Cancelar` fecha sem ação
- [ ] Gate check passes: Quick
- [ ] Test count: a contagem do frontend só aumenta

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): ask before taking over focus from another device`

---

#### T28: Diálogo de sessão sem sinal

**What**: Mostra quanto tempo contou desde o último sinal e oferece `Manter` e `Cortar no último sinal`.
**Where**: `frontend/src/components/focus/stale-session-dialog.tsx`
**Depends on**: None
**Reuses**: `ui/dialog`, `format-duration`
**Requirement**: SYNC-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Testes: `stale.seconds` 754 mostra `12min`; os botões chamam `recover` com `keep` e `cut`
- [ ] Gate check passes: Quick
- [ ] Test count: a contagem do frontend só aumenta

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): resolve sessions left open by a crash`

---

#### T29: Conflitos da fila offline

**What**: Lista das ações recusadas com `Tentar de novo` e `Descartar`, e o aviso de descarte de 24h.
**Where**: `frontend/src/components/focus/offline-conflicts.tsx`
**Depends on**: None
**Reuses**: `lib/focus/queue.ts`, `ui/sonner`
**Requirement**: SYNC-06, SYNC-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Testes: um conflito mostra a ação e os dois botões; ação de 24h mostra o aviso
- [ ] Gate check passes: Quick
- [ ] Test count: a contagem do frontend só aumenta

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): show offline focus conflicts`

---

#### T30: Cartão da tarefa em foco

**What**: Contorno destacado, título e cronômetro `HH:MM:SS` a partir de `display`.
**Where**: `frontend/src/components/focus/focus-task-card.tsx`
**Depends on**: None
**Reuses**: `lib/focus/display.ts`
**Requirement**: FOCUS-02, FOCUS-03, FOCUS-13

**Tools**:

- MCP: NONE
- Skill: `frontend-design`

**Done when**:

- [ ] Testes: 3000 s mostra `00:50:00`; `countup` de 3601 mostra `01:00:01`
- [ ] Gate check passes: Quick
- [ ] Test count: a contagem do frontend só aumenta

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): add the focused task card`

---

#### T31: Controles do foco

**What**: `Pausar`/`Retomar`, `Pular` (desabilitado com uma pendente), `Concluir`, `Intervalo` e `Encerrar intervalo`.
**Where**: `frontend/src/components/focus/focus-controls.tsx`
**Depends on**: T25
**Reuses**: `ui/button`, `break-picker`
**Requirement**: FOCUS-04, FOCUS-05, FOCUS-06, FOCUS-07, FOCUS-08, BREAK-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Testes: cada botão chama a ação certa; `Pular` desabilitado com `today.pending = 1`; em intervalo só aparece `Encerrar intervalo`
- [ ] Gate check passes: Quick
- [ ] Test count: a contagem do frontend só aumenta

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): add the focus controls`

---

#### T32: Página de foco

**What**: `/focus/:listId` como o print `03-foco.png` (seletor de lista, `Hoje`, ícones de ajustes, home e recolher, `Est.`, barra, pendentes, `+ Adicionar tarefa`), com `useFocus`, `useFocusSounds`, `useLeaveGuard` e os diálogos; registrada em `App.tsx`.
**Where**: `frontend/src/pages/focus.tsx`
**Depends on**: T26, T27, T28, T29, T30, T31
**Reuses**: `add-task-form`, `ui/progress`, `list-badge`
**Requirement**: FOCUS-01, FOCUS-09, FOCUS-15, FOCUS-16, SYNC-12

**Tools**:

- MCP: NONE
- Skill: `react-composition-patterns`

**Done when**:

- [ ] Testes: abrir chama `start` na primeira de Hoje; última concluída mostra `Tudo limpo`; tarefa sumida volta ao quadro; ícone de home volta ao quadro sem pausar; reabrir o app com tarefa pausada não abre esta página (SYNC-12)
- [ ] Gate check passes: Full (frontend)
- [ ] Test count: a contagem do frontend só aumenta

**Tests**: unit
**Gate**: full

**Commit**: `feat(web): add the focus page`

---

#### T33: Quadro ligado ao foco

**What**: Em `list-board.tsx`, `Focar agora` navega para `/focus/:listId`, o cartão em foco aparece destacado com o tempo correndo e concluir pelo check toca o som de conclusão.
**Where**: `frontend/src/pages/list-board.tsx`
**Depends on**: T32
**Reuses**: `useFocus`, `useFocusSounds`
**Requirement**: FOCUS-16, SOUND-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Testes: `Focar agora` navega; check de concluir chama `playComplete` uma vez
- [ ] Gate check passes: Build
- [ ] Test count: a contagem do frontend só aumenta

**Tests**: unit
**Gate**: build

**Commit**: `feat(web): link the board to focus`

---

### Phase 6: Fechar o desktop com a tarefa contando

#### T34: Ponte do estado do foco

**What**: Canais `focus:state` e `focus:pause-request` e os membros `reportFocusState` e `onPauseRequest` em `TrackzynApi` e no preload; atualizar o comentário e os testes que contam os membros.
**Where**: `desktop/src/shared/ipc.ts`
**Depends on**: None
**Reuses**: padrão de `onExportState`
**Requirement**: SYNC-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Testes do preload: os membros novos existem e chamam os canais certos; a contagem fixada passa a 15
- [ ] Gate check passes: Full (desktop)
- [ ] Test count: a contagem do desktop só aumenta

**Tests**: unit
**Gate**: full

**Commit**: `feat(desktop): bridge the focus state`

---

#### T35: Diálogo ao fechar

**What**: `registerFocusClose(mainWindow, deps)`: no `close` da janela principal com `running`, cancela, mostra "Há uma tarefa contando." com `Pausar e sair` e `Cancelar`; `Pausar e sair` pede a pausa ao renderer, espera até 3 s e fecha. Chamado em `main/index.ts`.
**Where**: `desktop/src/main/focus-close.ts`
**Depends on**: T34
**Reuses**: `trustedHandle`, `dialog.showMessageBox`
**Requirement**: SYNC-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Testes com fakes: sem tarefa contando fecha direto; `Cancelar` mantém aberto; `Pausar e sair` fecha depois da resposta ou depois de 3 s sem resposta
- [ ] Gate check passes: Full (desktop)
- [ ] Test count: a contagem do desktop só aumenta

**Tests**: unit
**Gate**: full

**Commit**: `feat(desktop): ask before closing with a running task`

---

#### T36: Renderer responde ao desktop

**What**: `useDesktopFocusBridge`: envia `reportFocusState` a cada mudança e atende `onPauseRequest` com a ação `pause`; usado na página de foco.
**Where**: `frontend/src/lib/focus/use-desktop-bridge.tsx`
**Depends on**: T35
**Reuses**: `useFocus`, `lib/platform.ts`
**Requirement**: SYNC-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Testes com `window.trackzyn` falso: estado enviado ao pausar e retomar; pedido de pausa chama `pause` e resolve; sem `window.trackzyn` não faz nada
- [ ] Gate check passes: Build
- [ ] Test count: a contagem do frontend só aumenta

**Tests**: unit
**Gate**: build

**Commit**: `feat(web): answer desktop focus requests`

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | - | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3, T4, T5 | T2 | T2 → T3, T2 → T4, T2 → T5 | ✅ Match |
| T6 | T2 (fase anterior) | - | ✅ Match |
| T7, T8, T9, T10 | T6, T7, T8, T9 | cadeia T6 → T10 | ✅ Match |
| T11, T12 | None | - | ✅ Match |
| T13 | T11 | T11 → T13 | ✅ Match |
| T14 | T13 | T13 → T14 | ✅ Match |
| T15 | T12 | T12 → T15 | ✅ Match |
| T16 | T10 (fase anterior) | - | ✅ Match |
| T17 | T13, T14, T15, T16 | T13/T14/T15/T16 → T17 | ✅ Match |
| T18 | T17 | T17 → T18 | ✅ Match |
| T19–T22 | None | - | ✅ Match |
| T23 | T20 | T20 → T23 | ✅ Match |
| T24 | T19, T20, T21, T22 | T19/T20/T21/T22 → T24 | ✅ Match |
| T25–T30 | None | - | ✅ Match |
| T31 | T25 | T25 → T31 | ✅ Match |
| T32 | T26–T31 | T26/T27/T28/T29/T30/T31 → T32 | ✅ Match |
| T33 | T32 | T32 → T33 | ✅ Match |
| T34 | None | - | ✅ Match |
| T35 | T34 | T34 → T35 | ✅ Match |
| T36 | T35 | T35 → T36 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Schema e migrations | integration | integration | ✅ OK |
| T2–T9 | Serviços do backend | integration | integration | ✅ OK |
| T10 | Rotas do backend | integration | integration | ✅ OK |
| T11–T15, T19–T22 | Lógica pura do frontend | unit | unit | ✅ OK |
| T16 | Cliente HTTP e tipos | none | none | ✅ OK |
| T17, T18, T24, T36 | Hooks do frontend | unit | unit | ✅ OK |
| T23, T25–T33 | Componentes e páginas | unit | unit | ✅ OK |
| T34, T35 | Desktop main e preload | unit | unit | ✅ OK |
