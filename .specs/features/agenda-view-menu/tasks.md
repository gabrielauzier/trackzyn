# Menu de exibição da Agenda Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: decisões abaixo (feature média, só no frontend, sem contrato novo; o desenho visual aprovado é o canvas `Agenda · menu de exibição`)
**Status**: In Progress
**Pré-requisito**: a Agenda (#19) e a lupa, na branch `feat/agenda`.

### Decisões técnicas

| Decisão | Escolha | Motivo |
| ------- | ------- | ------ |
| Componente do menu | `Popover` (`frontend/src/components/ui/popover.tsx`, Radix) | O menu mistura caixas de seleção e o seletor da lupa, e não fecha a cada clique; o Radix já fecha com Esc e com clique fora e devolve o foco ao botão (DAYS-04) |
| Onde mora a seleção | `frontend/src/lib/agenda/week-days.ts`, no `localStorage` (`agenda.days`), lida e gravada com `try/catch`, como `lib/agenda/zoom.ts` | Mesmo comportamento e mesma proteção da lupa (DAYS-15) |
| Forma da seleção | Os números dos dias da semana mostrados, `0` (segunda) a `6` (domingo), em ordem | Independe do idioma e da data; inválido ou vazio volta aos sete |
| Como a grade esconde | A página passa ao `WeekGrid` só os dias mostrados em `days`; o `WeekGrid` já desenha um cabeçalho e uma coluna por item de `days` | Nada muda no cálculo dos pedaços nem dos totais (DAYS-16) |
| Lugar do botão | O canto do cabeçalho do `WeekGrid` (hoje `w-14` vazio) e, no `DayTimeline`, o topo da coluna de horas, fixo (`sticky`) enquanto a linha do tempo rola | Desenho aprovado e premissa do botão na visão Dia |

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `CONTRIBUTING.md`, `frontend/vitest.config.ts`; lição candidata L-034 (teste de página nas duas visões). Onde os guias não definem profundidade, valem os padrões fortes da skill.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Funções puras do frontend | unit | Todos os ramos: leitura com nada, com lixo e com storage bloqueado; gravação; os atalhos; o último dia | `frontend/src/lib/agenda/*.test.ts` | `npm --prefix frontend test` |
| Componentes e páginas | unit (Testing Library) | Cada AC visível: botão e nome, abrir e fechar (Esc, clique fora, foco), dias na semana e não no dia, mudança na hora, atalhos, último dia desabilitado, ponto, lupa no menu e fora da barra, as duas visões | `frontend/src/**/*.test.tsx` | `npm --prefix frontend test` |
| Traduções | none | build gate (typecheck) | - | `npm --prefix frontend run typecheck` |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Tasks com testes de unidade do frontend | `npm --prefix frontend test` |
| Full | Tasks que tocam a página | `npm --prefix frontend run lint && npm --prefix frontend run typecheck && npm --prefix frontend test` |
| Build | Fim da fase | Full + `npm --prefix frontend run build` |

---

## Execution Plan

### Phase 1: Menu de exibição

```
T1 → T2 → T3 → T4 → T5
```

### Phase 2: Fixes do Verifier (rodada 1)

```
T6 → T7 → T8 → T9
```

---

## Task Breakdown

### T1: A seleção de dias da semana

**What**: Funções puras dos dias mostrados: ler e gravar no dispositivo, os atalhos `Todos` e `Seg – Sex`, e marcar ou desmarcar um dia sem deixar a semana vazia.
**Where**: `frontend/src/lib/agenda/week-days.ts`
**Depends on**: None
**Reuses**: o padrão de `frontend/src/lib/agenda/zoom.ts`
**Requirement**: DAYS-11, DAYS-12, DAYS-13, DAYS-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Sem nada guardado, com lixo, com uma lista vazia ou com o storage bloqueado, a leitura devolve os sete dias
- [x] Gravar `[0,1,2,3,4]` e ler de novo devolve `[0,1,2,3,4]`
- [x] `Seg – Sex` dá `[0,1,2,3,4]`; `Todos` dá os sete
- [x] Desmarcar o único dia marcado não muda a seleção; marcar um dia o coloca no seu lugar da semana
- [x] Gate check passes: Quick

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): add the shown week days of the agenda`

---

### T2: O menu de exibição

**What**: `AgendaViewMenu`: o botão `Opções de exibição` (com o ponto e `, N de 7 dias` quando há dia escondido) e o `Popover` com `Dias da semana` (só quando pedido), os atalhos e a `Lupa`.
**Where**: `frontend/src/components/agenda/view-menu.tsx`
**Depends on**: T1
**Reuses**: `Popover`, `Checkbox`, o seletor de lupa de `frontend/src/pages/agenda.tsx`
**Requirement**: DAYS-03, DAYS-04, DAYS-05, DAYS-07, DAYS-08, DAYS-09, DAYS-11, DAYS-12, DAYS-13, DAYS-14, DAYS-17, DAYS-18

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Clicar no botão abre o menu e põe `aria-expanded="true"`; Esc e clique fora fecham e devolvem o foco ao botão
- [x] Com os dias pedidos, o menu mostra `Dias da semana` com as sete caixas, de segunda a domingo, marcadas conforme a seleção; sem, não mostra
- [x] Desmarcar um dia chama `onDaysChange` na hora com a nova seleção, e o menu continua aberto; os atalhos também
- [x] Com um dia só, a caixa dele está desabilitada
- [x] Com cinco de sete, o botão mostra o ponto e se chama `View options, 5 of 7 days`
- [x] A lupa mostra `1x`, `2x`, `3x`, uma marcada, e clicar chama `onZoomChange` com o menu aberto
- [x] Os textos em português: `Opções de exibição`, `Dias da semana`, `Todos`, `Seg – Sex`, `Lupa`
- [x] Gate check passes: Quick

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): add the agenda view menu`

---

### T3: O botão no canto da semana

**What**: `WeekGrid` recebe `corner?: ReactNode` e o desenha no canto do cabeçalho, acima da coluna de horas.
**Where**: `frontend/src/components/agenda/week-grid.tsx`
**Depends on**: T2
**Reuses**: o canto `w-14` que hoje fica vazio
**Requirement**: DAYS-01, DAYS-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] O `corner` aparece no cabeçalho, antes do primeiro dia
- [x] Com cinco dias em `days`, o cabeçalho e a grade têm cinco colunas
- [x] Sem `corner`, o canto fica como hoje (os testes atuais passam sem mudança)
- [x] Gate check passes: Quick

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): place a control in the agenda week corner`

---

### T4: O botão na linha do tempo do dia

**What**: `DayTimeline` recebe `corner?: ReactNode` e o desenha no topo da coluna de horas, fixo enquanto a linha do tempo rola.
**Where**: `frontend/src/components/agenda/day-timeline.tsx`
**Depends on**: T3
**Reuses**: a coluna de horas `w-12`
**Requirement**: DAYS-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] O `corner` aparece dentro da área que rola, antes das horas, com posição `sticky` no topo
- [x] Sem `corner`, a linha do tempo fica como hoje
- [x] Gate check passes: Quick

**Tests**: unit
**Gate**: quick

**Commit**: `feat(frontend): place a control in the agenda day timeline corner`

---

### T5: Ligar o menu na página da Agenda

**What**: A página guarda os dias mostrados (lidos e gravados por T1), passa ao `WeekGrid` só esses dias, põe o `AgendaViewMenu` no canto das duas visões (com os dias só na Semana) e tira a lupa da barra de ferramentas.
**Where**: `frontend/src/pages/agenda.tsx`
**Depends on**: T4
**Reuses**: o estado e o `saveZoom` da lupa
**Requirement**: DAYS-01, DAYS-02, DAYS-05, DAYS-06, DAYS-08, DAYS-09, DAYS-10, DAYS-15, DAYS-16, DAYS-17

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] A barra de ferramentas não tem mais o grupo `Zoom`; o menu no canto da semana tem a lupa, e trocar para 1x encolhe a grade
- [x] `Mon – Fri` deixa a semana com cinco cabeçalhos na hora; os totais dos dias que ficam não mudam
- [x] Reabrir a Agenda mostra os mesmos cinco dias
- [x] Na visão Dia (e na largura de 390 px), o menu mostra a lupa e não `Week days` (L-034)
- [x] Com o fim de semana escondido, o aviso de sobreposição continua citando uma sessão de sábado
- [x] Gate check passes: Build

**Tests**: unit
**Gate**: build

**Commit**: `feat(frontend): wire the agenda view menu and the day filter`

---

### T6: Devolver o foco ao botão depois de um clique fora

**What**: O menu devolve o foco ao botão em todo fechamento, também no clique fora, que o `Popover` não modal do Radix não devolve.
**Where**: `frontend/src/components/agenda/view-menu.tsx`
**Depends on**: None
**Reuses**: `onCloseAutoFocus` do `PopoverContent`
**Requirement**: DAYS-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Depois de um clique fora, o menu fecha e o botão tem o foco
- [x] Gate check passes: Quick

**Tests**: unit
**Gate**: quick

**Commit**: `fix(frontend): give the focus back to the view menu button on every close`

---

### T7: Provar o aviso e a Nova sessão com o dia de hoje escondido

**What**: Teste da página com a quarta-feira (hoje) escondida: `Nova sessão` abre o painel em hoje, e o aviso cita a sessão de hoje, que está num dia escondido.
**Where**: `frontend/src/pages/agenda.test.tsx`
**Depends on**: T6
**Reuses**: o teste DAYS-16 do mesmo arquivo
**Requirement**: DAYS-16

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Com `agenda.days = [0,1,3,4,5,6]`, `Nova sessão` abre o painel em quarta-feira, 4 de novembro
- [ ] O aviso diz `Overlaps Quick call (14:01 – 14:03).`, sessão de um dia escondido
- [ ] Gate check passes: Quick

**Tests**: unit
**Gate**: quick

**Commit**: `test(frontend): prove a hidden today still opens New session and warns`

---

### T8: Provar que a visão Dia fica no seu dia mesmo escondido

**What**: Teste da página na largura de 390 px com só segunda e terça mostradas: a linha do tempo continua em quarta-feira, 4 de novembro.
**Where**: `frontend/src/pages/agenda.test.tsx`
**Depends on**: T7
**Reuses**: `setWidth` do bloco de telas estreitas
**Requirement**: DAYS-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Com `agenda.days = [0,1]` a 390 px, o título do dia é `Wednesday, November 4, 2026`
- [ ] Gate check passes: Quick

**Tests**: unit
**Gate**: quick

**Commit**: `test(frontend): prove the day view stays on a hidden day`

---

### T9: Abrir o menu abaixo do botão

**What**: O menu abre explicitamente abaixo do botão (`side="bottom"`), alinhado ao início.
**Where**: `frontend/src/components/agenda/view-menu.tsx`
**Depends on**: T8
**Reuses**: `PopoverContent`
**Requirement**: DAYS-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] O menu aberto tem `data-side="bottom"`
- [ ] Gate check passes: Build

**Tests**: unit
**Gate**: build

**Commit**: `fix(frontend): open the agenda view menu below its button`

---

## Phase Execution Map

```
Phase 1:  T1 ------→ T2 ------→ T3 ------→ T4 ------→ T5
Phase 2:  T6 ------→ T7 ------→ T8 ------→ T9
```

5 tasks: um batch só, no contexto principal, sem sub-agentes. O Verifier roda depois de T5.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: Seleção de dias | 1 módulo de funções | ✅ Granular |
| T2: Menu | 1 componente | ✅ Granular |
| T3: Canto da semana | 1 prop num componente | ✅ Granular |
| T4: Canto do dia | 1 prop num componente | ✅ Granular |
| T5: Página | 1 página + traduções | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | início da Phase 1 | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Funções puras do frontend | unit | unit | ✅ OK |
| T2 | Componentes | unit | unit | ✅ OK |
| T3 | Componentes | unit | unit | ✅ OK |
| T4 | Componentes | unit | unit | ✅ OK |
| T5 | Componentes e páginas + traduções | unit | unit | ✅ OK |
