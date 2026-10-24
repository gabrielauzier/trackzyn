# Listas e quadro Specification

## Problem Statement

O trackzyn ainda é só a base do launchkit: não tem onde registrar uma tarefa, estimar quanto tempo ela leva nem organizar o que fazer hoje, nesta semana ou depois. Quem quer planejar o dia e medir o próprio tempo usa outra ferramenta (o Blitzit, nos prints em `docs/design/inspiracao/`). Esta feature é a base das outras três: o foco, o widget e os relatórios trabalham sobre as listas e as tarefas criadas aqui.

## Goals

- [ ] O usuário cria uma lista, adiciona tarefas com estimativa e as organiza nas colunas Backlog, Esta semana, Hoje e Concluídas.
- [ ] O quadro mostra, em cada coluna, a soma das estimativas pendentes e o progresso `x/y Concluídas`, com os mesmos números do print `02-quadro.png`.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Plano, cobrança, `Account & Billing` | O trackzyn é self-hosted e não cobra. |
| Busca global, grade de apps e integrações, `Shortcuts`, `Report a Bug`, ajuda e chat | Aparecem nos prints, mas não foram pedidos. |
| Indicação de qual membro está focando uma tarefa | Decisão do usuário: o foco é individual. |
| Tarefas recorrentes, prazos e lembretes | Não aparecem na fonte. |
| Mover tarefas sozinho na virada do dia | Decisão do usuário: as tarefas de Hoje continuam em Hoje. |
| Foco, cronômetro e sons | Feature `foco-e-sons`. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| O que é uma lista | Tabela nova dentro do workspace; um workspace tem várias listas | Decisão do usuário; com o workspace como lista, `X-Workspace-Id` limitaria cada requisição a uma lista e "Todas as listas" ficaria difícil | y |
| Selo da lista | Inicial do nome em maiúscula sobre uma cor escolhida entre as 8 cores `--chart-1` a `--chart-8` | Decisão do usuário (inicial + cor de uma paleta fixa); a paleta é a que o projeto já valida para daltonismo | y |
| Ordem das listas na home | Arrastável; uma lista nova entra no fim | Decisão do usuário | y |
| Prévia no cartão de lista | As 4 próximas de Hoje; se faltarem, completa com Esta semana e depois Backlog; linhas vazias completam até 4 | Decisão do usuário | y |
| Histórico da coluna Concluídas | Só hoje e o último dia anterior que teve alguma conclusão | Decisão do usuário | y |
| Contador da coluna Concluídas | `N tarefas hoje` | Decisão do usuário | y |
| Intervalos na coluna Concluídas | Não aparecem; ficam só nos relatórios | Decisão do usuário | y |
| Início da semana | Segunda-feira | Decisão do usuário | y |
| Papel `viewer` | Só vê as listas e o quadro; toda escrita responde 403 `Read-only role` | Decisão do usuário; é o comportamento de `requireWrite` | y |
| Limites | Nome de lista 1–100 caracteres; título de tarefa 1–255; estimativa opcional de 1–1440 min; anotações até 10 000 caracteres; subtarefa 1–255 | Decisão do usuário | y |
| Excluir tarefa ou lista | Apaga junto o tempo registrado nela; arquivar mantém | Decisão do usuário | y |
| Virada do dia | Tarefas pendentes de Hoje continuam em Hoje | Decisão do usuário | y |
| Quadro no celular | Abaixo de 768px, uma coluna por vez, com abas no topo | Decisão do usuário | y |
| Saudação | `Boa madrugada` 00:00–04:59, `Bom dia` 05:00–11:59, `Boa tarde` 12:00–17:59, `Boa noite` 18:00–23:59, com o `display_name` das preferências ou a parte do e-mail antes do `@` | Decisão do usuário (faixas); `preferences.display_name` já existe | y |
| Frases do subtítulo da saudação | Madrugada: "Focando enquanto o mundo dorme." / "Focusing while the world sleeps."; manhã: "Comece pelo que mais importa." / "Start with what matters most."; tarde: "Uma tarefa de cada vez." / "One task at a time."; noite: "Hora de fechar o dia com calma." / "Time to wrap up the day calmly." | O usuário pediu uma frase por período e aprovou estas | y |
| Duas pessoas reordenam a mesma coluna ao mesmo tempo | A última gravação vence | Decisão do usuário | y |
| Fuso que define "hoje", "semana" e o período da saudação | `workspaces.timezone`; se nulo, o fuso da aplicação (`applicationTimezone()`) | Fato do código: o workspace já tem coluna de fuso e a aplicação tem um fuso configurável | y |
| Rótulo do botão de foco | `Focar agora` / `Focus now` | Decisão do usuário | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Listas na home ⭐ MVP

**User Story**: Como usuário, quero criar e organizar listas na home para separar meus contextos de trabalho.

**Why P1**: Toda tarefa pertence a uma lista; sem listas, nada mais funciona.

**Acceptance Criteria**:

1. WHEN um workspace sem listas abre `/` THEN the trackzyn SHALL mostrar em `Suas listas` só o cartão tracejado `Criar lista`, e no menu lateral `Criar nova lista`, `Todas as minhas listas` (selecionado) e `Listas arquivadas`. (LIST-01)
2. WHEN a home abre THEN the trackzyn SHALL mostrar no título a saudação do período no fuso do workspace seguida do `display_name`, ou da parte do e-mail antes do `@`, e a frase de subtítulo desse período. (LIST-02)
3. WHEN o usuário cria uma lista com nome de 1 a 100 caracteres e uma das 8 cores THEN the trackzyn SHALL mostrar no fim da grade um cartão com o selo (inicial maiúscula na cor), o nome, o menu `⋮`, 4 linhas de prévia e o rodapé `N tarefas pendentes`. (LIST-03)
4. IF o nome da lista está vazio ou passa de 100 caracteres THEN the trackzyn SHALL responder 422 no formato de erro de validação que já existe e manter o diálogo aberto com a mensagem. (LIST-04)
5. WHEN a lista tem tarefas pendentes THEN the trackzyn SHALL preencher as 4 linhas de prévia com as primeiras de Hoje, depois Esta semana, depois Backlog, deixando vazias as linhas que sobrarem. (LIST-05)
6. WHEN o usuário arrasta um cartão de lista para outra posição THEN the trackzyn SHALL manter a nova ordem depois de recarregar a página. (LIST-06)
7. WHEN o usuário renomeia uma lista ou troca a cor pelo menu `⋮` THEN the trackzyn SHALL atualizar o cartão e o selo com os novos valores. (LIST-07)
8. WHEN o usuário arquiva uma lista pelo menu `⋮` THEN the trackzyn SHALL tirá-la de `Todas as minhas listas` e mostrá-la em `Listas arquivadas` com a ação `Desarquivar`, mantendo as tarefas e o tempo registrado. (LIST-08)
9. WHEN o usuário confirma a exclusão de uma lista no diálogo de confirmação que já existe, que mostra o nome da lista, THEN the trackzyn SHALL apagar a lista, as tarefas, as subtarefas e as sessões dela, e `GET /api/lists/:id` SHALL responder 404. (LIST-09)
10. WHILE o usuário tem papel `viewer` no workspace the trackzyn SHALL esconder criar, renomear, reordenar, arquivar e excluir, e responder 403 `Read-only role` a essas escritas feitas direto na API. (LIST-10)
11. IF uma requisição pede uma lista de outro workspace THEN the trackzyn SHALL responder 404. (LIST-11)

**Independent Test**: Criar duas listas, reordenar, arquivar uma, desarquivar, excluir a outra, e entrar como `viewer` para ver que nada disso aparece.

---

### P1: Quadro da lista ⭐ MVP

**User Story**: Como usuário, quero ver as tarefas de uma lista em quatro colunas, com estimativas e progresso, para decidir o que fazer hoje e nesta semana.

**Why P1**: É onde a tarefa é planejada, e de onde o foco começa.

**Acceptance Criteria**:

1. WHEN o usuário abre uma lista THEN the trackzyn SHALL mostrar `Voltar`, o seletor de lista com o selo, o resumo `Esta lista tem N tarefas pendentes, Est.: <soma das estimativas pendentes>` e as colunas `Backlog`, `Esta semana`, `Hoje` e `Concluídas`, nessa ordem. (BOARD-01)
2. WHEN `Backlog`, `Esta semana` ou `Hoje` não tem tarefa pendente THEN the trackzyn SHALL mostrar na coluna o ícone de check e o texto `Tudo limpo`. (BOARD-02)
3. WHEN o usuário arrasta uma tarefa para outra posição ou coluna THEN the trackzyn SHALL manter a nova ordem e a nova coluna depois de recarregar a página. (BOARD-03)
4. The trackzyn SHALL mostrar no cabeçalho de `Hoje` a soma das estimativas pendentes de Hoje e a barra `x/y Concluídas`, com x = tarefas da lista concluídas hoje e y = x + pendentes de Hoje. (BOARD-04)
5. The trackzyn SHALL mostrar no cabeçalho de `Esta semana` a soma das estimativas pendentes de Esta semana e de Hoje e a barra `x/y Concluídas`, com x = tarefas da lista concluídas desde a segunda-feira corrente e y = x + pendentes de Esta semana e de Hoje; com 11 concluídas na semana, 0 hoje e 1 pendente em Hoje, as barras SHALL mostrar `11/12` e `0/1`. (BOARD-05)
6. The trackzyn SHALL numerar os cartões de `Hoje` a partir de `1`, na ordem da coluna. (BOARD-06)
7. WHEN o usuário conclui uma tarefa pelo check do cartão ou arrastando-a para `Concluídas` THEN the trackzyn SHALL mostrá-la em `Concluídas`, riscada, sob o dia da conclusão, com o tempo total gasto. (BOARD-07)
8. WHEN o usuário arrasta uma tarefa de `Concluídas` para outra coluna THEN the trackzyn SHALL limpar a conclusão e contar a tarefa de novo como pendente, mantendo o tempo já gasto. (BOARD-08)
9. The trackzyn SHALL mostrar em `Concluídas` só as tarefas concluídas hoje e as do último dia anterior que teve alguma conclusão, agrupadas por dia com o cabeçalho `<dia da semana>, <data>` e `N tarefas`, e o cabeçalho da coluna `N tarefas hoje`. (BOARD-09)
10. The trackzyn SHALL deixar os intervalos fora da coluna `Concluídas`. (BOARD-10)
11. WHEN o usuário troca de lista no seletor THEN the trackzyn SHALL mostrar o quadro da outra lista sem passar pela home. (BOARD-11)
12. WHILE `Hoje` tem ao menos uma tarefa pendente the trackzyn SHALL mostrar habilitado, no rodapé de `Hoje`, o botão `Focar agora`. (BOARD-12)
13. WHILE `Hoje` não tem tarefa pendente the trackzyn SHALL mostrar `Focar agora` desabilitado. (BOARD-13)
14. WHILE a largura da tela é menor que 768px the trackzyn SHALL mostrar uma coluna por vez, com as abas `Backlog`, `Esta semana`, `Hoje` e `Concluídas` no topo. (BOARD-14)
15. WHILE o usuário tem papel `viewer` the trackzyn SHALL impedir adicionar, mover, editar, concluir e focar, e responder 403 `Read-only role` a essas escritas na API. (BOARD-15)
16. WHEN o dia muda no fuso do workspace THEN the trackzyn SHALL manter em `Hoje` as tarefas pendentes que estavam lá. (BOARD-16)

**Independent Test**: Com tarefas nas quatro colunas, conferir as somas, as barras `x/y`, o `Tudo limpo`, a coluna Concluídas com dois dias e as abas numa janela de 375px.

---

### P1: Tarefas, subtarefas e anotações ⭐ MVP

**User Story**: Como usuário, quero criar tarefas com estimativa, anotações e subtarefas para saber o que fazer e quanto tempo reservar.

**Why P1**: A estimativa é o que o cronômetro do foco conta para trás.

**Acceptance Criteria**:

1. WHEN o usuário adiciona uma tarefa numa coluna, com título de 1 a 255 caracteres e estimativa opcional de 1 a 1440 minutos, THEN the trackzyn SHALL mostrar o cartão no fim da coluna com o título, a estimativa (`1h`, `1h 27min`) e o tempo gasto `0min`. (TASK-01)
2. IF o título está vazio ou passa de 255 caracteres, ou a estimativa está fora de 1–1440, THEN the trackzyn SHALL responder 422 e manter o formulário com a mensagem. (TASK-02)
3. WHEN o usuário abre um cartão THEN the trackzyn SHALL mostrar um diálogo que edita título, estimativa, anotações (até 10 000 caracteres) e subtarefas. (TASK-03)
4. IF as anotações passam de 10 000 caracteres THEN the trackzyn SHALL responder 422 e não salvar. (TASK-04)
5. WHEN o usuário confirma a exclusão de uma tarefa no diálogo de confirmação que já existe THEN the trackzyn SHALL apagar a tarefa, suas subtarefas e suas sessões, e `GET /api/tasks/:id` SHALL responder 404. (TASK-05)
6. WHEN uma tarefa tem subtarefas THEN the trackzyn SHALL mostrar no cartão `x/y Subtarefas`, um `+` para adicionar e uma seta que abre a lista de subtarefas, que podem ser marcadas. (TASK-06)
7. IF o título de uma subtarefa está vazio ou passa de 255 caracteres THEN the trackzyn SHALL responder 422. (TASK-07)
8. The trackzyn SHALL manter cada tarefa na coluna `done` exatamente quando ela tem `completed_at` preenchido. (TASK-08)

**Independent Test**: Criar uma tarefa sem estimativa e outra com 90 min, editar anotações, adicionar 3 subtarefas e marcar uma, e excluir a tarefa.

---

## Edge Cases

- IF dois usuários reordenam a mesma coluna ao mesmo tempo THEN the trackzyn SHALL gravar uma ordem sem posições repetidas, e a última gravação SHALL ser a que aparece depois de recarregar.
- IF uma requisição usa um id que não é UUID THEN the trackzyn SHALL responder 422 no formato de validação que já existe.
- WHEN a lista não tem nenhuma tarefa THEN the trackzyn SHALL mostrar `Tudo limpo` nas três colunas de pendentes, `0 tarefas hoje` em `Concluídas`, e o resumo `Esta lista tem 0 tarefas pendentes, Est.: 0min`.
- WHEN o modo local do desktop exporta e importa os dados THEN the trackzyn SHALL restaurar listas, tarefas e subtarefas com as mesmas contagens e os mesmos ids.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| LIST-01 | P1: Listas na home | Tasks | In Tasks |
| LIST-02 | P1: Listas na home | Tasks | In Tasks |
| LIST-03 | P1: Listas na home | Tasks | In Tasks |
| LIST-04 | P1: Listas na home | Tasks | In Tasks |
| LIST-05 | P1: Listas na home | Tasks | In Tasks |
| LIST-06 | P1: Listas na home | Tasks | In Tasks |
| LIST-07 | P1: Listas na home | Tasks | In Tasks |
| LIST-08 | P1: Listas na home | Tasks | In Tasks |
| LIST-09 | P1: Listas na home | Tasks | Implementing |
| LIST-10 | P1: Listas na home | Tasks | In Tasks |
| LIST-11 | P1: Listas na home | Tasks | In Tasks |
| BOARD-01 | P1: Quadro da lista | Tasks | In Tasks |
| BOARD-02 | P1: Quadro da lista | Tasks | In Tasks |
| BOARD-03 | P1: Quadro da lista | Tasks | In Tasks |
| BOARD-04 | P1: Quadro da lista | Tasks | In Tasks |
| BOARD-05 | P1: Quadro da lista | Tasks | In Tasks |
| BOARD-06 | P1: Quadro da lista | Tasks | In Tasks |
| BOARD-07 | P1: Quadro da lista | Tasks | In Tasks |
| BOARD-08 | P1: Quadro da lista | Tasks | In Tasks |
| BOARD-09 | P1: Quadro da lista | Tasks | In Tasks |
| BOARD-10 | P1: Quadro da lista | Tasks | In Tasks |
| BOARD-11 | P1: Quadro da lista | Tasks | In Tasks |
| BOARD-12 | P1: Quadro da lista | Tasks | In Tasks |
| BOARD-13 | P1: Quadro da lista | Tasks | In Tasks |
| BOARD-14 | P1: Quadro da lista | Tasks | In Tasks |
| BOARD-15 | P1: Quadro da lista | Tasks | In Tasks |
| BOARD-16 | P1: Quadro da lista | Tasks | In Tasks |
| TASK-01 | P1: Tarefas, subtarefas e anotações | Tasks | In Tasks |
| TASK-02 | P1: Tarefas, subtarefas e anotações | Tasks | In Tasks |
| TASK-03 | P1: Tarefas, subtarefas e anotações | Tasks | In Tasks |
| TASK-04 | P1: Tarefas, subtarefas e anotações | Tasks | In Tasks |
| TASK-05 | P1: Tarefas, subtarefas e anotações | Tasks | Implementing |
| TASK-06 | P1: Tarefas, subtarefas e anotações | Tasks | In Tasks |
| TASK-07 | P1: Tarefas, subtarefas e anotações | Tasks | In Tasks |
| TASK-08 | P1: Tarefas, subtarefas e anotações | Tasks | Implementing |

**Coverage:** 35 total, 35 mapped to tasks, 0 unmapped

---

## Success Criteria

- [ ] Um usuário novo cria uma lista, adiciona 3 tarefas com estimativa, move uma para Hoje e conclui outra sem recarregar a página.
- [ ] As barras `x/y Concluídas` e as somas de estimativa batem com uma contagem manual em todos os casos dos critérios BOARD-04 e BOARD-05.
