# Menu de exibição da Agenda: validação (iteração 1)

**Data**: 2026-11-04
**Spec**: `.specs/features/agenda-view-menu/spec.md`
**Intervalo do diff**: `b4564fa..HEAD` (HEAD = `6a905de`; 5 commits de task: 1f88ea8, a701853, e7e39ac, 33fda14, 6a905de; 13 arquivos, +545/−62)
**Verificador**: sub-agente independente (autor ≠ verificador)

## Validation: agenda-view-menu - FAIL ❌

Os gates estão verdes (lint, typecheck, 1322/1322 testes, build). O sensor rodou **29 mutações**: 26 morreram e **3 sobreviveram** (M26, M28, M29). Uma sonda no scratch mostrou um **defeito de comportamento** em DAYS-04: depois de um clique fora, o menu fecha mas o foco **não** volta ao botão (o Popover do Radix não modal não devolve o foco depois de uma interação fora). O teste de DAYS-04 só confere o foco depois do Esc.

ACs com prova `arquivo:linha` no valor da spec: **15/18 ✅**, 1 ❌ (DAYS-04), 1 ⚠️ parcial (DAYS-16, a parte "dias escondidos no aviso" não é provada), 1 ⚠️ lacuna de precisão da spec (DAYS-14 na visão Dia). Edge cases: 1/3 cobertos.

---

## Conclusão das tasks

| Task | Status | Notas |
| ---- | ------ | ----- |
| T1 Seleção de dias | ✅ Done | - |
| T2 Menu de exibição | ⚠️ Partial | Done when "clique fora fecha e devolve o foco" marcado, mas o foco não volta (sonda) |
| T3 Canto da semana | ✅ Done | - |
| T4 Canto do dia | ✅ Done | - |
| T5 Página | ⚠️ Partial | Done when "o aviso de sobreposição continua citando uma sessão de sábado": o teste cita uma sessão de quarta, dia visível |

---

## Critérios de aceitação ancorados na spec

| AC | Resultado definido na spec | `arquivo:linha` + asserção | Resultado |
| -- | -------------------------- | -------------------------- | --------- |
| DAYS-01 | Botão `Opções de exibição` no canto superior esquerdo da grade da semana, acima da coluna de horas | `frontend/src/components/agenda/week-grid.test.tsx:105` - `corner.compareDocumentPosition(header(container, WEEK[0]!)) & Node.DOCUMENT_POSITION_FOLLOWING`; `frontend/src/pages/agenda.test.tsx:155` - `expect(container.querySelector('[data-agenda-header]')).toContainElement(button)` | ✅ PASS |
| DAYS-02 | O mesmo botão no topo da coluna de horas da visão Dia | `frontend/src/components/agenda/day-timeline.test.tsx:209-211` - `toHaveClass('sticky', 'top-0')`, `corner.closest('[aria-hidden="true"]')).toBeNull()`, `scroller.firstElementChild).toBe(sticky)`; página a 390 px `frontend/src/pages/agenda.test.tsx:795` - `querySelector('[data-agenda-corner]')).toContainElement(button)` | ✅ PASS |
| DAYS-03 | Clique abre o menu abaixo do botão e marca o botão como expandido | `frontend/src/components/agenda/view-menu.test.tsx:25,27` - `toHaveAttribute('aria-expanded', 'false')` → `'true'` | ✅ PASS (o "abaixo" não é afirmado; vem do `side` padrão do Radix, ver lacuna 6) |
| DAYS-04 | Esc **ou clique fora** fecha e devolve o foco ao botão | `frontend/src/components/agenda/view-menu.test.tsx:34-35` - Esc: `queryByRole('dialog')).toBeNull()` + `toHaveFocus()`; clique fora `:38-39` só afirma `queryByRole('dialog')).toBeNull()`, sem o foco | ❌ GAP - sonda no scratch: `expect(button).toHaveFocus()` depois de `user.click(document.body)` **falha** (foco no `body`) |
| DAYS-05 | `Lupa` no menu com `1x`, `2x`, `3x`, um nível por vez, lembrada no dispositivo | `frontend/src/components/agenda/view-menu.test.tsx:109-113` - `[['1x','false'],['2x','true'],['3x','false']]`; `frontend/src/pages/agenda.test.tsx:110,115-126` - níveis, `pressed()` único e alturas `24*144`/`24*48`/`24*96`; lembrada `:136-138` - `aria-pressed 'true'` em 1x e bloco `'48px'`; nome `:144` e `view-menu.test.tsx:128` - `group 'Lupa'` | ✅ PASS |
| DAYS-06 | A barra de ferramentas não mostra mais a lupa | `frontend/src/pages/agenda.test.tsx:107` - `expect(screen.queryByRole('group', { name: 'Zoom' })).toBeNull()` (antes de abrir o menu) | ✅ PASS |
| DAYS-07 | Na Semana, `Dias da semana` com uma caixa por dia, segunda a domingo, marcada quando o dia aparece | `frontend/src/components/agenda/view-menu.test.tsx:45-54` - nomes `Monday`…`Sunday` e `aria-checked` `['true'×5,'false','false']`; `:129` - `Segunda-feira` | ✅ PASS |
| DAYS-08 | Na visão Dia, o menu não mostra `Dias da semana` | `frontend/src/components/agenda/view-menu.test.tsx:60-61`; página a 390 px `frontend/src/pages/agenda.test.tsx:799` - `queryByRole('group', { name: 'Week days' })).toBeNull()` com `:798` zoom presente | ✅ PASS |
| DAYS-09 | Desmarcar tira cabeçalho e coluna na hora, as restantes ocupam a largura, menu continua aberto | `frontend/src/components/agenda/view-menu.test.tsx:68-69` - `toHaveBeenCalledWith([0,1,2,3,4,6])` + diálogo presente; `frontend/src/pages/agenda.test.tsx:166-170` - cinco cabeçalhos, `[data-agenda-column]` `toHaveLength(5)`, sessão de sábado fora, diálogo aberto; `frontend/src/components/agenda/week-grid.test.tsx:110-111` | ✅ PASS (a "largura toda" vem do `flex-1` existente; não afirmável em jsdom) |
| DAYS-10 | Marcar de novo mostra o dia na hora, no seu lugar | `frontend/src/pages/agenda.test.tsx:181` - `toEqual(['2026-11-02', …, '2026-11-08'])` depois de desmarcar e marcar quarta; `frontend/src/lib/agenda/week-days.test.ts:43` - `toggleDay([0,2,4],1)` → `[0,1,2,4]` | ✅ PASS |
| DAYS-11 | `Seg – Sex` mostra segunda a sexta e esconde sábado e domingo na hora | `frontend/src/components/agenda/view-menu.test.tsx:76` - `toHaveBeenLastCalledWith([0,1,2,3,4])`; `frontend/src/pages/agenda.test.tsx:166` | ✅ PASS |
| DAYS-12 | `Todos` mostra os sete na hora | `frontend/src/components/agenda/view-menu.test.tsx:78` - `toHaveBeenLastCalledWith([0,1,2,3,4,5,6])`; `frontend/src/lib/agenda/week-days.test.ts:38` | ✅ PASS |
| DAYS-13 | Com um dia só, a caixa dele fica desabilitada | `frontend/src/components/agenda/view-menu.test.tsx:84-85` - `boxes[3]).toBeDisabled()` e as outras habilitadas; `frontend/src/lib/agenda/week-days.test.ts:44` - `toggleDay([3],3)` → `[3]` | ✅ PASS |
| DAYS-14 | Enquanto algum dia está escondido, ponto no botão e nome `Opções de exibição, N de 7 dias` | `frontend/src/components/agenda/view-menu.test.tsx:90-91` - `'View options, 5 of 7 days'` + `[data-filter-dot]` não nulo; `:95-96` sem ponto com os sete; `:122` - `'Opções de exibição, 5 de 7 dias'`; página `frontend/src/pages/agenda.test.tsx:171` | ✅ PASS na Semana; ⚠️ lacuna de precisão na visão Dia (ver abaixo) |
| DAYS-15 | Abre com os dias escolhidos por último; os sete na primeira vez ou sem escolha válida | `frontend/src/lib/agenda/week-days.test.ts:11-15` (nada, `junk`, `[]`, `{"a":1}`, `[0,7]`, `[1.5]`, `"0,1"` → sete), `:20,22` (lido de volta, em ordem), `:32-33` (storage bloqueado); página `frontend/src/pages/agenda.test.tsx:191-192` - mesmos cinco cabeçalhos ao reabrir | ✅ PASS |
| DAYS-16 | Totais dos dias mostrados, navegação por semanas inteiras e aviso de sobreposição como estão, **dias escondidos incluídos no aviso** | Totais `frontend/src/pages/agenda.test.tsx:169` - `textContent).toBe(mondayTotal)`; aviso `:203` - `'Overlaps Quick call (14:01 – 14:03).'`, mas a sessão `Quick call` é de **quarta, dia visível** (`agenda.days = [0,1,2,3,4]`, `:196`); navegação só pelo teste existente sem filtro `:93-94` | ⚠️ PARCIAL - "dias escondidos incluídos no aviso" sem prova; M26 sobrevive |
| DAYS-17 | Toda mudança vale na hora, sem botão de confirmar | `frontend/src/components/agenda/view-menu.test.tsx:68` (callback no clique), `:115`; `frontend/src/pages/agenda.test.tsx:166-171` (grade muda sem outro clique), `:120-121` (lupa) | ✅ PASS |
| DAYS-18 | Clique num nível muda a grade na hora e o menu continua aberto | `frontend/src/components/agenda/view-menu.test.tsx:115-116` - `toHaveBeenCalledWith(1)` + diálogo presente; `frontend/src/pages/agenda.test.tsx:119-126` - mesma referência `zoom` do diálogo usada nos três cliques | ✅ PASS |

**Status**: ❌ Gaps present (DAYS-04, DAYS-16 parcial) / ⚠️ Spec-precision gaps flagged (DAYS-14, DAYS-03)

### Lacuna de precisão: DAYS-14 na visão Dia

A spec diz "WHILE at least one day is hidden, the button SHALL show a dot…", sem exceção para a visão Dia, e o edge case 2 fala de um dia "hidden or not" na visão Dia, ou seja, a seleção continua valendo lá. O código (`frontend/src/components/agenda/view-menu.tsx:36` - `const filtered = showDays && days.length < ALL_DAYS.length`) apaga o ponto e o `, N de 7 dias` na visão Dia, e `frontend/src/components/agenda/view-menu.test.tsx:99-103` fixa isso. É uma leitura defensável (o filtro não age na visão Dia, DAYS-08), mas diverge do texto literal e não há `// SPEC_DEVIATION`. Precisa de decisão do usuário: emendar DAYS-14 ("WHILE the Agenda is in the week view and…") ou mostrar o ponto nas duas visões.

---

## Sensor de discriminação

Scratch isolado: `git worktree add --detach` em `<scratchpad>/wt`, `frontend/node_modules` em symlink; cada mutante aplicado sozinho, rodando os 5 arquivos de teste da feature (116 testes) e restaurado com `git checkout --` antes do próximo.

| # | Arquivo | Mutação | Morto? |
| - | ------- | ------- | ------ |
| M1 | `frontend/src/lib/agenda/week-days.ts:23` | aceita lista vazia | ✅ |
| M2 | `frontend/src/lib/agenda/week-days.ts:11` | aceita 7 (`<= 7`) | ✅ |
| M3 | `frontend/src/lib/agenda/week-days.ts:11` | aceita 1.5 (`typeof === 'number'`) | ✅ |
| M4 | `frontend/src/lib/agenda/week-days.ts:42` | o último dia pode ser desmarcado | ✅ |
| M5 | `frontend/src/lib/agenda/week-days.ts:41` | marcar quebra a ordem da semana | ✅ |
| M6 | `frontend/src/lib/agenda/week-days.ts:6` | `Seg – Sex` inclui sábado | ✅ |
| M7 | `frontend/src/lib/agenda/week-days.ts:32-36` | gravar não engole o erro do storage | ✅ |
| M8 | `frontend/src/lib/agenda/week-days.ts:24` | leitura mantém a ordem guardada | ✅ |
| M9 | `frontend/src/components/agenda/view-menu.tsx:70` | sempre mostra os dias | ✅ |
| M10 | `frontend/src/components/agenda/view-menu.tsx:70` | nunca mostra os dias | ✅ |
| M11 | `frontend/src/components/agenda/view-menu.tsx:36` | ponto com os sete dias (`<=`) | ✅ |
| M12 | `frontend/src/components/agenda/view-menu.tsx:36` | ponto na visão Dia | ✅ |
| M13 | `frontend/src/components/agenda/view-menu.tsx:37` | contagem do nome errada (`- 1`) | ✅ |
| M14 | `frontend/src/components/agenda/view-menu.tsx:95` | caixa do último dia não desabilitada | ✅ |
| M15 | `frontend/src/components/agenda/view-menu.tsx:48` | atalho entrega os sete dias sempre | ✅ |
| M16 | `frontend/src/components/agenda/view-menu.tsx:121` | clique na lupa fecha o menu | ✅ |
| M17 | `frontend/src/components/agenda/view-menu.tsx:96` | marcar um dia fecha o menu | ✅ |
| M18 | `frontend/src/components/agenda/view-menu.tsx:86` | condição do "só um" errada (`< 1`) | ✅ |
| M19 | `frontend/src/components/agenda/week-grid.tsx:115` | canto da semana não desenhado | ✅ |
| M20 | `frontend/src/components/agenda/day-timeline.tsx:136` | canto do dia sem `sticky` | ✅ |
| M21 | `frontend/src/components/agenda/day-timeline.tsx:135-139` | canto do dia dentro da coluna `aria-hidden` | ✅ |
| M22 | `frontend/src/pages/agenda.tsx:272` | página passa os sete dias sempre | ✅ |
| M23 | `frontend/src/pages/agenda.tsx:146` | `showDays` verdadeiro na visão Dia | ✅ |
| M24 | `frontend/src/pages/agenda.tsx:96` | dias não gravados | ✅ |
| M25 | `frontend/src/pages/agenda.tsx:248` | lupa deixada na barra de ferramentas | ✅ |
| M26 | `frontend/src/pages/agenda.tsx:109` | aviso de sobreposição ignora sessões dos dias escondidos | ❌ **Sobreviveu** |
| M27 | `frontend/src/pages/agenda.tsx:273` | semana sem o `corner` | ✅ |
| M28 | `frontend/src/pages/agenda.tsx:160` | `Nova sessão` não faz nada quando hoje está escondido | ❌ **Sobreviveu** |
| M29 | `frontend/src/pages/agenda.tsx:287` | visão Dia pula para o primeiro dia visível quando o dia está escondido | ❌ **Sobreviveu** |

Sonda extra (não mutante, código sem mudança): teste `PROBE DAYS-04` em `<scratch>/frontend/src/components/agenda/probe.test.tsx`: abrir o menu, `user.click(document.body)`, `expect(button).toHaveFocus()` → **falhou** ("Received element with focus:" vazio, o `body`).

**Profundidade**: expandida (29 mutações, todos os ramos novos).
**Resultado**: 26/29 mortos - FAIL ❌

Isolamento: `git status --porcelain` da árvore real antes e depois igual a `?? .checks/05-lote-foco-14-15-16.verified.md`, `?? .claude/launch.json`, `?? trackzyn-dev.sql`; worktree removida (`git worktree remove --force`, `git worktree prune`), não aparece em `git worktree list`.

---

## Qualidade do código

| Princípio | Status |
| --------- | ------ |
| Código mínimo | ✅ |
| Mudanças cirúrgicas | ✅ (só os arquivos das tasks + traduções) |
| Sem scope creep | ✅ |
| Segue os padrões (`zoom.ts`, Popover, Checkbox) | ✅ |
| Asserção ancorada na spec | ⚠️ DAYS-04 (foco no clique fora), DAYS-16 (dia escondido) |
| Cobertura por camada (domínio 1:1; página nas duas visões) | ✅ funções puras 1:1; página na Semana (`frontend/src/pages/agenda.test.tsx:147-204`) e na visão Dia a 390 px (`:790-800`), conforme L-034 |
| Todo teste mapeia um AC, edge case ou Done when | ✅ (`draws no corner without one` = Done when de T4) |
| Guias do projeto: `CONTRIBUTING.md`, `frontend/vitest.config.ts` | ✅ |

### Julgamentos pedidos

1. **Reescrita dos três testes da lupa** (`frontend/src/pages/agenda.test.tsx:104-145`): mantém todas as asserções da lupa: os níveis `['1x','2x','3x']` (`:110`), um só marcado (`:115,120,125`), as alturas da grade e do bloco (`:116-117,121-122,126`), a lupa lembrada (`:136-138`) e o nome `Lupa` (`:144`). Só troca de onde a lupa é alcançada (`openZoom` abre o menu). A asserção de posição (`view.nextElementSibling).toBe(zoom)`) saiu porque DAYS-06 a invalida; no lugar entrou `queryByRole('group', { name: 'Zoom' })).toBeNull()` antes de abrir o menu (`:107`), que matou M25. Nenhuma asserção ficou mais fraca. **Aceita.**
2. **Ponto apagado na visão Dia**: ver a lacuna de precisão acima. O comportamento é coerente com DAYS-08, mas o texto de DAYS-14 não tem a exceção. **Não reprova sozinho; pede emenda da spec ou mudança.**
3. **Wrapper `sticky` de altura zero na visão Dia** (`frontend/src/components/agenda/day-timeline.tsx:134-139`): é o primeiro filho da área que rola e fica fora da coluna `aria-hidden`, então o botão chega à árvore de acessibilidade e fica à vista ao rolar. Os testes fixam as três coisas (`frontend/src/components/agenda/day-timeline.test.tsx:209-211`; M20 e M21 mortos). **Aceito.** Fica para UAT: o botão `size-9` (36 px), com `pt-1.5`, fica por cima do rótulo da primeira hora visível na coluna `w-12`; conferir no navegador se cobre o texto da hora ao rolar.

---

## Edge cases

- [x] Storage desligado ou com outra coisa → sete dias: `frontend/src/lib/agenda/week-days.test.ts:11-15,32`
- [ ] Semana → Dia: o menu perde `Dias da semana` (✅ `frontend/src/pages/agenda.test.tsx:799`), mas "a visão Dia mostra o dia em que está, escondido ou não" **não tem teste**: o teste de 390 px usa hoje (quarta) visível. M29 sobrevive.
- [ ] Hoje escondido → `Nova sessão` ainda abre o painel em hoje: **sem teste** (M28 sobrevive). O código hoje atende (`openNew` não olha os dias mostrados), mas nada o prende.

---

## Gate

- **Comando**: `npm --prefix frontend run lint && npm --prefix frontend run typecheck && npm --prefix frontend test && npm --prefix frontend run build` (árvore real, só leitura)
- **Resultado**: lint 0 erros; typecheck 0 erros; 141 arquivos, **1322 passed, 0 failed, 0 skipped**; build ok (exit 0)
- **Testes antes da feature**: 1296 (1322 − 26 novos)
- **Testes depois**: 1322
- **Delta**: +26 (week-days 5, view-menu 11, week-grid 2, day-timeline 2, página 6); 3 testes da lupa reescritos, nenhum apagado
- **Backend**: sem mudança no intervalo; não rodado

---

## Planos de correção

### Fix 1: DAYS-04 - foco de volta ao botão depois de um clique fora (Major)

- **Causa**: `PopoverContent` do Radix não modal só devolve o foco ao trigger quando não houve interação fora (`hasInteractedOutsideRef`). `frontend/src/components/agenda/view-menu.tsx:69` não trata isso.
- **Correção**: em `AgendaViewMenu`, guardar um `ref` no botão e passar `onCloseAutoFocus={(event) => { event.preventDefault(); triggerRef.current?.focus() }}` ao `PopoverContent` (ou usar `<Popover modal>`). Se o usuário preferir que o foco fique no que foi clicado fora, emendar DAYS-04.
- **Teste**: em `frontend/src/components/agenda/view-menu.test.tsx:38-39`, depois de `user.click(document.body)`, `expect(screen.getByRole('button', { name: 'View options' })).toHaveFocus()`.

### Fix 2: DAYS-16 + edge case 3 - aviso e `Nova sessão` com hoje escondido (Major)

- **Causa**: `frontend/src/pages/agenda.test.tsx:195-203` esconde sábado e domingo, mas a sessão que se sobrepõe é de quarta, dia visível. O teste não prova que as sessões de dias escondidos entram no aviso.
- **Correção (só teste)**: guardar `agenda.days` sem a quarta (`[0,1,3,4,5,6]`; hoje é quarta 4/11), clicar `New session` e afirmar que o painel abre (`heading 'New session'`, horário de hoje 14:00 – 14:05) e que `status` mostra `'Overlaps Quick call (14:01 – 14:03).'`. Mata M26 e M28.

### Fix 3: Edge case 2 - visão Dia num dia escondido (Minor)

- **Correção (só teste)**: a 390 px, com `agenda.days = [0,1]` (quarta escondida), afirmar que a linha do tempo mostra a quarta 4/11 (o rótulo do dia ou a sessão de hoje) e não a segunda. Mata M29.

### Fix 4: DAYS-14 na visão Dia (decisão)

- Perguntar ao usuário: emendar DAYS-14 para "WHILE the Agenda is in the week view and at least one day is hidden" (o código e `view-menu.test.tsx:99-103` já fazem isso) ou mostrar o ponto e o nome nas duas visões.

### Fix 5: DAYS-03 "abaixo" (Cosmetic, opcional)

- Afirmar `expect(panel).toHaveAttribute('data-side', 'bottom')` em `frontend/src/components/agenda/view-menu.test.tsx:26`, ou passar `side="bottom"` explícito.

---

## Atualização da rastreabilidade

| Requisito | Antes | Agora |
| --------- | ----- | ----- |
| DAYS-01, 02, 03, 05 a 13, 15, 17, 18 | In Tasks | ✅ Verified |
| DAYS-04 | In Tasks | ❌ Needs Fix |
| DAYS-14 | In Tasks | ⚠️ Spec decision |
| DAYS-16 | In Tasks | ❌ Needs Fix (teste) |

---

## Resumo

**Geral**: ❌ Not Ready

**Checagem ancorada na spec**: 15/18 com o valor da spec; 1 GAP (DAYS-04), 1 parcial (DAYS-16), 1 lacuna de precisão (DAYS-14); 2 de 3 edge cases sem teste
**Sensor**: 26/29 mortos (sobreviventes M26, M28, M29) + 1 sonda que falhou (DAYS-04)
**Gate**: 1322 passed, 0 failed

**O que funciona**: seleção de dias e storage; menu com dias, atalhos, último dia, ponto e lupa; esconder e mostrar dias na hora com o menu aberto; lupa fora da barra; botão nas duas visões, acessível e fixo; seleção lembrada.

**Próximos passos**: Fix 1 a 3 por um implementador; decidir Fix 4 com o usuário; reverificar.
