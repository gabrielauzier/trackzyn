# Widget de foco no desktop Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/widget-desktop/design.md`
**Status**: Draft
**Pré-requisito**: `foco-e-sons` concluída (usa `useFocus`, `lib/sounds`, a página de foco e a ponte `focus:state`).

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `CONTRIBUTING.md`, `.github/workflows/ci.yml` (desktop: lint, typecheck, test, `test:e2e` com `xvfb-run` no Linux), `desktop/playwright.config.mts`. Onde os guias não definem profundidade, valem os padrões fortes da skill.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Desktop main e preload | unit (fakes de Electron) | Todos os ramos; 1:1 com os ACs de janela, posição e atalho | `desktop/src/**/*.test.ts` | `npm --prefix desktop test` |
| Montagem do processo principal (`main/index.ts`) | e2e (Playwright + Electron) | Abrir, agir, expandir, restaurar pelo sistema, atalho | `desktop/e2e/*.spec.ts` | `npm --prefix desktop run test:e2e` |
| Lógica pura do frontend | unit | Todos os ramos | `frontend/src/lib/**/*.test.ts` | `npm --prefix frontend test` |
| Componentes e páginas | unit (Testing Library) | Cada AC visível, com e sem o mouse | `frontend/src/**/*.test.tsx` | `npm --prefix frontend test` |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Tasks com testes de unidade de um pacote | `npm --prefix desktop test` ou `npm --prefix frontend test` |
| Full | Tasks do processo principal e páginas | `npm --prefix desktop run lint && npm --prefix desktop run typecheck && npm --prefix desktop test` (desktop) ou `npm --prefix frontend run lint && npm --prefix frontend run typecheck && npm --prefix frontend test` (frontend) |
| Build | Fim de cada fase e a task de montagem | os dois Full acima + `npm --prefix frontend run build` + `npm --prefix desktop run test:e2e` |

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Processo principal

```
T1 → T4 → T5
T2 → T4
T3 → T4
```

### Phase 2: Telas do widget

```
T6 → T7 → T10
T6 → T8 → T10
T9 → T10
T6 → T11
```

### Phase 3: Montagem e ponta a ponta

```
T12
```

---

## Task Breakdown

### Phase 1: Processo principal

#### T1: Ponte do widget

**What**: Canais `focus:collapse`, `focus:expand`, `focus:changed`, `widget:state`, `widget:resize` e os membros `windowRole` (lido de um argumento do processo), `collapseFocus`, `expandFocus`, `resizeWidget`, `notifyFocusChanged`, `onFocusChanged` e `onWidgetState`; atualizar o comentário e os testes que contam os membros.
**Where**: `desktop/src/shared/ipc.ts`
**Depends on**: None
**Reuses**: padrão de `onExportState` e `APP_VERSION_ARG`
**Requirement**: WIDGET-22, WIDGET-24

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Testes do preload: cada membro novo chama o canal certo; `windowRole` é `widget` com o argumento e `main` sem; a contagem fixada passa a 22
- [x] Gate check passes: Full (desktop)
- [x] Test count: a contagem do desktop só aumenta

**Status**: ✅ Done

**Nota**: Os canais `focus:collapse`, `focus:expand`, `focus:changed` e `widget:resize` ficam registrados em `main/index.ts` com handlers vazios até a T12, porque `ipc.test.ts` exige o registro. `widget:state` entrou na lista de canais só de envio, e a janela principal recebe `{ open: false }` ao carregar. `expandFocus` aceita o motivo opcional `task_left` (tabela de erros do design). A ponte também mudou o espelho `frontend/src/lib/platform.ts`, os fakes dos testes do frontend e a lista de `desktop/e2e/security.spec.ts`.

**Tests**: unit
**Gate**: full

**Commit**: `feat(desktop): bridge the focus widget`

---

#### T2: Janela do widget

**What**: `createWidgetWindow(bounds)`: sem moldura, `alwaysOnTop` no nível `floating`, sem redimensionar, fora da barra de tarefas, 300×64 px, mesmo preload com `windowRole=widget`, `hardenWebContents`, `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })` no macOS, carregando `APP_ORIGIN/widget`.
**Where**: `desktop/src/main/widget-window.ts`
**Depends on**: None
**Reuses**: `main/window.ts`, `main/security.ts`
**Requirement**: WIDGET-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Testes com `BrowserWindow` falso: opções exatas acima; `hardenWebContents` aplicado; URL `app://…/widget`
- [ ] Gate check passes: Full (desktop)
- [ ] Test count: a contagem do desktop só aumenta

**Tests**: unit
**Gate**: full

**Commit**: `feat(desktop): create the focus widget window`

---

#### T3: Posição do widget

**What**: `widgetBounds(saved, displays, mainDisplay)`: a posição salva se ela cabe numa tela; senão, o canto superior direito da tela da janela principal com margem de 16 px. Nova chave `widgetBounds` em `config-store.ts`.
**Where**: `desktop/src/main/widget-bounds.ts`
**Depends on**: None
**Reuses**: `resolveWindowBounds` e `isBounds`
**Requirement**: WIDGET-09, WIDGET-10, WIDGET-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Testes: sem posição salva → canto superior direito; posição salva visível → ela; posição salva numa tela desconectada → canto superior direito; a chave sobrevive a recriar o `config-store`
- [ ] Gate check passes: Quick
- [ ] Test count: a contagem do desktop só aumenta

**Tests**: unit
**Gate**: quick

**Commit**: `feat(desktop): place and remember the focus widget`

---

#### T4: Controle do widget

**What**: `createWidgetController`: `open()` (abre e minimiza a principal), `close(reason)` (fecha; restaura e foca a principal na tela de foco, ou no quadro em `task_left`; não restaura em `restore`), `minimize` da principal com foco ativo abre, `restore`/`show` da principal fecha, `close` do sistema e `render-process-gone` equivalem a expandir, salva a posição em `moved` e retransmite `focus:changed` e `widget:state`.
**Where**: `desktop/src/main/widget-controller.ts`
**Depends on**: T1, T2, T3
**Reuses**: `trackWindowState` (atraso de 500 ms)
**Requirement**: WIDGET-01, WIDGET-02, WIDGET-03, WIDGET-17, WIDGET-18, WIDGET-19, WIDGET-21, WIDGET-22, WIDGET-23

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Um teste por AC citado com fakes; minimizar sem foco ativo não abre (Edge Case)
- [ ] `focus:changed` vindo de uma janela chega só à outra
- [ ] Gate check passes: Full (desktop)
- [ ] Test count: a contagem do desktop só aumenta

**Tests**: unit
**Gate**: full

**Commit**: `feat(desktop): control the focus widget`

---

#### T5: Atalho do widget

**What**: `bindWidgetShortcut(webContents, controller, platform)` via `before-input-event`: `Ctrl+Shift+F` (Windows/Linux) ou `Meta+Shift+F` (macOS) abre o widget a partir da principal com foco ativo e expande a partir do widget.
**Where**: `desktop/src/main/widget-shortcut.ts`
**Depends on**: T4
**Reuses**: nada
**Requirement**: WIDGET-04, WIDGET-05, WIDGET-20

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Testes: combinação certa por plataforma; sem foco ativo não abre; outras teclas passam adiante sem `preventDefault`; nada é registrado como atalho global (WIDGET-05)
- [ ] Gate check passes: Build
- [ ] Test count: a contagem do desktop só aumenta

**Tests**: unit
**Gate**: build

**Commit**: `feat(desktop): toggle the focus widget with a shortcut`

---

### Phase 2: Telas do widget

#### T6: Ganchos do desktop no frontend

**What**: `isDesktop()`, `windowRole()`, `collapseFocus()`, `expandFocus()` e `useWidgetOpen()`; sem `window.trackzyn`, viram no-op, `main` e `false`.
**Where**: `frontend/src/lib/desktop/focus-window.ts`
**Depends on**: T1
**Reuses**: `lib/platform.ts`
**Requirement**: WIDGET-24

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Testes com e sem `window.trackzyn` falso
- [ ] Gate check passes: Quick
- [ ] Test count: a contagem do frontend só aumenta

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): add desktop focus window hooks`

---

#### T7: Sons só numa janela

**What**: `shouldPlayHere()` passa a usar `windowRole` e `useWidgetOpen`: o widget sempre toca; a principal só com o widget fechado.
**Where**: `frontend/src/lib/sounds/gate.ts`
**Depends on**: T6
**Reuses**: `gate.ts` de `foco-e-sons`
**Requirement**: WIDGET-23

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Testes: widget aberto → widget `true`, principal `false`; widget fechado → principal `true`
- [ ] Gate check passes: Quick
- [ ] Test count: a contagem do frontend só aumenta

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): play sounds only in the visible focus window`

---

#### T8: Controles do widget

**What**: Título truncado e cronômetro sempre; com o mouse, `Intervalo`, `Anotações`, `Pausar`/`Retomar`, `Pular`, `Concluir`, `Expandir`, e `Estender`/`Concluir` em `awaiting_extend`; `Tudo limpo` + `Expandir` sem tarefa; fundo arrastável e botões fora da área de arrastar.
**Where**: `frontend/src/components/focus/widget-controls.tsx`
**Depends on**: T6
**Reuses**: `break-picker`, `focus-task-card` (formato do cronômetro)
**Requirement**: WIDGET-07, WIDGET-08, WIDGET-12, WIDGET-13, WIDGET-16

**Tools**:

- MCP: NONE
- Skill: `frontend-design`

**Done when**:

- [ ] Testes: sem hover só título e cronômetro; com hover os 6 controles; `awaiting_extend` com hover mostra `Estender`; fila vazia mostra `Tudo limpo`; cada botão chama a ação de `useFocus`
- [ ] Gate check passes: Quick
- [ ] Test count: a contagem do frontend só aumenta

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): add the widget controls`

---

#### T9: Anotações no widget

**What**: Campo com as anotações da tarefa atual; ao abrir chama `resizeWidget('notes')`, ao perder o foco salva com `PATCH /api/tasks/:id {notes}` e volta a `compact`.
**Where**: `frontend/src/components/focus/widget-notes.tsx`
**Depends on**: None
**Reuses**: cliente de tarefas de `listas-e-quadro`
**Requirement**: WIDGET-14, WIDGET-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Testes: abrir pede `notes`; `blur` envia o texto e pede `compact`; texto acima de 10 000 bloqueia
- [ ] Gate check passes: Quick
- [ ] Test count: a contagem do frontend só aumenta

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): edit notes from the widget`

---

#### T10: Página do widget

**What**: `/widget` dentro de `ProtectedRoute` e fora de `AppLayout`, com `useFocus`, `useFocusSounds`, os controles e as anotações; a cada ação chama `notifyFocusChanged`, e ao receber `onFocusChanged` invalida a consulta do foco; sem tarefa porque ela saiu de Hoje, chama `expandFocus` com `task_left`.
**Where**: `frontend/src/pages/focus-widget.tsx`
**Depends on**: T7, T8, T9
**Reuses**: `App.tsx` (rotas)
**Requirement**: WIDGET-12, WIDGET-17, WIDGET-22

**Tools**:

- MCP: NONE
- Skill: `react-composition-patterns`

**Done when**:

- [ ] Testes: pausar chama `notifyFocusChanged`; evento recebido refaz a consulta; tarefa sumida chama `expandFocus`; avisos da fila offline aparecem no widget
- [ ] Gate check passes: Full (frontend)
- [ ] Test count: a contagem do frontend só aumenta

**Tests**: unit
**Gate**: full

**Commit**: `feat(web): add the focus widget page`

---

#### T11: Recolher a partir da tela de foco e do quadro

**What**: Ícone de recolher na página de foco só no desktop; no desktop, `Focar agora` abre a sessão e chama `collapseFocus`; a página de foco chama `notifyFocusChanged` e ouve `onFocusChanged`.
**Where**: `frontend/src/pages/focus.tsx`
**Depends on**: T6
**Reuses**: `lib/desktop/focus-window.ts`
**Requirement**: WIDGET-01, WIDGET-02, WIDGET-22, WIDGET-24

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Testes: sem `window.trackzyn` o ícone não aparece; com ele, o clique chama `collapseFocus`; no desktop, abrir pelo `Focar agora` chama `collapseFocus` depois do `start`
- [ ] Gate check passes: Build
- [ ] Test count: a contagem do frontend só aumenta

**Tests**: unit
**Gate**: build

**Commit**: `feat(web): collapse focus into the widget`

---

### Phase 3: Montagem e ponta a ponta

#### T12: Montar o widget no app e provar ponta a ponta

**What**: Em `main/index.ts`, criar o controlador do widget, registrar os canais com `trustedHandle`, ligar o atalho nas duas janelas e o estado vindo de `focus:state`; novo spec Playwright que abre o widget, pausa por ele, expande, restaura a principal pelo sistema e usa o atalho.
**Where**: `desktop/e2e/widget.spec.ts`
**Depends on**: T5, T10, T11
**Reuses**: `desktop/e2e/support/launch.ts`, `trustedHandle`
**Requirement**: WIDGET-01, WIDGET-04, WIDGET-06, WIDGET-10, WIDGET-18, WIDGET-19, WIDGET-20, WIDGET-22

**Tools**:

- MCP: NONE
- Skill: `playwright-skill`

**Done when**:

- [ ] O spec passa no macOS local e no CI Linux com `xvfb-run`
- [ ] Pausar no widget para o cronômetro da principal em até 1 s (WIDGET-22)
- [ ] Gate check passes: Build
- [ ] Test count: a contagem do desktop só aumenta

**Tests**: e2e
**Gate**: build

**Commit**: `feat(desktop): wire the focus widget into the app`

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1, T2, T3 | None | - | ✅ Match |
| T4 | T1, T2, T3 | T1 → T4, T2 → T4, T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | T1 (fase anterior) | - | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |
| T8 | T6 | T6 → T8 | ✅ Match |
| T9 | None | - | ✅ Match |
| T10 | T7, T8, T9 | T7 → T10, T8 → T10, T9 → T10 | ✅ Match |
| T11 | T6 | T6 → T11 | ✅ Match |
| T12 | T5, T10, T11 (fases anteriores) | - | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1–T5 | Desktop main e preload | unit | unit | ✅ OK |
| T6, T7 | Lógica pura do frontend | unit | unit | ✅ OK |
| T8–T11 | Componentes e páginas | unit | unit | ✅ OK |
| T12 | Montagem do processo principal | e2e | e2e | ✅ OK |
