# STATE

## Decisions

### AD-001
- **Decision**: O servidor é a fonte da verdade do foco. Cada sessão aberta guarda `deadline_at` (fim da estimativa ou do intervalo), e qualquer leitura ou escrita de foco ou relatório "liquida" antes: fecha com `ended_at = deadline_at` toda sessão cujo prazo já passou.
- **Reason**: Cumpre FOCUS-11 e BREAK-05 (o app fechado no prazo) sem worker nem agendador, e funciona igual no modo local (PGlite) e no servidor. O usuário escolheu esta arquitetura.
- **Trade-off**: Até a próxima leitura, a linha no banco continua com `ended_at` nulo; toda consulta de sessões precisa passar pela liquidação ou usar `least(ended_at, deadline_at, now())`.
- **Scope**: `foco-e-sons`, `widget-desktop`, `relatorios`; backend `services/focus*`.
- **Date**: 2026-10-24
- **Status**: active

### AD-002
- **Decision**: Toda ação de foco leva um `action_id` (UUID gerado no cliente) e um `occurred_at` (relógio local corrigido pela diferença para o `server_now` da última resposta). O servidor grava os `action_id` aplicados em `focus_actions` (único) e devolve o mesmo resultado num reenvio; recusa `occurred_at` no futuro (com 5 s de tolerância), anterior à última mudança de estado do usuário ou com mais de 24h.
- **Reason**: A fila offline (SYNC-05 a SYNC-07) reenvia ações; sem id único, um reenvio depois de uma resposta perdida duplicaria a ação. O horário vem do clique, não da chegada.
- **Trade-off**: Uma tabela a mais, que cresce com cada ação (limpeza do que passa de 24h na própria liquidação), e o servidor passa a aceitar horário vindo do cliente dentro de limites.
- **Scope**: `foco-e-sons`, `widget-desktop`; API `/api/focus/*`.
- **Date**: 2026-10-24
- **Status**: active

### AD-003
- **Decision**: Sem canal de push. Outros dispositivos atualizam o foco por polling de `GET /api/focus` a cada 15 s e quando a janela ganha foco; as janelas do mesmo app desktop se avisam por IPC (`focus:changed`), retransmitido pelo processo principal.
- **Reason**: A spec só exige sincronia de até 1 s entre as janelas do mesmo app (WIDGET-22); entre dispositivos, o conflito é resolvido no servidor ao começar (SYNC-02). Evita SSE, pub/sub e estado de conexão.
- **Trade-off**: Outro dispositivo pode mostrar um estado com até 15 s de atraso.
- **Scope**: `foco-e-sons`, `widget-desktop`; frontend `lib/focus`, desktop `main`.
- **Date**: 2026-10-24
- **Status**: active

### AD-004
- **Decision**: "Hoje", "semana" (segunda a domingo) e os agrupamentos por dia e hora usam `workspaces.timezone` ou, se nulo, `applicationTimezone()`, calculados em SQL (`date_trunc(..., tz)` e `generate_series`) no Postgres e no PGlite.
- **Reason**: Um só fuso para todos os dispositivos (dois navegadores em fusos diferentes veriam números diferentes); o Postgres 16 e o PGlite tratam horário de verão do mesmo jeito (conferido no PGlite em 2026-10-24).
- **Trade-off**: As regras de dia ficam em SQL, testadas contra PGlite, não em funções TypeScript puras.
- **Scope**: `listas-e-quadro`, `foco-e-sons`, `relatorios`.
- **Date**: 2026-10-24
- **Status**: active

### AD-005
- **Decision**: Listas são uma tabela dentro do workspace (`lists.workspace_id`), e excluir uma lista ou tarefa apaga em cascata as tarefas, subtarefas e sessões dela; arquivar mantém tudo.
- **Reason**: Decisões do usuário na especificação. A cascata no banco garante que não sobra sessão sem dono.
- **Trade-off**: Excluir é irreversível e tira o tempo dos relatórios.
- **Scope**: todas as features; schema `lists`, `tasks`, `subtasks`, `focus_sessions`.
- **Date**: 2026-10-24
- **Status**: active

### AD-006
- **Decision**: `tasks.completed_by_user_id` (fk `users.id`, `ON DELETE SET NULL`) registra quem concluiu a tarefa; é gravado em toda conclusão (quadro, foco, widget) e limpo quando a tarefa sai de Concluídas.
- **Reason**: Os relatórios contam só as conclusões do usuário logado (REPORT-09), e o banco só guardava quando a tarefa foi concluída, não quem a concluiu. Decisão do usuário em 2026-10-25.
- **Trade-off**: Uma migration num `tasks` já populado; tarefas concluídas antes dela ficam sem dono e não entram nos relatórios.
- **Scope**: `listas-e-quadro` (serviço de tarefas), `foco-e-sons` (`complete`), `relatorios`.
- **Date**: 2026-10-25
- **Status**: active

### AD-007
- **Decision**: Tokens de acesso (`tkz_`) são negados por padrão: um hook `onRequest` global autentica o token e só deixa passar a rota que declara `config.tokenScope`. Toda rota nova, pública ou não, responde 403 a um token até declarar um escopo. O JWT de sessão não passa por esse caminho.
- **Reason**: Um token de longa duração vazado não pode alcançar senha, admin ou outros tokens, e esquecer de configurar uma rota nova precisa falhar fechado. Arquitetura escolhida pelo usuário em 2026-11-02.
- **Trade-off**: Abrir uma rota a tokens exige declará-la e atualizar o teste que compara as rotas com a tabela de escopos da spec.
- **Scope**: `tokens-de-acesso`; todas as rotas de `backend-node/src/routes`.
- **Date**: 2026-11-02
- **Status**: active

### AD-008
- **Decision**: As sessões registradas pela Agenda ficam na mesma tabela `focus_sessions`, com a coluna `origin` (`focus` ou `manual`, padrão `focus`), `device_id = 'agenda'` e `end_reason = 'manual'`. Tempo gasto, relatórios, liquidação e cascatas leem a tabela sem distinguir a origem.
- **Reason**: Toda consulta de tempo já lê `focus_sessions` (`spentMilliseconds`, `clippedSessions`, a aba Sessões); uma tabela separada exigiria `UNION` em cada uma. Abordagem A do design da Agenda, aprovada pelo usuário em 2026-11-04.
- **Trade-off**: Uma sessão manual que termina mais tarde que a última mudança move o corte de `lastChange` (AD-002), e ações offline anteriores passam a ser recusadas.
- **Scope**: `agenda`, `foco-e-sons`, `relatorios`; schema `focus_sessions`; backend `services/sessions.ts`.
- **Date**: 2026-11-04
- **Status**: active

### AD-009
- **Decision**: Regras dependentes de data nas tarefas (a ida para Hoje pelo agendamento e a próxima ocorrência de uma série) são aplicadas na leitura e na escrita, nunca por job. Toda leitura que mostra colunas de tarefas (quadro, home, foco, widget, Agenda) chama `applyDueSchedules` antes de responder, e a próxima ocorrência nasce em `moveTask` ao entrar em `done`. As ocorrências futuras de uma série são calculadas na leitura, sem gravar.
- **Reason**: Funciona igual no servidor e no modo local (PGlite, sem worker), e o banco continua sendo a verdade para web, desktop, MCP e mobile. Estende o princípio de AD-001 para tarefas. Abordagem A do design do agendamento, aprovada pelo usuário em 2026-11-07.
- **Trade-off**: Leituras passam a gravar (idempotente, sob `lockList`); o polling do foco (AD-003) faz uma consulta a mais, mitigada pelo índice parcial `ix_tasks_schedule_due`. Conforma com AD-004 (dia no fuso do workspace), AD-006 (conclusão por `moveTask`) e AD-007 (`GET /agenda/scheduled` fechada a tokens).
- **Scope**: `agendamento`, `listas-e-quadro`, `foco-e-sons`, `agenda`; schema `tasks`, `task_series`; backend `services/schedule.ts`, `services/series.ts`, `services/tasks.ts`.
- **Date**: 2026-11-07
- **Status**: active

### AD-010
- **Decision**: Todo total de tempo que soma trechos com início e fim segue `workspaces.hours_count_mode` (`gross` soma cada trecho; `net` mede a união, e o trecho de pausa coberto por tarefa conta só como tarefa). No backend a união é `range_agg(tstzrange)` com `unnest` e diferença de multiranges; no frontend, `measure` de `lib/time/intervals.ts`. Somas de estimativas sem horário não seguem o modo.
- **Reason**: Issue #42: sessões e blocos podem se sobrepor (AD-008, plano), e o workspace escolhe se a hora repetida conta. Multirange funciona igual no Postgres 16 e no PGlite (conferido em 2026-11-10). Abordagem escolhida pelo usuário em 2026-11-10.
- **Trade-off**: Toda tela nova com total de tempo precisa ler o modo e ter teste nos dois; o tempo por lista dos Relatórios continua bruto e não soma o total líquido.
- **Scope**: `contagem-de-horas`, `agenda`, `relatorios`, `planejamento-diario`, `foco-e-sons`; backend `services/focus-settle.ts`, `services/reports.ts`; frontend `lib/agenda`, `lib/plan`, `lib/time`.
- **Date**: 2026-11-10
- **Status**: active

### AD-011
- **Decision**: O card de tarefa do quadro mostra sempre só nome, estimativa e tempo registrado. Todo campo novo no card (prioridade, prazo, flag, aguardando e os que vierem) só aparece quando ligado na configuração do quadro: um popover aberto pela engrenagem da barra do quadro, no mesmo padrão do popover de Sons do foco (`components/focus/sound-settings.tsx`). Desligar esconde só no card; o dado continua salvo e editável.
- **Reason**: Pedido do usuário em 2026-11-13: o card não deve crescer a cada feature; quem não usa um campo não o vê.
- **Trade-off**: Toda feature que põe um campo no card precisa de uma entrada na configuração e de teste com o campo ligado e desligado.
- **Scope**: `caixa-de-entrada` e toda feature futura que mexer no card do quadro; frontend `components/board/task-card.tsx`.
- **Date**: 2026-11-13
- **Status**: active

### AD-012
- **Decision**: O app desktop registra um único atalho global, o de captura (`CommandOrControl+Shift+Space` por padrão, ligável e trocável), e só em `desktop/src/main/capture-shortcut.ts`. Todo outro atalho, inclusive o do widget, continua só com a janela em foco (`before-input-event`, WIDGET-05).
- **Reason**: Capturar com outro app na frente é o objetivo da janelinha de captura; o usuário aceitou a exceção ao WIDGET-05 só para isso em 2026-11-13.
- **Trade-off**: O teste do WIDGET-05 passa a ter uma exceção nomeada; se o sistema recusar a combinação, o atalho fica desligado até o usuário escolher outra.
- **Scope**: `caixa-de-entrada`, `widget-desktop`; `desktop/src/main`.
- **Date**: 2026-11-13
- **Status**: active

### AD-013
- **Decision**: As tarefas de um grupo de tarefas formam um bloco contíguo na ordem da coluna (`tasks.position`). Toda escrita que insere ou move tarefas numa coluna roda `normalizeBlocks`, que junta as tarefas de cada grupo na posição da primeira delas. O contêiner do quadro é desenhado a partir desses blocos; não existe uma ordem própria do grupo.
- **Reason**: Uma ordem só para o quadro, o foco, o widget e o MCP. Escolha do usuário em 2026-11-13.
- **Trade-off**: Toda escrita de posição precisa passar pela normalização, e uma tarefa não pode ficar "solta" no meio do bloco do próprio grupo.
- **Scope**: `caixa-de-entrada` e toda feature que mover tarefas; backend `services/tasks.ts`, `services/groups.ts`; frontend `lib/board/blocks.ts`.
- **Date**: 2026-11-13
- **Status**: active

## Handoff

- **Feature**: `.specs/features/contagem-de-horas` (#42)
- **Phase / Task**: Execute concluído (T1–T8); Verifier PASS na iteração 1, ressalvas 1 e 2 resolvidas
- **Completed**: as 12 features com Verifier PASS (as 11 anteriores e contagem-de-horas)
- **In-progress** (file:line): none
- **Next step**: testar no navegador (o card nas configurações, o tooltip do total na Agenda, a barra do plano e o aviso dos Relatórios em `Horas líquidas`); abrir o PR da branch `claude/issue-42-planning-c3b7c9`
- **Blockers**: none
- **Uncommitted files**: none
