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

## Handoff

- **Feature**: `.specs/features/` (listas-e-quadro → foco-e-sons → widget-desktop → relatorios)
- **Phase / Task**: Tasks - 89 tasks escritas e validadas; aguardando aprovação
- **Completed**: none
- **In-progress** (file:line): none
- **Next step**: Aprovar os 4 `tasks.md` e as skills por task, e começar o Execute por `listas-e-quadro` T1
- **Blockers**: none
- **Uncommitted files**: `.specs/`
- **Branch**: v2
