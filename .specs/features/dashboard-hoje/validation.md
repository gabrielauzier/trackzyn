# Dashboard Hoje Validation (final 3) - PASS ✅

**Verdict**: PASS ✅ (G8 and G9 are closed; every targeted mutant is killed on every run)
**Date**: 2026-11-12
**Spec**: `.specs/features/dashboard-hoje/spec.md` (HOJE-01..75)
**Diff range**: whole feature `d2005a9..HEAD` (`20eea7b`); this fix round `09963f1..HEAD` (T33 `b2adfe5`, T34 `20eea7b`). `git diff 09963f1..HEAD --stat` lists only `tasks.md`, `backend-node/test/services/today.test.ts` and `frontend/src/components/today/close-day-dialog.test.tsx`: no production file changed.
**Verifier**: independent sub-agent (author ≠ verifier), confirmation round after the G8 and G9 fixes

The shipped behavior meets all 75 ACs, and the build gate is green on the first run. The two fixes are tests only and assert the spec outcome:

- T33 gives the other member a fixed id that sorts lowest (`00000000-0000-4000-8000-000000000000`) and inserts that member's open session first. Without the reader filter, the database now returns the other member's row first under both index order and insertion order. The mutant B5 failed in 40 of 40 runs, and both tests failed in each of them.
- T34 adds a pending task with `days_late: 3` and expects `Postponed 3 days in a row`. F4 (`>=` → `>`) failed in 10 of 10 runs.

---

## Previous gaps → resolution

| Gap | Previous report | Resolution | Evidence |
| --- | --------------- | ---------- | -------- |
| G7 | Surviving mutant B4 (drop `s.ended_at IS NULL`) | ✅ Still closed. B4 failed in this round. | `BE/services/today.test.ts:839-848`, assertion `:847` |
| G8 | B5 (drop `s.user_id = ${actor.userId}`, `backend-node/src/services/today.ts:337`) survived about 1 run in 4, because the open-session index returns rows in `user_id` order and the test ids were random | ✅ **Closed** by T33 (`b2adfe5`). The other member's id is fixed to sort first, and that member's session is inserted first. | `BE/services/today.test.ts:850-853` (comment + `FIRST_USER_ID`), `:862-869` (`member(FIRST_USER_ID, …)` at `:863`, that member's session inserted first at `:866`, `toBe(false)` at `:868`), `:871-878` (`toBe(true)` at `:877`). B5: 20/20 killed with the focus-task block only, 20/20 killed with both today test files; both T33 tests failed in all 40 runs. |
| G9 | F4 (`days_late >= POSTPONED_FROM` → `>`, `frontend/src/components/today/close-day-dialog.tsx:225`) survived; HOJE-60's 3-day boundary had no test | ✅ **Closed** by T34 (`20eea7b`) | `FE/components/today/close-day-dialog.test.tsx:183-186` - `days_late: 3` → `getByText('Postponed 3 days in a row')).toBeInTheDocument()` at `:185`. F4: 10/10 killed, by this test only. |

---

## Task Completion

T1–T34 are marked `[x]` in `tasks.md`; none is blocked or partial. T33 and T34 each have their own commit (`b2adfe5`, `20eea7b`). Their Done-when items hold: this round measured B5 killed in 20 of 20 block runs and 20 of 20 two-file runs (T33 asked for 12/12 and 6/6), and F4 killed in 10 of 10 runs (T34).

---

## Spec-Anchored Acceptance Criteria

Paths: `BE` = `backend-node/test`, `FE` = `frontend/src`. The tests render in English (the `en.json` text for the spec's pt-BR copy). Rows carry over from the previous report; the citations were re-checked against `20eea7b`. T33 added 3 lines to `BE/services/today.test.ts` from line 850, so service citations after that line moved by +2 to +3. T34 added 5 lines after `close-day-dialog.test.tsx:181`, so dialog citations after that line moved by +5. No other test file changed.

### P1: Ver o dia ao abrir o app

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| HOJE-01 | `/` is the dashboard; `Hoje` is the first sidebar item, marked | `FE/components/app-layout.test.tsx:209-217` - `links[0]` name `'Today'`, `href '/'`, `aria-current 'page'`; `FE/App.test.tsx:86-90` | ✅ |
| HOJE-02 | Grid at `/lists`; `Criar nova lista` → `/lists?new=1` | `FE/App.test.tsx:101-112`; `FE/components/app-layout.test.tsx:194-199` - `href '/lists?new=1'` | ✅ |
| HOJE-03 | Greeting, day in full, time, `4h 40min até o fim do dia (19:00)` | `FE/pages/today.test.tsx:115-118` | ✅ |
| HOJE-04 | `Jornada encerrada às <HH:MM>` after the workday | `FE/pages/today.test.tsx:121-125` | ✅ |
| HOJE-05 | `Planejar amanhã` → `/planejar/<amanhã>` | `FE/pages/today.test.tsx:128-130` - `href '/planejar/2026-11-12'` | ✅ |
| HOJE-06 | Reader's sessions, completions and plan; the workspace's Pendente | `BE/services/today.test.ts:232`, `:449`; `BE/routes/today.test.ts:33-45` (exact shape, with `focus_task_series: false`), viewer `:111-117` | ✅ |

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
| HOJE-25 | First matching group in order; empty groups hidden; `Atrasada` needs a start before now | `FE/lib/today/rules.test.ts:30-86` (incl. "a task starting now or later is not late"); `pending-card.test.tsx:72-84` | ✅ |
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
| HOJE-55 | `N tarefas em Esta semana sem dia` | `BE/services/today.test.ts:787-797` - `week_unscheduled` `toBe(2)`; `tomorrow-card.test.tsx:73-81` | ✅ |
| HOJE-56 | `Amanhã ainda não tem plano` / `Plano de amanhã: N blocos`, button | `BE/services/today.test.ts:799`, `:811`; `tomorrow-card.test.tsx:84-100` | ✅ |
| HOJE-57 | `Nada marcado para amanhã` | `tomorrow-card.test.tsx:103-112` | ✅ |

### P3: Fechar o dia (citations re-checked against `20eea7b`)

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| HOJE-41 | Button beside Planejar amanhã; dialog with the day, time, Focado, Concluídas, Aderência, No prazo | `FE/pages/today.test.tsx:184-193`; `FE/components/today/close-day-dialog.test.tsx:136-146` | ✅ |
| HOJE-58 | Focused time by list, stacked bar + legend | `close-day-dialog.test.tsx:156-166` | ✅ |
| HOJE-59 | Pendente + the task in focus, each starting at `Amanhã`, with the three-way selector | `close-day-dialog.test.tsx:168-174`; `:275-282` (plain focus task: `Tomorrow`, `This week`, `Backlog` all `toBeEnabled()`); `FE/pages/today.test.tsx:184-193`; backend flag for a plain focus task: `BE/services/today.test.ts:828-832`, `:839-848` (`:847` `toBe(false)`), **T33 `:862-869`** (another member, whose id sorts first and whose session goes in first, has an open session on an occurrence; the reader's is on a plain task → `focus_task_series` `toBe(false)` at `:868`) | ✅ |
| HOJE-60 | `Adiada N dias seguidos` from 3 days (3 or more) | `close-day-dialog.test.tsx:176-181` (4 days → `'Postponed 4 days in a row'`; 2 days → `queryByText(/Postponed 2 days/)).toBeNull()`); **T34 `:183-186`** (exactly 3 days → `getByText('Postponed 3 days in a row')).toBeInTheDocument()` at `:185`) | ✅ (boundary now pinned; G9 closed) |
| HOJE-61 | One write; tomorrow → `this_week` + tomorrow, no time; this_week/backlog without a day; a failure in the middle rolls back the earlier moves | `BE/services/today.test.ts:891-909` (destinations), `:919` (D21), `:1042-1066` (failure on the 3rd `setSchedule`, `toEqual(before)`); `close-day-dialog.test.tsx:199-215` | ✅ |
| HOJE-75 | Occurrence: the dialog offers only `Amanhã`, the others disabled with `Encerraria a recorrência`; the server answers 422 `close_series_needs_tomorrow` for this_week/backlog and moves nothing | Server: `BE/services/today.test.ts:1012-1032` (one test per destination: `statusCode 422`, `code`, `toEqual(before)`, series `endedAt` null), `:1034-1040` (tomorrow keeps the series), `:261-268` (`series` flag on Pendente), `:819-826` (open session on an occurrence → `focus_task_series` `toBe(true)`), `:828-832` (plain → `false`), `:834-837` (no session → `false`), `:839-848` (T31, `:847` `toBe(false)`), **T33 `:862-869` (`toBe(false)` at `:868`) and `:871-878` (the reader's open session on an occurrence beside the open session of the member whose id sorts first, inserted first, on a plain task → `toBe(true)` at `:877`)**; `BE/routes/today.test.ts:97-109`, `:210-221`. Dialog: pending occurrence `close-day-dialog.test.tsx:242-261`; task in focus that is an occurrence `:263-273` (`toBeDisabled()`, `title 'Would end the recurrence'`, `pressed` = `'Tomorrow'`); plain task in focus `:275-282`; 422 keeps the dialog open `:284-293` | ✅ (reader filter now pinned on every run; G8 closed) |
| HOJE-62 | Pause the open session before moving | `BE/services/today.test.ts:928-944`; another member's session untouched `:946` | ✅ |
| HOJE-63 | Markdown summary, note at the end | `FE/lib/today/summary.test.ts:32-34`; `close-day-dialog.test.tsx:188-197` | ✅ |
| HOJE-64 | Copy + `Resumo copiado` | `close-day-dialog.test.tsx:199-226` | ✅ |
| HOJE-65 | Error, nothing moved, the dialog keeps the choices | `BE/services/today.test.ts:954-1010`, `:1042-1066`; `close-day-dialog.test.tsx:228-240` | ✅ |
| HOJE-66 | Closes anyway; `Não foi possível copiar o resumo` + `Copiar de novo` | `close-day-dialog.test.tsx:295-310` | ✅ |
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

**Status**: ✅ 75/75 ACs have `file:line` evidence that matches the spec outcome. No spec-precision gaps. No open test gap.

---

## Discrimination Sensor

The sensor ran in an isolated scratch: `git worktree add --detach <scratchpad>/sensor HEAD` (`20eea7b`), with `backend-node/node_modules` and `frontend/node_modules` symlinked from the real tree. It never used `git stash`. The real tree's `git status --porcelain` baseline was empty. Before any mutation, the scratch passed `test/services/today.test.ts` + `test/routes/today.test.ts` 77/77. A script applied each mutant (it asserts exactly one match), the tests ran, and `git checkout --` reverted the file.

### Required mutants

| # | File:line | Mutation | Runs | Killed? | Killed by |
| - | --------- | -------- | ---- | ------- | --------- |
| B5 | `backend-node/src/services/today.ts:337` | reader ignored (drop `s.user_id = ${actor.userId}`) | 20 with the focus-task block only (`-t "the task in focus for Fechar o dia"`) + 20 with both today test files | ✅ **Killed 40/40** (block: 2 failed every run; two files: 2 or 3 failed every run) | Both T33 tests (`BE/services/today.test.ts:862-869`, `:871-878`) failed in every one of the 40 runs; sometimes also the route test |
| F4 | `frontend/src/components/today/close-day-dialog.tsx:225` | HOJE-60 threshold `days_late >= POSTPONED_FROM` → `>` | 10 (`close-day-dialog.test.tsx`) | ✅ **Killed 10/10** (1 failed of 16 each run) | T34 `close-day-dialog.test.tsx:183-186` |
| B4 | `today.ts:337` | "open" ignored (drop `s.ended_at IS NULL`) | 1 | ✅ Killed (1 test) | T31 `BE/services/today.test.ts:839-848` |
| B1 | `today.ts:358` | `focus_task_series` forced `false` | 1 | ✅ Killed (3 tests) | service `:819-826`, `:871-878`; route `BE/routes/today.test.ts:97-109` |
| B2 | `today.ts:358` | `focus_task_series` forced `true` | 1 | ✅ Killed (5 tests) | service `:828-832`, `:834-837`, `:839-848`, `:862-869`; route `:33-45` |

### Verifier's own mutants (least-pinned feature code)

The verifier chose `frontend/src/lib/today/rules.ts`, the pure rules behind Pendente grouping, capacity and the timeline scale, because the backend flag had already been mutated heavily. Tests run: `src/lib/today`, `src/components/today`, `src/pages/today.test.tsx` (177 tests).

| # | File:line | Mutation | Killed? | Notes |
| - | --------- | -------- | ------- | ----- |
| M1 | `frontend/src/lib/today/rules.ts:83` | capacity clamp removed: `+ Math.max(0, focusLeftSeconds)` → `+ focusLeftSeconds` | ⚪ Survived, equivalent in the app | The only caller (`frontend/src/pages/today.tsx:77`) passes `display.seconds` only in `countdown` mode, and `deriveDisplay` (`frontend/src/lib/focus/display.ts:20`, `:30`) returns `countdown` only while `nowMs < deadline`, so the value is at least 1. A negative remainder cannot reach `capacity`; the clamp is defensive. No fix task: no reachable behavior differs. |
| M2 | `rules.ts:42` | `Atrasada` boundary `start < nowMinute` → `start <= nowMinute` (HOJE-25: "anterior à hora atual") | ✅ Killed (1 test) | `rules.test.ts` "needs a start before now for Atrasada: a task starting now or later is not late" |
| M3 | `rules.ts:182` | timeline start `Math.floor(min/60)*60` → `Math.round(…)` (HOJE-43: whole hour before the earliest) | ✅ Killed (3 tests) | `plan-vs-real.test.tsx` HOJE-43 ticks; `rules.test.ts` scale tests |

Carried over, not re-run because their code did not change: B3 (drop `s.kind = 'task'`) is equivalent; F1–F3 (the dialog's use of the flag, `close-day-dialog.tsx:105`, `:236`) were killed in an earlier round.

**Sensor depth**: targeted, with repetition for the order-dependent mutant (B5, 40 runs) and the boundary mutant (F4, 10 runs).
**Sensor outcome**: ✅ PASS. 7 behavior-changing mutants, 7 killed on every run (B5, F4, B4, B1, B2, M2, M3). 1 survivor (M1) is equivalent through the only caller.
**Isolation**: the scratch worktree was removed (`git worktree remove --force` + `git worktree prune`; `git worktree list` no longer shows it). The real tree's `git status --porcelain` matched the empty baseline after cleanup, and both `node_modules` folders are intact. The only later change to the real tree is this report.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ (T33 changes two tests' fixtures; T34 adds one test; no production change) |
| Surgical changes | ✅ |
| No scope creep | ✅ |
| Matches patterns | ✅ (the files' own `member`, `session`, `draw` and `pending` fixtures) |
| Spec-anchored outcome check | ✅ (`:868` `false` for a plain task in focus, HOJE-59; `:877` `true` for an occurrence in focus, HOJE-75; `:185` `Postponed 3 days in a row`, HOJE-60) |
| Per-layer coverage (domain 1:1, routes happy + edge + error) | ✅ |
| Every test maps to a spec requirement | ✅ (T33 → HOJE-59/HOJE-75; T34 → HOJE-60) |
| Documented guidelines followed: `.specs/STATE.md` ADs, lessons L-048, L-074, L-075, L-076 | ✅ (T33 applies L-075: it fixes the sort key the plan uses; T34 applies L-076: it tests the value exactly at N) |

---

## Edge Cases

- [x] HOJE-68 to HOJE-73 are handled and tested.
- [x] A pending occurrence and a task in focus that is an occurrence both get only `Amanhã` in the dialog, and the server refuses the other two.
- [x] Earlier closed sessions today next to the open one: pinned by T31 (`BE/services/today.test.ts:839-848`).
- [x] Another member's open session beside the reader's: pinned on every run by T33 (`BE/services/today.test.ts:862-878`).
- [x] A task carried exactly 3 days (the HOJE-60 boundary): pinned by T34 (`close-day-dialog.test.tsx:183-186`).

---

## Gate Check

- **Gate command**: Build = `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test && npm --prefix frontend run lint && npm --prefix frontend run typecheck && npm --prefix frontend test && npm --prefix frontend run build && npm --prefix backend-node run build`
- **Outcome**: exit 0 on the first run.
  - backend: 1114 passed, 9 skipped (1123); 79 files passed, 1 skipped
  - frontend: 2142 passed (192 files)
  - lint, typecheck and both builds OK
- **Known flaky test** (`focus-widget.test.tsx` "a second click on Notes closes…"): it passed, so no rerun was needed.
- **Test count delta vs the previous report**: backend 1114 → 1114 (T33 changed two tests, added none); frontend 2141 → 2142 (+1, T34). No test was removed or weakened; the T33 assertions are unchanged (`toBe(false)`, `toBe(true)`).
- **Skipped tests**: the 9 backend skips are pre-existing and outside the feature.
- **Failures**: none.

---

## Fix Plans

None. G8 and G9 are closed, and no new gap was found.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| HOJE-01 to HOJE-59, HOJE-61 to HOJE-74 | Implementing | ✅ Verified |
| HOJE-60 | ✅ Verified (behavior); G9 open | ✅ Verified (3-day boundary pinned) |
| HOJE-75 | ✅ Verified (behavior); G8 open | ✅ Verified (reader filter pinned on every run) |

The verifier does not edit `spec.md`. The orchestrator applies these statuses.

---

## Summary

**Overall**: ✅ Ready.

**Spec-anchored check**: 75/75 ACs match the spec outcome with `file:line` evidence; 0 spec-precision gaps.
**Sensor**: B5 killed 40/40 (20 block runs + 20 two-file runs), F4 killed 10/10, B4, B1, B2 killed; own mutants M2 and M3 killed, M1 survived as equivalent through the only caller.
**Gate**: all green on the first run (backend 1114 passed / 9 skipped, frontend 2142 passed, lint, typecheck and builds OK).

**What works**: the whole feature against HOJE-01..75. T33 removes the row-order dependency of the reader-filter tests, and T34 pins the HOJE-60 threshold.

**Issues found**: none.

**Next steps**: the orchestrator marks the requirements Verified in `spec.md`. Nothing is committed by the verifier.

**Lessons recorded**: none. This is a clean PASS: the only survivor (M1) is equivalent and is not a grounded failure.
