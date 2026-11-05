# Ajustes da Agenda Specification

## Problem Statement

A issue #29 junta sete ajustes da Agenda:

- **Alterações sem confirmação:** soltar um bloco arrastado ou esticado já salva o novo horário. Toda alteração numa sessão precisa passar pelo painel.
- **Bloco que pisca:** com o painel aberto, o bloco arrastado volta por um instante ao horário antigo antes de ir para o novo.
- **Nova sessão:** um clique cria a nova sessão com 15 min, e ela não pode ser movida pelo meio.
- **Visão Dia:** ela não tem o cabeçalho da semana, e o botão de exibição flutua sobre a linha do tempo.
- **Menu de exibição:** é estreito demais para o título e os atalhos, e não permite esconder os intervalos.

## Goals

- [ ] Nenhum horário de sessão muda no servidor sem `Salvar`, e `Cancelar` devolve o bloco ao lugar de antes.
- [ ] Um clique cria uma nova sessão de 1h, que se move arrastando pelo meio.
- [ ] A visão Dia tem o mesmo cabeçalho e os mesmos gestos da semana, com um dia só.
- [ ] O menu de exibição cabe o seu conteúdo e esconde os intervalos.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Esconder intervalos nos relatórios ou na aba Sessões | É uma opção de exibição da Agenda neste dispositivo, como a lupa e os dias. |
| Gestos de arrastar abaixo de 768 px | O toque rola a linha do tempo, e a issue trata do mouse. Os gestos continuam só a partir de 768 px. |
| Desfazer depois de salvar | `Cancelar` vale para o que ainda não foi salvo. |
| Mudar o backend ou a API | Todas as mudanças são do frontend. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Desenho | Canvas `Agenda — lote de ajustes`, https://claude.ai/artifact/2SNF5jGMCfZaND1Uio8Udg | Aprovado pelo usuário em 2026-11-05 | y |
| Largura do menu | 352 px (era 288 px) | Desenho aprovado | y |
| `Ocultar intervalos` | Um switch entre os dias da semana e a lupa, nas duas visões, desligado por padrão, lembrado neste dispositivo; ligado, acende o ponto do botão | Mesmo comportamento das outras opções do menu (DAYS-14, DAYS-15) | y |
| Intervalos escondidos | Saem da grade e do aviso de sobreposição; os totais do dia não mudam (já contam só tarefas) | Mesma regra das sessões curtas escondidas (HIDE-15) | y |
| Cabeçalho da visão Dia | `QUA.` / `4 de Novembro de 2026` / total do dia, com o mês em maiúscula | Pedido do usuário, com o exemplo dele | y |
| O que sai da visão Dia | A linha de título `Quarta-feira, 4 de novembro de 2026 · 8h 28min` | O cabeçalho já mostra o dia e o total; desenho aprovado | y |
| O que fica na visão Dia | A faixa dos 7 dias com as setas de semana e as mensagens de dia vazio ou futuro | Navegação que a semana não tem | y |
| `Nova sessão` na visão Dia | A partir de 768 px, o botão `Nova sessão` da barra aparece nas duas visões; o botão redondo `+` fica só abaixo de 768 px | O `+` flutuava sobre a grade, como o botão de exibição | y |
| Confirmação | Soltar um bloco salvo depois de arrastá-lo ou esticá-lo deixa o novo horário pendente e abre o painel com `Novo horário — ainda não salvo`, o horário antigo riscado, o novo, `Cancelar` e `Salvar horário` | Pedido do usuário; desenho aprovado | y |
| Esc e clicar fora | Esc, outro bloco, um clique na grade vazia ou outra semana descartam o pendente, como `Cancelar` | Suposição mostrada no desenho; o usuário não mudou | y |
| Horário original na grade | Nada marca o horário antigo na grade; ele aparece só no painel, riscado | Decisão do usuário | y |
| Arrastar durante `Editar` | Com o formulário `Editar` aberto, soltar o bloco muda os campos do formulário, que continua pedindo `Salvar`; mudar os campos move o bloco | Uma confirmação só, a do formulário que já está aberto | y |
| Ponteiro | Mão aberta sobre a área de mover (o meio do bloco), mão fechada enquanto arrasta, nos blocos salvos e no rascunho; nenhum texto no bloco | Decisão do usuário | y |
| Clique sem arrastar | Cria 60 min a partir do quarto de hora clicado, cortados em agora (hoje) ou na meia-noite; arrastar continua desenhando de 15 em 15 min | Pedido do usuário; os limites são os de AGENDA-23 | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Confirmar no painel o horário arrastado ⭐ MVP

**User Story**: Como usuário, quero confirmar o novo horário de uma sessão antes que ele seja salvo, e poder voltar atrás.

**Why P1**: Hoje um arraste por engano já muda o tempo registrado.

**Acceptance Criteria**:

1. WHEN a saved session's block is released after moving it or pulling an edge to a new time THEN the Agenda SHALL send nothing to the server, keep the block at the new time and open the panel of that session with `Novo horário — ainda não salvo`, the old date and times struck through and the new ones with the duration, `Cancelar` and `Salvar horário`.  <!-- event-driven -->
2. WHILE a new time is pending, the grid SHALL draw the block only at the new time, never at the old one, before, during and after the save request.  <!-- state-driven -->
3. WHEN `Salvar horário` is clicked THEN the Agenda SHALL send the new times once and, when the server accepts them, show the session's details at the new time.  <!-- event-driven -->
4. IF the server refuses the new times THEN the panel SHALL show the refusal, keep the pending time and keep `Cancelar` and `Salvar horário`.  <!-- unwanted-behavior -->
5. WHEN `Cancelar` is clicked or Esc is pressed THEN the Agenda SHALL put the block back at its saved time, send nothing and show the session's details.  <!-- event-driven -->
6. WHEN another block is clicked, a drag starts on empty time or another week opens while a time is pending THEN the Agenda SHALL discard it, as `Cancelar` does.  <!-- event-driven -->
7. WHILE a time is pending, the panel SHALL warn about an overlap with another session shown on the agenda, as the edit panel does (AGENDA-19).  <!-- state-driven -->
8. WHILE the `Editar` form of a session is open, releasing its block at a new time SHALL change the form's date, start and end without saving, and changing those fields SHALL move the block; `Cancelar` SHALL put it back.  <!-- state-driven -->
9. WHEN a session chosen from a joined block is saved with a new time THEN the Agenda SHALL go back to the block, as an edit does (MERGE-31).  <!-- event-driven -->

**Independent Test**: Arrastar um bloco salvo das 11:00 para as 13:00. O painel mostra `11:00 – 12:00` riscado e `13:00 – 14:00`, e nenhuma requisição sai. `Cancelar` devolve o bloco às 11:00. Repetir e clicar em `Salvar horário`: o bloco fica às 13:00 sem piscar.

---

### P1: Criar a nova sessão com 1h e movê-la ⭐ MVP

**User Story**: Como usuário, quero que um clique crie uma sessão de 1h que eu possa arrastar até o horário certo.

**Why P1**: Pedido da issue; hoje o rascunho só estica pelas bordas.

**Acceptance Criteria**:

10. WHEN empty time is clicked without moving the pointer THEN the Agenda SHALL draw a new session from the quarter hour clicked to 60 minutes later, cut at now on today and at midnight, and open `Nova sessão` with those times.  <!-- event-driven -->
11. WHEN the pointer is dragged over empty time THEN the Agenda SHALL draw the new session from where the drag began to where it is, in 15-minute steps, as today (AGENDA-14).  <!-- event-driven -->
12. WHEN the middle of the new session's block is dragged THEN the block SHALL move with the pointer in 15-minute steps, keep its length, follow the column under the pointer to another day, never end after the day's limit (AGENDA-23), and the panel's date, start and end SHALL follow it.  <!-- event-driven -->
13. WHEN the middle of the new session's block is pressed THEN the Agenda SHALL not start a new draft under it.  <!-- event-driven -->
14. The middle of a block that can move, saved or new, SHALL show the open hand pointer (`grab`), and the closed hand (`grabbing`) while it is dragged; the edges SHALL keep the resize pointer; the block SHALL show no text about moving.  <!-- ubiquitous -->

**Independent Test**: Clicar às 10:00 de ontem: o rascunho vai de 10:00 às 11:00. Arrastar pelo meio até as 12:00: o rascunho vai de 12:00 às 13:00, e o painel mostra esses horários.

---

### P2: Visão Dia igual à semana com um dia

**User Story**: Como usuário, quero que a visão Dia tenha o mesmo cabeçalho e os mesmos gestos da semana.

**Why P2**: O botão de exibição flutua sobre a linha do tempo, e a visão Dia não tem gestos.

**Acceptance Criteria**:

15. WHILE the Agenda is in the day view, it SHALL draw the day as the week grid does with a single column: the header row with the view options button in its first cell and the day's cell, the hour column, the blocks, the now line and the hatched future.  <!-- state-driven -->
16. WHILE the Agenda is in the day view, the day's header cell SHALL show the short weekday, the date as `4 de Novembro de 2026` (day, month name with a capital letter, year) and the day total.  <!-- state-driven -->
17. WHILE the Agenda is in the week view, the day header cells SHALL show the short weekday, the day number and the total, as today.  <!-- state-driven -->
18. The day view SHALL keep the strip of the seven days with the week arrows and the empty or future day message, and SHALL no longer show the title line with the long date.  <!-- ubiquitous -->
19. WHILE the screen is 768 px wide or more, the day view SHALL take the same gestures as the week (create, move, pull an edge) and the toolbar SHALL show `Nova sessão`; below 768 px the day view SHALL keep the round `+` button and take no drag gestures.  <!-- state-driven -->

**Independent Test**: Na visão Dia, a 1280 px, o botão de exibição fica na primeira célula do cabeçalho, ao lado de `QUA.` / `4 de Novembro de 2026` / `9h 34min`. Arrastar na linha do tempo cria um rascunho.

---

### P2: Menu de exibição mais largo e `Ocultar intervalos`

**User Story**: Como usuário, quero esconder os intervalos da Agenda, e que o menu não fique apertado.

**Why P2**: Pedido da issue.

**Acceptance Criteria**:

20. The view options menu SHALL be 352 px wide, with at least 16 px between `Dias da semana` and its shortcuts.  <!-- ubiquitous -->
21. The menu SHALL show, in both views, a switch named `Ocultar intervalos`, with the hint `Esconde as pausas da agenda`, between the week days and the zoom; it SHALL be off the first time.  <!-- ubiquitous -->
22. WHEN `Ocultar intervalos` is turned on THEN the grid SHALL leave out every break block at once, open or closed, and the menu SHALL stay open; turned off, the breaks SHALL come back at once.  <!-- event-driven -->
23. WHILE breaks are hidden, the day totals SHALL not change, and the overlap warning SHALL not name a break.  <!-- state-driven -->
24. WHILE breaks are hidden, the view options button SHALL show its dot, in both views.  <!-- state-driven -->
25. WHEN the Agenda opens THEN `Ocultar intervalos` SHALL be as it was left last on this device, or off when storage holds no valid choice.  <!-- event-driven -->

**Independent Test**: Ligar `Ocultar intervalos`: os blocos tracejados de intervalo somem, os totais continuam iguais e o botão ganha o ponto. Recarregar: os intervalos continuam escondidos.

---

## Edge Cases

- **Agora como limite:** IF today's click lands less than 60 minutes before now THEN the new session SHALL end at now's quarter hour (ADJ-10). A click with no room before now creates nothing, as today (AGENDA-23).
- **Soltar no mesmo lugar:** WHEN a saved block is released at its own time THEN the Agenda SHALL leave nothing pending and open no panel for it.
- **Sessões que não se movem:** the running session and a joined block SHALL not move, as today (AGENDA-33, MERGE-30). Neither shows the hand pointer.
- **Sessão escondida:** IF a pending time makes the session shorter than the workspace minimum THEN the block SHALL stay drawn until it is saved (HIDE-17).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| ADJ-01 | P1: Confirmar | T3, T5, T6 | Implemented |
| ADJ-02 | P1: Confirmar | T3, T6 | Implemented |
| ADJ-03 | P1: Confirmar | T6 | Implemented |
| ADJ-04 | P1: Confirmar | T5, T6 | Implemented |
| ADJ-05 | P1: Confirmar | T5, T6 | Implemented |
| ADJ-06 | P1: Confirmar | T6 | Implemented |
| ADJ-07 | P1: Confirmar | T5, T6 | Implemented |
| ADJ-08 | P1: Confirmar | T6 | Implemented |
| ADJ-09 | P1: Confirmar | T6 | Implemented |
| ADJ-10 | P1: Nova sessão | T3 | Implemented |
| ADJ-11 | P1: Nova sessão | T3 | Implemented |
| ADJ-12 | P1: Nova sessão | T3, T4 | Implemented |
| ADJ-13 | P1: Nova sessão | T4 | Implemented |
| ADJ-14 | P1: Nova sessão | T4 | Implemented |
| ADJ-15 | P2: Visão Dia | T7 | Implemented |
| ADJ-16 | P2: Visão Dia | T7 | Implemented |
| ADJ-17 | P2: Visão Dia | T7 | Implemented |
| ADJ-18 | P2: Visão Dia | T7 | Implemented |
| ADJ-19 | P2: Visão Dia | T8 | Implemented |
| ADJ-20 | P2: Menu | T1 | Implemented |
| ADJ-21 | P2: Menu | T1 | Implemented |
| ADJ-22 | P2: Menu | T2 | Implemented |
| ADJ-23 | P2: Menu | T2 | Implemented |
| ADJ-24 | P2: Menu | T1, T2 | Implemented |
| ADJ-25 | P2: Menu | T1, T2 | Implemented |

**Coverage:** 25 total, 25 mapped to tasks, 25 implemented (Verifier pending)

---

## Success Criteria

- [ ] Nenhum arraste muda uma sessão no servidor sem `Salvar horário`, e o bloco nunca volta ao horário antigo depois de solto.
- [ ] Um clique cria 1h, e o rascunho se move pelo meio.
- [ ] A visão Dia tem o cabeçalho e os gestos da semana, com o botão de exibição na primeira célula.
- [ ] `Ocultar intervalos` esconde os intervalos e continua assim ao reabrir a Agenda.
