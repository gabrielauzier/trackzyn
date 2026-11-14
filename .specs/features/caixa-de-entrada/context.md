# Caixa de entrada Context

**Gathered:** 2026-11-13
**Spec:** `.specs/features/caixa-de-entrada/spec.md`
**Status:** Implementada e verificada (2026-11-14)

---

## Feature Boundary

Trazer o fluxo GTD do Notion para o Trackzyn: capturar qualquer coisa em um segundo, sem decidir nada, numa **Caixa de entrada**; depois **processar** cada item, que vira uma **tarefa**, um **lembrete** ou um **grupo de tarefas** dentro de uma lista e segue o quadro de sempre (Backlog, Esta semana, Hoje, Concluídas).

Entram também os campos que o processamento pede e o quadro ainda não tem: **prioridade**, **prazo** a marca **Aguardando** e a **flag**.

Fica para a fase 2: a página **Tarefas** com as visões transversais do Notion (Pendentes, A fazer, Concluídas, Atrasadas, Sem prazo, Aguardando).

---

## Mapeamento Notion → Trackzyn

| Notion | Trackzyn |
| --- | --- |
| Database com 7 views | Caixa de entrada (fase 1) + página Tarefas com visões (fase 2) |
| Inbox | Caixa de entrada: itens sem lista |
| Category (obrigatória para sair da Inbox) | Lista |
| Project | Grupo de tarefas (entidade nova, dentro de uma lista) |
| Status In progress / Doing | Colunas Esta semana e Hoje |
| Status Paused | **Flag** no card, com motivo opcional (conceito mais amplo que pausada) |
| Status Review | Não entra (o usuário dispensou) |
| Status Delegated | Marca **Aguardando** no card, com "de quem" |
| Status Done | Coluna Concluídas |
| Status Trash | **Descartar** da Caixa de entrada (lixeira de 30 dias) |
| Priority None/Low/Medium/High/Ultra | Prioridade Nenhuma/Baixa/Média/Alta/Ultra |
| Due | Prazo (campo novo, separado do agendamento) |
| XP | Não entra |

---

## Implementation Decisions

### Captura

- Capturar pede só o texto. Nada de lista, data ou prioridade: decidir é o trabalho do processamento.
- Pontos de captura: atalho global dentro do app, botão na barra lateral, paleta de comandos, atalho global do app desktop (abre uma janelinha de captura), e a ferramenta do MCP / API com token.
- Cada item guarda de onde veio (app, desktop, MCP, API) e quando chegou.

### Caixa de entrada

- Item na barra lateral com o contador de itens pendentes.
- A tela lista os itens do mais antigo para o mais novo, com campo de captura no topo.
- Duas abas, como no Notion: **Atuais** e **Lixeira**.

### Processamento rápido na lista da caixa

- Cada item da caixa tem, na própria linha, um select de **Lista** e um campo de **Estimativa** (`HH:MM`).
- Com a lista escolhida, aparece o botão **Enviar**: o item vira **tarefa** no **Backlog** da lista, com a estimativa se houver, e sai da caixa. Sem lista, o botão não aparece.
- O nome é o texto capturado. Para escolher tipo, prioridade, prazo, agendamento ou coluna, usa-se **Processar**.
- O item inteiro é clicável e abre o Processar; não há botão "Processar" na linha. No hover, a borda fica em destaque e o título ganha sublinhado. Os controles da linha (Lista, Estimativa, Enviar, Descartar) ficam por cima e não abrem o Processar; sobre eles, o destaque da linha some. Pelo teclado, o título é o link e o foco contorna a linha.
- A lista e a estimativa escolhidas na linha ficam salvas no item até ele ser enviado (sobrevivem a recarregar a página) e vêm preenchidas ao abrir Processar.

### Processar um item

- Para sair da caixa: **Nome** e **Lista** obrigatórios (Lista = Category do Notion).
- O item vira um de três tipos: **Tarefa**, **Lembrete** ou **Grupo**.
- Opcionais: prioridade, prazo, estimativa (só tarefa), agendar (dia e hora), notas.
- Coluna de destino: sem data agendada → **Backlog** (pedido do usuário). Agendada para hoje → **Hoje**; para esta semana → **Esta semana**; mais tarde → **Backlog** (o agendamento já leva a tarefa para Hoje no dia). O usuário pode trocar a coluna antes de salvar.
- Modo **Processar tudo**: abre o primeiro item; **Salvar e próximo** só guarda a decisão (rascunho) e abre o próximo. Nada sai da caixa até a revisão.
- **Revisão** no fim: lista cada item com tipo, prioridade, destino (lista › coluna ou Lixeira) e detalhes; um clique volta ao formulário do item para corrigir. Ao lado, o que cada lista ganha por coluna, com as estimativas, e quanto Hoje cresce.
  - **Confirmar e enviar** envia tudo de uma vez; os pulados ficam na caixa.
  - **Terminar depois** (ou fechar) guarda o rascunho; ao voltar, o Processar tudo continua de onde parou.
  - Processar um item avulso (botão Processar da linha ou Enviar rápido) envia na hora, sem revisão.
- Também dá para **Descartar** (vai para a Lixeira) ou **Concluir na hora** (a regra dos 2 minutos do GTD: vira tarefa já em Concluídas).

### Lembrete (tipo novo de tarefa)

- É uma tarefa leve: sem estimativa e sem foco. Fecha como qualquer tarefa, movida para Concluídas; o card não tem checkbox.
- Fica no quadro da lista com card compacto.
- Com data, vai para Hoje no dia (mesma regra do agendamento). Com horário, aparece na Agenda como marcador, sem bloco de duração.
- Sem notificação nesta fase.

### Grupo de tarefas (entidade nova)

- Pertence a uma lista; tem nome, notas, prioridade e prazo.
- As tarefas do grupo são tarefas de verdade: foco, agenda, estimativa, planejamento.
- No quadro, o grupo é um **contêiner**, como os do Jira: um bloco cinza com o nome do grupo e a contagem de tarefas no topo. Dentro dele ficam os cards das tarefas, com os mesmos campos e ações de um card avulso.
- Cada tarefa do grupo tem a sua coluna. O contêiner aparece em toda coluna que tem pelo menos uma tarefa do grupo e some de uma coluna quando a última tarefa sai dela.
- Arrastar uma tarefa:
  - solta dentro do contêiner: reordena dentro do grupo;
  - solta no contêiner do mesmo grupo em outra coluna: muda de coluna e continua no grupo;
  - solta na coluna, fora do contêiner: muda de coluna (se for o caso) e sai do grupo.
- Ao processar como grupo, o usuário já digita as primeiras tarefas (a "próxima ação" do GTD).

### Prioridade

- Cinco níveis: Nenhuma (padrão), Baixa, Média, Alta, Ultra. Ultra é para emergência.
- No card, a prioridade é um ícone, sem texto (nome no tooltip e no leitor de tela): Baixa = seta para baixo (azul), Média = dois traços (amarelo), Alta = seta para cima (laranja), Ultra = seta dupla para cima (vermelho). Nenhuma não mostra nada.
- Vale para tarefa, lembrete e grupo.

### Prazo

- Campo novo, separado do agendamento: agendada = quando vou fazer; prazo = até quando precisa estar pronto.
- Card mostra o prazo (ampulheta): neutro; amarelo em "Prazo amanhã" e "Prazo hoje"; vermelho em "Atrasada · <dia>" quando passou e a tarefa não está em Concluídas. Em Concluídas nunca fica vermelho.

### Aguardando

- Marca no card, não coluna: a tarefa continua na coluna onde está.
- Pede "de quem" (texto livre, opcional).
- No card: chip com ícone de pessoa, "Aguardando · <de quem>".

### Flag

- Substitui o status Pausada por um conceito mais amplo: um sinal de que a tarefa precisa de atenção, por qualquer motivo (pausada, bloqueada, dúvida, risco).
- Motivo opcional, em texto livre; sem motivo, o card mostra "Flag sem motivo".
- Pôr e tirar a flag a qualquer momento; tirar a flag apaga o motivo.
- Não muda a coluna e é independente da prioridade e do Aguardando: uma tarefa pode ter flag e estar aguardando.
- A borda vermelha do card é exclusiva da tarefa com flag. O motivo aparece abaixo do título, com o ícone de bandeira vermelha.
- Para não confundir com a bandeira nem com o agendamento (que já usa calendário e relógio), o prazo usa ícone de **ampulheta**.

### Campos do card configuráveis (regra para o quadro daqui em diante)

- O card sempre mostra **nome**, **estimativa** e **tempo registrado**.
- Todo campo novo no card só aparece quando ligado na configuração do quadro. Nesta feature: **Prioridade**, **Prazo**, **Flag** e **Aguardando**. Campos futuros entram na mesma lista.
- A configuração abre por um botão de engrenagem na barra do quadro, num popover igual ao de **Sons** da tela de foco (`frontend/src/components/focus/sound-settings.tsx`): título "Campos do card", um switch por campo e a nota de que nome, estimativa e tempo registrado aparecem sempre.
- Desligar um campo só esconde no card. O dado continua salvo, editável no painel da tarefa e no processamento. Com a Flag desligada, a borda vermelha também some.
- Tipos de card (lembrete, contêiner de grupo) não são campos: aparecem sempre.

### Ordem no card

- Título → linha da flag (motivo) → chips (prazo, aguardando) → linha de baixo: ícone da prioridade, estimativa, agendamento e, à direita, o tempo registrado → "via" → subtarefas. Catálogo de estados: artboard 6 do canvas de design.

### Modal de tarefa (`components/board/task-dialog.tsx`)

- Mostra sempre todos os campos, mesmo os desligados em Campos do card: a configuração só vale para o card.
- Topo: chip com a lista e a coluna, e o "via" (já existe).
- Ordem: Título → Flag → Prioridade e Estimativa → Prazo e Grupo → Aguardando → Anotações → rodapé (Excluir, Cancelar, Salvar) → Agendamento e Subtarefas (como hoje, salvos na hora).
- Flag: com flag, um bloco com borda vermelha, o campo de motivo e "Tirar flag"; sem flag, um botão "+ Flag" no mesmo lugar.
- Aguardando: um switch; ligado, abre o campo "De quem".
- Grupo: select com os grupos da lista e "Sem grupo". Trocar o grupo aqui é o mesmo que arrastar a tarefa para dentro ou para fora do contêiner.
- Os campos novos entram no formulário e são salvos com Salvar, como título, estimativa e anotações.

### Agent's Discretion

- Atalho de captura dentro do app e no desktop.
- Ordem dos itens na caixa (padrão: mais antigo primeiro, o GTD processa em ordem de chegada).

---

## Open Questions

Todas decididas pelo usuário em 2026-11-13 e registradas em `spec.md` (Assumptions):

1. ~~Tarefa do grupo em outra coluna~~ — o contêiner aparece em cada coluna com tarefa do grupo.
2. ~~Arrastar o contêiner inteiro~~ — sim: move todas as tarefas do grupo daquela coluna.
3. ~~Grupo sem tarefas abertas~~ — toast `<grupo> está sem próxima ação` com `Adicionar tarefa`, sem bloquear.
4. ~~Caixa pessoal ou do workspace~~ — pessoal.
5. ~~Onde a configuração de campos fica salva~~ — no servidor, por usuário e por lista; os quatro campos nascem ligados.
6. ~~Flag ao concluir~~ — sai sozinha.
7. ~~Aguardando conta no planejamento?~~ — não entra nas somas de estimativa das colunas nem na pendente de Hoje.
8. ~~Atalho global no desktop~~ — exceção ao WIDGET-05 só para a captura, ligável e trocável.

---

## Assumptions

- Lixeira guarda o item 30 dias e permite restaurar.
- Lembrete não entra nos relatórios de tempo (não tem foco).
- Itens capturados pelo MCP usam um escopo de token novo (`inbox:create`).

---

## Deferred Ideas

- Fase 2: página **Tarefas** com as visões Pendentes, A fazer, Concluídas, Atrasadas, Sem prazo e Aguardando, juntando todas as listas.
- Notificação de lembrete no horário.
- Captura pelo app mobile e por e-mail.
- Status Review.
