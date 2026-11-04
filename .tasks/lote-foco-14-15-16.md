# Lote de melhorias do foco: abrir sem iniciar, reordenar e subtarefas

> Build this with **tlc-implement** (`.claude/skills/tlc-implement`).
> Every criterion below becomes a check with a proof, referenced by its number. Nothing under
> `Unresolved` gets settled while building.

## Intent

No desktop, o único caminho do quadro para a tela de foco é **Focar agora**, que inicia o cronômetro e recolhe a janela para o widget. Quem quer só revisar a fila de Hoje antes de começar acaba iniciando uma sessão que não queria. Na tela de foco, as próximas tarefas são uma lista estática: mudar qual vem depois exige voltar ao quadro. As subtarefas da tarefa em foco não aparecem na tela de foco nem no widget, então acompanhar o checklist da tarefa também exige sair do foco. As issues não trazem números sobre esse custo.

Com este lote:
- **Abrir sem iniciar (#14):** a coluna Hoje do quadro ganha, no desktop, um botão de ícone ao lado de **Focar agora**. Ele abre a tela de foco sem iniciar o cronômetro e sem abrir o widget.
- **Reordenar (#15):** na tela de foco, as próximas tarefas ganham uma alça para reordenar, pelo mouse ou pelo teclado. Soltar uma tarefa sobre o cartão em foco troca a tarefa em foco.
- **Subtarefas (#16):** a tarefa em foco mostra as subtarefas dentro do próprio cartão. O widget mostra a contagem e abre a lista num painel.

Os designs validados estão nos canvases listados em `Sources` e são vinculantes.

31 critérios em 3 slices · 1 porta de mão única · 5 abertas, 0 bloqueiam

## Criteria

### Abrir o foco sem iniciar (#14)

1. Dado o app desktop no quadro de uma lista, então o rodapé da coluna `Hoje` mostra, à direita de `Focar agora`, um botão de ícone (olho) com `aria-label` e dica `Abrir o foco sem iniciar o cronômetro`, na mesma altura de `Focar agora` (canvas #14, artboard `Quadro · coluna Hoje`).
2. Dado o navegador (web), então a coluna `Hoje` não mostra esse botão, só `Focar agora`.
3. Quando o usuário clica no botão de ícone, então o app navega para `/focus/:listId`, nenhuma ação `start` é enviada (nem para a fila offline), `collapseFocus` não é chamado e a janela principal continua visível.
4. Dado `Hoje` sem tarefas pendentes, então o botão de ícone fica desabilitado, como `Focar agora`.
5. Dada a tela de foco aberta pelo botão, sem sessão aberta e com a tarefa em foco com `spent_seconds` igual a 0, então o cartão da tarefa tem borda tracejada, o tempo em cinza com a estimativa (`45:00`), o selo `Cronômetro parado`, e o botão principal diz `Começar` (ícone de play), seguido de `Pular` e `Concluir` (canvas #14, artboard `Foco aberto sem iniciar`).
6. Quando o usuário clica em `Começar`, então a ação `start` é enviada para a tarefa em foco, o cartão passa a borda sólida, o tempo passa a contar e o botão principal vira `Pausar`. O widget não abre.
7. Dada uma tarefa pausada com `spent_seconds` maior que 0, então o botão principal continua dizendo `Retomar`, como hoje.

### Reordenar as próximas tarefas no foco (#15)

8. Dado um usuário que pode editar e uma tela de foco com próximas tarefas, então cada item de `Próximas tarefas` tem uma alça de seis pontos à esquerda, um `<button>` com `aria-label` `Mover <título>` (canvas #15, artboard `Próximas tarefas com alça`).
9. Dado um usuário `viewer`, então os itens não têm alça e a lista não pode ser arrastada.
10. Quando o usuário arrasta um item pela alça com o mouse, então o item levantado ganha sombra e um espaço tracejado mostra onde ele vai cair (canvas #15, artboard `Arrastando com o mouse`). Ao soltar, a fila mostra a nova ordem na hora.
11. Quando o usuário foca a alça e aperta Espaço, então o item é levantado: as setas para cima e para baixo o movem, e Espaço de novo o solta na posição. Uma região `aria-live` anuncia `<título>: posição <n> de <total>` a cada movimento.
12. Quando um item é solto numa nova posição da fila, então `POST /api/tasks/:id/move` é chamado com `column: "today"` e `before_task_id` igual ao id da próxima tarefa abaixo dele, ou `null` no fim da fila. A tarefa em foco nunca é o `before_task_id`. Depois de recarregar, a ordem do quadro (coluna Hoje) e a da tela de foco são as mesmas.
13. Se `POST /api/tasks/:id/move` falha, então a fila volta para a ordem anterior e aparece um toast de erro com a mensagem da API, como no quadro.
14. Enquanto um arraste está em andamento, um poll do estado do foco que chega antes do `move` responder não faz a fila voltar para a ordem antiga.
15. Dada uma sessão de tarefa deste dispositivo (contando ou pausada), quando o usuário arrasta um item da fila sobre o cartão em foco, então o cartão vira uma área de soltar com borda tracejada e o texto `Solte para focar nesta agora`, e os controles ficam esmaecidos (canvas #15, artboard `Arrastar para o topo`, regra 2).
16. Quando o usuário solta o item sobre o cartão em foco, então a ação `start` é enviada para a tarefa arrastada (pela fila de ações do foco), ela passa a ser a tarefa em foco, e a tarefa que estava em foco aparece no topo de `Próximas tarefas` com o tempo já registrado preservado em `spent_seconds`.
17. Dado um intervalo em andamento, uma tarefa esperando `Estender`, uma sessão parada sem sinal ou um foco em outro dispositivo, então o cartão em foco não aceita o soltar e soltar sobre ele não envia nenhuma ação.
18. Depois de reordenar ou trocar a tarefa em foco pela tela, então `notifyFocusChanged` é chamado, e o widget do desktop mostra a nova tarefa em foco.

### Subtarefas da tarefa atual (#16)

19. Dada uma tarefa em foco com subtarefas, então o cartão em foco mostra, abaixo do título e do tempo e separado por uma linha, o cabeçalho `Subtarefas` com uma barra de progresso e a contagem `<feitas>/<total>`, seguido da lista de subtarefas com caixa de seleção e do campo `Nova subtarefa` (canvas #16, artboard `Tela de foco com subtarefas`).
20. Quando o usuário marca ou desmarca uma subtarefa no cartão em foco, então o texto fica riscado ou volta ao normal, a barra e a contagem mudam na hora, e o mesmo estado aparece no quadro (`x/y Subtarefas` no cartão da tarefa).
21. Quando o usuário digita um título de 1 a 255 caracteres em `Nova subtarefa` e aperta Enter, então a subtarefa aparece no fim da lista e a contagem soma 1. Título vazio ou acima de 255 caracteres mostra o erro que a lista do quadro já mostra.
22. Dada uma tarefa em foco sem subtarefas, então o cartão mostra só o botão `Adicionar subtarefa`, que abre o campo `Nova subtarefa` (canvas #16, artboard `Estados`, `Sem subtarefas`).
23. Dada uma tarefa em foco com todas as subtarefas feitas, então a barra fica cheia e o cartão mostra `Tudo feito por aqui.` com o botão `Concluir tarefa`, que envia a ação `complete` da tarefa em foco (canvas #16, `Todas feitas`).
24. Dada uma tarefa em foco com mais de 5 subtarefas, então o cartão mostra as 5 primeiras pendentes e o botão `Mostrar todas (<total>)`, que expande a lista com todas, feitas incluídas (canvas #16, `Lista longa`).
25. Dado um usuário `viewer`, então as subtarefas aparecem sem caixa de seleção editável e sem `Nova subtarefa`, como a lista do quadro em modo leitura.
26. Dada uma próxima tarefa com subtarefas, então o item em `Próximas tarefas` mostra `<total> subtarefas · <estimativa>`. Sem subtarefas, mostra só a estimativa, como hoje.
27. Dado o widget compacto do desktop e uma tarefa em foco com subtarefas, então um selo `<feitas>/<total>` aparece entre o título e o tempo, e o widget continua com 300×64. Sem subtarefas, o selo não aparece (canvas #16, artboard `Widget`, forma A).
28. Dado o widget com os controles visíveis, então há um botão de ícone `Subtarefas` à esquerda de `Anotações`. Quando o usuário clica nele, então o widget cresce para 300×240, o mesmo tamanho do painel de anotações, e mostra a lista de subtarefas com caixa de seleção abaixo dos controles (canvas #16, artboard `Widget`, forma C).
29. Quando o usuário abre `Anotações` com o painel de subtarefas aberto (ou o contrário), então um painel substitui o outro, e o widget continua com 300×240. Fechar o painel volta o widget para 300×64.
30. Quando o usuário marca uma subtarefa no painel do widget, então o selo do widget e o cartão da tela de foco na janela principal mostram a nova contagem depois do `notifyFocusChanged`.
31. Sempre, `GET /api/focus` e as respostas das ações do foco trazem, em `task` e em cada item de `today.tasks`, o campo `subtasks: { done, total }` com as contagens atuais da tarefa.

## Out of scope

- O botão de abrir sem iniciar na web - a issue pede só o desktop, e o design validou assim.
- Reordenar tarefas no widget - nenhum design mostra isso, e o widget compacto não tem a fila.
- Renomear, reordenar ou excluir subtarefas no widget - o design C mostra só marcar.
- Marcar subtarefas sem conexão (pela fila offline do foco) - está em aberto na #16 (Unresolved 4).
- A Agenda (#19) - ficou para um lote seguinte.

## Observable

| Surface | Decision | Landing |
| --- | --- | --- |
| screen `Quadro` (coluna Hoje) | botão novo e seu estado desabilitado | 1, 2, 4 |
| screen `Quadro` (coluna Hoje) | viewer | Unresolved 2 |
| screen `Foco` | estado sem iniciar | 5, 6, 7 |
| screen `Foco` | carregando | existing - `Skeleton` antes do primeiro estado |
| screen `Foco` | erro ao reordenar | 13 |
| screen `Foco` | fila vazia (nada para reordenar) | existing - a lista `Próximas tarefas` não aparece sem itens |
| screen `Foco` | viewer | 9, 25 |
| screen `Foco` | ação destrutiva confirma | n/a - trocar a tarefa em foco preserva o tempo, e nada é apagado |
| screen `Foco` | subtarefas: vazio, todas feitas, lista longa | 22, 23, 24 |
| screen `Foco` | ordenação das subtarefas | existing - a ordem da `SubtaskList` do quadro |
| screen `Widget` | compacto com e sem subtarefas | 27 |
| screen `Widget` | painel de subtarefas | 28, 29 |
| screen `Widget` | erro ao marcar subtarefa | existing - a `SubtaskList` mostra o erro da API |
| API `GET /api/focus` | forma da resposta | 31 |
| API `POST /api/tasks/:id/move` | erro e códigos | existing - a rota do quadro, sem mudança |

## Swept

- validation: 21 (título da subtarefa); a posição de `move` é validada pela rota que já existe
- failure modes: 13
- idempotency and retry: existing - a ação `start` do critério 16 passa pela fila do foco com `action_id`; `move` é chamado de novo só por novo arraste
- authorization: existing - `requireWrite` nas rotas de tarefas e subtarefas, `viewer` recebe 403; 9 e 25 escondem as ações
- concurrency and ordering: 14 (poll durante o arraste); 30 (duas janelas do desktop)
- data lifecycle: n/a - nenhum dado novo é guardado; a contagem de 31 é calculada na leitura
- external-dependency failure: n/a - o lote não chama serviço externo
- state transitions: 6, 16, 17
- observability: n/a - o frontend não tem telemetria, e o backend só ganha um campo na leitura

## Impact

| Front | What changes |
|---|---|
| domain | nenhum termo novo; `subtasks: { done, total }` já existe em `TaskCardView` e passa a existir também em `FocusState.task` e `FocusState.today.tasks[]` |
| domain | existing term: o botão principal parado dizia sempre `Retomar`; passa a dizer `Começar` quando `spent_seconds` é 0 - `FocusControls` na tela de foco e `WidgetControls` no widget usam o mesmo rótulo hoje |
| contract | `FocusState` ganha um campo; o schema de resposta em `backend-node/src/routes/focus.ts` e o tipo em `frontend/src/types/index.ts` mudam juntos |
| stored data | nothing to migrate. Respostas antigas guardadas em `focus_actions.response` (devolvidas quando um `action_id` é reenviado) não têm o campo: o cliente trata `subtasks` ausente como sem subtarefas |
| cache | a `SubtaskList` invalida só `['lists']`; no foco, marcar uma subtarefa precisa invalidar também a query do foco (`['focus', listId]`) para a contagem do critério 31 |
| code | o efeito de início de `frontend/src/pages/focus.tsx` foi alterado pelo PR #17 (`toWidget(reachedServer)`); este lote parte da branch dele, ou da `main` depois do merge |
| desktop | nenhuma mudança no processo principal: o painel de subtarefas usa o tamanho `notes` (300×240) que `resizeWidget` já aceita |

## Decided

| Decision | Shape | Alternative rejected |
|---|---|---|
| Contagem de subtarefas no estado do foco | campo `subtasks: { done: number, total: number }` em `FocusState.task` e em cada item de `FocusState.today.tasks`, com a forma de `TaskCardView.subtasks` | buscar `GET /api/tasks/:id` por item da fila: uma requisição por próxima tarefa a cada poll de 15 s, e o widget precisaria de outra só para o selo |

## Surface

| Route | In | Out | Status | Criteria |
|---|---|---|---|---|
| `GET /api/focus` e respostas de `POST /api/focus/*` | sem mudança | `task.subtasks`, `today.tasks[].subtasks` (`done`, `total`) | sem mudança | 26, 27, 31 |

## Sources

- [gabrielauzier/trackzyn#14](https://github.com/gabrielauzier/trackzyn/issues/14) e o [comentário de design](https://github.com/gabrielauzier/trackzyn/issues/14#issuecomment-6621353261): define o escopo (desktop, sem cronômetro e sem widget) e a opção A.
- [Canvas #14](https://claude.ai/artifact/5MDXaEgmGMGkuChX9EGJEM): **binding for the interface**. Artboard `Quadro · coluna Hoje` (ícone de olho à direita de `Focar agora`, dica `Abrir o foco sem iniciar o cronômetro`) e artboard `Foco aberto sem iniciar` (borda tracejada, tempo em cinza, selo `Cronômetro parado`, botões `Começar`, `Pular`, `Concluir`).
- [gabrielauzier/trackzyn#15](https://github.com/gabrielauzier/trackzyn/issues/15) e o [comentário de design](https://github.com/gabrielauzier/trackzyn/issues/15#issuecomment-6621353580): define a regra 2 (soltar sobre o cartão em foco troca a tarefa).
- [Canvas #15](https://claude.ai/artifact/3VDXGP8qd2LxZATGVf5jZq): **binding for the interface**. Artboards `Próximas tarefas com alça` (alça de seis pontos, anúncio de posição), `Arrastando com o mouse` (item com sombra, espaço tracejado) e `Arrastar para o topo`, coluna 2 (área de soltar `Solte para focar nesta agora`, controles esmaecidos).
- [gabrielauzier/trackzyn#16](https://github.com/gabrielauzier/trackzyn/issues/16) e o [comentário de design](https://github.com/gabrielauzier/trackzyn/issues/16#issuecomment-6621353876): define o widget A + C.
- [Canvas #16](https://claude.ai/artifact/UkpT5vUKvbFVuwEcAuW46q): **binding for the interface**. Artboards `Tela de foco com subtarefas` (cabeçalho `Subtarefas` com barra e `1/4`, lista com caixa de seleção, `Nova subtarefa`, próximas com `2 subtarefas · 1h`), `Widget` formas A (selo `1/4`, 300×64) e C (ícone `Subtarefas` ao lado de `Anotações`, painel 300×240) e `Estados` (`Adicionar subtarefa`, `Tudo feito por aqui.` com `Concluir tarefa`, lista longa).
- Código: `startFocus` em `backend-node/src/services/focus.ts` já encerra a sessão anterior com `switch` ao iniciar outra tarefa (SYNC-04), o que sustenta o critério 16 sem uma ação nova.

This task is the record of decision. If a linked document diverges, ask before building.

## Unresolved

| # | Kind | Question | Until answered |
|---|---|---|---|
| 1 | open | O rótulo `Começar` (critério 5) vale para qualquer tarefa parada com `spent_seconds` igual a 0, ou só quando a tela foi aberta pelo botão novo? | Escrito como regra por `spent_seconds`, que também muda o rótulo do widget quando a tarefa nunca contou. |
| 2 | open | Um `viewer` vê o botão de abrir sem iniciar? | Escrito como habilitado só para quem pode editar, igual a `Focar agora` (critério 4 cobre o vazio). |
| 3 | open | O selo `Cronômetro parado` e a borda tracejada (critério 5) aparecem também depois de `Pausar`, ou só antes de começar? | Escrito como só antes de começar (`spent_seconds` igual a 0); depois de `Pausar` a tela fica como hoje. |
| 4 | open | Marcar subtarefas funciona sem conexão? | Escrito como só com conexão: sem rede, a API falha e a `SubtaskList` mostra o erro. |
| 5 | open | O design da lista longa mostra `Mostrar mais 4 · ocultar 2 feitas`, e o critério 24 simplificou para `Mostrar todas (<total>)`. | Escrito com `Mostrar todas`; trocar o texto não muda a estrutura. |
