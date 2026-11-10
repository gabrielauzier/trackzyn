# Agendamento de tarefas

Início: 2026-11-06 · Branch de referência: `feat/leva-melhorias-30-34` · Issue de origem: #6 (citada no escopo da Agenda)

**Design aprovado (2026-11-07):** https://claude.ai/artifact/3PBEaM4xuqa4e2iB74KGnX

## Contexto

O menu de ações rápidas do card lista `Agendar`, mas a tarefa não tem data: `tasks` só tem `column` (`backlog`, `this_week`, `today`, `done`) e `position` (`backend-node/src/db/schema.ts`). A ação ficou fora do primeiro lote do menu (`frontend/src/components/board/task-card-menu.tsx`).

O que o código e as decisões anteriores já fixam:

- **Fuso:** "hoje" e "semana" seguem `workspaces.timezone`, ou o fuso da aplicação se ele for nulo. A semana vai de segunda a domingo (spec `listas-e-quadro`, AD-004).
- **Sem worker no modo local:** o desktop roda em PGlite, sem Redis, scheduler nem worker. O foco resolve o tempo "liquidando na leitura" (AD-001). Um job agendado não funcionaria lá.
- **Virada do dia:** as pendentes de Hoje continuam em Hoje, e "mover tarefas sozinho na virada do dia" está fora do escopo de `listas-e-quadro`. Mover para Hoje pela data é uma exceção a essa regra (D1).
- **A Agenda:** `/agenda` é uma grade semanal estilo Google Agenda, de 00h a 23h59, que mostra as sessões de foco já feitas. O passo do arraste é de 15 min, e o tempo depois de agora aparece hachurado e não aceita arraste (AGENDA-23). A spec da Agenda deixou "agendamento ou planejamento de tarefas" para a issue #6, que é esta.
- **Outros clientes:** a API com tokens `tkz_`, as ferramentas MCP (`create_task`, `update_task`, `get_board`, `get_task`) e o app mobile leem a tarefa. Os campos novos aparecem no contrato de todos eles.

## Proposta de escopo

### Dentro

1. **Modelo:** a tarefa ganha um agendamento opcional, com dia e, se quiser, hora de início. Migração, schema, `POST`/`PATCH` e leituras do quadro e da Agenda.
2. **Card:** `Agendar` no menu `⋮`, com os atalhos de dia e um seletor de data com hora opcional.
3. **Diálogo da tarefa:** o mesmo seletor, com a opção de limpar.
4. **Selo no card:** dia, e a hora quando houver.
5. **Ida para Hoje:** no dia agendado, a tarefa pendente vai para Hoje quando as tarefas forem lidas (D1).
6. **Grade da Agenda:** as tarefas com hora aparecem como blocos agendados, com a estimativa como duração (D6, D7). Arrastar o bloco muda o horário. Selecionar uma janela vazia depois de agora agenda uma tarefa (D10).
7. **Contrato:** os campos novos nas ferramentas MCP e na API pública, com o escopo `tasks:write` já existente.
8. **Recorrência:** uma tarefa agendada pode repetir (todo dia, dias úteis, toda semana num dia, todo mês num dia ou personalizado). Existe uma ocorrência aberta por vez, e a próxima nasce quando a atual é concluída (D13). A Agenda projeta as ocorrências futuras (D14).

### Fora

| Item | Motivo |
| --- | --- |
| Lembretes e notificações no horário | Decisão de 2026-11-06 (D8): exigem worker ou o app aberto, e o desktop local não tem worker. |
| Hora de fim própria | A duração é a estimativa (D7). |
| Puxar a borda do bloco agendado para mudar a duração (e a estimativa) | Fica para depois; nesta entrega a duração muda pela estimativa. |
| Recorrência anual e por posição no mês ("2ª sexta do mês") | O personalizado cobre dia, semana e mês no dia N; o resto fica para depois. |
| Feriados nos dias úteis | "Dias úteis" é segunda a sexta. |
| Editar ou arrastar uma ocorrência projetada | Só a ocorrência aberta (a tarefa real) é editável; as projetadas seguem a regra (D14). |
| Recorrência sem data | A regra precisa de um dia de partida. |
| Prazo (`due date`) | É outro conceito ("até quando"); o agendamento é "quando vou fazer". |
| Visão de mês | A Agenda não tem. |
| Agendar pelo mobile | O app só lê e mostra o selo (D4). A Agenda do mobile não mostra os blocos agendados. |

## Modelo de dados (proposta)

| Coluna | Tipo | Regra |
| --- | --- | --- |
| `scheduled_on` | `date`, nulo | O dia agendado, no fuso do workspace. |
| `scheduled_time` | `time`, nulo | A hora de início, no fuso do workspace, em qualquer minuto (D34). Só existe com `scheduled_on` (`check`). |
| `schedule_applied_at` | `timestamptz`, nulo | Quando a tarefa foi para Hoje por este agendamento. Volta a nulo quando o dia muda; mudar só a hora o mantém (D26). |

Dia e hora ficam separados, e não num `timestamptz`, porque o dia sem hora é um caso de primeira classe e porque "hoje" é calculado no fuso do workspace. Se o fuso do workspace mudar, a tarefa continua no mesmo horário de parede, como no Google Agenda.

### Recorrência

Tabela nova `task_series`, uma linha por série:

| Coluna | Tipo | Regra |
| --- | --- | --- |
| `id` | `uuid` | |
| `workspace_id` | `uuid` | Dono da série; apagar o workspace apaga a série. |
| `freq` | `varchar(8)` | `daily`, `weekly` ou `monthly`. |
| `interval` | `smallint` | A cada N períodos, de 1 a 99. |
| `weekdays` | `smallint[]`, nulo | Só em `weekly`: 1 (seg) a 7 (dom), pelo menos um. "Dias úteis" é `weekly` com 1–5. |
| `month_day` | `smallint`, nulo | Só em `monthly`: 1 a 31; num mês mais curto, cai no último dia. |
| `until` | `date`, nulo | Último dia possível. |
| `count` | `smallint`, nulo | Total de ocorrências, de 1 a 999. `until` e `count` não convivem (`check`). |
| `created_count` | `smallint` | Ocorrências já criadas, para o `count`. |
| `time` | `time`, nulo | A hora da série, no fuso do workspace, em qualquer minuto (D34); a próxima ocorrência nasce com ela (D27). |
| `ended_at` | `timestamptz`, nulo | Quando a série foi encerrada. |

A tarefa ganha `series_id` (`uuid`, nulo, `on delete set null`): a ocorrência aberta e as concluídas apontam para a série. A hora da série fica em `task_series.time`: "Só esta ocorrência" muda só a `scheduled_time` da tarefa, "Esta e as próximas" muda as duas (D27). Regras estruturadas, e não uma string RRULE, porque a validação fica no schema e o contrato da API fica explícito; o conjunto cabe num subconjunto de RRULE se um dia houver exportação para iCal.

## Histórias de usuário

### US-1. Agendar pelo card

**Como** usuário no quadro, **quero** escolher o dia e, se quiser, a hora de uma tarefa pelo menu do card **para** planejar quando vou fazê-la sem abrir a tarefa.

- WHEN o usuário abre `⋮ > Agendar` THEN o menu SHALL mostrar `Hoje`, `Amanhã`, `Próxima segunda` e `Escolher data, hora e repetição…`.
- `Escolher data, hora e repetição…` SHALL abrir um calendário com um campo de hora opcional no formato `HH:MM`, em qualquer minuto (D34), e SHALL recusar dias anteriores a hoje e horários de hoje que já passaram, no fuso do workspace.
- Os atalhos de dia SHALL manter a hora já agendada, se houver. WHEN o atalho é `Hoje` e essa hora já passou THEN a tarefa SHALL ficar agendada para hoje sem hora, sem erro (D24).
- WHEN a tarefa já tem agendamento THEN o submenu SHALL marcar o dia atual e mostrar `Remover agendamento`.
- WHEN o usuário salva THEN o card SHALL mostrar o selo sem recarregar a página.
- WHEN a tarefa está em Concluídas THEN `Agendar` SHALL ficar desabilitado.
- WHEN o papel é `viewer` THEN `Agendar` SHALL ficar desabilitado e a API SHALL responder 403.

### US-2. Agendar pelo diálogo da tarefa

**Como** usuário, **quero** ver e mudar o dia e a hora no diálogo da tarefa **para** ajustá-los junto com o título, a estimativa e as notas.

- WHEN o diálogo abre THEN ele SHALL mostrar o agendamento (`Sem agendamento`, `Qui, 13 nov` ou `Qui, 13 nov · 14:00 – 15:30`) com o mesmo seletor de US-1.
- WHEN a tarefa tem hora THEN o diálogo SHALL mostrar o fim calculado pela estimativa, ou `+1h` se a tarefa não tiver estimativa (D7).
- WHEN o usuário limpa a hora THEN só `scheduled_time` SHALL voltar a nulo; ao limpar o agendamento, os dois campos SHALL voltar a nulo.

### Regras ao salvar o agendamento (US-1, US-2, US-5 e US-6)

- Mudar o dia SHALL zerar `schedule_applied_at`; mudar só a hora SHALL mantê-lo, para uma tarefa tirada de Hoje à mão não voltar sozinha (D26).
- WHEN a tarefa está em Backlog e o dia cai na semana corrente THEN ela SHALL ir para o fim de Esta semana (D3).
- WHEN o dia é hoje THEN a tarefa SHALL ir para o fim de Hoje, mantendo dia e hora, e `schedule_applied_at` SHALL receber o instante (D21).
- WHEN a tarefa já está em Esta semana ou Hoje e recebe um dia futuro THEN ela SHALL continuar onde está.

### US-3. Ver o agendamento no card

**Como** usuário, **quero** ver no card quando a tarefa está agendada **para** saber o que vem pela frente sem abrir cada uma.

- O selo SHALL mostrar o dia como `Hoje`, `Amanhã`, o dia da semana até 6 dias à frente (`Qui`) ou `13 nov` depois disso, no fuso do workspace.
- WHEN a tarefa tem hora THEN o selo SHALL juntar a hora de início: `Qui 14:00`; em Hoje, só `14:00`.
- WHEN a tarefa está em Hoje, foi agendada e não tem hora THEN o selo SHALL dizer `Agendada`, e não `Hoje` (D21); o tooltip do selo SHALL dizer o dia agendado (`Agendada para qua, 4 nov` quando ficou de um dia anterior).
- Em Concluídas, o selo SHALL não aparecer (D5).
- O selo SHALL caber na regra das 3 linhas do título (item 7 da leva 30–34) sem empurrar as ações rápidas.

### US-4. A tarefa chega em Hoje no dia agendado

**Como** usuário, **quero** que a tarefa agendada apareça em Hoje no dia marcado **para** não precisar lembrar de movê-la.

- WHEN o quadro, a home, o foco, o widget ou a Agenda leem as tarefas e existe tarefa pendente em Backlog ou Esta semana com `scheduled_on <= hoje` e `schedule_applied_at` nulo THEN o backend SHALL movê-la para o fim de Hoje antes de responder, em ordem de dia, hora e `position`.
- A ida para Hoje SHALL acontecer na leitura, como a liquidação do foco (AD-001), sem job, para funcionar igual no modo local.
- WHEN a tarefa vai para Hoje THEN o dia e a hora (se houver) SHALL ficar guardados e `schedule_applied_at` SHALL receber o instante da ida (D21). Se o usuário a tirar de Hoje à mão, ela SHALL não voltar sozinha.
- A ida para Hoje SHALL acontecer no começo do dia, qualquer que seja a hora agendada.
- Tarefas já em Hoje ou em Concluídas SHALL ficar onde estão.
- Tarefas de listas arquivadas SHALL ficar onde estão; ao desarquivar, a próxima leitura aplica a regra (D25).

### US-5. Ver as tarefas agendadas na Agenda

**Como** usuário, **quero** ver na grade da Agenda os blocos das tarefas com hora **para** enxergar o dia agendado ao lado do tempo que já trabalhei.

- WHEN a semana exibida tem tarefas pendentes com dia e hora THEN a grade SHALL desenhar cada uma como um bloco agendado, de `scheduled_time` a `scheduled_time + estimativa` (ou 1h sem estimativa).
- O bloco agendado SHALL ter contorno tracejado e fundo na cor da lista em tom mais fraco que o da sessão, e um ícone de relógio no canto superior direito, no lugar onde a sessão unificada mostra a quantidade de sessões, para se distinguir do bloco de sessão. Como o bloco de sessão de hoje, ele SHALL não ter texto. O tooltip SHALL mostrar, em linhas: `<título>` com `Est. <duração>` (ou `Sem estimativa`) à direita; `Agendada · HH:MM – HH:MM`, com `(1h)` quando não há estimativa; `<lista> · <coluna>`; e `Clique para abrir · arraste para reagendar` (sem a parte do arraste para `viewer`).
- O tempo depois de agora SHALL deixar de ser hachurado: a grade fica igual antes e depois de agora, com a linha de agora.
- O bloco agendado SHALL aparecer no passado e no futuro; ele não é tempo registrado e não conta no tempo gasto nem nos relatórios.
- WHEN um bloco agendado e uma sessão se sobrepõem THEN a grade SHALL mostrá-los lado a lado, como as sessões sobrepostas de hoje.
- Tarefas sem hora SHALL não virar bloco na grade; elas aparecem na linha `Sem hora` (US-14).
- Tarefas concluídas SHALL não aparecer como bloco agendado; o tempo delas já aparece nas sessões.
- WHEN o usuário clica no bloco agendado THEN o app SHALL abrir o diálogo da tarefa.
- A Agenda SHALL mostrar as tarefas agendadas de todo o workspace (D9).

### US-6. Reagendar arrastando na Agenda

**Como** usuário, **quero** arrastar o bloco agendado para outro horário ou dia **para** reorganizar a semana como no Google Agenda.

- WHEN o usuário arrasta o bloco agendado e solta THEN a Agenda SHALL mostrar o bloco no novo lugar e, no lugar do painel lateral, a confirmação `Novo horário — ainda não salvo`, com o dia e a hora antigos riscados e os novos; só `Salvar horário` SHALL gravar o novo dia e a nova hora, encaixados em 15 min, sem mudar a estimativa, e `Cancelar` ou `Esc` SHALL devolver o bloco sem gravar nada (D35).
- O arraste do bloco agendado SHALL funcionar também no futuro; o bloqueio de AGENDA-23 continua valendo só para sessões.
- WHEN o papel é `viewer` THEN o bloco SHALL não ser arrastável.
- Ao soltar, valem as "Regras ao salvar o agendamento".

### US-8. Agendar selecionando um horário na Agenda

**Como** usuário, **quero** selecionar uma janela livre no futuro da grade **para** agendar uma tarefa ali, como crio um evento no Google Agenda.

- WHEN o usuário seleciona uma janela vazia que começa em agora ou depois THEN a grade SHALL desenhar o rascunho e abrir o painel `Novo agendamento` com o dia e o horário, em vez do painel `Nova sessão` (D10).
- WHEN a janela começa antes de agora THEN vale o comportamento atual de registrar uma sessão (AGENDA-14), com a recusa de fim no futuro (AGENDA-23).
- O painel SHALL listar as tarefas pendentes do workspace com busca, como o seletor de tarefa da sessão, e oferecer `Criar tarefa "<busca>" e agendar`, que cria a tarefa no Backlog da lista escolhida e a agenda.
- WHEN o usuário escolhe a tarefa THEN o sistema SHALL gravar o dia e a hora de início da janela, e valem as "Regras ao salvar o agendamento".
- WHEN a tarefa não tem estimativa THEN ela SHALL receber como estimativa a duração da janela; com estimativa, a estimativa SHALL ser mantida e o bloco SHALL usar a estimativa (D11).
- WHEN a tarefa já tem agendamento THEN escolher no painel SHALL substituí-lo.
- WHEN a tarefa escolhida é ocorrência de uma série THEN o app SHALL perguntar `Só esta ocorrência` ou `Esta e as próximas` antes de salvar (D32).
- WHEN o papel é `viewer` THEN a seleção SHALL não abrir o painel.
- A barra da Agenda SHALL ter o botão `Agendar`, secundário e com ícone de relógio, antes de `Nova sessão`. Ele SHALL abrir o painel `Novo agendamento` com o dia de hoje (ou o dia exibido, na visão Dia), sem hora e com o seletor de data, hora e repetição. Para `viewer`, o botão SHALL ficar desabilitado.

### US-7. Agendar por API e MCP

**Como** quem automatiza pelo token ou pelo MCP, **quero** ler e gravar o dia e a hora **para** agendar tarefas de fora do app.

- `create_task` e `update_task` SHALL aceitar `scheduled_on` (`YYYY-MM-DD` ou `null`) e `scheduled_time` (`HH:MM`, em qualquer minuto, ou `null`; D34); `get_board` e `get_task` SHALL devolvê-los.
- `scheduled_time` sem `scheduled_on`, data inválida ou hora fora do passo SHALL responder 422 com a mensagem de validação.
- `create_task` e `update_task` SHALL aceitar `recurrence` (`null` ou `{freq, interval, weekdays?, month_day?, until?, count?}`), com as regras da tabela `task_series`; `get_board` e `get_task` SHALL devolver a regra e a próxima data projetada. `recurrence` sem `scheduled_on` SHALL responder 422.

### US-9. Escolher a repetição ao agendar

**Como** usuário, **quero** dizer que uma tarefa se repete ao agendá-la **para** não recriá-la toda vez.

- O seletor `Escolher data, hora e repetição…` e o campo do diálogo SHALL ter, abaixo da hora, a seção `Repetir`, com as opções montadas a partir do dia escolhido (para sexta, 13 nov): `Não repete` (padrão), `Todo dia`, `Dias úteis (seg a sex)`, `Toda sexta`, `Todo mês no dia 13` e `Personalizado…`.
- WHEN o dia escolhido é 29, 30 ou 31 THEN a opção mensal SHALL dizer `Todo mês no dia 31 (ou no último dia)`.
- WHEN o usuário escolhe `Personalizado…` THEN o seletor SHALL mostrar: `A cada <N> <dias | semanas | meses>`; em semanas, os dias da semana como botões de alternar (pelo menos um); em meses, `no dia <N>`; e `Termina`: `Nunca`, `Em <data>` ou `Depois de <N> vezes`. Um resumo em texto SHALL acompanhar a escolha (`A cada 2 semanas, seg e qua, 5 vezes`).
- WHEN o usuário salva uma repetição THEN o sistema SHALL criar a série, ligar a tarefa a ela como ocorrência aberta e contar 1 em `created_count`.
- Os atalhos do menu (`Hoje`, `Amanhã`, `Próxima segunda`) SHALL não mexer na repetição.
- WHEN a tarefa já repete THEN o submenu `Agendar` SHALL mostrar a regra (`Repete toda sexta`) e a opção `Parar de repetir`, que encerra a série e deixa a ocorrência aberta como tarefa comum.

### US-10. A próxima ocorrência nasce ao concluir

**Como** usuário, **quero** que a próxima ocorrência apareça quando concluo a atual **para** ter sempre uma, e só uma, no quadro.

- WHEN o usuário conclui a ocorrência aberta THEN o sistema SHALL, na mesma escrita, criar a próxima ocorrência na primeira data da regra depois do dia da ocorrência concluída e depois de hoje (D17), com a mesma hora, e somar 1 em `created_count`.
- A próxima ocorrência SHALL copiar título, anotações, estimativa, lista e subtarefas (todas desmarcadas) da concluída; o tempo gasto e as sessões ficam na concluída.
- A coluna da próxima ocorrência SHALL seguir as "Regras ao salvar o agendamento" (Backlog, Esta semana ou Hoje conforme o dia).
- WHEN a série atingiu `count` ou a próxima data passa de `until` THEN o sistema SHALL não criar ocorrência e SHALL gravar `ended_at`.
- WHEN a ocorrência concluída volta de Concluídas THEN a ocorrência criada por ela SHALL continuar existindo; não há desfazer automático.
- Uma ocorrência que não foi concluída SHALL continuar em Hoje, como qualquer tarefa (virada do dia), e a série SHALL esperar por ela.
- Ocorrências de uma série mantêm `scheduled_on` ao ir para Hoje, como toda tarefa (D21); a regra parte dessa data.

### US-11. Ver a repetição no card e na Agenda

**Como** usuário, **quero** reconhecer uma tarefa que se repete **para** saber que ela volta.

- O selo do card SHALL juntar o ícone de repetição depois do dia e da hora: `Sex 14:00 ↻`. O tooltip do selo SHALL dizer a regra (`Repete toda sexta`).
- Na Agenda, o bloco da ocorrência aberta SHALL trocar o relógio do canto pelo ícone de repetição.
- A Agenda SHALL projetar as ocorrências futuras da série na semana exibida, a partir da regra, depois da ocorrência aberta e respeitando `until` e `count` (D14). A projeção SHALL ter o mesmo estilo do bloco agendado com opacidade menor e o ícone de repetição.
- O bloco projetado SHALL não ser arrastável; o clique SHALL abrir o diálogo da ocorrência aberta, e o tooltip SHALL dizer `Próxima ocorrência · <dia> · HH:MM – HH:MM` e `Repete toda sexta`.
- A ocorrência aberta de uma série sem hora SHALL aparecer na linha `Sem hora` (US-14), com o ícone de repetição; as ocorrências futuras sem hora SHALL não ser projetadas nessa linha, para não ocupar as 3 vagas do dia.

### US-12. Mudar só esta ou esta e as próximas

**Como** usuário, **quero** escolher se uma mudança vale só para esta ocorrência ou para a série **para** ajustar uma semana sem desfazer a regra.

- WHEN o usuário muda o dia ou a hora da ocorrência aberta (pelo card, diálogo ou arraste na Agenda) THEN o app SHALL perguntar `Só esta ocorrência` ou `Esta e as próximas` (D16).
- WHEN o usuário muda o dia de uma ocorrência no seletor THEN a opção de `Repetir` SHALL continuar a da série (ex.: `Toda quinta`), e salvar SHALL abrir a mesma pergunta; só escolher outra opção em `Repetir` muda a regra (D30).
- `Só esta ocorrência` SHALL mudar apenas a tarefa; as projeções e a próxima ocorrência SHALL seguir a regra original.
- `Esta e as próximas` SHALL mudar a regra a partir desta ocorrência: o dia da semana (semanal) ou o dia do mês (mensal) passam a ser os da nova data, e a hora passa a ser a nova hora.
- Mudar a regra (no `Repetir`) SHALL valer sempre para a série dali em diante, sem pergunta.
- WHEN o usuário exclui a ocorrência aberta THEN o app SHALL perguntar `Excluir só esta` (cria a próxima, como ao concluir) ou `Excluir esta e encerrar a série`.
- O menu `⋮` de uma ocorrência SHALL ter `Pular esta ocorrência`, que move a mesma tarefa para a próxima data da regra, mantendo o tempo gasto (D18). Se a tarefa estiver em Hoje ou Esta semana, ela SHALL ir para a coluna da nova data (Esta semana ou Backlog), e `schedule_applied_at` SHALL ser zerado (D28).
- WHEN o usuário remove o agendamento de uma ocorrência THEN a série SHALL ser encerrada e a tarefa SHALL virar comum, sem dia nem hora (D29).

### US-14. Ver as tarefas agendadas sem hora na Agenda

**Como** usuário, **quero** ver na Agenda as tarefas agendadas para um dia sem hora definida **para** enxergar tudo o que está planejado para aquele dia, não só o que tem horário.

- A grade SHALL ter uma linha `Sem hora` entre o cabeçalho dos dias e a linha do tempo, com uma célula por dia, alinhada às colunas (D20), só quando algum dia mostrado tem tarefa agendada sem hora ou enquanto uma tarefa agendada é arrastada (para poder soltá-la ali e limpar a hora). Na coluna das horas, a linha SHALL mostrar um ícone de relógio cortado, com o tooltip e o rótulo acessível `Agendadas sem hora definida`, no lugar de um texto.
- Cada célula SHALL listar até 3 tarefas pendentes agendadas para o dia sem hora, com o visual do bloco agendado da grade na cor da lista (fundo em tom fraco e contorno tracejado): título numa linha (cortado com reticências) e a estimativa à direita, quando houver; sem subtarefas.
- A ordem SHALL ser a do quadro: coluna (Hoje, Esta semana, Backlog) e depois `position`.
- WHEN o dia tem mais de 3 tarefas sem hora THEN a célula SHALL mostrar o botão `+X`, com X = as que não couberam, e o rótulo acessível `Ver todas as N tarefas agendadas do dia <dia>`.
- WHEN o usuário clica em `+X` THEN o app SHALL abrir, no lugar do painel lateral da Agenda, o painel do dia: `<dia da semana>, <data>`, `N tarefas agendadas · Est. <soma>`, a seção `Sem hora` com todas as tarefas sem hora do dia e a seção `Com hora` com as tarefas com hora do dia em ordem de horário, inclusive a próxima ocorrência projetada de uma série (só leitura).
- Cada tarefa da célula e do painel SHALL abrir o diálogo da tarefa no clique. No painel, a tarefa sem hora SHALL ter o botão de relógio `Definir hora`, que abre o seletor de hora; ao salvar, ela sai de `Sem hora` e vira um bloco na grade.
- A altura da linha SHALL acomodar 3 tarefas e o `+X` em todos os dias da semana, para as colunas não ficarem desalinhadas; dias sem tarefa ficam com a célula vazia.
- Tarefas concluídas SHALL não aparecer na linha, como na grade (D5).
- WHEN o papel é `viewer` THEN o painel SHALL mostrar as tarefas sem o botão `Definir hora`.
- WHEN o usuário arrasta uma tarefa da linha `Sem hora` para a grade THEN a grade SHALL mostrar o rascunho com 1h a partir do ponto, encaixado em 15 min, e ao soltar SHALL gravar a hora de início (D22). A tarefa sem estimativa SHALL receber 1h de estimativa; com estimativa, o bloco SHALL ficar com a estimativa. Valem as "Regras ao salvar o agendamento" e, numa série, a pergunta de US-12.
- WHEN o usuário arrasta um bloco agendado para a linha `Sem hora` de um dia THEN o sistema SHALL gravar esse dia e limpar a hora.
- Durante o arraste, a tarefa SHALL seguir o cursor como uma cópia com sombra e o lugar de origem SHALL ficar apagado; sobre a grade, o rascunho SHALL mostrar o rótulo `<dia> · HH:MM – HH:MM`; sobre a linha `Sem hora` de outro dia, a célula de destino SHALL ficar destacada e o rótulo SHALL dizer `Mover para <dia> · sem hora`, e soltar ali SHALL mudar só o dia. `Esc` SHALL cancelar e devolver a tarefa.
- Ao soltar, o app SHALL mostrar um aviso `Agendada para <dia>, HH:MM` com `Desfazer`, que volta o dia, a hora e a estimativa ao que eram.
- WHEN o papel é `viewer` THEN as tarefas da linha `Sem hora` SHALL não ser arrastáveis.

## Decisões

- **D1 (2026-11-06):** o agendamento move a tarefa para Hoje, na leitura (US-4), sem job, para funcionar igual no modo local. Isso abre uma exceção registrada à regra de `listas-e-quadro`: "não mover sozinho na virada" continua valendo para tirar tarefas de Hoje; trazer para Hoje pela data é permitido.
- **D2 (substituída pela D21 em 2026-11-06):** ao ir para Hoje, a tarefa sem hora perdia a data e a com hora mantinha dia e hora.
- **D3 (2026-11-06):** ao salvar, uma tarefa em Backlog com dia nesta semana vai para Esta semana; um dia de hoje leva a tarefa direto para Hoje. Tarefas em Esta semana ou Hoje não mudam de coluna ao receber um dia futuro.
- **D4 (2026-11-06):** o mobile só lê e mostra o selo; agendar pelo app e ver os blocos na Agenda do mobile ficam para depois.
- **D5 (2026-11-06):** concluir a tarefa mantém o agendamento, sem selo em Concluídas e sem bloco agendado na Agenda.
- **D6 (2026-11-06):** a tarefa com hora aparece no card e como bloco agendado na grade da Agenda.
- **D7 (2026-11-06):** a duração do bloco é a estimativa da tarefa; sem estimativa, 1h (revista pela D23).
- **D8 (2026-11-06):** sem lembrete nem notificação nesta entrega.
- **D9 (2026-11-06):** a Agenda mostra os blocos agendados de todas as tarefas agendadas do workspace. As sessões continuam pessoais; o quadro já é compartilhado e a tarefa não tem responsável.
- **D10 (2026-11-06):** selecionar uma janela vazia que começa em agora ou depois agenda uma tarefa; antes de agora, registra uma sessão como hoje. O hachurado do futuro sai da grade, e os blocos ficam sem texto, com o título e o horário no tooltip.

- **D11 (2026-11-06):** a janela selecionada vira a estimativa só quando a tarefa não tem uma; com estimativa, a seleção define apenas o início, e o bloco usa a estimativa (D7).
- **D12 (2026-11-06):** o painel `Novo agendamento` permite criar uma tarefa nova, no Backlog da lista escolhida; a regra D3 a leva para Esta semana ou Hoje conforme o dia.
- **D13 (2026-11-06):** recorrência com uma ocorrência aberta por vez; a próxima nasce ao concluir (ou ao excluir só esta). Uma série esquecida não empilha cópias.
- **D14 (2026-11-06):** a Agenda mostra a ocorrência aberta e projeta as futuras pela regra; só a aberta é arrastável.
- **D15 (2026-11-06):** o `Personalizado` entra: intervalo em dias, semanas ou meses, dias da semana, dia do mês e fim (nunca, data ou N vezes).
- **D16 (2026-11-06):** mudar o dia ou a hora de uma ocorrência pergunta "só esta" ou "esta e as próximas", como no Google Agenda; mudar a regra vale sempre para a série dali em diante.

- **D17 (2026-11-06):** a próxima ocorrência cai na primeira data da regra depois do dia da ocorrência concluída e depois de hoje. Ocorrências perdidas são puladas, e concluir adiantado não duplica a da semana.
- **D18 (2026-11-06):** `Pular esta ocorrência` reagenda a mesma tarefa para a próxima data da regra, preservando o tempo registrado.
- **D19 (2026-11-06):** as subtarefas são copiadas para a próxima ocorrência, todas desmarcadas.
- **D20 (2026-11-06):** a Agenda mostra as tarefas agendadas sem hora numa linha `Sem hora` entre os dias e a grade, até 3 por dia no formato da lista do card de lista; com mais, `+X` abre o painel do dia com todas as tarefas agendadas do dia.

- **D21 (2026-11-06):** toda tarefa mantém dia e hora ao chegar em Hoje, e `schedule_applied_at` impede que ela volte sozinha se for tirada de lá à mão (substitui a D2). Em Hoje, a tarefa agendada sem hora mostra o selo `Agendada`, e não `Hoje`; com hora, continua `14:00`.

- **D22 (2026-11-06):** arrastar uma tarefa da linha `Sem hora` para a grade define a hora, no passo de 15 min de hoje. O bloco nasce com 1h, como a nova sessão criada pela Agenda: a tarefa sem estimativa recebe 1h de estimativa; com estimativa, o bloco usa a estimativa (D7). Arrastar um bloco para `Sem hora` tira a hora.

- **D23 (2026-11-06):** sem estimativa, o bloco agendado aparece com 1h na grade (substitui os 30 min da D7), o mesmo tamanho da nova sessão e do arraste de `Sem hora`.
- **D24 (2026-11-07):** o atalho `Hoje` com uma hora que já passou agenda o dia de hoje sem hora, em vez de recusar.
- **D25 (2026-11-07):** a ida para Hoje ignora as listas arquivadas.
- **D26 (2026-11-07):** só mudar o dia reativa a ida para Hoje; mudar só a hora mantém `schedule_applied_at`. Ajusta a regra "mudar o dia ou a hora zera".
- **D27 (2026-11-07):** a hora da série é guardada em `task_series.time`; mudar a hora de uma ocorrência com "Só esta" não muda a da próxima.
- **D28 (2026-11-07):** pular uma ocorrência que está em Hoje ou Esta semana a leva para a coluna da nova data.
- **D29 (2026-11-07):** remover o agendamento de uma ocorrência encerra a série.
- **D30 (2026-11-07):** mudar o dia de uma ocorrência no seletor mantém a regra da série e pergunta "só esta ou esta e as próximas"; a regra só muda quando outra opção de `Repetir` é escolhida.
- **D31 (2026-11-07):** a API aceita dia e hora no passado; só o seletor os bloqueia. Uma tarefa agendada para um dia passado vai para Hoje na leitura seguinte, e `Desfazer` na Agenda pode restaurar um dia que já passou.
- **D32 (2026-11-07):** o painel `Novo agendamento` pergunta "só esta ou esta e as próximas" quando a tarefa escolhida é ocorrência de uma série.
- **D33 (2026-11-07):** o `delete_task` do MCP numa ocorrência aberta segue o `DELETE` da API sem escopo: exclui só esta e cria a próxima.
- **D34 (2026-11-07):** a hora do agendamento é um campo `HH:MM`, não uma lista de horários, e aceita qualquer minuto (10:10 vale). A API, o MCP e o banco deixam de exigir o passo de 15 min (migration 0013); os segundos continuam zerados. O arraste na grade continua encaixando em 15 min (D22).
- **D35 (2026-11-07):** soltar uma tarefa agendada na Agenda (bloco, linha `Sem hora` ou de `Sem hora` para a grade) pede confirmação como a sessão movida: o painel `Novo horário — ainda não salvo` com `Cancelar` e `Salvar horário`. Numa série, a pergunta `Só esta` ou `Esta e as próximas` vem depois de `Salvar horário`. O aviso com `Desfazer` continua depois de salvar.

Não há decisões em aberto.

## Onde mexer (mapa inicial)

- Banco e API: `backend-node/src/db/schema.ts` (três colunas e `check`s), migração, `routes/schemas.ts`, `routes/board.ts`, serviço de tarefas (a ida para Hoje de US-4 entra na leitura), e a leitura da Agenda passa a devolver as tarefas agendadas da semana.
- Frontend: `components/board/task-card-menu.tsx` (submenu), `task-card.tsx` (selo), `task-dialog.tsx` (campos), `components/agenda/` (bloco agendado e arraste), `types/index.ts`, i18n.
- MCP e tokens: as ferramentas `create_task`, `update_task`, `get_board` e `get_task`.
- Recorrência: tabela `task_series` e `tasks.series_id`; a criação da próxima ocorrência entra na transação de concluir (`complete`) e na de excluir; a projeção da Agenda é calculada na leitura da semana.
- Mobile: `mobile/lib/domain/models/task.dart` (campos opcionais, inclusive a regra, só para mostrar o ícone).
