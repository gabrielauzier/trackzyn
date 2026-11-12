# Dashboard Hoje Specification

Início: 2026-11-11 · Depende de: `planejamento-diario` (PR #39, em `main`) · Branch: `claude/daily-context-dashboard-b22951`

**Design aprovado (2026-11-11):** https://claude.ai/artifact/6YQyr3AkTmxuZBV9RFM3Nn — pranchetas `Hoje · durante o dia`, `Card Agora · estados` e `Fechar o dia`.

## Problem Statement

O dia do usuário está espalhado em quatro telas: Planejar diz o que ele quis fazer, a Agenda e os Relatórios dizem o que ele fez, e o Foco mostra uma lista de cada vez. Nenhuma responde de uma vez onde ele está agora, o que já fez, o que falta e se o que falta cabe no resto da jornada. A Home de hoje é só a grade de listas.

O que o código já fixa:

- "Hoje" é o dia no fuso do workspace, ou no da aplicação quando ele não tem (AD-004).
- A jornada do usuário fica em `preferences.workday`, de 09:00 a 18:00 quando não há uma salva (`workdayOf`, PLAN-22).
- Salvar um plano agenda para o dia as tarefas planejadas sem dia (PLAN-09), e o agendamento leva para `Hoje` as tarefas cujo dia chegou (D21). Por isso as tarefas pendentes do dia estão na coluna `Hoje`.
- O selo antes / no prazo / depois é `verdictOf` dos Relatórios: no prazo até 5% da estimativa, para mais ou para menos, com o tempo total da tarefa somando as sessões de todos os membros.
- Uma conclusão pertence a quem moveu a tarefa para `Concluídas` (`tasks.completed_by_user_id`, AD-006).
- O foco é por lista (`/focus/:listId`), só começa numa tarefa da coluna `Hoje`, e cada usuário tem no máximo uma sessão aberta (SYNC-01).

## Goals

- [ ] Ao abrir o app, o usuário vê numa tela só a sessão aberta (ou a tarefa que o plano reserva para agora), as tarefas concluídas hoje e as pendentes, sem abrir outra página.
- [ ] O usuário sabe se as pendências cabem no que resta da jornada, com a mesma conta que faria à mão a partir das estimativas.
- [ ] Os números do dia batem com os dos Relatórios para o período de hoje.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Meta diária de foco (`meta 6h` do mockup) | Não há onde guardar uma meta; o card de tempo focado mostra só o total e os intervalos. Fica para uma feature de preferências. |
| Somar vários workspaces num só dia | Tudo é recortado por `X-Workspace-Id`; juntar workspaces é uma decisão de arquitetura à parte. |
| Responsável por tarefa | As tarefas não têm responsável; criar um muda o quadro inteiro. |
| Nota do dia guardada no servidor | Não há modelo para ela; o resumo em Markdown sai só pela área de transferência. |
| Gravar no journal (second-brain) | O app não escreve arquivos do usuário; ele cola o resumo copiado. |
| Navegar para dias passados no dashboard | A Agenda e os Relatórios já cobrem o passado. |
| Editar o plano no dashboard | Planejar é o lugar de editar; o dashboard só leva até lá. |
| Projetar recorrências que ainda não viraram tarefa | `Amanhã` mostra só tarefas que existem; a projeção é da Agenda. |

---

## Assumptions & Open Questions

O usuário deixou as decisões em aberto com o agente (2026-11-11). Os padrões abaixo valem até ele corrigir.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Onde o dashboard vive | Em `/`, no lugar da Home; a grade de listas passa para `/lists`, e o `?new=1` de `Criar nova lista` vai junto | É a tela que o usuário quer ver ao abrir o app; a grade de listas continua a um clique pela barra lateral | n (padrão do agente) |
| Escopo dos dados | Só o workspace atual; sessões, conclusões e plano só do usuário logado | Segue AD-004, PLAN-12 e REPORT-09; um dia de vários workspaces está fora | n (padrão do agente) |
| O que é `Pendente` | As tarefas da coluna `Hoje` das listas não arquivadas do workspace, menos a tarefa em foco | Planejar e agendar já trazem para `Hoje` o que é do dia; num workspace compartilhado aparecem as tarefas de `Hoje` dos outros membros, porque não existe responsável | n (padrão do agente) |
| Fim do dia | O fim da jornada do usuário (`workday.end`) | A capacidade do Planejar já usa a jornada; o mockup usou 19:00 só como exemplo | n (padrão do agente) |
| Tarefa sem estimativa na capacidade | Conta 0 e o texto da capacidade diz quantas estão sem estimativa | Inventar 1h (como a grade do plano) esconderia o buraco; o Planejar desenha, o dashboard soma | n (padrão do agente) |
| Para onde leva `Abrir foco` | Em foco: `/focus/<lista da sessão>`. Sem foco: a lista da tarefa sugerida pelo card; sem tarefa sugerida: a lista da primeira tarefa de `Pendente`; sem nenhuma: o link não aparece | O foco é por lista; leva para onde a próxima ação acontece | n (padrão do agente) |
| `Começar foco` numa tarefa fora de `Hoje` | A tarefa vai para o topo de `Hoje` e o foco começa nela | O foco só começa em `Hoje`; recusar seria pior do que mover | n (padrão do agente) |
| Fatia da entrega | P1: página, card Agora, Pendente com capacidade e Feito hoje. P2: Plano × real, números do dia e Amanhã. P3: Fechar o dia | P1 já responde "onde estou, o que fiz, o que falta e se cabe" | n (padrão do agente) |
| Atualização | Relê os dados ao ganhar o foco da janela e a cada 60 s; o marcador `agora` e as contas de tempo andam a cada minuto | Um minuto é a menor unidade mostrada; o foco já sincroniza a cada 15 s (AD-003) e o card Agora segue o foco | n (padrão do agente) |
| Ordem de `Feito hoje` | A mais recente primeiro | O usuário quer ver o que acabou de fazer | n (padrão do agente) |
| Aderência ao plano | Minutos dos blocos de tarefa do plano de hoje, até agora, cobertos por sessão da mesma tarefa, divididos pelos minutos desses blocos até agora, arredondado para inteiro | Mede se o plano virou trabalho na hora planejada; sem blocos até agora não há número | n (padrão do agente) |
| Trocas de tarefa | Sessões de tarefa de hoje cuja tarefa é diferente da sessão de tarefa anterior do mesmo dia | Conta mudanças de contexto, não pausas | n (padrão do agente) |
| Destino padrão em `Fechar o dia` | `Amanhã` para todas as pendências | É o caso mais comum; o usuário troca uma por uma | n (padrão do agente) |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Ver o dia ao abrir o app ⭐ MVP

**User Story**: Como usuário, quero que o app abra numa tela com o meu dia, para saber onde estou sem procurar.

**Why P1**: É a moldura de todas as outras histórias.

**Acceptance Criteria**:

1. WHEN o usuário abre `/` THEN o sistema SHALL mostrar o dashboard Hoje do workspace atual, e a barra lateral SHALL ter `Hoje` como primeiro item, marcado. (HOJE-01)
2. WHEN o usuário abre `/lists` THEN o sistema SHALL mostrar a grade de listas que hoje fica em `/`, com o arrastar, renomear e criar de antes; `Criar nova lista` da barra lateral SHALL abrir `/lists?new=1`. (HOJE-02)
3. The system SHALL mostrar no cabeçalho a saudação atual (`home.greeting.<período>`), o dia por extenso no fuso do workspace (`Terça, 11 de novembro`), a hora atual e o tempo que falta até o fim da jornada (`4h 40min até o fim do dia (19:00)`), com as durações em `formatDuration`. (HOJE-03)
4. WHILE a hora atual passou do fim da jornada, o cabeçalho SHALL dizer `Jornada encerrada às <HH:MM>` em vez do tempo que falta. (HOJE-04)
5. The system SHALL mostrar no cabeçalho o botão `Planejar amanhã`, que abre `/planejar/<amanhã>` como o da Home faz hoje (PLAN-01); o botão `Fechar o dia` entra ao lado dele com a história P3 (HOJE-41). (HOJE-05)
6. The system SHALL usar só os dados do usuário logado no workspace atual: as sessões dele, as conclusões dele e o plano dele; as tarefas de `Pendente` e `Amanhã` são as do workspace. (HOJE-06)

**Independent Test**: Abrir `/` e ver o dashboard com `Hoje` marcado na barra lateral; abrir `/lists` e ver a grade de listas.

---

### P1: Saber o que está acontecendo agora ⭐ MVP

**User Story**: Como usuário, quero ver no topo o que estou fazendo ou o que deveria estar fazendo, para retomar o foco com um clique.

**Why P1**: É a pergunta mais urgente do dia: o que faço agora.

**Acceptance Criteria**:

1. WHILE o usuário tem uma sessão de tarefa aberta no workspace atual, o card `Agora` SHALL mostrar `Agora · em foco`, o título e a lista da tarefa, a barra do tempo da tarefa contra a estimativa (`32min de 1h 30min`), quanto falta e a hora em que termina, e os botões `Concluir`, `Pausar` e `Intervalo`. (HOJE-07)
2. WHILE uma sessão de tarefa está aberta e a tarefa não tem estimativa, o card SHALL mostrar só o tempo decorrido da sessão, sem barra e sem hora de término. (HOJE-08)
3. WHEN o usuário clica em `Concluir`, `Pausar` ou `Intervalo` no card THEN o sistema SHALL fazer a mesma ação do Foco (`/api/focus/complete`, `/api/focus/pause`, ou o diálogo de intervalo do Foco seguido de `/api/focus/break`), e o card SHALL mostrar o novo estado sem recarregar a página. (HOJE-09)
4. WHILE o usuário está num intervalo, o card SHALL mostrar `Agora · intervalo`, o nome do intervalo, quanto falta e o botão `Encerrar intervalo`. (HOJE-10)
5. WHILE não há sessão aberta e há um bloco de tarefa não concluída no plano de hoje que contém a hora atual, o card SHALL mostrar `Agora · nada em foco`, o texto `Pelo plano, agora seria`, a tarefa do bloco com a borda tracejada de 2px na cor fraca da lista, o horário do bloco, há quanto tempo ele começou e os botões `Começar foco`, `Outra tarefa` e `Intervalo`. (HOJE-11)
6. WHILE não há sessão aberta e nenhum bloco de tarefa do plano contém a hora atual, o card SHALL mostrar `Nada planejado para agora`, quantas tarefas há em `Pendente` e a soma das estimativas delas, e os botões `Escolher tarefa` e `Planejar hoje`. (HOJE-12)
7. WHILE não há sessão aberta, o rodapé do card SHALL mostrar há quanto tempo o usuário está sem sessão hoje e o nome e o fim da última sessão do dia (`Sem foco há 1h · última sessão: Almoço, até 13:20`); sem sessão no dia, SHALL mostrar `Nenhuma sessão hoje`. (HOJE-13)
8. WHEN o usuário clica em `Começar foco` THEN o sistema SHALL começar uma sessão na tarefa sugerida, levando-a antes para o topo de `Hoje` se estiver em outra coluna, e o card SHALL passar a `em foco`. (HOJE-14)
9. WHEN o usuário clica em `Outra tarefa` ou `Escolher tarefa` THEN o sistema SHALL abrir um seletor com as tarefas de `Pendente`, e WHEN ele escolhe uma THEN o sistema SHALL começar o foco nela como em HOJE-14. (HOJE-15)
10. WHEN o usuário clica em `Planejar hoje` THEN o sistema SHALL abrir `/planejar/<hoje>`. (HOJE-16)
11. The system SHALL mostrar no canto do card o link `Abrir foco` com o ícone de seta para fora, que leva a `/focus/<lista>`: a lista da sessão aberta; sem sessão, a lista da tarefa sugerida; sem tarefa sugerida, a lista da primeira tarefa de `Pendente`. (HOJE-17)
12. IF não há sessão aberta, nem tarefa sugerida, nem tarefa em `Pendente` THEN o card SHALL não mostrar `Abrir foco`. (HOJE-18)
13. WHILE há uma sessão aberta, o título da tarefa no card SHALL ser um link para o mesmo destino de `Abrir foco`. (HOJE-19)
14. WHILE a sessão aberta do usuário é de outro workspace, o card SHALL mostrar `Em foco em outro workspace: <nome>` e nenhum botão de ação. (HOJE-20)
15. WHILE o usuário é `viewer` do workspace, o card SHALL não mostrar `Concluir`, `Pausar`, `Intervalo`, `Começar foco`, `Outra tarefa` nem `Escolher tarefa`. (HOJE-21)
16. IF uma ação do card é recusada pelo servidor THEN o sistema SHALL mostrar a mensagem de erro da API num toast e o card SHALL voltar ao estado que o servidor devolver na leitura seguinte. (HOJE-22)
17. WHILE a estimativa da tarefa em foco acabou e o foco espera `Estender` (`awaiting_extend`), o card SHALL mostrar `Estimativa esgotada`, o tempo gasto e os botões `Estender` e `Concluir` do Foco. (HOJE-74)

**Independent Test**: Com um bloco do plano cobrindo a hora atual e nada em foco, ver a tarefa sugerida tracejada; clicar em `Começar foco` e ver o card passar a `em foco` com a barra de tempo.

---

### P1: Ver o que falta e se cabe ⭐ MVP

**User Story**: Como usuário, quero ver as tarefas pendentes de hoje em ordem de urgência e se elas cabem no que resta da jornada, para decidir o que cortar.

**Why P1**: É a outra metade do contexto do dia e a conta que mais ajuda a decidir.

**Acceptance Criteria**:

1. The system SHALL mostrar em `Pendente` as tarefas não concluídas da coluna `Hoje` das listas não arquivadas do workspace, menos a tarefa da sessão aberta, com o total de tarefas e a soma das estimativas no título (`5 tarefas · 4h 58min estimadas`). (HOJE-23)
2. The system SHALL desenhar cada tarefa de `Pendente` como as tarefas da lista lateral do Planejar: card com borda de 1px e cantos de 8px, ponto da cor da lista, título, linha `<lista> · <detalhes>` e a estimativa numa pílula (`Sem estimativa` quando não há). (HOJE-24)
3. The system SHALL pôr cada tarefa de `Pendente` no primeiro grupo que valer para ela, nesta ordem, e esconder os grupos vazios: `Atrasada` (o início de hoje, isto é, `scheduled_time` com `scheduled_on` igual a hoje ou, sem ele, o início do primeiro bloco dela no plano de hoje, é anterior à hora atual e ela não tem sessão hoje), `Com horário` (tem `scheduled_time` hoje), `No plano` (tem bloco no plano de hoje), `Veio de dias anteriores` (`scheduled_on` anterior a hoje) e `Sem plano`. (HOJE-25)
4. The system SHALL mostrar ao lado do nome de cada grupo quantas tarefas ele tem, e ordenar as tarefas dentro do grupo pelo início de hoje e, sem início, pela posição na coluna. (HOJE-26)
5. The system SHALL mostrar em `Atrasada` a hora de início em âmbar e há quanto tempo ela passou (`13:00 · passou há 1h 20min`), e a borda do card em âmbar. (HOJE-27)
6. The system SHALL mostrar em `Veio de dias anteriores` a etiqueta `há N dias`, com N igual a hoje menos `scheduled_on` em dias do calendário do workspace. (HOJE-28)
7. The system SHALL mostrar acima dos grupos a capacidade: a soma das estimativas de `Pendente` mais o que falta da estimativa da tarefa em foco, contra o tempo de agora até o fim da jornada (zero depois dele). (HOJE-29)
8. WHILE a soma passa do tempo que resta, a capacidade SHALL ficar em âmbar, dizer `Não cabe no dia: sobram <diferença> de tarefa` e desenhar a parte que passa listrada no fim da barra. (HOJE-30)
9. WHILE a soma cabe no tempo que resta, a capacidade SHALL dizer `Cabe no dia: <diferença> livre` sem cor de alerta. (HOJE-31)
10. WHERE alguma tarefa de `Pendente` não tem estimativa, a capacidade SHALL dizer `N sem estimativa, contadas como 0`. (HOJE-32)
11. WHEN o usuário clica numa tarefa de `Pendente` THEN o sistema SHALL abrir o painel da tarefa usado na Agenda. (HOJE-33)
12. IF `Pendente` está vazio THEN o sistema SHALL mostrar `Nada pendente para hoje` no lugar dos grupos e da capacidade. (HOJE-34)

**Independent Test**: Com uma tarefa agendada para 13:00 sem sessão, às 14:20, vê-la em `Atrasada` com `passou há 1h 20min`; com estimativas que somam mais do que resta da jornada, ver `Não cabe no dia`.

---

### P1: Ver o que já foi feito ⭐ MVP

**User Story**: Como usuário, quero ver as tarefas que concluí hoje com o tempo de cada uma, para saber quanto o dia rendeu.

**Why P1**: Fecha a pergunta "o que fiz" sem abrir os Relatórios.

**Acceptance Criteria**:

1. The system SHALL mostrar em `Feito hoje` as tarefas do workspace concluídas pelo usuário logado com `completed_at` em hoje, da mais recente para a mais antiga. (HOJE-35)
2. The system SHALL mostrar no título de `Feito hoje` a soma do tempo das sessões de hoje do usuário nessas tarefas e quantas são (`3h 22min em 4 tarefas`). (HOJE-36)
3. The system SHALL desenhar cada tarefa feita com o card de HOJE-24 em fundo cinza claro, o ícone de concluída no lugar do ponto, a linha `<lista> · <tempo total> de <estimativa>` e o selo de `verdictOf` (`No prazo`, `Xmin antes` em verde, `Xmin depois` em vermelho). (HOJE-37)
4. WHERE a tarefa feita não tem estimativa, o card SHALL mostrar só o tempo total, sem `de <estimativa>` e sem selo. (HOJE-38)
5. IF o usuário não concluiu nenhuma tarefa hoje THEN o sistema SHALL mostrar `Nada concluído hoje ainda`. (HOJE-39)
6. The system SHALL não contar em `Feito hoje` uma tarefa concluída hoje por outro membro, nem uma que o usuário concluiu ontem. (HOJE-40)

**Independent Test**: Concluir uma tarefa estimada em 30min depois de 25min de sessão e vê-la em `Feito hoje` com `5min antes`; uma tarefa concluída por outro membro não aparece.

---

### P2: Comparar o plano com o que aconteceu

**User Story**: Como usuário, quero ver o plano de hoje e as minhas sessões na mesma linha do tempo, para perceber onde o dia saiu do plano.

**Why P2**: É o diferencial do dashboard, mas o dia já é legível sem ele.

**Acceptance Criteria**:

1. The system SHALL mostrar em `Plano × real` duas faixas horizontais com a mesma escala: `Plano`, com os blocos do plano de hoje, e `Real`, com as sessões de hoje do usuário no workspace. (HOJE-42)
2. The system SHALL fazer a escala ir da hora cheia anterior ao mais cedo entre o início da jornada, o primeiro bloco e a primeira sessão, até a hora cheia seguinte ao mais tarde entre o fim da jornada, o último bloco e a última sessão, com uma marca por hora. (HOJE-43)
3. The system SHALL desenhar os blocos de tarefa do plano com borda tracejada na cor da lista sobre o tom fraco dela, as sessões de tarefa sólidas na cor da lista com texto branco, e pausas e intervalos em cinza, nas duas faixas. (HOJE-44)
4. The system SHALL desenhar a sessão aberta até a hora atual e uma linha vertical `agora` atravessando as duas faixas. (HOJE-45)
5. WHEN o usuário passa o mouse sobre um bloco ou uma sessão THEN o sistema SHALL mostrar o título e o horário de início e fim. (HOJE-46)
6. IF não há plano salvo para hoje THEN a faixa `Plano` SHALL mostrar `Sem plano para hoje` e um link para `/planejar/<hoje>`. (HOJE-47)
7. WHILE a janela é mais estreita do que a linha do tempo, a linha do tempo SHALL rolar na horizontal dentro do card, sem rolar a página. (HOJE-48)

**Independent Test**: Com um plano salvo e duas sessões, ver os blocos tracejados em cima, as sessões sólidas embaixo e a linha `agora` na hora certa.

---

### P2: Ver os números do dia

**User Story**: Como usuário, quero quatro números do dia ao lado do card Agora, para medir o dia num relance.

**Why P2**: Resume o dia, mas as listas já dão a mesma informação em mais detalhe.

**Acceptance Criteria**:

1. The system SHALL mostrar `Tempo focado`: a soma das sessões de tarefa de hoje do usuário no workspace, a sessão aberta até agora, e abaixo `intervalos <soma dos intervalos>`, com o mesmo total que os Relatórios mostram para hoje. (HOJE-49)
2. The system SHALL mostrar `Concluídas`: `<feitas> de <planejadas> no plano`, onde planejadas são as tarefas com bloco no plano de hoje e feitas são as dessas concluídas pelo usuário, com um segmento por tarefa planejada (verde se feita, índigo se em foco, cinza se não). (HOJE-50)
3. IF não há plano salvo para hoje THEN `Concluídas` SHALL mostrar só o número de `Feito hoje` e `sem plano hoje`. (HOJE-51)
4. The system SHALL mostrar `Aderência ao plano` como a porcentagem definida nas suposições, e `—` com `sem blocos até agora` quando nenhum bloco de tarefa começou. (HOJE-52)
5. The system SHALL mostrar `Trocas de tarefa` como definido nas suposições e, abaixo, a duração média das sessões de tarefa de hoje. (HOJE-53)

**Independent Test**: Com três sessões de tarefa (A, B, A) e um intervalo, ver `Trocas de tarefa 2` e o tempo focado igual ao do Relatório de hoje.

---

### P2: Ver o que vem amanhã

**User Story**: Como usuário, quero ver o que já está marcado para amanhã, para fechar o dia sabendo como o próximo começa.

**Why P2**: Ajuda a planejar, mas Planejar já mostra o dia seguinte.

**Acceptance Criteria**:

1. The system SHALL mostrar em `Amanhã` o dia seguinte por extenso e as tarefas não concluídas do workspace com `scheduled_on` igual a amanhã, as com hora primeiro em ordem de hora, com o card de HOJE-24 e a linha `<lista> · <HH:MM> · recorrente|agendada`. (HOJE-54)
2. WHERE há tarefas na coluna `Esta semana` sem `scheduled_on`, `Amanhã` SHALL mostrar uma linha tracejada `N tarefas em Esta semana sem dia`. (HOJE-55)
3. The system SHALL mostrar no rodapé de `Amanhã` `Amanhã ainda não tem plano` ou `Plano de amanhã: N blocos`, e o botão `Planejar amanhã`. (HOJE-56)
4. IF não há tarefa para amanhã nem em `Esta semana` sem dia THEN `Amanhã` SHALL mostrar `Nada marcado para amanhã`. (HOJE-57)

**Independent Test**: Agendar uma tarefa para amanhã às 10:00 e vê-la em `Amanhã` com `10:00 · agendada`.

---

### P3: Fechar o dia

**User Story**: Como usuário, quero um resumo do dia e decidir para onde vai cada pendência, para terminar o dia com tudo no lugar.

**Why P3**: Fecha o ciclo do dia, mas o usuário já consegue mover as tarefas pelo quadro.

**Acceptance Criteria**:

1. WHEN o usuário clica em `Fechar o dia`, no cabeçalho ao lado de `Planejar amanhã`, THEN o sistema SHALL abrir um diálogo com o dia por extenso, a hora atual, e os números `Focado`, `Concluídas` (do dia, sobre as planejadas), `Aderência ao plano` e `No prazo` (selos `No prazo` ou `antes` sobre as feitas com estimativa). (HOJE-41)
2. The system SHALL mostrar no diálogo o tempo focado de hoje por lista numa barra empilhada com legenda, nas cores das listas. (HOJE-58)
3. The system SHALL listar no diálogo as tarefas de `Pendente` e a tarefa em foco, cada uma com o seletor `Amanhã`, `Esta semana`, `Backlog`, começando em `Amanhã`. (HOJE-59)
4. The system SHALL mostrar abaixo de uma tarefa de `Veio de dias anteriores` com 3 dias ou mais `Adiada N dias seguidos`. (HOJE-60)
5. WHEN o usuário confirma `Fechar o dia` THEN o sistema SHALL, numa única gravação, mover para `Esta semana` e agendar para amanhã sem hora as tarefas em `Amanhã` (o agendamento as traz de volta para `Hoje` amanhã, D21), mover para `Esta semana` sem dia as tarefas em `Esta semana`, e mover para `Backlog` sem dia as tarefas em `Backlog`. (HOJE-61)
6. WHILE há uma sessão aberta quando o usuário confirma, o sistema SHALL pausá-la antes de mover as tarefas. (HOJE-62)
7. The system SHALL mostrar no diálogo o resumo do dia em Markdown (título com o workspace e a data, os números, `### Feito` com tempo, desvio e lista de cada tarefa, `### Ficou para depois` com o destino de cada pendência) e o campo opcional `Nota do dia`, que entra no fim do resumo. (HOJE-63)
8. WHERE `Copiar ao fechar` está marcado (o padrão), WHEN o usuário confirma THEN o sistema SHALL copiar o resumo para a área de transferência e mostrar `Resumo copiado`. (HOJE-64)
9. IF a gravação falha THEN o sistema SHALL mostrar o erro, não mover nenhuma tarefa e manter o diálogo aberto com as escolhas. (HOJE-65)
10. IF a área de transferência recusa a cópia THEN o sistema SHALL fechar o dia mesmo assim e mostrar `Não foi possível copiar o resumo` com o botão `Copiar de novo`. (HOJE-66)
11. WHILE o usuário é `viewer`, o botão `Fechar o dia` SHALL não aparecer. (HOJE-67)

**Independent Test**: Com três pendências, escolher `Amanhã`, `Esta semana` e `Backlog`, confirmar e ver cada tarefa no destino no quadro, com o resumo na área de transferência.

---

## Edge Cases

- IF uma sessão atravessa a meia-noite THEN o sistema SHALL contar em hoje só o pedaço de hoje, como os Relatórios. (HOJE-68)
- IF o workspace muda de fuso durante o dia THEN o sistema SHALL recalcular "hoje" no novo fuso na leitura seguinte. (HOJE-69)
- WHEN o dia vira à meia-noite com a página aberta THEN o sistema SHALL trocar para o novo dia na atualização seguinte do minuto. (HOJE-70)
- IF uma tarefa é concluída em outra aba ou dispositivo THEN o sistema SHALL tirá-la de `Pendente` e pô-la em `Feito hoje` na leitura seguinte (até 60 s ou ao ganhar o foco da janela). (HOJE-71)
- IF o workspace não tem listas ativas THEN o sistema SHALL mostrar o dashboard com os vazios de cada card e um link `Criar lista` em `Pendente`. (HOJE-72)
- IF a leitura dos dados do dashboard falha THEN o sistema SHALL manter os últimos dados lidos e mostrar `Não foi possível atualizar` com `Tentar de novo`. (HOJE-73)

---

## Implicit-Requirement Dimensions

| Dimension | Landing |
| --------- | ------- |
| Input validation & bounds | Só `Fechar o dia` grava; os destinos são um enum de três valores e as tarefas precisam ser do workspace e estar pendentes (HOJE-61); a nota tem até 2000 caracteres e só vai para a cópia. |
| Failure / partial-failure states | HOJE-22, HOJE-65, HOJE-66, HOJE-73. |
| Idempotency / retry / duplicate handling | As ações de foco reusam `action_id` (AD-002). Repetir `Fechar o dia` deixa as tarefas no mesmo destino, então é idempotente. |
| Auth boundaries & rate limits | Leitura para qualquer membro; ações de foco e `Fechar o dia` só para quem escreve (HOJE-21, HOJE-67). Tokens de acesso: rota nova sem `tokenScope`, logo negada a tokens (AD-007). Sem limite novo. |
| Concurrency / ordering | `Fechar o dia` grava tudo numa transação (HOJE-61); outra aba vê o resultado na leitura seguinte (HOJE-71). |
| Data lifecycle / expiry | N/A because o dashboard não guarda dado novo: lê sessões, tarefas e planos que já existem. |
| Observability | N/A because nenhum fluxo novo de fundo; as rotas usam o log de requisição que já existe. |
| External-dependency failure | Só a área de transferência do navegador (HOJE-66). |
| State-transition integrity | HOJE-14 respeita a regra do foco (só em `Hoje`); HOJE-62 pausa antes de mover; HOJE-61 só move tarefas pendentes. |

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| HOJE-01 | P1: Ver o dia ao abrir o app | Tasks | Implementing |
| HOJE-02 | P1: Ver o dia ao abrir o app | Tasks | Implementing |
| HOJE-03 | P1: Ver o dia ao abrir o app | Tasks | Implementing |
| HOJE-04 | P1: Ver o dia ao abrir o app | Tasks | Implementing |
| HOJE-05 | P1: Ver o dia ao abrir o app | Tasks | Implementing |
| HOJE-06 | P1: Ver o dia ao abrir o app | Tasks | Implementing |
| HOJE-07 | P1: Saber o que está acontecendo agora | Tasks | Implementing |
| HOJE-08 | P1: Saber o que está acontecendo agora | Tasks | Implementing |
| HOJE-09 | P1: Saber o que está acontecendo agora | Tasks | Implementing |
| HOJE-10 | P1: Saber o que está acontecendo agora | Tasks | Implementing |
| HOJE-11 | P1: Saber o que está acontecendo agora | Tasks | Implementing |
| HOJE-12 | P1: Saber o que está acontecendo agora | Tasks | Implementing |
| HOJE-13 | P1: Saber o que está acontecendo agora | Tasks | Implementing |
| HOJE-14 | P1: Saber o que está acontecendo agora | Tasks | Implementing |
| HOJE-15 | P1: Saber o que está acontecendo agora | Tasks | Implementing |
| HOJE-16 | P1: Saber o que está acontecendo agora | Tasks | Implementing |
| HOJE-17 | P1: Saber o que está acontecendo agora | Tasks | Implementing |
| HOJE-18 | P1: Saber o que está acontecendo agora | Tasks | Implementing |
| HOJE-19 | P1: Saber o que está acontecendo agora | Tasks | Implementing |
| HOJE-20 | P1: Saber o que está acontecendo agora | Tasks | Implementing |
| HOJE-21 | P1: Saber o que está acontecendo agora | Tasks | Implementing |
| HOJE-22 | P1: Saber o que está acontecendo agora | Tasks | Implementing |
| HOJE-23 | P1: Ver o que falta e se cabe | Tasks | Implementing |
| HOJE-24 | P1: Ver o que falta e se cabe | Tasks | Implementing |
| HOJE-25 | P1: Ver o que falta e se cabe | Tasks | Implementing |
| HOJE-26 | P1: Ver o que falta e se cabe | Tasks | Implementing |
| HOJE-27 | P1: Ver o que falta e se cabe | Tasks | Implementing |
| HOJE-28 | P1: Ver o que falta e se cabe | Tasks | Implementing |
| HOJE-29 | P1: Ver o que falta e se cabe | Tasks | Implementing |
| HOJE-30 | P1: Ver o que falta e se cabe | Tasks | Implementing |
| HOJE-31 | P1: Ver o que falta e se cabe | Tasks | Implementing |
| HOJE-32 | P1: Ver o que falta e se cabe | Tasks | Implementing |
| HOJE-33 | P1: Ver o que falta e se cabe | Tasks | Implementing |
| HOJE-34 | P1: Ver o que falta e se cabe | Tasks | Implementing |
| HOJE-35 | P1: Ver o que já foi feito | Tasks | Implementing |
| HOJE-36 | P1: Ver o que já foi feito | Tasks | Implementing |
| HOJE-37 | P1: Ver o que já foi feito | Tasks | Implementing |
| HOJE-38 | P1: Ver o que já foi feito | Tasks | Implementing |
| HOJE-39 | P1: Ver o que já foi feito | Tasks | Implementing |
| HOJE-40 | P1: Ver o que já foi feito | Tasks | Implementing |
| HOJE-41 | P3: Fechar o dia | Tasks | In Tasks |
| HOJE-42 | P2: Comparar o plano com o que aconteceu | Tasks | Implementing |
| HOJE-43 | P2: Comparar o plano com o que aconteceu | Tasks | Implementing |
| HOJE-44 | P2: Comparar o plano com o que aconteceu | Tasks | Implementing |
| HOJE-45 | P2: Comparar o plano com o que aconteceu | Tasks | Implementing |
| HOJE-46 | P2: Comparar o plano com o que aconteceu | Tasks | Implementing |
| HOJE-47 | P2: Comparar o plano com o que aconteceu | Tasks | Implementing |
| HOJE-48 | P2: Comparar o plano com o que aconteceu | Tasks | Implementing |
| HOJE-49 | P2: Ver os números do dia | Tasks | Implementing |
| HOJE-50 | P2: Ver os números do dia | Tasks | Implementing |
| HOJE-51 | P2: Ver os números do dia | Tasks | Implementing |
| HOJE-52 | P2: Ver os números do dia | Tasks | Implementing |
| HOJE-53 | P2: Ver os números do dia | Tasks | Implementing |
| HOJE-54 | P2: Ver o que vem amanhã | Tasks | Implementing |
| HOJE-55 | P2: Ver o que vem amanhã | Tasks | Implementing |
| HOJE-56 | P2: Ver o que vem amanhã | Tasks | Implementing |
| HOJE-57 | P2: Ver o que vem amanhã | Tasks | Implementing |
| HOJE-58 | P3: Fechar o dia | Tasks | In Tasks |
| HOJE-59 | P3: Fechar o dia | Tasks | In Tasks |
| HOJE-60 | P3: Fechar o dia | Tasks | In Tasks |
| HOJE-61 | P3: Fechar o dia | Tasks | Implementing |
| HOJE-62 | P3: Fechar o dia | Tasks | Implementing |
| HOJE-63 | P3: Fechar o dia | Tasks | In Tasks |
| HOJE-64 | P3: Fechar o dia | Tasks | In Tasks |
| HOJE-65 | P3: Fechar o dia | Tasks | Implementing |
| HOJE-66 | P3: Fechar o dia | Tasks | In Tasks |
| HOJE-67 | P3: Fechar o dia | Tasks | Implementing |
| HOJE-68 | Edge cases | Tasks | Implementing |
| HOJE-69 | Edge cases | Tasks | Implementing |
| HOJE-70 | Edge cases | Tasks | Implementing |
| HOJE-71 | Edge cases | Tasks | Implementing |
| HOJE-72 | Edge cases | Tasks | Implementing |
| HOJE-73 | Edge cases | Tasks | Implementing |
| HOJE-74 | P1: Saber o que está acontecendo agora | Tasks | Implementing |

**Coverage:** 74 total, 74 mapped to tasks, 0 unmapped

---

## Success Criteria

- [ ] Abrindo o app às 14:20 de um dia com plano, o usuário diz o que está fazendo, o que concluiu e se o resto cabe sem sair de `/`.
- [ ] `Tempo focado` e `Feito hoje` batem, ao minuto, com os Relatórios do dia.
- [ ] Nenhuma tarefa de outro membro aparece em `Feito hoje`, e nenhuma sessão de outro membro aparece em `Plano × real`.
