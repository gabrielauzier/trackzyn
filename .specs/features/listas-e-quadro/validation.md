# Validation: listas-e-quadro - FAIL ❌

**Data**: 2026-10-24
**Spec**: `.specs/features/listas-e-quadro/spec.md`
**Diff range**: `5b4d09c..HEAD` (32 commits, `407433d` … `2eac757`, branch `v2`; a correção da iteração 2 é o commit `2eac757`)
**Verifier**: sub-agente independente (autor ≠ verificador), evidence-or-zero. Re-verificação, iteração 3 de 3 (a última).

**Veredito**: FAIL. Os gates estão verdes e a lacuna da iteração 2 está fechada: o M21 agora morre nos dois testes novos de reordenação dentro de Hoje. Dos 7 mutantes novos, 6 morreram. Sobreviveu o M27: ao soltar uma tarefa na área vazia de uma coluna de pendentes que já tem cartões, o quadro deveria mandar `before_task_id: null` (a tarefa vai para o fim). O mutante manda o id do primeiro cartão (a tarefa vai para o topo), e nenhum teste do frontend percebe. Esta foi a 3ª iteração de correção e re-verificação, então a lacuna vai para o usuário em vez de abrir mais uma rodada.

## Risco aceito

- **Decisão**: o usuário aceitou o risco da lacuna M27 (BOARD-03 no frontend) em 2026-10-24, depois da 3ª iteração, e pediu para seguir para `foco-e-sons`.
- **Registro**: débito técnico em [gabrielauzier/trackzyn#1](https://github.com/gabrielauzier/trackzyn/issues/1) (label `tech-debt`), com a correção sugerida (extrair o cálculo do destino do arrasto para uma função pura e testá-la).
- **Efeito**: o veredito continua FAIL e `validate_state.py` continua reprovando esta feature até a issue ser resolvida e o Verifier rodar de novo. O código está correto pela leitura; falta o teste que o proteja.

**Histórico**
- Iteração 1 (`5b4d09c..776351f`): FAIL. 30/35 ACs, 12/14 mutantes mortos. Lacunas: LIST-03 (`0 tarefa pendente` em pt-BR), BOARD-06, BOARD-08, a UI da lista vazia, o selo do seletor (BOARD-01) e o ícone de check (BOARD-02). Sobreviveram M12 e M13.
- Iteração 2 (`5b4d09c..c3e0b4d`): FAIL. 34/35 ACs, 10/11 mutantes mortos. As lacunas da iteração 1 foram fechadas. Lacuna nova: BOARD-03 no frontend, reordenar dentro da mesma coluna (M21 sobreviveu).
- Iteração 3 (este relatório, `5b4d09c..2eac757`): M21 morto. Lacuna nova em BOARD-03 no frontend: soltar na área da coluna, que deveria mandar a tarefa para o fim (M27 sobreviveu).

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1–T26 | ✅ Done | Todas marcadas `✅ Done` em `tasks.md`. As correções vieram como commits `fix`/`test` fora da lista de tasks; `2eac757` só mexe em `frontend/src/pages/list-board.test.tsx` (+70 −4) |

---

## Gate Check

- **Gate command** (Build, de `tasks.md`): `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test -- --coverage && npm --prefix frontend run lint && npm --prefix frontend run typecheck && npm --prefix frontend test && npm --prefix frontend run build`
- **Result**: exit 0. Lint e typecheck ok nos dois pacotes; build do frontend ok (`✓ built in 441ms`)
- **Backend**: 171 passed, 0 failed, 9 skipped (180); 24 arquivos passed, 1 skipped. Cobertura de linhas: 85.72% (1477/1723)
- **Frontend**: 597 passed, 0 failed (81 arquivos)
- **Skipped**: os mesmos 9 de antes da feature, `describe.runIf(process.env.REDIS_URL)` em `backend-node/test/worker.test.ts` e `backend-node/test/ports/key-value-store.test.ts`. Não são desta feature
- **Contagem antes da feature** (`5b4d09c`, medida na iteração 1): backend 98 + 9 skipped; frontend 483
- **Contagem depois**: backend 171 + 9; frontend 597 (595 na iteração 2)
- **Delta**: +73 backend, +114 frontend. Desde a iteração 2 entraram 2 testes. `layOutColumns()` ganhou um parâmetro opcional que mantém o comportamento antigo como padrão, e nenhuma asserção foi removida ou enfraquecida

---

## Spec-Anchored Acceptance Criteria

Convenção: os testes de componente rodam em `en`. Onde a spec dá o texto em pt-BR, cito o teste que roda em `pt-BR` ou a string exata de `frontend/src/locales/pt-BR.json`. Reabri cada linha citada em `HEAD` (`2eac757`). Desde a iteração 2 só `frontend/src/pages/list-board.test.tsx` mudou, e as linhas dele foram renumeradas abaixo.

### P1: Listas na home

| ID | Evidência `file:line` + asserção | Resultado definido pela spec | Status |
| -- | -------------------------------- | ---------------------------- | ------ |
| LIST-01 | `frontend/src/pages/home.test.tsx:71-73`: `findByRole('button',{name:'Create list'})`, `queryAllByRole('link')).toHaveLength(0)`; `frontend/src/components/app-layout.test.tsx:137-141`: `'Create new list'` com href `/?new=1`, `'All my lists'` com `aria-current="page"`, `'Archived lists'` sem `aria-current` | Só o cartão `Criar lista`; menu com as 3 entradas e `Todas as minhas listas` selecionada | ✅ |
| LIST-02 | `frontend/src/components/lists/greeting.test.ts:8-15`: fronteiras 0/4/5/11/12/17/18/23; `:22-24`: hora em `America/Sao_Paulo`; `:35-42`: `'Boa madrugada, Ana'` … `'Hora de fechar o dia com calma.'`; `frontend/src/pages/home.test.tsx:98-99`: `'Good evening, Ana'` e a frase; `:109-110`: `'Good morning, joao.silva'` | Saudação do período no fuso do workspace, `display_name` ou prefixo do e-mail, e a frase do período | ✅ |
| LIST-03 | `frontend/src/components/lists/list-card.test.tsx:40-42`: `getByText('W')`, link `'week'`, `'5 pending tasks'`; `:57`: em pt-BR, `toEqual(['0 tarefas pendentes','1 tarefa pendente','2 tarefas pendentes'])`; `:67`: `['Write the report','Review the PR','','']`; `frontend/src/components/lists/list-badge.test.tsx:11,17`: inicial e `var(--chart-3)`; `frontend/src/pages/home.test.tsx:118-119`: cartões antes de `Create list`; `backend-node/test/services/lists.test.ts:73`: `position: 1` | Cartão no fim com selo, nome, `⋮`, 4 linhas e `N tarefas pendentes` | ✅ |
| LIST-04 | `backend-node/test/routes/lists.test.ts:113-122`: 422 com `string_too_short`/`string_too_long` em `['body','name']`, cor 9 → 422; `frontend/src/components/lists/list-dialog.test.tsx:82-84`: `alert` com a mensagem, `dialog` aberto, `onClose` não chamado | 422 no formato existente, e o diálogo fica aberto com a mensagem | ✅ |
| LIST-05 | `backend-node/test/services/lists.test.ts:93`: `['today 1','today 2','week 1','backlog 1']`; `:102`: `['only one']`; `frontend/src/components/lists/list-card.test.tsx:67`: as linhas que sobram ficam vazias | Hoje → Esta semana → Backlog, até 4, com as que sobram vazias | ✅ (M26 morto) |
| LIST-06 | `backend-node/test/services/lists.test.ts:112,118`: `['C','A','B']`, posições `[0,1,2]`; `backend-node/test/routes/lists.test.ts:203-205`: 204 e o `GET` seguinte com `['C','A','B']`; `frontend/src/pages/home.test.tsx:141`: `lists.move(A, C)` | A nova ordem persiste depois de recarregar | ✅ |
| LIST-07 | `backend-node/test/routes/lists.test.ts:158-161`: `{name:'New',color:6}` relido com `GET`; `frontend/src/components/lists/list-dialog.test.tsx:100`: `update(saved.id,{name:'Home',color:2})` | Cartão e selo com os valores novos | ✅ |
| LIST-08 | `backend-node/test/services/lists.test.ts:148-151`: sai da listagem padrão, aparece com `archived:true` e `pendingCount` 1; `backend-node/test/routes/lists.test.ts:167-170`; `frontend/src/pages/archived-lists.test.tsx:53-55,73`: `'Unarchive'` → `update(id,{is_archived:false})` | Sai de `Todas`, aparece em `Arquivadas` com `Desarquivar`, e as tarefas ficam | ✅ (M25 morto; manter o tempo registrado: pendente de foco-e-sons) |
| LIST-09 | `backend-node/test/routes/lists.test.ts:232-235`: 204 e `GET` 404 `{detail:'List not found'}`; `backend-node/test/services/lists.test.ts:165-166`; `backend-node/test/db/lists-schema.test.ts:72`: `[0,0,0]`; `frontend/src/components/lists/list-card.test.tsx:102-106`: a confirmação mostra o nome antes do `remove` | Apaga lista, tarefas e subtarefas; `GET /api/lists/:id` → 404 | ✅ (apagar as sessões: pendente de foco-e-sons) |
| LIST-10 | UI: `frontend/src/pages/home.test.tsx:150-155`; `frontend/src/components/lists/list-card.test.tsx:73`; `frontend/src/components/app-layout.test.tsx:159`. API: `backend-node/test/routes/lists.test.ts:129-130,188-189,219-220,242-243`: 403 `{detail:'Read-only role'}` | Esconde as 5 ações; 403 `Read-only role` | ✅ |
| LIST-11 | `backend-node/test/services/lists.test.ts:180-181`; `backend-node/test/routes/lists.test.ts:143-144,190-191,221-224,244` | 404 | ✅ |

### P1: Quadro da lista

| ID | Evidência `file:line` + asserção | Resultado definido pela spec | Status |
| -- | -------------------------------- | ---------------------------- | ------ |
| BOARD-01 | `frontend/src/pages/list-board.test.tsx:174-185`: botão `'Week'` com o selo dentro (`data-slot="list-badge"`, `var(--chart-3)`), link `'Back'` href `/`, `'This list has 1 pending task, Est.: 1hr'`, h2 `['Backlog','This week','Today','Done']`; `:205`: `'Esta lista tem 0 tarefas pendentes, Est.: 0min'`; `backend-node/test/services/board.test.ts:79`: `pending {count:5, estimate_minutes:155}` | `Voltar`, o seletor com o selo, o resumo e as 4 colunas na ordem | ✅ |
| BOARD-02 | `frontend/src/components/board/board-column.test.tsx:29-30`: `'All clear'` e `svg.lucide-circle-check`; `:45`: some quando há tarefa; `frontend/src/pages/list-board.test.tsx:212-213`: `'Tudo limpo'` em Backlog, Esta semana e Hoje | Ícone de check e `Tudo limpo` | ✅ |
| BOARD-03 | Backend: `backend-node/test/services/tasks.test.ts:93-105`: destino e origem renumerados, e com `beforeTaskId: null` a tarefa vai para o fim (`['a','y','x']`); `backend-node/test/routes/tasks.test.ts:159-160`: a releitura confirma `position` 1. Frontend: `frontend/src/pages/list-board.test.tsx:303-305` (para baixo, `before_task_id: T3`, ordem `['DEV-1726','DEV-1725','DEV-1727']`) e `:318-320` (para cima, `before_task_id: T2`) provam a reordenação na mesma coluna; `:253` (para Concluídas) e `:282` (`{column:'today', before_task_id: TODAY_TASK}`) provam a troca de coluna soltando sobre um cartão. **Nenhum** teste solta uma tarefa na área de uma coluna de pendentes (`frontend/src/pages/list-board.tsx:140-141`, `before = null`) | A nova ordem e a nova coluna persistem depois de recarregar | ❌ (M21 agora morre; M27 sobreviveu, porque falta soltar na área de uma coluna com cartões, onde a tarefa deve ir para o fim) |
| BOARD-04 | `backend-node/test/services/board.test.ts:84`: `today {estimate_minutes:90, done:1, total:3}`; `frontend/src/components/board/board-column.test.tsx:61-63`: `'1hr'`, `'0/1 Done'`, `aria-valuenow` 0; `pt-BR.json:478` `{{done}}/{{total}} Concluídas` | Soma pendente de Hoje; x = concluídas hoje; y = x + pendentes de Hoje | ✅ |
| BOARD-05 | `backend-node/test/services/board.test.ts:62-63`: `this_week {done:11,total:12}`, `today {done:0,total:1}`; `:82`: `estimate_minutes:135`; `frontend/src/components/board/board-column.test.tsx:78`: `'11/12 Done'` | `11/12` e `0/1`; soma de Esta semana + Hoje | ✅ |
| BOARD-06 | `frontend/src/pages/list-board.test.tsx:234`: 3 cartões de Hoje `toEqual([['1','DEV-1725'],['2','DEV-1726'],['3','DEV-1727']])`; `frontend/src/components/board/task-card.test.tsx:47`: sem número fora de Hoje | Cartões de Hoje numerados a partir de `1`, na ordem da coluna | ✅ |
| BOARD-07 | `frontend/src/pages/list-board.test.tsx:253` (arrastar) e `:329` (check): `tasks.move(id,{column:'done',before_task_id:null})`; `backend-node/test/services/tasks.test.ts:111`: `completedAt: NOW`; `backend-node/test/services/board.test.ts:107-108`: agrupada sob o dia; `frontend/src/components/board/task-card.test.tsx:69-71`: `line-through`, `aria-checked="true"`, `'1hr 27min'` | Em `Concluídas`, riscada, sob o dia, com o tempo gasto | ✅ (o tempo real gasto: pendente de foco-e-sons) |
| BOARD-08 | `frontend/src/pages/list-board.test.tsx:281-290`: `tasks.move(DONE_TASK,{column:'today',before_task_id:TODAY_TASK})`, e o cartão volta em Hoje com `aria-checked="false"`, sem `line-through` e fora de Concluídas; `backend-node/test/services/tasks.test.ts:118`: `{column:'today', completedAt:null, estimateMinutes:25}`; `backend-node/test/routes/tasks.test.ts:152` | Limpa a conclusão e volta a contar como pendente | ✅ (manter o tempo já gasto: pendente de foco-e-sons) |
| BOARD-09 | `backend-node/test/services/board.test.ts:107-108,119-120`: `today_count`, só hoje e o último dia anterior; `frontend/src/components/board/board-column.test.tsx:152-160`: `'0 tasks today'`, `'Thu, Oct 22, 2026'`, `'1 task'`, `'3 tasks'`; `:178`: `'0 tarefas hoje'` | Só hoje e o último dia anterior, com `<dia>, <data>`, `N tarefas` e `N tarefas hoje` | ✅ |
| BOARD-10 | `backend-node/test/services/board.test.ts:139`: `toEqual` exato do quadro, sem campo de intervalos | Intervalos fora de Concluídas | ✅ (os intervalos só existem a partir de foco-e-sons) |
| BOARD-11 | `frontend/src/pages/list-board.test.tsx:339-341`: botão `'Work'`, `lists.board` chamado por último com `WORK`, sem `'Home page'` | Troca de quadro sem passar pela home | ✅ |
| BOARD-12 | `frontend/src/components/board/board-column.test.tsx:93`: `'Focus now'` habilitado; `:115`: só em Hoje; `pt-BR.json:480` `Focar agora` | `Focar agora` habilitado com pendente em Hoje | ✅ |
| BOARD-13 | `frontend/src/components/board/board-column.test.tsx:101`: `toBeDisabled()` | Desabilitado sem pendente | ✅ |
| BOARD-14 | `frontend/src/pages/list-board.test.tsx:349-359`: abas `['Backlog','This week','Today','Done']`, uma h2 por vez; `:367`: sem `tablist` a partir de 768px | Abaixo de 768px, uma coluna por vez com as abas no topo | ✅ |
| BOARD-15 | UI: `frontend/src/pages/list-board.test.tsx:385-389` (sem `aria-roledescription`/`tabindex`, sem `Add task`, check e `Focus now` desabilitados); `frontend/src/components/board/task-dialog.test.tsx:134-137`; `frontend/src/components/board/subtask-list.test.tsx:143-146`. API: `backend-node/test/routes/tasks.test.ts:81-82,138-139,169-170,189-190,234-235`: 403 `{detail:'Read-only role'}` | Impede adicionar, mover, editar, concluir e focar; 403 | ✅ (M29 e M30 mortos) |
| BOARD-16 | `backend-node/test/services/board.test.ts:133-134`: no domingo, `['still today']`, `{done:0,total:1}` | As pendentes de Hoje continuam em Hoje | ✅ |

### P1: Tarefas, subtarefas e anotações

| ID | Evidência `file:line` + asserção | Resultado definido pela spec | Status |
| -- | -------------------------------- | ---------------------------- | ------ |
| TASK-01 | `backend-node/test/routes/tasks.test.ts:42-56`: 201, título de 255, `estimate_minutes: 87`, `position` no fim, sem estimativa → `null`; `frontend/src/components/board/task-card.test.tsx:27-28`: `'1hr 27min'`, `'0min'`; `frontend/src/components/board/format-duration.test.ts:7,10,11`: `'0min'`, `'1h'`, `'1h 27min'` em pt-BR | Cartão no fim com título, `1h`/`1h 27min` e `0min` | ✅ |
| TASK-02 | `backend-node/test/routes/tasks.test.ts:64-75`: 422 para `''`, 256, 0 e 1441; 1440 → 201; `frontend/src/components/board/add-task-form.test.tsx:113-114`: `alert` com a mensagem e o valor mantido | 422, e o formulário fica com a mensagem | ✅ |
| TASK-03 | `frontend/src/components/board/task-dialog.test.tsx:47-50,74,86`; `backend-node/test/routes/tasks.test.ts:115-118`: aceita notas de 10 000 | O diálogo edita título, estimativa, notas e subtarefas | ✅ |
| TASK-04 | `backend-node/test/routes/tasks.test.ts:126-128`: 10 001 → 422 `string_too_long` em `['body','notes']`; `:132`: nada salvo; `frontend/src/components/board/task-dialog.test.tsx:62-63` | 422 e nada salvo | ✅ (M28 morto) |
| TASK-05 | `backend-node/test/routes/tasks.test.ts:179-183`: 204, `GET` 404 `{detail:'Task not found'}`, subtarefa 404; `backend-node/test/db/lists-schema.test.ts:77`: `[1,0,0]`; `frontend/src/components/board/task-dialog.test.tsx:122-127` | Apaga tarefa e subtarefas; `GET /api/tasks/:id` → 404 | ✅ (apagar as sessões: pendente de foco-e-sons) |
| TASK-06 | `backend-node/test/services/board.test.ts:96`: `subtasks: { done: 1, total: 3 }`; `frontend/src/components/board/task-card.test.tsx:97-103`: `'1/3 Subtasks'`, `'Add subtask'`, a seta abre a lista; `frontend/src/components/board/subtask-list.test.tsx:63-64`: `update(S2,{done:true})` → `'2/2 Subtasks'` | `x/y Subtarefas`, `+`, seta e marcar | ✅ (M24 morto) |
| TASK-07 | `backend-node/test/routes/tasks.test.ts:217-222`: 422 em POST e PATCH, nada salvo | 422 | ✅ |
| TASK-08 | `backend-node/test/db/lists-schema.test.ts:38-48`: `ck_tasks_done_completed_at`; `backend-node/test/services/tasks.test.ts:111,118,128` | `done` ⇔ `completed_at` preenchido | ✅ |

**Status**: ❌ 34/35 ✅, 1 ❌ (BOARD-03, frontend: soltar na área de uma coluna). Nenhum spec-precision gap.

---

## Edge Cases

| Edge Case | Evidência | Status |
| --------- | --------- | ------ |
| Reordenação concorrente: sem posições repetidas, e vence a última gravação | `backend-node/test/services/tasks.test.ts:141`; `backend-node/test/services/lists.test.ts:130-132` (`[0,1,2,3]`, `['D','A','C','B']`). O PGlite tem uma conexão só, então o `FOR UPDATE` não roda sob concorrência real | ✅ |
| Id que não é UUID → 422 no formato existente | `backend-node/test/routes/lists.test.ts:146-148`, `backend-node/test/routes/tasks.test.ts:106-108,242-244`: `{loc:['path',…], msg:'Input should be a valid UUID'}` | ✅ |
| Lista sem tarefas: `Tudo limpo` nas 3 colunas, `0 tarefas hoje` e `Esta lista tem 0 tarefas pendentes, Est.: 0min` | `frontend/src/pages/list-board.test.tsx:205` (o resumo exato em pt-BR), `:212-213` (`Tudo limpo` nas 3 colunas), `:216` (`0 tarefas hoje`); `backend-node/test/services/board.test.ts:139` (zeros) | ✅ |
| Exportar/importar no modo local: mesmas contagens e mesmos ids | `backend-node/test/local/data-transfer.test.ts:73-79`: `[2,3,2]`, ids iguais, `toEqual(before)` | ✅ |

---

## Discrimination Sensor

Rodei num worktree descartável: `git worktree add --detach …/scratchpad/verify-lq3 HEAD`, com `node_modules` por symlink. Cada mutante trocou uma única ocorrência do trecho (o script recusa se achar 0 ou mais de 1), rodou `npx vitest run` no pacote inteiro e foi desfeito com `git checkout -- .` dentro do worktree. No fim apaguei os symlinks e removi o worktree com `git worktree remove --force`. O `git status --porcelain` do checkout real ficou igual à linha de base (`diff` → `STATUS_SAME`): só `?? .specs/features/listas-e-quadro/validation.md`. `git worktree list` mostra só o checkout real.

| Mutation | File:line | Descrição | Killed? |
| -------- | --------- | --------- | ------- |
| M21 (reteste) | `frontend/src/pages/list-board.tsx:146` | Reordenar na mesma coluna manda o vizinho errado (`indexOf(activeId) + 1` → `- 1`) | ✅ Killed (2: `reorders a task one position down/up within Today`) |
| M24 | `backend-node/src/services/board.ts:98` | O `x` de `x/y Subtarefas` passa a contar as não marcadas (`FILTER (WHERE s.done)` → `WHERE NOT s.done`) | ✅ Killed (1: `board.test.ts`, x/y das subtarefas) |
| M25 | `backend-node/src/services/lists.ts:33` | `GET /api/lists` sem o filtro de arquivadas (sobra só o filtro de workspace) | ✅ Killed (3: LIST-08 no service e nas rotas) |
| M26 | `backend-node/src/services/lists.ts:46` | A prévia começa por Esta semana (`today THEN 0, this_week THEN 1` → `today THEN 1, this_week THEN 0`) | ✅ Killed (1: LIST-05) |
| M27 | `frontend/src/pages/list-board.tsx:141` | Soltar na área de uma coluna manda o primeiro cartão em vez de `null` (`before = null` → `board.columns[to].tasks[0]?.id ?? null`) | ❌ Survived (os 597 testes do frontend passam) |
| M28 | `backend-node/src/routes/tasks.ts:98` | Anotações aceitam 10 001 caracteres (`.max(10_000)` → `.max(10_001)`) | ✅ Killed (1: TASK-04) |
| M29 | `frontend/src/pages/list-board.tsx:179` | As colunas do quadro recebem `canWrite={true}` para o viewer (o `Add task` aparece) | ✅ Killed (1: `lets a viewer neither drag, add nor complete`) |
| M30 | `frontend/src/pages/list-board.tsx:271` | O cartão fica arrastável para o viewer (`canWrite ? {...attributes,...listeners} : {}` → sempre os listeners) | ✅ Killed (1: o mesmo teste do viewer) |

**O M27 é equivalente?** Não. Com a coluna vazia, `tasks[0]` é `undefined` e o mutante dá o mesmo `null`. Com a coluna cheia, a tarefa iria para o topo, e não para o fim. Testei no worktree descartável se o sensor de teclado chega a esse ramo numa coluna cheia. Fiz uma sonda que arrasta um cartão de Concluídas para Hoje (com um cartão já em Hoje), com 3 sequências de setas: o teclado sempre para no cartão (`before_task_id: TODAY_TASK`), nunca na coluna. O caminho real é o ponteiro. Com `closestCorners` (`list-board.tsx:221`), soltar abaixo do último cartão numa coluna alta deixa os cantos da coluna mais perto do item arrastado que os do cartão, então o `over` é `column:<id>` e o quadro deve mandar `before_task_id: null`. Esse alcance pelo ponteiro vem da leitura do código; não o reproduzi no jsdom. A sonda só existiu no worktree e foi apagada com ele.

**Sensor depth**: P0-full manual (M21 de novo e 7 mutantes novos: x/y das subtarefas, filtro de arquivadas, ordem da prévia, `before_task_id: null` no fim da coluna, limite das anotações, e dois de esconder do viewer no quadro)
**Result**: 7/8 killed - FAIL ❌

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ (`2eac757` só mexe em teste) |
| Surgical changes | ✅ (1 arquivo; `layOutColumns()` estendido com padrão compatível) |
| No scope creep | ✅ |
| Matches patterns | ✅ (mesmo padrão de teclado e `getBoundingClientRect` dos testes de arrasto que já existiam) |
| Spec-anchored outcome check (asserted values match spec) | ✅ nos valores afirmados; ❌ BOARD-03 ainda sem soltar na área da coluna |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ⚠️ Backend ok; na página do quadro falta o ramo `over` = coluna |
| Every test maps to a spec requirement - no unclaimed tests | ✅ |
| Documented guidelines followed: `CONTRIBUTING.md`, `backend-node/vitest.config.ts`, `.github/workflows/ci.yml` | ✅ |

---

## Ranked gaps

1. **BOARD-03, frontend: soltar uma tarefa na área de uma coluna de pendentes com cartões não tem teste (M27 sobreviveu).** `frontend/src/pages/list-board.tsx:140-141` manda `before_task_id: null` (vai para o fim) quando o `over` é a própria coluna. Nenhum teste chega a esse ramo com a coluna cheia. Os testes de arrasto usam só o teclado, e o teclado sempre para num cartão. Severidade: Major (soltar abaixo do último cartão é o jeito comum de mandar uma tarefa para o fim de Hoje ou de Esta semana; se quebrar, a tarefa vai para o topo e a numeração de BOARD-06 muda).

## Fix Plans

### Fix 1: provar que soltar na área de uma coluna põe a tarefa no fim (BOARD-03, M27)
- **Root cause**: os testes de `frontend/src/pages/list-board.test.tsx` só usam o `KeyboardSensor` com `sortableKeyboardCoordinates`, que sempre acaba num cartão quando a coluna tem cartões. O ramo `overId.startsWith(COLUMN_PREFIX)` de `list-board.tsx:140` só roda no teste com a coluna Concluídas, que sai antes pelo ramo `to === 'done'`.
- **Fix task**: extrair o cálculo de `onDragEnd` (de `{activeId, overId}` e do quadro para `{column, before}`) numa função pura e testá-la direto. Os casos: `over = 'column:today'` com Hoje cheia → `before: null`; `over` = um cartão de outra coluna → `before: overId`; a mesma coluna, para baixo e para cima (os casos do M21). Outra opção é um teste de página com `PointerSensor` (`fireEvent.pointerDown/Move/Up`) que solte abaixo do último cartão de Hoje e afirme `tasks.move(id,{column:'today',before_task_id:null})` e a ordem otimista com a tarefa por último.
- **Done when**: o M27 (`before = null` → `board.columns[to].tasks[0]?.id ?? null` em `list-board.tsx:141`) quebra um teste, e o M21 continua morrendo.
- **Priority**: Major

### Não bloqueante (pendente de foco-e-sons)
- LIST-08, LIST-09, TASK-05, BOARD-07 e BOARD-08 falam do tempo registrado e das sessões. Esta feature ainda não tem a tabela de sessões, e `spent_seconds` é sempre 0 (`backend-node/src/services/board.ts:44-46`). A feature `foco-e-sons` precisa provar que as sessões são apagadas em cascata e que o tempo continua quando uma tarefa é reaberta.

### Escalada
Esta foi a 3ª e última iteração de correção e re-verificação (`validate.md`, "Max 3"). A lacuna do Fix 1 vai para o usuário decidir: corrigir e rodar mais uma verificação fora do limite, ou aceitar o risco.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| LIST-01 … LIST-11 | Implementing | ✅ Verified |
| BOARD-01, BOARD-02, BOARD-04 … BOARD-16 | Implementing | ✅ Verified |
| BOARD-03 | Implementing | ❌ Needs Fix (frontend, soltar na área da coluna) |
| TASK-01 … TASK-08 | Implementing | ✅ Verified |

(O Verifier não mexeu na tabela de traceability de `spec.md`; só escreveu este relatório.)

---

## Summary

**Overall**: ❌ Not Ready

**Spec-anchored check**: 34/35 ACs batem com a spec; 4/4 Edge Cases; 0 spec-precision gaps; 1 lacuna (BOARD-03, soltar na área da coluna)
**Sensor**: 7/8 mutantes mortos (M21 agora morre; M27 sobreviveu)
**Gate**: Build verde. Backend 171 passed / 9 skipped (Redis); frontend 597 passed; lint, typecheck e build ok

**O que funciona**: a reordenação dentro da mesma coluna agora tem prova nos dois sentidos, com o `before_task_id` e a ordem otimista na tela. A contagem `x/y` das subtarefas, o filtro de arquivadas, a ordem da prévia, o limite de 10 000 nas anotações e o que o quadro esconde do viewer matam os mutantes. A API, a matemática `x/y` das colunas, o fuso e o isolamento entre workspaces continuam cobertos como nas iterações anteriores.

**Problemas**: soltar uma tarefa na área vazia de uma coluna que já tem cartões (ela deveria ir para o fim) não tem teste. Um erro ali passa pelos 597 testes.

**Próximos passos**: levar o Fix 1 ao usuário, porque o limite de 3 iterações acabou.
