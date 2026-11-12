# Dashboard Hoje Validation (final) - FAIL ❌

**Verdict**: FAIL ❌ (one Minor test gap, G8; this was the approved extra round after round 3, so it goes to the user)
**Date**: 2026-11-12
**Spec**: `.specs/features/dashboard-hoje/spec.md` (HOJE-01..75)
**Diff range**: whole feature `d2005a9..HEAD` (`e374343`); this fix round `d561248..HEAD` (T31, commit `e374343`, test and `tasks.md` only; `git diff d561248..HEAD --stat` shows no production file)
**Verifier**: independent sub-agent (author ≠ verifier), final confirmation round

G7 is closed. The T31 test (`backend-node/test/services/today.test.ts:839-848`) kills mutant B4 deterministically: 10 of 10 runs fail on it. The build gate is green on the first run, and all 75 ACs have `file:line` evidence that matches the spec outcome.

The verdict is FAIL because a sensor mutant survives. If the `focus_task_series` query drops the reader filter `s.user_id = ${actor.userId}` (`backend-node/src/services/today.ts:337`), the whole backend suite still passes (1112 passed, 9 skipped). The fault is visible to users. Say another member has an open session on an occurrence and the reader has an open session on a plain task. The mutant query then returns two rows with no `ORDER BY`, and `[focus]` can take the other member's row and answer `true`. The reader's plain task in focus would then lose `Esta semana` and `Backlog` in the dialog, which breaks HOJE-59 and HOJE-75. A scratch probe of that exact state failed on the mutant in 2 of 6 runs, because the row order varies, and passed on the real code in all runs. The shipped code is correct. The weak spot is the tests: the only test with another member's open session is in `closeDay` (`:916`), not in the `readToday` flag tests.

Round 3 recorded B5 as killed by the route test `backend-node/test/routes/today.test.ts:97`. That test has only the owner's session, so it cannot tell the two queries apart. Re-run here, B5 survives the two targeted files (75/75) and the full backend suite.

---

## Round 3 gap → resolution

| Gap | Round 3 | Resolution | Evidence |
| --- | ------- | ---------- | -------- |
| G7 | Surviving mutant B4: drop `s.ended_at IS NULL` from the `focus_task_series` query (`backend-node/src/services/today.ts:337`); no test had a closed session | ✅ Closed by T31 (`e374343`). The new service test sets a closed session today (09:00–09:15) on an occurrence of a series, then an open session on a plain task, and expects `focus_task_series` `toBe(false)`. That is the spec outcome: a plain task in focus keeps all three destinations (HOJE-59), and only an occurrence is limited to `Amanhã` (HOJE-75). No production code changed. | `backend-node/test/services/today.test.ts:839-848`, assertion `:847` - `expect((await readToday(db, actor(), NOW)).focus_task_series).toBe(false)`. Sensor: B4 fails this test in 10/10 runs. The kill is deterministic because the user filter stays, so the reader's sessions come back in `ix_focus_sessions_user_started` / insertion order, and the closed 09:00 session comes first. |

---

## Task Completion

T1–T31 are marked `[x]` in `tasks.md`. T31 has its own commit (`e374343`), and its Done-when items are checked (`tasks.md` T31 section). None is blocked or partial.

---

## Spec-Anchored Acceptance Criteria

Paths: `BE` = `backend-node/test`, `FE` = `frontend/src`. The tests render in English (the `en.json` text for the spec's pt-BR copy). Rows carry over from round 3. T31 added 11 lines after `BE/services/today.test.ts:838`, so the service citations after that line moved by +11. They were re-checked against `e374343`. No other test file changed.

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

### P3: Fechar o dia (service-test citations after line 838 moved +11 with the T31 test)

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| HOJE-41 | Button beside Planejar amanhã; dialog with the day, time, Focado, Concluídas, Aderência, No prazo | `FE/pages/today.test.tsx:184-193`; `FE/components/today/close-day-dialog.test.tsx:136-146` | ✅ |
| HOJE-58 | Focused time by list, stacked bar + legend | `close-day-dialog.test.tsx:156-166` | ✅ |
| HOJE-59 | Pendente + the task in focus, each starting at `Amanhã`, with the three-way selector | `close-day-dialog.test.tsx:168-174`; `:270-277` (plain focus task: `Tomorrow`, `This week`, `Backlog` all `toBeEnabled()`); `FE/pages/today.test.tsx:184-193`; backend flag for a plain focus task: `BE/services/today.test.ts:828-832`, `:839-848` (closed session today on an occurrence + open session on a plain task → `focus_task_series` `toBe(false)` at `:847`) | ✅ (G7 closed; see G8: another member's open session is not pinned) |
| HOJE-60 | `Adiada N dias seguidos` from 3 days | `close-day-dialog.test.tsx:176-181` | ✅ |
| HOJE-61 | One write; tomorrow → `this_week` + tomorrow, no time; this_week/backlog without a day; a failure in the middle rolls back the earlier moves | `BE/services/today.test.ts:850-867` (destinations), `:889` (D21), `:1012-1036` (failure on the 3rd `setSchedule`, `toEqual(before)`); `close-day-dialog.test.tsx:194-210` | ✅ |
| HOJE-75 | Occurrence: the dialog offers only `Amanhã`, the others disabled with `Encerraria a recorrência`; the server answers 422 `close_series_needs_tomorrow` for this_week/backlog and moves nothing | Server: `BE/services/today.test.ts:982-1002` (one test per destination: `statusCode 422`, `code`, `toEqual(before)`, series `endedAt` null), `:1004-1009` (tomorrow keeps the series), `:261-268` (`series` flag on Pendente), `:819-826` (open session on an occurrence → `focus_task_series` `toBe(true)`), `:828-832` (plain → `false`), `:834-837` (no session → `false`), **`:839-848` (T31: closed session today on an occurrence beside an open session on a plain task → `expect(...focus_task_series).toBe(false)` at `:847`)**; `BE/routes/today.test.ts:97-109`, `:210-221`. Dialog: pending occurrence `close-day-dialog.test.tsx:237-256`; task in focus that is an occurrence `:258-268` (`toBeDisabled()`, `title 'Would end the recurrence'`, `pressed` = `'Tomorrow'`); plain task in focus `:270-277`; 422 keeps the dialog open `:279-288` | ✅ (G7 closed by T31; G8 open: the reader filter of the flag is not pinned) |
| HOJE-62 | Pause the open session before moving | `BE/services/today.test.ts:898-914` | ✅ |
| HOJE-63 | Markdown summary, note at the end | `FE/lib/today/summary.test.ts:32-34`; `close-day-dialog.test.tsx:183-192` | ✅ |
| HOJE-64 | Copy + `Resumo copiado` | `close-day-dialog.test.tsx:194-221` | ✅ |
| HOJE-65 | Error, nothing moved, the dialog keeps the choices | `BE/services/today.test.ts:913-951`, `:1012-1036`; `close-day-dialog.test.tsx:223-235` | ✅ |
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

**Status**: 75/75 ACs have `file:line` evidence that matches the spec outcome. There are no spec-precision gaps. One test gap remains (G8, from the sensor): no test has another member's open session beside the reader's, so the reader filter of `focus_task_series` is not pinned.

---

## Discrimination Sensor

The sensor ran in an isolated scratch: `git worktree add --detach <scratchpad>/sensor HEAD`, with `backend-node/node_modules` symlinked from the real tree. It never used `git stash`. The real tree's `git status --porcelain` baseline was empty. Before any mutation, the scratch passed `test/services/today.test.ts` + `test/routes/today.test.ts` 75/75. A script applied each mutant (it asserts exactly one match), the two files ran, and `git checkout --` reverted the mutant. Probes went into a copy of the test file in the scratch only.

| # | File:line | Mutation | Killed? | Killed by |
| - | --------- | -------- | ------- | --------- |
| B4 | `backend-node/src/services/today.ts:337` | "open" ignored (drop `s.ended_at IS NULL`) | ✅ Killed (10/10 runs) | T31 `BE/services/today.test.ts:839-848` |
| B1 | `today.ts:358` | `focus_task_series` forced `false` | ✅ Killed | service `:819-826`, route `BE/routes/today.test.ts:97-109` |
| B2 | `today.ts:358` | `focus_task_series` forced `true` | ✅ Killed | service `:828-832`, `:834-837`, `:839-848`; route `:33-45` (exact shape) |
| B5 | `today.ts:337` | reader ignored (drop `s.user_id = ${actor.userId}`) | ❌ **Survived** | Nothing. The targeted files pass 75/75 and the full backend suite passes 1112/9 skipped. Probe (another member's open session on an occurrence, then the reader's open session on a plain task, expect `false`): fails on B5 in 2 of 6 runs, passes on the real code in 3 of 3. → **G8** |

Carried over from round 3, not re-run because their code did not change: B3 (drop `s.kind = 'task'`) is equivalent, because a break always has `task_id` null and the inner `JOIN tasks` drops it. F1–F3 (the dialog's use of the flag and its disabling rule, `frontend/src/components/today/close-day-dialog.tsx:105`, `:236`) were killed.

**Sensor depth**: targeted (the four mutants the round asked for over T30/T31, plus a probe for the survivor). B4 was repeated 10 times and the B5 probe 6 times, because the mutated query has no `ORDER BY`.
**Sensor outcome**: 3/4 killed (B4, B1, B2). 1 real survivor (B5 → G8).
**Isolation**: the scratch worktree was removed (`git worktree remove --force` + `git worktree prune`), and `git worktree list` no longer shows it. The real tree's `git status --porcelain` matches the baseline (empty), and `backend-node/node_modules` is intact.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ (T31 adds one test and its task entry, with no production change) |
| Surgical changes | ✅ |
| No scope creep | ✅ |
| Matches patterns | ✅ (the file's own `task`, `session` and `taskSeries` fixtures) |
| Spec-anchored outcome check | ✅ (`:847` asserts the spec outcome for a plain task in focus: `false`, so all destinations stay) |
| Per-layer coverage (domain 1:1, routes happy + edge + error) | ⚠️ The flag's open-only filter is now pinned; its reader filter is not (G8) |
| Every test maps to a spec requirement | ✅ (T31 → HOJE-59/HOJE-75) |
| Documented guidelines followed: `.specs/STATE.md` ADs, lessons L-048/L-073 | ⚠️ L-048 ("a different item in the same state") was applied to the closed session but not to another member's open session |

---

## Edge Cases

- [x] HOJE-68 to HOJE-73 are handled and tested.
- [x] A pending occurrence and a task in focus that is an occurrence both get only `Amanhã` in the dialog, and the server refuses the other two.
- [x] Earlier closed sessions today next to the open one: pinned by T31 (`BE/services/today.test.ts:839-848`).
- [ ] Another member's open session on an occurrence next to the reader's open session on a plain task: correct in the code, but no test guards it (G8).

---

## Gate Check

- **Gate command**: Build = `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test && npm --prefix frontend run lint && npm --prefix frontend run typecheck && npm --prefix frontend test && npm --prefix frontend run build && npm --prefix backend-node run build`
- **Outcome**: exit 0 on the first run.
  - backend: 1112 passed, 9 skipped (1121); 79 files passed, 1 skipped
  - frontend: 2141 passed (192 files)
  - lint, typecheck and both builds OK
- **Known flaky test** (`focus-widget.test.tsx` "a second click on Notes closes…"): it passed, so no rerun was needed.
- **Test count delta vs round 3**: backend 1111 → 1112 (+1, the T31 test); frontend 2141 → 2141. No test was removed or weakened.
- **Skipped tests**: the 9 backend skips are pre-existing and outside the feature.
- **Failures**: none.

---

## Fix Plans

### G8: `focus_task_series` is not pinned to the reader (Minor; surviving mutant B5)

- **Root cause**: the `readToday` flag tests (`BE/services/today.test.ts:819-848`) only have the reader's sessions. None has another member's open session, so the `s.user_id = ${actor.userId}` condition at `backend-node/src/services/today.ts:337` is untested. The query also has no `ORDER BY`, so with the filter gone the wrong row is picked only some of the time.
- **Fix task**: add one service test to `readToday: the task in focus for Fechar o dia`. Set up another member's (`otherUserId`) open session on an occurrence of a series, then the reader's open session on a plain task, and expect `focus_task_series` `toBe(false)`. Because the mutant's row order varies, the test should not depend on it. Add the mirror case too: the reader's session on the occurrence and the other member's on a plain task, expecting `true`. One of the two always fails on B5 whatever row comes first. No production code changes. Run the Full gate, then confirm B5 fails in repeated runs.
- **Priority**: Minor. The shipped behavior is correct; only a regression would go unseen.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| HOJE-01 to HOJE-74 | Implementing | ✅ Verified |
| HOJE-75 | ✅ Verified (behavior); G7 open | ✅ Verified (behavior); G7 closed, G8 strengthens its backend test |

The verifier does not edit `spec.md`. The orchestrator applies these statuses.

---

## Summary

**Overall**: ❌ Not Ready (one Minor test gap, G8). The shipped behavior meets all 75 ACs.

**Spec-anchored check**: 75/75 ACs match the spec outcome with `file:line` evidence; 0 spec-precision gaps.
**Sensor**: 4 injected, 3 killed, 1 survived (B5 → G8). B4 (G7) is now killed 10/10.
**Gate**: all green (backend 1112 passed / 9 skipped, frontend 2141 passed, lint, typecheck and builds OK).

**What works**: G7 is closed. T31 pins the flag to the open session with the spec outcome for a plain task in focus.

**Issues found**: G8. No test fails if the `focus_task_series` query stops filtering by the reader. Round 3 wrongly recorded this mutant (B5) as killed.

**Next steps**: the user decides whether to add the two-test fix for G8 or accept the feature as is.
