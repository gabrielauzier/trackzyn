# Leva de melhorias gerais: quadro, tela inicial, sidebar, foco e widget (#30 a #34)

> Build this with **tlc-implement** (`.claude/skills/tlc-implement`).
> Every criterion below becomes a check with a proof, referenced by its number. Nothing under
> `Unresolved` gets settled while building.

## Intent

Hoje, no quadro, `Focar agora` fica no rodapé da coluna Hoje e some da tela quando a lista cresce; a coluna Concluídas mostra a última tarefa concluída por último; cada card tem uma checkbox que conclui a tarefa fora do gesto de mover o card; o título corta numa linha só; e a estimativa só muda pelo diálogo, em minutos. Na tela inicial, nada indica que o card da lista pode ser arrastado, o arrasto começa até sobre o título, e as tarefas do card são só texto, sem estimativa nem subtarefas. `Arquivos` e `Componentes` aparecem e abrem para qualquer usuário. Na tela de foco não dá para ver nem escrever a anotação da tarefa, e depois de concluir todas as subtarefas não dá para adicionar outra (#28). No widget do desktop, os botões de ação aparecem por um instante na abertura e nunca mais voltam, então o foco não pode ser controlado pelo widget. As issues não trazem números sobre esse custo; os relatos são do próprio uso.

Com esta leva:
- **Quadro (#30):** os botões do foco ficam no topo da coluna Hoje, fixos ao rolar; Concluídas mostra a mais recente primeiro; concluir é mover o card, e a checkbox vira um ícone de check só em Concluídas; o título quebra em até 3 linhas; a estimativa é editada no próprio card, num campo `HH:MM` próprio, que também substitui o campo de minutos no diálogo da tarefa.
- **Tela inicial (#31):** o card da lista mostra a mãozinha onde o arrasto começa e não arrasta sobre o título nem sobre o `⋮`; as tarefas aparecem como os itens de `Próximas tarefas`, até 3 por card.
- **Sidebar e permissões (#32):** `Arquivos` e `Componentes` só para superusuário, com o selo `admin`, nas abas, nas rotas, na paleta e na API de arquivos.
- **Foco (#33):** o cartão em foco ganha a ação `Anotação`; a linha `Subtarefas` ganha o botão de mostrar e esconder.
- **Widget (#34):** os botões voltam a aparecer com o mouse sobre o widget, que continua arrastável inteiro.

O design aprovado está em `Sources` e é vinculante.

44 critérios em 5 slices · 2 portas de mão única · 4 abertas, 0 bloqueiam

## Criteria

### Quadro: coluna Hoje, Concluídas, concluir movendo e título (#30)

1. Dado o quadro de uma lista, então a coluna `Hoje` mostra a linha com `Focar agora` e o botão do olho (`Abrir o foco sem iniciar o cronômetro`, só no desktop) logo abaixo da barra de progresso `<feitas>/<total> Concluídas` e antes da primeira tarefa. O rodapé da coluna não tem mais essa linha (design, prancheta `Quadro · itens 1, 2, 6, 7`).
2. Enquanto a página rola e as tarefas da coluna `Hoje` passam por baixo da linha de botões, a linha continua visível no topo da área rolável, com o fundo da coluna e uma sombra embaixo.
3. Sempre, os botões da linha seguem as regras de hoje: desabilitados com `Hoje` sem pendentes ou para `viewer`, e o olho só no desktop.
4. Dado um dia de `Concluídas` com várias tarefas, então elas aparecem por `completed_at` decrescente: a última concluída no topo. Os dias continuam do mais novo para o mais antigo.
5. Quando uma tarefa é concluída no quadro (arrastando para `Concluídas` ou pela seta das ações rápidas), então ela aparece na hora no topo do dia de hoje em `Concluídas`, e continua no topo depois que o quadro é recarregado.
6. Dado um card nas colunas `Backlog`, `Esta semana` ou `Hoje`, então ele não tem checkbox: em `Hoje`, o título vem logo depois do número da ordem; nas outras, começa na borda do card.
7. Dado um card em `Concluídas`, então ele mostra à esquerda do título um ícone de check na cor primária, com `aria-label` `Concluída`, que não é um controle (não recebe foco nem clique), e o título riscado em cinza.
8. Quando o usuário arrasta um card para `Concluídas` ou usa a seta das ações rápidas de um card de `Hoje`, então a tarefa é concluída como hoje: toca o som de conclusão uma vez e, se era a tarefa em foco, encerra o foco dela.
9. Dado um card com título de mais de 3 linhas na largura da coluna, então o título mostra 3 linhas e termina em reticências; com até 3 linhas, aparece inteiro. Palavras sem espaço quebram em vez de passar da borda. O título completo fica na dica do botão (`title`). Vale nas quatro colunas e no card arrastado.

### Quadro: estimativa editável em `HH:MM` (#30)

10. Dado um usuário que pode editar, quando passa o mouse sobre a estimativa de um card, então ela ganha um fundo leve e um ícone de lápis, e o cursor vira o de texto (design, prancheta `Card · estimativa HH:MM (item 8)`, estado `Mouse em cima`).
11. Quando o usuário clica na estimativa, então ela vira, no mesmo lugar, um campo com o valor em `HH:MM` (ex.: `01:30` para 90 minutos), com foco, com 20 px de altura e fonte de 12 px, sem mudar a altura do card. O clique não abre o diálogo da tarefa nem começa o arrasto.
12. Dado um card sem estimativa e um usuário que pode editar, então o lugar da estimativa mostra um alvo clicável que abre o mesmo campo vazio.
13. Enquanto o campo está aberto, ele aceita só dígitos, o `:` fica fixo entre horas e minutos, e o cursor passa por ele ao digitar.
14. Quando o usuário aperta `Enter` ou sai do campo com um valor de `00:01` a `24:00` e minutos de `00` a `59`, então `PATCH /api/tasks/:id` é enviado com `estimate_minutes` em minutos, o campo volta a texto no formato de hoje (`1h 30min`) e a estimativa da coluna e de `Esta lista tem N tarefas pendentes, Est.:` mudam.
15. Quando o usuário apaga o campo e sai, então `estimate_minutes: null` é enviado e o card deixa de mostrar estimativa.
16. Se o valor tem minutos acima de `59` ou passa de `24:00`, então o campo ganha borda vermelha e o aviso `Minutos de 00 a 59` (ou o de limite), nada é enviado, e ao sair o campo volta ao valor anterior.
17. Quando o usuário aperta `Esc`, então nada é enviado e o campo volta ao valor anterior.
18. Se o `PATCH` falha, então a estimativa volta ao valor anterior e aparece um toast com a mensagem da API.
19. Dado um `viewer`, então a estimativa é só texto, sem fundo, lápis ou campo.
20. Dado o diálogo da tarefa, então o campo `Estimativa` usa o mesmo formato `HH:MM`, com a dica `HH:MM · deixe vazio para sem estimativa`, no lugar do campo `Estimativa (minutos)`, com as mesmas regras de 13 a 16.

### Tela inicial: card da lista (#31)

21. Dado um usuário que pode editar, quando o mouse está sobre o corpo do card de uma lista, então o cursor é `grab`; enquanto arrasta, `grabbing`.
22. Quando o mouse está sobre o título da lista, então o cursor é o de link e o título fica sublinhado; pressionar e arrastar a partir do título não move o card, e clicar abre o quadro da lista.
23. Quando o mouse está sobre o `⋮`, então o cursor é o normal; pressionar e arrastar a partir dele não move o card, e clicar abre o menu.
24. Dado um `viewer`, então o card não mostra cursor de arrasto. A reordenação pelo teclado continua como hoje para quem pode editar.
25. Dada uma lista com tarefas pendentes, então o card mostra até 3 delas como linhas com borda e cantos arredondados: o título truncado à esquerda e, à direita, `<n> subtarefa(s) · <estimativa>`, só a parte que existir (ex.: `1 subtarefa · 30min`, `2h`, ou nada). Sem a alça de reordenar (design, prancheta `Tela inicial · itens 3 e 4`).
26. Dada uma lista com 0, 1 ou 2 tarefas pendentes, então o card tem a mesma altura de um card com 3, e o espaço que sobra fica vazio, sem linhas desenhadas.
27. Sempre, cada item de `preview` em `GET /api/lists` traz `estimate_minutes` (número ou `null`) e `subtasks: { done, total }` da tarefa. Com um token sem `tasks:read`, `preview` continua vazio.

### Sidebar e permissões: `Arquivos` e `Componentes` só para admin (#32)

28. Dado um usuário com `is_superuser`, então a sidebar mostra `Arquivos` (grupo `WORKSPACE`) e `Componentes` (grupo `DESENVOLVIMENTO`), cada um com o selo `admin` à direita do nome (design, prancheta `Sidebar · item 5`, `SUPERUSUÁRIO`).
29. Dada a sidebar recolhida e um superusuário, então os ícones de `Arquivos` e `Componentes` têm um ponto na cor primária no canto, e o nome acessível e a dica são `Arquivos (admin)` e `Componentes (admin)`.
30. Dado um usuário sem `is_superuser`, então a sidebar não mostra `Arquivos`, `Componentes` nem o cabeçalho `DESENVOLVIMENTO`.
31. Dado um usuário sem `is_superuser`, quando ele abre `/files` ou `/components` pelo endereço, então o app redireciona para `/`.
32. Dado um usuário sem `is_superuser`, então a paleta (`⌘K`) não lista `Arquivos`, `Componentes` nem a ação `Enviar arquivo`.
33. Dado um usuário sem `is_superuser` (por sessão ou por token), quando ele chama qualquer rota de `/api/files`, então a API responde `403`. Um superusuário continua usando as rotas como hoje.

### Foco: anotação e subtarefas (#33)

34. Dada a tela de foco com uma tarefa em foco, então o cartão mostra, abaixo das subtarefas e separada por uma linha, a ação `Anotação` (ícone de nota). Sem anotação, o rótulo fica em cinza (design, prancheta `Foco · itens 9 e 10`, A).
35. Quando o usuário clica em `Anotação`, então abre abaixo dela o editor da anotação da tarefa, com o texto atual (vazio quando não há), com foco, e a indicação `Salva ao sair` (prancheta, C).
36. Quando o usuário sai do editor com o texto alterado, então `PATCH /api/tasks/:id` é enviado com `notes`; o mesmo texto aparece na anotação da tarefa no quadro e no widget. Texto acima de `NOTES_MAX` mostra o erro que o widget já mostra e não é enviado.
37. Dada uma tarefa com anotação e o editor fechado, então a linha mostra `Anotação` com o ícone na cor primária e o começo do texto, truncado em uma linha.
38. Quando a tarefa em foco muda (Pular, Concluir, soltar uma próxima sobre o cartão) com o editor aberto, então o texto alterado é salvo e o editor fecha.
39. Dado um `viewer`, então a anotação aparece só para leitura, sem editor.
40. Dada uma tarefa em foco com subtarefas, então a linha `Subtarefas <feitas>/<total>` tem, à direita, um botão de chevron com `aria-expanded` e `aria-label` `Mostrar subtarefas` ou `Esconder subtarefas`.
41. Dada uma tarefa com todas as subtarefas feitas, então a lista começa recolhida, mostrando `Tudo feito por aqui.` e `Concluir tarefa`. Quando o usuário abre o chevron, então aparecem as subtarefas concluídas (riscadas, com a caixa marcada), `Adicionar subtarefa` e, abaixo, `Tudo feito por aqui.` com `Concluir tarefa` (prancheta, A e B).
42. Quando o usuário adiciona uma subtarefa com a lista aberta, então ela aparece pendente, a contagem passa a `<feitas>/<total+1>`, e `Tudo feito por aqui.` some.

### Widget: botões de ação (#34)

43. Dado o widget compacto do desktop (300×64), quando o cursor entra nos limites da janela do widget, então a linha de botões aparece abaixo do título e do cronômetro, nos mesmos 300×64; quando sai, ela some 150 ms (`HIDE_DELAY_MS`) depois. Isso vale na abertura e em qualquer momento depois dela (design, prancheta `Widget · item 11`, `Mouse em cima` e caminho 2).
44. Sempre, a janela do widget continua arrastável por qualquer ponto fora da linha de botões, como hoje, e a linha de botões, quando visível, recebe os cliques sem arrastar a janela.

## Out of scope

- Editar o tempo gasto no card - decidido na revisão: o tempo gasto vem das sessões de foco e é corrigido pela Agenda.
- Hora de conclusão no card de `Concluídas` - não pedido; a ordem do critério 4 não depende dela.
- Reordenar à mão dentro de `Concluídas` - o quadro já não permite hoje (`Concluídas is ordered by day`).
- Mudar o limite do `preview` na API (continua 4) - o MCP (`list_lists`) usa a mesma prévia; o card mostra só as 3 primeiras.
- Restringir `Arquivos` pelo papel no workspace - decidido: admin é o superusuário da instância.
- Anotação pela fila offline do foco - decidido: só com conexão, como as subtarefas.
- Atualização entre telas depois de alterar uma tarefa - é a #35, fora desta leva.

## Observable

| Surface | Decision | Landing |
| --- | --- | --- |
| screen `Quadro` (coluna Hoje) | posição e rolagem dos botões | 1, 2 |
| screen `Quadro` (coluna Hoje) | vazio e viewer | 3 |
| screen `Quadro` (Concluídas) | ordenação | 4, 5 |
| screen `Quadro` (Concluídas) | vazio | existing - a coluna mostra `Tudo limpo` sem tarefas |
| screen `Quadro` (card) | densidade do título | 9 |
| screen `Quadro` (card) | concluir sem arrastar | 8; Unresolved 1 |
| screen `Quadro` (estimativa) | vazio, edição, inválido, erro, viewer | 12, 11, 16, 18, 19 |
| screen `Quadro` (estimativa) | carregando | n/a - a edição é otimista no campo; o card não tem estado de carregamento próprio |
| screen `Diálogo da tarefa` | campo de estimativa | 20 |
| screen `Tela inicial` (card) | cursores e viewer | 21, 22, 23, 24 |
| screen `Tela inicial` (card) | lista vazia e com menos de 3 | 26 |
| screen `Tela inicial` (card) | ordenação das tarefas | existing - Hoje, Esta semana, Backlog, na ordem da coluna (`services/lists.ts`) |
| screen `Tela inicial` | carregando e erro | existing - a página de listas não muda |
| screen `Sidebar` | admin aberta, recolhida, outros | 28, 29, 30 |
| screen `/files`, `/components` | não autorizado | 31 |
| screen `Paleta ⌘K` | não autorizado | 32 |
| screen `Foco` (anotação) | vazio, edição, erro, viewer | 34, 35, 36, 39 |
| screen `Foco` (anotação) | troca de tarefa com editor aberto | 38 |
| screen `Foco` (subtarefas) | todas feitas, aberto, nova subtarefa | 41, 42 |
| screen `Foco` (subtarefas) | com pendentes | 40; Unresolved 3 |
| screen `Widget` | botões com o mouse | 43, 44 |
| screen `Widget` (subtarefas) | todas feitas | existing - o painel do widget usa a `SubtaskList` em `toggleOnly`, que sempre lista todas |
| API `PATCH /api/tasks/:id` | forma e erro | existing - a rota não muda; 18 e 36 mostram a mensagem da API |
| API `GET /api/lists` | forma da resposta | 27 |
| API `/api/files` | quem pode chamar e código | 33 |

## Swept

- validation: 13, 16 (estimativa, de `00:01` a `24:00`, minutos até `59`); 36 (`NOTES_MAX`); a API já valida `estimate_minutes` de 1 a 1440
- failure modes: 18, 36
- idempotency and retry: n/a - `PATCH` de estimativa e de anotação grava o valor final, e repetir dá o mesmo resultado
- authorization: 19, 24, 39 (viewer); 30 a 33 (superusuário); existing - `requireWrite` nas rotas de tarefas, `requireSuperuser` de `authGuards`
- concurrency and ordering: 38 (troca da tarefa em foco com o editor aberto); 5 (atualização otimista em Concluídas antes da resposta)
- data lifecycle: n/a - nada novo é guardado; `preview` ganha campos calculados na leitura
- external-dependency failure: n/a - a leva não chama serviço externo
- state transitions: 41, 42 (recolhido e aberto das subtarefas); 43 (botões do widget visíveis e escondidos)
- observability: n/a - o frontend não tem telemetria, e o backend só muda a leitura de `preview` e a guarda de `/api/files`

## Impact

| Front | What changes |
|---|---|
| domain | nenhum termo novo |
| domain | existing term: marcar a checkbox do card concluía a tarefa (`onComplete` do `TaskCard`, chamado por `list-board.tsx`); deixa de existir. Concluir no quadro passa a ser só mover para `Concluídas` (`complete` em `list-board.tsx`, já usado pelo arrasto e pela seta) |
| domain | existing term: `Arquivos` era do workspace, aberto a qualquer membro; passa a exigir superusuário. Quem usa `/api/files` por token sem ser superusuário passa a receber `403`. O único cliente no app é `pages/files.tsx`; `stats.files` das configurações do workspace vem de outra rota e não muda |
| contract | `GET /api/lists`: cada item de `preview` ganha `estimate_minutes` e `subtasks`. O MCP `list_lists` usa a mesma função (`services/lists.ts`) e passa a devolver os campos também |
| code | `placeInDone` em `pages/list-board.tsx` põe a tarefa no fim do dia de hoje (`[...first.tasks, moved]`); precisa pôr no início para o critério 5 |
| code | o campo `HH:MM` é um componente novo; `estimate.ts` hoje valida minutos em texto (`isValidEstimate`, `toEstimate`) e passa a converter `HH:MM` |
| desktop | o processo principal passa a acompanhar a posição do cursor contra os limites da janela do widget e a avisar a página por um canal novo em `desktop/src/shared/ipc.ts` e no preload; `WidgetControls` passa a ler esse aviso em vez de `onMouseOver`/`onMouseLeave` |
| stored data | nothing to migrate |

## Decided

| Decision | Shape | Alternative rejected |
|---|---|---|
| Campos novos na prévia da lista | cada item de `preview` em `GET /api/lists`: `{ id, title, estimate_minutes: number \| null, subtasks: { done: number, total: number } }`, a forma de `TaskCardView` | buscar `GET /api/lists/:id/board` por card na tela inicial: uma requisição por lista só para três linhas |
| `/api/files` só para superusuário | todas as rotas de `routes/files.ts` com `requireSuperuser` além de `requireUser`; sem permissão, `403` | restringir só na interface: a API continuaria aberta a qualquer membro e a token, e a restrição seria só visual |

## Surface

| Route | In | Out | Status | Criteria |
|---|---|---|---|---|
| `GET /api/lists` | sem mudança | `preview[].estimate_minutes`, `preview[].subtasks` (`done`, `total`) | sem mudança | 25, 27 |
| `GET/POST/DELETE /api/files…` | sem mudança | sem mudança | `403` para quem não é superusuário | 33 |

## Sources

- [gabrielauzier/trackzyn#30](https://github.com/gabrielauzier/trackzyn/issues/30), [#31](https://github.com/gabrielauzier/trackzyn/issues/31), [#32](https://github.com/gabrielauzier/trackzyn/issues/32), [#33](https://github.com/gabrielauzier/trackzyn/issues/33), [#34](https://github.com/gabrielauzier/trackzyn/issues/34): escopo de cada tela e as decisões da revisão.
- `.specs/leva-melhorias-gerais.md`: os itens 1 a 11, a seção `Decisões (revisão de 2026-11-06)` e onde mexer no código.
- [Design aprovado](https://claude.ai/artifact/6CDUrnwb8Rv5VpqFXrk4ib): **binding for the interface**.
  - `Quadro · itens 1, 2, 6, 7`: linha `Focar agora` + olho abaixo de `1/5 Concluídas`, com sombra; cards de Hoje com número e sem checkbox; título longo cortado na 3ª linha; Concluídas com ícone de check roxo e título riscado.
  - `Card · estimativa HH:MM (item 8)`: estados `Repouso` (`1h`), `Mouse em cima` (fundo e lápis), `Editando` (`01:30`, 20 px, 12 px), `Inválido` (`01:75`, borda vermelha, `Minutos de 00 a 59`); diálogo com `Estimativa` em `HH:MM` e a dica `HH:MM · deixe vazio para sem estimativa`.
  - `Tela inicial · itens 3 e 4`: até 3 linhas com borda e `<n> subtarefa(s) · <estimativa>`; legenda dos cursores (corpo, título, `⋮`).
  - `Sidebar · item 5`: selo `admin` em `Arquivos` e `Componentes`; ponto roxo na sidebar recolhida; visão `OUTROS USUÁRIOS` sem as duas abas e sem `DESENVOLVIMENTO`.
  - `Foco · itens 9 e 10`: A (recolhido, `3/3`, chevron, `Tudo feito por aqui.`, `Concluir tarefa`, `Anotação` em cinza), B (aberto, concluídas, `Adicionar subtarefa`), C (editor aberto, `Salva ao sair`; fechada com o começo do texto).
  - `Widget · item 11`: `Repouso` e `Mouse em cima` em 300×64 (Pausar, Pular, Concluir, Intervalo à esquerda; Subtarefas, Anotação, Expandir à direita); caminho 2 aprovado: arrasto na janela toda, cursor lido pelo app.
- Código: `onDragEnd` e `step` em `frontend/src/pages/list-board.tsx` já concluem ao mover para `Concluídas`, o que sustenta o critério 8 sem a checkbox.

This task is the record of decision. If a linked document diverges, ask before building.

## Unresolved

| # | Kind | Question | Until answered |
|---|---|---|---|
| 1 | open | Sem a checkbox, concluir um card de `Backlog` ou `Esta semana` sem arrastar exige várias setas das ações rápidas. Vale um atalho (ex.: `Concluir` no menu `⋯` do card)? | Escrito sem atalho novo: arrasto (mouse e teclado) e as setas continuam os caminhos (critério 8). |
| 2 | open | A estimativa de um card em `Concluídas` também é editável no card? | Escrito como editável em todas as colunas para quem pode editar (critérios 10 a 18); só o `viewer` não edita (19). |
| 3 | open | Com subtarefas pendentes, a lista do foco começa aberta ou recolhida? | Escrito como aberta, como hoje; o chevron (40) permite recolher. Só com tudo feito ela começa recolhida (41). |
| 4 | open | O selo e o ponto de `admin` (28, 29) aparecem também na paleta `⌘K` para o superusuário? | Escrito sem selo na paleta; ela só deixa de listar as telas para quem não é admin (32). |
