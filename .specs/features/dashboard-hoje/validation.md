# Dashboard Hoje Validation (final 2) - FAIL ❌

**Verdict**: FAIL ❌ (G8 is not closed: mutant B5 still survives 15 of 32 runs)
**Date**: 2026-11-12
**Spec**: `.specs/features/dashboard-hoje/spec.md` (HOJE-01..75)
**Diff range**: whole feature `d2005a9..HEAD` (`4f919e4`); this fix round `5bf05c4..HEAD` (T32, commit `4f919e4`, test and `tasks.md` only; `git diff 5bf05c4..HEAD --stat` shows no production file)
**Verifier**: independent sub-agent (author ≠ verifier), confirmation round after the G8 fix

The shipped behavior meets all 75 ACs, and the build gate is green on the first run. The two T32 tests assert the spec outcome: a plain task in focus gives `false`, so all three destinations stay (HOJE-59), and an occurrence in focus gives `true`, so only `Amanhã` is offered (HOJE-75).

The verdict is FAIL because the T32 tests do not kill B5 every time. With the reader filter `s.user_id = ${actor.userId}` dropped (`backend-node/src/services/today.ts:337`), the two-file run still passed in 1 of 12 runs, and the two T32 tests alone passed in 6 of 20. Both tests insert the sessions in opposite orders and assume the database returns them in insertion order. It does not. `EXPLAIN` of the mutant query in the scratch shows `Index Scan using ix_focus_sessions_open_user on focus_sessions s`, then a nested loop on `tasks_pkey`. That index is on `user_id`, so the rows come back sorted by user id. `userId` and `otherUserId` are fresh `randomUUID()` values in `beforeEach` (`backend-node/test/services/today.test.ts:79-80`). Each test therefore passes on the mutant whenever the reader's id sorts first, which is 1 time in 2. Both pass together about 1 time in 4, which matches the 6 of 20 measured.

A scratch probe proved the fix: give the other member a fixed id that sorts lowest (`00000000-0000-4000-8000-000000000000`) and insert that member's session first. The probe then failed on B5 in 10 of 10 runs and passed on the real code. With that setup the other member's row comes first under both index order and insertion order.

---

## Previous gap → resolution

| Gap | Previous report | Resolution | Evidence |
| --- | --------------- | ---------- | -------- |
| G7 | Surviving mutant B4 (drop `s.ended_at IS NULL`) | ✅ Still closed. B4 failed in this round's run. | `BE/services/today.test.ts:839-848`, assertion `:847` |
| G8 | Surviving mutant B5 (drop `s.user_id = ${actor.userId}`, `backend-node/src/services/today.ts:337`); no `readToday` flag test had another member's open session | ⚠️ **Partly closed.** T32 (`4f919e4`) adds the right scenario and the right assertions, but B5 survives some runs. The tests rely on insertion order, and the mutant query returns rows in `user_id` order (random UUIDs). | `BE/services/today.test.ts:860-867` (`toBe(false)` at `:866`), `:869-875` (`toBe(true)` at `:874`). B5: 11 of 12 two-file runs killed; T32 pair alone 14 of 20 killed; 17 of 32 kills in total. `EXPLAIN`: `Index Scan using ix_focus_sessions_open_user`. |

---

## Task Completion

T1–T32 are marked `[x]` in `tasks.md`. T32 has its own commit (`4f919e4`). Its first Done-when item ("without the `s.user_id` filter at least one fails in 6 of 6 runs") does not hold: this round measured 17 kills in 32 runs (see Sensor). None is blocked or partial.

---

## Spec-Anchored Acceptance Criteria

Paths: `BE` = `backend-node/test`, `FE` = `frontend/src`. The tests render in English (the `en.json` text for the spec's pt-BR copy). Rows carry over from the previous report. T32 added 27 lines after `BE/services/today.test.ts:848`, so the service citations after that line moved by +27 to +28. They were re-checked against `4f919e4`. No other test file changed (`git diff 5bf05c4..HEAD --stat`: `today.test.ts` and `tasks.md` only).

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

### P3: Fechar o dia (service-test citations re-checked against `4f919e4`)

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| HOJE-41 | Button beside Planejar amanhã; dialog with the day, time, Focado, Concluídas, Aderência, No prazo | `FE/pages/today.test.tsx:184-193`; `FE/components/today/close-day-dialog.test.tsx:136-146` | ✅ |
| HOJE-58 | Focused time by list, stacked bar + legend | `close-day-dialog.test.tsx:156-166` | ✅ |
| HOJE-59 | Pendente + the task in focus, each starting at `Amanhã`, with the three-way selector | `close-day-dialog.test.tsx:168-174`; `:270-277` (plain focus task: `Tomorrow`, `This week`, `Backlog` all `toBeEnabled()`); `FE/pages/today.test.tsx:184-193`; backend flag for a plain focus task: `BE/services/today.test.ts:828-832`, `:839-848` (`:847` `toBe(false)`), T32 `:860-867` (another member's open session on an occurrence beside the reader's on a plain task → `expect(...focus_task_series).toBe(false)` at `:866`) | ✅ (outcome matches the spec; G8 still open: the T32 pair does not kill B5 every run) |
| HOJE-60 | `Adiada N dias seguidos` from 3 days | `close-day-dialog.test.tsx:176-181` | ✅ |
| HOJE-61 | One write; tomorrow → `this_week` + tomorrow, no time; this_week/backlog without a day; a failure in the middle rolls back the earlier moves | `BE/services/today.test.ts:888-906` (destinations), `:916` (D21), `:1039-1063` (failure on the 3rd `setSchedule`, `toEqual(before)`); `close-day-dialog.test.tsx:194-210` | ✅ |
| HOJE-75 | Occurrence: the dialog offers only `Amanhã`, the others disabled with `Encerraria a recorrência`; the server answers 422 `close_series_needs_tomorrow` for this_week/backlog and moves nothing | Server: `BE/services/today.test.ts:1009-1029` (one test per destination: `statusCode 422`, `code`, `toEqual(before)`, series `endedAt` null), `:1031-1037` (tomorrow keeps the series), `:261-268` (`series` flag on Pendente), `:819-826` (open session on an occurrence → `focus_task_series` `toBe(true)`), `:828-832` (plain → `false`), `:834-837` (no session → `false`), `:839-848` (T31, `:847` `toBe(false)`), **T32 `:860-867` (another member's open session on an occurrence beside the reader's on a plain task → `toBe(false)` at `:866`) and `:869-875` (the reader's open session on an occurrence beside another member's on a plain task → `toBe(true)` at `:874`)**; `BE/routes/today.test.ts:97-109`, `:210-221`. Dialog: pending occurrence `close-day-dialog.test.tsx:237-256`; task in focus that is an occurrence `:258-268` (`toBeDisabled()`, `title 'Would end the recurrence'`, `pressed` = `'Tomorrow'`); plain task in focus `:270-277`; 422 keeps the dialog open `:279-288` | ✅ outcome matches the spec (G8 open: the T32 pair kills B5 in only 17 of 32 runs) |
| HOJE-62 | Pause the open session before moving | `BE/services/today.test.ts:925-941`; another member's session untouched `:943` | ✅ |
| HOJE-63 | Markdown summary, note at the end | `FE/lib/today/summary.test.ts:32-34`; `close-day-dialog.test.tsx:183-192` | ✅ |
| HOJE-64 | Copy + `Resumo copiado` | `close-day-dialog.test.tsx:194-221` | ✅ |
| HOJE-65 | Error, nothing moved, the dialog keeps the choices | `BE/services/today.test.ts:951-1007`, `:1039-1063`; `close-day-dialog.test.tsx:223-235` | ✅ |
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

**Status**: 75/75 ACs have `file:line` evidence that matches the spec outcome. There are no spec-precision gaps. One test gap remains (G8): the T32 tests that pin the reader filter of `focus_task_series` kill B5 only some of the time.

---

## Discrimination Sensor

The sensor ran in an isolated scratch: `git worktree add --detach <scratchpad>/sensor HEAD` (`4f919e4`), with `backend-node/node_modules` and `frontend/node_modules` symlinked from the real tree. It never used `git stash`. The real tree's `git status --porcelain` baseline was empty. Before any mutation, the scratch passed `test/services/today.test.ts` + `test/routes/today.test.ts` 77/77. A script applied each mutant (it asserts exactly one match), the tests ran, and `git checkout --` reverted the file. The probes went into the scratch's copy of the test file only.

| # | File:line | Mutation | Killed? | Killed by |
| - | --------- | -------- | ------- | --------- |
| B5 | `backend-node/src/services/today.ts:337` | reader ignored (drop `s.user_id = ${actor.userId}`) | ❌ **Survived 1 of 12** two-file runs (runs 1–5 and 7–12 killed, run 6 passed 77/77). The T32 pair alone (`-t beside`): 14 of 20 killed, 6 survived. | When killed: T32 `:860-867` or `:869-875`, sometimes also `:819-826` and the route test. → **G8 open** |
| B4 | `today.ts:337` | "open" ignored (drop `s.ended_at IS NULL`) | ✅ Killed | T31 `BE/services/today.test.ts:839-848` |
| B1 | `today.ts:358` | `focus_task_series` forced `false` | ✅ Killed (3 tests) | service `:819-826`, `:869-875`; route `BE/routes/today.test.ts:97-109` |
| B2 | `today.ts:358` | `focus_task_series` forced `true` | ✅ Killed (5 tests) | service `:828-832`, `:834-837`, `:839-848`, `:860-867`; route `:33-45` |
| F4 (own) | `frontend/src/components/today/close-day-dialog.tsx:225` | HOJE-60 threshold `days_late >= POSTPONED_FROM` → `>` (a task carried exactly 3 days loses `Adiada 3 dias seguidos`) | ❌ **Survived** (`src/components/today` 113/113) | Nothing. `close-day-dialog.test.tsx:176-181` uses 4 and 2 days only, so the boundary of "3 dias ou mais" is untested. → **G9** |
| Probe | scratch copy of `today.test.ts` | B5 with the other member's id fixed to `00000000-0000-4000-8000-000000000000` and that session inserted first, expect `false` | ✅ Killed 10/10; passes on the real code | Proves the G8 fix |

Carried over, not re-run because their code did not change: B3 (drop `s.kind = 'task'`) is equivalent; F1–F3 (the dialog's use of the flag, `close-day-dialog.tsx:105`, `:236`) were killed.

**Sensor depth**: targeted. B5 ran 32 times in total (12 two-file runs plus 20 runs of the T32 pair), because the mutant query has no `ORDER BY`.
**Sensor outcome**: 3/5 killed (B4, B1, B2). B5 survives intermittently (G8); F4 survives (G9).
**Isolation**: the scratch worktree was removed (`git worktree remove --force` + `git worktree prune`; `git worktree list` no longer shows it). The real tree's `git status --porcelain` matched the empty baseline after cleanup, and both `node_modules` folders are intact. The only later changes to the real tree are this report and the lesson store (`.specs/lessons.json`, `.specs/LESSONS.md`, L-075 and L-076).

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ (T32 adds two tests, a small fixture and its task entry, with no production change) |
| Surgical changes | ✅ |
| No scope creep | ✅ |
| Matches patterns | ✅ (the file's own `task`, `session` and `taskSeries` fixtures) |
| Spec-anchored outcome check | ✅ (`:866` `false` for a plain task in focus, HOJE-59; `:874` `true` for an occurrence in focus, HOJE-75) |
| Per-layer coverage (domain 1:1, routes happy + edge + error) | ⚠️ The flag's reader filter is pinned only some of the time (G8). The HOJE-60 boundary is not tested (G9). |
| Every test maps to a spec requirement | ✅ (T32 → HOJE-59/HOJE-75) |
| Documented guidelines followed: `.specs/STATE.md` ADs, lessons L-048/L-074 | ⚠️ L-074 was applied, but the tests rely on insertion order, which the query does not follow |

---

## Edge Cases

- [x] HOJE-68 to HOJE-73 are handled and tested.
- [x] A pending occurrence and a task in focus that is an occurrence both get only `Amanhã` in the dialog, and the server refuses the other two.
- [x] Earlier closed sessions today next to the open one: pinned by T31 (`BE/services/today.test.ts:839-848`).
- [ ] Another member's open session beside the reader's: the code is correct and T32 covers the scenario, but the kill depends on random UUID order (G8).
- [ ] A task carried exactly 3 days (the HOJE-60 boundary): no test (G9).

---

## Gate Check

- **Gate command**: Build = `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test && npm --prefix frontend run lint && npm --prefix frontend run typecheck && npm --prefix frontend test && npm --prefix frontend run build && npm --prefix backend-node run build`
- **Outcome**: exit 0 on the first run.
  - backend: 1114 passed, 9 skipped (1123); 79 files passed, 1 skipped
  - frontend: 2141 passed (192 files)
  - lint, typecheck and both builds OK
- **Known flaky test** (`focus-widget.test.tsx` "a second click on Notes closes…"): it passed, so no rerun was needed.
- **Test count delta vs the previous report**: backend 1112 → 1114 (+2, the T32 tests); frontend 2141 → 2141. No test was removed or weakened.
- **Skipped tests**: the 9 backend skips are pre-existing and outside the feature.
- **Failures**: none.

---

## Fix Plans

### G8: the T32 tests rely on insertion order (Minor; B5 survives some runs)

- **Root cause**: with the reader filter gone, the planner reads `ix_focus_sessions_open_user`, so the rows come back in `user_id` order. `userId` and `otherUserId` are random per test (`BE/services/today.test.ts:79-80`), so the order of the sessions is random too. Inserting them in opposite orders does not change that.
- **Fix task**: in the two T32 tests (`BE/services/today.test.ts:860-875`), use another member whose id sorts lowest (for example `00000000-0000-4000-8000-000000000000`, added with `member(...)`), and insert that member's session first. The other member's row then comes first under both index order and insertion order, so each test fails on B5 every time. Keep the assertions (`:866` `false`, `:874` `true`). No production code changes. Run the Full gate, then confirm B5 fails in at least 10 of 10 runs of the T32 pair. The scratch probe already showed 10 of 10 for the first test.
- **Priority**: Minor. The shipped behavior is correct; only a regression would sometimes go unseen.

### G9: the HOJE-60 boundary at 3 days is not tested (Minor; F4 survives)

- **Root cause**: `close-day-dialog.test.tsx:176-181` checks 4 days (shown) and 2 days (hidden), so `>=` → `>` at `close-day-dialog.tsx:225` survives. The spec says "3 dias ou mais".
- **Fix task**: in that test (or a new one), give a pending task `days_late: 3` and expect `Postponed 3 days in a row`. Run the Quick gate and confirm F4 fails.
- **Priority**: Minor. The shipped behavior is correct.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| HOJE-01 to HOJE-59, HOJE-61 to HOJE-74 | Implementing | ✅ Verified |
| HOJE-60 | Implementing | ✅ Verified (behavior); G9 adds the 3-day boundary test |
| HOJE-75 | ✅ Verified (behavior); G8 open | ✅ Verified (behavior); G8 still open (its tests kill B5 in 17 of 32 runs) |

The verifier does not edit `spec.md`. The orchestrator applies these statuses.

---

## Summary

**Overall**: ❌ Not Ready (two Minor test gaps, G8 and G9). The shipped behavior meets all 75 ACs.

**Spec-anchored check**: 75/75 ACs match the spec outcome with `file:line` evidence; 0 spec-precision gaps.
**Sensor**: 5 injected, 3 killed (B4, B1, B2), 2 survived: B5 some of the time (G8), F4 every time (G9).
**Gate**: all green (backend 1114 passed / 9 skipped, frontend 2141 passed, lint, typecheck and builds OK).

**What works**: T32 adds the right scenario with the spec outcome. G7 stays closed.

**Issues found**: G8. The T32 tests rely on insertion order, but the mutant query returns rows in random `user_id` order, so B5 survives about 1 run in 4 of the pair. G9. No test covers a task carried exactly 3 days.

**Next steps**: fix G8 with a fixed lowest-sorting id for the other member (the probe killed B5 10/10). Fix G9 with a 3-day case. Re-verify. This is past the 3-iteration bound, so the user decides.

**Lessons recorded**: L-075 (candidate, `surviving_mutant`, source B5): when a test relies on which row an unordered query returns first, fix the sort key the plan uses instead of relying on insertion order. L-076 (candidate, `surviving_mutant`, source F4): when the spec gives a threshold such as N or more, test the value exactly at N.
