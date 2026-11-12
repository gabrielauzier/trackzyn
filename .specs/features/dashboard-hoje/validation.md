# Dashboard Hoje Validation - FAIL ❌

**Verdict**: FAIL ❌
**Date**: 2026-11-11
**Spec**: `.specs/features/dashboard-hoje/spec.md`
**Diff range**: `d2005a9..HEAD` (`dd9ecc6`), 23 commits; base before the feature `0cfb40d`
**Verifier**: independent sub-agent (author ≠ verifier)

The build gate is green, 74 of 74 ACs have tests, and 12 of 12 behavior mutations were killed. The verdict is FAIL because one AC is not met as the spec writes it (HOJE-22, a documented but unapproved `SPEC_DEVIATION`), and `Fechar o dia` has a destructive side effect the spec never decided: it ends the series of a recurring task (HOJE-61). Both need a user decision or a fix before the feature is done.

---

## Task Completion

T1–T23 are marked `[x]` in `tasks.md`, each with its own commit in the diff range. None is blocked or partial.

---

## Spec-Anchored Acceptance Criteria

Paths: `BE` = `backend-node/test`, `FE` = `frontend/src`. The tests render in English, and the strings in the tests are the `en.json` text for the pt-BR copy in the spec.

### P1: Ver o dia ao abrir o app

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| HOJE-01 | `/` is the dashboard; `Hoje` is the first sidebar item and is marked | `FE/components/app-layout.test.tsx:215-217` - `expect(links[0]).toHaveAccessibleName('Today')`, `href '/'`, `aria-current 'page'`; `FE/App.test.tsx:86-89` - `findByRole('heading',{name:'Pending'})`, `pathname '/'` | ✅ |
| HOJE-02 | The list grid is at `/lists`; `Criar nova lista` → `/lists?new=1` | `FE/App.test.tsx:109-111` - `'Your lists'`, `pathname '/lists'`; `FE/components/app-layout.test.tsx:199` - `href '/lists?new=1'`; `FE/pages/lists.test.tsx:94-95` | ✅ |
| HOJE-03 | Greeting, the day in full, the time, and `4h 40min até o fim do dia (19:00)` | `FE/pages/today.test.tsx:116-117` - `'Wednesday, November 11 · 14:20 · 4hr 40min until the end of the day (19:00)'`, `h1 'Good afternoon, Ana'` | ✅ |
| HOJE-04 | After the workday ends: `Jornada encerrada às <HH:MM>` | `FE/pages/today.test.tsx:123-124` - `'… · 19:30 · Workday ended at 19:00'`, no `until the end` | ✅ |
| HOJE-05 | `Planejar amanhã` → `/planejar/<amanhã>` | `FE/pages/today.test.tsx:129` - `href '/planejar/2026-11-12'` | ✅ |
| HOJE-06 | Sessions, completions and plan of the reader only; Pendente of the workspace | `BE/services/today.test.ts:493-506` (other member's session out), `:628-631`, `:369-384` (other member's plan out); `BE/routes/today.test.ts:83-84` (viewer sees the Pendente, `done []`) | ✅ |

### P1: Saber o que está acontecendo agora

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| HOJE-07 | `Agora · em foco`, title, list, `32min de 1h 30min`, time left and end, Concluir/Pausar/Intervalo | `FE/components/today/now-card.test.tsx:135-141` - `'Now · in focus'`, `'32min of 1hr 30min'`, `'58min left · ends at 15:18'`, the three buttons | ✅ |
| HOJE-08 | No estimate: only the elapsed time, no bar, no end | `now-card.test.tsx:146-149` - `'25min elapsed'`, `progressbar` null, no `ends at` | ✅ |
| HOJE-09 | The card runs the same focus actions | `now-card.test.tsx:158,165,173` - `complete('task-a')`, `pause` ×1, `takeBreak(10, undefined, home.id)` | ✅ (the new state comes from `useFocus`, mocked here) |
| HOJE-10 | `Agora · intervalo`, name, time left, `Encerrar intervalo` | `now-card.test.tsx:195-199` | ✅ |
| HOJE-11 | Suggested block: dashed 2px border in the list's faint color, time of the block, how long ago it started, 3 buttons | `now-card.test.tsx:344-352` - `toHaveClass('border-2','border-dashed')`, `'13:30–15:00 · started 50min ago'`; `FE/lib/today/rules.test.ts:148-171` | ✅ |
| HOJE-12 | `Nada planejado para agora`, count and sum of the estimates, Escolher tarefa / Planejar hoje | `now-card.test.tsx:415-419` - `'5 tasks pending · 4hr 58min estimated'` | ✅ |
| HOJE-13 | `Sem foco há 1h · última sessão: Almoço, até 13:20` / `Nenhuma sessão hoje` | `now-card.test.tsx:443,454` | ✅ |
| HOJE-14 | Moves the task to the top of `Hoje` before the start | `now-card.test.tsx:379-381` - `move('task-week',{column:'today',before_task_id:'p4'})`, `order ['move','start']` | ✅ |
| HOJE-15 | A picker with the Pendente tasks, then start | `now-card.test.tsx:400,432`; `FE/components/today/task-picker.test.tsx:51,72` | ✅ |
| HOJE-16 | `Planejar hoje` → `/planejar/<hoje>` | `now-card.test.tsx:419` - `href '/planejar/${DAY}'` | ✅ |
| HOJE-17 | `Abrir foco` → session list / suggested task's list / first Pendente task's list | `now-card.test.tsx:211,466,477` | ⚠️ Spec-precision gap (see G3: hidden in the `elsewhere` state, untested) |
| HOJE-18 | No session, no suggestion and no Pendente → no link | `now-card.test.tsx:482` | ✅ |
| HOJE-19 | The title links to the same place | `now-card.test.tsx:212` | ✅ |
| HOJE-20 | `Em foco em outro workspace: <nome>`, no action buttons | `now-card.test.tsx:225-226`; `FE/lib/today/use-session-workspace.test.tsx:37` | ✅ |
| HOJE-21 | A viewer sees none of the action buttons | `now-card.test.tsx:234,239,242,490,495` | ✅ |
| HOJE-22 | **The API's error message** in a toast; the card goes back to the server state | `now-card.test.tsx:269` - `toast.error('The server refused: Complete')` (not the API message); `:391` - `'Task not found'` only on the `move` path | ❌ GAP (SPEC_DEVIATION, G2) |
| HOJE-74 | `Estimativa esgotada`, time spent, Estender and Concluir | `now-card.test.tsx:181-187` | ✅ |

### P1: Ver o que falta e se cabe

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| HOJE-23 | Not done, `Hoje` column, active lists, minus the open task; `5 tarefas · 4h 58min estimadas` | `BE/services/today.test.ts:249,255,261,272,283`; `FE/components/today/pending-card.test.tsx:68` | ✅ |
| HOJE-24 | The Planejar card: 1px border, 8px corners, dot, meta, pill / `Sem estimativa` | `FE/components/today/task-tile.test.tsx:17-27` | ✅ |
| HOJE-25 | First group that fits, in the order Atrasada → Sem plano; empty groups hidden | `rules.test.ts:31-86`; `pending-card.test.tsx:73-84` | ✅ |
| HOJE-26 | Count beside each group name; order by today's start, then position | `pending-card.test.tsx:73,94`; `rules.test.ts:90-98` | ✅ |
| HOJE-27 | `13:00 · passou há 1h 20min` in amber, amber border | `pending-card.test.tsx:100-101` | ✅ |
| HOJE-28 | `há N dias` = today − `scheduled_on` | `BE/services/today.test.ts:303`; `pending-card.test.tsx:106` - `'3 days ago'` | ✅ |
| HOJE-29 | Estimates plus what is left of the focused task, against the time to the end of the workday (0 after it) | `rules.test.ts:107,122`; `pending-card.test.tsx:121,135` | ✅ |
| HOJE-30 | Amber, `Não cabe no dia: sobram <diff> de tarefa`, overflow drawn hatched | `pending-card.test.tsx:121-123` - `"…18min of tasks left over"`, `text-amber-600`, `capacity-over` | ✅ |
| HOJE-31 | `Cabe no dia: <diff> livre`, no alert color | `pending-card.test.tsx:128-130` | ✅ |
| HOJE-32 | `N sem estimativa, contadas como 0` | `pending-card.test.tsx:140`; `rules.test.ts:133` | ✅ |
| HOJE-33 | Opens the task panel | `pending-card.test.tsx:154` | ✅ |
| HOJE-34 | `Nada pendente para hoje`, no groups and no capacity | `pending-card.test.tsx:159-161` | ✅ |

### P1: Ver o que já foi feito

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| HOJE-35 | Done today by the reader, newest first | `BE/services/today.test.ts:613,650` - `[last, middle, first]` | ✅ |
| HOJE-36 | `3h 22min em 4 tarefas` from the reader's sessions on those tasks | `FE/components/today/done-card.test.tsx:73` | ✅ |
| HOJE-37 | Gray card, done icon, `<lista> · <tempo> de <estimativa>`, verdict badge green/red | `done-card.test.tsx:88-93`; `task-tile.test.tsx:52-70` | ✅ |
| HOJE-38 | No estimate: only the time, no badge | `done-card.test.tsx:99-101`; `BE/services/today.test.ts:663` | ✅ |
| HOJE-39 | `Nada concluído hoje ainda` | `done-card.test.tsx:106` | ✅ |
| HOJE-40 | Another member's completion and yesterday's completion are left out | `BE/services/today.test.ts:631,637` | ✅ |

### P2: Plano × real, números, Amanhã

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| HOJE-42 | Plan and Actual rows | `FE/components/today/plan-vs-real.test.tsx:66-68` | ✅ |
| HOJE-43 | The scale goes from the full hour before the earliest start to the full hour after the latest end, one tick per hour | `plan-vs-real.test.tsx:77,99-103`; `rules.test.ts:243-253` | ✅ |
| HOJE-44 | Dashed list color for blocks, solid list color with white text for sessions, gray for breaks | `plan-vs-real.test.tsx:118-132` | ✅ |
| HOJE-45 | The open session runs to now; `agora` line | `plan-vs-real.test.tsx:143-144` | ✅ |
| HOJE-46 | On hover: title, start and end | `plan-vs-real.test.tsx:155-158` - `title 'Write the spec · 13:30–15:00'` | ✅ |
| HOJE-47 | `Sem plano para hoje` and a link to `/planejar/<hoje>` | `plan-vs-real.test.tsx:163-164` | ✅ |
| HOJE-48 | Horizontal scroll inside the card | `plan-vs-real.test.tsx:176-177` - `overflow-x-auto`, `min-w-[720px]` | ✅ (classes only, no layout run in jsdom) |
| HOJE-49 | Focused time equals the Reports total for today; `intervalos` | `BE/services/today.test.ts:594-595` - `toBe(report.tiles.task_seconds)`; `FE/components/today/day-stats.test.tsx:64-65` | ⚠️ Spec-precision gap (G5: whole-minute sessions) |
| HOJE-50 | `<feitas> de <planejadas> no plano`; segments green / indigo / gray | `day-stats.test.tsx:73-79` | ✅ |
| HOJE-51 | No plan: only the Feito hoje count and `sem plano hoje` | `day-stats.test.tsx:85-88` | ✅ |
| HOJE-52 | Adherence %; `—` with `sem blocos até agora` | `rules.test.ts:193-216` - `toBe(64)`, `toBeNull()`; `day-stats.test.tsx:94,99-100` | ✅ |
| HOJE-53 | Switches (A,B,A → 2) and the average session | `rules.test.ts:222-237`; `day-stats.test.tsx:106-107` | ✅ |
| HOJE-54 | Tomorrow in full; timed tasks first, by time; `<lista> · <HH:MM> · recorrente\|agendada` | `BE/services/today.test.ts:698,722-723`; `FE/components/today/tomorrow-card.test.tsx:50-70` | ✅ |
| HOJE-55 | Dashed line `N tarefas em Esta semana sem dia` | `BE/services/today.test.ts:743`; `tomorrow-card.test.tsx:75-81` | ✅ |
| HOJE-56 | `Amanhã ainda não tem plano` / `Plano de amanhã: N blocos`, `Planejar amanhã` | `BE/services/today.test.ts:755,761`; `tomorrow-card.test.tsx:86-100` | ✅ |
| HOJE-57 | `Nada marcado para amanhã` | `tomorrow-card.test.tsx:105-112` | ✅ |

### P3: Fechar o dia

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| HOJE-41 | Button beside Planejar amanhã; dialog with the day, the time, Focado, Concluídas, Aderência, No prazo | `FE/pages/today.test.tsx:188`; `FE/components/today/close-day-dialog.test.tsx:132-139` | ✅ |
| HOJE-58 | Focused time by list in a stacked bar with a legend | `close-day-dialog.test.tsx:145-151` | ✅ |
| HOJE-59 | Pendente plus the task in focus, each starting at `Amanhã` | `close-day-dialog.test.tsx:157-158`; `today.test.tsx:191` | ✅ |
| HOJE-60 | `Adiada N dias seguidos` from 3 days | `close-day-dialog.test.tsx:164-166` | ✅ |
| HOJE-61 | One write: tomorrow → `this_week` + `scheduled_on` tomorrow with no time; this_week / backlog without a day | `BE/services/today.test.ts:789-791` - `{column:'this_week',on:TOMORROW,time:null}`, `{column:'this_week',on:null}`, `{column:'backlog',on:null}`; `:807-809` (D21) | ⚠️ ACs met; G1: an unspecified side effect ends the series |
| HOJE-62 | Pause the open session before the moves | `BE/services/today.test.ts:817-818` - `endedAt NOW`, `endReason 'pause'` | ✅ |
| HOJE-63 | Markdown summary with the note at the end | `FE/lib/today/summary.test.ts:34` (exact mockup text); `close-day-dialog.test.tsx:174-177` | ✅ |
| HOJE-64 | Copy and `Resumo copiado` | `close-day-dialog.test.tsx:194-195,205` | ✅ |
| HOJE-65 | Error shown; no task moved; the dialog keeps the choices | `BE/services/today.test.ts:855,873-876`; `close-day-dialog.test.tsx:217-219` | ⚠️ Passes; atomicity under a failure in the middle of the moves is not tested (G4) |
| HOJE-66 | Closes anyway; `Não foi possível copiar o resumo` + `Copiar de novo` | `close-day-dialog.test.tsx:228-237` | ✅ |
| HOJE-67 | A viewer sees no button (and gets 403) | `today.test.tsx:198`; `BE/routes/today.test.ts:129-130` | ✅ |

### Edge cases

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| HOJE-68 | 23:30–00:30 counts as 00:00–00:30 | `BE/services/today.test.ts:539` | ✅ |
| HOJE-69 | A new timezone changes the day on the next read | `BE/services/today.test.ts:202-207` | ✅ |
| HOJE-70 | The page switches to the new day at midnight | `FE/lib/today/use-now-minute.test.tsx:74-78` - `onDayChange('2026-11-12')` once | ✅ |
| HOJE-71 | Reads again within 60 s or on window focus | `FE/lib/today/use-today.test.tsx:100-122`; `today.test.tsx:210-211` | ✅ |
| HOJE-72 | Empty cards and a `Criar lista` link | `pending-card.test.tsx:168`; `today.test.tsx:236` - `href '/lists?new=1'` | ✅ |
| HOJE-73 | Keeps the last data; `Não foi possível atualizar` + `Tentar de novo` | `use-today.test.tsx:132-133`; `today.test.tsx:225-230` | ✅ |

**Status**: ❌ 1 AC not met as written (HOJE-22), plus 1 unspecified destructive side effect (HOJE-61) and 3 spec-precision gaps (HOJE-17/20, HOJE-49, HOJE-65 atomicity).

---

## Discrimination Sensor

The sensor ran in an isolated scratch: a temporary `git worktree add --detach` at HEAD under the scratchpad, with `node_modules` symlinked from the real worktree. It did not use `git stash`. Each mutant was applied, the related tests were run, and the file was reverted with `git checkout`. Before any mutation, the scratch ran clean: backend 62/62, frontend 169/169.

| # | File:line | Mutation | Killed? | Killed by |
| - | --------- | -------- | ------- | --------- |
| M1 | `backend-node/src/services/today.ts:223` | Pendente: `column = 'today'` → `<> 'done'` | ✅ | 3 tests (`today.test.ts` "leaves out the tasks of the other columns", route close) |
| M2 | `today.ts:251` | Feito hoje: `completed_by_user_id = reader` → `IS NOT NULL` | ✅ | HOJE-40 test, route viewer test |
| M3 | `today.ts:281` | Session clipping: `start_minute` from raw `started_at` instead of the clipped `a` | ✅ | HOJE-68, HOJE-49 |
| M4 | `today.ts:362` | closeDay: the open session is not paused | ✅ | 2 HOJE-62 tests |
| M5 | `today.ts:381` | closeDay: Backlog destination → `this_week` | ✅ | HOJE-61 service + route |
| M6 | `today.ts:358` | closeDay: no outer transaction | ✅ | only the HOJE-65 "nor pauses the open session" assertion (`today.test.ts:876`) |
| M7 | `today.ts:384` | closeDay: `moveTask(db, …)` instead of `tx` | ✅ | 14 tests, but by a crash or lock on the single PGlite connection, not by an atomicity assertion |
| M8 | `frontend/src/lib/today/rules.ts:43-44` | groupPending: `No plano` tried before `Com horário` | ✅ | `rules.test.ts` "fits two groups" |
| M9 | `rules.ts:83` | capacity: ignores what is left of the focused task | ✅ | rules + PendingCard HOJE-30 |
| M10 | `rules.ts:133` | adherence: counts a session of any task | ✅ | `rules.test.ts` "another task at the same time" |
| M11 | `frontend/src/components/today/done-card.tsx:28` | DoneCard: sums every task session | ✅ | HOJE-36 |
| M12 | `rules.ts:84` | capacity: time left not clamped to 0 after the workday | ✅ | rules + PendingCard HOJE-29 |

**Sensor depth**: expanded (12 manual mutations: backend services `today.ts`, frontend `rules.ts`, and one component).
**Sensor outcome**: 12/12 killed, all mutants killed
**Isolation**: the scratch worktree was removed (`git worktree remove --force` + `git worktree prune`). The real tree's `git status --porcelain` matches the empty pre-sensor baseline.

---

## Reported risks checked

**a. HOJE-61/65 atomicity.** `closeDay` opens one `db.transaction` and passes `tx` to `settle`, `endSession`, the validation select, `moveTask` (`today.ts:384`) and `setSchedule` (`today.ts:386`). Their inner `db.transaction` calls become savepoints, so the implementation is atomic by construction. No test proves it under a failure in the middle of the moves: the 422 check runs before any move, so the "third of three is invalid" test (`today.test.ts:838`) never reaches a move. The design asked for exactly that test (design.md Risks), and it passes for the wrong reason. M6 (no transaction) was killed only by the pause-rollback assertion. M7 was killed by a connection crash, not by an assertion. → G4.

**b. Recurring occurrence in `Fechar o dia`.** Confirmed by reading the code. `closeDay` calls `setSchedule(…, { on: null })` for `this_week` and `backlog`. In `backend-node/src/services/schedule.ts:92-99`, an open occurrence that loses its day sets `task_series.ended_at = now` and detaches the task (D29). Closing the day with a daily standup sent to `Esta semana` therefore stops the recurrence for good. The spec says `Fechar o dia` moves tasks (HOJE-61; state-transition row "só move tarefas pendentes"). It also calls repeating the close idempotent. Ending a series is a destructive change to another entity that the spec never weighed, and repeating the close cannot undo it. No test covers it. `tomorrow` keeps the series because the day changes but is not cleared. → G1, a violation of the spec's intent.

**c. HOJE-22.** `now-card.tsx:319-321` carries a `SPEC_DEVIATION`. A refused queued focus action toasts `O servidor recusou: <ação>`, because the AD-002 queue keeps only `status` and `code` (`frontend/src/lib/focus/queue.ts:16-19`). The reason holds, but the AC asks for the API message, and the design asked for `extractApiError`. The failed `move` path does show the API message (`now-card.test.tsx:391`). → G2. Either the user accepts the deviation and the spec is amended, or the queue keeps `detail`.

**d. HOJE-17 vs HOJE-20.** `now-card.tsx:233` hides `Abrir foco` while the session is in another workspace (`!elsewhere`). HOJE-17 has no exception for that case, and HOJE-20 only forbids action *buttons*. Hiding the link is a sensible choice, since `/focus/<lista de outro workspace>` would not resolve in the current workspace. Still, the spec does not say so, and no test asserts that the link is absent in that state (`now-card.test.tsx:226` checks buttons only). → G3, a spec-precision gap.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ |
| Surgical changes | ✅ (Home → `/lists` rename plus link updates, all as the design planned) |
| No scope creep | ✅ |
| Matches patterns | ✅ (reuses `settle`, `clippedSessions`, `verdictOf`, `moveTask`, `setSchedule`, `useFocus`) |
| Spec-anchored outcome check | ❌ HOJE-22 asserts a value other than the spec's |
| Per-layer coverage (domain 1:1, routes happy + edge + error) | ✅ (`routes/today.test.ts` covers 200/401/403/404/422, the tokens, 500/501 moves, duplicates) |
| Every test maps to a spec requirement | ✅ |
| Documented guidelines followed: `.specs/STATE.md` ADs (AD-001/002/004/006/007/009), lessons L-044/L-048 | ✅ |

---

## Edge Cases

- [x] HOJE-68 to HOJE-73 are handled and tested (see the table above).
- [ ] A recurring occurrence sent to `Esta semana` or `Backlog` loses its series (G1). This case is not handled.
- [ ] A session shorter than a minute, or one that does not start on a whole minute, is counted in whole wall-clock minutes (G5).

---

## Gate Check

- **Gate command**: Build = `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test && npm --prefix frontend run lint && npm --prefix frontend run typecheck && npm --prefix frontend test && npm --prefix frontend run build && npm --prefix backend-node run build`
- **Outcome**: every step exited 0.
  - backend: 1099 passed, 9 skipped (1108), 79 files passed, 1 skipped
  - frontend: 2132 passed (192 files)
  - both builds OK
- **Known flaky test** (`focus-widget.test.tsx` "a second click on Notes closes…"): it passed on this run, and no rerun was needed.
- **Test count delta**: the diff adds 241 `it(…)` cases and removes 3. The 3 removed are the old `/` home cases, rewritten as the HOJE-01/HOJE-02 cases in the same files, so no assertion was weakened.
- **Skipped tests**: the 9 backend skips are pre-existing and outside the feature's diff.
- **Failures**: none.

---

## Fix Plans

### G1: `Fechar o dia` ends the series of a recurring occurrence (Major)

- **Root cause**: `closeDay` clears the day with `setSchedule(on: null)`, which applies D29 (`schedule.ts:92-99`).
- **Fix task**: decide the rule with the user first. Options:
  - (a) keep the series: move the occurrence without clearing its day, or clear the day without ending the series;
  - (b) keep D29 and warn in the dialog: "Encerra a recorrência";
  - (c) send occurrences only to `Amanhã`.

  Then add a service test: an occurrence sent to `this_week` keeps (or, by decision, loses) `series_id`, and `task_series.ended_at` stays null (or not).
- **Priority**: Major. Data changes silently, and the close cannot be undone.

### G2: HOJE-22 does not show the API message for a refused focus action (Major)

- **Fix task**: either amend HOJE-22 with the user to the action-name toast, or keep `detail` in `FocusConflict` when the queue records a refusal and toast it, with a test asserting the API's `detail`.

### G3: `Abrir foco` while focus is in another workspace (Minor, spec)

- **Fix task**: amend HOJE-17/HOJE-20 to say the link is hidden in that state, and add `expect(queryByRole('link',{name:'Open focus'})).toBeNull()` to the HOJE-20 test.

### G4: HOJE-61/HOJE-65 atomicity is not proven (Minor)

- **Fix task**: add a service test where a move fails after the validation, for example a `moveTask` or `setSchedule` spy that throws on the second call, or a task deleted between the check and the moves. Assert that the first move and the pause are rolled back.

### G5: Focused time counts whole wall-clock minutes (Minor, spec precision)

- **Fix task**: decide whether "ao minuto" allows this drift. If not, send seconds (`start_seconds`/`end_seconds`, or `seconds`) in `DaySession`, and test a session such as 09:00:40–09:01:20 against `overview`.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| HOJE-01 to HOJE-16, HOJE-18 to HOJE-21, HOJE-23 to HOJE-48, HOJE-50 to HOJE-60, HOJE-62 to HOJE-64, HOJE-66 to HOJE-74 | Implementing | ✅ Verified |
| HOJE-22 | Implementing | ❌ Needs Fix / spec decision (G2) |
| HOJE-61 | Implementing | ⚠️ Needs decision (G1) |
| HOJE-17 | Implementing | ⚠️ Spec-precision gap (G3) |
| HOJE-49 | Implementing | ⚠️ Spec-precision gap (G5) |
| HOJE-65 | Implementing | ⚠️ Atomicity not proven (G4) |

The verifier does not edit `spec.md`. The orchestrator applies these statuses after the fixes.

---

## Summary

**Overall**: ❌ Not Ready

**Spec-anchored check**: 74/74 ACs have `file:line` evidence. 68 match the spec's outcome. HOJE-22 is unmet as written. 1 side effect (HOJE-61) and 3 spec-precision gaps (HOJE-17, HOJE-49, HOJE-65) are flagged.
**Sensor**: 12/12 mutations killed.
**Gate**: all green (backend 1099 passed / 9 skipped, frontend 2132 passed, lint, typecheck and builds OK).

**What works**: the day read and its scoping per user and workspace, grouping, capacity, adherence, switches, the timeline, Tomorrow, the close-the-day moves and pause, the summary and copy, refresh, and errors.

**Issues found**: G1 (series ended by the close), G2 (HOJE-22 deviation), G3 to G5 (spec precision and test strength).

**Next steps**: the user decides G1 and G2. Route G1 to G4 as fix tasks, then re-verify (iteration 1 of 3).
