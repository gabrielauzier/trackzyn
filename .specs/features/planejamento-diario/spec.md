# Planejamento diário Specification

Início: 2026-11-07 · Depende de: `agendamento` (PR #38) · Branch de referência: `feat/agendamento`

**Design das telas (rascunho, 2026-11-07):** https://claude.ai/artifact/NgiA3ovkTSTBJkUKLbieFu

## Problem Statement

O agendamento põe uma tarefa num dia e numa hora, uma de cada vez, e o horário é o mesmo para todo o workspace. Falta um momento de montar o dia inteiro: escolher o que entra, ver se cabe no expediente e reservar as pausas, como café e almoço. O plano de cada pessoa é diferente, mesmo quando as tarefas são compartilhadas.

O que o código já fixa:

- **Tarefa:** `tasks.estimate_minutes` (1 a 1440), `scheduled_on` e `scheduled_time` (agendamento, AD-009). A tarefa não tem responsável, e o agendamento vale para o workspace (agendamento D9).
- **Intervalo:** `focus_sessions` com `kind = 'break'`, `task_id` nulo, `list_id` obrigatório e `planned_seconds`. `POST /api/focus/break` abre um intervalo de 1 a 120 min numa lista.
- **Grade:** a Agenda tem o layout de dia (`lib/agenda/layout.ts`) e o arraste com passo de 15 min (`use-grid-drag.ts`), e os horários aceitam qualquer minuto no campo HH:MM (agendamento D34).
- **Preferências pessoais:** `users.preferences` (JSON) guarda as preferências do usuário.
- **Tokens:** rota nova fica fechada a tokens `tkz_` até declarar escopo (AD-007).

## Goals

- [ ] O usuário monta o plano de amanhã, com tarefas e pausas, em uma tela própria, e o salva de uma vez.
- [ ] O plano mostra se as tarefas cabem no expediente antes de salvar.
- [ ] Uma pausa planejada vira uma sessão de Intervalo quando o usuário a começa.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Pausas fixas (almoço todo dia às 12:00) | Segunda versão; a primeira usa pausas avulsas (PLAN-D6). |
| `Encaixar` automático das tarefas nos buracos | P3; fora da primeira entrega. |
| Planejado × realizado no fim do dia | Próxima feature; o modelo guarda o plano por dia para permitir a comparação depois. |
| Iniciar a pausa sozinho ou avisar no horário | Decisão de 2026-11-07: o usuário inicia (PLAN-D4). Sem worker no modo local. |
| Planejar ocorrências projetadas de uma série | Só a ocorrência aberta é uma tarefa real (agendamento D14). |
| API pública por token e ferramentas MCP do plano | AD-007: as rotas novas ficam fechadas a tokens nesta entrega. |
| Planejar pelo mobile | O app mobile não tem grade de planejamento. |
| Ver o plano de outra pessoa | O plano é pessoal (PLAN-D2). |
| Mudar a estimativa da tarefa pelo plano | A duração do bloco é do plano (PLAN-D3). |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Rascunho ou salvar a cada arraste | Rascunho na tela; `Confirmar plano` salva o dia inteiro de uma vez | Decisão do usuário (2026-11-07), mesma lógica da D35 do agendamento | y |
| Pausa | Entidade nova, um bloco do plano do tipo pausa; ao começar, vira uma sessão de Intervalo | Decisão do usuário (2026-11-07) | y |
| De quem é o plano | Do usuário, por workspace e por dia | Decisão do usuário (2026-11-07) | y |
| Qual dia | Qualquer dia de hoje em diante, abrindo em amanhã | Decisão do usuário (2026-11-07) | y |
| Plano × agendamento da tarefa | O bloco é só do usuário (tarefa, dia, início, duração). Confirmar só dá à tarefa sem dia o dia do plano, sem hora, para ela ir para Hoje. A hora e a duração não mudam a tarefa | Decisão do usuário (2026-11-07) | y |
| Pausa → Intervalo | O usuário clica em `Começar` na pausa; abre um Intervalo com a duração planejada | Decisão do usuário (2026-11-07) | y |
| Tarefa já agendada para outro dia | O bloco mostra `Agendada para <dia>`; confirmar não muda o dia da tarefa | O agendamento é compartilhado; o plano não move a tarefa de outras pessoas | y |
| Dias passados | O plano de um dia antes de hoje abre só para leitura | Base do planejado × realizado; editar o passado não planeja nada | y |
| Horário de trabalho | Preferência do usuário (`users.preferences.workday`), padrão 09:00 às 18:00, editável na própria tela | O expediente é pessoal, como o plano | y |
| Duração dos blocos | Tarefa: a estimativa, ou 1h sem estimativa (agendamento D23), de 5 min a 24 h. Pausa: de 5 a 120 min, o limite do Intervalo | Mesmo tamanho da Agenda; o Intervalo aceita até 120 min | y |
| Pausas prontas | `Café` 15 min e `Almoço` 1h; `Nova pausa` pede nome (1 a 40 caracteres) e duração | Os dois casos que o usuário citou | y |
| Lista da pausa | A pausa guarda a lista do Intervalo; padrão é a primeira lista ativa, editável no bloco | `focus_sessions.list_id` é obrigatório (mesma regra do intervalo manual da Agenda) | y |
| Sobreposição de blocos | Permitida; os blocos dividem a largura como na Agenda | Mesma regra das sessões (AGENDA-06) | y |
| Capacidade | Livre = minutos do expediente menos as pausas e as tarefas agendadas com hora dentro dele; planejado = soma dos blocos de tarefa | É a conta que responde "cabe no dia?"; a tarefa com hora ocupa o expediente mesmo fora do plano (decisão do usuário, 2026-11-07) | y |
| Mesma tarefa duas vezes no dia | Permitido (dois blocos) | Uma tarefa longa pode ser feita em duas partes | y |
| Viewer | Responde 403 `Read-only role` ao salvar | Mesma regra das escritas do workspace | y |
| Duas abas salvando o mesmo dia | A segunda recebe 409 `plan_changed` e a tela oferece recarregar | Evita que um rascunho velho apague o plano novo | y |
| Rascunho ao sair | Sair com mudanças não salvas pede `Descartar o rascunho?`; o rascunho não sobrevive a recarregar a página | Menor escopo que cumpre "nada salvo sem confirmar" | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Montar o plano de um dia ⭐ MVP

**User Story**: Como usuário, quero arrastar tarefas para a grade de um dia e salvar o plano, para saber o que vou fazer e quando.

**Why P1**: É a feature; as outras histórias completam esta.

**Acceptance Criteria**:

1. WHEN o usuário clica em `Planejar amanhã` na Agenda ou em Hoje THEN o sistema SHALL abrir `/planejar/<AAAA-MM-DD>` com o dia seguinte no fuso do workspace. (PLAN-01)
2. The system SHALL mostrar, à esquerda, as tarefas pendentes do workspace agrupadas em `Agendadas para o dia`, `Hoje`, `Esta semana` e `Backlog`, com busca por título e filtro por lista. (PLAN-02)
3. The system SHALL mostrar, à direita, a grade de um dia de 00:00 a 24:00, rolada até o início do expediente, com as tarefas agendadas com hora do workspace e as sessões do usuário daquele dia como blocos fixos, que não podem ser arrastados. (PLAN-03)
4. WHEN o usuário solta uma tarefa da lista na grade THEN o sistema SHALL criar no rascunho um bloco no horário do ponto solto, no passo de 15 min, com a duração da estimativa da tarefa ou 1h sem estimativa. (PLAN-04)
5. WHEN o usuário arrasta um bloco do rascunho THEN o sistema SHALL movê-lo no passo de 15 min, e WHEN puxa a borda de baixo THEN o sistema SHALL mudar a duração do bloco, de 5 min a 24 h, sem mudar a estimativa da tarefa. (PLAN-05)
6. WHEN o usuário abre um bloco THEN o sistema SHALL permitir editar o início e a duração em campos HH:MM e remover o bloco do rascunho; o campo de duração vai até `23:59`, e um bloco de 24 h só se alcança puxando a borda (PLAN-05). (PLAN-06)
7. WHILE o rascunho tem mudanças não salvas, o sistema SHALL mostrar `Rascunho — ainda não salvo` e os botões `Descartar` e `Confirmar plano`, e nada SHALL ser gravado. (PLAN-07)
8. WHEN o usuário clica em `Confirmar plano` THEN o sistema SHALL substituir o plano salvo do dia pelo rascunho, numa única gravação, e mostrar `Plano salvo`. (PLAN-08)
9. WHEN o plano é salvo THEN cada tarefa planejada sem `scheduled_on` SHALL receber o dia do plano, sem hora, com as regras de salvar do agendamento (D3). (PLAN-09)
10. The system SHALL não mudar `scheduled_time` nem `estimate_minutes` de nenhuma tarefa ao salvar o plano. (PLAN-10)
11. WHEN o usuário abre o dia de um plano salvo THEN o sistema SHALL mostrar os blocos salvos, e qualquer mudança SHALL voltar a ser rascunho. (PLAN-11)
12. The system SHALL mostrar só o plano do usuário logado no workspace atual. (PLAN-12)
13. WHEN o usuário troca de dia pelas setas ou pelo calendário do cabeçalho THEN o sistema SHALL abrir o plano daquele dia. (PLAN-13)

**Independent Test**: Abrir `Planejar amanhã`, soltar duas tarefas na grade, confirmar, recarregar e ver os dois blocos no mesmo lugar; a tarefa que não tinha dia aparece agendada para amanhã, sem hora.

---

### P1: Planejar pausas ⭐ MVP

**User Story**: Como usuário, quero reservar o café e o almoço no plano, para que o dia tenha as pausas e a conta de horas fique honesta.

**Why P1**: É metade do pedido; sem pausas o plano não reflete o dia.

**Acceptance Criteria**:

1. The system SHALL mostrar, acima das tarefas, as pausas prontas `Café` (`15min`) e `Almoço` (`1h`) e o botão `Nova pausa`, com as durações no formato do app (`formatDuration`: `15min`, `1h`, `1h 30min`), o mesmo em blocos, editor e barra de capacidade. (PLAN-14)
2. WHEN o usuário solta uma pausa na grade THEN o sistema SHALL criar no rascunho um bloco de pausa com o nome e a duração dela, desenhado em cinza hachurado, diferente dos blocos de tarefa. (PLAN-15)
3. WHEN o usuário cria uma `Nova pausa` THEN o sistema SHALL pedir o nome (1 a 40 caracteres) e a duração, e criar o bloco no rascunho; IF o nome fica vazio ou passa de 40 caracteres THEN o sistema SHALL mostrar `O nome vai de 1 a 40 caracteres` e não criar. (PLAN-16)
4. IF a duração de uma pausa fica fora de 5 a 120 min THEN o sistema SHALL recusar a mudança com `A pausa vai de 5 min a 2h` e manter a duração anterior. (PLAN-17)
5. The system SHALL guardar em cada pausa a lista do Intervalo, com a primeira lista ativa já escolhida e editável no bloco. (PLAN-18)

**Independent Test**: Soltar `Almoço` às 12:00, confirmar, recarregar e ver o bloco hachurado `Almoço 12:00 – 13:00`.

---

### P1: Ver se o dia cabe ⭐ MVP

**User Story**: Como usuário, quero ver quanto planejei contra o tempo livre do expediente, para não planejar mais do que cabe.

**Why P1**: É o que diferencia planejar de só agendar.

**Acceptance Criteria**:

1. The system SHALL mostrar no topo `<planejado> planejadas de <livre> livres · <pausas> em pausas · <agendadas> agendadas`, onde planejado é a soma dos blocos de tarefa; pausas é a soma das pausas dentro do expediente; agendadas é o tempo, dentro do expediente, das tarefas pendentes agendadas com hora para o dia que não têm bloco no plano (a estimativa, ou 1h sem estimativa); e livre é o expediente menos pausas e agendadas. O trecho `· <agendadas> agendadas` só aparece quando é maior que zero. (PLAN-19)
2. WHEN o planejado passa do livre THEN o sistema SHALL mostrar a barra em vermelho com `<excesso> além do expediente`. (PLAN-20)
3. The system SHALL marcar na grade o início e o fim do expediente do usuário, com o horário fora dele em tom mais fraco. (PLAN-21)
4. WHEN o usuário muda o expediente na tela THEN o sistema SHALL salvar o novo início e fim nas preferências dele e recalcular a barra. (PLAN-22)
5. IF o fim do expediente não é depois do início THEN o sistema SHALL recusar com `O fim precisa ser depois do início`. (PLAN-23)

**Independent Test**: Com expediente 09:00–18:00, um almoço de 1h e 9h de tarefas, a barra mostra `9h planejadas de 8h livres · 1h em pausas` em vermelho, com `1h além do expediente`. Somando uma reunião agendada das 13:00 às 14:00 sem bloco no plano, a barra mostra `9h planejadas de 7h livres · 1h em pausas · 1h agendadas`, com `2h além do expediente`.

---

### P1: Ver o plano na Agenda e começar uma pausa ⭐ MVP

**User Story**: Como usuário, quero ver o plano salvo na Agenda e começar a pausa por ela, para que a pausa vire um Intervalo registrado.

**Why P1**: É onde o plano é usado no dia; a pausa só vale se virar Intervalo.

**Acceptance Criteria**:

1. The system SHALL mostrar na Agenda os blocos do plano salvo do usuário: os de tarefa com a cor da lista e borda tracejada, e as pausas em cinza hachurado, sem cobrir as sessões. (PLAN-24)
2. WHEN uma tarefa tem bloco no plano do dia e também está agendada naquele dia, com `scheduled_time` ou na faixa `Sem hora`, THEN a Agenda do dono do plano SHALL mostrar só o bloco do plano. (PLAN-25)
3. WHEN o usuário clica em `Começar` numa pausa do plano de hoje THEN o sistema SHALL abrir um Intervalo de `planned_seconds` igual à duração da pausa, na lista da pausa, pelo mesmo caminho de `POST /api/focus/break`. (PLAN-26)
4. WHEN há uma sessão de tarefa aberta e o usuário começa a pausa THEN o sistema SHALL encerrar a sessão com o mesmo motivo do Intervalo do foco (`break`) antes de abrir o Intervalo. (PLAN-27)
5. The system SHALL mostrar `Começar` só nas pausas do plano de hoje. (PLAN-28)
6. WHEN o usuário clica num bloco de tarefa do plano na Agenda THEN o sistema SHALL abrir o plano daquele dia. (PLAN-29)

**Independent Test**: Planejar um café às 10:00 hoje, abrir a Agenda, clicar em `Começar` e ver o Intervalo de 15 min aberto no foco.

---

### P2: Abrir o plano rápido de vários lugares

**User Story**: Como usuário, quero chegar ao planejamento sem procurar, para que planejar vire hábito.

**Why P2**: Melhora o uso, mas a tela já é acessível pela Agenda e por Hoje.

**Acceptance Criteria**:

1. The system SHALL mostrar `Planejar` na barra lateral, abrindo o plano de amanhã. (PLAN-30)
2. WHEN o usuário escolhe `Planejar dia` no cabeçalho de um dia da Agenda THEN o sistema SHALL abrir o plano daquele dia. (PLAN-31)

**Independent Test**: Clicar em `Planejar` na barra lateral e chegar ao plano de amanhã.

---

### P3: Encaixar o que sobrou

**User Story**: Como usuário, quero encaixar as tarefas escolhidas nos buracos livres do expediente, para montar o plano mais rápido.

**Why P3**: Atalho; o plano manual cobre o pedido.

**Acceptance Criteria**:

1. WHEN o usuário marca tarefas na lista e clica em `Encaixar` THEN o sistema SHALL colocá-las no rascunho, na ordem marcada, no primeiro horário livre do expediente em que cada uma cabe, sem sobrepor blocos, sessões ou tarefas com hora. (PLAN-32)
2. IF uma tarefa não cabe em nenhum buraco THEN o sistema SHALL deixá-la na lista e mostrar `<n> tarefas não couberam`. (PLAN-33)

**Independent Test**: Marcar três tarefas de 1h com o expediente livre das 09:00 e ver os blocos 09:00, 10:00 e 11:00.

---

## Edge Cases

- WHEN o usuário abre o plano de um dia antes de hoje THEN o sistema SHALL mostrar os blocos salvos só para leitura, sem arraste, sem `Confirmar plano` e sem `Começar`. (PLAN-34)
- IF o plano do dia mudou em outra aba ou aparelho depois de aberto THEN `Confirmar plano` SHALL responder 409 `plan_changed`, e a tela SHALL mostrar `O plano mudou em outro lugar` com `Recarregar`, sem gravar o rascunho. (PLAN-35)
- IF o usuário tenta sair da tela com o rascunho não salvo THEN o sistema SHALL perguntar `Descartar o rascunho?` com `Continuar planejando` e `Descartar`. (PLAN-36)
- IF salvar o plano falha THEN o sistema SHALL manter o rascunho na tela e mostrar `Não foi possível salvar o plano.` com `Tentar de novo`. (PLAN-37)
- IF uma tarefa planejada já tem `scheduled_on` em outro dia THEN o bloco SHALL mostrar `Agendada para <dia>`, e salvar SHALL manter o dia da tarefa. (PLAN-38)
- WHEN uma tarefa planejada é concluída THEN o bloco SHALL aparecer riscado no plano e na Agenda. (PLAN-39)
- WHEN uma tarefa planejada é excluída ou sua lista é arquivada THEN o bloco SHALL sair do plano. (PLAN-40)
- IF um viewer tenta salvar um plano ou mudar o expediente THEN a API SHALL responder 403 `Read-only role` e não gravar nada. (PLAN-41)
- IF um token `tkz_` chama as rotas do plano THEN a API SHALL responder 403 (AD-007). (PLAN-42)
- IF o corpo do plano tem um início fora de `HH:MM`, uma duração fora dos limites, uma tarefa de outro workspace ou uma pausa sem nome THEN a API SHALL responder 422 e não gravar nada. (PLAN-43)
- WHEN um bloco termina depois de 24:00 THEN o sistema SHALL cortá-lo em 24:00 na grade, mantendo a duração salva. (PLAN-44)
- WHEN o usuário começa uma pausa enquanto outro Intervalo está aberto THEN o sistema SHALL responder como `POST /api/focus/break` responde hoje, sem abrir um segundo Intervalo. (PLAN-45)

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| PLAN-01 | P1: Montar o plano de um dia | Tasks | Implementing |
| PLAN-02 | P1: Montar o plano de um dia | Tasks | Implementing |
| PLAN-03 | P1: Montar o plano de um dia | Tasks | Implementing |
| PLAN-04 | P1: Montar o plano de um dia | Tasks | Implementing |
| PLAN-05 | P1: Montar o plano de um dia | Tasks | Implementing |
| PLAN-06 | P1: Montar o plano de um dia | Tasks | Implementing |
| PLAN-07 | P1: Montar o plano de um dia | Tasks | Implementing |
| PLAN-08 | P1: Montar o plano de um dia | Tasks | Implementing |
| PLAN-09 | P1: Montar o plano de um dia | Tasks | Implementing |
| PLAN-10 | P1: Montar o plano de um dia | Tasks | Implementing |
| PLAN-11 | P1: Montar o plano de um dia | Tasks | Implementing |
| PLAN-12 | P1: Montar o plano de um dia | Tasks | Implementing |
| PLAN-13 | P1: Montar o plano de um dia | Tasks | Implementing |
| PLAN-14 | P1: Planejar pausas | Tasks | Implementing |
| PLAN-15 | P1: Planejar pausas | Tasks | Implementing |
| PLAN-16 | P1: Planejar pausas | Tasks | Implementing |
| PLAN-17 | P1: Planejar pausas | Tasks | Implementing |
| PLAN-18 | P1: Planejar pausas | Tasks | Implementing |
| PLAN-19 | P1: Ver se o dia cabe | Tasks | Implementing |
| PLAN-20 | P1: Ver se o dia cabe | Tasks | Implementing |
| PLAN-21 | P1: Ver se o dia cabe | Tasks | Implementing |
| PLAN-22 | P1: Ver se o dia cabe | Tasks | Implementing |
| PLAN-23 | P1: Ver se o dia cabe | Tasks | Implementing |
| PLAN-24 | P1: Ver o plano na Agenda e começar uma pausa | Tasks | Implementing |
| PLAN-25 | P1: Ver o plano na Agenda e começar uma pausa | Tasks | Implementing |
| PLAN-26 | P1: Ver o plano na Agenda e começar uma pausa | Tasks | Implementing |
| PLAN-27 | P1: Ver o plano na Agenda e começar uma pausa | Tasks | Implementing |
| PLAN-28 | P1: Ver o plano na Agenda e começar uma pausa | Tasks | Implementing |
| PLAN-29 | P1: Ver o plano na Agenda e começar uma pausa | Tasks | Implementing |
| PLAN-30 | P2: Abrir o plano rápido de vários lugares | Tasks | Implementing |
| PLAN-31 | P2: Abrir o plano rápido de vários lugares | Tasks | Implementing |
| PLAN-32 | P3: Encaixar o que sobrou | Tasks | Implementing |
| PLAN-33 | P3: Encaixar o que sobrou | Tasks | Implementing |
| PLAN-34 | Edge Cases | Tasks | Implementing |
| PLAN-35 | Edge Cases | Tasks | Implementing |
| PLAN-36 | Edge Cases | Tasks | Implementing |
| PLAN-37 | Edge Cases | Tasks | Implementing |
| PLAN-38 | Edge Cases | Tasks | Implementing |
| PLAN-39 | Edge Cases | Tasks | Implementing |
| PLAN-40 | Edge Cases | Tasks | Implementing |
| PLAN-41 | Edge Cases | Tasks | Implementing |
| PLAN-42 | Edge Cases | Tasks | Implementing |
| PLAN-43 | Edge Cases | Tasks | Implementing |
| PLAN-44 | Edge Cases | Tasks | Implementing |
| PLAN-45 | Edge Cases | Tasks | Implementing |

**Coverage:** 45 total, 45 mapped to tasks (T1 a T25), 0 unmapped.

---

## Implicit-Requirement Dimensions

| Dimension | Landing |
| --- | --- |
| Input validation & bounds | PLAN-05, PLAN-17, PLAN-23, PLAN-43, PLAN-44 |
| Failure / partial-failure states | PLAN-37; o plano do dia é gravado numa transação só (PLAN-08) |
| Idempotency / retry / duplicate handling | Salvar substitui o dia inteiro, então reenviar o mesmo rascunho dá o mesmo resultado; PLAN-35 cobre o reenvio sobre um plano mais novo |
| Auth boundaries & rate limits | PLAN-12, PLAN-41, PLAN-42; rate limit N/A because as rotas de escrita do workspace não têm limite próprio hoje |
| Concurrency / ordering | PLAN-35 |
| Data lifecycle / expiry | PLAN-40; o plano sai em cascata com o usuário ou o workspace; planos passados ficam guardados (PLAN-34) |
| Observability | N/A because o frontend não tem telemetria e as rotas seguem o log de requisições que já existe |
| External-dependency failure | N/A because o plano não chama serviço externo |
| State-transition integrity | PLAN-07, PLAN-11 (rascunho ↔ salvo); PLAN-28 e PLAN-45 (pausa → Intervalo) |

---

## Decisões

- **PLAN-D1 (2026-11-07):** o plano é montado como rascunho e salvo de uma vez com `Confirmar plano`.
- **PLAN-D2 (2026-11-07):** o plano é pessoal, por usuário, workspace e dia; as pausas e o expediente também são pessoais.
- **PLAN-D3 (2026-11-07):** o bloco de tarefa é só do plano: início e duração não mudam `scheduled_time` nem a estimativa. Salvar só dá o dia do plano a uma tarefa sem dia, para ela ir para Hoje.
- **PLAN-D4 (2026-11-07):** a pausa é uma entidade nova e vira uma sessão de Intervalo quando o usuário clica em `Começar`.
- **PLAN-D5 (2026-11-07):** qualquer dia de hoje em diante pode ser planejado; a tela abre em amanhã.
- **PLAN-D7 (2026-11-07):** as tarefas agendadas com hora para o dia, sem bloco no plano, ocupam o expediente na conta da capacidade, pela estimativa ou 1h; uma tarefa que tem bloco conta só pelo bloco.
- **PLAN-D6 (2026-11-07):** a primeira entrega tem a tela de um dia, pausas avulsas, a barra de capacidade, o rascunho e o plano na Agenda; pausas fixas e `Encaixar` vêm depois, e o modelo guarda o plano por dia para o planejado × realizado.

---

## Success Criteria

- [ ] O usuário monta um dia com 5 tarefas e 2 pausas e salva em menos de 2 min.
- [ ] Salvar o plano não muda o horário nem a estimativa de nenhuma tarefa (PLAN-10).
- [ ] Toda pausa começada pelo plano aparece como Intervalo na Agenda e nos relatórios.
