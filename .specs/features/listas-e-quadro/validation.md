## Validation: listas-e-quadro - PASS ✅

**Data**: 2026-10-25
**Spec**: `.specs/features/listas-e-quadro/spec.md`
**Diff range**: `5b4d09c..HEAD` (`HEAD` = `dc71d18`, branch `v2`). Desta feature são os 32 commits `407433d` … `2eac757`, a correção do débito `480dd72`, as correções da iteração 4 (`15ed2bf`, `a66745b`) e as duas da iteração 5: `9cee835` (backend, nome e cor gravados juntos) e `dc71d18` (frontend, soltar na área de `Esta semana`, refs issue #1). Os outros commits do range são de `foco-e-sons`, `widget-desktop` e `relatorios`; julguei só os ACs desta feature.
**Verifier**: sub-agente independente (autor ≠ verificador), evidence-or-zero. Iteração 6 (re-verificação final, com a regra de parada do orquestrador: rodar de novo todos os mutantes que já sobreviveram e no máximo 2 mutantes novos).

**Veredito**: PASS. Os gates estão verdes, os 35 ACs têm evidência e os 11 mutantes rodados nesta iteração morreram: os 9 que já tinham sobrevivido alguma vez (M12, M13, M21, M27, N2, B3, N7, N10, N11) e os 2 novos (X1, X2). Os dois commits de correção só acrescentam testes.

## Débito resolvido

A issue [gabrielauzier/trackzyn#1](https://github.com/gabrielauzier/trackzyn/issues/1) (ainda `OPEN`, só lida) pedia que o M27 quebrasse um teste e que M12, M13 e M21 continuassem morrendo. Isso está cumprido desde `480dd72` (função pura `dropTarget` com teste direto). O que faltava das iterações seguintes também fechou: `15ed2bf` prova na página o id `column:<coluna>` da área (N2) e `dc71d18` prova a área de `Esta semana`, na função e na página (N7 e N11). Nesta iteração os seis mutantes do arrasto morreram de novo. A issue pode ser fechada.

## Histórico

- Iteração 1 (`5b4d09c..776351f`): FAIL. 30/35 ACs, 12/14 mutantes mortos. Lacunas: LIST-03 (`0 tarefa pendente` em pt-BR), BOARD-06, BOARD-08, a UI da lista vazia, o selo do seletor (BOARD-01) e o ícone de check (BOARD-02). Sobreviveram M12 e M13.
- Iteração 2 (`5b4d09c..c3e0b4d`): FAIL. 34/35 ACs, 10/11 mortos. Lacuna nova: BOARD-03 no frontend, reordenar dentro da mesma coluna (M21 sobreviveu).
- Iteração 3 (`5b4d09c..2eac757`): FAIL. 34/35 ACs, 7/8 mortos. M21 morto; M27 sobreviveu (soltar na área de uma coluna com cartões). O usuário aceitou o risco e abriu a issue #1.
- Iteração 4 (`5b4d09c..d35779f`, correção da issue em `480dd72`): FAIL. 33/35 ACs, 12 mortos, 2 sobreviveram, 1 equivalente (N6). M27 morto. Sobreviveram N2 (id `column:<coluna>` da área na página) e B3 (reabrir apagava o tempo).
- Iteração 5 (`5b4d09c..a66745b`, fixes em `15ed2bf` e `a66745b`): FAIL. 33/35 ACs, 12 mutantes, 9 mortos, 3 sobreviveram (N7, N11 na área de `Esta semana`; N10 na cor gravada com nome e cor juntos).
- Iteração 6 (este relatório, `5b4d09c..dc71d18`, fixes em `9cee835` e `dc71d18`): PASS. 35/35 ACs, 11 mutantes, 11 mortos.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1–T26 | ✅ Done | 26 `✅ Done` em `tasks.md`. `git diff --stat a66745b..HEAD`: 3 arquivos, todos de teste (`backend-node/test/services/lists.test.ts` +6, `frontend/src/components/board/drop-target.test.ts` +5, `frontend/src/pages/list-board.test.tsx` +32), 43 inserções e 0 remoções. Nenhum código de produção mudou |

---

## Gate Check

- **Gate command** (Build, de `tasks.md`), rodado em sequência no checkout real, um passo de cada vez: `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test -- --coverage && npm --prefix frontend run lint && npm --prefix frontend run typecheck && npm --prefix frontend test && npm --prefix frontend run build`.
- **Exit codes**: backend lint 0, typecheck 0, test 0; frontend lint 0, typecheck 0, test 0, build 0 (`✓ built in 432ms`).
- **Backend**: 340 passed, 0 failed, 9 skipped (349); 34 arquivos passed, 1 skipped. Cobertura de linhas 87.4%.
- **Frontend**: 959 passed, 0 failed (121 arquivos).
- **Skipped**: os mesmos 9 de antes da feature, `describe.runIf(process.env.REDIS_URL)` em `backend-node/test/worker.test.ts` e `backend-node/test/ports/key-value-store.test.ts`. Não são desta feature.
- **Integridade dos testes**: `9cee835` acrescenta 1 `it` no backend; `dc71d18` acrescenta 1 `it` em `drop-target.test.ts` e 1 em `list-board.test.tsx`. Nenhum `it` ou `expect` removido ou enfraquecido.
- **Contagem**: antes da feature (`5b4d09c`) backend 98 + 9, frontend 483; iteração 5 backend 339 + 9, frontend 957; agora backend 340 + 9, frontend 959.

---

## Spec-Anchored Acceptance Criteria

Convenção: os testes de componente rodam em `en`. Onde a spec dá o texto em pt-BR, cito o teste em `pt-BR` ou a string de `frontend/src/locales/pt-BR.json`. Reabri em `HEAD` as linhas citadas. Desde a iteração 5, em `frontend/src/pages/list-board.test.tsx` as linhas depois de 325 desceram 32 (teste novo em 326-356); em `backend-node/test/services/lists.test.ts` as linhas depois de 140 desceram 6 (teste novo em 142-146); em `frontend/src/components/board/drop-target.test.ts` entrou o teste de 38-41. Os outros arquivos citados não mudaram.

### P1: Listas na home

| ID | Evidência `file:line` + asserção | Resultado definido pela spec | Status |
| -- | -------------------------------- | ---------------------------- | ------ |
| LIST-01 | `frontend/src/pages/home.test.tsx:71-73`: `findByRole('button',{name:'Create list'})`, `queryAllByRole('link')).toHaveLength(0)`; `frontend/src/components/app-layout.test.tsx:191-195`: `'Create new list'` com href `/?new=1`, `'All my lists'` com `aria-current="page"`, `'Archived lists'` sem `aria-current` | Só o cartão `Criar lista`; menu com as 3 entradas e `Todas as minhas listas` selecionada | ✅ |
| LIST-02 | `frontend/src/components/lists/greeting.test.ts:8-15` (fronteiras 0/4/5/11/12/17/18/23), `:22-24` (`America/Sao_Paulo`), `:35-42` (`'Boa madrugada, Ana'` … `'Hora de fechar o dia com calma.'`); `frontend/src/pages/home.test.tsx:98-99`, `:109-110` | Saudação do período no fuso do workspace, nome ou prefixo do e-mail, frase do período | ✅ |
| LIST-03 | `frontend/src/components/lists/list-card.test.tsx:40-42`, `:57` (`['0 tarefas pendentes','1 tarefa pendente','2 tarefas pendentes']`), `:67`; `frontend/src/components/lists/list-badge.test.tsx:11,17`; `frontend/src/pages/home.test.tsx:118-119`; `backend-node/test/services/lists.test.ts:73` (`position: 1`) | Cartão no fim com selo, nome, `⋮`, 4 linhas e `N tarefas pendentes` | ✅ |
| LIST-04 | `backend-node/test/routes/lists.test.ts:113-122` (422 `string_too_short`/`string_too_long` em `['body','name']`, cor 9 → 422); `frontend/src/components/lists/list-dialog.test.tsx:82-84` | 422 no formato existente; o diálogo fica aberto com a mensagem | ✅ |
| LIST-05 | `backend-node/test/services/lists.test.ts:93` (`['today 1','today 2','week 1','backlog 1']`), `:102`; `frontend/src/components/lists/list-card.test.tsx:67` | Hoje → Esta semana → Backlog, até 4, o resto vazio | ✅ |
| LIST-06 | `backend-node/test/services/lists.test.ts:112-118`; `backend-node/test/routes/lists.test.ts:203-205` (`['C','A','B']` relido); `frontend/src/pages/home.test.tsx:141` | A nova ordem persiste depois de recarregar | ✅ |
| LIST-07 | `backend-node/test/services/lists.test.ts:142-146` (novo, `9cee835`): `updateList(…,{ name: 'New', color: 5 })` e depois `expect(await getList(db, list.id, workspaceId)).toMatchObject({ name: 'New', color: 5 })`, relido do banco; `:135-140` (resposta com `color: 5`); `backend-node/test/routes/lists.test.ts:156-161` (`PATCH {name}`, `PATCH {color}`, `GET` relido `{name:'New',color:6}`); `frontend/src/components/lists/list-dialog.test.tsx:100` (o diálogo manda `{ name: 'Home', color: 2 }`) | Cartão e selo com os valores novos | ✅ (N10 morto) |
| LIST-08 | `backend-node/test/services/lists.test.ts:148-157`; `backend-node/test/routes/lists.test.ts:167-170`; `frontend/src/pages/archived-lists.test.tsx:53-55,73`; tempo mantido: `backend-node/test/services/focus-task-left.test.ts:72-79`, `backend-node/test/services/reports.test.ts:230-242` | Sai de `Todas`, aparece em `Arquivadas` com `Desarquivar`, e tarefas e tempo ficam | ✅ |
| LIST-09 | `backend-node/test/routes/lists.test.ts:232-235` (204 e `GET` 404 `{detail:'List not found'}`); `backend-node/test/db/lists-schema.test.ts:72` (`[0,0,0]`); `frontend/src/components/lists/list-card.test.tsx:102-106`; `backend-node/test/db/focus-schema.test.ts:68-72` | Apaga lista, tarefas, subtarefas e sessões; `GET /api/lists/:id` → 404 | ✅ |
| LIST-10 | `frontend/src/pages/home.test.tsx:150-155`; `frontend/src/components/lists/list-card.test.tsx:73`; `frontend/src/components/app-layout.test.tsx:213`; `backend-node/test/routes/lists.test.ts:129-130,188-189,219-220,242-243` (403 `READ_ONLY`) | Esconde as 5 ações; 403 `Read-only role` | ✅ |
| LIST-11 | `backend-node/test/services/lists.test.ts:175-187` (`getList` da outra lista inalterada, `listLists` → `['Mine']`); `backend-node/test/routes/lists.test.ts:143-144,190-191,221-224,244` | 404 | ✅ |

### P1: Quadro da lista

| ID | Evidência `file:line` + asserção | Resultado definido pela spec | Status |
| -- | -------------------------------- | ---------------------------- | ------ |
| BOARD-01 | `frontend/src/pages/list-board.test.tsx:212-216` (selo `data-slot="list-badge"` com `var(--chart-3)`, `'Back'` href `/`, `'This list has 1 pending task, Est.: 1hr'`, h2 na ordem); `:241` (`'Esta lista tem 0 tarefas pendentes, Est.: 0min'`); `backend-node/test/services/board.test.ts:82` | `Voltar`, seletor com selo, resumo e 4 colunas na ordem | ✅ |
| BOARD-02 | `frontend/src/components/board/board-column.test.tsx:29-30` (`lucide-circle-check`), `:45`; `frontend/src/pages/list-board.test.tsx:248-249` (`Tudo limpo`) | Ícone de check e `Tudo limpo` | ✅ |
| BOARD-03 | Backend: `backend-node/test/services/tasks.test.ts:86-106`; `backend-node/test/routes/tasks.test.ts:175-180`. Destino: `frontend/src/components/board/drop-target.test.ts:38-41` (novo: `dropTarget(board,'t1'/'w1','column:this_week')` → `{ column: 'this_week', before: null }`) e os testes de `column:today`, `column:backlog`, `column:done`. Página: `frontend/src/pages/list-board.test.tsx:326-356` (novo: soltar na área vazia de `Esta semana` → `move(TODAY_TASK,{column:'this_week',before_task_id:null})`, uma chamada, cartão em `[data-column="this_week"]`), `:293-324` (área vazia do Backlog), `:404-406,419-421` (mesma coluna), `:383` (de Concluídas para um cartão de Hoje), `:289` (para Concluídas) | A nova ordem e a nova coluna persistem depois de recarregar | ✅ (M27, M21, M13, N2, N7, N11 mortos) |
| BOARD-04 | `backend-node/test/services/board.test.ts:87` (`today {estimate_minutes:90, done:1, total:3}`); `frontend/src/components/board/board-column.test.tsx:61-63`; `frontend/src/locales/pt-BR.json:484` | Soma pendente de Hoje; x = concluídas hoje; y = x + pendentes | ✅ |
| BOARD-05 | `backend-node/test/services/board.test.ts:65-66` (`this_week {done:11,total:12}`, `today {done:0,total:1}`), `:85`; `frontend/src/components/board/board-column.test.tsx:78` | `11/12` e `0/1`; soma de Esta semana + Hoje | ✅ (X1 morto) |
| BOARD-06 | `frontend/src/pages/list-board.test.tsx:270` (`[['1','DEV-1725'],['2','DEV-1726'],['3','DEV-1727']]`); `frontend/src/components/board/task-card.test.tsx:47` | Cartões de Hoje numerados a partir de `1` | ✅ (M12 morto) |
| BOARD-07 | `frontend/src/pages/list-board.test.tsx:289` (arrastar) e `:430` (check): `move(id,{column:'done',before_task_id:null})`; `backend-node/test/services/tasks.test.ts:112`; `backend-node/test/services/board.test.ts:128,163-166`; `frontend/src/components/board/task-card.test.tsx:69-71` | Em `Concluídas`, riscada, sob o dia, com o tempo total gasto | ✅ |
| BOARD-08 | `frontend/src/pages/list-board.test.tsx:383-391`; `backend-node/test/services/tasks.test.ts:115-120` (`completedAt:null`); `backend-node/test/routes/tasks.test.ts:145-153`; `backend-node/test/services/board.test.ts:131-142` (sessões de 10 e 17 min mantidas, `[['reopened', 1620]]`) | Limpa a conclusão, volta a contar como pendente e mantém o tempo gasto | ✅ (M13, B3 mortos) |
| BOARD-09 | `backend-node/test/services/board.test.ts:162-166,174-175`; `frontend/src/components/board/board-column.test.tsx:152-160,178` | Só hoje e o último dia anterior, com `<dia>, <data>`, `N tarefas` e `N tarefas hoje` | ✅ (X2 morto) |
| BOARD-10 | `backend-node/test/services/board.test.ts:194`; `backend-node/src/services/focus-settle.ts:40` (`kind = 'task'`) | Intervalos fora de Concluídas | ✅ |
| BOARD-11 | `frontend/src/pages/list-board.test.tsx:519-521` | Troca de quadro sem passar pela home | ✅ |
| BOARD-12 | `frontend/src/components/board/board-column.test.tsx:93,115`; `frontend/src/locales/pt-BR.json:486` | Habilitado com pendente em Hoje | ✅ |
| BOARD-13 | `frontend/src/components/board/board-column.test.tsx:101` (`toBeDisabled()`) | Desabilitado sem pendente | ✅ |
| BOARD-14 | `frontend/src/pages/list-board.test.tsx:529-539,547` | Abaixo de 768px, uma coluna por vez com abas | ✅ |
| BOARD-15 | `frontend/src/pages/list-board.test.tsx:565-569`; `frontend/src/components/board/task-dialog.test.tsx:134-137`; `frontend/src/components/board/subtask-list.test.tsx:143-146`; `backend-node/test/routes/tasks.test.ts:78-82,135-139,183-190,206-210,245-256` (403) | Impede adicionar, mover, editar, concluir e focar; 403 | ✅ |
| BOARD-16 | `backend-node/test/services/board.test.ts:188-189` | As pendentes de Hoje ficam em Hoje | ✅ |

### P1: Tarefas, subtarefas e anotações

| ID | Evidência `file:line` + asserção | Resultado definido pela spec | Status |
| -- | -------------------------------- | ---------------------------- | ------ |
| TASK-01 | `backend-node/test/routes/tasks.test.ts:39-56`; `frontend/src/components/board/task-card.test.tsx:27-28`; `frontend/src/components/board/format-duration.test.ts:7,10,11` | Cartão no fim com título, `1h`/`1h 27min` e `0min` | ✅ |
| TASK-02 | `backend-node/test/routes/tasks.test.ts:59-75`; `frontend/src/components/board/add-task-form.test.tsx:113-114` | 422, e o formulário fica com a mensagem | ✅ |
| TASK-03 | `frontend/src/components/board/task-dialog.test.tsx:47-50,74,86`; `backend-node/test/routes/tasks.test.ts:113-120` | O diálogo edita título, estimativa, notas e subtarefas | ✅ |
| TASK-04 | `backend-node/test/routes/tasks.test.ts:123-132`; `frontend/src/components/board/task-dialog.test.tsx:62-63` | 422 e nada salvo | ✅ |
| TASK-05 | `backend-node/test/routes/tasks.test.ts:197-203`; `backend-node/test/db/lists-schema.test.ts:77`; `frontend/src/components/board/task-dialog.test.tsx:122-127`; `backend-node/test/db/focus-schema.test.ts:60-65` | Apaga tarefa, subtarefas e sessões; `GET /api/tasks/:id` → 404 | ✅ |
| TASK-06 | `backend-node/test/services/board.test.ts:99`; `frontend/src/components/board/task-card.test.tsx:97-103`; `frontend/src/components/board/subtask-list.test.tsx:63-64` | `x/y Subtarefas`, `+`, seta e marcar | ✅ |
| TASK-07 | `backend-node/test/routes/tasks.test.ts:233-241` | 422 | ✅ |
| TASK-08 | `backend-node/test/db/lists-schema.test.ts:37-48` (`ck_tasks_done_completed_at`); `backend-node/test/services/tasks.test.ts:69,112,119` | `done` ⇔ `completed_at` preenchido | ✅ |

**Status**: ✅ 35/35. Nenhum spec-precision gap.

---

## Edge Cases

| Edge Case | Evidência | Status |
| --------- | --------- | ------ |
| Reordenação concorrente: sem posições repetidas, vence a última gravação | `backend-node/test/services/tasks.test.ts:132-148`; `backend-node/test/services/lists.test.ts:130-132`. O PGlite tem uma conexão só, então o `FOR UPDATE` não roda sob concorrência real | ✅ |
| Id que não é UUID → 422 no formato existente | `backend-node/test/routes/lists.test.ts:146-148`; `backend-node/test/routes/tasks.test.ts:87-89,106-108,262-264` | ✅ |
| Lista sem tarefas: `Tudo limpo`, `0 tarefas hoje`, `Esta lista tem 0 tarefas pendentes, Est.: 0min` | `frontend/src/pages/list-board.test.tsx:241,248-252`; `backend-node/test/services/board.test.ts:193-200` | ✅ |
| Exportar/importar no modo local: mesmas contagens e ids | `backend-node/test/local/data-transfer.test.ts:73-79` | ✅ |

---

## Discrimination Sensor

Worktree descartável: `git worktree add --detach /private/tmp/claude-501/-Volumes-MacOnlySSD-dev-personal-trackzyn/60528454-ca38-4cbf-b7a4-1697855de074/scratchpad/verify-lq6 HEAD`, com `node_modules` de `frontend` e `backend-node` por symlink para os do checkout real. Antes dos mutantes a suíte limpa passou no worktree (frontend 959, backend 340 + 9). Cada mutante trocou uma única ocorrência do trecho (o script recusa 0 ou mais de 1), rodou `npx vitest run` no pacote inteiro e foi desfeito com `git checkout -- .` dentro do worktree. No fim apaguei os symlinks e rodei `git worktree remove --force`; `git worktree list` mostra só o checkout real e o worktree `docker-compose-access-issue` (não tocado). O `git status --porcelain` do checkout real ficou igual à linha de base (` M .specs/features/listas-e-quadro/validation.md`, o relatório anterior não commitado; `diff` → `STATUS_SAME`) antes de eu sobrescrever este relatório e a traceability de `spec.md`.

Regra de parada: os 9 mutantes que já sobreviveram em alguma iteração e 2 novos, nada além disso.

| Mutation | File:line | Descrição | Killed? |
| -------- | --------- | --------- | ------- |
| M12 (reteste) | `frontend/src/pages/list-board.tsx:152` | Numeração de Hoje começa em 0 (`index + 1` → `index`) | ✅ Killed (1: `numbers the Today cards from 1 in column order`) |
| M13 (reteste) | `frontend/src/components/board/drop-target.ts:33` | Arrastar de Concluídas não faz nada (`… \|\| from === 'done'`) | ✅ Killed (2: um em `list-board.test.tsx`, um em `drop-target.test.ts`) |
| M21 (reteste) | `frontend/src/components/board/drop-target.ts:43` | Reordenar na mesma coluna manda o vizinho errado (`+ 1` → `- 1`) | ✅ Killed (4) |
| M27 (reteste) | `frontend/src/components/board/drop-target.ts:38` | Soltar na área de uma coluna manda o primeiro cartão (`before: null` → `board.columns[to].tasks[0]?.id ?? null`) | ✅ Killed (3, em `drop-target.test.ts`, entre eles o novo de `Esta semana`) |
| N2 (reteste) | `frontend/src/pages/list-board.tsx:255` | A área da coluna perde o prefixo `column:` | ✅ Killed (2: áreas vazias do Backlog e de `Esta semana`) |
| N7 (reteste) | `frontend/src/components/board/drop-target.ts:22` | `dropTarget` não reconhece a área de `Esta semana` (tira `'this_week'` de `COLUMNS`) | ✅ Killed (2: `drop-target.test.ts:38` e `list-board.test.tsx:326`) |
| N11 (reteste) | `frontend/src/pages/list-board.tsx:255` | A página registra a área de `Esta semana` com o id da de `Hoje` | ✅ Killed (1: `moves a task dropped on the empty This week area to the end of This week`) |
| N10 (reteste) | `backend-node/src/services/lists.ts:111` | Nome e cor juntos gravam a cor antiga (`color: updated.color` → `color: given.name !== undefined ? list.color : updated.color`) | ✅ Killed (1: `LIST-07 persists the new name and color when both change together`) |
| B3 (reteste) | `backend-node/src/services/tasks.ts:122` | Reabrir apaga as sessões (linha nova `if (current.column === 'done' && target.column !== 'done') await tx.delete(focusSessions)…`) | ✅ Killed (1: `BOARD-08 a task reopened from done to today keeps…`) |
| X1 (novo) | `backend-node/src/services/board.ts:151` | O `y` de `Esta semana` deixa de contar as pendentes de Hoje (`+ thisWeek.length + todayTasks.length` → `+ thisWeek.length`) | ✅ Killed (3: 2 em `test/services/board.test.ts` BOARD-05/BOARD-01, 1 em `test/routes/board.test.ts`) |
| X2 (novo) | `backend-node/src/services/board.ts:137` | Os dias de Concluídas saem do mais antigo para o mais novo (`.sort().reverse()` → `.sort()`) | ✅ Killed (1: `BOARD-09 with completions today, yesterday and 3 days ago…`) |

**Sensor depth**: P0-full manual (9 retestes e 2 mutantes novos, no limite da regra de parada)
**Result**: 11 mutantes, 11 mortos, 0 sobreviveram, 0 equivalentes - PASS ✅

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ (`9cee835` e `dc71d18` só acrescentam testes) |
| Surgical changes | ✅ (3 arquivos de teste) |
| No scope creep | ✅ |
| Matches patterns | ✅ (teste de serviço com `create`/`getList` dos vizinhos; teste de página com o sensor de teclado, como o de `15ed2bf`) |
| Spec-anchored outcome check (asserted values match spec) | ✅ |
| Per-layer Coverage Expectation met | ✅ |
| Every test maps to a spec requirement | ✅ (os novos mapeiam para LIST-07 e BOARD-03) |
| Documented guidelines followed: `CONTRIBUTING.md`, `backend-node/vitest.config.ts`, `.github/workflows/ci.yml` | ✅ |

---

## Ranked gaps

Nenhum. Riscos residuais, que não são lacunas da spec:

1. O sensor desta iteração foi limitado pela regra de parada (9 retestes e 2 novos). As iterações anteriores mostraram que mutantes inventados de novo podiam sobreviver; nesta, os 2 novos morreram.
2. A reordenação concorrente só é provada no PGlite, que tem uma conexão só (o `FOR UPDATE` não roda sob concorrência real).
3. Os testes de arrasto da página usam o sensor de teclado; o caminho do ponteiro com `closestCorners` é coberto pela função pura `dropTarget`, não por um teste de ponteiro.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| LIST-01 … LIST-11 | Implementing | ✅ Verified |
| BOARD-01 … BOARD-16 | Implementing | ✅ Verified |
| TASK-01 … TASK-08 | Implementing | ✅ Verified |

As 35 linhas da tabela de traceability de `spec.md` agora estão como `| Tasks | Verified |`.

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 35/35 ACs batem com a spec; 4/4 Edge Cases; 0 spec-precision gaps
**Sensor**: 11 mutantes, 11 mortos, 0 sobreviveram
**Gate**: Build verde, todos os exit codes 0. Backend 340 passed / 9 skipped (Redis); frontend 959 passed; lint, typecheck e build ok

**O que funciona**: as duas lacunas da iteração 5 fecharam só com testes. A cor gravada com nome e cor juntos agora é relida do banco (N10 morto, LIST-07 ✅) e a área de `Esta semana` tem teste na função e na página (N7 e N11 mortos, BOARD-03 ✅). Todos os mutantes que já sobreviveram em alguma iteração morrem agora.

**Próximos passos**: fechar a issue #1 e commitar este relatório e a traceability de `spec.md` (o Verifier não commitou).
