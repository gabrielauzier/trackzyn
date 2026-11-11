# Contagem de horas: validação (iteração 1)

**Data**: 2026-11-10
**Spec**: `.specs/features/contagem-de-horas/spec.md`
**Intervalo do diff**: `7c60968..cff13d6` (8 commits, T1 a T8, 53 arquivos, +3476/−166)
**Verificador**: sub-agente independente (autor ≠ verificador)

## Veredito: PASS ✅ (com ressalvas)

Os gates estão verdes: lint, typecheck e testes do backend e do frontend. Os 39 critérios têm prova `arquivo:linha`. 37 batem com o valor da spec. Dois têm ressalva (HOURS-02 e HOURS-25), mas nenhum reprova. O sensor rodou **14 mutações** e todas morreram.

Ressalvas, que não reprovam mas precisam de decisão:
1. **HOURS-25, metade `Estender`**: nenhum teste roda `extendFocus` em `net`. O código chama a mesma `spentMilliseconds` (`backend-node/src/services/focus.ts:289`), que já tem teste nos dois modos. Mas um retrocesso que troque essa chamada por uma soma bruta passaria sem falhar.
2. **HOURS-02 cita `GET /api/workspaces/:id`, que não existe.** A leitura de um workspace é `GET /api/workspaces/current` (`backend-node/src/routes/workspaces.ts:94`), e ela está testada. É uma imprecisão da spec, não um defeito do código.
3. **HOURS-24**: só o card do quadro tem teste em `net`. O foco, o widget, o MCP `get_board` e o feito × estimado leem a mesma `spentSeconds` ou `buildBoard`, e por isso o resultado é o mesmo.

---

## Conclusão das tasks

| Task | Status | Notas |
| ---- | ------ | ----- |
| T1 Coluna e API do modo | ✅ Done | - |
| T2 Opção na tela do workspace | ✅ Done | - |
| T3 Tempo gasto líquido | ✅ Done | `Estender` em `net` sem teste próprio (ressalva 1) |
| T4 Overview em horas líquidas | ✅ Done | Desvio registrado: `gross_task_seconds` fica no nível de cima, fora de `tiles` (a spec já diz isso) |
| T5 Helper `measure` | ✅ Done | - |
| T6 Agenda em horas líquidas | ✅ Done | - |
| T7 Barra do plano | ✅ Done | O exemplo da spec agora diz `3h planejadas de 9h livres · 0min em pausas`, e o teste confere esse texto |
| T8 Aviso e bruto nos Relatórios | ✅ Done | - |

---

## Gate

| Comando | Exit | Resultado |
| ------- | ---- | --------- |
| `npm --prefix backend-node run lint` | 0 | - |
| `npm --prefix backend-node run typecheck` | 0 | - |
| `npm --prefix backend-node test` | 0 | 81 arquivos (1 pulado); **1066 passaram, 9 pulados** |
| `npm --prefix frontend run lint` | 0 | - |
| `npm --prefix frontend run typecheck` | 0 | - |
| `npm --prefix frontend test` (1ª) | 1 | `ENOSPC: no space left on device` no disco do sistema (316 MB livres). Falharam `agenda.test.tsx` e `task-dialog.test.tsx` ao carregar e `showcase.test.tsx` por timeout. É falha do ambiente, não do código |
| `npm --prefix frontend test` (2ª, `TMPDIR` no disco externo) | 0 | 178 arquivos; **1990 de 1990** |

**Contagem de testes**: o diff soma 29 `it(` no backend e 43 no frontend, e não remove nenhum. Antes eram cerca de 1037 no backend e 1947 no frontend.

**Integridade**: nenhuma asserção ficou mais fraca. `baseline.test.ts` e `pglite.test.ts` só ganharam a coluna nova. Os testes atuais de Relatórios comparam `tiles` inteiro e continuam iguais no modo `gross`.

**Pulados**: os 9 do backend já eram pulados antes. Nenhum arquivo do diff é pulado.

---

## Critérios de aceite (spec-anchored)

Linhas no estado de `cff13d6`. `B` = `backend-node/test`, `F` = `frontend/src`.

### P1: Escolher o modo

| AC | Valor da spec | `arquivo:linha` + asserção | Resultado |
| -- | ------------- | -------------------------- | --------- |
| HOURS-01 | `gross` em workspace antigo e novo; só `gross`/`net` | `B/db/workspace-hours-count-mode-schema.test.ts:44` `expect(await modeOf()).toBe('gross')` depois de migrar um workspace antigo; `:50-56` novo lê `gross`, aceita `net`, recusa `total` (`ck_workspaces_hours_count_mode`) e `NULL` | ✅ |
| HOURS-02 | `hours_count_mode` na leitura e no PATCH | `B/routes/workspaces.test.ts:207,209` `toHaveProperty('hours_count_mode', 'gross')` em `/current` e na lista, para dono, editor e leitor; `:219` resposta do PATCH | ⚠️ A spec cita `GET /api/workspaces/:id`, que não existe; o equivalente `/current` está coberto |
| HOURS-03 | grava `gross`/`net`; sem o campo mantém | `B/routes/workspaces.test.ts:219` `.toBe('net')`; `:223` PATCH só com `name` → `hours_count_mode: 'net'`; `:226-227` volta a `gross` | ✅ |
| HOURS-04 | 422 para qualquer outro valor, inclusive `null`; mantém | `B/routes/workspaces.test.ts:236-239` `null`, `'liquid'`, `'NET'`, `1` → `toBe(422)`; `modeOf` continua `'net'` | ✅ |
| HOURS-05 | 403 para quem não é dono nem gestor; mantém | `B/routes/workspaces.test.ts:246-250` editor e leitor → `toBe(403)`, modo continua `'gross'`; `:255` gestor grava `net` | ✅ |
| HOURS-06 | card `Contagem de horas` abaixo de `Juntar sessões próximas`, textos exatos, opção guardada marcada | `F/pages/workspace-settings.test.tsx:284` posição `DOCUMENT_POSITION_FOLLOWING`; `:289-294` exemplos, explicações e `aria-checked`; `:329-336` textos em pt-BR iguais aos da spec | ✅ |
| HOURS-07 | grava e as telas usam o modo na próxima leitura | `F/pages/workspace-settings.test.tsx:302-303` `update('ws', { hours_count_mode: 'net' })` e `invalidateQueries` chamado; `F/lib/api.test.ts:233` PATCH só com o modo | ✅ |
| HOURS-08 | opções desabilitadas para quem não gerencia | `F/pages/workspace-settings.test.tsx:316-320` `toBeDisabled()` nas duas, clique não chama `update` | ✅ |

### P1: Agenda

| AC | Valor da spec | `arquivo:linha` + asserção | Resultado |
| -- | ------------- | -------------------------- | --------- |
| HOURS-09 | união das sessões de tarefa do dia, inclusive as escondidas | `F/components/agenda/week-grid.test.tsx:841` `toHaveTextContent('3hr')`; `:866` escondida entra → `'3hr 2min'`; `F/lib/agenda/layout.test.ts:106` `dayTotal(..., 'net')` = `3 * 3600`; `F/pages/agenda.test.tsx:2002` página em `net` → `'1hr 30min'` | ✅ |
| HOURS-10 | soma em `gross` | `F/components/agenda/week-grid.test.tsx:855` `'4hr'`; `F/lib/agenda/layout.test.ts:102` = `4 * 3600`; `F/pages/agenda.test.tsx:2007` `'2hr'` | ✅ |
| HOURS-11 | tooltip `Horas líquidas · bruto: <bruto>` no hover e no foco | `F/components/agenda/week-grid.test.tsx:843` `.toBe('Net hours · gross: 4hr')`; `:850` com foco do teclado; texto pt-BR em `F/locales/pt-BR.json` (`agenda.netTotal`) igual à spec | ✅ |
| HOURS-12 | intervalos fora do total nos dois modos | `F/components/agenda/week-grid.test.tsx:873` `'2hr'` com pausa sobreposta; `F/lib/agenda/layout.test.ts:110` | ✅ |
| HOURS-13 | bloco unido dura a união em `net` | `F/lib/agenda/join.test.ts:151` `seconds: 90 * 60`; `:157` `gross` = `120 * 60` | ✅ |
| HOURS-14 | fim do aviso por modo | `F/components/agenda/session-panel.test.tsx:178,183` e `F/components/agenda/session-move-confirm.test.tsx:98,101` `toHaveTextContent('... counts once in the total.' / '... counts in both.')`; chaves pt-BR iguais à spec | ✅ |

### P1: Relatórios

| AC | Valor da spec | `arquivo:linha` + asserção | Resultado |
| -- | ------------- | -------------------------- | --------- |
| HOURS-15 | card, dia, dias trabalhados, média e mais produtivos pela união | `B/services/reports-hours-count.test.ts:52` `tiles` = `{ work_days: 1, tasks_done: 1, task_seconds: 3 * H, avg_seconds_per_task: 3 * H }`; `:54` dia `3 * H`; `:67` `hours: [9, 10, 11]` | ✅ |
| HOURS-16 | pausa = união das pausas menos tarefa | `B/services/reports-hours-count.test.ts:88-89` `break_seconds` `30 * M` em `net`, `:93` `H` em `gross`; `:102` duas pausas sobrepostas → `H` | ✅ |
| HOURS-17 | cada lista inteira nos dois modos | `B/services/reports-hours-count.test.ts:55-61` A `2 * H` e B `2 * H` em `net`; `:80` em `gross` | ✅ |
| HOURS-18 | aviso acima dos cards em `net` | `F/pages/reports.test.tsx:195,198` `findByText(notice)` com o texto exato da spec, antes de `Dias trabalhados` | ✅ |
| HOURS-19 | `Bruto: <bruto>` no card | `F/pages/reports.test.tsx:197` `/^Tempo trabalhado3hBruto: 4h$/`; `F/components/reports/overview-tiles.test.tsx:58`; o valor vem de `gross_task_seconds` (`B/services/reports-hours-count.test.ts:53` = `4 * H`) | ✅ |
| HOURS-20 | `gross` como hoje, sem aviso nem `Bruto` | `B/services/reports-hours-count.test.ts:76-80` 4h e hora 10; `F/pages/reports.test.tsx:212-213` `/^Tempo trabalhado3h 30min$/` e aviso ausente | ✅ |
| HOURS-21 | `hours_count_mode` e `gross_task_seconds` na rota, nos dois modos | `B/routes/reports.test.ts:132-139` `gross` → `gross_task_seconds` = `task_seconds`; depois do PATCH `net`, diferença `toBe(3600)` | ✅ |
| HOURS-22 | arredonda para baixo uma vez | `B/services/reports-hours-count.test.ts:153-156` união 20,7 s → `20`; bruto 26,3 s → `26` | ✅ |

### P1: Tempo gasto da tarefa

| AC | Valor da spec | `arquivo:linha` + asserção | Resultado |
| -- | ------------- | -------------------------- | --------- |
| HOURS-23 | união de todas as sessões de todos os membros; aberta até agora, nunca além de `deadline_at` | `B/services/spent-hours-count.test.ts:42` `1.5 * HOUR`; `:90` dois membros → `1.5 * HOUR`; `:103-104` outra tarefa não muda; `:121-122` cada tarefa segue o seu workspace; `:131` pausa fora | ✅ |
| HOURS-24 | mesmo tempo no quadro, foco, widget, MCP e feito × estimado | `B/services/spent-hours-count.test.ts:141` `spent_seconds` do quadro = `1.5 * HOUR`. Os outros lugares leem a mesma função: `focus-state.ts:128`, `reports.ts:245`, `mcp/tools.ts:87` (`buildBoard`) | ✅ (ressalva 3) |
| HOURS-25 | fim da estimativa ao começar e `Estender` a partir do líquido | `B/services/spent-hours-count.test.ts:162` `deadlineAt` = `at(T0, 210)` em `net`. `Estender` em `net`: nenhuma asserção; só o código `focus.ts:289` | ⚠️ Metade sem teste (ressalva 1) |
| HOURS-26 | soma em `gross` | `B/services/spent-hours-count.test.ts:40` `2 * HOUR`; `:179` `deadlineAt` = `at(T0, 180)` | ✅ |

### P1: Capacidade do plano

| AC | Valor da spec | `arquivo:linha` + asserção | Resultado |
| -- | ------------- | -------------------------- | --------- |
| HOURS-27 | planejadas = união dos blocos | `F/lib/plan/capacity.test.ts:62` `{ planned: 180, breaks: 0, scheduled: 0, free: 540, over: 0 }`; `F/pages/plan.test.tsx:480` texto `'3h planejadas de 9h livres · 0min em pausas'` | ✅ |
| HOURS-28 | agendadas uma vez e fora dos blocos | `F/lib/plan/capacity.test.ts:73` `scheduled: 30`; `:79` duas sobrepostas → `scheduled: 90` | ✅ |
| HOURS-29 | pausas uma vez, fora de blocos e agendadas | `F/lib/plan/capacity.test.ts:62` `breaks: 0` com almoço sob bloco; `:84` sob agendada → `breaks: 0`; `:88` duas pausas → `60` | ✅ |
| HOURS-30 | livres = expediente − pausas − agendadas; excesso = planejadas − livres | `F/lib/plan/capacity.test.ts:94-95` `free: 540, over: 0` e `planned: 600, over: 60` | ✅ |
| HOURS-31 | `gross` como hoje | `F/lib/plan/capacity.test.ts:66-68` `{ planned: 240, breaks: 60, scheduled: 0, free: 480, over: 0 }`; `F/pages/plan.test.tsx:485` `'4h planejadas de 8h livres · 1h em pausas'` | ✅ |

### Edge cases

| AC | Valor da spec | `arquivo:linha` + asserção | Resultado |
| -- | ------------- | -------------------------- | --------- |
| HOURS-32 | só se encostam → líquido = bruto | `B/services/spent-hours-count.test.ts:51` `1.5 * HOUR`; `F/lib/time/intervals.test.ts:47` `90` | ✅ |
| HOURS-33 | uma dentro da outra → a maior | `B/services/spent-hours-count.test.ts:60` `2 * HOUR`; `F/lib/time/intervals.test.ts:56` `120` | ✅ |
| HOURS-34 | cadeia de três → início de A ao último fim | `B/services/spent-hours-count.test.ts:70` `2.5 * HOUR`; `F/lib/time/intervals.test.ts:66` `150` | ✅ |
| HOURS-35 | aberta até agora, nunca além de `deadline_at`, união uma vez | `B/services/spent-hours-count.test.ts:79` `45 * 60` às 09:45; `:80` `90 * 60` depois do prazo | ✅ |
| HOURS-36 | cada dia só a sua parte; soma = total | `B/services/reports-hours-count.test.ts:112-116` dia 20 `H`, dia 21 `H`, total `2 * H`, `work_days` 2 | ✅ |
| HOURS-37 | filtro de lista → só aquela lista | `B/services/reports-hours-count.test.ts:123-124` `2 * H` e bruto `2 * H` | ✅ |
| HOURS-38 | sem sobreposição: líquido = bruto, aviso e `Bruto` continuam | `B/services/reports-hours-count.test.ts:142-144`; `F/pages/reports.test.tsx:205-206` aviso e `Bruto: 3h 30min` | ✅ |
| HOURS-39 | sessões de outro membro não entram | `B/services/reports-hours-count.test.ts:133-134` `2 * H` | ✅ |

**Status**: 37 ✅, 2 ⚠️ (HOURS-02 imprecisão da spec; HOURS-25 metade sem teste). Nenhum ❌.

---

## Sensor de discriminação

Worktree temporária a partir de `cff13d6`, com `node_modules` ligados por symlink. Só os testes do código mutado. `TMPDIR` no disco externo por causa do disco do sistema cheio.

| # | Arquivo | Mutação | Testes | Morreu? |
| - | ------- | ------- | ------ | ------- |
| M1 | `backend-node/src/services/focus-settle.ts` | ramo `net` devolve `agg.gross` | `spent-hours-count` | ✅ 9 falhas |
| M2 | `backend-node/src/services/reports.ts` | pausa `break_mr.m` sem tirar `task_mr.m` | `reports-hours-count` | ✅ 1 falha |
| M3 | `backend-node/src/services/reports.ts` | `lists_time` lê um valor líquido (× 0,75 em `net`) | `reports-hours-count` | ✅ 1 falha |
| M4 | `backend-node/src/services/reports.ts` | `gross_exact` lê as fatias líquidas | `reports-hours-count`, `routes/reports` | ✅ 4 falhas |
| M5 | `backend-node/src/routes/workspaces.ts` | `hours_count_mode` aceita `null` | `routes/workspaces` | ✅ 1 falha |
| M6 | `frontend/src/lib/time/intervals.ts` | `start <= last[1]` → `start < last[1]` | `intervals`, `layout`, `capacity`, `join` | ✅ 1 falha (`merge` com trechos que se encostam; em `measure` o resultado é equivalente) |
| M7 | `frontend/src/lib/time/intervals.ts` | tira a subtração de `exclude` | `intervals`, `capacity`, `plan` | ✅ 7 falhas |
| M8 | `frontend/src/lib/plan/capacity.ts` | pausas excluem só as tarefas | `capacity`, `plan` | ✅ 1 falha |
| M9 | `frontend/src/lib/agenda/layout.ts` | `dayTotal` ignora o modo | `layout`, `week-grid`, `agenda` | ✅ 5 falhas |
| M10 | `frontend/src/pages/reports.tsx` | aviso aparece em qualquer modo | `reports` | ✅ 1 falha |
| M11 | `frontend/src/components/agenda/week-grid.tsx` | bruto do tooltip calculado no modo `net` | `week-grid` | ✅ 2 falhas |
| M12 | `frontend/src/lib/agenda/join.ts` | bloco unido ignora o modo | `join` | ✅ 1 falha |
| M13 | `frontend/src/components/agenda/session-panel.tsx` | aviso `net` em qualquer modo | `session-panel` | ✅ 2 falhas |
| M14 | `frontend/src/pages/workspace-settings.tsx` | opções habilitadas para quem não gerencia | `workspace-settings` | ✅ 1 falha |

**Profundidade**: expandida (≥ 5, a feature mexe em todo total de tempo do app).
**Resultado**: 14/14 mortas. PASS ✅.
**Isolamento**: `git status --porcelain` do worktree real vazio antes e depois. A worktree temporária foi removida.

Não mutado: a chamada de `spentMilliseconds` em `focus.ts:289` (`Estender`). Nenhum teste em `net` passa por ela (ressalva 1).

---

## Qualidade do código

| Princípio | Status |
| --------- | ------ |
| Código mínimo | ✅ |
| Mudanças cirúrgicas | ✅ |
| Sem escopo extra | ✅ |
| Segue os padrões | ✅ (card no padrão dos cards de formato; coluna e PATCH no padrão de #22 e #23) |
| Valor asserido bate com a spec | ✅ (2 ressalvas acima) |
| Cobertura por camada | ✅ domínio 1:1; rotas com caminho feliz, 422 e 403 |
| Todo teste mapeia para um AC | ✅ |
| Diretrizes do projeto | AD-010 seguida: `range_agg(tstzrange)` no backend e `measure` no frontend |

---

## Plano de correção (opcional, não reprova)

### Fix 1: teste de `Estender` em horas líquidas
- **Causa**: HOURS-25 só tem teste da sessão que começa.
- **Task**: em `backend-node/test/services/spent-hours-count.test.ts`, uma tarefa de 1h30 de estimativa com duas sessões sobrepostas que somam 2h brutas e 1h30 líquida. Em `net`, `extendFocus` é aceito. Com a estimativa de 1h45 em `net`, ainda não aguarda `Estender`.
- **Prioridade**: Minor.

### Fix 2: texto de HOURS-02
- **Causa**: a spec cita `GET /api/workspaces/:id`, que não existe.
- **Task**: trocar por `GET /api/workspaces/current` na spec.
- **Prioridade**: Cosmetic.

---

## Rastreabilidade

| Requisito | Antes | Agora |
| --------- | ----- | ----- |
| HOURS-01, HOURS-03 a HOURS-24, HOURS-26 a HOURS-39 | Implementing | ✅ Verified |
| HOURS-02 | Implementing | ✅ Verified (texto da rota a corrigir) |
| HOURS-25 | Implementing | ✅ Verified (com ressalva de `Estender`) |

---

## Resumo

**Geral**: ✅ Pronto, com ressalvas.
**Spec-anchored**: 37/39 com o valor da spec; 2 ressalvas.
**Sensor**: 14/14 mortas.
**Gate**: backend 1066 passaram e 9 pulados; frontend 1990 de 1990.


---

## Ressalvas resolvidas depois da iteração 1

Fechadas pelo autor em 2026-11-10, sem mudar código de produção:

1. **HOURS-25, `Estender` em `net`**: teste novo em `backend-node/test/services/spent-hours-count.test.ts` ("HOURS-25 Estender follows the net time spent"). Uma tarefa com estimativa de 1h 40min, sessões 0–60 e 30–90 (a última termina em `estimate`). Em `net` o tempo gasto é 1h 30min e `extendFocus` é recusado, sem sessão aberta: `await expect(extend(120)).rejects.toThrow()`. Em `gross` o tempo gasto é 2h e `extendFocus` abre uma sessão sem prazo: `expect(await openSessions()).toEqual([expect.objectContaining({ startedAt: at(T0, 121), deadlineAt: null })])`. Trocar a chamada de `focus.ts:289` por uma soma bruta faz a parte `net` aceitar e o teste falhar. Resultado: 13 de 13 testes do arquivo passam; lint e typecheck do backend sem erro.
2. **HOURS-02**: a spec agora cita `GET /api/workspaces/current`, a rota que existe e que já tem teste (`backend-node/test/routes/workspaces.test.ts:207,209`).

A ressalva 3 (HOURS-24 só com o card do quadro testado em `net`) continua aceita: o foco, o widget, o MCP e o feito × estimado leem a mesma função.
