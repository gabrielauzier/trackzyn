# Tarefa da nova sessão Specification

## Problem Statement

O painel `Nova sessão` da Agenda escolhe a tarefa num select com todas as tarefas do workspace, o que fica longo, e quando a tarefa ainda não existe é preciso sair da Agenda, criá-la no quadro e voltar. A issue #27 pede um seletor com pesquisa e as tarefas recentes, e a criação da tarefa ali mesmo, já concluída e marcada como vinda da Agenda.

## Goals

- [ ] O usuário acha a tarefa da sessão entre as 10 atualizadas por último ou pesquisando pelo título.
- [ ] O usuário cria a tarefa que falta sem sair do painel, e ela fica escolhida na sessão, concluída e com a etiqueta `via Agenda`.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Mudar o seletor da aba `Intervalo` (a lista) | A issue fala da lista de tarefas. |
| Mudar o seletor de tarefa ao editar uma sessão existente | A issue pede o painel de criação de nova sessão. |
| Pesquisar nas anotações ou nas subtarefas | A pesquisa é pelo título, o que a lista mostra. |
| Criar a tarefa em outra coluna que não Concluídas | A issue pede sempre concluída. |
| Criar a tarefa pela Agenda com um token de acesso (`tkz_`) | AD-007: as rotas da Agenda são fechadas a tokens. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Desenho | Popover abaixo do campo `Tarefa`: pesquisa no topo, `As 10 atualizadas por último`, grupos por lista, `Concluída` nas tarefas concluídas, botão fixo `Criar nova tarefa`; sem resultado, `Nenhuma tarefa encontrada` e `Criar “<texto>”`; modal `Nova tarefa` com Lista, Título, Estimativa, `Adicionar anotações` e o editor de anotações | Desenho aprovado pelo usuário (canvas `Agenda · escolher ou criar tarefa`, https://claude.ai/artifact/SwXBvG4haXyR6K4kT9bXos) | y |
| O que é atualizar uma tarefa | Criá-la e mudar título, anotações, estimativa, coluna ou lista, e criar, mudar ou excluir uma subtarefa dela | Decisão do usuário (#27) | y |
| Tarefas antigas | Começam com a data de atualização igual à maior entre a criação e a conclusão | Decisão do usuário (#27); é a última mudança que o banco conhece | y |
| Origem `via Agenda` | Uma origem nova da tarefa, `agenda`, mostrada como `via Agenda` onde hoje aparece o `via <token>` | A etiqueta de hoje vem do token que criou a tarefa; a Agenda não usa token | y |
| Alcance da pesquisa | O título de todas as tarefas das listas não arquivadas do workspace, concluídas ou não, sem diferenciar maiúsculas | O desenho mostra resultados de várias listas e tarefas concluídas; é o alcance do seletor de hoje | y |
| Tamanho do resultado | Sem pesquisa, as 10 atualizadas por último; com pesquisa, até as 50 atualizadas por último que contêm o texto | 10 vem da issue; 50 mantém a lista curta sem esconder as que contêm o texto, na prática | y |
| Debounce | 300 ms depois da última tecla | Tempo usual de digitação; a issue pede debounce sem fixar o tempo | y |
| Ordem | Os grupos de lista na ordem das listas do workspace, e dentro de cada grupo as tarefas da mais para a menos recentemente atualizada | O agrupamento é o de hoje; a ordem interna segue a recência | y |
| Lista inicial do modal | A lista do filtro de lista da Agenda, se houver; senão, a primeira lista do workspace | Quem filtra a Agenda por uma lista está registrando tempo nela | y |
| Título inicial do modal | O texto da pesquisa, quando há; senão, vazio | Desenho aprovado: `Criar “<texto>”` | y |
| Anotações com o interruptor desligado | A tarefa é criada sem anotações, mesmo que algo tenha sido digitado antes de desligar | O interruptor decide o que é salvo | y |
| Depois de `Adicionar` | O modal e o popover fecham, e a tarefa nova fica escolhida no campo `Tarefa` do painel | Desenho aprovado | y |

**Open questions:** none - all resolved or logged above (required before the spec is confirmed).

---

## User Stories

### P1: Achar a tarefa da sessão ⭐ MVP

**User Story**: Como usuário, quero achar rápido a tarefa da sessão que estou registrando.

**Why P1**: O select de hoje lista todas as tarefas.

**Acceptance Criteria**:

1. The system SHALL keep, for each task, the instant it was last updated, set when the task is created and when its title, notes, estimate, column or list changes, or one of its subtasks is created, changed or deleted.  <!-- ubiquitous -->
2. WHEN the migration runs THEN every existing task SHALL get, as its last update, the later of its creation and its completion.  <!-- event-driven -->
3. WHEN `GET /api/sessions/tasks` is called without `q` THEN the system SHALL answer the 10 tasks of the non-archived lists of the workspace updated last, most recent first.  <!-- event-driven -->
4. WHEN `GET /api/sessions/tasks` is called with `q` THEN the system SHALL answer up to the 50 tasks updated last whose title contains `q`, trimmed, ignoring case, from the non-archived lists of the workspace, concluded or not.  <!-- event-driven -->
5. IF `q` is empty or only spaces THEN the system SHALL answer as without `q`.  <!-- unwanted-behavior -->
6. WHEN the `Tarefa` field of `Nova sessão` is clicked THEN the Agenda SHALL open a popover below it with a search field that has the focus, `As 10 atualizadas por último`, the 10 tasks grouped by list, and the button `Criar nova tarefa` after the list.  <!-- event-driven -->
7. The popover SHALL group the tasks under the name and the color of their list, in the order of the lists of the workspace, the most recently updated first in each group, and mark a concluded task with `Concluída`.  <!-- ubiquitous -->
8. WHEN the search text changes THEN the Agenda SHALL ask for the matches 300 ms after the last change, not before, and show `N tarefas para “<texto>”, em todas as listas` above them, with the matching part of each title highlighted.  <!-- event-driven -->
9. WHEN the clear button of the search is clicked THEN the Agenda SHALL empty the search and show the 10 recent tasks again.  <!-- event-driven -->
10. IF no task matches THEN the popover SHALL show `Nenhuma tarefa encontrada` and the button `Criar “<texto>”`.  <!-- unwanted-behavior -->
11. WHEN a task is picked THEN the popover SHALL close and the `Tarefa` field SHALL show it.  <!-- event-driven -->

**Independent Test**: Abrir o campo Tarefa e ver as 10 mais recentes por lista; digitar "revis" e, depois de 300 ms, ver as tarefas com "revis" de todas as listas; escolher uma.

---

### P1: Criar a tarefa da sessão ⭐ MVP

**User Story**: Como usuário, quero criar a tarefa que falta sem sair do painel da sessão.

**Why P1**: É o pedido central da issue.

**Acceptance Criteria**:

12. WHEN `Criar nova tarefa` or `Criar “<texto>”` is clicked THEN the Agenda SHALL open the modal `Nova tarefa` with `Lista` (the list filtered in the Agenda, else the first list), `Título` (the search text, else empty), `Estimativa (min)`, the switch `Adicionar anotações` off, and `Cancelar` and `Adicionar`.  <!-- event-driven -->
13. WHILE `Adicionar anotações` is on, the modal SHALL show below it the notes editor of `Editar tarefa`.  <!-- state-driven -->
14. IF the title is empty or longer than 255 characters, or the estimate is outside 1 to 1440, THEN the modal SHALL show the message of the board form (`Use no máximo 255 caracteres`, `Use de 1 a 1440 minutos`, or the required title) and create nothing.  <!-- unwanted-behavior -->
15. WHEN `Adicionar` is clicked with valid fields THEN the system SHALL create the task in the chosen list, in `Concluídas`, concluded now by the user, with origin `agenda`, the estimate, and the notes only while `Adicionar anotações` is on.  <!-- event-driven -->
16. WHEN the task is created THEN the modal and the popover SHALL close and the `Tarefa` field of the panel SHALL show the new task.  <!-- event-driven -->
17. The board card and the `Editar tarefa` modal SHALL show a task with origin `agenda` as `via Agenda`, where they show `via <token>` today.  <!-- ubiquitous -->
18. IF the creation fails THEN the modal SHALL stay open with what was typed and show the error of the API.  <!-- unwanted-behavior -->
19. WHEN `Cancelar`, Esc or the close button is used THEN the modal SHALL close without creating anything and the popover SHALL stay open.  <!-- event-driven -->
20. IF a member who cannot write calls the creation THEN the system SHALL answer 403 and create nothing.  <!-- unwanted-behavior -->

**Independent Test**: Pesquisar "reunião com o jurídico", clicar em `Criar “reunião com o jurídico”`, escolher a lista, ligar as anotações, adicionar; ver a tarefa escolhida no painel e, no quadro, em Concluídas, com `via Agenda`.

---

## Edge Cases

- WHEN a task is created by the Agenda THEN it SHALL be the first of the 10 recent tasks (PICK-01, PICK-03).
- IF the search text has only spaces THEN the popover SHALL show the 10 recent tasks (PICK-05).
- IF the workspace has no non-archived list THEN `Criar nova tarefa` SHALL be disabled.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| PICK-01 | P1: Achar | T1, T2 | In Tasks |
| PICK-02 | P1: Achar | T1 | In Tasks |
| PICK-03 | P1: Achar | T4 | In Tasks |
| PICK-04 | P1: Achar | T4 | In Tasks |
| PICK-05 | P1: Achar | T4 | In Tasks |
| PICK-06 | P1: Achar | T6, T8 | In Tasks |
| PICK-07 | P1: Achar | T6 | In Tasks |
| PICK-08 | P1: Achar | T6 | In Tasks |
| PICK-09 | P1: Achar | T6 | In Tasks |
| PICK-10 | P1: Achar | T6 | In Tasks |
| PICK-11 | P1: Achar | T6 | In Tasks |
| PICK-12 | P1: Criar | T7, T8 | In Tasks |
| PICK-13 | P1: Criar | T7 | In Tasks |
| PICK-14 | P1: Criar | T7 | In Tasks |
| PICK-15 | P1: Criar | T5, T7 | In Tasks |
| PICK-16 | P1: Criar | T8 | In Tasks |
| PICK-17 | P1: Criar | T3 | In Tasks |
| PICK-18 | P1: Criar | T7 | In Tasks |
| PICK-19 | P1: Criar | T7, T8 | In Tasks |
| PICK-20 | P1: Criar | T5 | In Tasks |

**Coverage:** 20 total, 20 mapped to tasks, 0 unmapped

---

## Success Criteria

- [ ] A tarefa da sessão aparece entre as 10 recentes ou em até 300 ms depois de parar de digitar.
- [ ] Uma tarefa criada pelo painel aparece no quadro em Concluídas, com `via Agenda`, e já escolhida na sessão.
