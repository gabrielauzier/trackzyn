# Ajustes da Agenda Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: decisões abaixo (feature média, só no frontend, sem contrato novo; o desenho visual aprovado é o canvas `Agenda — lote de ajustes`, https://claude.ai/artifact/2SNF5jGMCfZaND1Uio8Udg)
**Status**: In progress
**Pré-requisito**: a Agenda (#19), o menu de exibição (#26) e o seletor de tarefa (#27), na branch `feat/agenda`.

### Decisões técnicas

| Decisão | Escolha | Motivo |
| ------- | ------- | ------ |
| Onde fica o horário pendente | No próprio rascunho do `useGridDrag`: ao soltar um bloco salvo num horário novo, o hook chama `onCommit` e **não** limpa o rascunho; quem limpa é a página (ao salvar, cancelar ou descartar). Soltar no mesmo horário limpa, como hoje | O `WeekGrid` já desenha a sessão no horário do rascunho (`adjusting`); manter o rascunho até a gravação terminar é o que acaba com o bloco piscando (ADJ-02). Hoje o hook limpa no `pointerup`, antes de `applyToAll` gravar o cache, que espera `cancelQueries` |
| Quando o pendente some depois de salvar | Depois de `update.mutateAsync` resolver: o `onMutate` já pôs o novo horário no cache, então o bloco não volta | Sem quadro intermediário com o horário antigo |
| Painel de confirmação | Componente novo `SessionMoveConfirm` em `frontend/src/components/agenda/session-move-confirm.tsx`, com título, lista, o aviso `Novo horário — ainda não salvo`, o antigo riscado, o novo com a duração, o aviso de sobreposição, o erro, `Cancelar` e `Salvar horário`; Esc cancela | Desenho aprovado; o `SessionPanel` é um formulário e não cabe aqui. O cálculo de sobreposição sai do `SessionPanel` para `findOverlap` em `lib/agenda/layout.ts`, usado pelos dois |
| Clique que selecionaria o bloco | `select(session)` descarta o pendente só quando ele é de outra sessão | O `click` que o navegador dispara depois de soltar o bloco arrastado não pode apagar o pendente dele (ADJ-06) |
| Arrastar com `Editar` aberto | `commit` muda `editTimes`; `onTimesChange` do formulário de edição também põe o rascunho da sessão no novo horário; `Cancelar` limpa os dois | Uma confirmação só (ADJ-08) |
| Clique de 60 min | No `pointerup` de um `create` que não se moveu, o fim vira `min(início + 60, limite do dia)` | O desenho de 15 min continua durante o gesto; só o clique parado cria 1h (ADJ-10, ADJ-11) |
| Mover o rascunho | O corpo do rascunho no `WeekGrid` chama `drag.startMove` com `sessionId: null`; o hook já trata `move` sem sessão e mantém o rascunho no `pointerup` | O `stopPropagation` de `begin` impede que a coluna comece outro rascunho (ADJ-13) |
| Ponteiro | `cursor-grab` no corpo dos blocos que se movem e do rascunho; enquanto um `move` acontece, a raiz do `WeekGrid` ganha `data-grabbing` e `[&[data-grabbing]_*]:cursor-grabbing` | A mão fechada continua mesmo com o ponteiro fora do bloco |
| Visão Dia | O `DayTimeline` continua com a faixa dos dias, as setas, as mensagens e o `+`, e desenha um `WeekGrid` com `days={[day]}` e `longDate`; a linha de título sai | Um desenho só para as duas visões (ADJ-15); o `WeekGrid` ganha os gestos de graça |
| Data longa | `WeekGrid` com `longDate` formata `Intl.DateTimeFormat(locale, { day, month: 'long', year })` e põe em maiúscula a primeira letra da parte `month` (`formatToParts`) | `4 de Novembro de 2026` em pt-BR; `November 4, 2026` em inglês (ADJ-16) |
| Gestos e `+` por largura | A página passa `drag` ao `WeekGrid` da visão Dia só a partir de 768 px (`useIsMobile` falso); `Nova sessão` da barra aparece nas duas visões a partir de 768 px; o `+` (`onNew`) só abaixo | ADJ-19 |
| `Ocultar intervalos` | `frontend/src/lib/agenda/hide-breaks.ts` com `readHideBreaks`/`saveHideBreaks` no `localStorage` (`agenda.hideBreaks`, `"true"`/`"false"`, `try/catch`), como `week-days.ts`; a página junta ao `hidden` atual `hideBreaks && session.kind === 'break'` | O `hidden` já tira o bloco da grade e do aviso de sobreposição (HIDE-15) e não mexe no total (HIDE-14) |
| Menu | `w-88` (352 px), `gap-4` entre o título dos dias e os atalhos; o switch usa `components/ui/switch.tsx`; o ponto acende com dia escondido ou com intervalos escondidos | Desenho aprovado (ADJ-20, ADJ-21, ADJ-24) |

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `CONTRIBUTING.md`, `frontend/vitest.config.ts`; lição candidata L-034 (teste de página a 390 px na visão Dia).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Funções puras e hooks do frontend | unit | Todos os ramos: storage vazio, com lixo e bloqueado; clique de 60 min e os cortes em agora e na meia-noite; desenho de 15 min; mover o rascunho, com outro dia e com o limite; soltar no mesmo lugar e num lugar novo | `frontend/src/lib/agenda/*.test.ts(x)` | `npm --prefix frontend test` |
| Componentes e páginas | unit (Testing Library) | Cada AC visível, nas duas visões e a 390 px e 1280 px; nenhuma requisição antes de `Salvar horário`; o bloco no horário novo durante a gravação | `frontend/src/**/*.test.tsx` | `npm --prefix frontend test` |
| Traduções | none | build gate (typecheck) | - | `npm --prefix frontend run typecheck` |

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Tasks com testes de unidade do frontend | `npm --prefix frontend test` |
| Full | Tasks que tocam a página | `npm --prefix frontend run lint && npm --prefix frontend run typecheck && npm --prefix frontend test` |
| Build | Fim da fase | Full + `npm --prefix frontend run build` |

---

## Execution Plan

### Phase 1: Ajustes

```
T1 → T2
T3 → T4 → T7 → T8
T3 → T6 → T8
T5 → T6
```

---

## Task Breakdown

### T1: O menu mais largo e o switch `Ocultar intervalos`

**What**: `hide-breaks.ts` (ler e gravar a escolha) e, no `AgendaViewMenu`, a largura de 352 px, o espaço entre o título e os atalhos, o switch `Ocultar intervalos` com a dica, nas duas visões, e o ponto quando ele está ligado.
**Where**: `frontend/src/lib/agenda/hide-breaks.ts`, `frontend/src/components/agenda/view-menu.tsx`, `frontend/src/locales/{en,pt-BR}.json`
**Depends on**: None
**Reuses**: o padrão de `frontend/src/lib/agenda/week-days.ts`, `components/ui/switch.tsx`
**Requirement**: ADJ-20, ADJ-21, ADJ-24, ADJ-25

**Done when**:

- [x] Sem nada guardado, com lixo ou com o storage bloqueado, a leitura devolve `false`; gravar `true` e ler devolve `true`
- [x] O conteúdo do menu tem a classe de 352 px e o título dos dias tem 16 px de espaço até os atalhos
- [x] O switch `Ocultar intervalos` aparece na semana e no dia, entre os dias e a lupa, com `Esconde as pausas da agenda`; clicar chama `onHideBreaksChange(true)` e o menu continua aberto
- [x] Com o switch ligado, o botão mostra o ponto nas duas visões, mesmo com os sete dias
- [x] Gate check passes: Quick

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): add the hide breaks switch to the agenda view menu`

---

### T2: Esconder os intervalos na página

**What**: A página lê a escolha ao abrir, grava ao mudar e esconde os intervalos com o `hidden` atual.
**Where**: `frontend/src/pages/agenda.tsx`
**Depends on**: T1
**Reuses**: `isHiddenSession`, o `hidden` da página
**Requirement**: ADJ-22, ADJ-23, ADJ-24, ADJ-25

**Done when**:

- [ ] Ligar o switch tira na hora todos os blocos de intervalo, aberto ou fechado, nas duas visões; desligar devolve
- [ ] Os totais do dia não mudam, e o aviso de sobreposição não cita um intervalo escondido
- [ ] Com `agenda.hideBreaks` gravado como `true`, a Agenda abre com os intervalos escondidos
- [ ] Gate check passes: Full

**Tests**: unit
**Gate**: full

**Commit**: `feat(frontend): hide the breaks on the agenda`

---

### T3: O clique de 1h e o rascunho que se move

**What**: No `useGridDrag`, o clique parado cria 60 min com os cortes; o `move` vale para o rascunho; soltar um bloco salvo num horário novo mantém o rascunho e chama `onCommit`; soltar no mesmo horário limpa.
**Where**: `frontend/src/lib/agenda/use-grid-drag.ts`
**Depends on**: None
**Reuses**: `place`, `dayLimit`
**Requirement**: ADJ-01, ADJ-02, ADJ-10, ADJ-11, ADJ-12

**Done when**:

- [ ] Um clique parado às 10:07 de ontem dá um rascunho de 600 a 660; às 23:30 de ontem, de 1410 a 1440; hoje, 30 min antes de agora, termina no quarto de hora de agora
- [ ] Arrastar de 10:00 a 10:40 dá 600 a 645, como antes
- [ ] Mover o rascunho de 600–660 com o ponteiro 120 min abaixo dá 720–780, com `sessionId: null`, em outro dia quando a coluna muda, e nunca termina depois do limite
- [ ] Soltar um bloco salvo 120 min abaixo chama `onCommit` e o rascunho continua com o novo horário; soltar no mesmo lugar não chama `onCommit` e limpa
- [ ] Gate check passes: Quick

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): create one hour on a click and move the new session draft`

---

### T4: Mover o rascunho e o ponteiro de mão na grade

**What**: No `WeekGrid`, o corpo do rascunho começa um `move`, sem começar outro rascunho; `cursor-grab` nos blocos que se movem e no rascunho, `cursor-grabbing` na grade durante um `move`.
**Where**: `frontend/src/components/agenda/week-grid.tsx`, `frontend/src/components/agenda/session-block.tsx`
**Depends on**: T3
**Reuses**: `drag.startMove`
**Requirement**: ADJ-12, ADJ-13, ADJ-14

**Done when**:

- [ ] Pressionar o meio do rascunho e arrastar 60 min move o rascunho sem criar um segundo
- [ ] O bloco salvo que se move e o rascunho têm `cursor-grab`; a sessão aberta e o bloco unido não têm; as bordas têm `cursor-ns-resize`
- [ ] Durante um `move`, a grade tem `data-grabbing`; depois de soltar, não
- [ ] O rascunho não mostra texto além do horário
- [ ] Gate check passes: Quick

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): move the new session draft and show the grab pointer`

---

### T5: O painel `SessionMoveConfirm`

**What**: O painel de confirmação do horário pendente e `findOverlap` em `layout.ts`, usado também pelo `SessionPanel`.
**Where**: `frontend/src/components/agenda/session-move-confirm.tsx`, `frontend/src/lib/agenda/layout.ts`, `frontend/src/components/agenda/session-panel.tsx`, `frontend/src/locales/{en,pt-BR}.json`
**Depends on**: None
**Reuses**: `sessionErrorMessage`, `formatDuration`, `clockTime`, o aviso de sobreposição do `SessionPanel`
**Requirement**: ADJ-01, ADJ-04, ADJ-05, ADJ-07

**Done when**:

- [ ] O painel mostra o título (ou `Intervalo`), a lista, `Novo horário — ainda não salvo`, `qua., 4 nov · 11:00 – 12:00` riscado e `qua., 4 nov · 13:00 – 14:00 · 1h`, `Cancelar` e `Salvar horário`
- [ ] `Salvar horário` chama `onSave` uma vez e fica desabilitado enquanto ele não responde; uma recusa mostra a mensagem em `role="alert"` e os botões continuam
- [ ] `Cancelar` e Esc chamam `onCancel`
- [ ] Com outra sessão no novo horário, o painel mostra o aviso de sobreposição; com a própria sessão, não; os testes do aviso no `SessionPanel` continuam passando
- [ ] Gate check passes: Quick

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): add the panel that confirms a new session time`

---

### T6: Confirmar na página antes de salvar

**What**: A página não grava ao soltar: abre o `SessionMoveConfirm` (ou muda o `Editar` aberto), salva em `Salvar horário`, devolve em `Cancelar`/Esc e descarta em outro bloco, num gesto na grade vazia e em outra semana.
**Where**: `frontend/src/pages/agenda.tsx`
**Depends on**: T3, T5
**Reuses**: `update.mutateAsync({ quiet: true })`, `closeSelected`, `sessionTimes`
**Requirement**: ADJ-01, ADJ-02, ADJ-03, ADJ-04, ADJ-05, ADJ-06, ADJ-07, ADJ-08, ADJ-09

**Done when**:

- [ ] Arrastar um bloco salvo das 11:00 para as 13:00 não faz requisição e abre o painel com os dois horários; o bloco está às 13:00
- [ ] `Salvar horário` faz um `PATCH` com os novos horários; enquanto ele não responde e depois, o bloco está às 13:00 (nunca às 11:00); no fim, os detalhes da sessão
- [ ] Uma recusa deixa o painel com a mensagem e o bloco às 13:00
- [ ] `Cancelar` e Esc devolvem o bloco às 11:00, sem requisição, e mostram os detalhes
- [ ] Clicar em outro bloco, começar um rascunho na grade vazia ou ir a outra semana descarta o pendente; o clique que vem depois de soltar o próprio bloco não descarta
- [ ] Com `Editar` aberto, soltar o bloco às 13:00 muda os campos sem requisição; mudar o campo de início move o bloco; `Cancelar` devolve
- [ ] Uma sessão escolhida de um bloco unido, salva num horário novo, volta ao bloco
- [ ] Gate check passes: Full

**Tests**: unit
**Gate**: full

**Commit**: `feat(frontend): confirm a dragged session time in the panel`

---

### T7: A visão Dia com o cabeçalho da semana

**What**: `WeekGrid` ganha `longDate`; o `DayTimeline` desenha a faixa dos dias, as setas, as mensagens e um `WeekGrid` com o dia, e perde a linha de título e a linha do tempo própria.
**Where**: `frontend/src/components/agenda/week-grid.tsx`, `frontend/src/components/agenda/day-timeline.tsx`
**Depends on**: T4
**Reuses**: `WeekGrid`
**Requirement**: ADJ-15, ADJ-16, ADJ-17, ADJ-18

**Done when**:

- [ ] Na visão Dia, o cabeçalho tem o botão de exibição na primeira célula e a célula do dia com `qua.`, `4 de Novembro de 2026` e o total
- [ ] Na semana, as células continuam com o dia da semana, o número e o total
- [ ] A faixa dos 7 dias, as setas e as mensagens de dia vazio e futuro continuam; o título `Quarta-feira, 4 de novembro de 2026` não aparece
- [ ] Os blocos, a linha de agora, o futuro hachurado, os blocos unidos e os escondidos continuam como antes na visão Dia
- [ ] Gate check passes: Quick

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): draw the day view with the week grid header`

---

### T8: Gestos e `Nova sessão` na visão Dia

**What**: A página passa os gestos ao `DayTimeline` a partir de 768 px, mostra `Nova sessão` na barra nas duas visões a partir de 768 px e o `+` só abaixo.
**Where**: `frontend/src/pages/agenda.tsx`, `frontend/src/components/agenda/day-timeline.tsx`
**Depends on**: T6, T7
**Reuses**: `useIsMobile`
**Requirement**: ADJ-19

**Done when**:

- [ ] A 1280 px, na visão Dia, arrastar na grade cria um rascunho e arrastar um bloco salvo abre o painel de confirmação; a barra mostra `Nova sessão` e o `+` não aparece
- [ ] A 390 px, a visão Dia mostra o `+`, não mostra `Nova sessão` na barra, e pressionar a grade não cria rascunho
- [ ] Gate check passes: Build

**Tests**: unit
**Gate**: build

**Commit**: `feat(frontend): take the drag gestures in the day view`

---

## Requirement Traceability

| Requirement ID | Tasks |
| -------------- | ----- |
| ADJ-01 | T3, T5, T6 |
| ADJ-02 | T3, T6 |
| ADJ-03 | T6 |
| ADJ-04 | T5, T6 |
| ADJ-05 | T5, T6 |
| ADJ-06 | T6 |
| ADJ-07 | T5, T6 |
| ADJ-08 | T6 |
| ADJ-09 | T6 |
| ADJ-10 | T3 |
| ADJ-11 | T3 |
| ADJ-12 | T3, T4 |
| ADJ-13 | T4 |
| ADJ-14 | T4 |
| ADJ-15 | T7 |
| ADJ-16 | T7 |
| ADJ-17 | T7 |
| ADJ-18 | T7 |
| ADJ-19 | T8 |
| ADJ-20 | T1 |
| ADJ-21 | T1 |
| ADJ-22 | T2 |
| ADJ-23 | T2 |
| ADJ-24 | T1, T2 |
| ADJ-25 | T1, T2 |
