# Dashboard Hoje Validation (round 3) - FAIL ❌

**Verdict**: FAIL ❌ (one Minor gap; round 3 of 3, so it goes to the user)
**Date**: 2026-11-12
**Spec**: `.specs/features/dashboard-hoje/spec.md` (HOJE-01..75)
**Diff range**: whole feature `d2005a9..HEAD` (`b54da12`); this fix round `c05c54c..HEAD` (T30, commit `b54da12`)
**Verifier**: independent sub-agent (author ≠ verifier), round 3 of 3

The round-2 gap G6 is closed. The task in focus now gets its series flag from the day read (`focus_task_series`), and the dialog disables `Esta semana` and `Backlog` for it. The `SPEC_DEVIATION` at `close-day-dialog.tsx:105-107` is gone. The build gate is green, and all 75 ACs have `file:line` evidence that matches the spec outcome.

The verdict is FAIL for one reason: a sensor mutant survived. If `readToday` drops `s.ended_at IS NULL` from the `focus_task_series` query (`backend-node/src/services/today.ts:337`), every test still passes. A probe in scratch shows the effect. When a closed session today was on an occurrence and the open session is on a plain task, the mutant answers `true`. The plain task in focus would then lose `Esta semana` and `Backlog` in the dialog, which breaks HOJE-59 and HOJE-75 for that task. The shipped code is correct. The weak spot is the tests: none has a closed session next to the open one. The fix is one backend test.

---

## Round 2 gap → resolution

| Gap | Round 2 | Resolution | Evidence |
| --- | ------- | ---------- | -------- |
| G6 | HOJE-75 not met for the **task in focus**: unapproved `SPEC_DEVIATION`, hard-coded `series: false` at `frontend/src/components/today/close-day-dialog.tsx:105-107` | ✅ Closed. `readToday` computes `focus_task_series` from the reader's open task session (`backend-node/src/services/today.ts:334-338`, returned at `:358`, typed at `:115-116`). The route schema exposes it (`backend-node/src/routes/today.ts:78`), and so does the client type (`frontend/src/types/index.ts:578-579`). The dialog uses it for the focus row (`close-day-dialog.tsx:105`), and the existing `endsSeries` rule (`:236`) disables the other two destinations. The `SPEC_DEVIATION` comment is removed. | Service: `backend-node/test/services/today.test.ts:819-826` (open session on an occurrence → `toBe(true)`), `:828-832` (plain task → `toBe(false)`), `:834-837` (no session → `toBe(false)`). Route: `backend-node/test/routes/today.test.ts:97-109` (`focus_task_series toBe(true)` over HTTP), `:44` (`false` in the exact owner shape). Dialog: `frontend/src/components/today/close-day-dialog.test.tsx:258-268` (recurring focus task: `Tomorrow` enabled and pressed; `This week`/`Backlog` `toBeDisabled()` with `title 'Would end the recurrence'`), `:270-277` (plain focus task: all three enabled, no `title`) |

**SPEC_DEVIATION grep** (`grep -rn SPEC_DEVIATION backend-node/src frontend/src`): no marker remains on any acceptance criterion of this feature. One marker added by the feature remains: `backend-node/src/services/today.ts:74` (from `0285293`, T1). It records that `DaySession.title` is typed `string | null` instead of the design's `string`, because a break has no name of its own. That is a design-typing note, not an AC deviation, and rounds 1 and 2 accepted it. The other hits (`services/scheduled.ts:9,38`, `routes/lists.ts:113`, `components/plan/block-editor.tsx:86`) are not in `d2005a9..HEAD`.

---

## Task Completion

T1–T30 are marked `[x]` in `tasks.md`. T30 has its own commit (`b54da12`), and its Done-when items are checked (`tasks.md:905-907`). None is blocked or partial.

---

## Spec-Anchored Acceptance Criteria

Paths: `BE` = `backend-node/test`, `FE` = `frontend/src`. The tests render in English (the `en.json` text for the spec's pt-BR copy). Line numbers are those at `b54da12`. ACs whose code and tests did not change in `c05c54c..HEAD` keep the round-2 evidence, re-checked here. T30 added fixture lines, so some citations moved: `FE/pages/today.test.tsx`, `FE/lib/today/use-today.test.tsx` and `FE/App.test.tsx` by +1 line, and the files T30 changed as shown below.

### P1: Ver o dia ao abrir o app

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| HOJE-01 | `/` is the dashboard; `Hoje` is the first sidebar item, marked | `FE/components/app-layout.test.tsx:209-217` - `links[0]` name `'Today'`, `href '/'`, `aria-current 'page'`; `FE/App.test.tsx:86-90` | ✅ |
| HOJE-02 | Grid at `/lists`; `Criar nova lista` → `/lists?new=1` | `FE/App.test.tsx:101-112`; `FE/components/app-layout.test.tsx:194-199` - `href '/lists?new=1'` | ✅ |
| HOJE-03 | Greeting, day in full, time, `4h 40min até o fim do dia (19:00)` | `FE/pages/today.test.tsx:115-118` | ✅ |
| HOJE-04 | `Jornada encerrada às <HH:MM>` after the workday | `FE/pages/today.test.tsx:121-125` | ✅ |
| HOJE-05 | `Planejar amanhã` → `/planejar/<amanhã>` | `FE/pages/today.test.tsx:128-130` - `href '/planejar/2026-11-12'` | ✅ |
| HOJE-06 | Reader's sessions, completions and plan; the workspace's Pendente | `BE/services/today.test.ts:232`, `:449`; `BE/routes/today.test.ts:33-45` (exact shape, now with `focus_task_series: false`), viewer `:111-117` | ✅ |

### P1: Saber o que está acontecendo agora

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| HOJE-07 | `Agora · em foco`, `32min de 1h 30min`, time left and end, 3 buttons | `FE/components/today/now-card.test.tsx:136-142` | ✅ |
| HOJE-08 | No estimate: elapsed only, no bar, no end | `now-card.test.tsx:148-151` | ✅ |
| HOJE-09 | Same focus actions | `now-card.test.tsx:157-175` | ✅ |
| HOJE-10 | `Agora · intervalo`, name, time left, `Encerrar intervalo` | `now-card.test.tsx:195-200` | ✅ |
| HOJE-11 | Dashed 2px suggested block, time, started ago, 3 buttons | `now-card.test.tsx:373-382`; `FE/lib/today/rules.test.ts:137-171` | ✅ |
| HOJE-12 | `Nada planejado para agora`, count + sum, 2 buttons | `now-card.test.tsx:444-450` | ✅ |
| HOJE-13 | `Sem foco há 1h · última sessão: …` / `Nenhuma sessão hoje` | `now-card.test.tsx:468-482` | ✅ |
| HOJE-14 | Move to the top of `Hoje`, then start | `now-card.test.tsx:387-405` - `move(…,{column:'today',before_task_id})`, order `['move','start']` | ✅ |
| HOJE-15 | Picker of Pendente, then start | `FE/components/today/task-picker.test.tsx:48-72`; `now-card.test.tsx:427`, `:459` | ✅ |
| HOJE-16 | `Planejar hoje` → `/planejar/<hoje>` | `now-card.test.tsx:450` | ✅ |
| HOJE-17 | `Abrir foco` → session / suggested block / first Pendente list | `now-card.test.tsx:212`, `:495-505` | ✅ |
| HOJE-18 | No session, suggestion or Pendente → no link | `now-card.test.tsx:514` - `queryByRole('link',{name:'Open focus'})).toBeNull()` | ✅ |
| HOJE-19 | The title links to the same place | `now-card.test.tsx:212` | ✅ |
| HOJE-20 | `Em foco em outro workspace: <nome>`, no buttons, no `Abrir foco` | `now-card.test.tsx:229-231` | ✅ |
| HOJE-21 | A viewer sees no action button | `now-card.test.tsx:235-245`, `:518-525` | ✅ |
| HOJE-22 | The API message in a toast; the card returns to the server state | `now-card.test.tsx:300-301` - `toast.error('The task is already done')`; `:275`; `FE/lib/focus/queue.test.ts:167` | ✅ |
| HOJE-74 | `Estimativa esgotada`, time spent, Estender/Concluir | `now-card.test.tsx:181-188` | ✅ |

### P1: Ver o que falta e se cabe

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| HOJE-23 | Hoje column, active lists, minus the open task; `5 tarefas · 4h 58min estimadas` | `BE/services/today.test.ts:232-300`; `FE/components/today/pending-card.test.tsx:66-68` | ✅ |
| HOJE-24 | 1px border, 8px corners, dot, meta, pill / `Sem estimativa` | `FE/components/today/task-tile.test.tsx:14-27`; `pending-card.test.tsx:110` | ✅ |
| HOJE-25 | First matching group in order; empty groups hidden | `FE/lib/today/rules.test.ts:30-86`; `pending-card.test.tsx:72-84` | ✅ |
| HOJE-26 | Count per group; order by start, then position | `pending-card.test.tsx:72`, `:88-94`; `rules.test.ts:90-98` | ✅ |
| HOJE-27 | `13:00 · passou há 1h 20min` in amber, amber border | `pending-card.test.tsx:98-101`; `task-tile.test.tsx:36` | ✅ |
| HOJE-28 | `há N dias` | `BE/services/today.test.ts:232`; `pending-card.test.tsx:105-106` - `'3 days ago'` | ✅ |
| HOJE-29 | Estimates + focus remainder vs time to the end (0 after) | `rules.test.ts:102-122`; `pending-card.test.tsx:117`, `:134` | ✅ |
| HOJE-30 | Amber, `Não cabe no dia: sobram <diff> de tarefa`, hatched | `pending-card.test.tsx:120-123` | ✅ |
| HOJE-31 | `Cabe no dia: <diff> livre`, no alert color | `pending-card.test.tsx:127-130` | ✅ |
| HOJE-32 | `N sem estimativa, contadas como 0` | `pending-card.test.tsx:139-140`; `rules.test.ts:133` | ✅ |
| HOJE-33 | Opens the task panel | `pending-card.test.tsx:151-154` | ✅ |
| HOJE-34 | `Nada pendente para hoje` | `pending-card.test.tsx:158-161` | ✅ |

### P1: Ver o que já foi feito

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| HOJE-35 | The reader's completions today, newest first | `BE/services/today.test.ts:662-700`; `FE/components/today/done-card.test.tsx:80` | ✅ |
| HOJE-36 | `3h 22min em 4 tarefas` | `done-card.test.tsx:74` | ✅ |
| HOJE-37 | Gray card, done icon, `<lista> · <tempo> de <estimativa>`, badge colors | `done-card.test.tsx:90-96`; `task-tile.test.tsx:47-70` | ✅ |
| HOJE-38 | No estimate: time only, no badge | `done-card.test.tsx:100-102`; `BE/services/today.test.ts:713` | ✅ |
| HOJE-39 | `Nada concluído hoje ainda` | `done-card.test.tsx:108` | ✅ |
| HOJE-40 | Another member's or yesterday's completion is left out | `BE/services/today.test.ts:681`, `:687` | ✅ |

### P2: Plano × real, números, Amanhã

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| HOJE-42 | Plan and Actual rows on the same scale | `FE/components/today/plan-vs-real.test.tsx:64-68` | ✅ |
| HOJE-43 | Whole hour before the earliest to whole hour after the latest; one tick per hour | `plan-vs-real.test.tsx:75-103`; `rules.test.ts:241-253` | ✅ |
| HOJE-44 | Dashed blocks, solid sessions with white text, gray breaks | `plan-vs-real.test.tsx:110-132` | ✅ |
| HOJE-45 | Open session to now; `agora` line | `plan-vs-real.test.tsx:140-144` | ✅ |
| HOJE-46 | Hover: title, start–end | `plan-vs-real.test.tsx:151-158` | ✅ |
| HOJE-47 | `Sem plano para hoje` + link | `plan-vs-real.test.tsx:165-172` | ✅ |
| HOJE-48 | Horizontal scroll inside the card | `plan-vs-real.test.tsx:177` - `overflow-x-auto`, `min-w-[720px]` | ✅ (classes only, jsdom) |
| HOJE-49 | Reports total for today, seconds summed and truncated once; `intervalos` | `BE/services/today.test.ts:616-617` - `toBe(59*60)`; `BE/routes/today.test.ts:81-95`; `FE/components/today/day-stats.test.tsx:78` - `'59min'`; `close-day-dialog.test.tsx:148-153`; `day-stats.test.tsx:64-65` | ✅ |
| HOJE-50 | `<feitas> de <planejadas> no plano`; segment colors | `day-stats.test.tsx:81-92` | ✅ |
| HOJE-51 | No plan: Feito hoje count + `sem plano hoje` | `day-stats.test.tsx:95-100` | ✅ |
| HOJE-52 | Adherence %; `—` + `sem blocos até agora` | `rules.test.ts:191-216`; `day-stats.test.tsx:104-112` | ✅ |
| HOJE-53 | Switches (A,B,A → 2), average session | `rules.test.ts:220-237`; `day-stats.test.tsx:116-120` | ✅ |
| HOJE-54 | Tomorrow in full; timed first; `<lista> · <HH:MM> · recorrente\|agendada` | `BE/services/today.test.ts:743-784`; `FE/components/today/tomorrow-card.test.tsx:47-70` | ✅ |
| HOJE-55 | `N tarefas em Esta semana sem dia` | `BE/services/today.test.ts:787`; `tomorrow-card.test.tsx:73-81` | ✅ |
| HOJE-56 | `Amanhã ainda não tem plano` / `Plano de amanhã: N blocos`, button | `BE/services/today.test.ts:799`, `:811`; `tomorrow-card.test.tsx:84-100` | ✅ |
| HOJE-57 | `Nada marcado para amanhã` | `tomorrow-card.test.tsx:103-112` | ✅ |

### P3: Fechar o dia (rows re-checked: T30 touched the dialog and the day read)

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| HOJE-41 | Button beside Planejar amanhã; dialog with the day, time, Focado, Concluídas, Aderência, No prazo | `FE/pages/today.test.tsx:184-193`; `FE/components/today/close-day-dialog.test.tsx:136-146` | ✅ |
| HOJE-58 | Focused time by list, stacked bar + legend | `close-day-dialog.test.tsx:156-166` | ✅ |
| HOJE-59 | Pendente + the task in focus, each starting at `Amanhã`, with the three-way selector | `close-day-dialog.test.tsx:168-174`; `:270-277` (plain focus task: `Tomorrow`, `This week`, `Backlog` all `toBeEnabled()`); `FE/pages/today.test.tsx:184-193` | ✅ (but see G7: the backend flag for a plain focus task is not pinned against a closed series session) |
| HOJE-60 | `Adiada N dias seguidos` from 3 days | `close-day-dialog.test.tsx:176-181` | ✅ |
| HOJE-61 | One write; tomorrow → `this_week` + tomorrow, no time; this_week/backlog without a day; a failure in the middle rolls back the earlier moves | `BE/services/today.test.ts:850-867` (destinations), `:878` (D21), `:1001-1025` (failure on the 3rd `setSchedule`, `toEqual(before)`); `close-day-dialog.test.tsx:194-210` | ✅ |
| HOJE-75 | Occurrence: the dialog offers only `Amanhã`, the others disabled with `Encerraria a recorrência`; the server answers 422 `close_series_needs_tomorrow` for this_week/backlog and moves nothing | Server: `BE/services/today.test.ts:971-991` (one test per destination: `statusCode 422`, `code`, `toEqual(before)`, series `endedAt` null), `:993-998` (tomorrow keeps the series), `:261-268` (`series` flag on Pendente), `:819-837` (`focus_task_series` true/false/false); `BE/routes/today.test.ts:97-109`, `:210-221`. Dialog: pending occurrence `close-day-dialog.test.tsx:237-256`; **task in focus that is an occurrence `:258-268`** (`toBeDisabled()`, `title 'Would end the recurrence'`, `pressed` = `'Tomorrow'`); plain task in focus `:270-277`; 422 keeps the dialog open `:279-288` | ✅ (G6 closed; see G7 for a weak test) |
| HOJE-62 | Pause the open session before moving | `BE/services/today.test.ts:887-903` | ✅ |
| HOJE-63 | Markdown summary, note at the end | `FE/lib/today/summary.test.ts:32-34`; `close-day-dialog.test.tsx:183-192` | ✅ |
| HOJE-64 | Copy + `Resumo copiado` | `close-day-dialog.test.tsx:194-221` | ✅ |
| HOJE-65 | Error, nothing moved, the dialog keeps the choices | `BE/services/today.test.ts:913-951`, `:1001-1025`; `close-day-dialog.test.tsx:223-235` | ✅ |
| HOJE-66 | Closes anyway; `Não foi possível copiar o resumo` + `Copiar de novo` | `close-day-dialog.test.tsx:290-305` | ✅ |
| HOJE-67 | Viewer: no button (403 on the route) | `FE/pages/today.test.tsx:195-200`; `BE/routes/today.test.ts:159-164` | ✅ |

### Edge cases

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| HOJE-68 | 23:30–00:30 counts as 00:00–00:30 (instants too) | `BE/services/today.test.ts:566-582` | ✅ |
| HOJE-69 | A new timezone gives a new day on the next read | `BE/services/today.test.ts:215-224` | ✅ |
| HOJE-70 | Switch to the new day at midnight | `FE/lib/today/use-now-minute.test.tsx:65-78` | ✅ |
| HOJE-71 | Re-read within 60 s or on focus | `FE/lib/today/use-today.test.tsx:95-123`; `FE/pages/today.test.tsx:202-213` | ✅ |
| HOJE-72 | Empty cards + `Criar lista` | `pending-card.test.tsx:166-168`; `FE/pages/today.test.tsx:234-237` | ✅ |
| HOJE-73 | Keep the last data; `Não foi possível atualizar` + `Tentar de novo` | `use-today.test.tsx:126-134`; `FE/pages/today.test.tsx:215-232` | ✅ |

**Status**: 75/75 ACs have `file:line` evidence that matches the spec outcome. There are no spec-precision gaps. One test is weak (G7, from the sensor): the backend never checks that `focus_task_series` describes the *open* session.

---

## Discrimination Sensor

The sensor ran in an isolated scratch: `git worktree add --detach <scratchpad>/sensor HEAD`, with `node_modules` symlinked from the real tree. It never used `git stash`. Before any mutation, the scratch passed the targeted suites: backend `test/services/today.test.ts` + `test/routes/today.test.ts` 74/74, and frontend `close-day-dialog.test.tsx` 15/15. A script applied each mutant (it asserts exactly one match). The tests ran: the backend files filtered to `focus_task_series|HOJE-06|owner's day`, and the whole dialog file. Then `git checkout --` reverted the mutant. All mutants target T30.

| # | File:line | Mutation | Killed? | Killed by |
| - | --------- | -------- | ------- | --------- |
| B1 | `backend-node/src/services/today.ts:358` | `focus_task_series` forced `false` | ✅ | service `:819` (true for an occurrence), route `:97` |
| B2 | `today.ts:358` | `focus_task_series` forced `true` | ✅ | service `:828` (plain → false), `:834` (no session → false), route `:33` (exact shape) |
| B3 | `today.ts:337` | session kind ignored (drop `s.kind = 'task'`) | ⚪ Survived (equivalent) | A break always has `task_id` null (`backend-node/src/services/focus.ts:321-322`), so the inner `JOIN tasks` already drops it. No reachable state tells the two apart, and the test helper derives `kind` from `taskId` (`BE/services/today.test.ts:139`). No fix task. |
| B4 | `today.ts:337` | "open" ignored (drop `s.ended_at IS NULL`) | ❌ **Survived** | No test has a closed session. A scratch probe (closed session today on an occurrence, then an open session on a plain task, expecting `false`) passes on the real code and fails on B4, so the fault is visible: the plain task in focus would lose `Esta semana`/`Backlog` (HOJE-59). → **G7** |
| B5 | `today.ts:337` | reader ignored (drop `s.user_id = …`) | ✅ | route `:97` |
| F1 | `frontend/src/components/today/close-day-dialog.tsx:105` | the dialog ignores the flag (`series: false`, the round-2 code) | ✅ | dialog `:258` |
| F2 | `close-day-dialog.tsx:236` | only `Backlog` disabled for a series (`to === 'backlog'`) | ✅ | dialog `:237`, `:258` |
| F3 | `close-day-dialog.tsx:105` | the focus task is always a series (`series: true`) | ✅ | dialog `:270` |

**Sensor depth**: expanded (8 manual mutations over T30: the flag value both ways, each WHERE condition of the query, and the dialog's use of the flag and its disabling rule).
**Sensor outcome**: 6/8 killed. 1 survivor is equivalent (B3). 1 real survivor (B4), now G7.
**Isolation**: the scratch worktree was removed (`git worktree remove --force` + `git worktree prune`), and `git worktree list` no longer shows it. The real tree's `git status --porcelain` matches the pre-sensor baseline (empty).

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ (one query, one field, a one-line dialog change) |
| Surgical changes | ✅ (the other `+1` lines in `App.test.tsx`, `admin-route.test.tsx`, `use-today.test.tsx` and `pages/today.test.tsx` only add the new required field to `TodayRead` fixtures) |
| No scope creep | ✅ |
| Matches patterns | ✅ (`rows<T>` + `sql`, a zod field on the route schema, the existing `endsSeries` rule) |
| Spec-anchored outcome check | ✅ |
| Per-layer coverage (domain 1:1, routes happy + edge + error) | ⚠️ The service covers true, false and none for the flag, but not "closed session ≠ open" (G7) |
| Every test maps to a spec requirement | ✅ |
| Documented guidelines followed: `.specs/STATE.md` ADs, lessons L-044/L-048 (L-048 applied: plain task beside the occurrence, in the dialog) | ✅ |

---

## Edge Cases

- [x] HOJE-68 to HOJE-73 are handled and tested.
- [x] A pending occurrence and a task in focus that is an occurrence both get only `Amanhã` in the dialog, and the server refuses the other two.
- [x] The task in focus in another workspace is not listed in the dialog. `focusTask` needs the session's list among this workspace's lists (`frontend/src/pages/today.tsx:72-76`), so a flag computed across workspaces cannot reach a row.
- [ ] Earlier closed sessions today next to the open one: correct in the code, but no test guards it (G7).

---

## Gate Check

- **Gate command**: Build = `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test && npm --prefix frontend run lint && npm --prefix frontend run typecheck && npm --prefix frontend test && npm --prefix frontend run build && npm --prefix backend-node run build`
- **Outcome**: exit 0 on the first run.
  - backend: 1111 passed, 9 skipped (1120); 79 files passed, 1 skipped
  - frontend: 2141 passed (192 files)
  - lint, typecheck and both builds OK
- **Known flaky test** (`focus-widget.test.tsx` "a second click on Notes closes…"): it passed, so no rerun was needed.
- **Test count delta vs round 2**: backend 1107 → 1111 (+4: three service tests and one route test), frontend 2139 → 2141 (+2 dialog tests). No test was removed or weakened. The route's exact-shape assertion gained a field, which makes it stricter.
- **Skipped tests**: the 9 backend skips are pre-existing and outside the feature.
- **Failures**: none.

---

## Fix Plans

### G7: `focus_task_series` is not pinned to the open session (Minor; surviving mutant B4)

- **Root cause**: the T30 service tests cover an open session on an occurrence, an open session on a plain task, and no session. None has a closed session, so the `s.ended_at IS NULL` condition at `backend-node/src/services/today.ts:337` is untested.
- **Fix task**: add one service test to `backend-node/test/services/today.test.ts` in `readToday: the task in focus for Fechar o dia`. Set up a closed session today (for example 09:00–09:30) on an occurrence of a series, then an open session on a plain task. Expect `focus_task_series` `toBe(false)`. (The same test with the plain task closed and the occurrence open, expecting `true`, would also pin the row choice.) No production code changes. Run the Full gate.
- **Priority**: Minor. The shipped behavior is correct; only a regression would go unseen.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| HOJE-01 to HOJE-74 | Implementing | ✅ Verified |
| HOJE-75 | ❌ Needs fix (G6) | ✅ Verified (behavior); G7 strengthens its backend test |

The verifier does not edit `spec.md`. The orchestrator applies these statuses.

---

## Summary

**Overall**: ❌ Not Ready (one Minor test gap). This was the last of 3 rounds, so it goes to the user.

**Spec-anchored check**: 75/75 ACs match the spec outcome with `file:line` evidence; 0 spec-precision gaps.
**Sensor**: 8 injected, 6 killed, 1 equivalent (B3), 1 survived (B4 → G7).
**Gate**: all green (backend 1111 passed / 9 skipped, frontend 2141 passed, lint, typecheck and builds OK).

**What works**: G6 is closed end to end (service, route, type, dialog). The `SPEC_DEVIATION` on HOJE-75 is gone, and the dialog tests cover both the recurring and the plain task in focus.

**Issues found**: G7. No test fails if the `focus_task_series` query stops requiring an open session.

**Next steps**: the user decides whether to add the one-test fix (G7) and accept without another round, or to accept the feature as is.
