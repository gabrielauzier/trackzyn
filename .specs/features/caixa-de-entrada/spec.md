# Caixa de entrada Specification

Início: 2026-11-13 · Branch: `claude/gtd-capture-system-440984` · Base: `main` (`d7e18fe`)

**Design aprovado (2026-11-13):** https://claude.ai/artifact/9tSNQBRo9GTbUMJ9WZgrgo · Decisões de refinamento: `context.md` desta pasta.

## Problem Statement

O usuário organiza o trabalho num sistema GTD no Notion: captura tudo numa Inbox e depois processa cada item, dando nome e categoria. O Trackzyn já tem as listas e o quadro (Backlog, Esta semana, Hoje, Concluídas), mas não tem onde jogar uma ideia sem decidir nada, e o quadro não tem os campos que o processamento pede (prioridade, prazo, aguardando, pausa). Por isso o usuário mantém dois sistemas.

Esta feature traz a fase 1 para o Trackzyn: capturar em um segundo numa **Caixa de entrada** pessoal, processar cada item como **tarefa**, **lembrete** ou **grupo de tarefas** de uma lista, e mostrar no quadro **prioridade**, **prazo**, **Aguardando** e **flag**, cada um ligável em **Campos do card** (AD-011).

O que o código já fixa:

- **Quadro:** `tasks.column` é `backlog`, `this_week`, `today` ou `done`; o card mostra título, estimativa, tempo gasto, agendamento, "via" e subtarefas (`components/board/task-card.tsx`).
- **Agendamento:** `scheduled_on` e `scheduled_time` já existem; a tarefa agendada vai para Hoje no dia, liquidado na leitura (AD-009). Dia e semana seguem o fuso do workspace (AD-004).
- **Sem worker no modo local:** o desktop roda em PGlite, sem jobs; tudo que vence com o tempo é resolvido na leitura (AD-001, AD-009).
- **Papéis:** `owner`, `editor` e `viewer`; `viewer` não escreve em listas.
- **Tokens e MCP:** escopos `lists:read`, `tasks:read`, `tasks:create`, `tasks:write`, `tasks:delete`; rotas fechadas a tokens por padrão (AD-007). Ferramentas MCP em `backend-node/src/mcp/tools.ts`.
- **Desktop:** o atalho do widget só funciona com o app em foco (WIDGET-05); esta feature abre uma exceção só para a captura (decisão do usuário, 2026-11-13).
- **Limites de tarefa:** título de 1 a 255 caracteres, notas até 10 000, estimativa de 1 a 1440 minutos.

## Goals

- [ ] Capturar um item leva só o texto e um Enter, de qualquer tela do app, do desktop com outro app na frente, e do MCP.
- [ ] Todo item sai da caixa com nome e lista, como tarefa, lembrete ou grupo, na coluna certa do quadro daquela lista.
- [ ] Processar a caixa inteira é uma sequência sem sair da tela, com uma revisão antes de enviar tudo de uma vez.
- [ ] O quadro mostra prioridade, prazo, Aguardando e flag só para quem ligar cada campo; quem não mexer vê o card de hoje com os campos novos ligados por padrão.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Página Tarefas com as visões transversais (Pendentes, A fazer, Atrasadas, Sem prazo, Aguardando) | Fase 2 (decisão do usuário, 2026-11-13). |
| Status Review do Notion | O usuário dispensou. |
| XP do Notion | Não tem equivalente no Trackzyn. |
| Notificação de lembrete no horário | Exige worker ou o app aberto; o desktop local não tem worker (mesma razão do D8 do agendamento). |
| Captura pelo app mobile e por e-mail | Fica para depois. |
| Caixa compartilhada do workspace | A caixa é pessoal (decisão do usuário, 2026-11-13). |
| Lembrete no foco e nos relatórios de tempo | Lembrete não tem estimativa nem foco. |
| Grupo com recorrência ou agendamento próprio | O agendamento é das tarefas do grupo. |
| Grupo que atravessa listas | O grupo pertence a uma lista. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Dono da caixa | Cada item pertence a um usuário e ao workspace em que foi capturado; só o autor vê, processa ou descarta | Decisão do usuário (2026-11-13) | y |
| Quem captura e quem envia | Todo membro captura, inclusive `viewer`; enviar para uma lista exige escrever nela (`owner` ou `editor`) | A caixa é pessoal; o envio cria tarefa na lista e segue a permissão dela | y |
| Campos do card: onde e padrão | No servidor, por usuário e por lista; Prioridade, Prazo, Flag e Aguardando nascem ligados | Decisão do usuário (2026-11-13); vale no web e no desktop | y |
| Flag ao concluir | Ir para Concluídas apaga a flag e o motivo; reabrir não traz a flag de volta | Decisão do usuário (2026-11-13) | y |
| Aguardando nas somas | Tarefa marcada fica fora da estimativa do cabeçalho das colunas e da estimativa pendente de Hoje; um bloco de plano já criado continua contando | Decisão do usuário (2026-11-13); o bloco é tempo reservado pelo usuário | y |
| Atalho global de captura no desktop | Exceção ao WIDGET-05 só para a captura: `⌘⇧Space` no macOS e `Ctrl+Shift+Space` no Windows e Linux, ligável e trocável nas preferências do desktop | Decisão do usuário (2026-11-13) | y |
| Arrastar o contêiner pelo título | Move todas as tarefas do grupo daquela coluna para a coluna de destino, na mesma ordem | Decisão do usuário (2026-11-13) | y |
| Grupo sem próxima ação | Ao concluir a última tarefa aberta do grupo, um toast `<grupo> está sem próxima ação` com `Adicionar tarefa`; nada é bloqueado | Decisão do usuário (2026-11-13) | y |
| Lixeira | Guarda o item 30 dias; restaurar volta para Atuais; depois de 30 dias o item é apagado na próxima leitura da caixa | Sem worker no modo local (AD-001) | y |
| Atalho de captura dentro do app | `⌘⇧Space` / `Ctrl+Shift+Space` com o app em foco, a entrada `Capturar` da paleta de comandos e o botão `Capturar` da barra lateral | Escolha do agente (context.md, Agent's Discretion) | y |
| Ordem da caixa | Mais antigo primeiro | GTD processa em ordem de chegada | y |
| Coluna de destino ao processar | Sem agendamento → Backlog; agendada para hoje → Hoje; para outro dia desta semana → Esta semana; para depois → Backlog; o usuário pode trocar antes de salvar | Pedido do usuário (2026-11-13) + regra do agendamento | y |
| "Já fiz" (regra dos 2 minutos) | Cria uma tarefa já em Concluídas, sem estimativa, concluída agora pelo usuário | Regra do GTD | y |
| Rascunho do Processar tudo | Fica no servidor, por usuário, até ser enviado; não expira | Sobrevive a fechar a janela e vale no web e no desktop | y |
| Origem do item | `app`, `desktop`, `mcp` ou `api`, mais o token quando houver | Mesma lógica do "via" da tarefa | y |
| Escopo de token da captura | Escopo novo `inbox:create`, só cria item; ler e processar a caixa fica fechado a tokens | AD-007: negado por padrão | y |
| Prazo | Só o dia, sem hora, no fuso do workspace | "Até quando" é um dia; segue AD-004 | y |
| Tirar uma tarefa do grupo | Soltar fora do contêiner ou escolher `Sem grupo` no modal; o grupo continua existindo mesmo sem tarefas | O grupo pode ganhar a próxima ação depois | y |
| Apagar um grupo | Fora desta fase pela interface; ao apagar a lista, os grupos vão junto; as tarefas de um grupo apagado ficam sem grupo | Ninguém pediu gestão de grupos além de criar e mover | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Capturar sem decidir nada ⭐ MVP

**User Story**: Como usuário, quero guardar uma ideia digitando só o texto, para tirar ela da cabeça sem parar o que estou fazendo.

**Why P1**: Sem captura não há caixa.

**Acceptance Criteria**:

1. WHEN o usuário envia um texto de 1 a 500 caracteres (depois de tirar os espaços das pontas) pelo campo do topo da caixa, pelo overlay de captura ou pela paleta de comandos THEN o sistema SHALL criar um item na caixa dele, no workspace atual, com esse texto, a data e hora de chegada e a origem `app`, e limpar o campo. (CAP-01)
2. IF o texto está vazio depois de tirar os espaços THEN o sistema SHALL não criar item e manter o campo com o foco. (CAP-02)
3. IF o texto passa de 500 caracteres THEN o sistema SHALL recusar com 422 e a interface SHALL mostrar `Até 500 caracteres` sem apagar o texto. (CAP-03)
4. WHEN o usuário aperta `⌘⇧Space` (macOS) ou `Ctrl+Shift+Space` (Windows, Linux) com o app em foco, ou escolhe `Capturar` na paleta ou na barra lateral THEN o sistema SHALL abrir o overlay de captura com o campo focado. (CAP-04)
5. WHEN o usuário aperta Esc no overlay THEN o sistema SHALL fechar o overlay sem criar item. (CAP-05)
6. WHERE o app desktop tem o atalho de captura ligado, WHEN o usuário aperta o atalho com outro app na frente THEN o desktop SHALL abrir a janelinha de captura acima das outras janelas, e o item criado por ela SHALL ter a origem `desktop`. (CAP-06)
7. WHEN o usuário desliga ou troca o atalho de captura nas preferências do desktop THEN o desktop SHALL liberar a combinação anterior na hora. (CAP-07)
8. IF o sistema operacional recusa a combinação (já usada por outro app) THEN o desktop SHALL mostrar `Esse atalho já está em uso` nas preferências e manter o atalho desligado. (CAP-08)
9. WHEN um cliente com token de escopo `inbox:create` chama a ferramenta MCP `capture` ou `POST /api/inbox` com um texto THEN o sistema SHALL criar o item na caixa do dono do token, no workspace do token, com a origem `mcp` ou `api` e o token. (CAP-09)
10. IF o token não tem o escopo `inbox:create` THEN o sistema SHALL responder 403 e não criar item. (CAP-10)

**Independent Test**: Apertar `⌘⇧Space` no quadro, digitar `Ligar para o contador`, Enter: o contador da caixa sobe 1 e o item aparece por último com `via Trackzyn`.

---

### P1: Ver e manter a caixa ⭐ MVP

**User Story**: Como usuário, quero ver tudo que capturei num só lugar, do mais antigo para o mais novo, para processar em ordem.

**Why P1**: É a tela da feature.

**Acceptance Criteria**:

1. The system SHALL mostrar na barra lateral o item `Caixa de entrada` com a quantidade de itens em Atuais do usuário no workspace atual, e sem número quando for zero. (INBOX-01)
2. The system SHALL listar em Atuais só os itens do usuário logado no workspace atual, do mais antigo para o mais novo, cada um com o texto, a idade (`hoje, 09:12`, `ontem`, `há 3 dias`) e a origem. (INBOX-02)
3. The system SHALL nunca mostrar, contar ou deixar processar um item de outro usuário; IF um usuário pede um item de outro pela API THEN o sistema SHALL responder 404. (INBOX-03)
4. WHEN o usuário descarta um item THEN o sistema SHALL tirá-lo de Atuais e mostrá-lo na aba Lixeira, com a data do descarte. (INBOX-04)
5. WHEN o usuário restaura um item da Lixeira THEN o sistema SHALL devolvê-lo a Atuais na posição da data de chegada. (INBOX-05)
6. WHEN a caixa é lida THEN o sistema SHALL apagar os itens descartados há mais de 30 dias. (INBOX-06)
7. WHILE Atuais está vazia the system SHALL mostrar `Nada na caixa. Capture o que estiver na cabeça.` no lugar da lista. (INBOX-07)

**Independent Test**: Dois usuários do mesmo workspace capturam um item cada; cada um vê só o seu e o contador mostra 1.

---

### P1: Enviar rápido pela linha ⭐ MVP

**User Story**: Como usuário, quero escolher a lista e a estimativa na própria linha e enviar, para não abrir um formulário para cada tarefa simples.

**Why P1**: A maioria dos itens vira tarefa no Backlog de uma lista.

**Acceptance Criteria**:

1. The system SHALL mostrar em cada linha de Atuais um select de lista (só as listas não arquivadas em que o usuário escreve), um campo de estimativa `HH:MM` e o botão de descartar. (QUICK-01)
2. WHEN o usuário escolhe uma lista ou digita uma estimativa na linha THEN o sistema SHALL guardar o valor no item, e ele SHALL continuar lá depois de recarregar a página. (QUICK-02)
3. WHILE o item não tem lista, the system SHALL esconder o botão `Enviar` da linha. (QUICK-03)
4. WHEN o usuário clica em `Enviar` THEN o sistema SHALL criar uma tarefa com o texto do item como título, a estimativa da linha, no fim do Backlog da lista escolhida, e tirar o item da caixa, numa só transação. (QUICK-04)
5. IF a estimativa da linha não é `HH:MM` entre 00:01 e 24:00 THEN o sistema SHALL marcar o campo como inválido e não guardar o valor. (QUICK-05)
6. IF a lista escolhida foi arquivada ou o usuário perdeu a escrita nela antes do envio THEN o sistema SHALL responder 409, manter o item na caixa e limpar a lista do item. (QUICK-06)
7. IF o texto do item passa de 255 caracteres THEN o sistema SHALL não mostrar `Enviar` e o envio SHALL exigir o Processar, onde o nome é editável. (QUICK-07)
8. WHEN o usuário clica em qualquer lugar da linha fora do select, da estimativa, de `Enviar` e do descartar THEN o sistema SHALL abrir o Processar daquele item. (QUICK-08)
9. WHILE o ponteiro está sobre a linha e fora desses controles, the system SHALL destacar a borda da linha e sublinhar o título. (QUICK-09)

**Independent Test**: Escolher `Work (ADSET)` e `01:30` numa linha, recarregar, clicar em `Enviar`: o item sai da caixa e a tarefa aparece no fim do Backlog de `Work (ADSET)` com `1h30`.

---

### P1: Processar um item como tarefa ⭐ MVP

**User Story**: Como usuário, quero abrir um item e decidir tudo dele (nome, lista, prioridade, prazo, estimativa, agendamento), para que ele chegue pronto ao quadro.

**Why P1**: É o processamento do GTD.

**Acceptance Criteria**:

1. WHEN o Processar abre THEN o sistema SHALL mostrar o texto capturado, com a origem e a idade, o tipo `Tarefa` selecionado, o nome igual ao texto (até 255 caracteres) e a lista e a estimativa guardadas na linha. (PROC-01)
2. IF o nome está vazio ou a lista não foi escolhida THEN o sistema SHALL desabilitar `Salvar e próximo` e marcar o campo que falta. (PROC-02)
3. The system SHALL calcular a coluna de destino pelo agendamento: sem dia → Backlog; dia de hoje → Hoje; outro dia da semana atual (seg–dom, fuso do workspace) → Esta semana; depois → Backlog; e mostrar `Vai para <lista> › <coluna>`. (PROC-03)
4. WHEN o usuário escolhe outra coluna no `Vai para` THEN o sistema SHALL usar essa coluna no envio. (PROC-04)
5. WHEN o usuário salva um item avulso THEN o sistema SHALL criar a tarefa no fim da coluna de destino com nome, lista, prioridade, prazo, estimativa, agendamento e notas, e tirar o item da caixa, numa só transação. (PROC-05)
6. WHEN o usuário clica em `Já fiz (menos de 2 min)` THEN o sistema SHALL criar a tarefa em Concluídas, concluída agora pelo usuário, e tirar o item da caixa. (PROC-06)
7. WHEN o usuário clica em `Descartar` no Processar THEN o sistema SHALL mandar o item para a Lixeira. (PROC-07)
8. IF a criação da tarefa falha THEN o sistema SHALL manter o item na caixa com os valores preenchidos e mostrar o erro no formulário. (PROC-08)

**Independent Test**: Processar `DEV-1701` com lista `Work (ADSET)`, prioridade Alta e agendamento para hoje: a tarefa aparece em Hoje com o ícone de Alta, e a caixa perde o item.

---

### P1: Processar tudo com revisão ⭐ MVP

**User Story**: Como usuário, quero passar pela caixa inteira de uma vez e revisar antes de mandar tudo, para corrigir decisões sem caçar tarefa por tarefa no quadro.

**Why P1**: É como o usuário zera a caixa no Notion.

**Acceptance Criteria**:

1. WHEN o usuário clica em `Processar tudo` THEN o sistema SHALL abrir o primeiro item de Atuais sem decisão guardada, com `Processar · <n> de <total>` e a barra de progresso. (ALL-01)
2. WHEN o usuário clica em `Salvar e próximo` THEN o sistema SHALL guardar a decisão como rascunho, sem criar nada no quadro, e abrir o próximo item. (ALL-02)
3. WHEN o usuário clica em `Pular` THEN o sistema SHALL abrir o próximo item sem guardar decisão para o atual. (ALL-03)
4. WHEN o último item é salvo ou pulado THEN o sistema SHALL abrir a revisão com cada item decidido (tipo, nome, prioridade, destino `<lista> › <coluna>` ou `Lixeira`) e, por lista, quantos itens cada coluna ganha e a soma das estimativas. (ALL-04)
5. WHEN o usuário clica num item da revisão THEN o sistema SHALL abrir o formulário daquele item com a decisão guardada, e salvar SHALL voltar à revisão. (ALL-05)
6. WHEN o usuário clica em `Confirmar e enviar <n> itens` THEN o sistema SHALL criar todas as tarefas, lembretes e grupos e mover os descartados para a Lixeira numa só transação, e os itens pulados SHALL ficar em Atuais. (ALL-06)
7. IF algum item da revisão não pode ser enviado (lista arquivada, sem permissão, item já processado em outra janela) THEN o sistema SHALL não enviar nenhum, responder 409 e marcar na revisão cada item com o motivo. (ALL-07)
8. WHEN o usuário clica em `Terminar depois` ou fecha a janela THEN o sistema SHALL manter os rascunhos, e o próximo `Processar tudo` SHALL abrir no primeiro item sem decisão. (ALL-08)
9. WHEN um item com rascunho é enviado pela linha ou processado avulso THEN o sistema SHALL apagar o rascunho dele. (ALL-09)

**Independent Test**: Com 3 itens, salvar o 1º como tarefa, pular o 2º, descartar o 3º, fechar, reabrir `Processar tudo`: abre no 2º; na revisão, confirmar: 1 tarefa criada, 1 item na Lixeira, 1 em Atuais.

---

### P1: Lembrete ⭐ MVP

**User Story**: Como usuário, quero transformar um item num lembrete leve, para registrar coisas rápidas sem estimativa nem foco.

**Why P1**: É um dos três destinos do processamento.

**Acceptance Criteria**:

1. WHEN o usuário processa um item como `Lembrete` THEN o sistema SHALL criar uma tarefa do tipo lembrete, sem estimativa, com nome, lista, prioridade, dia e hora opcionais, e as mesmas regras de coluna de PROC-03. (REM-01)
2. The system SHALL esconder o campo de estimativa no formulário de lembrete e recusar com 422 uma estimativa enviada para um lembrete pela API. (REM-02)
3. The system SHALL mostrar o lembrete no quadro com o card compacto (ícone de sino, título, ícone de prioridade e o dia ou hora), sem checkbox, sem estimativa e sem tempo gasto. (REM-03)
4. WHEN o usuário move o lembrete para Concluídas THEN o sistema SHALL concluí-lo como qualquer tarefa. (REM-04)
5. The system SHALL não oferecer `Iniciar foco` num lembrete e IF o foco é pedido para um lembrete pela API THEN o sistema SHALL responder 422. (REM-05)
6. WHERE o lembrete tem dia e hora, the system SHALL mostrá-lo na Agenda como marcador naquele horário, sem bloco de duração. (REM-06)

**Independent Test**: Processar `Pagar o DAS` como lembrete para hoje às 10:00: aparece em Hoje com o sino e `10:00`, sem estimativa; o menu do card não tem `Iniciar foco`.

---

### P1: Grupo de tarefas ⭐ MVP

**User Story**: Como usuário, quero transformar um item num grupo com as primeiras tarefas, e ver o grupo como um contêiner no quadro, para acompanhar um projeto sem perder as tarefas de vista.

**Why P1**: É o Project do Notion e um dos três destinos.

**Acceptance Criteria**:

1. WHEN o usuário processa um item como `Grupo` com nome, lista e pelo menos uma tarefa THEN o sistema SHALL criar o grupo na lista, com prioridade e prazo opcionais, e as tarefas na ordem digitada, todas na coluna de destino. (GRP-01)
2. IF o grupo não tem nenhuma tarefa THEN o sistema SHALL desabilitar `Salvar e próximo` com a dica `Adicione a primeira tarefa`. (GRP-02)
3. WHEN o usuário digita uma tarefa terminada em `HH:MM` no campo de nova tarefa do grupo THEN o sistema SHALL usar esse trecho como estimativa e o resto como título. (GRP-03)
4. The system SHALL mostrar o grupo, em cada coluna com pelo menos uma tarefa dele, como um contêiner com o nome e `<n> tarefas` no topo e os cards das tarefas dentro, na ordem do grupo. (GRP-04)
5. WHEN a última tarefa do grupo sai de uma coluna THEN o sistema SHALL tirar o contêiner daquela coluna. (GRP-05)
6. WHEN o usuário solta uma tarefa dentro do contêiner do mesmo grupo THEN o sistema SHALL reordená-la no grupo, mudando de coluna se o contêiner está em outra coluna, e mantê-la no grupo. (GRP-06)
7. WHEN o usuário solta uma tarefa do grupo na coluna, fora de qualquer contêiner THEN o sistema SHALL tirá-la do grupo e colocá-la naquela posição da coluna. (GRP-07)
8. WHEN o usuário solta uma tarefa avulsa dentro de um contêiner THEN o sistema SHALL colocá-la no grupo, naquela posição. (GRP-08)
9. WHEN o usuário arrasta o contêiner pelo título para outra coluna THEN o sistema SHALL mover todas as tarefas do grupo daquela coluna para a de destino, na mesma ordem. (GRP-09)
10. WHEN a última tarefa aberta do grupo vai para Concluídas THEN o sistema SHALL mostrar o toast `<grupo> está sem próxima ação` com o botão `Adicionar tarefa`, e nada SHALL ser bloqueado. (GRP-10)
11. The system SHALL tratar as tarefas do grupo como tarefas comuns em foco, Agenda, agendamento, planejamento e relatórios. (GRP-11)

**Independent Test**: Processar `Pipeline de scripts` como grupo com 4 tarefas para Esta semana; arrastar a 1ª para Hoje dentro do contêiner de Hoje: o contêiner aparece nas duas colunas; soltar a 2ª fora do contêiner: ela sai do grupo e a contagem cai para 3.

---

### P1: Prioridade ⭐ MVP

**User Story**: Como usuário, quero dar prioridade às tarefas e vê-la no card como ícone, para saber o que vem primeiro.

**Why P1**: Campo pedido no processamento.

**Acceptance Criteria**:

1. The system SHALL guardar em tarefas, lembretes e grupos uma prioridade `none`, `low`, `medium`, `high` ou `ultra`, com `none` como padrão; IF outro valor chega pela API THEN o sistema SHALL responder 422. (PRI-01)
2. WHERE o campo Prioridade está ligado, the system SHALL mostrar no card o ícone da prioridade, sem texto, com o nome no tooltip e no rótulo acessível (`Prioridade alta`): Baixa seta para baixo azul, Média dois traços amarelos, Alta seta para cima laranja, Ultra seta dupla para cima vermelha. (PRI-02)
3. The system SHALL não mostrar ícone para `none`. (PRI-03)
4. The system SHALL usar o mesmo select com ícones (Nenhuma, Baixa, Média, Alta, Ultra) no Processar, no modal da tarefa e no grupo. (PRI-04)

**Independent Test**: Marcar uma tarefa como Ultra no modal: o card mostra a seta dupla vermelha com o tooltip `Prioridade ultra`; desligar Prioridade em Campos do card: o ícone some.

---

### P1: Prazo ⭐ MVP

**User Story**: Como usuário, quero dizer até quando uma tarefa precisa estar pronta, separado de quando vou fazê-la, para ver o que está para vencer.

**Why P1**: Campo pedido no processamento.

**Acceptance Criteria**:

1. The system SHALL guardar em tarefas e grupos um prazo opcional, só o dia, independente do agendamento. (DUE-01)
2. WHERE o campo Prazo está ligado, the system SHALL mostrar no card o chip com ícone de ampulheta e `Prazo <dia>` em cor neutra. (DUE-02)
3. WHEN o prazo é amanhã ou hoje (fuso do workspace) e a tarefa não está em Concluídas THEN o chip SHALL ficar amarelo com `Prazo amanhã` ou `Prazo hoje`. (DUE-03)
4. WHEN o prazo já passou e a tarefa não está em Concluídas THEN o chip SHALL ficar vermelho com `Atrasada · <dia>`. (DUE-04)
5. WHILE a tarefa está em Concluídas, the system SHALL mostrar o prazo em cor neutra. (DUE-05)

**Independent Test**: Uma tarefa em Hoje com prazo ontem mostra `Atrasada · <ontem>` em vermelho; movida para Concluídas, o chip fica neutro.

---

### P1: Aguardando ⭐ MVP

**User Story**: Como usuário, quero marcar uma tarefa como aguardando alguém, sem tirar ela da coluna, para lembrar que depende de outra pessoa.

**Why P1**: É o status Delegated do Notion.

**Acceptance Criteria**:

1. The system SHALL guardar na tarefa a marca Aguardando e um "de quem" opcional de até 100 caracteres. (WAIT-01)
2. WHERE o campo Aguardando está ligado, the system SHALL mostrar no card marcado o chip com ícone de pessoa e `Aguardando · <de quem>`, ou `Aguardando` sem o "de quem". (WAIT-02)
3. The system SHALL manter a tarefa na coluna em que está ao marcar ou desmarcar Aguardando. (WAIT-03)
4. WHILE a tarefa está marcada como Aguardando, the system SHALL deixar a estimativa dela fora da soma do cabeçalho da coluna e da estimativa pendente de Hoje. (WAIT-04)
5. WHEN o usuário desmarca Aguardando THEN o sistema SHALL apagar o "de quem". (WAIT-05)

**Independent Test**: Hoje com duas tarefas de 1h: marcar uma como Aguardando de `Fulano` mostra o chip e o cabeçalho cai de `2h` para `1h`.

---

### P1: Flag ⭐ MVP

**User Story**: Como usuário, quero marcar uma tarefa com uma flag e um motivo, para lembrar que ela precisa de atenção (pausada, bloqueada, com dúvida).

**Why P1**: Substitui o status Paused do Notion.

**Acceptance Criteria**:

1. The system SHALL guardar na tarefa a flag e um motivo opcional de até 200 caracteres. (FLAG-01)
2. WHERE o campo Flag está ligado, the system SHALL mostrar no card com flag a borda vermelha e, abaixo do título, a bandeira vermelha com o motivo ou `Flag sem motivo`. (FLAG-02)
3. The system SHALL usar a borda vermelha do card só para tarefas com flag. (FLAG-03)
4. WHEN o usuário tira a flag THEN o sistema SHALL apagar o motivo. (FLAG-04)
5. WHEN a tarefa vai para Concluídas THEN o sistema SHALL tirar a flag e apagar o motivo. (FLAG-05)
6. The system SHALL manter a coluna, a prioridade e o Aguardando ao pôr ou tirar a flag. (FLAG-06)

**Independent Test**: Pôr flag com `Esperando acesso` numa tarefa de Esta semana: borda vermelha e motivo; arrastar para Concluídas: borda e motivo somem e não voltam ao reabrir.

---

### P1: Campos do card ⭐ MVP

**User Story**: Como usuário, quero escolher quais campos novos aparecem no card, para manter o quadro limpo (AD-011).

**Why P1**: AD-011 vale para todo campo novo do card.

**Acceptance Criteria**:

1. The system SHALL mostrar no card, sempre, o nome, a estimativa e o tempo registrado. (FIELDS-01)
2. WHEN o usuário clica na engrenagem da barra do quadro THEN o sistema SHALL abrir o popover `Campos do card` com um switch para Prioridade, Prazo, Flag e Aguardando e a nota `Nome, estimativa e tempo registrado aparecem sempre.`. (FIELDS-02)
3. The system SHALL guardar a escolha no servidor por usuário e por lista, com os quatro campos ligados enquanto o usuário não mexer. (FIELDS-03)
4. WHEN o usuário desliga um campo THEN o sistema SHALL escondê-lo nos cards daquela lista, só para ele, sem apagar o dado. (FIELDS-04)
5. WHILE o campo Flag está desligado, the system SHALL tirar também a borda vermelha. (FIELDS-05)
6. The system SHALL mostrar o card de lembrete e o contêiner de grupo com qualquer combinação de campos. (FIELDS-06)

**Independent Test**: Desligar Prazo na lista A: os chips de prazo somem na lista A e continuam na lista B; outro usuário da lista A continua vendo.

---

### P1: Modal da tarefa com os campos novos ⭐ MVP

**User Story**: Como usuário, quero editar prioridade, prazo, grupo, Aguardando e flag no modal da tarefa, para mudar o que decidi no processamento.

**Why P1**: Sem o modal, os campos só seriam editáveis ao processar.

**Acceptance Criteria**:

1. The system SHALL mostrar no modal, nesta ordem: Título, Flag, Prioridade e Estimativa, Prazo e Grupo, Aguardando, Anotações, rodapé, Agendamento e Subtarefas, independente de Campos do card. (MODAL-01)
2. WHILE a tarefa não tem flag, the system SHALL mostrar o botão `+ Flag` com a dica `Marca que a tarefa precisa de atenção, com um motivo opcional`; WHEN ele é clicado THEN o modal SHALL mostrar o bloco da flag com o campo de motivo e `Tirar flag`. (MODAL-02)
3. WHEN o usuário liga o switch Aguardando THEN o modal SHALL mostrar o campo `De quem`. (MODAL-03)
4. The system SHALL oferecer no select Grupo os grupos da lista da tarefa e `Sem grupo`; WHEN o usuário troca o grupo e salva THEN o sistema SHALL ter o mesmo efeito de arrastar para dentro ou para fora do contêiner (GRP-07, GRP-08), colocando a tarefa no fim do grupo. (MODAL-04)
5. WHEN o usuário clica em `Salvar` THEN o sistema SHALL gravar prioridade, prazo, grupo, Aguardando e flag junto com título, estimativa e anotações. (MODAL-05)
6. WHERE a tarefa é um lembrete, the system SHALL esconder Estimativa, Grupo e Subtarefas no modal. (MODAL-06)

**Independent Test**: Abrir uma tarefa sem flag, clicar `+ Flag`, digitar `Bloqueada`, mudar prioridade para Média, Salvar: o card mostra borda vermelha, `Bloqueada` e o ícone de Média.

---

### P2: Campos novos pela API e MCP

**User Story**: Como usuário de agentes, quero ler e gravar os campos novos pelas ferramentas MCP e pela API, para que meus agentes processem como eu.

**Why P2**: O app funciona sem isso; os agentes ganham paridade depois.

**Acceptance Criteria**:

1. The system SHALL devolver `kind` (`task` ou `reminder`), `priority`, `due_on`, `waiting`, `waiting_for`, `flagged`, `flag_reason` e `group_id` em `get_board`, `get_task` e nas leituras de tarefa da API. (API-01)
2. WHEN `create_task` ou `update_task` recebe esses campos com escopo `tasks:create` ou `tasks:write` THEN o sistema SHALL gravá-los com as mesmas validações da interface. (API-02)
3. IF um campo novo vem com valor inválido pela API THEN o sistema SHALL responder 422 sem gravar nada. (API-03)

**Independent Test**: `update_task` com `priority: "high"` e `due_on` de amanhã; `get_task` devolve os dois e o card mostra o ícone e `Prazo amanhã`.

---

## Edge Cases

- IF o mesmo item é enviado em duas janelas ao mesmo tempo THEN o sistema SHALL criar uma tarefa só e responder 409 à segunda. (EDGE-01)
- IF a lista de um rascunho do Processar tudo é arquivada antes da confirmação THEN a revisão SHALL marcar o item com `Lista arquivada` e o envio SHALL seguir ALL-07. (EDGE-02)
- WHEN um item é descartado e restaurado THEN a lista e a estimativa guardadas na linha SHALL voltar com ele. (EDGE-03)
- IF a lista de uma tarefa muda THEN o sistema SHALL tirar a tarefa do grupo, porque o grupo pertence à lista anterior. (EDGE-04)
- IF um grupo tem tarefas em Concluídas e abertas THEN o contêiner SHALL aparecer em Concluídas e nas colunas abertas, e `<n> tarefas` SHALL contar só as tarefas daquela coluna. (EDGE-05)
- WHEN uma tarefa com prazo e agendamento no mesmo dia é exibida THEN o card SHALL mostrar os dois, o selo de agendamento e o chip de prazo, sem juntá-los. (EDGE-06)
- WHEN um workspace é trocado THEN a caixa e o contador SHALL mostrar só os itens daquele workspace. (EDGE-07)
- IF o usuário sai do workspace THEN os itens dele naquele workspace SHALL ser apagados. (EDGE-08)

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| CAP-01 | P1: Capturar | T12, T23 | Implementing |
| CAP-02 | P1: Capturar | T12, T23 | Implementing |
| CAP-03 | P1: Capturar | T12, T23 | Implementing |
| CAP-04 | P1: Capturar | T25 | Implementing |
| CAP-05 | P1: Capturar | T25 | Implementing |
| CAP-06 | P1: Capturar | T30 | In Tasks |
| CAP-07 | P1: Capturar | T29, T31 | Implementing |
| CAP-08 | P1: Capturar | T29, T31 | Implementing |
| CAP-09 | P1: Capturar | T15 | Implementing |
| CAP-10 | P1: Capturar | T15, T16 | Implementing |
| INBOX-01 | P1: Ver e manter a caixa | T12, T23 | Implementing |
| INBOX-02 | P1: Ver e manter a caixa | T12, T23 | Implementing |
| INBOX-03 | P1: Ver e manter a caixa | T12 | Implementing |
| INBOX-04 | P1: Ver e manter a caixa | T12, T23 | Implementing |
| INBOX-05 | P1: Ver e manter a caixa | T12, T23 | Implementing |
| INBOX-06 | P1: Ver e manter a caixa | T12 | Implementing |
| INBOX-07 | P1: Ver e manter a caixa | T23 | Implementing |
| QUICK-01 | P1: Enviar rápido | T24 | Implementing |
| QUICK-02 | P1: Enviar rápido | T12, T24 | Implementing |
| QUICK-03 | P1: Enviar rápido | T24 | Implementing |
| QUICK-04 | P1: Enviar rápido | T13, T24 | Implementing |
| QUICK-05 | P1: Enviar rápido | T12, T24 | Implementing |
| QUICK-06 | P1: Enviar rápido | T13, T24 | Implementing |
| QUICK-07 | P1: Enviar rápido | T13, T24 | Implementing |
| QUICK-08 | P1: Enviar rápido | T24 | Implementing |
| QUICK-09 | P1: Enviar rápido | T24 | Implementing |
| PROC-01 | P1: Processar como tarefa | T26 | Implementing |
| PROC-02 | P1: Processar como tarefa | T26 | Implementing |
| PROC-03 | P1: Processar como tarefa | T11, T26 | Implementing |
| PROC-04 | P1: Processar como tarefa | T11, T26 | Implementing |
| PROC-05 | P1: Processar como tarefa | T13, T26 | Implementing |
| PROC-06 | P1: Processar como tarefa | T13, T26 | Implementing |
| PROC-07 | P1: Processar como tarefa | T13, T26 | Implementing |
| PROC-08 | P1: Processar como tarefa | T13, T26 | Implementing |
| ALL-01 | P1: Processar tudo | T27 | Implementing |
| ALL-02 | P1: Processar tudo | T27 | Implementing |
| ALL-03 | P1: Processar tudo | T27 | Implementing |
| ALL-04 | P1: Processar tudo | T27 | Implementing |
| ALL-05 | P1: Processar tudo | T27 | Implementing |
| ALL-06 | P1: Processar tudo | T14 | Implementing |
| ALL-07 | P1: Processar tudo | T14 | Implementing |
| ALL-08 | P1: Processar tudo | T27 | Implementing |
| ALL-09 | P1: Processar tudo | T14 | Implementing |
| REM-01 | P1: Lembrete | T13, T26 | Implementing |
| REM-02 | P1: Lembrete | T1, T2, T11, T26 | Implementing |
| REM-03 | P1: Lembrete | T18 | Implementing |
| REM-04 | P1: Lembrete | T5 | Implementing |
| REM-05 | P1: Lembrete | T5, T32 | Implementing |
| REM-06 | P1: Lembrete | T5, T28 | Implementing |
| GRP-01 | P1: Grupo de tarefas | T7, T13 | Implementing |
| GRP-02 | P1: Grupo de tarefas | T11, T26 | Implementing |
| GRP-03 | P1: Grupo de tarefas | T11, T26 | Implementing |
| GRP-04 | P1: Grupo de tarefas | T7, T20, T33 | Implementing |
| GRP-05 | P1: Grupo de tarefas | T20 | Implementing |
| GRP-06 | P1: Grupo de tarefas | T8, T21 | Implementing |
| GRP-07 | P1: Grupo de tarefas | T8, T21 | Implementing |
| GRP-08 | P1: Grupo de tarefas | T8, T21 | Implementing |
| GRP-09 | P1: Grupo de tarefas | T9, T21 | Implementing |
| GRP-10 | P1: Grupo de tarefas | T8, T21 | Implementing |
| GRP-11 | P1: Grupo de tarefas | T8 | Implementing |
| PRI-01 | P1: Prioridade | T1, T2 | Implementing |
| PRI-02 | P1: Prioridade | T17 | Implementing |
| PRI-03 | P1: Prioridade | T17 | Implementing |
| PRI-04 | P1: Prioridade | T17 | Implementing |
| DUE-01 | P1: Prazo | T1, T2 | Implementing |
| DUE-02 | P1: Prazo | T17 | Implementing |
| DUE-03 | P1: Prazo | T17 | Implementing |
| DUE-04 | P1: Prazo | T17 | Implementing |
| DUE-05 | P1: Prazo | T17 | Implementing |
| WAIT-01 | P1: Aguardando | T1, T2 | Implementing |
| WAIT-02 | P1: Aguardando | T18 | Implementing |
| WAIT-03 | P1: Aguardando | T2 | Implementing |
| WAIT-04 | P1: Aguardando | T4 | Implementing |
| WAIT-05 | P1: Aguardando | T2 | Implementing |
| FLAG-01 | P1: Flag | T1, T2 | Implementing |
| FLAG-02 | P1: Flag | T18 | Implementing |
| FLAG-03 | P1: Flag | T18 | Implementing |
| FLAG-04 | P1: Flag | T2 | Implementing |
| FLAG-05 | P1: Flag | T3 | Implementing |
| FLAG-06 | P1: Flag | T2 | Implementing |
| FIELDS-01 | P1: Campos do card | T18 | Implementing |
| FIELDS-02 | P1: Campos do card | T19 | Implementing |
| FIELDS-03 | P1: Campos do card | T10 | Implementing |
| FIELDS-04 | P1: Campos do card | T10, T19 | Implementing |
| FIELDS-05 | P1: Campos do card | T18 | Implementing |
| FIELDS-06 | P1: Campos do card | T18 | Implementing |
| MODAL-01 | P1: Modal da tarefa | T22 | Implementing |
| MODAL-02 | P1: Modal da tarefa | T22 | Implementing |
| MODAL-03 | P1: Modal da tarefa | T22 | Implementing |
| MODAL-04 | P1: Modal da tarefa | T7, T8, T22 | Implementing |
| MODAL-05 | P1: Modal da tarefa | T22 | Implementing |
| MODAL-06 | P1: Modal da tarefa | T22 | Implementing |
| API-01 | P2: API e MCP | T4, T6, T16 | Implementing |
| API-02 | P2: API e MCP | T6 | Implementing |
| API-03 | P2: API e MCP | T2, T6 | Implementing |
| EDGE-01 | Edge Cases | T13 | Implementing |
| EDGE-02 | Edge Cases | T14 | Implementing |
| EDGE-03 | Edge Cases | T12 | Implementing |
| EDGE-04 | Edge Cases | T3 | Implementing |
| EDGE-05 | Edge Cases | T20 | Implementing |
| EDGE-06 | Edge Cases | T18 | Implementing |
| EDGE-07 | Edge Cases | T12 | Implementing |
| EDGE-08 | Edge Cases | T15 | Implementing |

**Coverage:** 103 total, 103 mapped to tasks, 0 unmapped.

---

## Implicit-Requirement Sweep

| Dimension | Landing |
| --- | --- |
| Input validation & bounds | CAP-02, CAP-03, QUICK-05, QUICK-07, PRI-01, WAIT-01, FLAG-01, REM-02, API-03 |
| Failure / partial-failure states | QUICK-04, PROC-05, PROC-08, ALL-06, ALL-07 (envio numa transação, tudo ou nada) |
| Idempotency / retry / duplicate handling | EDGE-01 (um item vira uma tarefa só) |
| Auth boundaries & rate limits | INBOX-03, CAP-10, QUICK-06, Assumptions "Quem captura e quem envia"; rate limit N/A because a captura usa o limite já aplicado às rotas autenticadas |
| Concurrency / ordering | EDGE-01, ALL-07, GRP-06, GRP-09 |
| Data lifecycle / expiry | INBOX-06, ALL-08, EDGE-08, FLAG-05 |
| Observability | N/A because a feature não adiciona processo em segundo plano; os erros seguem o log das rotas |
| External-dependency failure | CAP-08 (o sistema operacional recusa o atalho) |
| State-transition integrity | FLAG-05, WAIT-05, GRP-05, GRP-10, REM-04, PROC-06 |

---

## Success Criteria

- [ ] Um item capturado pelo atalho global do desktop, com outro app na frente, chega à caixa em menos de 2 segundos.
- [ ] Processar uma caixa de 10 itens pelo Processar tudo não exige abrir o quadro nem recarregar a página.
- [ ] Nenhum envio deixa a caixa e o quadro discordando: todo item enviado some da caixa e aparece no quadro, ou nada muda.
- [ ] Com os quatro campos desligados, o card é igual ao de hoje.
