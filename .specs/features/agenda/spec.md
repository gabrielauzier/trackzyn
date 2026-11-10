# Agenda Specification

## Problem Statement

Cada sessão de foco fica registrada com início e fim, mas hoje só aparece como linha na aba Sessões dos relatórios. O usuário não vê como o dia foi ocupado, nem onde ficaram os buracos. Quando esquece de iniciar o foco, também não tem como registrar o tempo depois: o tempo trabalhado some dos relatórios e do tempo gasto da tarefa. O trackzyn mobile legado tinha uma tela Agenda com a timeline do dia (`mobile/lib/ui/agenda/`), e a issue #19 pede essa visão, com a criação e o ajuste de sessões, no jeito da visão da semana do Google Agenda.

## Goals

- [ ] O usuário vê as próprias sessões da semana (ou do dia, no celular) como blocos numa grade de 00h a 23h59, cada bloco no intervalo em que a sessão aconteceu.
- [ ] O usuário registra, pela grade, uma sessão que o foco não registrou, e ela passa a contar no tempo gasto da tarefa e nos relatórios.
- [ ] O usuário corrige o início e o fim de uma sessão encerrada, ou a exclui.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Ver a agenda de outros membros do workspace | Decisão do usuário no design: cada pessoa vê só a própria. |
| Sessões no futuro, agendamento ou planejamento de tarefas | A Agenda registra tempo trabalhado; a issue #6 trata de agendar tarefas. |
| Editar ou excluir a sessão em andamento | Decisão do usuário no design: para ajustar, pausa no foco antes. |
| Visão de mês | Nem a issue nem o design pedem. |
| Sessões recorrentes, convites, lembretes | São do modelo do Google Agenda, fora do objetivo de registrar tempo. |
| Criar e editar sessões pela fila offline do foco | As ações da Agenda são escritas comuns da API, como as do quadro; sem conexão, falham com o erro da API. |
| Acesso por token de acesso (`tkz_`) | AD-007: rota nova nasce fechada a tokens; a issue não pede escopo novo. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Sobreposição de sessões | Permitida; o painel mostra um aviso com a sessão sobreposta, e o tempo em comum conta nas duas | Decisão do usuário no design (#19) | y |
| Editar sessões registradas pelo foco | Permitido, como as manuais, desde que encerradas | Decisão do usuário no design (#19) | y |
| Sessão em andamento | Aparece crescendo até agora, sem alças; não pode ser editada nem excluída | Decisão do usuário no design (#19) | y |
| Lugar na navegação | Item próprio `Agenda` na barra lateral, entre as listas e `Relatórios`, na rota `/agenda` | Decisão do usuário no design (#19) | y |
| De quem são as sessões | Só as do usuário logado, no workspace atual | Decisão do usuário no design (#19); mesma regra dos relatórios | y |
| Chip `Hoje` | Abre um calendário do mês; no desktop, escolher um dia abre a semana dele; no celular, abre o dia | Decisão do usuário no design (#19) | y |
| Semana | De segunda a domingo, no fuso do workspace (AD-004) | Mesma regra de `relatorios` e do design | y |
| Onde a visão é de um dia | Abaixo de 768 px de largura, em qualquer plataforma | Corte de tablet que o projeto já usa; o design desenha o celular com um dia | y |
| Posição inicial da grade | Rola até 07:00 ao abrir | Design (`Agenda · semana`) | y |
| Passo do arraste | Criar, mover e puxar as bordas encaixam em 15 min | Passo usado no protótipo do design | y |
| Duração mínima e máxima | Mínimo 1 min; máximo 24 h | 1 min é a menor duração que a grade mostra; 24 h impede um registro que cobre mais de um dia inteiro por engano | y |
| Origem da sessão | Coluna nova `origin` (`focus` ou `manual`); as sessões que já existem ficam `focus`; o painel mostra `registrada pelo foco` ou `registrada na agenda` | O design mostra a origem no painel de detalhes, e o banco não guarda isso hoje | y |
| Editar uma sessão do foco | Mantém `origin = focus` | A origem diz como a sessão nasceu, não se foi ajustada | y |
| Intervalo manual | O painel pede a lista do intervalo, com a lista do filtro (ou a primeira lista ativa) já escolhida | `focus_sessions.list_id` é obrigatório, e o design não mostra de qual lista é o intervalo | y |
| Tarefas que podem receber sessão manual | Tarefas de listas ativas do workspace, em qualquer coluna, inclusive Concluídas | Registrar o tempo de uma tarefa já concluída é o caso mais comum de esquecimento | y |
| Corte da fila offline | Criar ou editar uma sessão que termina mais tarde que a última mudança do usuário move o corte de `lastChange` (AD-002); ações offline anteriores a ela passam a ser recusadas | É a mesma regra do foco: uma ação feita antes de uma mudança já registrada não é aplicada por cima dela | y |
| Excluir | Pede confirmação no diálogo de confirmação que já existe, com o título e o horário | Padrão do app para ação destrutiva | y |
| Viewer | Vê a própria agenda; não cria, edita nem exclui (API responde 403 `Read-only role`) | Mesma regra das outras escritas do workspace | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Ver as sessões da semana ⭐ MVP

**User Story**: Como usuário, quero ver minhas sessões da semana numa grade por hora, para enxergar como meu tempo foi ocupado.

**Why P1**: É a visão que a issue pede; as outras histórias partem dela.

**Acceptance Criteria**:

1. WHEN o usuário abre `/agenda` com largura de 768 px ou mais THEN o sistema SHALL mostrar a semana atual de segunda a domingo, uma coluna por dia com o dia da semana, o número do dia e o total de tempo das sessões de tarefa do dia (`6h 15min`), e uma grade de 00:00 a 24:00 com uma linha por hora. (AGENDA-01)
2. WHEN a grade abre THEN o sistema SHALL rolar até 07:00. (AGENDA-02)
3. The system SHALL desenhar cada sessão como um bloco na coluna do seu dia, com o topo no horário de início e a altura proporcional à duração, mostrando o título da tarefa (ou `Intervalo`) e `HH:MM – HH:MM` com dois dígitos. (AGENDA-03)
4. The system SHALL colorir o bloco de uma sessão de tarefa com a cor da lista dela e desenhar o intervalo em cinza com borda pontilhada, como a das tarefas agendadas e das pausas planejadas. (AGENDA-04)
5. WHILE uma sessão está aberta, o sistema SHALL desenhar o bloco até a hora atual, com borda índigo e `agora` no lugar do fim, e uma linha horizontal na hora atual na coluna de hoje. (AGENDA-05)
6. WHEN duas ou mais sessões se sobrepõem no mesmo dia THEN o sistema SHALL dividir a largura da coluna entre elas, lado a lado, sem que um bloco cubra o outro. (AGENDA-06)
7. WHEN uma sessão atravessa a meia-noite no fuso do workspace THEN o sistema SHALL desenhar um bloco em cada dia, com o pedaço daquele dia. (AGENDA-07)
8. WHEN o usuário clica em `Semana anterior` ou `Próxima semana` THEN o sistema SHALL mostrar a semana anterior ou a seguinte, e o cabeçalho SHALL mostrar o intervalo (`2 – 8 de novembro de 2026`, ou `26 de outubro – 1 de novembro de 2026` quando atravessa meses). (AGENDA-08)
9. WHEN o usuário escolhe uma lista no filtro THEN o sistema SHALL mostrar só as sessões daquela lista, e os totais do dia SHALL somar só elas. (AGENDA-09)
10. The system SHALL mostrar só as sessões do usuário logado no workspace atual. (AGENDA-10)
11. WHEN a semana não tem nenhuma sessão THEN o sistema SHALL mostrar a grade vazia, sem total nos dias. (AGENDA-11)
12. IF a leitura das sessões falha THEN o sistema SHALL mostrar `Não foi possível carregar a agenda.` com o botão `Tentar de novo`, no lugar da grade. (AGENDA-12)
13. WHEN a barra lateral é exibida THEN o sistema SHALL mostrar o item `Agenda`, que leva a `/agenda`, entre as listas e `Relatórios`. (AGENDA-13)

**Independent Test**: com sessões gravadas na segunda e na terça, abrir `/agenda` e ver os blocos nos horários certos, o intervalo pontilhado, as sobrepostas lado a lado e a sessão em andamento crescendo.

---

### P1: Registrar uma sessão pela grade ⭐ MVP

**User Story**: Como usuário, quero arrastar sobre a grade para registrar uma sessão que o foco não registrou, para que o tempo conte na tarefa e nos relatórios.

**Why P1**: É a outra metade da issue: sem registrar, a Agenda só mostra.

**Acceptance Criteria**:

1. WHEN o usuário arrasta sobre um horário vazio da grade THEN o sistema SHALL desenhar um bloco de rascunho do ponto de início ao ponto de fim, encaixado em 15 min, e abrir o painel `Nova sessão` com a data e os dois horários preenchidos. (AGENDA-14)
2. WHEN o usuário clica em `Nova sessão` na barra THEN o sistema SHALL abrir o mesmo painel com hoje, o início na hora cheia anterior a agora e o fim agora, arredondado para baixo em 5 min. (AGENDA-15)
3. The system SHALL oferecer no painel a escolha entre `Tarefa` e `Intervalo`; em `Tarefa`, a lista de tarefas das listas ativas agrupadas por lista; em `Intervalo`, a escolha da lista do intervalo. (AGENDA-16)
4. WHEN o usuário muda o início ou o fim no painel THEN o sistema SHALL mover a borda correspondente do rascunho e atualizar a duração (`1h 15min`). (AGENDA-17)
5. WHEN o usuário puxa a borda de cima ou a de baixo do rascunho THEN o sistema SHALL mudar o início ou o fim em passos de 15 min e atualizar os campos do painel. (AGENDA-18)
6. WHEN o horário do rascunho se sobrepõe a outra sessão do usuário THEN o painel SHALL mostrar `Sobrepõe <título> (<HH:MM> – <HH:MM>). O tempo em comum conta nas duas.` e o botão `Salvar` SHALL continuar habilitado. (AGENDA-19)
7. WHEN o usuário clica em `Salvar` com horários válidos THEN o sistema SHALL gravar a sessão com `origin = manual` e mostrar o bloco na grade com a cor da lista, sem as alças de rascunho. (AGENDA-20)
8. WHEN uma sessão de tarefa é gravada THEN o tempo gasto da tarefa no quadro e no foco SHALL somar a duração da sessão. (AGENDA-21)
9. WHEN uma sessão é gravada THEN os relatórios do período SHALL contá-la como contam as sessões do foco. (AGENDA-22)
10. IF o fim é posterior a agora THEN o sistema SHALL recusar com 422 e o painel SHALL mostrar `A sessão não pode terminar no futuro.`; a grade SHALL desenhar o tempo depois de agora hachurado, sem aceitar o arraste. (AGENDA-23)
11. IF o fim não é posterior ao início, ou a duração é menor que 1 min ou maior que 24 h THEN o sistema SHALL recusar com 422 e mostrar `Use de 1 minuto a 24 horas.`. (AGENDA-24)
12. IF a tarefa não existe no workspace ou é de uma lista arquivada THEN o sistema SHALL recusar com 404 `Task not found`. (AGENDA-25)
13. WHEN o usuário clica em `Cancelar` ou aperta Esc THEN o sistema SHALL fechar o painel e apagar o rascunho sem gravar nada. (AGENDA-26)

**Independent Test**: arrastar das 17:30 às 18:45 de ontem, escolher uma tarefa, salvar, e ver o bloco na grade, a tarefa com 1h 15min a mais no quadro e o relatório de ontem somando a sessão.

---

### P2: Ajustar e excluir uma sessão

**User Story**: Como usuário, quero ajustar o início e o fim de uma sessão encerrada, ou excluí-la, para corrigir o que ficou registrado errado.

**Why P2**: Corrige o registro, mas a Agenda já entrega valor sem isso.

**Acceptance Criteria**:

1. WHEN o usuário clica num bloco THEN o sistema SHALL abrir o painel de detalhes com a tarefa (ou `Intervalo`), a lista, `<dia da semana>, <dia> de <mês> · HH:MM – HH:MM · <duração>`, a origem (`registrada pelo foco` ou `registrada na agenda`) e os botões `Editar`, `Excluir` e `Fechar`. (AGENDA-27)
2. WHILE um bloco encerrado está selecionado, o sistema SHALL mostrar uma alça na borda de cima e outra na de baixo. (AGENDA-28)
3. WHEN o usuário puxa uma alça de um bloco encerrado e solta THEN o sistema SHALL gravar o novo início ou fim, encaixado em 15 min, e manter a duração dentro de 1 min a 24 h e o fim até agora. (AGENDA-29)
4. WHEN o usuário arrasta o bloco inteiro de uma sessão encerrada para outro horário ou dia e solta THEN o sistema SHALL gravar o novo início e o novo fim com a mesma duração, encaixados em 15 min. (AGENDA-30)
5. WHEN o usuário clica em `Editar` THEN o sistema SHALL abrir o painel com a tarefa, a data e os horários editáveis, e `Salvar` SHALL gravar as mudanças com as mesmas validações da criação (AGENDA-23, AGENDA-24, AGENDA-25). (AGENDA-31)
6. WHEN o usuário confirma `Excluir` no diálogo de confirmação THEN o sistema SHALL apagar a sessão, tirar o bloco da grade e tirar a duração do tempo gasto da tarefa. (AGENDA-32)
7. IF a sessão está em andamento THEN o bloco SHALL não ter alças nem ser arrastável, o painel SHALL mostrar `A sessão em andamento não tem alças: o fim é agora. Para ajustar, pause no foco.` com o link `Abrir o foco`, e a API SHALL recusar editar ou excluir com 409 `session_running`. (AGENDA-33)
8. IF a sessão não existe ou é de outro usuário THEN a API SHALL responder 404 `Session not found`. (AGENDA-34)
9. IF uma gravação de ajuste falha THEN o bloco SHALL voltar ao horário anterior e o sistema SHALL mostrar um toast com a mensagem da API. (AGENDA-35)

**Independent Test**: selecionar uma sessão do foco das 14:00 às 15:00, puxar o fim até 15:30, recarregar e ver 14:00 – 15:30; excluir e ver o bloco sumir e o tempo da tarefa cair 1h 30min.

---

### P2: Agenda do dia e escolha da data

**User Story**: Como usuário no celular, quero ver um dia por vez e escolher a data por um calendário, para usar a Agenda numa tela estreita.

**Why P2**: A semana já atende o desktop; o celular precisa da visão de um dia.

**Acceptance Criteria**:

1. WHEN a largura é menor que 768 px THEN o sistema SHALL mostrar um dia por vez, com as pílulas dos 7 dias da semana (segunda a domingo), um ponto nas pílulas dos dias com sessões e a timeline do dia escolhido. (AGENDA-36)
2. WHEN o usuário toca numa pílula THEN o sistema SHALL mostrar aquele dia, com `<dia da semana>, <dia> de <mês> de <ano> · <total>`. (AGENDA-37)
3. WHEN o usuário toca nas setas da semana THEN o sistema SHALL mudar para a semana anterior ou a seguinte, mostrando a segunda-feira dela. (AGENDA-38)
4. WHEN o usuário clica no chip `Hoje` THEN o sistema SHALL abrir o calendário do mês, com hoje preenchido em índigo, setas de mês e `Ir para hoje`. (AGENDA-39)
5. WHEN o usuário escolhe um dia no calendário na visão da semana THEN o sistema SHALL abrir a semana que contém aquele dia e fechar o calendário. (AGENDA-40)
6. WHEN o usuário escolhe um dia no calendário na visão do dia THEN o sistema SHALL abrir exatamente aquele dia, na semana dele, e fechar o calendário. (AGENDA-41)
7. WHEN o dia escolhido não tem sessões THEN a timeline SHALL mostrar `Nenhuma sessão neste dia. Toque em + para registrar uma.`, ou `Este dia ainda não chegou. As sessões aparecem aqui quando você focar.` quando o dia é depois de hoje. (AGENDA-42)
8. WHEN o usuário toca no botão `+` THEN o sistema SHALL abrir o painel `Nova sessão` do dia escolhido, como AGENDA-15. (AGENDA-43)

**Independent Test**: numa janela de 390 px, ver um dia, trocar de dia pelas pílulas, ir à semana seguinte pelas setas e voltar a hoje pelo calendário.

---

## Edge Cases

- IF o usuário não tem permissão de escrita no workspace (`viewer`) THEN o sistema SHALL esconder `Nova sessão`, o `+`, as alças, `Editar` e `Excluir`, e a API SHALL responder 403 `Read-only role` a qualquer escrita de sessão. (AGENDA-44)
- IF a semana pedida à API tem mais de 42 dias THEN a API SHALL responder 422. (AGENDA-45)
- WHEN uma sessão é criada, editada ou excluída THEN o estado do foco (`GET /api/focus`) e o quadro SHALL refletir o novo tempo gasto na próxima leitura. (AGENDA-46)
- IF o painel está aberto e o usuário troca de semana THEN o sistema SHALL fechar o painel sem gravar. (AGENDA-47)

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| AGENDA-01 | P1: Ver as sessões da semana | Tasks | Verified |
| AGENDA-02 | P1: Ver as sessões da semana | Tasks | Verified |
| AGENDA-03 | P1: Ver as sessões da semana | Tasks | Verified |
| AGENDA-04 | P1: Ver as sessões da semana | Tasks | Verified |
| AGENDA-05 | P1: Ver as sessões da semana | Tasks | Verified |
| AGENDA-06 | P1: Ver as sessões da semana | Tasks | Verified |
| AGENDA-07 | P1: Ver as sessões da semana | Tasks | Verified |
| AGENDA-08 | P1: Ver as sessões da semana | Tasks | Verified |
| AGENDA-09 | P1: Ver as sessões da semana | Tasks | Verified |
| AGENDA-10 | P1: Ver as sessões da semana | Tasks | Verified |
| AGENDA-11 | P1: Ver as sessões da semana | Tasks | Verified |
| AGENDA-12 | P1: Ver as sessões da semana | Tasks | Verified |
| AGENDA-13 | P1: Ver as sessões da semana | Tasks | Verified |
| AGENDA-14 | P1: Registrar uma sessão pela grade | Tasks | Verified |
| AGENDA-15 | P1: Registrar uma sessão pela grade | Tasks | Verified |
| AGENDA-16 | P1: Registrar uma sessão pela grade | Tasks | Verified |
| AGENDA-17 | P1: Registrar uma sessão pela grade | Tasks | Verified |
| AGENDA-18 | P1: Registrar uma sessão pela grade | Tasks | Verified |
| AGENDA-19 | P1: Registrar uma sessão pela grade | Tasks | Verified |
| AGENDA-20 | P1: Registrar uma sessão pela grade | Tasks | Verified |
| AGENDA-21 | P1: Registrar uma sessão pela grade | Tasks | Verified |
| AGENDA-22 | P1: Registrar uma sessão pela grade | Tasks | Verified |
| AGENDA-23 | P1: Registrar uma sessão pela grade | Tasks | Verified |
| AGENDA-24 | P1: Registrar uma sessão pela grade | Tasks | Verified |
| AGENDA-25 | P1: Registrar uma sessão pela grade | Tasks | Verified |
| AGENDA-26 | P1: Registrar uma sessão pela grade | Tasks | Verified |
| AGENDA-27 | P2: Ajustar e excluir uma sessão | Tasks | Verified |
| AGENDA-28 | P2: Ajustar e excluir uma sessão | Tasks | Verified |
| AGENDA-29 | P2: Ajustar e excluir uma sessão | Tasks | Verified |
| AGENDA-30 | P2: Ajustar e excluir uma sessão | Tasks | Verified |
| AGENDA-31 | P2: Ajustar e excluir uma sessão | Tasks | Verified |
| AGENDA-32 | P2: Ajustar e excluir uma sessão | Tasks | Verified |
| AGENDA-33 | P2: Ajustar e excluir uma sessão | Tasks | Verified |
| AGENDA-34 | P2: Ajustar e excluir uma sessão | Tasks | Verified |
| AGENDA-35 | P2: Ajustar e excluir uma sessão | Tasks | Verified |
| AGENDA-36 | P2: Agenda do dia e escolha da data | Tasks | Verified |
| AGENDA-37 | P2: Agenda do dia e escolha da data | Tasks | Verified |
| AGENDA-38 | P2: Agenda do dia e escolha da data | Tasks | Verified |
| AGENDA-39 | P2: Agenda do dia e escolha da data | Tasks | Verified |
| AGENDA-40 | P2: Agenda do dia e escolha da data | Tasks | Verified |
| AGENDA-41 | P2: Agenda do dia e escolha da data | Tasks | Verified |
| AGENDA-42 | P2: Agenda do dia e escolha da data | Tasks | Verified |
| AGENDA-43 | P2: Agenda do dia e escolha da data | Tasks | Verified |
| AGENDA-44 | Edge cases | Tasks | Verified |
| AGENDA-45 | Edge cases | Tasks | Verified |
| AGENDA-46 | Edge cases | Tasks | Verified |
| AGENDA-47 | Edge cases | Tasks | Verified |

**Coverage:** 47 total, 47 mapped to tasks, 0 unmapped

---

## Implicit-Requirement Dimensions

| Dimension | Landing |
| --------- | ------- |
| Input validation & bounds | AGENDA-23, AGENDA-24, AGENDA-25, AGENDA-45 |
| Failure / partial-failure states | AGENDA-12, AGENDA-35 |
| Idempotency / retry / duplicate handling | N/A because criar sessão não passa pela fila offline (Out of Scope); um reenvio manual cria outra sessão, que aparece sobreposta (AGENDA-19) e pode ser excluída (AGENDA-32) |
| Auth boundaries & rate limits | AGENDA-10, AGENDA-34, AGENDA-44; tokens fechados por AD-007 (Out of Scope); rate limit N/A because as rotas de escrita do workspace não têm limite próprio hoje |
| Concurrency / ordering | AGENDA-33 (sessão em andamento) e o corte de `lastChange` (Assumptions) |
| Data lifecycle / expiry | AGENDA-32; sessões são apagadas em cascata com a tarefa ou a lista (AD-005), sem mudança |
| Observability | N/A because o frontend não tem telemetria e as rotas seguem o log de requisições que já existe |
| External-dependency failure | N/A because a Agenda não chama serviço externo |
| State-transition integrity | AGENDA-05, AGENDA-33; a liquidação (AD-001) roda antes de toda leitura e escrita de sessões |

---

## Success Criteria

- [ ] O usuário registra pela grade uma sessão de 1h 15min de ontem em menos de 30 s, e o relatório de ontem passa a somar 1h 15min a mais.
- [ ] Nenhuma sessão em andamento pode ser alterada pela Agenda (API responde 409).
