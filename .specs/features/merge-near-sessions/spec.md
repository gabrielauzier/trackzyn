# Juntar sessões próximas Specification

## Problem Statement

Um bloco de trabalho interrompido por pausas curtas, como pausar o foco para atender alguém e voltar, vira várias sessões vizinhas na Agenda. A grade mostra uma escada de blocos de uma mesma lista quando, para quem olha, foi um trecho só de trabalho. A issue #23 pede uma configuração do workspace, irmã da de esconder sessões curtas (#22), que desenhe como um bloco só as sessões da mesma lista separadas por até X minutos, sem mudar as sessões gravadas.

## Goals

- [ ] Com a configuração ligada em X minutos, a Agenda desenha como um bloco só as sessões da mesma lista e do mesmo tipo, no mesmo dia, separadas por até X minutos, do início da primeira ao fim da última.
- [ ] O tooltip do bloco unido diz quantas sessões ele tem e lista cada uma com o horário; clicar nele deixa escolher qualquer uma para ver, editar ou excluir.
- [ ] Ligar ou desligar a configuração não muda nenhuma sessão gravada nem nenhum total.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Juntar sessões na aba Sessões ou em qualquer tela dos Relatórios | A issue pede só a tela da Agenda. |
| Juntar de fato as sessões no banco | A configuração só muda a exibição; as sessões gravadas ficam como estão. |
| Juntar sessões de listas diferentes | Decisão do usuário (#23): só da mesma lista; sessões de listas diferentes que se sobrepõem continuam lado a lado (AGENDA-06). |
| Juntar uma tarefa com um intervalo | Decisão do usuário (#23): só se juntam sessões do mesmo tipo. |
| Juntar sessões que passam da meia-noite | Decisão do usuário (#23): a junção vale só dentro de uma coluna (dia). |
| Arrastar ou redimensionar o bloco unido inteiro | Decisão do usuário (#23): o bloco unido não se arrasta; cada sessão continua ajustável sozinha. |
| Configuração por usuário | A issue pede uma configuração do workspace. |
| Ler ou mudar a configuração por token de acesso (`tkz_`) | AD-007: a rota de workspace não tem escopo de token. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Clicar num bloco unido | Abre o painel com a lista das sessões do bloco; escolher uma mostra os detalhes dela, com `Editar` e `Excluir`, como hoje | Decisão do usuário (#23) | y |
| Arrastar o bloco unido | Não move nem redimensiona; não tem alças | Decisão do usuário (#23) | y |
| Tipos | Só se juntam sessões do mesmo tipo: tarefa com tarefa, intervalo com intervalo, sempre da mesma lista | Decisão do usuário (#23) | y |
| Como X é escolhido | Um interruptor liga a configuração e um campo de número define X, de 1 a 60 minutos; ligar com o valor desligado preenche 1 | Igual à configuração de esconder sessões curtas (#22), como pede a issue | y |
| Onde fica e quem altera | Na tela de configurações do workspace, logo abaixo de `Esconder sessões curtas`; só o dono ou o gestor (`manager`) altera, os outros veem desabilitado | Mesma regra de #22 | y |
| Limite do espaço | Duas sessões se juntam quando o início da seguinte menos o fim da anterior é menor ou igual a X × 60 segundos; com exatamente X, se juntam; com X e 1 segundo, não | Decisão do usuário (#23): menor ou igual; o exemplo da issue (4 min com X = 5) se junta | y |
| Sessões que se sobrepõem | Duas sessões da mesma lista e tipo que se sobrepõem (intervalo negativo) também se juntam | O intervalo é menor que X; o bloco unido cobre as duas | y |
| Cadeia | A junção é em cadeia: A e B se juntam, B e C se juntam, então A, B e C são um bloco, mesmo que A e C estejam a mais de X | O que "concatenar" sugere; uma sessão do meio não pode estar em dois blocos | y |
| Intervalo entre duas tarefas | Um intervalo (pausa) entre duas sessões de tarefa não impede a junção: o espaço se mede entre as tarefas | Os tipos não se misturam; o intervalo continua no próprio bloco, ao lado, como qualquer sobreposição (AGENDA-06) | y |
| Sessão em andamento | Nunca se junta: fica no próprio bloco, crescendo até agora | Ainda não tem fim; um bloco unido que cresce com ela mudaria a cada minuto | y |
| Meia-noite | Uma sessão que passa da meia-noite não se junta com nenhuma, em nenhum dos dois dias | Decisão do usuário (#23): "não tem efeito sobre sessões que ultrapassam a meia noite" | y |
| Sessões escondidas (#22) | Primeiro se escondem as curtas; as escondidas não aparecem no bloco, não contam no tooltip e não emendam um espaço | A Agenda só mostra e junta o que se vê | y |
| Totais | O total do dia continua sendo a soma das sessões, sem contar os espaços entre elas | A junção só muda o desenho | y |
| Bloco unido no lado a lado | O bloco unido ocupa uma faixa como um bloco só (AGENDA-06) | É um bloco na grade | y |
| Uma sessão do bloco escolhida no painel | Enquanto está escolhida (detalhes ou edição), ela sai do bloco e aparece sozinha, com as alças e o arraste de hoje; o resto do bloco se redesenha sem ela | Permite ajustar uma sessão como hoje sem arrastar o grupo inteiro | y |
| Título e tooltip do bloco unido | O bloco leva o nome da lista e `N sessões`; o tooltip mostra a lista, `N sessões` e uma linha por sessão, em ordem de início, com o título (ou `Intervalo`) e `HH:MM – HH:MM` | A issue pede a quantidade e cada sessão com o horário | y |
| Aviso de sobreposição | O painel continua avisando sobre as sessões sobrepostas, uma a uma, como hoje | A junção não muda o que se sobrepõe | y |
| Desenho do clique | Bloco unido com o contador no canto (sem linhas nas pausas); tooltip com a lista das sessões; painel com um botão por sessão; sessão escolhida sai do bloco, com o botão de voltar à lista | Desenho aprovado pelo usuário (canvas `Agenda · sessões unidas`, https://claude.ai/artifact/Kk5E4r1KMaN4XmY1WRbUCz) | y |

**Open questions:** none - all resolved or logged above (required before the spec is confirmed).

---

## User Stories

### P1: Configurar a junção no workspace ⭐ MVP

**User Story**: Como dono do workspace, quero ligar a junção de sessões próximas e definir o espaço máximo entre elas.

**Why P1**: Sem a configuração não há o que juntar.

**Acceptance Criteria**:

1. The system SHALL store, per workspace, a join gap that is either off or a whole number of minutes from 1 to 60, off by default.  <!-- ubiquitous -->
2. WHEN a workspace is read THEN the system SHALL return its join gap as `merge_gap_minutes`, `null` when off, to every member.  <!-- event-driven -->
3. WHEN the owner sends `merge_gap_minutes` with a whole number from 1 to 60 or `null` in `PATCH /api/workspaces/:id` THEN the system SHALL save it and return it.  <!-- event-driven -->
4. IF `merge_gap_minutes` is below 1, above 60 or not a whole number THEN the system SHALL answer 422 and keep the stored value.  <!-- unwanted-behavior -->
5. IF a member who is neither the owner nor the manager sends `merge_gap_minutes` THEN the system SHALL answer 403 and keep the stored value.  <!-- unwanted-behavior -->
6. WHEN the owner opens the workspace settings THEN the system SHALL show, below `Esconder sessões curtas`, the switch `Juntar sessões próximas` and, while it is on, the field `Até` with the minutes.  <!-- event-driven -->
7. WHEN the owner turns the switch on for a workspace that has it off THEN the system SHALL fill the field with 1.  <!-- event-driven -->
8. WHEN the owner saves the settings with the switch off THEN the system SHALL send `merge_gap_minutes: null`.  <!-- event-driven -->
9. IF the field holds a value outside 1 to 60 or not a whole number while the switch is on THEN the system SHALL show `Entre 1 e 60 minutos.` under it and send nothing.  <!-- unwanted-behavior -->
10. WHILE the viewer is neither the owner nor the manager the system SHALL show the switch and the field disabled, with the stored value.  <!-- state-driven -->

**Independent Test**: Como dono, ligar a junção com 5 minutos, salvar, recarregar e ver o interruptor ligado com 5; como editor, ver os dois desabilitados.

---

### P1: Juntar as sessões próximas na Agenda ⭐ MVP

**User Story**: Como membro, quero ver como um bloco só as sessões da mesma lista separadas por uma pausa curta.

**Why P1**: É o pedido da issue.

**Acceptance Criteria**:

11. WHILE the workspace has a join gap of X minutes, the Agenda SHALL draw as one block the closed sessions of the same list, the same kind and the same day whose gap, from the end of one to the start of the next, is X × 60 seconds or less, from the start of the first to the end of the last.  <!-- state-driven -->
12. WHILE the workspace has a join gap of X minutes, the Agenda SHALL keep apart two sessions whose gap is more than X × 60 seconds.  <!-- state-driven -->
13. The Agenda SHALL join in a chain: when A joins B and B joins C, the block holds A, B and C.  <!-- ubiquitous -->
14. The Agenda SHALL join two sessions of the same list and kind that overlap.  <!-- ubiquitous -->
15. The Agenda SHALL keep apart sessions of different lists, whatever the gap, and draw them side by side where they overlap (AGENDA-06).  <!-- ubiquitous -->
16. The Agenda SHALL keep apart a task session and a break, whatever the gap.  <!-- ubiquitous -->
17. The Agenda SHALL measure the gap between two task sessions of the same list over any break between them.  <!-- ubiquitous -->
18. The Agenda SHALL keep the open session and every session that crosses midnight apart from any block, on every day it touches.  <!-- ubiquitous -->
19. The Agenda SHALL leave the sessions hidden by the minimum session length (HIDE-11) out of the blocks, so a hidden session neither shows in a block nor bridges a gap.  <!-- ubiquitous -->
20. The Agenda SHALL count in the day total each session of a block, not the gaps between them (AGENDA-11).  <!-- ubiquitous -->
21. The Agenda SHALL give a joined block one lane of the side-by-side layout (AGENDA-06), as a single block.  <!-- ubiquitous -->
22. WHILE the workspace has the join gap off, the Agenda SHALL draw every session in its own block, as today.  <!-- state-driven -->
23. The Agenda SHALL apply the join in the week and in the day view.  <!-- ubiquitous -->
24. WHEN the owner changes the join gap THEN the Agenda SHALL apply the new value the next time the workspace is read, without a reload.  <!-- event-driven -->

**Independent Test**: Com 5 minutos, as sessões 10:20–11:01 e 11:05–11:16 (e também 11:06–11:16, a 5 min exatos) da mesma lista viram um bloco de 10:20 a 11:16; uma de outra lista no mesmo horário fica ao lado; o total do dia é 52 min.

---

### P1: Ver e escolher as sessões de um bloco unido ⭐ MVP

**User Story**: Como membro, quero ver quais sessões formam um bloco unido e abrir qualquer uma delas.

**Why P1**: Sem isso, juntar esconderia as sessões e o horário de cada uma.

**Acceptance Criteria**:

25. The Agenda SHALL name a joined block with its list and `N sessões`, N being the count of its sessions.  <!-- ubiquitous -->
26. WHEN the pointer rests on or the focus reaches a joined block THEN the Agenda SHALL show a tooltip with the list, `N sessões`, one line per session in start order with its task title, or `Intervalo`, and `HH:MM – HH:MM`, and the line `Clique para escolher uma sessão`.  <!-- event-driven -->
27. WHEN a joined block is clicked THEN the Agenda SHALL select the block and open the panel headed `<lista> · N sessões`, with the day and the span of the block, and one button per session in start order with its title, where it was recorded, `HH:MM – HH:MM` and its duration.  <!-- event-driven -->
28. WHEN a session is chosen in that list THEN the Agenda SHALL show the details of that session, with `Editar` and `Excluir` for a user who can write, as for any session (AGENDA-27).  <!-- event-driven -->
29. WHILE a session of a joined block is chosen, the Agenda SHALL draw it in its own block, with the handles and the drag of AGENDA-29 and AGENDA-30, and draw the rest of the block without it.  <!-- state-driven -->
30. IF a joined block is dragged THEN the Agenda SHALL neither move nor resize any of its sessions.  <!-- unwanted-behavior -->
31. WHEN a chosen session is closed, saved or deleted THEN the Agenda SHALL join it again with its neighbours under the join gap.  <!-- event-driven -->
32. The Agenda SHALL mark a joined block with a badge holding N, the count of its sessions, in its top right corner, and with no other text.  <!-- ubiquitous -->
33. WHILE a session chosen from a joined block shows its details, the panel SHALL show the button `‹ <lista> · N sessões`, which goes back to the list of the block's sessions.  <!-- state-driven -->

**Independent Test**: Passar o mouse no bloco de 10:20 a 11:16 e ver `2 sessões` e os dois horários; clicar, escolher a de 11:05 e ver os detalhes dela com `Editar`.

---

## Edge Cases

- WHEN two sessions are exactly X minutes apart THEN the Agenda SHALL join them (MERGE-11); one second more keeps them apart (MERGE-12).
- WHEN a block's sessions belong to different tasks of the same list THEN the tooltip SHALL list each one with its own title (MERGE-26).
- IF hiding leaves one session of a would-be block THEN the Agenda SHALL draw that session alone, as a common block (MERGE-19).
- WHEN a joined block is the only block of a column THEN it SHALL take the whole width (MERGE-21).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| MERGE-01 | P1: Configurar | T1 | Verified |
| MERGE-02 | P1: Configurar | T2 | Verified |
| MERGE-03 | P1: Configurar | T2 | Verified |
| MERGE-04 | P1: Configurar | T2 | Verified |
| MERGE-05 | P1: Configurar | T2 | Verified |
| MERGE-06 | P1: Configurar | T9 | Verified |
| MERGE-07 | P1: Configurar | T9 | Verified |
| MERGE-08 | P1: Configurar | T9 | Verified |
| MERGE-09 | P1: Configurar | T9 | Verified |
| MERGE-10 | P1: Configurar | T9 | Verified |
| MERGE-11 | P1: Juntar | T3, T5 | Verified |
| MERGE-12 | P1: Juntar | T3 | Verified |
| MERGE-13 | P1: Juntar | T3 | Verified |
| MERGE-14 | P1: Juntar | T3 | Verified |
| MERGE-15 | P1: Juntar | T3 | Verified |
| MERGE-16 | P1: Juntar | T3 | Verified |
| MERGE-17 | P1: Juntar | T3 | Verified |
| MERGE-18 | P1: Juntar | T3 | Verified |
| MERGE-19 | P1: Juntar | T5, T6 | Verified |
| MERGE-20 | P1: Juntar | T5, T6 | Verified |
| MERGE-21 | P1: Juntar | T5, T6 | Verified |
| MERGE-22 | P1: Juntar | T3 | Verified |
| MERGE-23 | P1: Juntar | T5, T6, T8 | Verified |
| MERGE-24 | P1: Juntar | T8 | Verified |
| MERGE-25 | P1: Escolher | T4 | Verified |
| MERGE-26 | P1: Escolher | T4 | Verified |
| MERGE-27 | P1: Escolher | T5, T6, T7, T8 | Verified |
| MERGE-28 | P1: Escolher | T7, T8 | Verified |
| MERGE-29 | P1: Escolher | T5, T8 | Verified |
| MERGE-30 | P1: Escolher | T5, T6 | Verified |
| MERGE-31 | P1: Escolher | T8 | Verified |
| MERGE-32 | P1: Escolher | T4 | Verified |
| MERGE-33 | P1: Escolher | T7 | Verified |

**Coverage:** 33 total, 33 mapped to tasks, 33 verified (Verifier PASS)

---

## Success Criteria

- [ ] O exemplo da issue (10:20–11:01 e 11:05–11:16, X = 5) aparece como um bloco de 10:20 a 11:16 com `2 sessões`.
- [ ] Ligar e desligar a junção não muda nenhuma sessão gravada nem o total do dia.
- [ ] Toda sessão de um bloco unido continua acessível para ver, editar e excluir.
