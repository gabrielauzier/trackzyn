# Dashboard Hoje Validation (round 2) - FAIL ❌

**Verdict**: FAIL ❌
**Date**: 2026-11-11
**Spec**: `.specs/features/dashboard-hoje/spec.md` (amended in `fcf0929`: HOJE-20, HOJE-49, HOJE-61, new HOJE-75)
**Diff range**: whole feature `d2005a9..HEAD` (`c72bf0e`); fix round `fcf0929..HEAD` (T24–T29, 6 commits)
**Verifier**: independent sub-agent (author ≠ verifier), round 2 of 3

The build gate is green. All 75 ACs have `file:line` evidence, and 11 of 12 mutations were killed. The one survivor makes no difference to any outcome the spec defines. Every round-1 gap is closed. The verdict is FAIL for one reason. T29 left an unapproved `SPEC_DEVIATION` (`close-day-dialog.tsx:105-107`): when the task in focus is an occurrence of a series, the close dialog still offers `Esta semana` and `Backlog`. HOJE-75 says the dialog SHALL offer only `Amanhã` for such a task. The server's 422 protects the data, so the gap is Minor. It still needs a fix or an amendment the user approves.

---

## Round 1 gaps → resolution

| Gap | Round 1 | Resolution | Evidence |
| --- | ------- | ---------- | -------- |
| G1 | `Fechar o dia` ended the series of a recurring task (D29) | ✅ Closed by choosing option (c), now HOJE-75. The server refuses `this_week`/`backlog` for an occurrence with 422 `close_series_needs_tomorrow` before any move (`backend-node/src/services/today.ts:391-393`). `tomorrow` keeps the series. The dialog disables the two destinations for a pending occurrence. | `BE/services/today.test.ts:950-968` (one test per destination: 422, nothing moved, `ended_at` null, `series_id` kept); `:971-976`; `BE/routes/today.test.ts:195-206`; `FE/components/today/close-day-dialog.test.tsx:236-256` |
| G2 | HOJE-22 toasted the action name, not the API message (`SPEC_DEVIATION`) | ✅ Closed. The queue stores `message` from `extractApiError` (`frontend/src/lib/focus/queue.ts:125-126`), and the toast uses it (`now-card.tsx:320`). The `SPEC_DEVIATION` is gone. | `FE/lib/focus/queue.test.ts:161-168` (`message: 'The task is already done'`), `:170-175` (old conflicts load); `FE/components/today/now-card.test.tsx:300-301` (`toast.error('The task is already done')`, called once) |
| G3 | `Abrir foco` hidden in the elsewhere state, which the spec didn't say and no test asserted | ✅ Closed. HOJE-20 was amended, and the test asserts that the link is absent. | `FE/components/today/now-card.test.tsx:231` - `queryByRole('link',{name:'Open focus'})).toBeNull()` |
| G4 | Atomicity under a failure in the middle of the moves was never exercised | ✅ Closed. `setSchedule` is mocked to throw on its 3rd call. All three tasks and the pause roll back. Mutant M2 (no outer transaction) is now killed by this assertion, not by a crash. | `BE/services/today.test.ts:22-34`, `:979-1003` - `injected.calls toBe(3)`, `toEqual(before)`, `endedAt/endReason toBeNull()` |
| G5 | Focused time counted whole wall-clock minutes | ✅ Closed. `DaySession` now carries `started_at`/`ended_at`, and `sessionSeconds` sums milliseconds and truncates once (`frontend/src/lib/today/rules.ts:145-157`). | `BE/services/today.test.ts:603-618` (09:00:40–09:30:20 + 10:10:50–10:40:10 = `59*60` = `report.tiles.task_seconds`); `FE/components/today/day-stats.test.tsx:72-79` and `close-day-dialog.test.tsx:147-153` (`59min`) |

### Fix-round notes judged

**(a) T28 changed three exact-shape assertions in `queue.test.ts`.** These are line 85, which runs twice through `it.each` (409 and 422), and line 190 (SYNC-05 reload). Each `toEqual` still checks the exact shape. The only change is the extra `message: 'refused'`, which matches the fixture's `detail: 'refused'` (line 19). Exact equality over a larger object is stricter than before, so nothing was weakened. Mutant M8 (message not persisted) fails all three. One thing doesn't fit the task: T28's Done-when says "Os testes existentes do foco continuam passando sem mudança de asserção". That can't hold when the stored shape grows, and the change is the right one. Cosmetic.

**(b) T29 `SPEC_DEVIATION`: the task in focus keeps all three destinations.** This is a blocking gap (G6, Minor).
- HOJE-75 applies to "a pendência". In P3 the dialog's pendências include the task in focus. HOJE-59 lists "as tarefas de `Pendente` e a tarefa em foco", and HOJE-63 writes "o destino de cada pendência", which covers it. The dialog half of HOJE-75 is therefore unmet whenever the task in focus is an occurrence. That case is realistic, since occurrences reach `Hoje` through the schedule and focus starts there.
- The stated reason is that the focus state lacks a series flag. That is true of `FocusState.task` (`frontend/src/types/index.ts:262-270`). But the feature's own read can supply the flag. `readToday` already finds the open session and removes its task from `pending`, and the same query computes `t.series_id IS NOT NULL AS series` (`backend-node/src/services/today.ts:223`). The fix is small and stays inside the feature.
- The server half holds. The 422 rejects the whole close before any move (M1 killed), and the dialog stays open with the error (`close-day-dialog.test.tsx:258-266`). No data can be lost. But the user hits an error the dialog promised to prevent, and the alert does not say which task caused it.
- The rule round 1 applied to the HOJE-22 deviation applies here too: an unapproved `SPEC_DEVIATION` on an AC is a gap. No test covers the dialog with a series task in focus.

---

## Task Completion

T1–T29 are marked `[x]` in `tasks.md`. Each of T24–T29 has its own commit (`8c310b6`, `1fef1ca`, `8d0d88c`, `8ff605a`, `65ceb43`, `c72bf0e`). None is blocked or partial.

---

## Spec-Anchored Acceptance Criteria

Paths: `BE` = `backend-node/test`, `FE` = `frontend/src`. The tests render in English (`en.json` text for the pt-BR copy in the spec). Line numbers are those at `c72bf0e`.

### P1: Ver o dia ao abrir o app

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| HOJE-01 | `/` is the dashboard; `Hoje` is the first sidebar item, marked | `FE/components/app-layout.test.tsx:209-217` - `links[0]` name `'Today'`, `href '/'`, `aria-current 'page'`; `FE/App.test.tsx:85-89` | ✅ |
| HOJE-02 | Grid at `/lists`; `Criar nova lista` → `/lists?new=1` | `FE/App.test.tsx:100-111`; `FE/components/app-layout.test.tsx:194-199` - `href '/lists?new=1'` | ✅ |
| HOJE-03 | Greeting, day in full, time, `4h 40min até o fim do dia (19:00)` | `FE/pages/today.test.tsx:114-117` | ✅ |
| HOJE-04 | `Jornada encerrada às <HH:MM>` after the workday | `FE/pages/today.test.tsx:120-124` | ✅ |
| HOJE-05 | `Planejar amanhã` → `/planejar/<amanhã>` | `FE/pages/today.test.tsx:127-129` - `href '/planejar/2026-11-12'` | ✅ |
| HOJE-06 | Reader's sessions/completions/plan; workspace Pendente | `BE/services/today.test.ts:232`, `:449`; `BE/routes/today.test.ts:32`, viewer test `:96-100` | ✅ |

### P1: Saber o que está acontecendo agora

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| HOJE-07 | `Agora · em foco`, `32min de 1h 30min`, time left and end, 3 buttons | `FE/components/today/now-card.test.tsx:136-142` | ✅ |
| HOJE-08 | No estimate: elapsed only, no bar, no end | `now-card.test.tsx:148-151` | ✅ |
| HOJE-09 | Same focus actions | `now-card.test.tsx:157-175` | ✅ |
| HOJE-10 | `Agora · intervalo`, name, left, `Encerrar intervalo` | `now-card.test.tsx:195-200` | ✅ |
| HOJE-11 | Dashed 2px suggested block, time, started ago, 3 buttons | `now-card.test.tsx:373-382`; `FE/lib/today/rules.test.ts:137-171` | ✅ |
| HOJE-12 | `Nada planejado para agora`, count + sum, 2 buttons | `now-card.test.tsx:444-450` | ✅ |
| HOJE-13 | `Sem foco há 1h · última sessão: …` / `Nenhuma sessão hoje` | `now-card.test.tsx:468-482` | ✅ |
| HOJE-14 | Move to top of `Hoje`, then start | `now-card.test.tsx:387-405` - `move(…,{column:'today',before_task_id})`, order `['move','start']` | ✅ |
| HOJE-15 | Picker of Pendente, then start | `FE/components/today/task-picker.test.tsx:48-72`; `now-card.test.tsx:427`, `:459` | ✅ |
| HOJE-16 | `Planejar hoje` → `/planejar/<hoje>` | `now-card.test.tsx:450` | ✅ |
| HOJE-17 | `Abrir foco` → session / suggested / first Pendente list | `now-card.test.tsx:212`, `:495-505` | ✅ |
| HOJE-18 | No session, suggestion or Pendente → no link | `now-card.test.tsx:514` - `queryByRole('link',{name:'Open focus'})).toBeNull()` | ✅ |
| HOJE-19 | Title links to the same place | `now-card.test.tsx:212` | ✅ |
| HOJE-20 | `Em foco em outro workspace: <nome>`, no buttons, **no `Abrir foco`** | `now-card.test.tsx:229-231` - text, `queryByRole('button')` null, `Open focus` link null | ✅ (G3 closed; M12 killed) |
| HOJE-21 | Viewer sees no action button | `now-card.test.tsx:235-245`, `:518-525` | ✅ |
| HOJE-22 | **The API message** in a toast; the card returns to the server state | `now-card.test.tsx:300-301` - `toast.error('The task is already done')`, once; `:275` - invalidate `['focus']`; `FE/lib/focus/queue.test.ts:167` | ✅ (G2 closed; M8, M9 killed) |
| HOJE-74 | `Estimativa esgotada`, time spent, Estender/Concluir | `now-card.test.tsx:181-188` | ✅ |

### P1: Ver o que falta e se cabe

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| HOJE-23 | Hoje column, active lists, minus open task; `5 tarefas · 4h 58min estimadas` | `BE/services/today.test.ts:232-300`; `FE/components/today/pending-card.test.tsx:66-68` | ✅ |
| HOJE-24 | 1px border, 8px corners, dot, meta, pill / `Sem estimativa` | `FE/components/today/task-tile.test.tsx:14-27`; `pending-card.test.tsx:110` | ✅ |
| HOJE-25 | First group in order, empty groups hidden | `FE/lib/today/rules.test.ts:30-86`; `pending-card.test.tsx:72-84` | ✅ |
| HOJE-26 | Count per group; order by start then position | `pending-card.test.tsx:72`, `:88-94`; `rules.test.ts:90-98` | ✅ |
| HOJE-27 | `13:00 · passou há 1h 20min` amber, amber border | `pending-card.test.tsx:98-101`; `task-tile.test.tsx:36` | ✅ |
| HOJE-28 | `há N dias` | `BE/services/today.test.ts:232` (days_late); `pending-card.test.tsx:105-106` - `'3 days ago'` | ✅ |
| HOJE-29 | Estimates + focus remainder vs time to end (0 after) | `rules.test.ts:102-122`; `pending-card.test.tsx:117`, `:134` | ✅ |
| HOJE-30 | Amber, `Não cabe no dia: sobram <diff> de tarefa`, hatched | `pending-card.test.tsx:120-123` | ✅ |
| HOJE-31 | `Cabe no dia: <diff> livre`, no alert color | `pending-card.test.tsx:127-130` | ✅ |
| HOJE-32 | `N sem estimativa, contadas como 0` | `pending-card.test.tsx:139-140`; `rules.test.ts:133` | ✅ |
| HOJE-33 | Opens the task panel | `pending-card.test.tsx:151-154` | ✅ |
| HOJE-34 | `Nada pendente para hoje` | `pending-card.test.tsx:158-161` | ✅ |

### P1: Ver o que já foi feito

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| HOJE-35 | Reader's completions today, newest first | `BE/services/today.test.ts:662-700`; `FE/components/today/done-card.test.tsx:80` | ✅ |
| HOJE-36 | `3h 22min em 4 tarefas` | `done-card.test.tsx:74` | ✅ |
| HOJE-37 | Gray card, done icon, `<lista> · <tempo> de <estimativa>`, badge colors | `done-card.test.tsx:90-96`; `task-tile.test.tsx:47-70` | ✅ |
| HOJE-38 | No estimate: time only, no badge | `done-card.test.tsx:100-102`; `BE/services/today.test.ts:713` | ✅ |
| HOJE-39 | `Nada concluído hoje ainda` | `done-card.test.tsx:108` | ✅ |
| HOJE-40 | Other member's / yesterday's completion left out | `BE/services/today.test.ts:681`, `:687` | ✅ |

### P2: Plano × real, números, Amanhã

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| HOJE-42 | Plan and Actual rows, same scale | `FE/components/today/plan-vs-real.test.tsx:64-68` | ✅ |
| HOJE-43 | Full hour before earliest to full hour after latest, one tick per hour | `plan-vs-real.test.tsx:75-103`; `rules.test.ts:241-253` | ✅ |
| HOJE-44 | Dashed blocks, solid sessions with white text, gray breaks | `plan-vs-real.test.tsx:110-132` | ✅ |
| HOJE-45 | Open session to now; `agora` line | `plan-vs-real.test.tsx:140-144` | ✅ |
| HOJE-46 | Hover: title, start–end | `plan-vs-real.test.tsx:151-158` | ✅ |
| HOJE-47 | `Sem plano para hoje` + link | `plan-vs-real.test.tsx:165-172` | ✅ |
| HOJE-48 | Horizontal scroll in the card | `plan-vs-real.test.tsx:177` - `overflow-x-auto`, `min-w-[720px]` | ✅ (classes only, jsdom) |
| HOJE-49 | Reports total for today, **seconds summed and truncated once**, off-minute sessions too; `intervalos` | `BE/services/today.test.ts:616-617` - `toBe(59*60)`, `toBe(report.tiles.task_seconds)`; `BE/routes/today.test.ts:91`; `FE/components/today/day-stats.test.tsx:78` - `'59min'`; `close-day-dialog.test.tsx:152`; `day-stats.test.tsx:64-65` (open session to now, breaks) | ✅ (G5 closed; M3, M5, M7 killed, M6 equivalent) |
| HOJE-50 | `<feitas> de <planejadas> no plano`; segment colors | `day-stats.test.tsx:81-92` | ✅ |
| HOJE-51 | No plan: Feito hoje count + `sem plano hoje` | `day-stats.test.tsx:95-100` | ✅ |
| HOJE-52 | Adherence %; `—` + `sem blocos até agora` | `rules.test.ts:191-216`; `day-stats.test.tsx:104-112` | ✅ |
| HOJE-53 | Switches (A,B,A → 2), average session | `rules.test.ts:220-237`; `day-stats.test.tsx:116-120` | ✅ |
| HOJE-54 | Tomorrow in full; timed first; `<lista> · <HH:MM> · recorrente\|agendada` | `BE/services/today.test.ts:743-784`; `FE/components/today/tomorrow-card.test.tsx:47-70` | ✅ |
| HOJE-55 | `N tarefas em Esta semana sem dia` | `BE/services/today.test.ts:787`; `tomorrow-card.test.tsx:73-81` | ✅ |
| HOJE-56 | `Amanhã ainda não tem plano` / `Plano de amanhã: N blocos`, button | `BE/services/today.test.ts:799`, `:811`; `tomorrow-card.test.tsx:84-100` | ✅ |
| HOJE-57 | `Nada marcado para amanhã` | `tomorrow-card.test.tsx:103-112` | ✅ |

### P3: Fechar o dia

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| HOJE-41 | Button beside Planejar amanhã; dialog with day, time, Focado, Concluídas, Aderência, No prazo | `FE/pages/today.test.tsx:183-191`; `FE/components/today/close-day-dialog.test.tsx:134-144` | ✅ |
| HOJE-58 | Focused by list, stacked bar + legend | `close-day-dialog.test.tsx:155-161` | ✅ |
| HOJE-59 | Pendente + task in focus, each starting at `Amanhã` | `close-day-dialog.test.tsx:167-170`; `today.test.tsx:191` | ✅ |
| HOJE-60 | `Adiada N dias seguidos` from 3 days | `close-day-dialog.test.tsx:175-178` | ✅ |
| HOJE-61 | One write; tomorrow → `this_week` + tomorrow, no time; this_week/backlog without a day; **a failure in the middle rolls back the earlier moves** | `BE/services/today.test.ts:828-860` (destinations, D21); `:979-1003` - failure on the 3rd `setSchedule`, `toEqual(before)` | ✅ (G4 closed; M2 killed by this assertion) |
| HOJE-75 | Occurrence: dialog offers only `Amanhã`, others disabled with `Encerraria a recorrência`; server 422 `close_series_needs_tomorrow` for this_week/backlog, nothing moved | Server: `BE/services/today.test.ts:950-968` (`statusCode 422`, `code`, `toEqual(before)`, series `endedAt` null), `:971-976` (tomorrow keeps the series), `:261-268` (`series` flag); `BE/routes/today.test.ts:195-206`. Dialog, pending occurrence: `close-day-dialog.test.tsx:236-256` (`toBeDisabled`, `title 'Would end the recurrence'`, plain task enabled), `:258-266` (422 keeps the dialog open) | ❌ GAP (G6): the dialog half is unmet for the **task in focus**, an unapproved `SPEC_DEVIATION` at `frontend/src/components/today/close-day-dialog.tsx:105-107` with no test |
| HOJE-62 | Pause the open session before moving | `BE/services/today.test.ts:865-888` | ✅ |
| HOJE-63 | Markdown summary, note at the end | `FE/lib/today/summary.test.ts:32-34`; `close-day-dialog.test.tsx:182-188` | ✅ |
| HOJE-64 | Copy + `Resumo copiado` | `close-day-dialog.test.tsx:193-211` | ✅ |
| HOJE-65 | Error, nothing moved, dialog keeps choices | `BE/services/today.test.ts:891-929`, `:979-1003`; `close-day-dialog.test.tsx:222-231` | ✅ |
| HOJE-66 | Closes anyway; `Não foi possível copiar o resumo` + `Copiar de novo` | `close-day-dialog.test.tsx:268-280` | ✅ |
| HOJE-67 | Viewer: no button (403 on the route) | `FE/pages/today.test.tsx:194-198`; `BE/routes/today.test.ts:144` | ✅ |

### Edge cases

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| HOJE-68 | 23:30–00:30 counts as 00:00–00:30 (instants too) | `BE/services/today.test.ts:566-582` - `start_minute 0`, `started_at SP('…T00:00:00')` | ✅ |
| HOJE-69 | New timezone → new day on next read | `BE/services/today.test.ts:215-224` | ✅ |
| HOJE-70 | Switch to the new day at midnight | `FE/lib/today/use-now-minute.test.tsx:65-78` | ✅ |
| HOJE-71 | Re-read within 60 s or on focus | `FE/lib/today/use-today.test.tsx:94-122`; `today.test.tsx:201-211` | ✅ |
| HOJE-72 | Empty cards + `Criar lista` | `pending-card.test.tsx:166-168`; `today.test.tsx:233-236` | ✅ |
| HOJE-73 | Keep last data; `Não foi possível atualizar` + `Tentar de novo` | `use-today.test.tsx:125-133`; `today.test.tsx:214-230` | ✅ |

**Status**: ❌ 74/75 ACs match the spec outcome. HOJE-75 is partly unmet (G6). There are no spec-precision gaps left: HOJE-17/20, HOJE-49 and HOJE-61/65 were made precise and are now asserted.

---

## Discrimination Sensor

The sensor ran in an isolated scratch: `git worktree add --detach <scratchpad>/sensor HEAD`, with `node_modules` symlinked from the real tree. It never used `git stash`. Before any mutation, the scratch passed the targeted suites (backend `today` service + route 70/70, frontend `components/today`, `lib/today`, `lib/focus`, `pages/today` 288/288). Each mutant was applied, the targeted suites ran, and the file was reverted with `git checkout --`. Mutations target the fix round.

| # | File:line | Mutation | Killed? | Killed by |
| - | --------- | -------- | ------- | --------- |
| M1 | `backend-node/src/services/today.ts:393` | closeDay: series guard removed | ✅ | 3 tests: service HOJE-75 this_week + backlog, route HOJE-75 |
| M2 | `today.ts:374` | closeDay: no outer transaction | ✅ | HOJE-61/65 mid-move rollback (`today.test.ts:999`) + HOJE-65 pause rollback |
| M3 | `today.ts:294` | readToday: instants truncated to the minute | ✅ | service HOJE-49 seconds test, route HOJE-49 |
| M4 | `today.ts:223` | readToday: `pending.series` always false | ✅ | service `series` flag test, route HOJE-75 |
| M5 | `frontend/src/lib/today/rules.ts:154` | sessionSeconds: wall-clock minutes instead of instants | ✅ | DayStats + CloseDayDialog `59min` |
| M6 | `rules.ts:156` | sessionSeconds: `floor(ms/60000)*60` instead of `floor(ms/1000)` | ⚪ Survived (equivalent) | `formatDuration` floors to whole minutes (`format-duration.ts:7`), so every displayed total is the same. Only the unspecified rounding of the HOJE-53 average could move by a minute in rare cases. No spec outcome changes, so no fix task. |
| M7 | `rules.ts:153` | sessionSeconds: open session not carried to now | ✅ | 4 tests (DayStats HOJE-49/53, dialog HOJE-41/63) |
| M8 | `frontend/src/lib/focus/queue.ts:126` | queue: `message` not persisted | ✅ | 4 tests (HOJE-22 queue, SYNC-07 ×2, SYNC-05) |
| M9 | `frontend/src/components/today/now-card.tsx:320` | toast ignores `conflict.message` | ✅ | NowCard "shows exactly the API message" |
| M10 | `frontend/src/components/today/close-day-dialog.tsx:244` | series destinations not disabled | ✅ | dialog HOJE-75 |
| M11 | `close-day-dialog.tsx:238` | only `Backlog` disabled for a series | ✅ | dialog HOJE-75 |
| M12 | `now-card.tsx:233` | `Abrir foco` shown in the elsewhere state | ✅ | NowCard HOJE-20 |

**Sensor depth**: expanded (12 manual mutations over the fix round: series guard, rollback, seconds in the service and the client, queue message, toast, dialog destinations, elsewhere link).
**Sensor outcome**: 11/12 killed. 1 survived as an equivalent mutant (M6), with no effect on a spec outcome.
**Isolation**: the scratch worktree was removed (`git worktree remove --force` + `git worktree prune`). The real tree's `git status --porcelain` matches the pre-sensor baseline (empty).

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ |
| Surgical changes | ✅ (fixture helpers gained `started_at`/`ended_at`/`series`; no unrelated edits) |
| No scope creep | ✅ |
| Matches patterns | ✅ (`extractApiError`, `HttpError` with `code`, `vi.mock` partial of `schedule.ts`) |
| Spec-anchored outcome check | ❌ HOJE-75 dialog half not met for the task in focus (G6) |
| Per-layer coverage (domain 1:1, routes happy + edge + error) | ✅ (route 422 `close_series_needs_tomorrow` added) |
| Every test maps to a spec requirement | ✅ |
| Documented guidelines followed: `.specs/STATE.md` ADs, lessons L-044/L-048 (one test per destination, plain task beside the occurrence) | ✅ |

---

## Edge Cases

- [x] HOJE-68 to HOJE-73 are handled and tested.
- [x] A pending occurrence cannot be sent to `Esta semana`/`Backlog`, in the UI or on the server.
- [x] Sessions off the whole minute are summed in seconds.
- [ ] A task in focus that is an occurrence is still offered `Esta semana`/`Backlog` in the dialog. The server refuses it, and the dialog error does not say which task (G6).

---

## Gate Check

- **Gate command**: Build = `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test && npm --prefix frontend run lint && npm --prefix frontend run typecheck && npm --prefix frontend test && npm --prefix frontend run build && npm --prefix backend-node run build`
- **Outcome**: exit 0 on the first run.
  - backend: 1107 passed, 9 skipped (1116); 79 files passed, 1 skipped
  - frontend: 2139 passed (192 files)
  - lint, typecheck and both builds OK
- **Known flaky test** (`focus-widget.test.tsx` "a second click on Notes closes…"): passed, so no rerun was needed.
- **Test count delta vs round 1**: backend 1099 → 1107 (+8), frontend 2132 → 2139 (+7). No test was removed. The changed assertions in `queue.test.ts` are stricter (see note a).
- **Skipped tests**: the 9 backend skips are pre-existing and outside the feature.
- **Failures**: none.

---

## Fix Plans

### G6: HOJE-75 for the task in focus (Minor; unapproved `SPEC_DEVIATION`)

- **Root cause**: `CloseDayDialog` builds the task in focus from `FocusState.task`, which has no series flag, and hard-codes `series: false` (`frontend/src/components/today/close-day-dialog.tsx:105-107`).
- **Fix task** (either one):
  - (preferred) Send the flag from the day read. `readToday` already finds the open session and removes its task from `pending`, so it can add `focus_task_series: boolean`, or keep `series` for the open task's id. The dialog then uses it for `focusTask`, and the `SPEC_DEVIATION` comes out. Add a backend test (an open session on an occurrence → flag true, and false for a plain task) and a dialog test (task in focus that is an occurrence → `This week`/`Backlog` disabled with `Would end the recurrence`).
  - (alternative) The user approves narrowing HOJE-75 to the tasks of `Pendente` and accepts that the server 422 covers the task in focus. Amend the spec. The verifier does not take the code comment as approval.
- **Priority**: Minor. No data loss is possible, because the 422 rejects the whole close. The cost is UX: the dialog offers a choice the server refuses.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| HOJE-01 to HOJE-74 | Implementing | ✅ Verified |
| HOJE-75 | Implementing | ❌ Needs fix / spec decision (G6) |

The verifier does not edit `spec.md`. The orchestrator applies these statuses.

---

## Summary

**Overall**: ❌ Not Ready (one Minor gap)

**Spec-anchored check**: 75/75 ACs have `file:line` evidence, and 74/75 match the spec outcome. HOJE-75 is partly unmet for the task in focus. There are 0 spec-precision gaps.
**Sensor**: 12 injected, 11 killed, 1 survived as an equivalent mutant (M6, no spec-visible effect).
**Gate**: all green (backend 1107 passed / 9 skipped, frontend 2139 passed, lint, typecheck and builds OK).

**What works**: every round-1 gap is closed (G1 series, G2 API message, G3 elsewhere link, G4 rollback, G5 seconds), and the fix round is strongly tested.

**Issues found**: G6. The close dialog still offers `Esta semana`/`Backlog` to a task in focus that is an occurrence of a series.

**Next steps**: fix G6, or get the user to approve narrowing HOJE-75. Then run round 3, the last before escalation.
