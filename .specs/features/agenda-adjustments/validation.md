# Ajustes da Agenda: validação

**Data**: 2026-11-05
**Spec**: `.specs/features/agenda-adjustments/spec.md` (ADJ-01 a ADJ-25 e 4 edge cases)
**Intervalo do diff**: `22f5a81..HEAD` (HEAD = `cd5cde3`; 11 commits, `9b28654`..`cd5cde3`; em `frontend/`, 19 arquivos, +1173/−186)
**Verificador**: sub-agente independente (autor ≠ verificador), rodada 3 (a última permitida)

## Validation: agenda-adjustments - PASS ✅

Os gates estão verdes (lint, typecheck, 1404/1404 testes, build). As duas lacunas da rodada 2 foram fechadas pelo commit só de testes `cd5cde3` (T11): N2 e N6 agora morrem, cada um pelo seu teste novo. O sensor desta rodada rodou **16 mutações** num worktree isolado: **16 mortas, 0 sobreviventes** (N2, N6, cinco mortos antigos de amostra e 9 mutações novas). M4 (`swallowNextClick`) não foi reaplicado e segue como nota de UAT no navegador, como combinado; sozinho não reprova a feature.

ACs com prova `arquivo:linha` no valor da spec e sem mutante vivo: **25/25**. Edge cases: **4/4**.

---

## Rodada 1 (histórico)

FAIL: 22/25 ACs, 3/4 edge cases, sensor 27/33. Sobreviveram M27 (ADJ-07), M14 (ADJ-25), M22 (HIDE-17 com pendente), M24 (ADJ-14), M9 (ADJ-06 pelo teclado) e M4 (UAT). Corrigido por `1c696ac` (T9) e `8e61d12` (T10), só testes.

## Rodada 2 (histórico)

FAIL: 23/25 ACs, 4/4 edge cases, sensor 12/15, gate 1402/1402. Sobreviveram N2 (`agenda.tsx` `commit()` sem `selectedId === final.sessionId`: arrastar outro bloco com um `Editar` aberto ia para esse formulário; ADJ-01/ADJ-08) e N6 (`pending` sem `!drag.dragging`: a confirmação abria no meio do gesto; ADJ-01), além de M4 (UAT). Corrigido por `cd5cde3` (T11), só testes.

---

## Conclusão das tasks

| Task | Status | Notas |
| ---- | ------ | ----- |
| T1 a T8 | ✅ Done | Código de produção sem mudança desde a rodada 1 |
| T9, T10 | ✅ Done | M27, M14, M22, M24, M9 mortos de novo nesta rodada |
| T11 Arraste de outro bloco com `Editar` aberto e painel durante o gesto | ✅ Done | Mata N2 e N6 (conferido) |

---

## Critérios de aceitação ancorados na spec

Caminhos relativos a `frontend/src/`. `P` = `pages/agenda.test.tsx`.

| AC | Resultado definido na spec | `arquivo:linha` + asserção | Resultado |
| -- | -------------------------- | -------------------------- | --------- |
| ADJ-01 | **Ao soltar** um bloco salvo num horário novo: nada ao servidor, bloco no horário novo, painel com `Novo horário — ainda não salvo`, antigo riscado, novo com a duração, `Cancelar`, `Salvar horário` | `P:824` - `querySelector('del')).toHaveTextContent('Tue, Nov 3 · 14:00 – 15:00')`; `P:825` - `getByText('Tue, Nov 3 · 16:00 – 17:00 · 1hr')`; `P:826-827` botões `Cancel`/`Save time`; `P:828-829` bloco às 16:00, nenhum às 14:00; `P:830` - `sessions.update).not.toHaveBeenCalled()`; borda `P:783`; **só ao soltar** `P:971` - `queryByText('New time — not saved yet')).toBeNull()` antes do `pointerUp`, `P:973` depois; **outro bloco com `Editar` aberto** `P:984-987` (confirmação, nenhum `Edit session`, heading `Write the report`, sem `update`); título `components/agenda/session-move-confirm.test.tsx:37`; hook `lib/agenda/use-grid-drag.test.tsx:203` | ✅ PASS (N2, N6 mortos) |
| ADJ-02 | O bloco só no horário novo antes, durante e depois da gravação | `P:863` - `seenAtOld).not.toContain(true)` (MutationObserver até depois do refetch); durante `P:855`; depois `P:862` | ✅ PASS |
| ADJ-03 | `Salvar horário` manda os horários uma vez e mostra os detalhes no horário novo | `P:785-786` - `toHaveBeenCalledTimes(1)` + `toHaveBeenCalledWith('s2', { ended_at: '2026-11-03T18:30:00.000Z' })`; `P:787` bloco `14:00 – 15:30`; `P:789` `Edit`; `P:790` painel fechado; entre dias `P:806`; `session-move-confirm.test.tsx:53` | ✅ PASS |
| ADJ-04 | Recusa: o painel mostra a recusa e mantém o pendente e os dois botões | `P:871` - `findByRole('alert')).toHaveTextContent('Session not found')`; `P:873` bloco `14:00 – 15:30`; `P:874-875`; `session-move-confirm.test.tsx:66` | ✅ PASS |
| ADJ-05 | `Cancelar` ou Esc: bloco de volta, nada enviado, detalhes | `P:883-885` (Cancel: bloco `14:00 – 15:00`, heading, `Edit`); `P:890-892` (Esc); `session-move-confirm.test.tsx:77` | ✅ PASS (F3 morto) |
| ADJ-06 | Outro bloco, gesto na grade vazia ou outra semana descartam como `Cancelar` | Clique `P:916-918`; teclado `P:961-963`; grade vazia `P:929-930`; outra semana `P:937-939`; o próprio bloco não descarta `P:895`, `use-grid-drag.test.tsx:211` | ✅ PASS (M9 morto) |
| ADJ-07 | Aviso de sobreposição com **outra** sessão mostrada | `P:996` - `getByRole('status')).toHaveTextContent('Overlaps Call (16:30 – 16:45).')`; não a própria `session-move-confirm.test.tsx:95` | ✅ PASS (M27 morto) |
| ADJ-08 | Com `Editar` aberto, soltar **o seu bloco** muda data, início e fim sem salvar; os campos movem o bloco; `Cancelar` devolve | `P:1005-1009` (`Edit session`, sem confirmação, `Start` `16:00`, `End` `17:00`, sem `update`); `P:1012` campo move o bloco para `15:30 – 17:00`; `P:1014-1015` Cancel devolve `14:00 – 15:00`; só o próprio bloco: `P:984-985` | ✅ PASS (N2, F9 mortos) |
| ADJ-09 | Sessão de um bloco unido, salva com horário novo, volta ao bloco | `P:502` (teste) - `toHaveBeenCalledWith('b', { ended_at: '2026-11-02T14:30:00.000Z' })`, bloco `Work, 2 sessions, 10:20 – 11:30` (`P:515-516`) | ✅ PASS (F2 morto) |
| ADJ-10 | Clique parado: quarto de hora +60 min, cortado em agora e na meia-noite; `Nova sessão` com esses horários | `use-grid-drag.test.tsx:140` (`{ mode: 'create', start: at(10, 0), end: at(11, 0) }`); meia-noite `:148`; agora `:155`; tremor `:163`; página `P:1139-1140` (`New session`, rascunho `09:00 – 10:00`) | ✅ PASS (F1 morto) |
| ADJ-11 | Arrastar desenha de 15 em 15 min | `use-grid-drag.test.tsx:172` - 10:00→10:40 dá `end: at(10, 45)` | ✅ PASS |
| ADJ-12 | Meio do rascunho: passos de 15 min, mesma duração, segue a coluna, nunca passa do limite; o painel segue | `use-grid-drag.test.tsx:181,189,196`; grade `components/agenda/week-grid.test.tsx:377` | ✅ PASS (F5 morto) |
| ADJ-13 | Pressionar o meio do rascunho não começa outro | `week-grid.test.tsx:387` - `querySelectorAll('[data-draft]')).toHaveLength(1)` | ✅ PASS |
| ADJ-14 | `grab` no meio; `grabbing` ao arrastar; bordas com resize; sem texto | `week-grid.test.tsx:407-410,414`; `:417` - `draft.textContent).toBe('09:00 – 10:00')`; borda sem mão fechada `:420`; mão fechada no `move` `:430` | ✅ PASS (M24 morto) |
| ADJ-15 | Visão Dia = grade com uma coluna, botão na primeira célula, horas, blocos, agora, futuro | `components/agenda/day-timeline.test.tsx:69,213,224`; página `P:1057` - `querySelectorAll('[data-agenda-column]')).toHaveLength(1)`, `P:1108` | ✅ PASS |
| ADJ-16 | Célula: dia curto, `4 de Novembro de 2026`, total | `day-timeline.test.tsx:84` - `textContent).toBe('qua.4 de Novembro de 20262h 34min')` | ✅ PASS (F8 morto) |
| ADJ-17 | Semana: dia, número, total | `week-grid.test.tsx:96` - `textContent).toBe('Wed4')` | ✅ PASS |
| ADJ-18 | Faixa dos 7 dias, setas, mensagens; sem a linha de título | `day-timeline.test.tsx:69` (teste); página `P:1054` faixa, `P:1056` - `queryByRole('heading', { level: 2 })).toBeNull()` | ✅ PASS |
| ADJ-19 | ≥ 768 px: gestos e `Nova sessão`; < 768 px: `+` e sem gestos | 1280 px `P:1132-1133,1139-1140`, confirmação `P:1154-1156`; 390 px `P:1164-1165,1170-1171` | ✅ PASS |
| ADJ-20 | Menu de 352 px, ≥ 16 px entre título e atalhos | `components/agenda/view-menu.test.tsx:137` - `toHaveClass('w-88')`; `:139` - `gap-4` | ✅ PASS |
| ADJ-21 | Switch com a dica, entre dias e lupa, nas duas visões, desligado | `view-menu.test.tsx:142` (`aria-checked 'false'`, ordem); `lib/agenda/hide-breaks.test.ts:10` | ✅ PASS |
| ADJ-22 | Ligar tira todos os intervalos, abertos ou fechados, na hora, menu aberto; desligar devolve | `P:238-239` (`Break, 11:00 – 11:15` e `Break, 14:00 – now` nulos), `P:243` menu aberto, `P:246-247` voltam; visão Dia `P:250` | ✅ PASS (F4 morto) |
| ADJ-23 | Totais iguais; aviso sem intervalo escondido | `P:241` - `textContent).toBe(mondayTotal)`; `P:259` (aviso de `New session` sem o intervalo) | ✅ PASS |
| ADJ-24 | Ponto no botão, nas duas visões | `view-menu.test.tsx:168`; `P:242,293` - `querySelector('[data-filter-dot]')).not.toBeNull()` | ✅ PASS |
| ADJ-25 | Como deixado por último neste dispositivo, ou desligado sem escolha válida | Ida e volta `P:275-284`; storage semeado `P:287-293`; leitura `hide-breaks.test.ts:10,18,26` | ✅ PASS (M14, F7 mortos) |

**Status**: ✅ 25/25 com evidência no valor da spec e sem mutante vivo.

---

## Sensor de discriminação

Scratch isolado: `git worktree add --detach <scratchpad>/wt3 HEAD` (`cd5cde3`), `frontend/node_modules` em symlink. Linha de base no scratch: 20 arquivos (`src/lib/agenda`, `src/components/agenda`, `src/pages/agenda.test.tsx`), 298/298. Cada mutante aplicado sozinho por substituição exata (contagem 1 conferida; F2 e F3 tiveram a âncora ampliada para cair só no painel de confirmação), rodando esses 20 arquivos, e desfeito com `git checkout --`. Worktree removido com `git worktree remove --force`; `git status --porcelain` da árvore real igual ao de antes.

| # | Arquivo | Mutação | Morto? | Teste que pegou |
| - | ------- | ------- | ------ | --------------- |
| N2 | `frontend/src/pages/agenda.tsx:144` | `commit()` sem `selectedId === final.sessionId` | ✅ | ADJ-01 ADJ-08 outro bloco com `Editar` (`P:976`) |
| N6 | `frontend/src/pages/agenda.tsx:169` | `pending` sem `!drag.dragging` | ✅ | ADJ-01 só ao soltar (`P:966`) |
| M27 | `frontend/src/components/agenda/session-move-confirm.tsx:65` | `findOverlap` sem `session.id` | ✅ | `session-move-confirm.test.tsx:95` |
| M14 | `frontend/src/pages/agenda.tsx:77` | sem `saveHideBreaks(next)` | ✅ | ADJ-25 reabrir (`P:275`) |
| M22 | `frontend/src/components/agenda/week-grid.tsx:121` | `shown.filter(hidden)` com dependências `[shown, hidden]` | ✅ | HIDE-17 pendente (`P:942`) |
| M24 | `frontend/src/components/agenda/week-grid.tsx:102` | mão fechada em qualquer gesto | ✅ | ADJ-14 borda (`week-grid.test.tsx:420`) |
| M9 | `frontend/src/pages/agenda.tsx:196` | `select` não limpa o rascunho | ✅ | ADJ-06 teclado (`P:953`) |
| F1 | `frontend/src/lib/agenda/use-grid-drag.ts:59` | `CLICK_MINUTES` 60 → 45 | ✅ | ADJ-10 (`use-grid-drag.test.tsx:140,163`), ADJ-19 (`P:1126`), 5 testes |
| F2 | `frontend/src/pages/agenda.tsx:395` | sem `if (groupIds) closeSelected()` depois de salvar o pendente | ✅ | ADJ-09 (`P:502`) |
| F3 | `frontend/src/pages/agenda.tsx:382` | `onCancel` da confirmação não descarta o pendente | ✅ | ADJ-05 (`P:878`) |
| F4 | `frontend/src/pages/agenda.tsx:80` | `Ocultar intervalos` só esconde intervalos fechados | ✅ | ADJ-22/23 (`P:230,250,259`) |
| F5 | `frontend/src/lib/agenda/use-grid-drag.ts:129` | mover sem arredondar para 15 min | ✅ | AGENDA-30 (`use-grid-drag.test.tsx`, `week-grid.test.tsx`) |
| F6 | `frontend/src/lib/agenda/use-grid-drag.ts:189` | `onCommit` mesmo soltando no mesmo lugar | ✅ | edge case "Soltar no mesmo lugar", ADJ-06 (`use-grid-drag.test.tsx:211`), 4 testes |
| F7 | `frontend/src/lib/agenda/hide-breaks.ts:7` | `=== 'true'` → `!== 'false'` (ligado sem escolha válida) | ✅ | ADJ-25 (`hide-breaks.test.ts:10`), 5 testes |
| F8 | `frontend/src/components/agenda/week-grid.tsx:64` | mês sem maiúscula | ✅ | ADJ-16 (`day-timeline.test.tsx`, "heads the day in Portuguese") |
| F9 | `frontend/src/pages/agenda.tsx:144` | `commit()` nunca leva o horário ao `Editar` aberto | ✅ | ADJ-08 (`P:999`) |

**Profundidade**: expandida (os 2 sobreviventes da rodada 2, 5 mortos antigos de amostra, 9 mutações novas nos caminhos de clique, cancelar, bloco unido, intervalos, passo, soltar no lugar, storage e cabeçalho).
**Resultado**: 16/16 mortos - PASS ✅. M4 (`frontend/src/lib/agenda/use-grid-drag.ts:178`, não engole o clique depois de um arraste) não foi reaplicado: sobrevive em jsdom por construção e fica para a UAT.

---

## Qualidade do código

| Princípio | Status |
| --------- | ------ |
| Código mínimo / mudanças cirúrgicas / sem scope creep | ✅ (T11 só mexe em teste e em `tasks.md`) |
| Segue os padrões | ✅ (os testes novos reusam `block`, `px`, `moveTo1600`, `confirmPanel`) |
| Asserção ancorada na spec | ✅ |
| Cobertura por camada (funções puras 1:1; página a 390 e 1280 px) | ✅ |
| Todo teste mapeia um AC, edge case ou Done when | ✅ (os dois novos citam ADJ-01 e ADJ-08) |
| Guias do projeto: `CONTRIBUTING.md`, `frontend/vitest.config.ts` | ✅ |

---

## Edge cases

- [x] **Agora como limite**: `frontend/src/lib/agenda/use-grid-drag.test.tsx:155` - clique às 13:40 com agora 14:07 → `start: at(13, 30), end: at(14, 0)`. "Sem espaço antes de agora não cria nada" é AGENDA-23 (por gesto; nota, não lacuna).
- [x] **Soltar no mesmo lugar**: `use-grid-drag.test.tsx` "leaves nothing pending when a saved session is released in place" - `onCommit).not.toHaveBeenCalled()` e sem rascunho; com pendente, `:211` (F6 morto).
- [x] **Sessões que não se movem**: `frontend/src/components/agenda/week-grid.test.tsx:408-409` - sessão aberta e bloco unido sem `cursor-grab`.
- [x] **Sessão escondida (HIDE-17) com horário pendente**: `frontend/src/pages/agenda.test.tsx:942` - bloco `Write the report, 14:00 – 14:15` desenhado com o painel aberto sob mínimo de 30 min (M22 morto); depois de salvar, `:375`.

---

## Gate

- **Comandos** (árvore real, só leitura): `npm --prefix frontend run lint`, `npm --prefix frontend run typecheck`, `npm --prefix frontend test`, `npm --prefix frontend run build`
- **Resultado**: lint exit 0; typecheck exit 0; 145 arquivos, **1404 passed, 0 failed, 0 skipped** (`focus-widget.test.tsx` passou na primeira rodada); build exit 0
- **Testes antes da feature** (`22f5a81`): 1350
- **Testes depois**: 1404 (rodada 2: 1402; +2 de T11)
- **Delta**: +54

---

## Planos de correção

Nenhum. Observação para a UAT no navegador (sem task): `swallowNextClick` (`frontend/src/lib/agenda/use-grid-drag.ts:62-69,178`) só se prova num navegador. Conferir que, depois de mover o rascunho pelo meio ou de esticar um bloco, nenhum clique fantasma abre outro painel.

---

## Atualização da rastreabilidade

| Requisito | Antes | Agora |
| --------- | ----- | ----- |
| ADJ-01 a ADJ-25 | Implemented | ✅ Verified |

---

## Resumo

**Geral**: ✅ Ready (falta só a UAT no navegador de M4)

**Checagem ancorada na spec**: 25/25; 4/4 edge cases
**Sensor**: 16/16 mortos
**Gate**: 1404 passed, 0 failed; lint, typecheck e build exit 0

**O que funciona**: nada vai ao servidor antes de `Salvar horário`; a confirmação só abre ao soltar e é a do bloco arrastado, mesmo com o `Editar` de outra sessão aberto; o bloco não pisca; recusa, `Cancelar`, Esc e os descartes; aviso sem a própria sessão; clique de 1h e rascunho que se move; visão Dia com cabeçalho e gestos; `Ocultar intervalos` gravado e lido ao reabrir.

**Próximos passos**: UAT no navegador (incluindo o clique fantasma de M4); marcar ADJ-01 a ADJ-25 como Verified na spec.
