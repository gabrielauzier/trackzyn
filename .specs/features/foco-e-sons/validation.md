## Validation: foco-e-sons - PASS ✅

**Data**: 2026-10-25
**Spec**: `.specs/features/foco-e-sons/spec.md` (42 requisitos)
**Intervalo do diff**: `194157e..HEAD` (HEAD = `4e8d329`). O intervalo inclui também `widget-desktop`, `relatorios` e `listas-e-quadro`, que mexeram em código de foco. As correções desta iteração são `9fff35e` (W1) e `4e8d329` (W2).
**Verificador**: sub-agente independente (autor ≠ verificador). Iteração 5, re-verificação final.

## Veredito: PASS ✅

As 2 lacunas da iteração 4 foram fechadas só com testes, e os 2 mutantes (W1 e W2) agora morrem. Os 10 mutantes que já tinham sobrevivido em iterações anteriores (M19, N10, N12, N7, N2, U1, V1, V3, S2 e S5) continuam mortos. As 2 mutações novas desta iteração (X1 e X2) também morreram: **14 de 14 mortas**. Os gates estão verdes, com exit 0 em todos os comandos. **42 de 42 ✅**.

---

## Correções da iteração 4: conferidas

| Lacuna | Commit | Teste novo | Mutante |
| ------ | ------ | ---------- | ------- |
| W1, horário da pausa ao fechar a aba (SYNC-09) | `9fff35e` | `frontend/src/lib/focus/use-leave-guard.test.tsx:87`: `updateOffset(iso(NOW + 5 * 60_000))`, `pagehide` aos `NOW + 7000` locais, `expect(...occurred_at).toBe(iso(NOW + 5 * 60_000 + 7000))` | ✅ morto |
| W2, limite de 120 s no heartbeat (SYNC-10, SYNC-11) | `4e8d329` | Caso compartilhado T#51 (o 52º, `docs/focus-transitions.json` L1505): `last_seen_at: 10`, `heartbeat` aos 12 min (120 s exatos), espera 200, `last_seen_at: 12` e `stale: null`. Mais o teste direto do cliente em `optimistic.test.ts:235` | ✅ morto |

**Os commits só acrescentam testes e 1 caso no JSON** (conferido com `git show`): `9fff35e` mexe só em `use-leave-guard.test.tsx` (+11). `4e8d329` acrescenta 1 caso em `docs/focus-transitions.json` (+31) e 1 teste em `optimistic.test.ts` (+24), e muda a contagem de 51 para 52 (`optimistic.test.ts:142-143`). Nenhum código de produção mudou, e nenhuma asserção foi afrouxada. O executor do servidor só confere `cases.length > 0` (`focus-transitions.test.ts:222`) e roda todos os casos, então o caso novo entra sozinho.

**Sobre o teste direto do cliente (`optimistic.test.ts:235`)**: como o do S5 (`:210`), ele monta à mão um `stale` com `seconds: 120`, que o `GET` real nunca devolve. Ele fixa o contrato da função pura `applyOptimistic`, que deve espelhar o servidor ("mais de 120 s"). É sintético, mas não tautológico: a mutação X1 (`optimistic.ts:217`, `>` → `>=`) morre só por ele.

---

## Conclusão das tasks

As 36 tasks (T1 a T36) estão `✅ Done` em `tasks.md`.

---

## Gate

Rodado no checkout real (HEAD `4e8d329`), **um comando por vez**, sem nada em paralelo. O teste do desktop rodou sozinho.

| Pacote | Comando | Resultado |
| ------ | ------- | --------- |
| backend-node | `npm --prefix backend-node run lint` / `run typecheck` / `test -- --coverage` | exit 0 / 0 / 0. **341 passaram, 9 pulados** (34 arquivos, 1 pulado). Os pulados são os testes que pedem Redis (`describe.runIf(process.env.REDIS_URL)`), que já existiam e não são desta feature |
| frontend | `npm --prefix frontend run lint` / `run typecheck` / `test` | exit 0 / 0 / 0. **962 passaram, 0 falharam** (121 arquivos). 0 ocorrências de `Unhandled` no log |
| desktop | `npm --prefix desktop run lint` / `run typecheck` / `test` | exit 0 / 0 / 0. **248 passaram, 3 pulados** (35 arquivos) |
| frontend build | `npm --prefix frontend run build` | exit 0 |

**Contagem de testes**:

| Pacote | It. 1 | It. 2 | It. 3 | It. 4 | Agora |
| ------ | ----- | ----- | ----- | ----- | ----- |
| backend | 282 | 286 | 291 | 340 | 341 |
| frontend | 793 | 803 | 817 | 959 | 962 |
| desktop | 194 | 194 | 194 | 248 | 248 |

Nenhuma redução. O backend ganhou 1 (T#51). O frontend ganhou 3 (W1, T#51 no cliente e o teste direto do heartbeat).

---

## Critérios de aceite ancorados na spec

`T#n` = caso `n` (base 0) de `docs/focus-transitions.json` (agora 52), conferido no servidor por `backend-node/test/services/focus-transitions.test.ts:227-246` (status, `code`, sessões com `last_seen_at`, tarefas e estado) e no cliente por `frontend/src/lib/focus/optimistic.test.ts:147-159`. A linha do caso no JSON está entre parênteses. O caso novo entrou no fim, então as linhas dos casos antigos não mudaram.

As linhas citadas foram reconferidas no HEAD `4e8d329`. Os 2 commits novos só mexem em `use-leave-guard.test.tsx`, `optimistic.test.ts` e no JSON (sempre acrescentando no fim do arquivo ou depois do último teste do bloco), então as linhas das outras citações não andaram. Conferi por amostra: `focus.test.tsx:116`, `:141`, `:174` e `:231`, `clock.test.ts:18`, `queue.test.ts:63` e `:97`, `use-focus.test.tsx:176`, `use-leave-guard.test.tsx:67`, `stale-session-dialog.test.tsx:44`, `gate.test.ts:29`, `App.test.tsx:61`, `routes/focus.test.ts:71`, `:284`, `:315` e `:350`, `focus-state.test.ts:151` e `:171`, `focus-settle.test.ts:24`, `focus-schema.test.ts:46` e `desktop/src/main/focus-close.test.ts:69`. Todas abrem no teste citado.

### P1: Focar nas tarefas de Hoje

| Critério | Resultado definido pela spec | Evidência (`file:line` e asserção) | Resultado |
| -------- | ---------------------------- | ---------------------------------- | --------- |
| FOCUS-01 | Seletor, `Hoje`, ajustes e home (recolher só no desktop), `Est.: <soma>`, `x/y Concluídas`, pendentes e `+ Adicionar tarefa` | `frontend/src/pages/focus.test.tsx:116`: `heading level 1 'Today'`, `Sound settings`, `Back to the board`, `queryByRole('button',{name:'Collapse'})` ausente no navegador, `'Est.: 1hr 30min'`, `'0/2 Done'`, `'Add task'`. `focus.test.tsx:286`: no desktop, `Collapse` chama `collapseFocus`. `list-board.test.tsx:434`: `Focus now` leva à tela de foco. A spec foi emendada em `97a838f` (premissa "Ícone de recolher") | ✅ |
| FOCUS-02 | Sessão na 1ª pendente, contorno destacado, `HH:MM:SS` = estimativa − gasto | `focus.test.tsx:133`: `toMatchObject({type:'start',task_id:taskA.id,takeover:false})`. `focus.test.tsx:141`: `toHaveClass('border-2','border-primary')`, `data-running='true'`, e a próxima tarefa sem `border-primary`. `lib/focus/display.test.ts:42` (3000). `focus-task-card.test.tsx:8`. T#0 (L16) | ✅ |
| FOCUS-03 | ±1 s com o relógio 5 min adiantado ou atrasado | `lib/focus/clock.test.ts:18-30`: `< 1000` com ±5 min. `use-focus.test.tsx:136`. `display.test.ts:51` | ✅ |
| FOCUS-04 | Encerra, o tempo para e o botão vira `Retomar` | T#13 (L401): `end_reason:'pause'`. `display.test.ts:114`. `focus-controls.test.tsx:26` e `:86` | ✅ |
| FOCUS-05 | Nova sessão, mesmo valor | T#1 (L46). `focus-controls.test.tsx:35` | ✅ |
| FOCUS-06 | Encerra, vai para o fim de Hoje e começa a próxima | T#19 (L572), T#20 (L609). `backend-node/test/routes/focus.test.ts:196` | ✅ |
| FOCUS-07 | `Pular` desabilitado com 1 pendente | `focus-controls.test.tsx:53`: `toBeDisabled()`. T#21 (L646): 409. `routes/focus.test.ts:196` | ✅ |
| FOCUS-08 | Encerra, `Concluídas` com `completed_at`, começa a próxima | T#23 (L699). `routes/focus.test.ts:212` | ✅ |
| FOCUS-09 | `Tudo limpo` e nenhuma sessão aberta | T#24 (L736). `focus.test.tsx:174`: `'All clear'`, sem `timer`, `'1/1 Done'` | ✅ |
| FOCUS-10 | `ended_at` exato, `00:00:00`, `Estender` e `Concluir` | `backend-node/test/services/focus-settle.test.ts:45`. `display.test.ts:61`. `extend-prompt.test.tsx:15` | ✅ |
| FOCUS-11 | App fechado: `ended_at` no instante em que o gasto igualou a estimativa | `focus-settle.test.ts:24` (liquidado 2h depois, `endedAt == at(T0,30)`) e `:116` | ✅ |
| FOCUS-12 | Sobe a partir da estimativa (`01:00:00`, `01:00:01`), estimativa igual | T#28 (L851). `display.test.ts:77`. `focus-task-card.test.tsx:15`. `routes/focus.test.ts:239` | ✅ |
| FOCUS-13 | Sobe depois de `Pausar` e `Retomar` | T#4 (L141). `display.test.ts:87`. `focus-state.test.ts:104` | ✅ |
| FOCUS-14 | Sem estimativa: sobe e nunca há `Estender` | T#2 (L78), T#31 (L935). `display.test.ts:98` e `:108`. `focus-state.test.ts:115` | ✅ |
| FOCUS-15 | Encerra no instante da mudança e volta ao quadro | `focus-task-left.test.ts:23` e `:72`. `db/focus-schema.test.ts:60` (AD-005). `focus.test.tsx:207`: `'Board page'`. A função `taskLeft` só mudou de arquivo (`lib/focus/task-left.ts`), sem mudar de corpo | ✅ |
| FOCUS-16 | Volta ao quadro com a sessão aberta e o cartão destacado | `focus.test.tsx:221`: `'Board page'` e nenhum `send`. `list-board.test.tsx:460`: timer `00:50:00` no cartão, `border-2 border-primary`, e o concluído sem destaque | ✅ |
| FOCUS-17 | 403 `Read-only role` em toda ação | `routes/focus.test.ts:350`: as rotas de ação com `403` e `detail:'Read-only role'` | ✅ |
| FOCUS-18 | 409 sem mudar sessão nem `completed_at` | T#10, 11, 12, 16, 17, 18, 21, 22, 26, 27, 29, 30, 34 e 37: 409 `invalid_transition`, com sessões e tarefas iguais às do início (`focus-transitions.test.ts:236-239`) | ✅ |

### P1: Intervalos

| Critério | Resultado definido pela spec | Evidência | Resultado |
| -------- | ---------------------------- | --------- | --------- |
| BREAK-01 | 5/10/15 ou 1 a 120: encerra a tarefa, abre o intervalo, contagem regressiva | T#32 (L961), T#33 (L993). `break-picker.test.tsx:14` e `:37`. `display.test.ts:121` | ✅ |
| BREAK-02 | < 1 ou > 120: 422 e nada aberto | `focus-transitions.test.ts:332`. `routes/focus.test.ts:256`. `optimistic.test.ts:199`. `break-picker.test.tsx:26` | ✅ |
| BREAK-03 | Duração exata, som, tarefa pausada | T#35 (L1051). `display.test.ts:130`. `use-focus-sounds.test.tsx:177` | ✅ |
| BREAK-04 | `Encerrar intervalo`: o tempo que passou, tarefa pausada | T#36 (L1085): `break_stop`. `focus-controls.test.tsx:77` | ✅ |
| BREAK-05 | App fechado: a duração exata | `focus-settle.test.ts:35`: `endedAt == at(T0,5)`, `'break_end'` | ✅ |

### P1: Sons

| Critério | Resultado definido pela spec | Evidência | Resultado |
| -------- | ---------------------------- | --------- | --------- |
| SOUND-01 | Conclusão pelo foco, pelo widget ou pelo quadro, 1 vez | `focus.test.tsx:194`: `[['complete']]`. `list-board.test.tsx:473`, `:483` e `:496`. O widget é da feature `widget-desktop` | ✅ |
| SOUND-02 | Múltiplo de 10 min do tempo total, 1 vez | `triggers.test.ts:18`, `:25` e `:39`. `use-focus-sounds.test.tsx:72` | ✅ |
| SOUND-03 | Fim da estimativa, 1 vez | `triggers.test.ts:69` e `:76`. `use-focus-sounds.test.tsx:72` | ✅ |
| SOUND-04 | Fim do intervalo, 1 vez | `triggers.test.ts:85` e `:93`. `use-focus-sounds.test.tsx:177` | ✅ |
| SOUND-05 | 4 sons por código, timbres diferentes, sem arquivo | `synth.test.ts:77-122` (`new Set(sequences).size == 4`) | ✅ |
| SOUND-06 | Desligar só aquele som, neste dispositivo, persistente | `prefs.test.ts:13` e `:22`. `use-focus-sounds.test.tsx:91` | ✅ |
| SOUND-07 | Navegador e desktop | `lib/sounds/gate.test.ts:29` (navegador: `true`) e `:35` (janela principal do desktop sem widget: `true`). `gate.ts` agora segue WIDGET-23 (a janela visível toca) | ✅ |
| Decisão "Sons com vários dispositivos" | Só o dono da sessão toca; a conclusão só onde foi feita | `triggers.test.ts:119`, `:126`, `:133` e `:141`. `use-focus-sounds.test.tsx:149` e `:158` | ✅ |

### P1: Dispositivos, conexão e fechamento

| Critério | Resultado definido pela spec | Evidência | Resultado |
| -------- | ---------------------------- | --------- | --------- |
| SYNC-01 | No máximo 1 aberta; 2 inícios simultâneos deixam 1 | `db/focus-schema.test.ts:46`. `focus-transitions.test.ts:314` | ✅ |
| SYNC-02 | "Você já está focando em outro dispositivo." com `Assumir` e `Cancelar`, sem abrir sessão | T#5 (L175). `elsewhere-dialog.test.tsx:17` e `:47`. `focus.test.tsx:253` | ✅ |
| SYNC-03 | Mesma tarefa: mantém a sessão | T#6 (L201). `focus.test.tsx:253` | ✅ |
| SYNC-04 | Outra tarefa: encerra e abre no mesmo instante | T#7 (L232). `routes/focus.test.ts:146` | ✅ |
| SYNC-05 | Aplica na tela, guarda com o horário corrigido, envia ao reconectar, em ordem | `use-focus.test.tsx:145` e `:176` (`occurred_at == iso(server)` com o servidor 5 min à frente; M19 morreu). `queue.test.ts:34`, `:127` e `:143`. **`queue.test.ts:97`**: a ação refeita volta na ordem do clique, antes da mais nova, e o envio sai `[refused, later]` (V1 morreu). `api.test.ts:69` | ✅ |
| SYNC-06 | Mais de 24h: descarta e mostra a frase | `queue.test.ts:50` (24h01 descartada, 23h59 enviada). **`queue.test.ts:63`**: com o servidor 5 min à frente e `flush(send)` sem `nowMs`, a ação de 24h01 pelo servidor expira e a de 23h59 é enviada (V3 morreu). `offline-conflicts.test.tsx:73` e `:83` (frase em pt-BR) | ✅ (era ⚠️ na it. 3) |
| SYNC-07 | Recusada: `Tentar de novo` e `Descartar` | `queue.test.ts:80` (409 e 422 viram conflito; `retry` reenvia). `queue.test.ts:97` (ordem do `retry`; V1 morreu). `queue.test.ts:117`. `offline-conflicts.test.tsx:32`, `:41` e `:57` | ✅ (era ⚠️ na it. 3) |
| SYNC-08 | Fechar o desktop com uma tarefa contando: "Há uma tarefa contando.", `Pausar e sair`, `Cancelar` | `desktop/src/main/focus-close.test.ts:69`, `:83`, `:92` e `:107`. `app-layout.test.tsx:239` (quadro: `reportFocusState({active:true,running:true})` e a pausa), `:255` (home) e `:268` (quadro de outra lista). `routes/focus.test.ts:71` (N10 morreu). `api.test.ts:54` (N12 morreu). A ponte agora passa por `inFocus` (`focus-guard.tsx:27`), que mantém a sessão deste dispositivo em qualquer rota | ✅ |
| SYNC-09 | Fechar a aba com uma tarefa contando: alerta e pausa **com o horário do fechamento** | `use-leave-guard.test.tsx:61` (`defaultPrevented`) e `:67` (`fetch('/api/focus/pause',{keepalive:true})`, `occurred_at: iso(NOW + 7000)`). **`use-leave-guard.test.tsx:87`** (novo, `9fff35e`): `updateOffset(iso(NOW + 5 min))`, depois `pagehide` aos `NOW + 7000` locais, e `expect(JSON.parse(init.body).occurred_at).toBe(iso(NOW + 5 * 60_000 + 7000))`. O offset volta a zero no `beforeEach` (`:47`). Código: `use-leave-guard.tsx:30` usa `new Date(serverNow())`. `app-layout.test.tsx:279` e `:292`. W1 morreu | ✅ (era ⚠️ na it. 4) |
| SYNC-10 | Sinal a cada 60 s | `use-focus.test.tsx:76` (0 aos 59 999 ms, 1 aos 60 000, 2 aos 120 000) e `:90`. `app-layout.test.tsx:386` (1 aos 60 s, 2 aos 120 s; N2 morreu). `routes/focus.test.ts:284`. `api.test.ts:96`. **T#51 (L1505, novo, `4e8d329`)**: o sinal que chega com exatamente 120 s desde o último é gravado (200, `last_seen_at: 12`, `stale: null`; W2 morreu) | ✅ |
| SYNC-11 | Mais de 120 s sem sinal: mostrar o tempo e oferecer `Manter` e `Cortar no último sinal` | `focus-state.test.ts:151` (121 s sim; 119 e 120 s não). T#41 a T#45. T#46 (L1365, `recover` com 120 s: 409; U1 morreu). T#47 a T#49. T#50 (L1472, `start` com 120 s aceito; S2 morreu). **T#51 (L1505)**: `heartbeat` com 120 s exatos responde 200 e grava o sinal. O executor do servidor confere status, sessões com `last_seen_at`, tarefas e estado (`focus-transitions.test.ts:234-244`); o do cliente confere o mesmo caso em `optimistic.test.ts:147` (contagem `toHaveLength(52)` em `:143`). W2 morreu. `optimistic.test.ts:210` (S5 morreu) e **`:235`** (novo: `heartbeat` com `stale.seconds: 120` mantém a sessão e zera `stale`; a mutação nova X1 em `optimistic.ts:217` morreu). `focus.test.tsx:231`. `stale-session-dialog.test.tsx:16` e `:44` (N7 morreu). `app-layout.test.tsx:424`. `routes/focus.test.ts:284` e `:315` (`cut` no último sinal; a mutação nova X2 morreu) | ✅ (era ⚠️ na it. 4) |
| SYNC-12 | Reabrir com a tarefa pausada abre a home | `frontend/src/App.test.tsx:61`: fica em `/`, sem `heading 'Today'`, `focus.get` só com `undefined` e nenhum `send`. `desktop/src/main/window.ts:24` carrega `${APP_ORIGIN}/` | ✅ |

**Status**: 42 de 42 ✅, 0 ⚠️, 0 ❌.

---

## Casos de borda

- [x] **Tarefa concluída no quadro enquanto está em foco**: `list-board.test.tsx:483` e `:496` (vai por `complete` do foco, sem `tasks.move`). `focus-task-left.test.ts:32`. T#23.
- [x] **Gasto igual à estimativa ao abrir**: T#3 (L110). `focus.test.tsx:162`: `'00:00:00'`, `Extend` e nenhum `send`.
- [x] **Navegador bloqueia o 1º som**: `synth.test.ts:139`.
- [x] **Sessão que atravessa a meia-noite**: `focus-state.test.ts:171`: de 23:30 a 00:30 em São Paulo, `rows toHaveLength(1)` e `spent_seconds: 3600`.

---

## Sensor de discriminação

Rodado no worktree descartável `/private/tmp/claude-501/-Volumes-MacOnlySSD-dev-personal-trackzyn/60528454-ca38-4cbf-b7a4-1697855de074/scratchpad/verify-fs5`, criado com `git worktree add --detach … HEAD` e com os `node_modules` dos 3 pacotes em symlink. Um script aplicou cada mutação por substituição exata, conferida com 1 ocorrência na linha indicada. Depois rodou a suíte inteira do pacote (`npx vitest run`) e o arquivo voltou com `git checkout`. Depois de cada restauração, o `git status --porcelain` do worktree só mostrava os symlinks.

Ordem do trabalho:

1. O `git status --porcelain` do checkout real foi gravado antes de tudo. Só mostrava ` M .specs/features/foco-e-sons/validation.md` (o relatório da iteração 4, não commitado).
2. A linha de base passou no worktree: backend 341 (9 pulados) e frontend 962.
3. Os 14 mutantes rodaram um por vez, em sequência.
4. O worktree foi removido com `git worktree remove --force`. `git worktree list` mostra só o checkout real e o worktree `docker-compose-access-issue`, que não foi tocado.
5. O `git status --porcelain` do checkout real saiu idêntico ao gravado (conferido com `diff`). Os `node_modules` reais continuam no lugar.

Regra de parada: reexecutar todo mutante que já sobreviveu nesta feature, mais no máximo 2 mutações novas.

| # | Origem | Arquivo:linha | Mutação | Morta? (teste que falhou) |
| - | ------ | ------------- | ------- | ------------------------- |
| M19 | vivo na it. 1 | `frontend/src/lib/focus/use-focus.tsx:107` | `const now = serverNow()` → `Date.now()` | ✅ (1: `use-focus.test.tsx:176`) |
| N10 | vivo na it. 2 | `backend-node/src/services/focus-state.ts:100` | `readFocusState` só devolve a sessão se for da lista pedida | ✅ (1: `routes/focus.test.ts:71`) |
| N12 | vivo na it. 2 | `frontend/src/lib/api.ts:380` | `focus.get()` sem lista manda `list_id=''` | ✅ (1: `api.test.ts`, "without a list, asks GET /api/focus with no list_id at all") |
| N7 | vivo na it. 2 | `frontend/src/components/focus/stale-session-dialog.tsx:31` | `onOpenChange` que fecha o diálogo sem escolha | ✅ (1: `stale-session-dialog.test.tsx:44`) |
| N2 | vivo na it. 2 | `frontend/src/components/focus/focus-guard.tsx:17` | o guarda deixa de reconhecer `/focus/:listId` | ✅ (1: `app-layout.test.tsx:386`) |
| U1 | vivo na it. 2 | `backend-node/src/services/focus.ts:376` | `recover`: `<=` → `<` (aceita exatamente 120 s) | ✅ (1: T#46) |
| V1 | vivo na it. 3 | `frontend/src/lib/focus/queue.ts:61` | `retry` ordena a fila em ordem decrescente do clique | ✅ (1: `queue.test.ts:97`) |
| V3 | vivo na it. 3 | `queue.ts:93` | padrão `nowMs = serverNow()` → `Date.now()` | ✅ (1: `queue.test.ts:63`) |
| S2 | vivo na it. 3 | `backend-node/src/services/focus.ts:202` | `start`: `> STALE_AFTER_MS` → `>=` | ✅ (1: T#50) |
| S5 | vivo na it. 3 | `frontend/src/lib/focus/optimistic.ts:158` | `start` no cliente: `>` → `>=` | ✅ (1: `optimistic.test.ts:210`) |
| W1 | vivo na it. 4 | `frontend/src/lib/focus/use-leave-guard.tsx:30` | pausa do fechamento com `new Date(Date.now())` em vez de `serverNow()` | ✅ (1: `use-leave-guard.test.tsx:87`) |
| W2 | vivo na it. 4 | `backend-node/src/services/focus.ts:357` | heartbeat: `> STALE_AFTER_MS` → `>=` | ✅ (1: T#51) |
| X1 | nova | `frontend/src/lib/focus/optimistic.ts:217` | heartbeat no cliente: `>` → `>=` | ✅ (1: `optimistic.test.ts:235`) |
| X2 | nova | `backend-node/src/services/focus.ts:380` | `recover` com `cut` encerra em `now` em vez de `open.lastSeenAt` ("Cortar no último sinal") | ✅ (2: `routes/focus.test.ts:315` e o caso de `focus-transitions.json` "recover cut with the last signal at 10:00 ends the session at 10:00") |

Todos morreram por asserção (a suíte compilou e só o teste do comportamento caiu), não por erro de sintaxe.

**Profundidade do sensor**: P0, caminho crítico (registro de tempo), limitada pela regra de parada: 12 reexecuções e 2 novas.
**Resultado**: 14 de 14 mortas, 0 vivas, 0 equivalentes. PASS ✅

---

## Qualidade do código

| Princípio | Status |
| --------- | ------ |
| Código mínimo, sem escopo a mais | ✅ (as correções só acrescentam testes) |
| Mudanças cirúrgicas | ✅ (2 commits: 2 arquivos de teste e 1 caso no JSON) |
| Segue os padrões | ✅ (W1 no estilo de `queue.test.ts:63`; W2 no JSON compartilhado, como T#46 e T#50, e o teste direto como o de `optimistic.test.ts:210`) |
| Ancoragem na spec | ✅ nos 42 |
| Cobertura por camada | ✅ |
| Todo teste mapeia para AC, caso de borda ou AD | ✅ (os testes novos citam SYNC-09, SYNC-10 e SYNC-11) |
| Diretrizes documentadas | nenhuma específica: padrões fortes aplicados |

---

## Lacunas em ordem de prioridade

Nenhuma.

**Observação, sem bloquear**: os limites de 120 s no cliente (`optimistic.ts:158` e `:217`) só são alcançados quando o servidor já informa `stale`, o que o `GET` real só faz acima de 120 s. Os testes diretos (`optimistic.test.ts:210` e `:235`) fixam o contrato da função pura, e isso basta.

---

## Atualização do rastreio

| Requisito | Status anterior | Novo status |
| --------- | --------------- | ----------- |
| SYNC-09 | ⚠️ (W1) | ✅ Verificado |
| SYNC-11 | ⚠️ (W2) | ✅ Verificado |
| Os outros 40 | ✅ | ✅ Verificado |

Como o veredito é PASS, as 42 linhas da Requirement Traceability de `spec.md` passaram de `| Tasks | Implementing |` para `| Tasks | Verified |`.

---

## Débito resolvido

A issue gabrielauzier/trackzyn#2 (label `tech-debt`, aberta na iteração 3 com os mutantes V1, V3, S2 e S5) foi paga em `3277943` (V1, ordem do `Tentar de novo`), `20d0072` (V3, relógio do servidor no limite de 24h) e `d35779f` (S2 e S5, `start` com exatamente 120 s). Os 4 mutantes morreram na iteração 4 e de novo nesta. A issue pode ser fechada pelo usuário (este verificador só a leu).

---

## Histórico

- **Iteração 1** (HEAD `17dee05`): FAIL. SYNC-08 e SYNC-09 só eram protegidos na tela de foco. No SYNC-11, o heartbeat resolvia sozinho a sessão parada, e o diálogo só existia na tela de foco. SYNC-05 tinha o mutante M19 vivo. FOCUS-02 e FOCUS-16 não conferiam o destaque. O teste de SYNC-12 era tautológico. Não havia teste da meia-noite. Sensor: 23 de 24 mortas.
- **Iteração 2** (HEAD `1d6618e`): FAIL. O `FocusGuard` foi montado no `AppLayout`, o `GET /api/focus` passou a aceitar `list_id` opcional e o heartbeat passou a ser recusado numa sessão parada. Ficaram vivos N2, N7, N10, N12 e U1 (15 de 20 mortas, N9 equivalente), com 38 de 42 ✅.
- **Iteração 3** (HEAD `a0cf1e9`): FAIL. Os 5 vivos da iteração 2 morreram, e a regra "só `recover` resolve a sessão parada" entrou no servidor, no cliente otimista e na tela de foco. Sobreviveram V1, V3, S2 e S5 (17 de 21 mortas), com 39 de 42 ✅. O usuário aceitou o risco, que virou a issue gabrielauzier/trackzyn#2.
- **Iteração 4** (HEAD `c6a4bf5`): FAIL. O débito da #2 foi pago em `3277943`, `20d0072` e `d35779f`, e os 10 mutantes que já tinham sobrevivido morreram. As 2 mutações novas, W1 (relógio da pausa ao fechar a aba) e W2 (limite de 120 s no heartbeat), sobreviveram (10 de 12), com 40 de 42 ✅.
- **Iteração 5** (este relatório, HEAD `4e8d329`): PASS. W1 e W2 foram fechados em `9fff35e` e `4e8d329`, só com testes. Os 12 mutantes que já sobreviveram e as 2 mutações novas (X1, X2) morreram: 14 de 14, com 42 de 42 ✅.

---

## Resumo

**Geral**: ✅ Pronto
**Verificação ancorada na spec**: 42 de 42 ✅, 0 ⚠️, 0 ❌. Os 4 casos de borda ✅
**Sensor**: 14 de 14 mortas, 0 vivas, 0 equivalentes
**Gate**: backend 341 passando e 9 pulados (Redis), frontend 962, desktop 248 e 3 pulados, build exit 0. Todos os comandos com exit 0, rodados em sequência
**Próximo passo**: o usuário pode fechar a issue #2 e commitar este relatório e o `spec.md`
