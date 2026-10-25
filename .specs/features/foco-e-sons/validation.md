# Foco e sons: validação (iteração 3 de 3)

**Data**: 2026-10-24
**Spec**: `.specs/features/foco-e-sons/spec.md`
**Intervalo do diff**: `194157e..HEAD` (HEAD = `a0cf1e9`, 52 commits, 104 arquivos, +10437/−199). Correções desta iteração: `378b84e..adcb34a` (testes e a regra de sessão parada) e a nota de design `a0cf1e9`
**Verificador**: sub-agente independente (autor ≠ verificador)

## Veredito: FAIL ❌

Os gates estão verdes. Os 5 mutantes vivos da iteração 2 (N10, N12, N7, N2, U1) agora morrem, e a nova regra de sessão parada (`start` e `takeover` respondem 409, e a tela de foco não começa sozinha) está coberta nos três pontos: servidor, cliente otimista e `shouldStart`. **Mas 4 das 21 mutações sobreviveram**:

- **S2 e S5**: o limite de exatamente 120 s na nova regra de `start`, no servidor e no cliente.
- **V1**: a ordem da fila depois de `Tentar de novo`.
- **V3**: o relógio usado para medir as 24h da fila.

Nenhuma delas é equivalente (veja a justificativa no sensor). Por isso SYNC-06, SYNC-07 e SYNC-11 ficam ⚠️: 39 de 42 ✅. Esta é a última iteração prevista (3 de 3): pelo `validate.md`, as lacunas vão para o usuário decidir.

---

## Risco aceito

- **Decisão**: o usuário aceitou o risco das 4 lacunas de teste (V1, V3, S2, S5) em 2026-10-24, depois da 3ª iteração, e pediu para seguir para `widget-desktop`.
- **Registro**: débito técnico em [gabrielauzier/trackzyn#2](https://github.com/gabrielauzier/trackzyn/issues/2) (label `tech-debt`), com a correção sugerida para cada lacuna.
- **Efeito**: nenhum critério tem comportamento errado; faltam testes que protejam a ordem do `retry`, o relógio do prazo de 24h e o limite de 120 s no `start`. O veredito continua FAIL e `validate_state.py` continua reprovando esta feature até a issue ser resolvida e o Verifier rodar de novo.

## Histórico

- **Iteração 1** (HEAD `17dee05`): FAIL. SYNC-08 e SYNC-09 só eram protegidos na tela de foco. No SYNC-11, o heartbeat resolvia sozinho a sessão parada, e o diálogo só existia na tela de foco. SYNC-05 tinha o mutante M19 vivo. FOCUS-02 e FOCUS-16 não conferiam o destaque. O teste de SYNC-12 era tautológico. Não havia teste da meia-noite. Sensor: 23 de 24 mortas.
- **Iteração 2** (HEAD `1d6618e`): FAIL. O `FocusGuard` foi montado no `AppLayout`, o `GET /api/focus` passou a aceitar `list_id` opcional e o heartbeat passou a ser recusado numa sessão parada. Ficaram vivos N2, N7, N10, N12 e U1 (15 de 20 mortas e N9 equivalente), com 38 de 42 ✅. Ficou também um risco residual: `start` e `takeover` resolviam uma sessão parada sem a escolha do usuário.
- **Iteração 3** (este relatório): novos testes para N10 (`routes/focus.test.ts:71`, `app-layout.test.tsx:240` e `:251`), N12 (`frontend/src/lib/api.test.ts`, novo, com o axios real e só o adaptador trocado), N7 (`stale-session-dialog.test.tsx:44`), N2 (`app-layout.test.tsx:291`) e U1 (caso `docs/focus-transitions.json` L1365). Regra nova: `startFocus` responde 409 com a sessão parada (`backend-node/src/services/focus.ts:202`), o cliente otimista faz o mesmo (`frontend/src/lib/focus/optimistic.ts:158`) e `shouldStart` devolve `false` com `stale` (`frontend/src/pages/focus.tsx:36`). A regra tem 3 casos novos no JSON (L1391, L1418, L1445) e o teste `focus.test.tsx:229`.

---

## Conclusão das tasks

As 36 tasks (T1 a T36) estão `✅ Done` em `tasks.md`. Os commits desta iteração só acrescentam testes, mais 2 linhas de regra no servidor, 2 no cliente otimista e 2 na tela de foco. A única mudança num teste existente é a contagem de casos do JSON, de 46 para 50 (`optimistic.test.ts:142`).

---

## Gate

| Pacote | Comando | Resultado |
| ------ | ------- | --------- |
| backend-node | `npm --prefix backend-node run lint && run typecheck && test -- --coverage` | exit 0 / 0 / 0. **291 passaram, 9 pulados** (31 arquivos, 1 pulado). Os pulados são `test/worker.test.ts` e `test/ports/key-value-store.test.ts` (`describe.runIf(process.env.REDIS_URL)`): precisam de Redis, já existiam e não são desta feature |
| frontend | `npm --prefix frontend run lint && run typecheck && test` | exit 0 / 0. Na suíte, **817 passaram, 0 falharam** (106 arquivos) |
| desktop | `npm --prefix desktop run lint && run typecheck && test` | exit 0 / 0. Na suíte, **194 passaram, 4 pulados**, exit 0 (veja a nota abaixo) |
| frontend build | `npm --prefix frontend run build` | exit 0 |

**Nota sobre o desktop**: na primeira execução, rodada **em paralelo** com o backend e o build do frontend, `npm --prefix desktop test` saiu com exit 1. Os 8 testes que falharam são todos de `desktop/scripts/import-crash.test.ts` e caíram por `Test timed out in 5000ms`: o teste mata processos com SIGKILL e ficou lento com a CPU disputada. O arquivo não é desta feature (nenhum commit de `194157e..HEAD` toca `desktop/scripts`). Rodado sozinho logo em seguida: exit 0, 194 passaram e 4 pulados. A causa do exit diferente de zero está explicada: não é falha de comportamento.

**Suíte do frontend repetida 5 vezes** (sequencial, sem nada em paralelo): exit 0, 0, 0, 0 e 0, com 817 de 817 em cada execução. A busca por `Unhandled|dispatchEvent` nos 5 logs encontrou 0 ocorrências.

**Contagem de testes**:

| Pacote | Iteração 1 | Iteração 2 | Agora |
| ------ | ---------- | ---------- | ----- |
| backend | 282 | 286 | 291 |
| frontend | 793 | 803 | 817 |
| desktop | 194 | 194 | 194 |

Nenhuma redução. No worktree descartável, a linha de base também passou nos três pacotes (291, 817 e 194).

---

## Critérios de aceite ancorados na spec

`T#n` = caso `n` de `docs/focus-transitions.json` (agora 50), conferido no servidor por `backend-node/test/services/focus-transitions.test.ts:227-246` (status, `code`, sessões, tarefas e estado) e no cliente por `frontend/src/lib/focus/optimistic.test.ts:147`. A linha do caso no JSON aparece entre parênteses. Todas as linhas citadas foram reabertas no HEAD `a0cf1e9`. As que mudaram desde a iteração 2 foram corrigidas: as rotas do backend andaram +10 linhas, e em `app-layout.test.tsx` e `focus.test.tsx` os testes novos deslocaram os seguintes.

### P1: Focar nas tarefas de Hoje

| Critério | Resultado definido pela spec | Evidência (`file:line` e asserção) | Resultado |
| -------- | ---------------------------- | ---------------------------------- | --------- |
| FOCUS-01 | Seletor, `Hoje`, ícones, `Est.: <soma>`, `x/y Concluídas`, pendentes e `+ Adicionar tarefa` | `frontend/src/pages/focus.test.tsx:115`: `heading level 1 'Today'`, `Sound settings`/`Back to the board`/`Collapse`, `'Est.: 1hr 30min'`, `'0/2 Done'`, `'Add task'`. `frontend/src/pages/list-board.test.tsx:369`: `Focus now` leva à tela de foco | ✅ |
| FOCUS-02 | Sessão na 1ª pendente, contorno destacado, `HH:MM:SS` = estimativa − gasto | `focus.test.tsx:131`: `toMatchObject({type:'start',task_id:taskA.id})`. `focus.test.tsx:139`: `toHaveClass('border-2','border-primary')`, `data-running='true'`, e a próxima tarefa sem `border-primary`. `lib/focus/display.test.ts:42` (3000). `components/focus/focus-task-card.test.tsx:8` (`'00:50:00'`). T#0 (L16) | ✅ |
| FOCUS-03 | ±1 s com o relógio 5 min adiantado ou atrasado | `lib/focus/clock.test.ts:9-30`: `Math.abs(serverNow()-SERVER) < 1000` com ±5 min. `use-focus.test.tsx:136`. `display.test.ts:51` | ✅ |
| FOCUS-04 | Encerra a sessão, o tempo para e o botão vira `Retomar` | T#13 (L401): `end_reason:'pause'`. `display.test.ts:114`. `focus-controls.test.tsx:26` e `:86` | ✅ |
| FOCUS-05 | Nova sessão, mesmo valor | T#1 (L46). `focus-controls.test.tsx:35` | ✅ |
| FOCUS-06 | Encerra, vai para o fim de Hoje e começa a próxima | T#19 (L572), T#20 (L609). `backend-node/test/routes/focus.test.ts:196` | ✅ |
| FOCUS-07 | `Pular` desabilitado com 1 pendente | `focus-controls.test.tsx:53`: `toBeDisabled()`. T#21 (L646): 409 | ✅ |
| FOCUS-08 | Encerra, `Concluídas` com `completed_at`, começa a próxima | T#23 (L699). `routes/focus.test.ts:212`: `completed_at: body.occurred_at` | ✅ |
| FOCUS-09 | `Tudo limpo` e nenhuma sessão aberta | T#24 (L736). `focus.test.tsx:172`: `'All clear'`, `queryByRole('timer')` ausente e `'1/1 Done'` | ✅ |
| FOCUS-10 | `ended_at` exato, `00:00:00`, `Estender` e `Concluir` | `backend-node/test/services/focus-settle.test.ts:45`: `endedAt == at(T0,30)`. `display.test.ts:61`. `components/focus/extend-prompt.test.tsx:15` | ✅ |
| FOCUS-11 | App fechado: `ended_at` no instante em que o gasto igualou a estimativa | `focus-settle.test.ts:24` (liquidado 2h depois: `endedAt == at(T0,30)`, `'estimate'`) e `:116` | ✅ |
| FOCUS-12 | Sobe a partir da estimativa (`01:00:00`, `01:00:01`), estimativa igual | T#28 (L851). `display.test.ts:77`. `focus-task-card.test.tsx:15` (`'01:00:01'`). `routes/focus.test.ts:230`: `estimate_minutes: 1` | ✅ |
| FOCUS-13 | Sobe depois de `Pausar` e `Retomar` | T#4 (L141). `display.test.ts:87`. `backend-node/test/services/focus-state.test.ts:104`. A mutação V6 morreu | ✅ |
| FOCUS-14 | Sem estimativa: sobe e nunca há `Estender` | T#2 (L78), T#31 (L935). `display.test.ts:98` e `:108`. `focus-state.test.ts:115` | ✅ |
| FOCUS-15 | Encerra no instante da mudança e volta ao quadro | `focus-task-left.test.ts:23` (`at(T0,12,5)`, `task_left`) e `:72`. `db/focus-schema.test.ts:60` (excluir apaga em cascata, pela AD-005). `focus.test.tsx:205`: `'Board page'` | ✅ |
| FOCUS-16 | Volta ao quadro com a sessão aberta e o cartão destacado, com o tempo correndo | `focus.test.tsx:219`: home sem `focus.send` e `'Board page'`. `list-board.test.tsx:377`: timer `00:50:00` no cartão, `toHaveClass('border-2','border-primary')`, e o concluído sem `border-primary` | ✅ |
| FOCUS-17 | 403 `Read-only role` em toda ação | `routes/focus.test.ts:341`: as 9 rotas com `statusCode 403` e `detail:'Read-only role'` | ✅ |
| FOCUS-18 | 409 sem mudar a sessão nem `completed_at` | T#10, 11, 12, 16, 17, 18, 21, 22, 26 (L802), 27, 29, 30, 34 e 37: 409, `invalid_transition` e sessões iguais às do início (`focus-transitions.test.ts:236-239`) | ✅ |

### P1: Intervalos

| Critério | Resultado definido pela spec | Evidência | Resultado |
| -------- | ---------------------------- | --------- | --------- |
| BREAK-01 | 5/10/15 ou 1 a 120: encerra a tarefa, abre o intervalo e faz a contagem regressiva | T#32 (L961), T#33 (L993). `break-picker.test.tsx:14` e `:37`. `display.test.ts:121` | ✅ |
| BREAK-02 | < 1 ou > 120: 422 e nada aberto | `focus-transitions.test.ts:332` (0 e 121 com 422, 1 e 120 aceitos). `routes/focus.test.ts:247`. `optimistic.test.ts:199` | ✅ |
| BREAK-03 | Duração exata, som e tarefa pausada | T#35 (L1051). `display.test.ts:130`. `use-focus-sounds.test.tsx:177`: `['break_end']`. V4 morreu | ✅ |
| BREAK-04 | `Encerrar intervalo`: o tempo que passou e a tarefa pausada | T#36 (L1085): `break_stop`. `focus-controls.test.tsx:77`. V9 morreu | ✅ |
| BREAK-05 | App fechado: a duração exata | `focus-settle.test.ts:35`: `endedAt == at(T0,5)`, `'break_end'`. V4 morreu | ✅ |

### P1: Sons

| Critério | Resultado definido pela spec | Evidência | Resultado |
| -------- | ---------------------------- | --------- | --------- |
| SOUND-01 | Conclusão pelo foco, pelo widget ou pelo check do quadro, 1 vez | `focus.test.tsx:192`: `[['complete']]`. `list-board.test.tsx:390`, `:400` e `:413`. O widget é da feature `widget-desktop` | ✅ |
| SOUND-02 | Múltiplo de 10 min do tempo total, 1 vez | `lib/sounds/triggers.test.ts:18`, `:25` e `:39`. `use-focus-sounds.test.tsx:72` | ✅ |
| SOUND-03 | Fim da estimativa, 1 vez | `triggers.test.ts:69` e `:76`. `use-focus-sounds.test.tsx:72` | ✅ |
| SOUND-04 | Fim do intervalo, 1 vez | `triggers.test.ts:85` e `:93`. `use-focus-sounds.test.tsx:177` | ✅ |
| SOUND-05 | 4 sons por código, timbres diferentes, sem arquivo | `lib/sounds/synth.test.ts:77-122`: `new Set(sequences).size == 4`. Nenhum arquivo de áudio no diff | ✅ |
| SOUND-06 | Desligar só aquele som, neste dispositivo, e continuar ao reabrir | `prefs.test.ts:13` e `:22`. `use-focus-sounds.test.tsx:91` | ✅ |
| SOUND-07 | Navegador e desktop | `gate.test.ts:11` e `:17` | ✅ |
| Decisão "Sons com vários dispositivos" | Só o dono da sessão toca; a conclusão só onde foi feita | `triggers.test.ts:119`, `:126`, `:133` e `:141`. `use-focus-sounds.test.tsx:149` e `:158`. V8 (`break_end` sem conferir o dono) morreu | ✅ |

### P1: Dispositivos, conexão e fechamento

| Critério | Resultado definido pela spec | Evidência | Resultado |
| -------- | ---------------------------- | --------- | --------- |
| SYNC-01 | No máximo 1 aberta; 2 inícios simultâneos deixam 1 | `db/focus-schema.test.ts:46`. `focus-transitions.test.ts:314`: `toHaveLength(1)` | ✅ |
| SYNC-02 | "Você já está focando em outro dispositivo." com `Assumir` e `Cancelar`, sem abrir sessão | T#5 (L175). `elsewhere-dialog.test.tsx:17` e `:47` (pt-BR). `focus.test.tsx:251` | ✅ |
| SYNC-03 | Mesma tarefa: mantém a sessão sem cortar | T#6 (L201): o mesmo `started_at` e o `device` trocado | ✅ |
| SYNC-04 | Outra tarefa: encerra e abre no mesmo instante | T#7 (L232) | ✅ |
| SYNC-05 | Aplica na tela, guarda com o horário corrigido e envia ao reconectar | `use-focus.test.tsx:145` e `:176` (`occurred_at == iso(server)` com `server_now = NOW + 5 min`). `queue.test.ts:32`, `:91` e `:107`. `api.test.ts` (`focus.send` monta a rota e o corpo) | ✅ |
| SYNC-06 | Ação com mais de 24h: descarta e mostra a frase | `queue.test.ts:48` (24h01 descartada, 23h59 enviada, com `nowMs` passado à mão). `offline-conflicts.test.tsx:73` e `:83`. **Mas V3 sobreviveu**: o único chamador, `use-focus.tsx:31`, usa o padrão `nowMs = serverNow()` (`queue.ts:93`). Trocado por `Date.now()`, as 24h passam a ser medidas pelo relógio local (com o relógio 5 min adiantado, uma ação de 23h56 seria descartada), e nenhum teste falha | ⚠️ (mutante vivo) |
| SYNC-07 | Recusada: `Tentar de novo` e `Descartar` | `queue.test.ts:64` (409 e 422 viram conflito, e `retry` reenvia). `offline-conflicts.test.tsx:32`, `:41` e `:57`. **Mas V1 sobreviveu**: `retry` (`queue.ts:60-62`) recoloca a ação na fila pela ordem do clique, e inverter a ordenação não quebra nada. O teste só tem uma ação na fila. Com outra ação pendente, a ação refeita seria enviada depois de uma mais nova, e o servidor a recusaria com `invalid_time` (AD-002: `occurred_at` anterior à última mudança) | ⚠️ (mutante vivo) |
| SYNC-08 | Fechar o desktop com uma tarefa contando: "Há uma tarefa contando.", `Pausar e sair`, `Cancelar` | `desktop/src/main/focus-close.test.ts:69`, `:83`, `:92` e `:107` (fecha aos 3000 ms; V7 morreu). `app-layout.test.tsx:211` (quadro), `:227` (home) e **`:240`** (quadro de outra lista: `reportFocusState({active:true,running:true})` e `focus.get(OTHER)`). **`routes/focus.test.ts:71`**: `GET ?list_id=<outra>` devolve a sessão da lista dela. `api.test.ts` (`focus.get()` sem `list_id`). N10 e N12 morreram | ✅ (era ⚠️) |
| SYNC-09 | Fechar a aba com uma tarefa contando: alerta e pausa no horário do fechamento | `use-leave-guard.test.tsx:61` e `:67`. `app-layout.test.tsx:264` (`beforeunload.defaultPrevented` e `fetch('/api/focus/pause',{keepalive:true})`) e **`:251`** (outra lista: `defaultPrevented == true`). N10 e N12 morreram | ✅ (era ⚠️) |
| SYNC-10 | Sinal a cada 60 s | `use-focus.test.tsx:76` (0 aos 59 999 ms, 1 aos 60 000, 2 aos 120 000) e `:90`. **`app-layout.test.tsx:291`**: o `AppLayout` com a `FocusPage` em `/focus/LIST` manda 1 heartbeat aos 60 s e 2 aos 120 s, e `focus.get` nunca recebe `undefined`. `routes/focus.test.ts:275`. `api.test.ts` (rota e corpo do heartbeat). N2 morreu | ✅ (era ⚠️) |
| SYNC-11 | Ao abrir com mais de 120 s sem sinal: mostrar o tempo e oferecer `Manter` e `Cortar no último sinal` | `focus-state.test.ts:151` (121 s sim; 119 e 120 s não). T#41 a T#45. **T#46 (L1365)**: `recover` com exatamente 120 s responde 409 (U1 morreu). **T#47 a T#49 (L1391, L1418, L1445)**: `start` e `takeover` com a sessão parada respondem 409 e mantêm a sessão e o `last_seen_at` (S1, S3 e S4 morreram). **`focus.test.tsx:229`**: com `stale`, para os dois dispositivos, nenhum `send` (S6 e S7 morreram). **`stale-session-dialog.test.tsx:44`**: `Escape` e clique no overlay não fecham e não chamam `onRecover` (N7 morreu). `app-layout.test.tsx:329`. `routes/focus.test.ts:275` e `:306`. **Mas S2 e S5 sobreviveram**: o limite de exatamente 120 s da regra nova do `start` (`>` → `>=`), no servidor (`focus.ts:202`) e no cliente otimista (`optimistic.ts:158`), não tem caso. Com 120 s exatos, o `GET` diz `stale: null` (`focus-state.test.ts:156`), então a tela de foco pediria `start` e receberia 409, sem diálogo | ⚠️ (mutante vivo) |
| SYNC-12 | Reabrir com a tarefa pausada abre a home | `frontend/src/App.test.tsx:57`: fica em `/`, sem `heading 'Today'`, `focus.get` só com `undefined` e nenhum `send`. `desktop/src/main/window.ts:24` carrega `${APP_ORIGIN}/` | ✅ |

**Status**: 39 de 42 ✅, 3 ⚠️ (SYNC-06, SYNC-07, SYNC-11) por mutantes vivos, 0 ❌. O código no HEAD faz o que a spec pede nos caminhos lidos. O que falta é teste que segure três limites e uma ordem.

---

## Casos de borda

- [x] **Tarefa concluída no quadro enquanto está em foco**: `list-board.test.tsx:400` e `:413`. `focus-task-left.test.ts:32`. T#23.
- [x] **Gasto igual à estimativa ao abrir**: T#3 (L110). `focus.test.tsx:160`: `'00:00:00'`, `Extend` e nenhum `send`. V5 (`<` → `<=` em `isAwaitingExtend`) morreu com 8 testes.
- [x] **Navegador bloqueia o 1º som**: `synth.test.ts:139`.
- [x] **Sessão que atravessa a meia-noite**: `focus-state.test.ts:171`: de 23:30 a 00:30 em São Paulo, `rows toHaveLength(1)` e `spent_seconds: 3600`.

---

## Pontos que as correções mudaram (conferidos no código)

- **Regra de sessão parada**:
  - `startFocus` checa `now − lastSeenAt > 120 s` antes de tudo (`backend-node/src/services/focus.ts:202`). Como `takeover` é um `start` com `takeover: true`, a mesma linha cobre os dois. Isso responde ao risco residual (a) e (b) da iteração 2.
  - O cliente otimista espelha a regra (`optimistic.ts:158`). Lá, `lastSeenMs` só existe quando o servidor informou `stale` ou depois de um `start` otimista (`optimistic.ts:64`, `:125`).
  - `shouldStart` devolve `false` com `stale` (`pages/focus.tsx:36`).
  - Com isso, só `recover` resolve a sessão parada (`focus.ts:376`), de qualquer dispositivo. É o que diz a emenda de `design.md` (`a0cf1e9`).
- **Observação, fora dos ACs**: as checagens de parada usam o `now` do servidor (o recebimento) e não o `occurred_at`.
  - Durante uma queda de rede de mais de 120 s com a tarefa contando, o servidor deixa de receber heartbeats. Ao reconectar, a sessão aparece parada e o usuário precisa escolher `Manter`.
  - Isso já era assim na iteração 2. É coerente com SYNC-11, mas faz o Critério de Sucesso "rede desligada por 10 min… tempo igual ao de um foco sem queda" depender do `Manter`.
  - Fica registrado para o usuário. Não é lacuna de AC.

---

## Sensor de discriminação

Rodado no worktree descartável `…/scratchpad/verify-fs3` (`git worktree add … HEAD`, com os `node_modules` dos 3 pacotes em symlink). Cada mutação foi aplicada por substituição exata, conferida com 1 ocorrência, seguida da suíte inteira do pacote (`npm test`) e de `git checkout` do arquivo.

Ordem do trabalho:

1. A linha de base passou no worktree: backend 291, frontend 817 e desktop 194.
2. O `git status --porcelain` do checkout real foi gravado antes do sensor: ` M .specs/LESSONS.md`, ` M .specs/lessons.json` e `?? .specs/features/foco-e-sons/validation.md`.
3. Depois das mutações, o worktree foi removido com `git worktree remove --force` (`git worktree list` mostra só o checkout real).
4. O `git status --porcelain` saiu idêntico ao gravado (conferido com `diff`).
5. Os MD5 de `LESSONS.md` e `lessons.json` não mudaram.

| # | Arquivo:linha | Mutação | Morta? |
| - | ------------- | ------- | ------ |
| N10 | `backend-node/src/services/focus-state.ts:100` | `readFocusState` só devolve a sessão se for da lista pedida | ✅ (1: `routes/focus.test.ts:71`) |
| N12 | `frontend/src/lib/api.ts:377` | `focus.get()` sem lista manda `list_id=` vazio | ✅ (1: `api.test.ts`) |
| N7 | `frontend/src/components/focus/stale-session-dialog.tsx:31` | `onOpenChange` que fecha o diálogo sem escolha | ✅ (1: `stale-session-dialog.test.tsx:44`) |
| N2 | `frontend/src/components/focus/focus-guard.tsx:12` | o guarda deixa de reconhecer `/focus/:listId` | ✅ (1: `app-layout.test.tsx:291`) |
| U1 | `backend-node/src/services/focus.ts:376` | `recover` com `<=` → `<` (aceita exatamente 120 s) | ✅ (1: T#46) |
| S1 | `focus.ts:202` | remove a checagem de sessão parada no `start` | ✅ (3: T#47 a T#49) |
| S2 | `focus.ts:202` | `> STALE_AFTER_MS` → `>=` (recusa o `start` com exatamente 120 s) | ❌ **Sobreviveu** (291/291) |
| S3 | `focus.ts:202` | a checagem só vale com `takeover` | ✅ (1: T#47) |
| S4 | `frontend/src/lib/focus/optimistic.ts:158` | remove a checagem de sessão parada no cliente | ✅ (3) |
| S5 | `optimistic.ts:158` | `>` → `>=` no cliente | ❌ **Sobreviveu** (817/817) |
| S6 | `frontend/src/pages/focus.tsx:36` | remove `if (state.stale !== null) return false` | ✅ (1: `focus.test.tsx:229`) |
| S7 | `focus.tsx:36` | a guarda de `stale` só vale para a sessão deste dispositivo | ✅ (1: `focus.test.tsx:229`) |
| V1 | `frontend/src/lib/focus/queue.ts:61` | `retry` recoloca a ação em ordem decrescente do clique | ❌ **Sobreviveu** (817/817) |
| V2 | `queue.ts:7` | `MAX_AGE_MS` = 24h + 5 min | ✅ (1: `queue.test.ts:48`) |
| V3 | `queue.ts:93` | padrão `nowMs = serverNow()` → `Date.now()` (idade medida pelo relógio local) | ❌ **Sobreviveu** (817/817) |
| V4 | `backend-node/src/services/focus-settle.ts:19` | a liquidação só fecha sessões de tarefa (o intervalo vencido fica aberto e o `break/end` depois do prazo o encerraria no clique) | ✅ (2) |
| V5 | `focus-state.ts:76` | `awaiting_extend`: `spent < estimate` → `<=` | ✅ (8) |
| V6 | `focus-state.ts:83` | `awaiting_extend` também quando a última sessão terminou em `pause` | ✅ (2) |
| V7 | `desktop/src/main/focus-close.ts:17` | prazo de resposta do `Pausar e sair` de 3000 → 5000 ms | ✅ (1: `focus-close.test.ts:107`) |
| V8 | `frontend/src/lib/sounds/triggers.ts:43` | `break_end` toca mesmo numa sessão de outro dispositivo | ✅ (2) |
| V9 | `focus.ts:339` | `Encerrar intervalo` grava `break_end` no lugar de `break_stop` | ✅ (1: T#36) |

**Por que os 4 vivos não são equivalentes:**

- **S2 e S5**: a spec define parada como "sem sinal há **mais de** 120 s", e o servidor segue isso no `GET` (`focus-state.test.ts:156`: 120 s → `stale: null`) e no `recover` (T#46). Com `>=`, exatamente aos 120 s o `GET` diria "não parada" enquanto o `start` responderia 409. A tela de foco tentaria começar (`shouldStart` vê `stale: null`) e receberia uma recusa sem diálogo. É o mesmo tipo de limite que U1, que a iteração 2 contou como vivo e que foi corrigido. Para manter o mesmo critério, contam como vivos.
- **V1**: muda a ordem de envio com mais de uma ação na fila, e o servidor recusa `occurred_at` anterior à última mudança (AD-002). O resultado observável muda: a ação refeita viraria conflito de novo.
- **V3**: o único chamador de produção usa o padrão (`use-focus.tsx:31`). Com o relógio local errado, a regra das 24h (SYNC-06) passa a seguir o relógio local, contra a premissa "Relógio que vale: o do servidor". Os testes passam `nowMs` à mão e nunca exercitam o padrão.

**Profundidade do sensor**: P0, caminho crítico (registro de tempo): 21 mutações manuais. Destas, 5 são reexecuções da iteração 2, 7 estão na regra nova de sessão parada e 9 são novas, em lógica não mutada nas iterações 1 e 2 (ordem do `retry`, prazo de 24h, relógio da fila, liquidação do intervalo, derivação de `awaiting_extend` (2), prazo de 3 s do desktop, dono do som de `break_end` e motivo do `break/end`).
**Resultado**: 17 de 21 mortas, 4 vivas (S2, S5, V1, V3), 0 equivalentes. FAIL ❌.

---

## Qualidade do código

| Princípio | Status |
| --------- | ------ |
| Código mínimo, sem escopo a mais | ✅ (a regra nova tem 1 linha em cada uma das 3 camadas) |
| Mudanças cirúrgicas | ✅ (esta iteração só acrescentou testes, mais as 3 linhas de regra e a nota de design) |
| Segue os padrões | ✅ (`api.test.ts` testa no nível HTTP, com o axios real e só o adaptador trocado) |
| Ancoragem na spec | ✅ nos 42; as 3 ⚠️ são de discriminação, não de valor errado |
| Cobertura por camada | ⚠️ faltam os limites de 120 s no `start` (servidor e cliente), a ordem do `retry` com várias ações e o relógio padrão do `flush` |
| Todo teste mapeia para AC, caso de borda ou AD | ✅ |
| Diretrizes documentadas | nenhuma específica: padrões fortes aplicados |

---

## Lacunas em ordem de prioridade, com a correção sugerida

1. **(Major) V1, ordem do `Tentar de novo`: SYNC-07, SYNC-05.**
   - **Correção**: em `frontend/src/lib/focus/queue.test.ts`, enfileirar a ação A (clique t0), recusá-la e enfileirar B (t1 > t0). Chamar `retry(A)` e conferir `pending()` igual a `[A, B]`. No `flush`, conferir que `send` recebe A e depois B.
2. **(Major) V3, relógio das 24h da fila: SYNC-06.**
   - **Correção**: em `queue.test.ts` (ou `use-focus.test.tsx`), chamar `updateOffset` com `server_now` 10 min à frente do `Date.now()` falso. Uma ação de 23h55 pelo relógio do servidor (24h05 pelo local) é enviada, e uma de 24h01 pelo servidor (23h51 pelo local) é descartada. Tudo com `flush(send)` sem passar `nowMs`.
3. **(Minor) S2, limite de 120 s no `start` do servidor: SYNC-11.**
   - **Correção**: um caso em `docs/focus-transitions.json` com `last_seen_at` a exatamente 120 s do `start` em outra tarefa do mesmo dispositivo, esperando 200 e a troca (`switch`), como no T#46 para o `recover`.
4. **(Minor) S5, o mesmo limite no cliente otimista: SYNC-11.**
   - **Correção**: o caso da lacuna 3 já mata o S5 se o estado inicial levar `lastSeenMs` (o cliente só o preenche com `stale` ou depois de um `start` otimista). Alternativa em `optimistic.test.ts:162` (estado mais antigo que a ação): `start` otimista em t, outro `start` em t + 120 000 ms aceito e em t + 120 001 ms recusado.

Esta é a iteração 3 de 3. Pelo `validate.md`, as lacunas não voltam para um novo ciclo automático: vão para o usuário decidir (corrigir os 4 testes e verificar de novo, ou aceitar o risco). Nenhuma lacuna pede mudança de código de produção.

---

## Atualização do rastreio

| Requisito | Status anterior | Novo status |
| --------- | --------------- | ----------- |
| SYNC-08, SYNC-09, SYNC-10 | ⚠️ | ✅ Verificado |
| SYNC-11 | ⚠️ (N7, N12, U1) | ⚠️ Comportamento certo, teste a reforçar (S2, S5) |
| SYNC-06 | ✅ | ⚠️ Teste a reforçar (V3) |
| SYNC-07 | ✅ | ⚠️ Teste a reforçar (V1) |
| Os outros 36 | ✅ | ✅ Verificado |

---

## Resumo

**Geral**: ❌ Não está pronto (iteração 3 de 3: decisão do usuário)
**Verificação ancorada na spec**: 39 de 42 ✅, 3 ⚠️ (SYNC-06, SYNC-07, SYNC-11) por mutantes vivos, 0 ❌. Os 4 casos de borda ✅
**Sensor**: 17 de 21 mortas, 4 vivas (S2, S5, V1, V3), 0 equivalentes. Os 5 vivos da iteração 2 (N10, N12, N7, N2, U1) morrem
**Gate**:
- backend: 291 passando e 9 pulados (Redis), exit 0.
- frontend: 817 passando, 5 de 5 execuções com exit 0.
- desktop: 194 passando e 4 pulados, exit 0 sozinho. O exit 1 em paralelo foi de timeouts em `import-crash.test.ts`, fora da feature.
- build: exit 0.

**O que funciona**:
- o guarda em todas as rotas, inclusive com a sessão em outra lista;
- o contrato do `GET` sem lista no nível HTTP;
- o diálogo de sessão parada, que não se dispensa;
- só `recover` resolve uma sessão parada (servidor, cliente e tela de foco);
- o limite de 120 s do `recover`;
- o prazo de 3 s do desktop, a liquidação do intervalo, `awaiting_extend` e o dono dos sons.

**Próximo passo**: o usuário decide entre escrever os 4 testes das lacunas (só teste, pequenos) e pedir uma nova verificação, ou aceitar o risco registrado.
