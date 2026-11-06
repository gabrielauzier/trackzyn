# Leva de melhorias gerais: quadro, tela inicial, sidebar, foco e widget (#30 a #34)

Sources:

- `.tasks/leva-melhorias-30-34.md` - a task: 44 critérios, 2 portas, 4 abertas com padrão assumido. Esta checklist segue a numeração dela (Cn = critério n).
- https://github.com/gabrielauzier/trackzyn/issues/30, /31, /32, /33, /34 - escopo de cada tela e as decisões da revisão.
- `.specs/leva-melhorias-gerais.md` - itens 1 a 11, decisões e onde mexer.
- https://claude.ai/artifact/6CDUrnwb8Rv5VpqFXrk4ib - **binding for the interface**, pranchetas `Quadro · itens 1, 2, 6, 7`, `Card · estimativa HH:MM (item 8)`, `Tela inicial · itens 3 e 4`, `Sidebar · item 5`, `Foco · itens 9 e 10`, `Widget · item 11`; os valores estão transcritos nos critérios da task.

Profile: `light` (o repo não declara um). Handoff: `on`, budget 150k. Branch: `feat/leva-melhorias-30-34`, a partir de `origin/main` (2f8b16e, com a Agenda já integrada).

## Out of scope

- Editar o tempo gasto no card - decidido: vem das sessões e é corrigido pela Agenda.
- Hora de conclusão no card de Concluídas; reordenar à mão dentro de Concluídas (o quadro já não permite).
- Mudar o limite do `preview` na API (continua 4; o card mostra 3) - o MCP `list_lists` usa a mesma prévia.
- `Arquivos` pelo papel no workspace; anotação pela fila offline do foco.
- Atualização entre telas (#35).
- As perguntas abertas 1 a 4 da task: construídas com o padrão escrito em `Until answered`.

## Landing

Toca o quadro (`components/board/board-column.tsx`, `task-card.tsx`, `task-dialog.tsx`, `estimate.ts`, `pages/list-board.tsx`, `backend-node/src/services/board.ts`), a tela inicial (`pages/home.tsx`, `components/lists/list-card.tsx`, `backend-node/src/services/lists.ts`, `routes/lists.ts`), a navegação (`lib/nav-items.ts`, `components/app-layout.tsx`, `App.tsx`, `components/command-palette.tsx`, `backend-node/src/routes/files.ts`), o foco (`components/focus/focus-task-card.tsx`, `focus-subtasks.tsx`, `pages/focus.tsx`) e o widget (`components/focus/widget-controls.tsx`, `pages/focus-widget.tsx`, `desktop/src/main/`, `desktop/src/shared/ipc.ts`, preload). Reaproveita: `complete` de `list-board.tsx` (arrasto e seta já concluem), `NextTaskMeta` e o estilo `row` de `next-tasks.tsx`, `NoteEditor` e a lógica de `WidgetNotes`, `SubtaskList`, `AdminRoute`, `requireSuperuser` de `authGuards`, `HIDE_DELAY_MS`.

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| Campos novos na prévia da lista | cada item de `preview` em `GET /api/lists`: `{ id, title, estimate_minutes: number \| null, subtasks: { done: number, total: number } }` | `GET /api/lists/:id/board` por card: uma requisição por lista para três linhas |
| `/api/files` só para superusuário | todas as rotas de `routes/files.ts` com `requireSuperuser`; sem permissão, `403` | só na interface: a API continuaria aberta a membros e tokens |

- Nothing else in this change is hard to reverse

## Handoff

Pesos (soma de `wc -c` / 4 dos arquivos de cada slice): S1 ~22k, S2 ~5k, S3 ~9k, S4 ~18k, S5 ~20k, S6 ~12k = ~86k de leitura, abaixo de 150k. Mesmo assim, três lotes, cortados onde a superfície muda e o próximo lote lê outro código: o piso conta só a leitura, e a iteração (testes do quadro e do foco são grandes) é a parte maior.

- Lote A: S1 + S2 (~27k) - o quadro inteiro (`board/`, `list-board.tsx`, `services/board.ts`).
- Lote B: S3 + S4 (~27k) - tela inicial, navegação e rotas de listas e arquivos; não toca o quadro.
- Lote C: S5 + S6 (~32k) - foco, widget e desktop.

Os lotes rodam um depois do outro (compartilham `locales/*.json` e `types/index.ts`).

Lote A (S1 + S2):

- **Where the boundary fell** - C1 a C20 fechados, provas verdes em `1bacd9a` (commits `7142820` backend, `2b49ba0`, `45f7220`, `c010305`, `1bacd9a` frontend); suíte do frontend, `typecheck` e `lint` do frontend e do backend verdes. Lote B começa em S3 (C21).
- **What was settled mid-build** - nada com o usuário. Escolhas abaixo da barra de `Landing`: a linha de botões usa `top-14 lg:top-0` (abaixo de `lg` a barra do app, `h-14`, é `sticky` em cima dela) e fundo opaco `bg-background` com `bg-card/50` por dentro, igual à coluna; o `:` aparece depois das duas casas da hora (`02:`), e apagar o `:` apaga o dígito antes dele; valor incompleto (`01:3`) só avisa (`Use o formato HH:MM`) ao apertar Enter e, ao sair, volta ao anterior; a estimativa é editável em Concluídas também (Unresolved 2, padrão); o card salva por `onEstimateChange` e `list-board.tsx` faz o `PATCH` com atualização otimista dos totais (mesmas somas do servidor) e, se falhar, volta só a estimativa daquela tarefa. A chave `board.complete` saiu dos locales (sem uso). O formulário de nova tarefa (`add-task-form.tsx`) continua em minutos - não está nos critérios. Testes antigos reescritos para o critério novo: `task-card` (checkbox -> sem checkbox / ícone `Completed`), `list-board` (concluir pela checkbox -> pela seta; viewer sem checkbox), `task-dialog` (`Estimate (min)`/`1441` -> `Estimate` em HH:MM/`24:01`).
- **What was abandoned** - nada.

Lote B (S3 + S4):

- **Where the boundary fell** - C21 a C33 fechados, provas verdes em `d180978` (commits `07d184a` backend da prévia, `103c59d` card da tela inicial, `a48b56a` backend de arquivos, `d180978` navegação e permissões); suíte do frontend, `test/routes` e `test/mcp` do backend, `typecheck` e `lint` do frontend e do backend verdes. Lote C começa em S5 (C34).
- **What was settled mid-build** - nada com o usuário. Escolhas abaixo da barra de `Landing`: o arrasto do card ignora o `pointerdown` que nasce em `[data-no-drag]` (título e `⋮`), por um `PointerSensor` próprio em `home.tsx` (`CardBodyPointerSensor`); o Radix já cancelava o arrasto ao abrir o `⋮` (`preventDefault`), mas não com o menu aberto, então a prova cobre os dois. A linha e o `NextTaskMeta` saíram para `components/task-row.tsx` (`TaskRow`, `TaskRowMeta`, `taskRowClass`), usados por `next-tasks.tsx` e `list-card.tsx`; a chave continua `focus.queue.subtaskCount`. A altura fixa é `grid h-32 grid-rows-3` na lista do card. Os links de admin têm nome e dica `Files (admin)` / `Arquivos (admin)` também com a sidebar aberta (chaves `nav.adminLink`, `nav.adminBadge`); `visibleNavItems` ganhou o 4º parâmetro `isSuperuser`, padrão `false`. A paleta também esconde recentes que levam a `/files` ou `/components` (`adminPaths` em `nav-items.ts`). No backend, `requireSuperuser` vem depois de `requireUser` (sem sessão continua `401`). Testes antigos reescritos para o critério novo: `list-card` (`fills four preview rows` -> três linhas e altura fixa), `home` (`reorders a card...` renomeado `lists reorder with the keyboard`), `nav-items` (`keeps every unflagged link` passa superusuário), `workspaces.test.ts` (os testes de arquivos promovem os usuários a superusuário).
- **What was abandoned** - nada.

Lote C (S5 + S6):

- **Where the boundary fell** - C34 a C44 fechados, provas verdes em `8a788c2` (commits `97fbc15` foco: anotação e subtarefas, `ef37fae` desktop: cursor sobre o widget, `8a788c2` frontend: botões do widget); a e2e de C43 (`npx playwright test e2e/widget.spec.ts -g "the widget shows its controls when the cursor is over it"`) passou depois do `npm run build:all`, e o `widget.spec.ts` inteiro e o `security.spec.ts` também. Suíte do frontend, `typecheck` e `lint` do frontend e do desktop verdes; no desktop, `npx vitest run` tem uma falha que já existia antes deste lote (`scripts/packaged-local.test.ts`, `packaged app starts the local backend without node on PATH`, falha igual com as mudanças guardadas no `git stash`). Último lote: falta só o Verifier sobre `f8f72ca..HEAD`.
- **What was settled mid-build** - nada com o usuário. Escolhas abaixo da barra de `Landing` (o canal novo é interno ao app, sem porta): o canal é `widget:hover` (`IPC.widgetHover`, do processo principal para a página, `{ hovering: boolean }`), lido de `screen.getCursorScreenPoint()` contra `getBounds()` a cada 50 ms enquanto a janela do widget existe (`desktop/src/main/widget-hover.ts`, ligado em `index.ts` ao criar o widget); o preload guarda o último estado e o repassa na hora a quem assina depois (`onWidgetHover`, 23º membro da ponte), porque os botões só montam depois de ler o foco e o primeiro aviso chegava antes; sem `onWidgetHover` na ponte (navegador ou ponte antiga) o `WidgetControls` volta a usar `onMouseOver`/`onMouseLeave`. A abertura das subtarefas é decidida uma vez por tarefa (aberta com pendentes, recolhida com tudo feito) e depois só o chevron muda; com tudo feito e aberta, a `SubtaskList` mostra todas (sem o `limit` de 5) e `addCollapsed` passou a mostrar `Adicionar subtarefa` também com todas feitas. A anotação é montada por tarefa (`key={task.id}` em `focus.tsx`): ao trocar de tarefa com o editor aberto, o texto não salvo é enviado para a tarefa antiga ao desmontar (só se não passa de `NOTES_MAX` e não foi enviado pelo `blur`); o viewer abre o texto inteiro só para leitura com o mesmo botão `Anotação` e, sem anotação, vê o rótulo em cinza sem ação. `NOTES_MAX` saiu para `lib/notes.ts`. Strings novas: `focus.subtasks.show/hide`, `focus.notes.title/hint/editor`. Testes antigos reescritos para o critério novo: listas de membros da ponte (`preload/index.test.ts`, `e2e/security.spec.ts`: 22 -> 23 com `onWidgetHover`), `ipc.test.ts` (`widgetHover` entra nos canais só de envio, enviado por `widget-hover.ts`), `e2e/widget.spec.ts` (o `hover()` da página virou `placeCursor`, que troca o cursor lido pelo processo principal); os mocks tipados da ponte nos testes do frontend ganharam `onWidgetHover`.
- **What was abandoned** - assinar `widget:hover` direto no `ipcRenderer` a cada `onWidgetHover`: a e2e mostrou que o aviso de entrada se perdia quando o widget reabria com o cursor já em cima (os botões montam depois do primeiro aviso); trocado pelo estado guardado no preload.

## Checks

### S1 - Quadro: coluna Hoje, Concluídas, concluir movendo e título · 8 files · 87 KB · ~22k

**C1** - A linha `Focar agora` + olho fica abaixo da barra de progresso de Hoje e antes da primeira tarefa, e não há mais linha no rodapé
Proof: `cd frontend && npx vitest run src/components/board/board-column.test.tsx -t "Today shows the focus buttons between the progress bar and the first task"`

**C2** - A linha de botões é `sticky` no topo da área rolável, com o fundo da coluna e sem linha nem sombra abaixo dela (a sombra saiu a pedido do usuário em 2026-11-06)
Proof: `cd frontend && npx vitest run src/components/board/board-column.test.tsx -t "the focus buttons row sticks to the top while the column scrolls"`

**C3** - Os botões continuam desabilitados sem pendentes ou para viewer, e o olho só no desktop
Proof: `cd frontend && npx vitest run src/components/board/board-column.test.tsx -t "focus buttons keep their disabled and desktop-only rules at the top"`

**C4** - O quadro devolve cada dia de Concluídas por `completed_at` decrescente
Proof: `cd backend-node && npx vitest run test/routes/board.test.ts -t "done days list the latest completed task first"`

**C5** - Concluir no quadro põe a tarefa no topo do dia de hoje na hora (atualização otimista)
Proof: `cd frontend && npx vitest run src/pages/list-board.test.tsx -t "a task completed on the board shows at the top of today in Done"`

**C6** - Cards de Backlog, Esta semana e Hoje não têm checkbox
Proof: `cd frontend && npx vitest run src/components/board/task-card.test.tsx -t "cards outside Done have no checkbox"`

**C7** - Card de Concluídas mostra um ícone de check com `aria-label` `Concluída`, que não é controle, e o título riscado
Proof: `cd frontend && npx vitest run src/components/board/task-card.test.tsx -t "a done card shows a read-only check icon"`

**C8** - Arrastar para Concluídas e a seta de Hoje concluem com o som uma vez
Proof: `cd frontend && npx vitest run src/pages/list-board.test.tsx -t "the quick arrow from Today completes the task and plays the sound once"`
Proof: `cd frontend && npx vitest run src/pages/list-board.test.tsx -t "dropping on Done completes the task"`

**C9** - O título usa `line-clamp-3`, quebra palavras longas e tem `title` com o texto completo, nas quatro colunas
Proof: `cd frontend && npx vitest run src/components/board/task-card.test.tsx -t "the title wraps up to three lines with the full text as its tip"`

### S2 - Quadro: estimativa editável em HH:MM · 4 files · 20 KB · ~5k

**C10** - Para quem edita, a estimativa é um botão `Editar estimativa` com fundo e lápis no hover e cursor de texto
Proof: `cd frontend && npx vitest run src/components/board/task-card.test.tsx -t "the estimate is an edit button for writers"`

**C11** - Clicar abre o campo `HH:MM` com o valor (`01:30` para 90), com foco, sem abrir o diálogo nem arrastar
Proof: `cd frontend && npx vitest run src/components/board/task-card.test.tsx -t "clicking the estimate opens the HH:MM field in place"`

**C12** - Sem estimativa, há um alvo clicável que abre o campo vazio
Proof: `cd frontend && npx vitest run src/components/board/task-card.test.tsx -t "a card without estimate offers an empty field"`

**C13** - O campo aceita só dígitos e mantém o `:` fixo
Proof: `cd frontend && npx vitest run src/components/ui/duration-input.test.tsx -t "accepts digits only and keeps the colon"`

**C14** - Enter ou sair com valor válido envia `estimate_minutes` em minutos e volta ao texto
Proof: `cd frontend && npx vitest run src/components/board/task-card.test.tsx -t "Enter saves the estimate in minutes"`

**C15** - Apagar e sair envia `estimate_minutes: null`
Proof: `cd frontend && npx vitest run src/components/board/task-card.test.tsx -t "clearing the field removes the estimate"`

**C16** - Minutos acima de 59 ou acima de 24:00 mostram o aviso, não enviam, e ao sair voltam ao anterior
Proof: `cd frontend && npx vitest run src/components/board/estimate.test.ts -t "parses HH:MM within 00:01 and 24:00"`
Proof: `cd frontend && npx vitest run src/components/board/task-card.test.tsx -t "an invalid estimate warns and is not sent"`

**C17** - Esc cancela sem enviar
Proof: `cd frontend && npx vitest run src/components/board/task-card.test.tsx -t "Escape cancels the estimate edit"`

**C18** - Se o PATCH falha, a estimativa volta e aparece o toast com a mensagem da API
Proof: `cd frontend && npx vitest run src/pages/list-board.test.tsx -t "a failed estimate save restores it and shows the API error"`

**C19** - Para viewer, a estimativa é só texto
Proof: `cd frontend && npx vitest run src/components/board/task-card.test.tsx -t "a viewer sees the estimate as text only"`

**C20** - O diálogo da tarefa usa o campo HH:MM com a dica `HH:MM · deixe vazio para sem estimativa`
Proof: `cd frontend && npx vitest run src/components/board/task-dialog.test.tsx -t "the estimate field takes HH:MM"`

### S3 - Tela inicial: card da lista · 7 files · 36 KB · ~9k

**C21** - Para quem edita, o card tem cursor `grab` (e `grabbing` arrastando)
Proof: `cd frontend && npx vitest run src/pages/home.test.tsx -t "a writer sees the grab cursor on the list card"`

**C22** - Pressionar e arrastar a partir do título não move o card; o título é link com cursor de link
Proof: `cd frontend && npx vitest run src/pages/home.test.tsx -t "dragging from the list title does not move the card"`

**C23** - Pressionar e arrastar a partir do `⋮` não move o card
Proof: `cd frontend && npx vitest run src/pages/home.test.tsx -t "dragging from the actions menu does not move the card"`

**C24** - Viewer não tem cursor de arrasto; a reordenação pelo teclado continua
Proof: `cd frontend && npx vitest run src/pages/home.test.tsx -t "a viewer sees no grab cursor"`
Proof: `cd frontend && npx vitest run src/pages/home.test.tsx -t "lists reorder with the keyboard"`

**C25** - O card mostra até 3 tarefas como linhas com borda e `<n> subtarefa(s) · <estimativa>`, sem alça
Proof: `cd frontend && npx vitest run src/components/lists/list-card.test.tsx -t "shows up to three tasks with subtasks and estimate"`

**C26** - Com menos de 3 tarefas, o card mantém a altura e não desenha linhas vazias
Proof: `cd frontend && npx vitest run src/components/lists/list-card.test.tsx -t "keeps its height without empty rows"`

**C27** - `GET /api/lists` traz `estimate_minutes` e `subtasks` em cada item de `preview`; sem `tasks:read`, vazio
Proof: `cd backend-node && npx vitest run test/routes/lists.test.ts -t "preview items carry the estimate and the subtask counts"`
Proof: `cd backend-node && npx vitest run test/routes/token-scopes.test.ts -t "SCOPE-09"`

### S4 - Sidebar e permissões · 7 files · 73 KB · ~18k

**C28** - Superusuário vê `Arquivos` e `Componentes` com o selo `admin`
Proof: `cd frontend && npx vitest run src/components/app-layout.test.tsx -t "a superuser sees Files and Components with the admin badge"`

**C29** - Sidebar recolhida: ponto no ícone e nome acessível `Arquivos (admin)` / `Componentes (admin)`
Proof: `cd frontend && npx vitest run src/components/app-layout.test.tsx -t "the collapsed sidebar marks admin links with a dot"`

**C30** - Quem não é superusuário não vê `Arquivos`, `Componentes` nem `DESENVOLVIMENTO`
Proof: `cd frontend && npx vitest run src/lib/nav-items.test.ts -t "admin links and their empty header are hidden from non-admins"`

**C31** - `/files` e `/components` redirecionam para `/` quem não é superusuário
Proof: `cd frontend && npx vitest run src/components/admin-route.test.tsx -t "files and components redirect a non-admin home"`

**C32** - A paleta não lista `Arquivos`, `Componentes` nem `Enviar arquivo` para quem não é superusuário
Proof: `cd frontend && npx vitest run src/components/command-palette.test.tsx -t "the palette hides admin screens from non-admins"`

**C33** - `/api/files` responde 403 a quem não é superusuário (sessão e token) e funciona para o superusuário
Proof: `cd backend-node && npx vitest run test/routes/files.test.ts -t "files routes are superuser only"`

### S5 - Foco: anotação e subtarefas · 6 files · 79 KB · ~20k

**C34** - O cartão em foco mostra a ação `Anotação`, em cinza sem anotação
Proof: `cd frontend && npx vitest run src/components/focus/focus-notes.test.tsx -t "shows the Notes action, muted without notes"`

**C35** - Clicar abre o editor com o texto atual, com foco, e `Salva ao sair`
Proof: `cd frontend && npx vitest run src/components/focus/focus-notes.test.tsx -t "opens the editor with the current notes"`

**C36** - Sair com texto alterado envia `notes`; acima de `NOTES_MAX` mostra o erro e não envia
Proof: `cd frontend && npx vitest run src/components/focus/focus-notes.test.tsx -t "leaving the editor saves the notes"`
Proof: `cd frontend && npx vitest run src/components/focus/focus-notes.test.tsx -t "notes over the limit are not sent"`

**C37** - Com anotação e editor fechado, mostra o ícone na cor primária e o começo do texto
Proof: `cd frontend && npx vitest run src/components/focus/focus-notes.test.tsx -t "a closed note shows its first line"`

**C38** - Trocar a tarefa em foco com o editor aberto salva o texto e fecha
Proof: `cd frontend && npx vitest run src/pages/focus.test.tsx -t "changing the task in focus saves and closes the open notes"`

**C39** - Viewer vê a anotação só para leitura
Proof: `cd frontend && npx vitest run src/components/focus/focus-notes.test.tsx -t "a viewer reads the notes without an editor"`

**C40** - A linha Subtarefas tem o chevron com `aria-expanded` e `Mostrar subtarefas` / `Esconder subtarefas`
Proof: `cd frontend && npx vitest run src/components/focus/focus-subtasks.test.tsx -t "the subtasks row has a show and hide toggle"`

**C41** - Com tudo feito, começa recolhido; aberto mostra as concluídas, `Adicionar subtarefa` e `Concluir tarefa`
Proof: `cd frontend && npx vitest run src/components/focus/focus-subtasks.test.tsx -t "all done starts collapsed and opens to add another"`

**C42** - Adicionar uma subtarefa com a lista aberta tira `Tudo feito por aqui.` e soma na contagem
Proof: `cd frontend && npx vitest run src/components/focus/focus-subtasks.test.tsx -t "a new subtask leaves the all done state"`

### S6 - Widget: botões de ação · 8 files · 49 KB · ~12k

**C43** - O processo principal avisa a página quando o cursor entra e sai dos limites do widget, e os botões aparecem e somem 150 ms depois da saída
Proof: `cd desktop && npx vitest run src/main/widget-hover.test.ts -t "reports the cursor entering and leaving the widget bounds"`
Proof: `cd frontend && npx vitest run src/components/focus/widget-controls.test.tsx -t "the controls follow the hover reported by the desktop"`
Proof: `cd desktop && npx playwright test e2e/widget.spec.ts -g "the widget shows its controls when the cursor is over it"`

**C44** - A janela continua arrastável fora da linha de botões, e a linha de botões é `no-drag`
Proof: `cd frontend && npx vitest run src/components/focus/widget-controls.test.tsx -t "only the controls row is outside the drag region"`

## Swept

- validation: C13, C16 (estimativa); C36 (`NOTES_MAX`)
- failure modes: C18, C36
- idempotency: not in scope - `PATCH` grava o valor final; repetir dá o mesmo resultado
- authorization: C19, C24, C39 (viewer); C30 a C33 (superusuário)
- concurrency: C38 (troca de tarefa com o editor aberto); C5 (otimista antes da resposta)
- data lifecycle: not in scope - nada novo é guardado
- dependency failure: not in scope - nenhum serviço externo
- state transitions: C41, C42 (subtarefas recolhidas e abertas); C43 (botões do widget)
- observability: not in scope - sem telemetria no frontend; o backend só muda a leitura e uma guarda

## Coverage

Profile `light`: sem a junção de conjuntos. Conjuntos nomeados na task, para o Verifier conferir:

- colunas sem checkbox (3): `backlog`, `this_week`, `today` em C6; `done` em C7
- links de admin (2): `Arquivos`, `Componentes` em C28, C29, C30, C31, C32
- rotas de `/api/files` (todas de `routes/files.ts`): C33
- Claims naming a status code, route or response shape: C4, C27, C33 - cada uma com prova que passa pela rota (`app.inject`)
