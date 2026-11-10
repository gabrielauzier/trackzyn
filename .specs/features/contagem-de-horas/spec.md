# Contagem de horas Specification

Início: 2026-11-10 · Issue: #42 · Base: `main` (`0cfb40d`)

## Problem Statement

A Agenda, os Relatórios, o Planejamento e o tempo gasto de cada tarefa somam cada sessão ou bloco inteiro, mesmo quando dois deles ocupam o mesmo horário. Uma sessão manual registrada por cima de uma sessão de foco, ou dois blocos do plano lado a lado, contam a mesma hora duas vezes, e o total do dia passa do tempo que de fato passou. A issue #42 pede uma configuração do workspace que escolha entre essa soma (horas totais, como hoje) e as horas líquidas, em que o tempo sobreposto conta uma vez.

O que o código já fixa:

- **Sessões:** `focus_sessions` tem `started_at` e `ended_at`; uma sessão aberta conta até agora, nunca além de `deadline_at` (AD-001). Nada impede duas sessões no mesmo horário: só uma pode estar aberta por usuário (`ix_focus_sessions_open_user`), e a Agenda só avisa a sobreposição (`session.overlap`).
- **Configurações do workspace:** cada uma é uma coluna de `workspaces` (`min_session_minutes`, `merge_gap_minutes`), alterada por `PATCH /api/workspaces/:id` pelo dono ou gestor, na tela de configurações do workspace.
- **Plano:** os blocos têm início e duração, e podem se sobrepor (planejamento PLAN, "Sobreposição de blocos").
- **Dia:** o dia e a hora usam o fuso do workspace (AD-004).

## Goals

- [ ] O dono ou gestor escolhe, nas configurações do workspace, entre `Horas totais` e `Horas líquidas`; o padrão é `Horas totais`, e nada muda para quem não mexer.
- [ ] Com `Horas líquidas`, uma hora em que duas sessões de tarefa se sobrepõem conta uma vez no total do dia da Agenda, nos totais dos Relatórios, no tempo gasto da tarefa e na barra de capacidade do plano.
- [ ] Quem lê um total líquido sabe que ele é líquido e consegue ver o total bruto nos Relatórios e na Agenda.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Impedir ou desfazer sessões sobrepostas | A configuração só muda a conta; as sessões gravadas ficam como estão. |
| Tempo líquido por lista nos Relatórios | Decisão do usuário (2026-11-10): cada lista mostra o tempo inteiro; só o total geral é líquido. |
| Somas de estimativas sem horário (colunas do quadro, `estimate_minutes` de Hoje no foco, resumo `N tarefas · X` do painel do dia da Agenda) | Sem início e fim não há sobreposição para descontar. |
| Duração de cada sessão na aba Sessões dos Relatórios e na lista de um bloco unido | Cada linha é uma sessão só; nada é somado. |
| Configuração por usuário | A issue pede uma configuração do workspace. |
| Mobile | O app mobile não usa este backend. |
| Ler ou mudar a configuração por token de acesso (`tkz_`) | AD-007: a rota de workspace não tem escopo de token. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Telas que seguem a configuração | Agenda (total do dia e duração de um bloco unido), Relatórios, capacidade do Planejamento e tempo gasto por tarefa (quadro, foco, widget, MCP `get_board`, feito × estimado) | Decisão do usuário (2026-11-10) | y |
| Tempo por lista nos Relatórios | Inteiro em cada lista; o total geral é líquido; a tela avisa o modo e mostra o total bruto | Decisão do usuário (2026-11-10) | y |
| Intervalo sobreposto a uma sessão de tarefa | O trecho conta só como tarefa: o tempo trabalhado não muda e o trecho sai do tempo de pausa | Decisão do usuário (2026-11-10) | y |
| Onde aparece o total bruto | Nos Relatórios (aviso + bruto no card `Tempo trabalhado`) e no tooltip do total do dia na Agenda; nas outras telas, só o número do modo escolhido | Decisão do usuário (2026-11-10) | y |
| Valor padrão | `Horas totais` (`gross`) em todo workspace, novo ou existente | A issue diz "horas totais (assim como é hoje)"; ninguém vê um número mudar sem escolher | y |
| Quem altera | O dono ou o gestor (`manager`); os outros veem a opção desabilitada; 403 para os demais | Mesma regra de #22 e #23 | y |
| Forma do controle | Um card no padrão dos cards `Formato de data` e `Formato de número` da administração (`pages/admin/settings.tsx`): cabeçalho com ícone de relógio, título e descrição; uma linha por opção, com rádio, nome, exemplo e explicação. Fica logo abaixo de `Juntar sessões próximas`. Desenho: https://claude.ai/artifact/Lq85wA2HSJT7BVYpBBtC4r | Duas escolhas exclusivas no padrão de configuração que o app já usa; desenho aprovado pelo usuário em 2026-11-10 | y |
| O que é sobreposição | Dois trechos se sobrepõem quando um começa antes do outro terminar; trechos que só se encostam (fim de um = início do outro) não se sobrepõem | Encostar não conta tempo duas vezes | y |
| Sessões de quem | Só as sessões do usuário logado entram na união dos Relatórios e da Agenda (já é o recorte dessas telas). No tempo gasto da tarefa, a união junta as sessões de todos os membros naquela tarefa | O tempo gasto da tarefa já soma as sessões de todos os membros; a configuração só tira a hora repetida | y |
| Planejamento líquido | Planejado = união dos blocos de tarefa; agendadas = parte do expediente coberta pelas tarefas agendadas sem bloco e fora dos blocos de tarefa; pausas = parte do expediente coberta pelas pausas e fora de qualquer tarefa (blocos e agendadas); livre = expediente − pausas − agendadas | Aplica "conta uma vez" e "pausa sobreposta conta como tarefa" à barra do plano | y |
| Prazo da estimativa no foco | O fim da estimativa de uma sessão de foco (`deadline_at`) e o `Estender` usam o mesmo tempo gasto que a tela mostra | A tela e o prazo não podem discordar sobre quanto falta | y |
| Texto do aviso de sobreposição na Agenda | Com `Horas totais`, continua `O tempo em comum conta nas duas.`; com `Horas líquidas`, vira `O tempo em comum conta uma vez no total.` | O aviso hoje descreve a regra de contagem | y |
| Troca de modo | Vale na próxima leitura de cada tela; nada é recalculado ou gravado | Toda conta é feita na leitura | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Escolher o modo de contagem ⭐ MVP

**User Story**: Como dono do workspace, quero escolher entre horas totais e horas líquidas, para que os números reflitam como o meu time trabalha.

**Why P1**: Sem a configuração, nenhuma tela muda.

**Acceptance Criteria**:

1. The system SHALL guardar em cada workspace o modo de contagem, `gross` (`Horas totais`) ou `net` (`Horas líquidas`), com `gross` em todo workspace existente e em todo workspace novo. (HOURS-01)
2. The system SHALL devolver o modo como `hours_count_mode` na leitura do workspace (`GET /api/workspaces`, `GET /api/workspaces/:id` e a resposta do `PATCH`). (HOURS-02)
3. WHEN o dono ou o gestor envia `hours_count_mode` igual a `gross` ou `net` em `PATCH /api/workspaces/:id` THEN o sistema SHALL gravar o valor; WHEN o campo não vem THEN o sistema SHALL manter o valor guardado. (HOURS-03)
4. IF `hours_count_mode` vem com qualquer valor que não seja `gross` ou `net`, inclusive `null` THEN o sistema SHALL responder 422 e manter o valor guardado. (HOURS-04)
5. IF um membro que não é dono nem gestor envia `hours_count_mode` THEN o sistema SHALL responder 403 e manter o valor guardado. (HOURS-05)
6. The system SHALL mostrar nas configurações do workspace, abaixo de `Juntar sessões próximas`, o card `Contagem de horas` com a descrição `Como a Agenda, os Relatórios, o Planejamento e o tempo gasto das tarefas somam sessões e blocos que se sobrepõem.` e as opções `Horas totais` (exemplo `09:00–11:00 + 10:00–12:00 = 4h`; explicação `Soma cada sessão inteira, mesmo quando sessões se sobrepõem.`) e `Horas líquidas` (exemplo `09:00–11:00 + 10:00–12:00 = 3h`; explicação `O tempo em que sessões ou blocos se sobrepõem conta uma vez.`), com a opção guardada marcada. (HOURS-06)
7. WHEN o dono ou o gestor escolhe outra opção THEN o sistema SHALL gravá-la e as telas abertas SHALL usar o novo modo na próxima leitura, sem recarregar a página. (HOURS-07)
8. WHILE o membro não é dono nem gestor, o sistema SHALL mostrar o grupo com as opções desabilitadas. (HOURS-08)

**Independent Test**: Como dono, escolher `Horas líquidas`, recarregar e ver a opção marcada; como editor, ver as opções desabilitadas; um `PATCH` com `hours_count_mode: "liquid"` responde 422.

---

### P1: Agenda em horas líquidas ⭐ MVP

**User Story**: Como usuário, quero que o total do dia na Agenda conte uma vez as horas em que registrei duas sessões ao mesmo tempo, para que ele bata com o dia que vivi.

**Why P1**: É a tela citada primeiro na issue e a que mostra o total diário.

**Acceptance Criteria**:

1. WHERE o modo é `net` the system SHALL mostrar como total do dia a duração da união dos trechos das sessões de tarefa daquele dia, inclusive as escondidas por `Esconder sessões curtas` (HIDE-14). (HOURS-09)
2. WHERE o modo é `gross` the system SHALL mostrar como total do dia a soma das durações das sessões de tarefa do dia, como hoje. (HOURS-10)
3. WHERE o modo é `net`, WHEN o usuário passa o mouse ou foca o total do dia THEN o sistema SHALL mostrar o tooltip `Horas líquidas · bruto: <total bruto>`, com o bruto no formato do app (`formatDuration`). (HOURS-11)
4. The system SHALL não contar intervalos no total do dia da Agenda, em nenhum dos modos (AGENDA-01). (HOURS-12)
5. WHERE o modo é `net` the system SHALL mostrar como duração de um bloco unido (`Juntar sessões próximas`) a duração da união das sessões do bloco. (HOURS-13)
6. WHEN uma sessão sendo criada, editada ou movida se sobrepõe a outra THEN o aviso SHALL terminar em `O tempo em comum conta nas duas.` no modo `gross` e em `O tempo em comum conta uma vez no total.` no modo `net`. (HOURS-14)

**Independent Test**: Com `Horas líquidas`, uma sessão de foco das 09:00 às 11:00 e uma manual das 10:00 às 12:00 no mesmo dia mostram `3h` no cabeçalho, com o tooltip `Horas líquidas · bruto: 4h`; com `Horas totais`, mostram `4h`.

---

### P1: Relatórios em horas líquidas ⭐ MVP

**User Story**: Como usuário, quero que o tempo trabalhado dos Relatórios conte uma vez as horas sobrepostas, e saber quanto daria somando tudo, para comparar períodos com números honestos.

**Why P1**: É a segunda tela citada na issue e a que resume semanas e meses.

**Acceptance Criteria**:

1. WHERE o modo é `net` the system SHALL calcular o card `Tempo trabalhado`, o tempo de tarefa de cada dia do gráfico diário, os dias trabalhados, a média por tarefa e os horários, dias da semana e meses mais produtivos a partir da união dos trechos das sessões de tarefa do usuário no período, cortados como hoje (REPORT-10, REPORT-11). (HOURS-15)
2. WHERE o modo é `net` the system SHALL calcular o tempo de intervalo do período e de cada dia como a união dos trechos dos intervalos menos o que coincide com qualquer sessão de tarefa. (HOURS-16)
3. The system SHALL mostrar o tempo de cada lista em `Tempo por lista` como a soma das sessões de tarefa daquela lista, inteira, nos dois modos. (HOURS-17)
4. WHERE o modo é `net` the system SHALL mostrar acima dos cards o aviso `Horas líquidas: o tempo em que sessões se sobrepõem conta uma vez no total. O tempo de cada lista conta inteiro.` (HOURS-18)
5. WHERE o modo é `net` the system SHALL mostrar no card `Tempo trabalhado` a linha `Bruto: <total bruto>`, com o bruto igual à soma das sessões de tarefa do período cortadas ao período. (HOURS-19)
6. WHERE o modo é `gross` the system SHALL calcular todos os números dos Relatórios como hoje, sem o aviso e sem a linha `Bruto`. (HOURS-20)
7. The system SHALL devolver em `GET /api/reports/overview` o modo usado (`hours_count_mode`) e o total bruto de tarefas do período (`tiles.gross_task_seconds`), nos dois modos. (HOURS-21)
8. The system SHALL arredondar para baixo, uma vez, cada valor líquido a partir da soma exata, como os valores de hoje (REPORT, L-016). (HOURS-22)

**Independent Test**: Com `Horas líquidas`, uma sessão da lista A das 09:00 às 11:00 e uma da lista B das 10:00 às 12:00: `Tempo trabalhado` mostra `3h` e `Bruto: 4h`, o dia mostra 3h no gráfico, e `Tempo por lista` mostra A `2h` e B `2h` com o aviso acima dos cards.

---

### P1: Tempo gasto da tarefa em horas líquidas ⭐ MVP

**User Story**: Como usuário, quero que o tempo gasto de uma tarefa não conte duas vezes a hora em que ela tem duas sessões, para que a comparação com a estimativa seja real.

**Why P1**: É o número que decide se a estimativa estourou.

**Acceptance Criteria**:

1. WHERE o modo é `net` the system SHALL calcular o tempo gasto de cada tarefa como a duração da união dos trechos de todas as sessões de tarefa dela, de todos os membros, com a sessão aberta contando até agora e nunca além de `deadline_at`. (HOURS-23)
2. The system SHALL usar o mesmo tempo gasto no card do quadro (`spent_seconds`), no foco, no widget, na ferramenta MCP `get_board` e no gráfico feito × estimado dos Relatórios. (HOURS-24)
3. WHERE o modo é `net` the system SHALL calcular o fim da estimativa de uma sessão de foco que começa e o `Estender` a partir do tempo gasto líquido. (HOURS-25)
4. WHERE o modo é `gross` the system SHALL calcular o tempo gasto como a soma das sessões da tarefa, como hoje. (HOURS-26)

**Independent Test**: Com `Horas líquidas`, uma tarefa com uma sessão de foco das 09:00 às 10:00 e uma manual das 09:30 às 10:30 mostra `1h 30min` gastos no card do quadro; com `Horas totais`, `2h`.

---

### P1: Capacidade do plano em horas líquidas ⭐ MVP

**User Story**: Como usuário, quero que a barra do plano conte uma vez os blocos sobrepostos, para saber se o dia cabe sem inflar o planejado.

**Why P1**: É a terceira tela citada na issue.

**Acceptance Criteria**:

1. WHERE o modo é `net` the system SHALL calcular `planejadas` como a duração da união dos blocos de tarefa do plano. (HOURS-27)
2. WHERE o modo é `net` the system SHALL calcular `agendadas` como os minutos do expediente cobertos pelas tarefas agendadas com hora sem bloco no plano, contados uma vez e fora dos blocos de tarefa. (HOURS-28)
3. WHERE o modo é `net` the system SHALL calcular `em pausas` como os minutos do expediente cobertos pelas pausas, contados uma vez e fora dos blocos de tarefa e das tarefas agendadas. (HOURS-29)
4. The system SHALL calcular `livres` como o expediente menos pausas e agendadas, e o excesso como planejadas menos livres, nos dois modos (PLAN-19, PLAN-20). (HOURS-30)
5. WHERE o modo é `gross` the system SHALL calcular a barra como hoje. (HOURS-31)

**Independent Test**: Com `Horas líquidas`, expediente 09:00–18:00, dois blocos de tarefa das 10:00 às 12:00 e das 11:00 às 13:00 e um almoço das 12:00 às 13:00: a barra mostra `3h planejadas de 9h livres` (o almoço coberto pelo bloco não conta como pausa); com `Horas totais`, `4h planejadas de 8h livres · 1h em pausas`.

---

## Edge Cases

- WHEN duas sessões só se encostam (o fim de uma é o início da outra) THEN o total líquido SHALL ser igual ao bruto. (HOURS-32)
- WHEN uma sessão fica inteira dentro de outra THEN o total líquido SHALL ser a duração da maior. (HOURS-33)
- WHEN três sessões se encadeiam (A sobrepõe B, B sobrepõe C, A não toca C) THEN o total líquido SHALL ser do início de A ao fim do último fim. (HOURS-34)
- WHEN uma sessão aberta se sobrepõe a uma manual THEN o total líquido SHALL contar a aberta até agora (nunca além de `deadline_at`) e a união uma vez. (HOURS-35)
- WHEN duas sessões sobrepostas atravessam a meia-noite no fuso do workspace THEN cada dia SHALL receber só a união dos trechos dentro dele, e a soma dos dois dias SHALL ser igual ao total líquido do período. (HOURS-36)
- WHEN o filtro de lista dos Relatórios está ativo THEN a união SHALL considerar só as sessões daquela lista. (HOURS-37)
- WHEN não há sobreposição no período THEN o total líquido SHALL ser igual ao bruto, e a linha `Bruto` e o aviso SHALL continuar aparecendo no modo `net`. (HOURS-38)
- WHEN sessões de dois membros diferentes se sobrepõem nos Relatórios ou na Agenda THEN nenhuma SHALL entrar na conta do outro: cada um vê só as suas. (HOURS-39)

---

## Requirement Traceability

| Requirement ID | Story | Task | Status |
| --- | --- | --- | --- |
| HOURS-01 | P1: Escolher o modo | T1 | Implementing |
| HOURS-02 | P1: Escolher o modo | T1 | Implementing |
| HOURS-03 | P1: Escolher o modo | T1 | Implementing |
| HOURS-04 | P1: Escolher o modo | T1 | Implementing |
| HOURS-05 | P1: Escolher o modo | T1 | Implementing |
| HOURS-06 | P1: Escolher o modo | T2 | In Tasks |
| HOURS-07 | P1: Escolher o modo | T2 | In Tasks |
| HOURS-08 | P1: Escolher o modo | T2 | In Tasks |
| HOURS-09 | P1: Agenda | T6 | In Tasks |
| HOURS-10 | P1: Agenda | T6 | In Tasks |
| HOURS-11 | P1: Agenda | T6 | In Tasks |
| HOURS-12 | P1: Agenda | T6 | In Tasks |
| HOURS-13 | P1: Agenda | T6 | In Tasks |
| HOURS-14 | P1: Agenda | T6 | In Tasks |
| HOURS-15 | P1: Relatórios | T4 | In Tasks |
| HOURS-16 | P1: Relatórios | T4 | In Tasks |
| HOURS-17 | P1: Relatórios | T4 | In Tasks |
| HOURS-18 | P1: Relatórios | T8 | In Tasks |
| HOURS-19 | P1: Relatórios | T8 | In Tasks |
| HOURS-20 | P1: Relatórios | T4, T8 | In Tasks |
| HOURS-21 | P1: Relatórios | T4 | In Tasks |
| HOURS-22 | P1: Relatórios | T4 | In Tasks |
| HOURS-23 | P1: Tempo gasto | T3 | In Tasks |
| HOURS-24 | P1: Tempo gasto | T3 | In Tasks |
| HOURS-25 | P1: Tempo gasto | T3 | In Tasks |
| HOURS-26 | P1: Tempo gasto | T3 | In Tasks |
| HOURS-27 | P1: Capacidade do plano | T7 | In Tasks |
| HOURS-28 | P1: Capacidade do plano | T7 | In Tasks |
| HOURS-29 | P1: Capacidade do plano | T7 | In Tasks |
| HOURS-30 | P1: Capacidade do plano | T7 | In Tasks |
| HOURS-31 | P1: Capacidade do plano | T7 | In Tasks |
| HOURS-32 | Edge case | T3, T5 | In Tasks |
| HOURS-33 | Edge case | T3, T5 | In Tasks |
| HOURS-34 | Edge case | T3, T5 | In Tasks |
| HOURS-35 | Edge case | T3 | In Tasks |
| HOURS-36 | Edge case | T4 | In Tasks |
| HOURS-37 | Edge case | T4 | In Tasks |
| HOURS-38 | Edge case | T4 | In Tasks |
| HOURS-39 | Edge case | T4 | In Tasks |

**Coverage:** 39 total, 39 mapped to tasks, 0 unmapped

---

## Success Criteria

- [ ] Com `Horas totais`, todos os números das quatro telas ficam iguais aos de antes da feature (os testes atuais passam sem mudança de valor).
- [ ] Com `Horas líquidas`, os exemplos dos Independent Tests dão exatamente os valores escritos.
