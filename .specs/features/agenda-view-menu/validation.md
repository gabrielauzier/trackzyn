# Menu de exibição da Agenda: validação (iteração 2)

**Data**: 2026-11-04
**Spec**: `.specs/features/agenda-view-menu/spec.md` (DAYS-14 emendado no plano de correção: o ponto e o `N de 7 dias` valem só na visão Semana)
**Intervalo do diff**: feature `b4564fa..HEAD`; rodada de correção `1ffaf54..HEAD` (HEAD = `c1fc90c`; commits 821329c, 92d97ba, 9a0ad56, c1fc90c; 3 arquivos de código e teste, +43/−8)
**Verificador**: sub-agente independente (autor ≠ verificador), rodada 2

## Validation: agenda-view-menu - PASS ✅

Os gates estão verdes (lint, typecheck, 1323/1323 testes, build). O sensor rodou **18 mutações** num worktree isolado: as 3 que sobreviveram na rodada 1 (M26, M28, M29), 4 da rodada de correção e 11 das classes da rodada 1. **Todas morreram.** ACs com prova `arquivo:linha` no valor da spec: **18/18**. Edge cases: **3/3**.

### Rodada 1 e o que a rodada de correção fechou

A rodada 1 reprovou (26/29 mutantes mortos, 15/18 ACs, 1/3 edge cases). A rodada de correção fechou:

| Lacuna da rodada 1 | Correção | Prova agora |
| ------------------ | -------- | ----------- |
| DAYS-04: o foco não voltava ao botão depois de um clique fora (defeito) | T6, `821329c`: `onCloseAutoFocus` com `preventDefault()` e `trigger.current?.focus()` em `frontend/src/components/agenda/view-menu.tsx:77-80` | `frontend/src/components/agenda/view-menu.test.tsx:41`; F1 e F2 mortos |
| DAYS-16: a sessão do aviso era de um dia visível; M26 e M28 sobreviviam (edge case 3 sem teste) | T7, `92d97ba`: teste reescrito com a quarta (hoje) escondida | `frontend/src/pages/agenda.test.tsx:197-208`; M26 e M28 mortos |
| Edge case 2: visão Dia num dia escondido sem teste; M29 sobrevivia | T8, `9a0ad56`: teste novo a 390 px com `agenda.days = [0,1]` | `frontend/src/pages/agenda.test.tsx:807-815`; M29 morto |
| DAYS-03: "abaixo" sem asserção | T9, `c1fc90c`: `side="bottom"` explícito em `view-menu.tsx:72` | `view-menu.test.tsx:27`; F3 morto |
| DAYS-14 na visão Dia (lacuna de precisão) | Spec emendada (DAYS-14 só na Semana) | `view-menu.test.tsx:101-105`, `agenda.test.tsx:797-799`; F4 morto |

---

## Conclusão das tasks

| Task | Status | Notas |
| ---- | ------ | ----- |
| T1 Seleção de dias | ✅ Done | - |
| T2 Menu de exibição | ✅ Done | Foco no clique fora fechado por T6 |
| T3 Canto da semana | ✅ Done | - |
| T4 Canto do dia | ✅ Done | - |
| T5 Página | ✅ Done | Aviso com dia escondido fechado por T7 |
| T6 Foco depois do clique fora | ✅ Done | - |
| T7 Hoje escondido: Nova sessão e aviso | ✅ Done | - |
| T8 Visão Dia num dia escondido | ✅ Done | - |
| T9 Menu abaixo do botão | ✅ Done | - |

---

## Critérios de aceitação ancorados na spec

| AC | Resultado definido na spec | `arquivo:linha` + asserção | Resultado |
| -- | -------------------------- | -------------------------- | --------- |
| DAYS-01 | Botão `Opções de exibição` no canto superior esquerdo da grade da semana, acima da coluna de horas | `frontend/src/components/agenda/week-grid.test.tsx:105` - `corner.compareDocumentPosition(header(container, WEEK[0]!)) & Node.DOCUMENT_POSITION_FOLLOWING`; página `frontend/src/pages/agenda.test.tsx:155` - `querySelector('[data-agenda-header]')).toContainElement(button)` | ✅ PASS |
| DAYS-02 | O mesmo botão no topo da coluna de horas da visão Dia | `frontend/src/components/agenda/day-timeline.test.tsx:204-211` - `sticky`/`top-0`, fora de `aria-hidden`, primeiro filho da área que rola; página a 390 px `frontend/src/pages/agenda.test.tsx:800` - `querySelector('[data-agenda-corner]')).toContainElement(button)` | ✅ PASS |
| DAYS-03 | Clique abre o menu **abaixo** do botão e marca o botão como expandido | `frontend/src/components/agenda/view-menu.test.tsx:25,27,28` - `aria-expanded 'false'` → `panel).toHaveAttribute('data-side', 'bottom')` → `aria-expanded 'true'` | ✅ PASS |
| DAYS-04 | Esc **ou clique fora** fecha e devolve o foco ao botão | `frontend/src/components/agenda/view-menu.test.tsx:34-36` - Esc: `queryByRole('dialog')).toBeNull()` + `toHaveFocus()`; `:39-41` - `user.click(document.body)`, `queryByRole('dialog')).toBeNull()` + `getByRole('button', { name: 'View options' })).toHaveFocus()` | ✅ PASS |
| DAYS-05 | `Lupa` no menu com `1x`, `2x`, `3x`, um nível por vez, lembrada no dispositivo | `frontend/src/components/agenda/view-menu.test.tsx:111-115` - `[['1x','false'],['2x','true'],['3x','false']]`; `frontend/src/pages/agenda.test.tsx:110,115-126` - níveis, um só pressionado, alturas `24*144`/`24*48`/`24*96`; lembrada `:136-138`; `Lupa` `:144` e `view-menu.test.tsx:130` | ✅ PASS |
| DAYS-06 | Barra de ferramentas sem a lupa | `frontend/src/pages/agenda.test.tsx:107` - `queryByRole('group', { name: 'Zoom' })).toBeNull()` antes de abrir o menu | ✅ PASS |
| DAYS-07 | Na Semana, `Dias da semana` com uma caixa por dia, segunda a domingo, marcada quando o dia aparece | `frontend/src/components/agenda/view-menu.test.tsx:47-56` - nomes `Monday`…`Sunday` e `aria-checked ['true'×5,'false','false']`; `:127,131` - `Dias da semana`, `Segunda-feira` | ✅ PASS |
| DAYS-08 | Na visão Dia, o menu não mostra `Dias da semana` | `frontend/src/components/agenda/view-menu.test.tsx:62-63`; página a 390 px `frontend/src/pages/agenda.test.tsx:803-804` - lupa presente e `queryByRole('group', { name: 'Week days' })).toBeNull()` | ✅ PASS |
| DAYS-09 | Desmarcar tira cabeçalho e coluna na hora, as restantes ocupam a largura, menu aberto | `frontend/src/components/agenda/view-menu.test.tsx:70-71` - `toHaveBeenCalledWith([0,1,2,3,4,6])` + diálogo; `frontend/src/pages/agenda.test.tsx:166-170` - cinco cabeçalhos, `[data-agenda-column]` `toHaveLength(5)`, sessão de sábado fora, diálogo aberto; `week-grid.test.tsx:108-111` | ✅ PASS (a "largura toda" vem do `flex-1` existente; não afirmável em jsdom) |
| DAYS-10 | Marcar de novo mostra o dia na hora, no seu lugar | `frontend/src/pages/agenda.test.tsx:179,181` - sem `2026-11-04`, depois `toEqual(['2026-11-02', …, '2026-11-08'])`; `frontend/src/lib/agenda/week-days.test.ts:43` - `toggleDay([0,2,4],1)` → `[0,1,2,4]` | ✅ PASS |
| DAYS-11 | `Seg – Sex` mostra segunda a sexta e esconde sábado e domingo | `frontend/src/components/agenda/view-menu.test.tsx:78` - `toHaveBeenLastCalledWith([0,1,2,3,4])`; `frontend/src/pages/agenda.test.tsx:166`; `week-days.test.ts:37` | ✅ PASS |
| DAYS-12 | `Todos` mostra os sete | `frontend/src/components/agenda/view-menu.test.tsx:80` - `toHaveBeenLastCalledWith([0,1,2,3,4,5,6])`; `week-days.test.ts:38` | ✅ PASS |
| DAYS-13 | Com um dia só, a caixa dele fica desabilitada | `frontend/src/components/agenda/view-menu.test.tsx:86-87` - `boxes[3]).toBeDisabled()` e as outras habilitadas; `week-days.test.ts:44` - `toggleDay([3],3)` → `[3]` | ✅ PASS |
| DAYS-14 (emendado) | Na Semana, com dia escondido: ponto e `Opções de exibição, N de 7 dias`; na visão Dia, nenhum dos dois | Semana: `frontend/src/components/agenda/view-menu.test.tsx:92-93` - `'View options, 5 of 7 days'` + `[data-filter-dot]` não nulo; `:97-98` sem ponto com os sete; `:124` - `'Opções de exibição, 5 de 7 dias'`; página `agenda.test.tsx:171,201` (`5 of 7`, `6 of 7`). Dia: `view-menu.test.tsx:103-104` - nome `'View options'` + ponto nulo com cinco dias; página a 390 px `agenda.test.tsx:797-799` - `findByRole('button', { name: 'View options' })` com `agenda.days = [0,1,2,3,4]` | ✅ PASS |
| DAYS-15 | Abre com os dias escolhidos por último; os sete na primeira vez ou sem escolha válida | `frontend/src/lib/agenda/week-days.test.ts:11-15` (nada, `junk`, `[]`, `{"a":1}`, `[0,7]`, `[1.5]`, `"0,1"` → sete), `:20,22`, `:32-33` (storage bloqueado); página `frontend/src/pages/agenda.test.tsx:191-192` | ✅ PASS |
| DAYS-16 | Totais dos dias mostrados, navegação por semanas inteiras e aviso de sobreposição como estão, **dias escondidos incluídos no aviso** | Totais `frontend/src/pages/agenda.test.tsx:169` - `textContent).toBe(mondayTotal)`; aviso com dia escondido `:197` (`agenda.days = [0,1,3,4,5,6]`), `:202-203` (cabeçalho de 4/11 e bloco `Quick call` ausentes, ou seja, a sessão está num dia escondido), `:208` - `getByRole('status')).toHaveTextContent('Overlaps Quick call (14:01 – 14:03).')`; navegação `:93-94` (`goTo` não mudou na feature) | ✅ PASS |
| DAYS-17 | Toda mudança vale na hora, sem botão de confirmar | `frontend/src/components/agenda/view-menu.test.tsx:70,117`; `frontend/src/pages/agenda.test.tsx:166-171` (grade muda sem outro clique), `:120-121` (lupa) | ✅ PASS |
| DAYS-18 | Clique num nível muda a grade na hora e o menu continua aberto | `frontend/src/components/agenda/view-menu.test.tsx:117-118` - `toHaveBeenCalledWith(1)` + diálogo; `frontend/src/pages/agenda.test.tsx:119-126` | ✅ PASS |

**Status**: ✅ All ACs covered (18/18). Nenhuma lacuna de precisão aberta.

---

## Sensor de discriminação

Scratch isolado: `git worktree add --detach` em `<scratchpad>/wt2` (HEAD `c1fc90c`), `frontend/node_modules` em symlink; linha de base no scratch: 5 arquivos da feature, 117/117. Cada mutante aplicado sozinho por substituição exata (contagem 1 conferida), rodando os 5 arquivos de teste da feature, e restaurado com `git checkout --` antes do próximo.

| # | Arquivo | Mutação | Morto? | Teste que pegou |
| - | ------- | ------- | ------ | --------------- |
| M26 | `frontend/src/pages/agenda.tsx:109` | aviso de sobreposição só com sessões dos dias mostrados (`&& visibleDays.includes(session.started_at.slice(0, 10))`) | ✅ | DAYS-16 hidden today (`agenda.test.tsx:208`) |
| M28 | `frontend/src/pages/agenda.tsx:160` | `openNew` volta sem fazer nada quando o dia está escondido | ✅ | DAYS-16 hidden today (`agenda.test.tsx:206`) |
| M29 | `frontend/src/pages/agenda.tsx:287` | visão Dia pula para o primeiro dia mostrado quando o dela está escondido | ✅ | DAYS-08 hidden day at 390 px (`agenda.test.tsx:814`) |
| F1 | `frontend/src/components/agenda/view-menu.tsx:77-80` | `onCloseAutoFocus` removido | ✅ | DAYS-04 (`view-menu.test.tsx:41`) |
| F2 | `frontend/src/components/agenda/view-menu.tsx:79` | `trigger.current?.focus()` removido (fica o `preventDefault`) | ✅ | DAYS-04 |
| F3 | `frontend/src/components/agenda/view-menu.tsx:72` | `side="top"` | ✅ | DAYS-03 (`view-menu.test.tsx:27`) |
| F4 | `frontend/src/components/agenda/view-menu.tsx:37` | ponto e `N de 7` também na visão Dia (sem `showDays &&`) | ✅ | DAYS-14 dia (`view-menu.test.tsx:103`) e DAYS-02/08 390 px (`agenda.test.tsx:799`) |
| R1 | `frontend/src/lib/agenda/week-days.ts:11` | aceita 7 (`<= 7`) | ✅ | DAYS-15 junk |
| R2 | `frontend/src/lib/agenda/week-days.ts:23` | aceita lista vazia | ✅ | DAYS-15 junk |
| R3 | `frontend/src/components/agenda/view-menu.tsx:107` | caixa do último dia nunca desabilitada | ✅ | DAYS-13 |
| R4 | `frontend/src/lib/agenda/week-days.ts:42` | `toggleDay` deixa desmarcar o último | ✅ | DAYS-13 unit |
| R5 | `frontend/src/lib/agenda/week-days.ts:6` | `Seg – Sex` inclui sábado | ✅ | 4 testes (DAYS-11/12 unit e menu, DAYS-09 página, DAYS-15 página) |
| R6 | `frontend/src/components/agenda/view-menu.tsx:49` | atalhos entregam sempre os sete | ✅ | 3 testes (DAYS-11/12, DAYS-09, DAYS-15) |
| R7 | `frontend/src/pages/agenda.tsx:96` | dias não gravados | ✅ | DAYS-15 página |
| R8 | `frontend/src/pages/agenda.tsx:272` | `WeekGrid` recebe os sete dias sempre | ✅ | 4 testes (DAYS-09, 10, 15, 16) |
| R9 | `frontend/src/pages/agenda.tsx:146` | `showDays` verdadeiro na visão Dia | ✅ | DAYS-02/08 390 px |
| R10 | `frontend/src/lib/agenda/week-days.ts:24` | leitura mantém a ordem e as repetições guardadas | ✅ | DAYS-15 ordem |
| R11 | `frontend/src/components/agenda/view-menu.tsx:98` | condição do "só um" errada (`< 1`) | ✅ | DAYS-13 |

**Profundidade**: expandida (18 mutações: os 3 sobreviventes, os 4 ramos da correção, 11 das classes da rodada 1).
**Resultado**: 18/18 mortos - PASS ✅

Isolamento: `git status --porcelain` da árvore real antes e depois igual (`?? .checks/05-lote-foco-14-15-16.verified.md`, `?? .claude/launch.json`, `?? trackzyn-dev.sql`, conferido com `diff` contra a linha de base guardada); worktree removida (`git worktree remove --force`, `git worktree prune`) e ausente de `git worktree list`.

---

## Qualidade do código

| Princípio | Status |
| --------- | ------ |
| Código mínimo | ✅ (correção de 12 linhas em `view-menu.tsx`; o resto é teste) |
| Mudanças cirúrgicas | ✅ (só `view-menu.tsx`, `view-menu.test.tsx`, `agenda.test.tsx` e `tasks.md`) |
| Sem scope creep | ✅ |
| Segue os padrões (`PopoverContent` do Radix, `useRef`) | ✅ |
| Asserção ancorada na spec | ✅ |
| Cobertura por camada (domínio 1:1; página nas duas visões) | ✅ funções puras 1:1; página na Semana (`frontend/src/pages/agenda.test.tsx:147-210`) e na visão Dia a 390 px (`:795-816`), conforme L-034 |
| Todo teste mapeia um AC, edge case ou Done when | ✅ |
| Guias do projeto: `CONTRIBUTING.md`, `frontend/vitest.config.ts` | ✅ |

### Integridade dos testes na rodada de correção (`1ffaf54..HEAD`)

- Nenhum teste apagado: o único `it(` removido é o antigo DAYS-16, substituído no mesmo lugar (`agenda.test.tsx:195`). Contagem 1322 → 1323 (+1, o teste de T8).
- Nenhuma asserção enfraquecida: `view-menu.test.tsx` só ganhou asserções (`:27` `data-side`, `:41` foco); `expect(await open(user)).toBeInTheDocument()` virou `panel` + `data-side`, que é mais forte (o `findByRole` já falha sem o diálogo).
- **DAYS-16 reescrito: mais forte.** O antigo guardava `[0,1,2,3,4]` e só afirmava o texto do aviso, com a sessão numa quarta visível (não discriminava M26). O novo esconde a quarta (`[0,1,3,4,5,6]`), prova que ela está escondida (cabeçalho `2026-11-04` nulo `:202`, bloco `Quick call` nulo `:203`, nome `6 of 7` `:201`), e afirma o painel (`heading 'New session'` `:206`), a data de hoje (`Date` = `2026-11-04` `:207`) e o mesmo texto do aviso (`:208`). Mata M26 e M28, que o antigo deixava vivos. A fixture `saturday` continua na lista sem uso, inofensiva.

---

## Edge cases

- [x] Storage desligado ou com outra coisa → sete dias: `frontend/src/lib/agenda/week-days.test.ts:11-15,32`
- [x] Semana → Dia: o menu perde `Dias da semana` (`frontend/src/pages/agenda.test.tsx:804`) e a visão Dia mostra o seu dia mesmo escondido: `:809` (`agenda.days = [0,1]`), `:814` - título `'Wednesday, November 4, 2026'`, `:815` - bloco `'Write the report, 09:00 – 10:00'` da quarta. M29 morto.
- [x] Hoje escondido → `Nova sessão` abre o painel em hoje: `frontend/src/pages/agenda.test.tsx:205-207` - `heading 'New session'` e `Date` = `2026-11-04`. M28 morto.

---

## Gate

- **Comando**: `npm --prefix frontend run lint && npm --prefix frontend run typecheck && npm --prefix frontend test && npm --prefix frontend run build` (árvore real, só leitura)
- **Resultado**: lint exit 0; typecheck exit 0; 141 arquivos, **1323 passed, 0 failed, 0 skipped**; build ok (exit 0)
- **Testes antes da feature**: 1296
- **Testes depois da rodada 1**: 1322
- **Testes agora**: 1323
- **Delta**: +27 na feature (+1 nesta rodada)
- **Backend**: sem mudança no intervalo; não rodado

---

## Planos de correção

Nenhum. Observações para UAT (não reprovam):

- O botão `size-9` na coluna `w-12` da visão Dia fica por cima do rótulo da primeira hora visível ao rolar (anotado na rodada 1): conferir no navegador.
- "As colunas restantes ocupam a largura toda" (DAYS-09) depende do `flex-1` existente, que o jsdom não mede: conferir no navegador.

---

## Atualização da rastreabilidade

| Requisito | Antes | Agora |
| --------- | ----- | ----- |
| DAYS-01 a 03, 05 a 13, 15, 17, 18 | ✅ Verified (rodada 1) | ✅ Verified |
| DAYS-04 | ❌ Needs Fix | ✅ Verified |
| DAYS-14 | ⚠️ Spec decision | ✅ Verified (spec emendada) |
| DAYS-16 | ❌ Needs Fix (teste) | ✅ Verified |

---

## Resumo

**Geral**: ✅ Ready

**Checagem ancorada na spec**: 18/18 com o valor da spec; 3/3 edge cases
**Sensor**: 18/18 mortos (inclui M26, M28, M29 da rodada 1)
**Gate**: 1323 passed, 0 failed

**O que funciona**: seleção de dias e storage; menu com dias, atalhos, último dia, ponto (só na Semana) e lupa; abre abaixo do botão; fecha com Esc e com clique fora, devolvendo o foco; esconder e mostrar dias na hora com o menu aberto; aviso de sobreposição e `Nova sessão` com hoje escondido; visão Dia fica no seu dia; lupa fora da barra; botão nas duas visões; seleção lembrada.

**Próximos passos**: UAT no navegador dos dois pontos acima; atualizar o status em `spec.md` (fora do escopo de escrita deste verificador).
