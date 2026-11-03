# Relatórios Validation

## Validation: relatorios - PASS ✅

**Date**: 2026-10-26 (rodada entre 00:31 e 00:38 UTC)
**Spec**: `.specs/features/relatorios/spec.md`
**Diff range**: `73f6dfe..HEAD` (HEAD = `a07c464`, branch `v2`, 32 commits: T16, T1–T15 e as correções das iterações 2 a 7; 57 arquivos, +4624/−115)
**Mudanças desta iteração** (`748113d..HEAD`): `a07c464`. Em `backend-node/src/services/reports.ts:191`, a média passou a vir de `taskSeconds` (o total truncado), e não mais de `row.task_exact`. Entrou o teste novo `backend-node/test/services/reports.test.ts:130-145`, a linha nova "Arredondamento dos totais" nas Assumptions do `spec.md` e a Nota de T1 em `tasks.md`.
**Verifier**: sub-agente independente (autor ≠ verificador), re-verificação final, iteração 7

**Verdict**: PASS ✅

Motivo: os três mutantes vivos da iteração 6 (R1, R3, R7) agora morrem pelo teste novo `reports.test.ts:130`. O Build gate deu exit 0 em todos os comandos. Os 23 ACs estão ✅, e a regra nova de arredondamento está provada valor a valor. O teste de rota continua independente do relógio às `00:05:00.500Z`. O sensor matou as 6 mutações, sem nenhuma equivalente.

---

## Histórico

- **Iteração 1** (HEAD `c9face6`): FAIL. 22/23 ACs; REPORT-23 parcial ("sem o menu lateral" sem prova). Sensor com 34/38 mortos; sobreviveram M2, M16, M30 e M31.
- **Iteração 2** (HEAD `80f940e`): FAIL. M2, M16, M30 e M31 morreram. 23/23 ACs, com um spec-precision gap em REPORT-20. Das 22 mutações, 14 morreram, 2 eram equivalentes (N16, N17) e 6 sobreviveram (N1, N2, N6, N8, N12, N18).
- **Iteração 3** (HEAD `4c7c243`): FAIL. Os 6 sobreviventes morreram. Das 12 mutações novas, 11 morreram e 1 sobreviveu (P9). A regra de REPORT-20 ficou para o usuário decidir.
- **Iteração 4** (HEAD `48bbf7c`): FAIL. O usuário decidiu cortar a aba Sessões na meia-noite, e P9 morreu. Das 13 mutações do SQL novo, 11 morreram e 2 sobreviveram (S7, S13). O teste `routes/reports.test.ts:112` ficou dependente do relógio.
- **Iteração 5** (HEAD `99e0a04`): FAIL. S7, S13 e o teste de sessões da rota resolvidos; 11/11 mutações mortas. Apareceu uma lacuna nova de gate: `routes/reports.test.ts:55` falhava entre 00:00 e ~00:10 UTC, porque truncar por dia deixava `task_seconds` 1 s abaixo.
- **Iteração 6** (HEAD `748113d`): FAIL. Gate verde e independente do relógio; 23/23 ACs. Das 10 mutações do arredondamento novo, 7 morreram e 3 ficaram vivas (R1, R3, R7). O usuário ainda precisava decidir de onde sai a média.
- **Iteração 7** (HEAD `a07c464`, este relatório): PASS. O usuário decidiu que a média sai do `Tempo trabalhado` exibido. Com o teste novo, R1, R3 e R7 morrem: 6/6 mutações mortas.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T16, T1–T15 | ✅ Done | T1 conforme a Nota nova (média do total truncado), provada por `reports.test.ts:143` |

---

## Gate Check

Build gate de `tasks.md` rodado no checkout real (HEAD `a07c464`), backend e frontend em sequência, sem o sensor rodando ao mesmo tempo.

| Comando | Exit | Resultado |
| ------- | ---- | --------- |
| `npm --prefix backend-node run lint` | 0 | limpo (00:31:48 UTC) |
| `npm --prefix backend-node run typecheck` | 0 | limpo |
| `npm --prefix backend-node test -- --coverage` (**00:31:52–00:33:28 UTC**) | 0 | 34 arquivos passaram, 1 pulado; 337 passaram, 9 pulados; linhas 87,4% (1748/2000; mínimo 60%) |
| `npm --prefix frontend run lint` | 0 | limpo |
| `npm --prefix frontend run typecheck` | 0 | limpo |
| `npm --prefix frontend test` | 0 | 120 arquivos, 944 testes passaram |
| `npm --prefix frontend run build` | 0 | `✓ built in 453ms` (00:33:55 UTC) |

- O teste do backend rodou às 00:32 UTC, perto da janela da meia-noite que antes falhava, e passou. O relógio falso mais abaixo cobre a janela inteira.
- **Testes pulados**: os 9 de `backend-node/test/ports/key-value-store.test.ts:94` (`describe.runIf(process.env.REDIS_URL)`). São anteriores à feature.
- **Contagem**: backend 336 → 337 (+1: `services/reports.test.ts:130`); frontend 944 → 944. Nenhum teste removido.
- Uma primeira tentativa do gate deu exit 1 em todos os comandos em 0 s. A causa foi o laço do script: o zsh não divide `$c` em palavras, então o `npm` recebeu um argumento só. Os testes não chegaram a rodar. A rodada da tabela acima chamou cada comando explicitamente.

### Integridade dos testes (`git diff 748113d..HEAD -- '*.test.*'`)

- `--numstat`: `17 0 backend-node/test/services/reports.test.ts`. São 17 linhas novas e nenhuma removida: um `it` novo (`:130-145`) com `toEqual` em `daily` (`:139-141`), `toEqual` no `tiles` inteiro (`:143`) e `toBe(H)` em `break_seconds` (`:144`). Nenhuma asserção mudou nem ficou mais fraca.

### Independência do relógio (`routes/reports.test.ts`)

Fiz uma cópia do arquivo no worktree de rascunho, com `vi.useFakeTimers({ toFake: ['Date'] })` e `vi.setSystemTime(...)` no topo, e rodei com `npx vitest run`.

| Relógio | Código | Resultado |
| ------- | ------ | --------- |
| `2026-10-26T00:05:00.500Z` | HEAD `a07c464` | 5/5 passaram (exit 0) |
| `2026-10-26T00:00:30.250Z` | HEAD | 5/5 passaram (exit 0) |
| `2026-10-26T12:00:00.500Z` | HEAD | 5/5 passaram (exit 0) |
| `2026-10-26T00:05:00.500Z` | `reports.ts` de `99e0a04` (controle) | **1 falhou**: `expected 599 to be greater than or equal to 600` |

O controle com o código antigo prova que o relógio falso pegou a janela.

---

## Spec-Anchored Acceptance Criteria

Desde `748113d`, só `services/reports.test.ts` mudou entre os testes. As linhas a partir de `:130` deslocaram +17, e as citações abaixo foram reabertas no HEAD. Os outros arquivos de teste não mudaram (`git diff --stat 748113d..HEAD`: 4 arquivos, nenhum do frontend), então as citações deles são as da iteração 6.

### Linha nova das Assumptions: "Arredondamento dos totais"

| Regra | `file:line` + asserção | Resultado |
| ----- | ---------------------- | --------- |
| `Tempo trabalhado` = soma exata, truncada uma vez (3600,6 s → 3600, não 3601) | código `reports.ts:173` (`task_exact` = `sum(sec)`), `:183` `Math.floor(row.task_exact)`; teste `reports.test.ts:143` `task_seconds: H`; `:126` `task_seconds: H` (soma exata acima da soma dos dias) | ✅ |
| Intervalos = soma exata, truncada uma vez (dias 1799 + 1800 = 3599; exata 3600) | código `reports.ts:174` `floor(coalesce(sum(sec),0))` sobre todos os pedaços; teste `reports.test.ts:144` `expect(report.break_seconds).toBe(H)` | ✅ |
| Cada dia do gráfico truncado à parte | código `reports.ts:151-152`; teste `reports.test.ts:139-141` `day('2026-10-20', 30*M-1)`, `day('2026-10-21', 30*M+1)`, `day('2026-10-22', 0, 30*M-1)`, `day('2026-10-23', 0, 30*M)`; `:125` | ✅ |
| Média = `Tempo trabalhado` exibido ÷ concluídas, arredondada | código `reports.ts:191` `Math.round(taskSeconds / row.tasks_done)`; teste `reports.test.ts:93` (3601 / 2 → `1801`), `:94` (10 / 3 → `3`), `:275` (`30*M` / 2 → `15*M`) | ✅ |
| Nunca passa do total com uma tarefa só | `reports.test.ts:143` `avg_seconds_per_task: H` com `task_seconds: H` e soma exata de 3600,6 s (pela regra antiga daria 3601) | ✅ |

### P2: Visão geral

| Critério | Resultado definido pela spec | `file:line` + asserção | Resultado |
| -------- | ---------------------------- | ---------------------- | --------- |
| REPORT-01 abre pelo menu com `Visão geral`, `Todas as listas`, segunda→hoje e os 4 cartões | aba selecionada; `Todas as listas`; `2026-10-19..2026-10-25`; cartões | `frontend/src/pages/reports.test.tsx:82,90,91,92`; `frontend/src/lib/reports.test.ts:11,15,19,25`; `frontend/src/components/reports/overview-tiles.test.tsx:23-26` | ✅ |
| REPORT-02 1h30 seg + 2h qua + 10min de intervalo + 2 concluídas | `2`, `2`, `3h 30min`, `1h 45min` | `backend-node/test/services/reports.test.ts:67` `toEqual({work_days:2,tasks_done:2,task_seconds:3*H+30*M,avg_seconds_per_task:H+45*M})`; `:93`, `:104`, `:126`, `:143`; `overview-tiles.test.tsx:23-26` (`/^Média por tarefa1h 45min$/` em `:26`); `pages/reports.test.tsx:96-97`; `reports-sessions.test.ts:133` `tiles.task_seconds + break_seconds).toBe(listed)` | ✅ |
| REPORT-03 sem tarefa concluída | `—` | `reports.test.ts:80` `avg_seconds_per_task: null`; `:223`; `overview-tiles.test.tsx:33` `/^Média por tarefa—$/` | ✅ |
| REPORT-04 barras com `Tarefas`, `Intervalos`, `Total` | 3 séries por dia; Total = soma | `daily-chart.test.tsx:33` `toEqual(['Tarefas','Intervalos','Total'])`, `:34`, `:70`; `reports.test.ts:68`, `:125`, `:139-141` (cada dia truncado à parte, com intervalos por dia) | ✅ |
| REPORT-05 mais produtivos com empates | `18–19h`, `Segunda e quarta`, `out. de 2026` | `lib/reports.test.ts:39,52,60`; `reports.test.ts:207` `toEqual({hours:[10,16],weekdays:[1,3],months:['2026-09','2026-10']})`; `productive-cards.test.tsx:21-23,30` | ✅ |
| REPORT-06 rosca por lista + `Intervalos` | `1 lista, Tempo total: 17h 2min`; `99%`/`1%` | `time-by-list.test.tsx:31,32`; `reports.test.ts:240`, `:257`, `:127`, `:244` `break_seconds).toBe(5*M)` | ✅ |
| REPORT-07 filtro de lista recalcula tudo | só a lista | `reports.test.ts:275-279,439`; `reports-sessions.test.ts:196` `toEqual([id])`; `routes/reports.test.ts:93-95`; `pages/reports.test.tsx:110` | ✅ |
| REPORT-08 arquivadas no filtro e contadas | `Projeto antigo arquivada` | `report-filters.test.tsx:99`; `reports.test.ts:240` | ✅ |
| REPORT-09 só o usuário logado (AD-006) | outro membro fora | `reports.test.ts:67,167,439`; `reports-sessions.test.ts:40,53`; `routes/reports.test.ts:62` | ✅ |
| REPORT-10 23:30→00:30 | 30min em cada dia | `reports.test.ts:112` `toEqual(quietWeek(day('2026-10-20',30*M), day('2026-10-21',30*M)))`; `:113` | ✅ |
| REPORT-11 sessão aberta conta até a consulta | 45min | `reports.test.ts:151` `toBe(45*M)`; `:152`; `reports-sessions.test.ts:74` | ✅ |
| REPORT-12 período sem sessão | `0`, `0min`, `—`; `Sem atividade no período` em 3 lugares | `overview-tiles.test.tsx:39-41`; `pages/reports.test.tsx:138` `toHaveLength(3)`; `reports.test.ts:223-227`; `productive-cards.test.tsx:36-39` | ✅ |
| REPORT-13 período invertido ou > 366 dias | 422; 367 → 422, 366 → 200; filtro mantido | `routes/reports.test.ts:72,76,80,125-127`; `report-filters.test.tsx:124-129` | ✅ |

### P2: Antes ou depois da estimativa

| Critério | Resultado definido pela spec | `file:line` + asserção | Resultado |
| -------- | ---------------------------- | ---------------------- | --------- |
| REPORT-14 por dia de conclusão, mais recente primeiro, `N tarefas` | ordem e contagem | `reports.test.ts:344-357,370`; `done-vs-estimate.test.tsx:48-50` | ✅ |
| REPORT-15 até 5% → `No prazo` | 58 e 63 de 60 | `reports.test.ts:355` (`'on_time', -2*M`), `:381`; `done-vs-estimate.test.tsx:57,67` | ✅ |
| REPORT-16 > 5% abaixo → `<dif> antes` | `10min antes` | `reports.test.ts:355` (`'early', -10*M`); `done-vs-estimate.test.tsx:56,66` | ✅ |
| REPORT-17 > 5% acima → `<dif> depois` | `20min depois` | `reports.test.ts:349` (`'late', 20*M`); `done-vs-estimate.test.tsx:59,68` | ✅ |
| REPORT-18 sem estimativa → sem selo, fora das % | 75/25 | `reports.test.ts:348` (`null, null`), `:358-359`, `:413`; `done-vs-estimate.test.tsx:69` | ✅ |
| REPORT-19 5 verdes/6 vermelhos | `45,45%` e `54,55%` | `reports.test.ts:395` `toBe(45.45)`, `:396` `toBe(54.55)`, `:405-406` (3,13/96,87); `done-vs-estimate.test.tsx:83-86` | ✅ |

### P2: Aba Sessões

| Critério | Resultado definido pela spec | `file:line` + asserção | Resultado |
| -------- | ---------------------------- | ---------------------- | --------- |
| REPORT-20 sessões do período por dia, cortadas na meia-noite local, pedaços fora do período omitidos | 3 sessões + 1 intervalo; 23:30–00:00 e 00:00–00:30 com `30*M`; dias de 23 e 25 h; sessão de duração zero uma vez com `0` | `reports-sessions.test.ts:53`; `:123`; `:132-133`; `:145,152`; `:163`; `:172`; `sessions-table.test.tsx:56,60`; `pages/reports.test.tsx:119-120` | ✅ |
| REPORT-21 sessão aberta → `em andamento` | `ended_at` nulo só no último pedaço | `reports-sessions.test.ts:74,91`; `sessions-table.test.tsx:73`; `routes/reports.test.ts:114` | ✅ |
| REPORT-22 sem sessão → `Sem atividade no período` | texto | `reports-sessions.test.ts:186` `{days: []}`; `sessions-table.test.tsx:80` | ✅ |

**Observação, não lacuna**: uma sessão ainda aberta num período que já terminou aparece com o fim no limite do período, e não com `em andamento`, porque o último pedaço dela fica fora do período (`reports-sessions.ts:45`). Isso segue a Nota de T3; a spec não fala desse caso.

### P3: Exportar PDF

| Critério | Resultado definido pela spec | `file:line` + asserção | Resultado |
| -------- | ---------------------------- | ---------------------- | --------- |
| REPORT-23 abre a impressão com a visão geral, período e lista no topo, sem menu lateral | `window.print`; cabeçalho; menu oculto; botão só na `Visão geral` | `pages/reports.test.tsx:154` `toHaveBeenCalledTimes(1)`; `:165`; `:171-172,177`; `print-header.test.tsx:20-22`; `frontend/src/components/app-layout.test.tsx:223-224` `toHaveClass('print-hidden')`; `:231` `getComputedStyle(sidebar).display).toBe('none')` | ✅ |

**Verificação manual residual (não é lacuna)**: o layout impresso **não foi conferido à mão** no Chrome, no Safari nem no Electron. Paginação, margens e quebra dos gráficos não têm prova; o jsdom só prova as classes e o `display` (L-012).

**Status**: 23/23 ✅.

---

## Edge Cases

- [x] **Período de um dia**: `reports.test.ts:216-217`; `daily-chart.test.tsx:46`; `routes/reports.test.ts:83`.
- [x] **Lista excluída no filtro**: `report-filters.test.tsx:143-146`; 404 em `reports.test.ts:286`, `reports-sessions.test.ts:200-201`, `routes/reports.test.ts:99-100`.
- [x] **Concluída no período com tempo de antes**: `reports.test.ts:426` `spent_seconds: 80*M, verdict 'late'`; `:427` `task_seconds: 10*M`.
- [x] Corte nas bordas e horário de verão (visão geral): `reports.test.ts:177-178,193-198`.
- [x] **Sessão que atravessa a meia-noite na aba Sessões**: `reports-sessions.test.ts:123`, `:91`.
- [x] **Horário de verão na aba Sessões** (AD-004): `reports-sessions.test.ts:145,152`.
- [x] **Sessão de duração zero**: `reports-sessions.test.ts:172`.
- [x] **Sessão aberta que cruza a meia-noite UTC no teste de rota**: `routes/reports.test.ts:55` passa com relógio falso às 00:05:00.500Z e às 00:00:30.250Z.
- [x] **Frações de segundo no total, na média e nos intervalos** (lacuna da iteração 6): `reports.test.ts:130-145` (fechada nesta iteração).

---

## Integração do AD-006 fora dos relatórios

Arquivos sem mudança desde `80f940e`.

| Caminho | Prova | Resultado |
| ------- | ----- | --------- |
| Quadro: mover para `done` grava quem moveu | `backend-node/test/routes/tasks.test.ts:162` `toBe(editor.id)` | ✅ |
| Quadro: criar direto em `done` | `routes/tasks.test.ts:166` `toBe(owner.id)` | ✅ |
| Reordenar dentro de `done` mantém quem concluiu | `routes/tasks.test.ts:168` | ✅ |
| Sair de `done` limpa; CHECK | `routes/tasks.test.ts:172` `toBeNull()`; `backend-node/test/db/completed-by-schema.test.ts:45-47` | ✅ |
| Foco `complete` grava quem concluiu | `backend-node/test/routes/focus.test.ts:234` | ✅ |
| Widget | `frontend/src/components/focus/widget-controls.tsx:105,133` → `POST /api/focus/complete` | ✅ (por composição) |
| Excluir o usuário deixa nulo; tarefas anteriores sem dono | `completed-by-schema.test.ts:50,72` | ✅ |
| Tempo do selo soma todos os membros | `reports.test.ts:426` | ✅ |

---

## Discrimination Sensor

Scratch: `git worktree add .../scratchpad/verify-rp7 HEAD` (HEAD `a07c464`), com `backend-node/node_modules` em symlink para o checkout real. Linha de base no rascunho: 42/42 em `test/services/reports.test.ts`, `test/services/reports-sessions.test.ts` e `test/routes/reports.test.ts`. Cada mutação foi aplicada sozinha por troca exata de texto (o script confere que há uma ocorrência só). Depois rodaram os 3 arquivos com `npx vitest run`, e o arquivo voltou com `git checkout -- <arquivo>` no rascunho. A rodada foi de 00:34 a 00:37 UTC.

| # | File:line | Mutação | Resultado |
| - | --------- | ------- | --------- |
| R1 | `reports.ts:183` | `Math.floor(row.task_exact)` → `Math.round(row.task_exact)` | ✅ Killed (`reports.test.ts:143`, `tiles`) |
| R2 | `reports.ts:183` | `Math.floor` → `Math.ceil` | ✅ Killed (`reports.test.ts:143`; `routes/reports.test.ts`, `by_list`) |
| R3 | `reports.ts:191` | média de `row.task_exact` (soma exata) em vez de `taskSeconds` | ✅ Killed (`reports.test.ts:143`, 3601 ≠ 3600) |
| R7 | `reports.ts:174` | `break_seconds` = soma dos dias truncados (`SELECT coalesce(sum(break_seconds),0)::int FROM by_day`) | ✅ Killed (`reports.test.ts:144`: `expected 3599 to be 3600`) |
| M2 (controle) | `reports.ts:243` | `late_pct` calculado à parte em vez de `100 - green` | ✅ Killed (`reports.test.ts:406`: `expected 96.88 to be 96.87`) |
| S13 (controle) | `reports-sessions.ts:40` | fim do pedaço = instante da meia-noite + 24 h | ✅ Killed (`reports-sessions.test.ts:136`, teste AD-004 de horário de verão) |

Além das mutações, rodei o teste de rota com relógio falso (veja Gate Check): passa às `00:05:00.500Z` no HEAD, e o controle com o código de `99e0a04` falha.

**Sensor depth**: expandido (4 mutações no arredondamento + 2 controles de mutantes mortos antes).
**Result**: 6 mutações, 6 mortas, 0 sobreviveram, 0 equivalentes.

Limpeza: o symlink de `node_modules` e a cópia do teste com relógio foram removidos, e `git worktree remove --force` deu exit 0. `git worktree list` mostra só o checkout real e `trackzyn.worktrees/docker-compose-access-issue`, que não foi tocada. O `git status --porcelain` do checkout real ficou igual à linha de base (`M .specs/LESSONS.md`, `M .specs/lessons.json`, `?? .specs/features/relatorios/validation.md`), e os `node_modules` reais continuam no lugar. Depois da limpeza, só este relatório e o `spec.md` (Traceability) foram escritos.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code / surgical changes | ✅ (`reports.ts` +2/−2, um teste, uma linha de Assumption, a Nota) |
| No scope creep | ✅ |
| Matches patterns | ✅ (mesmo `quietWeek`, `day`, `toEqual` inteiro) |
| Spec-anchored outcome check | ✅ 23/23 + a linha nova das Assumptions |
| Testes determinísticos | ✅ (rota provada com relógio falso em 3 horários) |
| Testes discriminam a regra documentada | ✅ 6/6 mutações mortas |
| Every test maps to a requirement | ✅ (o título do teste novo cita REPORT-02 e REPORT-04) |
| Documented guidelines followed | ✅ `CONTRIBUTING.md`, `backend-node/vitest.config.ts` (60%) |

---

## Ranked Gaps / Fix Plans

Nenhuma lacuna aberta. O que fica é residual e não bloqueia:

1. **Manual (residual)**: conferir à mão o layout impresso de `Exportar PDF` no Chrome, no Safari e no Electron (paginação, margens, quebra dos gráficos).
2. **Observação**: uma sessão aberta num período já terminado aparece na aba Sessões com o fim no limite do período, e não com `em andamento`. Isso segue a Nota de T3, e a spec não fala desse caso.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| REPORT-01 a REPORT-23 | Implementing | Verified |
| REPORT-23 | Implementing | Verified (jsdom; layout impresso para conferir à mão) |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 23/23 ACs batem com o resultado da spec, e a linha "Arredondamento dos totais" está provada.
**Gate**: lint, typecheck, testes e build com exit 0 (backend 337 passaram e 9 pulados às 00:31:52–00:33:28 UTC; frontend 944).
**Sensor**: 6 mutações, 6 mortas, 0 sobreviveram.

**What works**: o total e os intervalos saem da soma exata, truncada uma vez. Cada dia do gráfico é truncado à parte. A média sai do total exibido e não passa dele com uma tarefa só. O teste de rota não depende do horário. Tudo o que as iterações 1 a 6 provaram continua valendo.

**Next steps**: conferir à mão a impressão no Chrome, no Safari e no Electron.
