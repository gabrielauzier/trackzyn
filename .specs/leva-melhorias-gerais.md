# Leva de melhorias e correções gerais

Início: 2026-11-06 · Branch de referência: `feat/agenda`

Backlog para virar issues no GitHub (`gabrielauzier/trackzyn`). Cada item tem um tipo, a área, o que acontece hoje, o que se espera e onde mexer no código (quando já localizado).

Tipos: `bug` · `melhoria` · `ux` · `tech-debt`

## Índice

| # | Tipo | Área | Título | Issue |
| --- | --- | --- | --- | --- |
| 1 | ux | quadro | Levar `Focar agora` e o olho para o topo da coluna Hoje | [#30](https://github.com/gabrielauzier/trackzyn/issues/30) |
| 2 | bug | quadro | Concluídas: a tarefa concluída mais recente deve vir primeiro | [#30](https://github.com/gabrielauzier/trackzyn/issues/30) |
| 3 | ux | listas (início) | Cursor de arrasto no card da lista e sem arrasto sobre o título | [#31](https://github.com/gabrielauzier/trackzyn/issues/31) |
| 4 | melhoria | listas (início) | Tarefas do card da lista no formato de `Próximas tarefas` do foco | [#31](https://github.com/gabrielauzier/trackzyn/issues/31) |
| 5 | melhoria | sidebar · permissões | `Arquivos` e `Componentes` só para admin, com selo `admin` | [#32](https://github.com/gabrielauzier/trackzyn/issues/32) |
| 6 | melhoria | quadro | Checkbox só em Concluídas e só leitura; concluir é mover o card | [#30](https://github.com/gabrielauzier/trackzyn/issues/30) |
| 7 | ux | quadro | Título da tarefa inteiro no card, truncado só depois de 3 linhas | [#30](https://github.com/gabrielauzier/trackzyn/issues/30) |
| 8 | melhoria | quadro | Editar estimativa e tempo gasto direto no card, com um campo `HH:MM` próprio | [#30](https://github.com/gabrielauzier/trackzyn/issues/30) |
| 9 | melhoria | foco | Criar e editar a anotação da tarefa pela tela de foco | [#33](https://github.com/gabrielauzier/trackzyn/issues/33) |
| 10 | bug | foco | Com todas as subtarefas concluídas, não dá para adicionar outra | [#33](https://github.com/gabrielauzier/trackzyn/issues/33) (resolve [#28](https://github.com/gabrielauzier/trackzyn/issues/28)) |
| 11 | bug | widget (desktop) | Os botões de ação do widget aparecem por um instante e somem para sempre | [#34](https://github.com/gabrielauzier/trackzyn/issues/34) |

### Fora desta leva

- [#35](https://github.com/gabrielauzier/trackzyn/issues/35) (bug, tech-debt): tarefa alterada numa tela não aparece atualizada nas outras (ex.: concluída no foco continua em Hoje no quadro; estimativa alterada no quadro não chega ao foco). Só registro, para uma leva futura.

## Decisões (revisão de 2026-11-06)

- **Item 1:** os botões `Focar agora` e olho vão para o topo da coluna Hoje e ficam fixos (`sticky`) enquanto a coluna rola.
- **Item 2:** cada dia de Concluídas é ordenado por `completed_at` decrescente na leitura; a reordenação manual dentro de Concluídas deixa de valer.
- **Item 3:** o menu `⋮` também não inicia o arrasto.
- **Item 4:** até 3 tarefas por card, com altura fixa e espaço vazio sem linhas desenhadas.
- **Item 5:** admin é o superusuário da instância (`is_superuser`); a restrição vale na tela (abas, rotas, paleta) e na API de arquivos.
- **Item 6:** em Concluídas, a checkbox vira um ícone de check só de leitura.
- **Item 7:** a regra das 3 linhas vale para todas as colunas, Concluídas inclusive.
- **Item 8:** no card, só a estimativa fica editável (`HH:MM`); o tempo gasto continua vindo das sessões e é corrigido pela Agenda. Não editável para `viewer`.
- **Item 9:** a anotação é o campo `notes` da tarefa, só com conexão.
- **Item 10:** o botão de mostrar/esconder fica sempre na linha `Subtarefas`; com tudo feito, começa recolhido. Resolve #28.
- **Item 11:** caminho 2. A janela continua arrastável inteira, como hoje; o processo principal do desktop compara a posição do cursor com os limites da janela e avisa a página por IPC para mostrar ou esconder os botões. A linha de botões, quando visível, não arrasta.

## Design aprovado

https://claude.ai/artifact/6CDUrnwb8Rv5VpqFXrk4ib (aprovado em 2026-11-06). Uma prancheta por tela: quadro (itens 1, 2, 6, 7), estimativa (8), tela inicial (3, 4), sidebar (5), foco (9, 10) e widget (11, caminho 2).

## Itens

### 1. Levar `Focar agora` e o olho para o topo da coluna Hoje

- **Tipo:** ux
- **Área:** frontend · quadro (coluna Hoje)
- **Hoje:** `Focar agora` e o botão do olho (`Abrir o foco sem iniciar`, só no desktop) ficam no rodapé da coluna (`mt-auto`), depois das tarefas e de `Adicionar tarefa`. Com a lista grande, saem da tela e é preciso rolar até o fim para usá-los.
- **Esperado:** a linha com os dois botões fica no topo da coluna, entre o cabeçalho/barra de progresso (`0/2 Concluídas`) e a primeira tarefa, sempre visível sem rolar.
- **Onde:** `frontend/src/components/board/board-column.tsx` (bloco `column === 'today'` no fim do `<section>`, mover para antes da lista de `view.tasks`). Testes em `board-column.test.tsx`.
- **Notas:** manter as regras atuais (desabilitados sem pendentes ou para `viewer`, olho só no desktop). Avaliar se a linha deve ficar fixa (`sticky`) quando a coluna rola, ou se basta estar no topo.

### 2. Concluídas: a tarefa concluída mais recente deve vir primeiro

- **Tipo:** bug
- **Área:** backend-node · quadro (coluna Concluídas)
- **Hoje:** dentro de cada dia, as tarefas concluídas aparecem da mais antiga para a mais recente. Os dias já vêm do mais novo para o mais antigo, mas as tarefas de um dia seguem `ORDER BY t.position, t.created_at`. Ao concluir, `moveTask` põe a tarefa no fim da coluna `done` (`beforeTaskId` nulo), e por isso a última concluída fica embaixo.
- **Esperado:** em cada dia, ordem por `completed_at` decrescente: a última concluída no topo.
- **Onde:** `backend-node/src/services/board.ts` (`buildBoard`, montagem de `days` a partir de `doneRows`; hoje o `TaskRow` não traz `completed_at`, só `completed_date`). Ver também `moveTask` em `backend-node/src/services/tasks.ts`, se a opção for inserir no início de `done`.
- **Notas:** decidir entre ordenar por `completed_at DESC` na leitura (mais simples, ignora `position` em `done`) ou inserir no topo ao concluir (mantém a reordenação manual dentro de Concluídas, se ela existir). Conferir as tarefas criadas já concluídas `via Agenda` e o widget/foco, se mostram a mesma lista.

### 3. Cursor de arrasto no card da lista e sem arrasto sobre o título

- **Tipo:** ux
- **Área:** frontend · tela inicial (`Suas listas`)
- **Hoje:** o card inteiro é a área de arrasto para reordenar as listas (o wrapper `SortableListCard` recebe `listeners` e é o `activator`), mas o cursor não muda: nada indica que dá para arrastar. O arrasto também começa sobre o título da lista, que é o link para o quadro.
- **Esperado:**
  - nas áreas que iniciam o arrasto, o cursor vira a mãozinha (`cursor-grab`, e `cursor-grabbing` enquanto arrasta);
  - sobre o título/link da lista, o cursor é o de link (`pointer`) e o arrasto não começa;
  - para um `viewer`, que não reordena, nenhum cursor de arrasto.
- **Onde:** `frontend/src/pages/home.tsx` (`SortableListCard` e os `sensors` do `DndContext`) e `frontend/src/components/lists/list-card.tsx` (o `<Link>` do título).
- **Notas:** o mesmo vale para o menu `⋮`, que também não deveria iniciar arrasto. Caminhos possíveis: parar o `pointerdown` no link/menu ou usar um sensor que ignore elementos marcados (ex.: `data-no-drag`). Manter a reordenação por teclado que existe hoje (o card é o ativador do `KeyboardSensor`).

### 4. Tarefas do card da lista no formato de `Próximas tarefas` do foco

- **Tipo:** melhoria
- **Área:** frontend + backend-node · tela inicial (`Suas listas`)
- **Hoje:** o card mostra até 4 tarefas pendentes como linhas de texto simples, separadas por um divisor, só com o título truncado.
- **Esperado:** cada tarefa aparece como os itens de `Próximas tarefas` da tela de foco: linha com borda e cantos arredondados, título truncado à esquerda e, à direita, `<n> subtarefa(s) · <estimativa>` (só o que existir). **Sem** a alça de seis pontos de reordenar.
- **Onde:**
  - visual: `frontend/src/components/lists/list-card.tsx` (lista `rows`); reaproveitar o estilo `row` e o `NextTaskMeta` de `frontend/src/components/focus/next-tasks.tsx` (extrair para um componente comum, sem `useSortable`);
  - dados: o `preview` hoje só traz `{ id, title }`. Precisa de `estimate_minutes` e da contagem de subtarefas em `backend-node/src/services/lists.ts` (consulta `ranked`), no schema de `backend-node/src/routes/lists.ts` e no tipo `ListCard` do frontend.
- **Notas:**
  - hoje o card desenha 4 linhas fixas, preenchendo com linhas vazias para os cards terem a mesma altura. Decidir se isso continua com as linhas de borda (linhas vazias tracejadas?) ou se os cards passam a ter altura variável;
  - manter a regra SCOPE-09 (com token sem `tasks:read`, `preview` vazio);
  - o print mostra as 3 primeiras, mas o limite hoje é 4 (`PREVIEW_SIZE`). Confirmar quantas mostrar.

### 5. `Arquivos` e `Componentes` só para admin, com selo `admin`

- **Tipo:** melhoria
- **Área:** frontend + backend-node · sidebar, rotas e permissões
- **Hoje:** `Arquivos` (grupo Workspace) e `Componentes` (grupo Desenvolvimento) aparecem para todo usuário, e as rotas `/files` e `/components` abrem para qualquer um logado. A API de arquivos só exige usuário + workspace (`requireUser`, `workspaceContext`).
- **Esperado:**
  - as duas abas só aparecem para admin, cada uma com um selo `admin` ao lado do nome;
  - quem não é admin não vê as abas, e abrir `/files` ou `/components` direto redireciona para `/` (como `/admin` já faz);
  - o grupo `Desenvolvimento` some quando `Componentes` é ocultado (o `visibleNavItems` já remove cabeçalhos vazios).
- **Onde:**
  - sidebar: `frontend/src/lib/nav-items.ts` (novo campo no `NavItem`, ex. `admin: true`, e filtro em `visibleNavItems`), `frontend/src/components/app-layout.tsx` (desenho do selo, também com a sidebar recolhida);
  - rotas: `frontend/src/App.tsx`, envolver `/files` e `/components` em `AdminRoute` (`frontend/src/components/admin-route.tsx`, que checa `user.is_superuser`);
  - paleta: `frontend/src/components/command-palette.tsx` (os itens que vêm da sidebar e a ação rápida `Enviar arquivo`, que leva a `/files`);
  - API: `backend-node/src/routes/files.ts`, adicionar `requireSuperuser` (de `authGuards`, usado em `routes/admin.ts`) se a restrição tiver de valer também no servidor.
- **Notas:**
  - **Definir o que é admin.** Assumido: o superusuário da instância (`users.is_superuser`), o mesmo que libera `/admin`. A alternativa seria o papel no workspace (`workspace_members.role`, ex. `owner`), mas aí `Arquivos` dependeria do workspace atual;
  - decidir se `Arquivos` fica restrito só na interface ou também na API. Ver os outros pontos que usam arquivos (anexos em notas/tarefas, `statFiles` nos relatórios/configurações) para não quebrar quem não é admin;
  - testes: `nav-items` (filtro), `AdminRoute` nas duas rotas e a paleta.

### 6. Checkbox só em Concluídas e só leitura; concluir é mover o card

- **Tipo:** melhoria
- **Área:** frontend · quadro (card da tarefa)
- **Hoje:** todo card tem uma checkbox ao lado do título. Nas colunas Backlog, Esta semana e Hoje, marcar a checkbox conclui a tarefa (`onComplete` → `complete` em `list-board.tsx`, que toca o som de conclusão e usa `focus.actions.complete`). Em Concluídas ela já aparece marcada e desabilitada.
- **Esperado:**
  - nas colunas Backlog, Esta semana e Hoje, sem checkbox: o título começa logo depois do número da ordem (Hoje) ou na borda do card;
  - em Concluídas, a checkbox continua marcada e só leitura, como indicador visual;
  - no quadro, concluir passa a ser só mover o card para Concluídas: arrastando ou pela seta das ações rápidas, que já chamam `complete` (som e foco continuam iguais).
- **Onde:** `frontend/src/components/board/task-card.tsx` (render da `Checkbox` só quando `column === 'done'`; a prop `onComplete` pode sair) e `frontend/src/pages/list-board.tsx` (`onComplete={(card) => complete(card.id)}` e o `noop` do card arrastado). Testes de `task-card` e `list-board` que marcam a checkbox.
- **Notas:**
  - na coluna Concluídas, uma checkbox só de leitura não deve parecer clicável: avaliar trocar por um ícone de check com `aria-label`, em vez de `disabled`, que fica apagada;
  - conferir que o atalho de teclado/ação rápida para concluir continua acessível (hoje a checkbox é o jeito mais direto de concluir sem arrastar);
  - fora do escopo: a tela de foco e o widget, que continuam concluindo pelos próprios botões.

### 7. Título da tarefa inteiro no card, truncado só depois de 3 linhas

- **Tipo:** ux
- **Área:** frontend · quadro (card da tarefa)
- **Hoje:** o título fica numa linha só (`truncate`) e corta com reticências, mesmo em títulos médios (ex.: `Responder às decisões em ab…`).
- **Esperado:** o título quebra em até 3 linhas e só depois disso corta com reticências (`line-clamp-3`, com `break-words` para palavras longas). O título completo fica no `title` do botão para ver ao passar o mouse.
- **Onde:** `frontend/src/components/board/task-card.tsx` (botão do título: trocar `truncate` por `line-clamp-3`); o card arrastado (`DragOverlay` em `list-board.tsx`) usa o mesmo componente.
- **Notas:** alinhar o número da ordem (e a checkbox em Concluídas) ao topo da primeira linha (`items-start` já está lá). Ver se a mesma regra vale para os cards da coluna Concluídas, que hoje cortam o título riscado na primeira linha.

### 8. Editar estimativa e tempo gasto direto no card, com um campo `HH:MM` próprio

- **Tipo:** melhoria
- **Área:** frontend (+ backend-node para o tempo gasto) · quadro (card da tarefa)
- **Hoje:** a linha de baixo do card mostra a estimativa à esquerda (`1h`) e o tempo gasto à direita (`0min`), só como texto. A estimativa só muda pelo diálogo da tarefa, num `Input` padrão em **minutos** (`board.estimateMinutes`, 1 a 1440, validado por `isValidEstimate`). O tempo gasto não é editável: é a soma das sessões de foco da tarefa (`spentSeconds` em `backend-node/src/services/focus-settle.ts`).
- **Esperado:**
  - clicar na estimativa ou no tempo gasto troca o texto por um campo editável ali mesmo, sem abrir o diálogo;
  - o campo é um componente novo, **não** o `Input` padrão: mesma altura de linha e mesmo tamanho de fonte do texto (`text-xs`), sem borda/padding que façam o card pular de altura;
  - formato `HH:MM` (ex.: `01:30`), com máscara: só dígitos, `:` fixo, minutos de 00 a 59;
  - `Enter` ou sair do campo salva, `Esc` cancela e volta ao texto; valor inválido não salva e volta ao anterior;
  - fora da edição, o texto continua no formato atual (`1h 30min`).
- **Onde:**
  - componente novo em `frontend/src/components/ui/` (ex. `duration-input.tsx`), com a conversão `HH:MM` ⇄ minutos ao lado de `frontend/src/components/board/estimate.ts`;
  - `frontend/src/components/board/task-card.tsx` (linha da estimativa/tempo gasto);
  - estimativa: salva com `PATCH` da tarefa (`estimate_minutes`, já existe em `updateTaskBody`), atualizando o quadro (`['board', listId]`) e as listas;
  - avaliar usar o mesmo campo no diálogo da tarefa (`task-dialog.tsx`), que hoje pede minutos, para o formato ficar igual nos dois lugares.
- **Notas:**
  - **Tempo gasto precisa de decisão de modelo.** Ele não é um campo da tarefa, é calculado das sessões de foco. Para editar, as opções são: (a) um ajuste manual guardado na tarefa e somado às sessões; (b) criar ou ajustar uma sessão na Agenda com a diferença; (c) deixar só a estimativa editável no card. As opções (a) e (b) mudam relatórios e Agenda, e (a) é uma mudança de schema difícil de desfazer;
  - limites: a estimativa hoje vai de 1 a 1440 minutos (`24:00`). Campo vazio continua tirando a estimativa;
  - leitura (`viewer`) e tarefas em Concluídas: decidir se ficam editáveis (provavelmente não para `viewer`);
  - o clique no campo não pode iniciar o arrasto do card nem abrir o diálogo da tarefa;
  - acessibilidade: o texto clicável vira um `<button>` com `aria-label` (`Editar estimativa`), e o campo recebe foco ao abrir.

### 9. Criar e editar a anotação da tarefa pela tela de foco

- **Tipo:** melhoria
- **Área:** frontend · foco (tela cheia)
- **Hoje:** a tela de foco mostra o cartão da tarefa (título, cronômetro, subtarefas), os controles e as próximas tarefas, mas não tem como ver nem escrever a anotação da tarefa. A anotação (`tasks.notes`, até `NOTES_MAX`) já existe e é editada no quadro (`QuickNote`, `task-dialog`) e no widget do desktop (`WidgetNotes`, que abre o painel `notes`).
- **Esperado:** no cartão da tarefa em foco, uma ação `Anotação` (ícone de nota) que abre o editor da anotação da tarefa atual, logo abaixo das subtarefas. Sem anotação, mostra o editor vazio para criar; com anotação, mostra o texto para editar.
- **Onde:** `frontend/src/components/focus/focus-task-card.tsx` e `frontend/src/pages/focus.tsx`; reaproveitar `NoteEditor` (`components/board/note-editor.tsx`) e a lógica de salvar/limite de `WidgetNotes` ou `QuickNote` (`tasksApi.update(taskId, { notes })`).
- **Notas:**
  - confirmar que "anotação" é a nota da própria tarefa (o campo que já existe) e não uma anotação solta, de sessão ou do dia;
  - salvar ao sair do editor, como no widget, e indicar no cartão que a tarefa tem anotação mesmo com o editor fechado;
  - ao trocar a tarefa em foco (Pular, Concluir, arrastar uma próxima), o editor fecha e salva o que estava aberto;
  - `viewer`: só leitura;
  - offline: a tela de foco tem fila offline; decidir se a anotação entra nela ou só funciona com conexão (as subtarefas ficaram só com conexão no lote #14-16).

### 10. Com todas as subtarefas concluídas, não dá para adicionar outra

- **Tipo:** bug
- **Área:** frontend · foco (tela cheia)
- **Issue:** [#28](https://github.com/gabrielauzier/trackzyn/issues/28) (já criada). **Atualizar a issue:** a solução escolhida agora é a alternativa dela (botão que mostra/esconde as subtarefas, como no card do quadro), e não o `+` ao lado de `Subtarefas 2/2`.
- **Hoje:** quando todas as subtarefas estão feitas, `FocusSubtasks` troca a lista por `Tudo feito por aqui.` + `Concluir tarefa` (`allDone`). A `SubtaskList` deixa de ser renderizada, então some o `Adicionar subtarefa` e não dá para acrescentar uma que tenha sido esquecida (nem desmarcar uma feita).
- **Esperado:** na linha `Subtarefas <feitas>/<total>`, um botão de mostrar/esconder (o chevron do card do quadro). Com tudo feito, a lista começa recolhida mostrando `Tudo feito por aqui.` + `Concluir tarefa`; abrir mostra a lista com as concluídas e `Adicionar subtarefa`. Ao adicionar uma nova, `allDone` deixa de valer e a tela volta ao estado normal.
- **Onde:** `frontend/src/components/focus/focus-subtasks.tsx` (o ramo `allDone ? … : <SubtaskList …>`); o botão de mostrar/esconder do quadro está em `frontend/src/components/board/task-card.tsx` com `frontend/src/components/board/subtask-list.tsx`.
- **Notas:** decidir se o mostrar/esconder vale sempre (também com subtarefas pendentes) ou só no estado `allDone`. Ver o widget (`widget-subtasks.tsx`), que pode ter o mesmo problema.

### 11. Os botões de ação do widget aparecem por um instante e somem para sempre

- **Tipo:** bug
- **Área:** frontend + desktop · widget do foco
- **Hoje:** o widget compacto mostra só o título e o cronômetro. Ao abrir o widget, a linha de botões (Pausar/Retomar, Pular, Concluir, Intervalo, Subtarefas, Anotação, Expandir) aparece por um instante, some, e não volta mais, nem passando o mouse por cima. Sem os botões, não dá para controlar o foco pelo widget.
- **Esperado:** os botões aparecem ao passar o mouse sobre o widget (e com foco pelo teclado), como no design original (`feat(web): add the widget controls`, 2126684), e somem 150 ms (`HIDE_DELAY_MS`) depois que o mouse sai.
- **Onde:** `frontend/src/components/focus/widget-controls.tsx` (`shown = hovered || focused || picking`, com `onMouseOver`/`onMouseLeave` no contêiner) e `frontend/src/pages/focus-widget.tsx`; tamanhos em `desktop/src/main/widget-bounds.ts` (`compact: 300×64`).
- **Causa provável (a confirmar):** o contêiner inteiro que escuta o mouse é uma área de arrastar a janela (`[-webkit-app-region:drag]`). No Electron, uma área de arrastar não entrega eventos de mouse para a página, então `onMouseOver` nunca dispara quando o mouse está sobre ela. O que aparece na abertura é provavelmente um evento de foco ou de mouse anterior ao arrasto entrar em vigor; o `onMouseLeave` esconde e nada mais mostra. Outra possibilidade a descartar: a altura `compact` de 64 px (`h-16`) não comportar a linha do título + a linha dos botões.
- **Notas:**
  - caminhos de correção: limitar a área de arrastar a uma parte do widget (ex.: a linha do título) e deixar o resto `no-drag` para receber o mouse; ou detectar o mouse pelo processo principal (posição do cursor vs. `getBounds()` da janela) e avisar a página por IPC;
  - provar no app de verdade, não só no teste de componente, porque o jsdom não simula a área de arrastar. Há e2e do widget no desktop (`test(desktop): skip destroyed windows in the widget e2e helpers`, 240208b);
  - ao corrigir, manter o arrasto da janela funcionando.

<!-- Modelo de item:

### N. Título curto

- **Tipo:** bug | melhoria | ux | tech-debt
- **Área:** frontend / desktop / backend-node / widget / agenda / foco / quadro …
- **Hoje:** o que acontece (passos para reproduzir, se for bug)
- **Esperado:** o comportamento desejado
- **Onde:** arquivos/componentes envolvidos
- **Notas:** decisões, dúvidas em aberto, prints

-->
