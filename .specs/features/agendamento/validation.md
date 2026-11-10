# Agendamento de tarefas Validation (round 5)

**Date**: 2026-11-10
**Spec**: `.specs/features/agendamento/spec.md` (US-6 `:145`, the re-drag criterion `:235`, the new drop-back criterion `:236`, D35 `:280`)
**Diff range**: `2efa8a9..67ecb20` on `feat/agendamento` (719c7fb tests for round 4's gaps 1, 2, 3 and 5; 67ecb20 a pending block dropped back on its saved day and time acts as `Cancelar`, its test and the spec lines). The drop-back behaviour was decided by the user after the 3-round cap (round 4 gap 4).
**Verifier**: independent sub-agent (author ≠ verifier), round 5, in the worktree of `feat/agendamento` at `67ecb20`

## Validation: agendamento (round 5) - PASS ✅

Round 4's two behavioural survivors (S4, S5) now die, each on the test written for it. S3 is confirmed equivalent (reasoning below). The user's decision (drop back on the saved place = `Cancelar`) is implemented at `frontend/src/pages/agenda.tsx:247-251`, stated in `spec.md:236` and D35 `:280`, and its test asserts every spec outcome; all four mutants on the new early return die. `tsc` is clean; the frontend suite has one failure in `focus-widget.test.tsx`, outside this diff, which fails identically at `2efa8a9` and on the main checkout's branch (pre-existing, not this feature's; see Gate Check).

---

## Round 4 gaps

| Gap | Fix | Evidence | Result |
| --- | --- | --- | --- |
| 1. S4 (D22 1h rule on a re-dragged `Sem hora` task) | 719c7fb | `frontend/src/pages/agenda.test.tsx:1692` test; `:1701` `toHaveBeenCalledWith('u', { scheduled_on: '2026-11-07', scheduled_time: '17:00', estimate_minutes: 60 })`; `:1705` `Desfazer` `toHaveBeenLastCalledWith('u', { scheduled_on: '2026-11-05', scheduled_time: null, estimate_minutes: null })`. S4 killed by exactly this test. | ✅ |
| 2. S5 (`confirming.id === taskId` guard) | 719c7fb | `agenda.test.tsx:1728` test; `:1740` B's saved time struck `getByText('Thu, Nov 5 · 14:00 – 14:30').tagName).toBe('DEL')`; `:1742` `toHaveBeenCalledWith('w', { scheduled_on: '2026-11-06', scheduled_time: '16:00' })`. S5 killed by exactly this test. | ✅ |
| 3. S3 (series check from the preview) | 719c7fb + 67ecb20 | Series dragged twice: `agenda.test.tsx:1668`; `:1685` `update('t', {2026-11-06, 12:00, scope:'occurrence'})`; `:1689` `Desfazer` `{2026-11-05, 10:00, scope:'occurrence'}`. S3 still survives and is now **equivalent** (below). | ✅ (equivalent) |
| 4. Drop back on the saved place (A3) | 67ecb20 | Code `agenda.tsx:248` `if (day === task.scheduled_on && time === task.scheduled_time) { setConfirming(null); return }`. Test `agenda.test.tsx:1745`: `:1759` `Save time` button gone; `:1760` no `This occurrence only`; `:1761` block back in the `2026-11-05` column; `:1762` nothing in `2026-11-06`; `:1763` `tasks.update` not called; `:1764` `toast.success` not called. | ✅ |
| 5. `Sem hora` → other day's `Sem hora`; `Cancelar` from `Sem hora` | 719c7fb | `agenda.test.tsx:1708`, `:1714` `toHaveBeenCalledWith('u', { scheduled_on: '2026-11-07', scheduled_time: null })`; `agenda.test.tsx:1717` `Cancel` → entry back in `Sem hora`, none in the Fri column, `tasks.update` not called. | ✅ |

### S3 equivalence (confirmed)

Mutant: the `schedule` used by `asksSeriesScope` comes from the preview task (`[...timed, ...untimed]`) instead of the saved one (`agenda.tsx:260`).

- `asksSeriesScope` (`frontend/src/lib/schedule.ts:230-235`) is `series !== null && (day differs || time differs)`; `change.recurrence` is never set by a drop and `change.scheduled_on` is never null.
- The preview task is the saved task spread with the pending day/time/estimate (`agenda.tsx:148-153`), so `series` is the same object in both.
- The drag hook never emits a drop on the place the block left: `frontend/src/lib/agenda/use-grid-drag.ts:397` returns when `final.day === final.from.day && time === final.from.time`, and for the pending block `from` is its preview place. So `change` always differs from the preview place → the mutant asks iff the task is in a series.
- The original asks iff in a series and `change` differs from the saved place; the only `change` equal to the saved place now returns early at `agenda.tsx:248` and never reaches the check.
- Without a pending move (`prior` null), preview task = saved task for that id, so both read the same values.

No input distinguishes the two: equivalent. Concrete former witness (round 4 probe A3: series Thu 10:00 → Fri 16:00 pending → back to Thu 10:00) is now the early-return test `agenda.test.tsx:1745`, which passes under the mutant because neither version reaches the series check.

### Spec text

`spec.md:236` "WHEN o usuário solta o bloco ainda não salvo de volta no dia e na hora salvos THEN … desfazer a mudança como `Cancelar`: fechar a confirmação, sem gravar nada nem mostrar aviso (D35)" — consistent with US-6 `:145` (`Cancelar` devolve o bloco sem gravar nada), with `:235` (the re-drag follows the saved schedule; "saved day and time" is the saved schedule) and with D35 `:280` ("Soltar de volta no lugar salvo vale como `Cancelar` (2026-11-10)"). It covers the `Sem hora` origin too (day + null time = saved place); US-14 (`:218`) has no drag text of its own and is unaffected. Round 4's cosmetic note (`:235` attributed to D35 without D35 mentioning re-drag) still holds; not blocking.

---

## Gate Check

| Gate | Exit | Result |
| ---- | ---- | ------ |
| `cd frontend && npx tsc -b --noEmit` | 0 | clean |
| `cd frontend && npx vitest run` | 1 | 160 files; **1725 passed, 1 failed (1726)** (round 4: 1720; +6 = 5 tests of 719c7fb + 1 of 67ecb20) |
| `npx vitest run src/pages/agenda.test.tsx` | 0 | 102 passed |

- **The one failure is outside this feature**: `frontend/src/pages/focus-widget.test.tsx:214` "a second click on Notes closes the open notes for good, and saves what was written" (`:227`, the notes textbox still in the document). Neither file is in `2efa8a9..67ecb20` (last touched by `adf8cea`, 2026-11-06). It fails the same way 3/3 times alone in this worktree, at `2efa8a9` (temporary worktree, removed after), and on the main checkout (`feat/planejamento-diario`, clean for those files), with the same `node_modules`. Round 4 saw it pass earlier today, so it looks time- or load-dependent (load average ≈10 during this run). Pre-existing; route it separately, not as a gap of this feature.
- **Test integrity**: 6 tests added, none removed or weakened.

---

## Discrimination Sensor

Copy-and-restore on `frontend/src/pages/agenda.tsx` (original copied to the scratchpad, mutated in place by a script, restored with `cp` after each run); `git status --porcelain` matched the baseline (` M .specs/features/agendamento/validation.md`, `?? backend-node/node_modules`) after the runs. Tests: `src/pages/agenda.test.tsx` (102).

| # | File:line | Mutation | Killed? |
| - | --------- | -------- | ------- |
| S3 | `frontend/src/pages/agenda.tsx:260` | series check from the preview task instead of the saved one | ⚪ Survived — equivalent (see above) |
| S4 | `agenda.tsx:256` | D22 rule reads `from.time` instead of `origin.time` | ✅ Killed (1 failed: `:1692`) |
| S5 | `agenda.tsx:244` | `prior = confirming` (guard dropped) | ✅ Killed (1 failed: `:1728`) |
| S7 | `agenda.tsx:248` | early return compares only the day | ✅ Killed (2 failed: US-12 series test and `:1668`) |
| S8 | `agenda.tsx:248` | early return compares only the time | ✅ Killed (1 failed: `:1708`) |
| S9 | `agenda.tsx:249` | return without `setConfirming(null)` | ✅ Killed (1 failed: `:1745`) |
| S10 | `agenda.tsx:248` | early return removed (`if (false)`) | ✅ Killed (1 failed: `:1745`) |

**Sensor depth**: 7 targeted mutants (3 re-runs of round 4, 4 on the new early return)
**Result**: 6/6 non-equivalent killed, 1 equivalent - PASS ✅

---

## Code Quality

67ecb20 adds 4 lines plus a comment at the existing early-exit point of `drop`, with no new state or abstraction; it reuses `setConfirming(null)` as `Cancelar` does. Tests follow the existing `dragTo`/`saveTime`/`lastToast` helpers and each maps to a spec line (`:145`, `:231`, `:232`, `:235`, `:236`) or a round-4 gap. ✅

---

## Gaps

None for this feature. Notes, not blocking:

1. `focus-widget.test.tsx:214` fails on this branch, at the round's base and on `feat/planejamento-diario`: pre-existing, outside the diff, to triage separately.
2. Round 4's cosmetic note on `spec.md:235` (attributed to D35, which does not mention the re-drag) stands.

---

## Summary

**Overall**: ✅ Ready (round 5)

**Round 4 gaps**: S4 ✅, S5 ✅, S3 equivalent ✅, drop-back decision ✅, `Sem hora` cases ✅
**Sensor**: 6/6 non-equivalent killed (+1 equivalent)
**Gate**: tsc clean; frontend 1725/1726, the one failure pre-existing and outside the feature

---

# Agendamento de tarefas Validation (round 4)

**Date**: 2026-11-10
**Spec**: `.specs/features/agendamento/spec.md` (US-7, US-14 texts touched by R3-3; D22, D35)
**Diff range**: `b0e498a..2efa8a9` on `feat/agendamento` (f661873 R3-1 drop reads task/undo/series check from the pending confirmation + R3-3 spec texts; 2efa8a9 R3-2 two-timezone layout test). Narrow re-verify of round 3's fix plans only; backend unchanged since round 3.
**Verifier**: independent sub-agent (author ≠ verifier), round 4, in a temporary worktree of `feat/agendamento` at `2efa8a9`

## Verdict (round 4, superseded by round 5) - FAIL ❌

R3-1, R3-2 and R3-3 each meet their "Done when", the gates are green, and the fixed code behaves correctly in every scenario probed (series dragged twice, `Sem hora` → grid → grid again, `Sem hora` → grid → `Sem hora`, gap 4). The round still fails on the sensor rule: two behaviour mutants on f661873's own new lines survive the suite (S4: the D22 1h-estimate rule reading the preview's place instead of the saved one; S5: the `confirming.id === taskId` guard removed). Both are test gaps, not code bugs. This is the 4th round, past the 3-iteration cap: **escalate to the user** (accept as known test debt, or one more small test-only fix).

---

## Fix verification

| Fix | Done when | Evidence | Result |
| --- | --- | --- | --- |
| R3-1 | drag Thu 10:00 → Sat 08:00 → (pending block) Fri 12:00; panel `<del>` = `Thu, Nov 5 · 10:00 – 11:30`; save sends Fri 12:00; `Desfazer` sends `{ scheduled_on: '2026-11-05', scheduled_time: '10:00' }` | `frontend/src/pages/agenda.test.tsx:1644` test; `:1658` `getByText('Thu, Nov 5 · 10:00 – 11:30').tagName).toBe('DEL')`; `:1659` `Fri, Nov 6 · 12:00 – 13:30`; `:1661` `toHaveBeenCalledWith('t', { scheduled_on: '2026-11-06', scheduled_time: '12:00' })`; `:1665` `toHaveBeenLastCalledWith('t', { scheduled_on: '2026-11-05', scheduled_time: '10:00' })`. Code: `frontend/src/pages/agenda.tsx:244` `prior`, `:245` task from `prior.task`, `:247` origin from the saved task, `:251` D22 rule on `origin.time`, `:255` series check from the saved task. Exact spec outcomes asserted (struck text, PATCH bodies). Mutants S1/S2 die. | ✅ |
| R3-2 | M13 (formatter cache returns the first cached for any tz) fails a test | `frontend/src/lib/agenda/layout.test.ts:58`; `:64` São Paulo `start` 13:01; `:65` Tokyo `2026-11-02` empty; `:66` Tokyo `2026-11-03` `start: 61, end: 86`. Mutant S6 (= round-3 M13) killed. | ✅ |
| R3-3 | `spec.md:169` no "passo"; `:231`, `:232`, `:234` save after `Salvar horário` | `spec.md:169` "hora fora de `HH:MM` (ou com segundos)" — matches D34 (`spec.md:278`, seconds zero). `:231` "ao soltar SHALL abrir a confirmação de D35; `Salvar horário` SHALL gravar"; `:232` same for block → `Sem hora`; `:233` "soltar ali SHALL propor só o dia novo"; `:234` "Depois de `Salvar horário` … aviso … `Desfazer`" — all match D35 (`spec.md:279`) and US-6 (`:145`). New `:235` re-drag criterion (struck time, `Desfazer`, series question follow the saved schedule). No stale "ao soltar SHALL gravar" left (grep). | ✅ (note: `:235` is attributed to D35 but the D35 decision text at `:279` does not mention the re-drag; cosmetic) |

### Behaviour probes (scratch tests inserted into `agenda.test.tsx`, run, then the file restored from a copy)

| # | Scenario | Observed | Matches spec? |
| - | --- | --- | --- |
| A2 | Weekly series, Thu 10:00 → Thu 16:00 (pending) → pending block → Fri 12:00 | `<del>` `Thu, Nov 5 · 10:00 – 11:00`; after `Salvar horário` the series question shows; `Só esta` → `update('t', {2026-11-06, 12:00, scope:'occurrence'})`; `Desfazer` → `{2026-11-05, 10:00, scope:'occurrence'}` | ✅ series question/undo follow the saved schedule |
| A3 | Same series, Thu 10:00 → Fri 16:00 (pending) → pending block dragged back to Thu 10:00 | confirmation stays open with old = new (`Thu, Nov 5 · 10:00 – 11:00` twice); no series question (correct: saved vs change are equal); `Salvar horário` sends a no-op `update('t', {2026-11-05, 10:00})` and toasts `Scheduled for Thu, Nov 5, 10:00` | ⚠️ not covered by the spec; harmless no-op PATCH (Minor UX, see gap 4) |
| B | `Sem hora` task, no estimate, Thu → grid Fri 15:15 (pending) → pending block → Sat 17:00 | `update('u', {2026-11-07, 17:00, estimate_minutes: 60})`; `Desfazer` → `{2026-11-05, null, estimate_minutes: null}` | ✅ D22 rule applied against the saved place/estimate |
| B2 | Same task → grid Fri 15:15 (pending) → pending block → `Sem hora` of Sat | `update('u', {2026-11-07, null})` (no estimate); `Desfazer` → `{2026-11-05, null}` | ✅ |
| C | Task A pending, then task B dragged | panel switches to B, `<del>` B's saved `Thu, Nov 5 · 14:00 – 14:30`; save sends B's change only | ✅ |
| G4a | `Sem hora` Thu → `Sem hora` Sat | confirm, then `update('u', {2026-11-07, null})` | ✅ |
| G4b | `Sem hora` → grid, `Cancelar` | row entry back in `Sem hora`, nothing in the Fri column, no update | ✅ |

---

## Gate Check

| Gate | Exit | Result |
| ---- | ---- | ------ |
| `cd frontend && npx tsc -b --noEmit` | 0 | clean |
| `cd frontend && npx vitest run` | 0 | 160 files; **1720 passed** (round 3: 1718; +2 = R3-1 + R3-2 tests) |

- **Flakes under load**: the first full run (another verifier running in the main checkout) failed 3 unrelated tests by timeout/slow render (`admin-route.test.tsx` superuser, `showcase.test.tsx` catalogue, `agenda.test.tsx` MERGE-23 at 390 px). The three files alone: 104/104 passed; a second full run: 1720/1720. None touches the diff.
- **Test integrity**: no test removed or weakened.

---

## Discrimination Sensor

Copy-and-restore on the worktree files (originals copied to the scratchpad, mutated in place, restored with `cp`); `git status --porcelain` returned to ` M .specs/features/agendamento/validation.md` + `?? backend-node/node_modules` after every run.

| # | File:line | Mutation | Tests | Killed? |
| - | --------- | -------- | ----- | ------- |
| S1 | `frontend/src/pages/agenda.tsx:245` | ignore `prior` for the task (look it up in the preview lists) | agenda page | ✅ (1 failed) |
| S2 | `agenda.tsx:247` | ignore `prior` for the undo (`origin = from`) | agenda page | ✅ (1 failed) |
| S3 | `agenda.tsx:255` | series check from the preview task instead of the saved one | agenda page | ⚠️ Survived (96 passed) — near-equivalent: it only changes A3 (drag back to the saved place would ask `Só esta`/`Esta e as próximas` for a no-op). A2 passes either way. |
| S4 | `agenda.tsx:251` | D22 rule reads `from.time` (the preview's place) instead of `origin.time` | agenda page | ❌ Survived (96 passed); killed by probe B (re-drag of a `Sem hora` task saves without the 1h estimate) |
| S5 | `agenda.tsx:244` | `prior = confirming` (drop the `id === taskId` guard) | agenda page | ❌ Survived (96 passed); killed by probe C (dragging task B while A is pending would rewrite A) |
| S6 | `frontend/src/lib/agenda/layout.ts:46` | `formatters.get(timeZone)` → first cached formatter | `src/lib/agenda` | ✅ (1 failed) |

**Sensor depth**: 6 targeted mutants on the fix lines
**Result (round 4, superseded by round 5)** - 3/6 killed, 1 near-equivalent, 2 behavioural survivors - FAIL ❌

---

## Gaps (ranked)

1. **S4 survives (Minor, test)** — D22 on a re-dragged pending block: `frontend/src/pages/agenda.tsx:251`. Scenario: `Sem hora` task without estimate → grid Fri 15:15 → drag the pending block → Sat 17:00 → `Salvar horário`. Correct code sends `estimate_minutes: 60` and `Desfazer` restores `estimate_minutes: null`; with the mutant the task is saved with no estimate and the suite stays green. Fix task: add probe B as a test (`agenda.test.tsx`, next to `:1644`). Done when S4 fails it.
2. **S5 survives (Minor, test)** — the `confirming?.id === taskId` guard (`agenda.tsx:244`) is unexercised. Scenario: Thu 10:00 `Plan the sprint` pending at Sat 08:00, then drag `Write notes` Thu 14:00 → Fri 16:00: correct code confirms and saves `Write notes`; without the guard the drop would rewrite `Plan the sprint`. Fix task: add probe C as a test. Done when S5 fails it.
3. **S3 near-equivalent (Cosmetic)** — the spec line `spec.md:235` says "a pergunta da série SHALL seguir o agendamento salvo", but no test discriminates it (only observable in A3). Optional: assert in A2-style test with a drag back to the saved place that no series question shows.
4. **Re-drag back to the saved place (Minor UX, not in spec)** — probe A3: the confirmation stays open with identical struck and new times, and `Salvar horário` sends a no-op PATCH plus a `Scheduled for …` toast with `Desfazer`. Suggest treating a drop on the saved place as `Cancelar` (or stating the behaviour in the spec). Not blocking.
5. **Round-3 gap 4 (Sem hora → other day's Sem hora; Cancel from a Sem hora origin)** — still no committed test; probes G4a/G4b show correct behaviour, and both go through the same `drop`/cancel paths already covered (the `Sem hora` → `Sem hora` change shape `{day, null}` is the same as block → `Sem hora` at `agenda.test.tsx:1604`). **Not blocking.**

---

## Summary

**Overall**: ❌ Not Ready by the sensor rule (round 4; past the 3-round cap → escalate)

**Fix plans**: R3-1 ✅, R3-2 ✅, R3-3 ✅ (code behaviour correct in all 7 probes)
**Sensor**: 3/6 killed (S3 near-equivalent; S4, S5 survived)
**Gate**: frontend 1720 passed + tsc clean (backend unchanged since round 3: 973 passed, 9 skipped)

**Next steps**: user decision — either add the two tests (probes B and C) and re-run S4/S5 only, or accept them as known test debt and merge.

---

# Agendamento de tarefas Validation (round 3)

**Date**: 2026-11-10
**Spec**: `.specs/features/agendamento/spec.md` (D34, D35 and the criteria they change: US-1, US-6, US-7, US-14, tables `tasks`/`task_series`)
**Diff range**: `e7a7b98..b0e498a` on `feat/agendamento` (c898f94 D34 `HH:MM` at any minute + migration 0013; 7877ee1 `Agendar` submenu design; 7234a6d D35 confirm a moved scheduled task; b0e498a perf of the session drag layout). Round 2 (below) covers `95c9583..b386561`.
**Verifier**: independent sub-agent (author ≠ verifier), round 3, run in a temporary worktree of `feat/agendamento` at `b0e498a`

## Verdict (round 3, superseded by round 5) - FAIL ❌

D34 is fully covered and every D34 mutant dies. D35's happy paths (confirm, `Salvar horário`, `Cancelar`/`Esc`, series question after saving, `Desfazer` after saving) are covered and their mutants die. Two grounded gaps fail the round: (1) a behaviour gap in D35 — dragging the pending (unsaved) block again replaces the saved time by the unsaved one, so the struck-through "old" time and `Desfazer` point to a time that was never saved; (2) a surviving mutant on the per-timezone formatter cache of b0e498a. Gates are green.

---

## Gate Check

Run in the worktree at `b0e498a` (node_modules symlinked from the main checkout).

| Gate | Exit | Result |
| ---- | ---- | ------ |
| `cd frontend && npx vitest run` | 0 | 160 files; **1718 passed** (round 2: 1714; +4 = 2 D35 tests + 1 `it.each` ×2) |
| `cd frontend && npx tsc -b --noEmit` | 0 | clean |
| `cd backend-node && npx vitest run` | 0 | 72 files passed, 1 skipped; **973 passed, 9 skipped** (982; unchanged count, D34 tests rewritten in place) |

- **Flakes under load**: the first runs, made while another verifier ran its suites in the main checkout, had timeouts in unrelated files (frontend `App.test.tsx`, `admin-route.test.tsx`, `showcase.test.tsx`; 7 backend tests). Each re-run alone was fully green, as above; no failure touched the diff.
- **Test integrity**: the 15-min-step assertions were replaced by D34 assertions (`14:10`/`14:07` accepted, seconds refused, `14:60`/`9:05`/`24:00`/`10:60` refused) — a spec change, not a weakening. `selectOptions` became `fireEvent.change` on the `type="time"` field. No test deleted.

---

## Spec-Anchored Acceptance Criteria

`be/` = `backend-node/test/`, `fe/` = `frontend/src/` (paths as on `feat/agendamento`).

### D34. `HH:MM` at any minute

| Criterion | Spec outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| US-1: the picker time is an optional `HH:MM` field, any minute | `type="time"`, empty by default; `09:07` saved | `fe/components/schedule/schedule-picker.test.tsx:43` `toHaveAttribute('type','time')`; `:44` `toHaveValue('')`; `:49` `toHaveBeenCalledWith({ on: '2026-11-13', time: '09:07', recurrence: null })` | ✅ |
| US-1: refuses a passed time of today, to the minute (workspace tz) | now 14:07 SP: `14:06` alert, `14:07` ok, Save disabled while passed | `schedule-picker.test.tsx:57` alert text; `:58` Save `toBeDisabled()`; `:61` alert at `14:06`; `:63` no alert at `14:07`; `:65` saved `14:07` | ✅ |
| `tasks.scheduled_time`: any minute, seconds zero (migration 0013) | `14:10` stored as `14:10:00`; `14:15:30` refused by `ck_tasks_schedule_time_minute` | `be/db/task-schedule-schema.test.ts:69-70`; `:84` `rejects.toThrow(/ck_tasks_schedule_time_minute/)` | ✅ |
| `task_series.time`: same rule | `14:10` accepted; `14:15:30` refused by `ck_task_series_time_minute` | `be/db/task-series-time-schema.test.ts:70`; `:71` | ✅ |
| US-7 REST: `HH:MM` any minute; anything else 422 | `14:07` → 200 and read back; `14:60`, `9:05`, `24:00` → 422 on `scheduled_time` | `be/routes/tasks-schedule.test.ts:78-80` `toEqual(['body','scheduled_time'])`; `:88-89` `statusCode 200`, `scheduled_time: '14:07'` | ✅ |
| US-7 MCP: same contract and message | `10:60` → `Input should be a time (HH:MM)` | `be/mcp/schedule-tools.test.ts:85-86` | ✅ (any-minute acceptance via MCP is not asserted directly; it shares `scheduleFields`, `backend-node/src/routes/tasks.ts:84`) |
| Service saves any minute | `14:07:00` | `be/services/schedule.test.ts:87-88` | ✅ |
| D34: the grid drag still snaps to 15 min (D22) | `15:15`, `08:00`, `16:00` | `fe/pages/agenda.test.tsx:1556`, `:1591`, `:1623` | ✅ |
| US-7 text "hora fora do passo SHALL responder 422" | stale after D34 (no step any more) | `spec.md:169` | ⚠️ Spec-precision gap |

### D35. Confirm a scheduled task moved on the Agenda (US-6, US-14)

| Criterion | Spec outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| US-6: a drop shows the block at the new place and the panel `Novo horário — ainda não salvo`, old day/time struck, new day/time | `<del>Thu, Nov 5 · 10:00 – 11:30</del>`, `Sat, Nov 7 · 08:00 – 09:30`, block in the Sat column, nothing saved | `fe/pages/agenda.test.tsx:1637` pending text; `:1638` `tagName).toBe('DEL')`; `:1639`; `:1640` block in `2026-11-07`; `:1641` `tasks.update` not called | ✅ |
| Only `Salvar horário` saves (block, `Sem hora` → grid, block → `Sem hora`) | update only after the button | helper `:1545` `expect(tasks.update).not.toHaveBeenCalled()` before click, used at `:1554`, `:1572` (`Salvar horário` in pt-BR), `:1590`, `:1604`, `:1619` | ✅ |
| `Cancelar` or `Esc` puts the block back and saves nothing | panel gone, block back in Thu column, no update | `agenda.test.tsx:1644` `it.each(['Cancel','Escape'])`; `:1658-1660` | ✅ |
| Series: `Só esta`/`Esta e as próximas` comes after `Salvar horário` | question only after save; `scope: 'occurrence'` | `agenda.test.tsx:1619-1623` | ✅ |
| `Desfazer` still offered after saving, restores day/time/estimate | `{ scheduled_on: '2026-11-05', scheduled_time: null, estimate_minutes: null }` | `agenda.test.tsx:1559-1563` | ✅ |
| The struck "old" time and `Desfazer` refer to the **saved** schedule, also when the pending block is dragged again | old = Thu 10:00; undo → Thu 10:00 | none. Probe (scratch test, discarded): drag Thu 10:00 → Sat 08:00, then drag the pending block → Fri 12:00. Panel `<del>` reads `Sat, Nov 7 · 08:00 – 09:30` (never saved); after `Salvar horário`, `Desfazer` calls `update('t', { scheduled_on: '2026-11-07', scheduled_time: '08:00' })` instead of Thu 10:00. Cause: `frontend/src/pages/agenda.tsx:243` takes `task` from the preview lists, and `undo` from the drag's `from` (the preview), not from `confirming.task`. | ❌ GAP |
| US-14 texts "ao soltar SHALL gravar" (`Sem hora` → grid), "SHALL gravar esse dia" (block → `Sem hora`), "Ao soltar, … aviso … `Desfazer`" | contradict D35 (save only after `Salvar horário`) | `spec.md:231`, `:232`, `:234` | ⚠️ Spec-precision gap |
| D35 for a `Sem hora` → `Sem hora` (other day) drop, and Cancel on a `Sem hora` origin | confirm, Cancel restores the row | no direct test (the same `drop` path) | ⚠️ minor coverage gap |

### 7877ee1. `Agendar` submenu

| Criterion | Spec outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| US-1: the four entries | `Hoje`, `Amanhã`, `Próxima segunda`, then the picker after a separator | `fe/components/board/task-card-menu.test.tsx:50` `toEqual(['TodayWed, Nov 11', …, 'Pick date, time and repeat…'])`; `:51` one separator | ✅ |
| US-1: a scheduled task marks its day and shows its schedule | `Agendada para` + `<strong>` day·time; `aria-checked` true on the day | `task-card-menu.test.tsx:81-84` | ✅ |
| Shortcuts keep the time; D24 | unchanged | `task-card-menu.test.tsx:62`, `:69`, `:75`; `fe/pages/list-board.test.tsx:545-547` | ✅ |

### b0e498a. Session drag performance

| Check | Expected | Evidence | Result |
| --- | --- | --- | --- |
| Layout output unchanged | same pieces/lanes | `fe/lib/agenda/layout.test.ts` unchanged by the diff and green (e.g. `:33` AGENDA-07 cut at midnight in São Paulo) | ✅ |
| A move inside one 15-min step draws nothing new; release in place commits nothing; a real move still commits | no commit in place; commit on change | `fe/lib/agenda/use-grid-drag.test.tsx:128`, `:211`, `:222`, `:276`; `fe/pages/agenda.test.tsx:854` (AGENDA-30). Code review: the dedupe at `frontend/src/lib/agenda/use-grid-drag.ts:279-281` compares every `Draft` field and runs after `moved` is set, so click-vs-drag and the pointer-up commit are unaffected. | ✅ |
| Formatter cache keyed by timezone | another timezone never reuses a cached formatter | `frontend/src/lib/agenda/layout.ts:47`; no test lays out two timezones in one module run (mutant M13 survived) | ❌ GAP (test) |

---

## Discrimination Sensor

Each mutant was applied to one file of the worktree, run against the named test files, and restored from memory; worktree `git status` was clean after every run.

| # | File:line | Mutation | Tests | Killed? |
| - | --------- | -------- | ----- | ------- |
| M1 | `frontend/src/components/schedule/schedule-picker.tsx:122` | field accepts only `:00/:15/:30/:45` | picker | ✅ (2 failed) |
| M2 | `schedule-picker.tsx:69` | passed-time `<` → `<=` | picker | ✅ |
| M3 | `backend-node/src/routes/tasks.ts:84` | regex back to 15-min steps | routes + MCP | ✅ |
| M4 | `tasks.ts:84` | regex `[01]?\d` hour and `[0-6]\d` minute | routes + MCP | ✅ (2 failed) |
| M5 | `backend-node/drizzle/0013_task_time_any_minute.sql:5` | tasks check → `CHECK (true)` (seconds allowed) | db schema | ✅ |
| M6 | `0013_task_time_any_minute.sql:4` | series check keeps the 15-min step | series schema | ✅ |
| M7 | `frontend/src/pages/agenda.tsx:257` | drop saves at once (no confirm) | agenda page | ✅ (8 failed) |
| M8 | `agenda.tsx:487` | Cancel/Esc call `confirmMove` (save) | agenda page | ✅ |
| M9 | `frontend/src/components/agenda/scheduled-move-confirm.tsx:34` | `Escape` → `Esc` | agenda page | ✅ |
| M10 | `agenda.tsx:264` | `Salvar horário` never asks the series scope | agenda page | ✅ |
| M11 | `agenda.tsx:257` | series scope asked before the confirm (old flow) | agenda page | ✅ |
| M12 | `agenda.tsx:145` | block not drawn at the pending place | agenda page | ✅ |
| M13 | `frontend/src/lib/agenda/layout.ts:47` | cache returns the first cached formatter for any timezone (stale tz) | `src/lib/agenda` | ❌ Survived (96 passed) |
| M14 | `layout.ts:114` | every day uses the bounds of the first day (stale day bounds) | `src/lib/agenda` + agenda page | ✅ (56 failed) |
| M15 | `frontend/src/lib/agenda/use-grid-drag.ts:281` | dedupe ignores `day` | grid drag + agenda page | ✅ |
| M16 | `use-grid-drag.ts:281` | dedupe ignores `end` | grid drag + agenda page | ✅ (18 failed) |

**Sensor depth**: 16 manual behaviour-level mutants (D34 data-integrity rules, D35 confirm flow, b0e498a caches)
**Result (round 3, superseded by round 5)** - 15/16 killed - FAIL ❌ (M13)

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code / surgical changes | ✅ (`TIMES` and `schedule.noTime` removed with their last use) |
| Matches patterns | ✅ `ScheduledMoveConfirm` mirrors `SessionMoveConfirm` (ADJ-01) |
| Spec-anchored outcome check | ⚠️ one D35 path unasserted (re-drag of the pending block); spec text of US-7/US-14 stale |
| Every test maps to a spec requirement | ✅ |
| Documented guidelines followed | none specific - strong defaults applied |

---

## Fix Plans

### Fix R3-1 (Major): a re-dragged pending block keeps the saved schedule as "old"

- **Root cause**: `frontend/src/pages/agenda.tsx:243` looks the task up in `timed`/`untimed`, which already hold the pending preview (`useMemo` with `confirming`); `undo` comes from the drag's `from` (the preview's place) and `schedule` (series check) from the preview.
- **Fix task**: when `confirming?.id === taskId`, take `task`, `undo`/`from` and `schedule` from `confirming.task` (the saved schedule), keeping the 1h estimate rule against the saved estimate.
- **Done when**: a test drags Thu 10:00 → Sat 08:00 → (pending block) Fri 12:00 and asserts the panel `<del>` is `Thu, Nov 5 · 10:00 – 11:30`, `Salvar horário` sends Fri 12:00, and `Desfazer` sends `{ scheduled_on: '2026-11-05', scheduled_time: '10:00' }`.

### Fix R3-2 (Minor): the formatter cache is not discriminated

- **Fix task**: a `layout.test.ts` case that lays out the same session in `America/Sao_Paulo` and then in `UTC` (or `Asia/Tokyo`) in one test and asserts different day pieces.
- **Done when**: mutant M13 (`formatters.get(timeZone)` → first cached value) fails it.

### Fix R3-3 (Spec): stale texts after D34/D35

- `spec.md:169` "hora fora do passo" → "hora fora de `HH:MM`"; `spec.md:231`, `:232`, `:234` → save after `Salvar horário` (D35).

---

## Summary

**Overall**: ❌ Not Ready (round 3)

**Spec-anchored check**: D34 7/7 matched; D35 5/6 matched (1 behaviour gap); 7877ee1 3/3; b0e498a 2/3 (1 test gap); 2 spec-precision gaps (`spec.md:169`; `:231-234`)
**Sensor**: 15/16 killed
**Gate**: frontend 1718 passed + tsc clean; backend 973 passed, 9 skipped

**Next steps**: R3-1 and R3-2 as fix tasks, R3-3 as a spec edit, then a round-4 re-verify of those three only.

---

# Agendamento de tarefas Validation (round 2)

**Date**: 2026-11-07
**Spec**: `.specs/features/agendamento/spec.md` (US-1 to US-14, D1 to D32)
**Diff range**: feature `origin/main..feat/agendamento` = `95c9583..b386561`; fixes of this round `565b400..b386561` (T49 `f52772a`, T50 `9346ca5`, T51 `b386561`; 6 backend source/test files)
**Verifier**: independent sub-agent (author ≠ verifier), round 2 of 3

## Verdict (round 2, superseded by round 5) - PASS ✅

The three round-1 gaps are fixed, each with a route/tool-level test that asserts the spec outcome and kills its mutant. All gates are green. Two spec-precision gaps remain from round 1 (accepted) and one new one is flagged; none is a behaviour failure.

---

## Round 1 gaps

| # | Round-1 gap | Fix | Evidence | Status |
| - | ----------- | --- | -------- | ------ |
| 1 | `GET /api/agenda/scheduled` stripped `projected[].rule`; the Agenda threw on render | T49 `f52772a` | `backend-node/src/routes/scheduled.ts:34` adds `rule`; `backend-node/test/routes/scheduled.test.ts:91` asserts the whole projected item, rule included. Probe: the real route JSON renders through `scheduledPieces` + `ScheduledBlock` with tooltip `Repeats every Sunday` (round 1: `TypeError … 'weekdays'`). Mutant S1 killed. | ✅ |
| 2 | MCP `get_board` (and `get_task`, REST `GET /api/tasks/:id`) did not apply due schedules (AD-009) | T50 `9346ca5` | `backend-node/src/mcp/tools.ts:86`, `:99`; `backend-node/src/routes/tasks.ts:250`. Tests `backend-node/test/mcp/schedule-tools.test.ts:160-162`, `:172`; `backend-node/test/routes/tasks-schedule.test.ts:106`, all with no REST read before. Probe: MCP-only overdue task is in `columns.today`. Mutants S2, S3, S4 killed. | ✅ |
| 3 | MCP `delete_task` on an open occurrence did not create the next one | T51 `b386561` | `backend-node/src/mcp/tools.ts:190` uses `deleteOccurrence(…, 'occurrence', …)`; `backend-node/test/mcp/schedule-tools.test.ts:188`, `:191`, `:198`. Mutants S5 (plain `deleteTask`) and S6 (scope `series`) killed. | ✅ |

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1–T48 | ✅ Done | Round-1 evidence unchanged by `565b400..HEAD` (only `routes/scheduled.ts`, `mcp/tools.ts`, `routes/tasks.ts` and their tests changed) |
| T49 | ✅ Done | Done-when boxes checked; evidence above |
| T50 | ✅ Done | idem |
| T51 | ✅ Done | idem |

---

## Gate Check

Run on the real tree at `b386561`, read-only.

| Gate | Exit | Result |
| ---- | ---- | ------ |
| `npm --prefix backend-node run lint` | 0 | clean |
| `npm --prefix backend-node run typecheck` | 0 | clean |
| `npm --prefix backend-node test` | 0 | 72 files passed, 1 skipped; **973 passed, 9 skipped** (982) |
| `npm --prefix backend-node run build` | 0 | ok |
| `npm --prefix frontend run lint` | 0 | clean |
| `npm --prefix frontend run typecheck` | 0 | clean |
| `npm --prefix frontend test` | 0 | 160 files; **1714 passed** |
| `npm --prefix frontend run build` | 0 | ok |
| `cd mobile && flutter test test/task_test.dart` | 0 | **4 passed** |

- **Test count**: backend 968 → 973 (+5: 1 route rewrite in place, +2 MCP AD-009, +1 REST AD-009, +2 MCP delete; 0 removed). Frontend unchanged at 1714.
- **Skipped**: the 9 Redis-only tests (`describe.runIf(process.env.REDIS_URL)` in `test/worker.test.ts`, `test/ports/key-value-store.test.ts`), pre-existing and justified.
- **Excluded by user decision**: `mobile/test/widget_test.dart` (template counter test, already failing on `main`).
- **Test integrity**: `be/routes/scheduled.test.ts` replaced a `[on, time, task_id]` projection check with a whole-item `toEqual` (stronger). No test deleted or weakened.

---

## Spec-Anchored Acceptance Criteria

Paths are relative to the repository root. `be/` = `backend-node/test/`, `fe/` = `frontend/src/`. Rows untouched by `565b400..HEAD` reuse round-1 evidence (re-checked that the cited files did not change, or line numbers were updated where a fix inserted tests above them).

### US-1. Agendar pelo card

| Criterion | Spec outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| `⋮ > Agendar` lists the four entries | `Hoje`, `Amanhã`, `Próxima segunda`, `Escolher data, hora e repetição…` | `fe/components/board/task-card-menu.test.tsx:49` `expect(items).toEqual(['Today','Tomorrow','Next Monday','Pick date, time and repeat…'])` | ✅ |
| The picker refuses past days and past times of today (workspace timezone) | days before today disabled; passed steps disabled; Save disabled | `fe/components/schedule/schedule-picker.test.tsx:24-26` `expect(day('Tue, Nov 10')).toBeDisabled()`; `:54` `expect(option '14:00').toBeDisabled()`; `:57` Save `toBeDisabled()` | ✅ |
| 15-minute steps | 96 steps + "no time" | `schedule-picker.test.tsx:43-46` `toHaveLength(97)`, `'23:45'` | ✅ |
| The shortcuts keep the time; `Hoje` with a passed time gives today without a time (D24) | `{scheduled_on}` only; `{scheduled_on: today, scheduled_time: null}` | `task-card-menu.test.tsx:67` `toHaveBeenCalledWith({ scheduled_on: '2026-11-11' })`; `:73` `toHaveBeenCalledWith({ scheduled_on: '2026-11-11', scheduled_time: null })` | ✅ |
| A scheduled task marks its day and offers `Remover agendamento` | clears the day | `task-card-menu.test.tsx:85` `toHaveBeenCalledWith({ scheduled_on: null })` | ✅ |
| The badge appears without a reload | the new badge shows | `fe/pages/list-board.test.tsx:547-548` update called, then `findByTitle('Thu, Nov 12')` `toHaveTextContent('Tomorrow')` | ✅ |
| Done tasks: `Agendar` disabled | `aria-disabled` | `task-card-menu.test.tsx:91` `toHaveAttribute('aria-disabled','true')` | ✅ |
| Viewer: `Agendar` disabled, API 403 | 403 `Read-only role` | `be/routes/tasks-schedule.test.ts:113` `expect(refused.statusCode).toBe(403)`; UI: `fe/pages/list-board.test.tsx:698` `queryByRole('button',{name:'More actions'}).not.toBeInTheDocument()` | ⚠️ Spec-precision gap: the spec says "desabilitado", but the viewer has no `⋮` menu at all (behaviour from before this feature). Accepted. |

### US-2. Diálogo

| Criterion | Spec outcome | Evidence | Result |
| --- | --- | --- | --- |
| Shows `Sem agendamento`, `Qui, 13 nov`, `… · 14:00 – 15:30` | exact texts | `fe/components/board/task-dialog.test.tsx:218` `/^Not scheduled$/`; `:225` `/^Thu, Nov 12$/`; `:229` `/^Thu, Nov 12 · 10:00 – 12:00$/` | ✅ |
| End from the estimate, or `+1h` (D7, D23) | `10:00 – 11:00 (+1h)` | `task-dialog.test.tsx:234` | ✅ |
| Clearing the time clears only `scheduled_time`; removing clears both | DB state | `be/services/schedule.test.ts:199` `toMatchObject({ scheduledOn: '2026-11-10', scheduledTime: null })`; `:204` both null; `be/routes/tasks-schedule.test.ts:53` | ✅ |

### Regras ao salvar (D3, D21, D26)

| Criterion | Spec outcome | Evidence | Result |
| --- | --- | --- | --- |
| A new day clears `schedule_applied_at`; a new time alone keeps it (D26) | null / kept | `be/services/schedule.test.ts:94` `scheduleAppliedAt: null`; `:100` `scheduleAppliedAt: EARLIER`; `:105-109` stays in backlog, then a new day brings it to today | ✅ |
| Backlog + a day this week → end of Esta semana (Mon–Sun) | `column:'this_week', position:1` | `schedule.test.ts:122` `toMatchObject({ column:'this_week', position:1, … })`; `:130-131` Sunday is `this_week`, the next Monday is `backlog` | ✅ |
| Today → end of Hoje, keeps day and time, `applied_at = now` (D21) | `column:'today'`, `scheduleAppliedAt: NOW` | `schedule.test.ts:145` `toMatchObject({ column:'today', position:2, scheduledOn:'2026-11-11', scheduleAppliedAt: NOW })` | ✅ |
| Esta semana / Hoje + a future day stay where they are | unchanged column and position | `schedule.test.ts:152-155` | ✅ |
| Workspace timezone | local "today" and "week" | `schedule.test.ts:163-164`, `:171` | ✅ |

### US-3. Badge

| Criterion | Spec outcome | Evidence | Result |
| --- | --- | --- | --- |
| `Hoje` / `Amanhã` / weekday up to 6 days / `13 nov` | exact labels | `fe/lib/schedule.test.ts:34-58`; `fe/components/board/task-card.test.tsx:386` `'Tomorrow'`, `:391` `'Nov 20'` | ✅ |
| With a time: `Qui 14:00`; in Hoje only `14:00` | exact | `task-card.test.tsx:397` `'Fri 14:00'`; `:402` `/^16:00$/` | ✅ |
| In Hoje without a time: `Agendada`, tooltip `Agendada para qua, 4 nov` (D21) | exact | `fe/lib/schedule.test.ts:81` `toEqual({ label:'Agendada', tooltip:'Agendada para qua, 4 nov', … })`; `task-card.test.tsx:410` | ✅ |
| None in Concluídas (D5) | null | `schedule.test.ts:99`; `task-card.test.tsx:417` | ✅ |
| Fits the 3-line title rule | badge on the estimate row | `task-card.test.tsx:436` | ✅ |

### US-4. Ida para Hoje na leitura

| Criterion | Spec outcome | Evidence | Result |
| --- | --- | --- | --- |
| Due Backlog / Esta semana tasks go to the end of Hoje, ordered by day, time, position | the exact order | `be/services/schedule.test.ts:247-249` `expect(await column('today')).toEqual([already, yesterday, earlyTime, lateTime, sameTimeAfter])` | ✅ |
| Keeps day and time; `applied_at = now`; a task taken out by hand does not come back | DB state | `schedule.test.ts:252-253`; `:261-262` `apply()==0`, `column:'backlog'` | ✅ |
| At the start of the day, whatever the time | moved at 00:xx | `schedule.test.ts:278-279` | ✅ |
| Hoje / Concluídas stay | unchanged | `schedule.test.ts:268-271` | ✅ |
| Archived lists stay; after unarchiving, the next read moves them (D25) | unchanged, then moved | `schedule.test.ts:302-308` | ✅ |
| Concurrent reads move the task once | sum = 1 | `schedule.test.ts:315` | ✅ |
| On read: board, home, focus, widget, Agenda | applied before the answer | board `be/routes/board.test.ts:108`; home `be/routes/lists.test.ts:276`; focus `be/routes/focus.test.ts:431`; widget `focus.test.ts:440`; Agenda `be/services/scheduled.test.ts:152` | ✅ |
| AD-009: every read that shows task columns, MCP included (round-1 Gap 2, fixed by T50 `9346ca5`) | MCP `get_board` / `get_task` and REST `GET /api/tasks/:id` show the moved task | `backend-node/src/mcp/tools.ts:86` and `:99`, `backend-node/src/routes/tasks.ts:250` call `applyDueSchedules` before reading. Tests (MCP only, no REST read before): `be/mcp/schedule-tools.test.ts:160` `expect(board.columns.today!.tasks).toEqual([expect.objectContaining({ id, scheduled_on: date(-1) })])`, `:161-162` backlog and this_week `toEqual([])`; `:172` get_task `toMatchObject({ id, column: 'today', scheduled_on: date(-1) })`; REST `be/routes/tasks-schedule.test.ts:106` `toMatchObject({ id: taskId, column: 'today', scheduled_on: yesterday })`. Probe: MCP-only task due 3 days ago lands in `columns.today` via `get_board`; another via `get_task` answers `"today"`. Sensor S2, S3, S4 killed. | ✅ |

### US-5 / US-14 / US-11. Agenda

| Criterion | Spec outcome | Evidence | Result |
| --- | --- | --- | --- |
| Block from `scheduled_time` for the estimate, or 1h (D23) | geometry | `fe/components/agenda/scheduled-block.test.tsx:80` `['1200px','180px']`; `fe/lib/agenda/layout.test.ts` (`scheduledPieces`) | ✅ |
| Dotted edge, faint list colour, clock top right, no text | classes and styles | `scheduled-block.test.tsx:73-77` | ✅ |
| Tooltip lines, `(1h)`, viewer without the drag part | exact strings | `scheduled-block.test.tsx:85`, `:90` | ✅ |
| No hatching after now (D10) | no `[data-future]` | `fe/components/agenda/week-grid.test.tsx` (D10 case) | ✅ |
| Overlaps side by side | lanes | `layout.test.ts` "assignLanes with scheduled blocks" | ✅ |
| Done tasks not drawn; whole workspace (D9); archived left out | service and route | `be/services/scheduled.test.ts:118`, `:130`, `:145`; route `be/routes/scheduled.test.ts:52` | ✅ |
| `Sem hora` row: board order, up to 3 and `+X`, same height | exact | `fe/components/agenda/untimed-row.test.tsx:68`, `:86` `/^\+2$/`, `:99` | ✅ |
| `+X` opens the day panel | heading | `fe/pages/agenda.test.tsx:1514-1515` | ✅ |
| US-11 projections: tooltip `Repete toda sexta`; the rule is carried by the projection (round-1 Gap 1, fixed by T49 `f52772a`) | the HTTP response carries `projected[].rule` | `backend-node/src/routes/scheduled.ts:34` `rule: seriesReadSchema.shape.rule`. Route test asserts the whole item: `be/routes/scheduled.test.ts:91` `expect(reply.projected).toEqual([projection(date(2)), projection(date(3))])` with `rule: { freq:'daily', interval:1, weekdays:null, month_day:null, until:null, count:3 }` (`:80-90`). Service: `be/services/scheduled.test.ts:185`. Probe: real route payload `projected[0]` now has `rule`; that JSON fed through `scheduledPieces` + `ScheduledBlock` renders, tooltip contains `Repeats every Sunday`. Sensor S1 killed. | ✅ |
| Projections: not draggable; a click opens the open occurrence | - | `week-grid.test.tsx` "lets the open occurrence be dragged … never a projection"; `scheduled-block.test.tsx:137` | ✅ (the mocked payload now matches the wire shape) |

### US-6 / US-8 / US-14 drag and panels

| Criterion | Spec outcome | Evidence | Result |
| --- | --- | --- | --- |
| Drag snaps to 15 min, keeps the estimate, works in the future | `{scheduled_on, scheduled_time}` only | `fe/pages/agenda.test.tsx:1582`; `fe/lib/agenda/use-grid-drag.test.tsx` (moveScheduled) | ✅ |
| Viewer cannot drag | - | `week-grid.test.tsx` "does not let a viewer drag a block" | ✅ |
| Sem hora → grid: 1h and the estimate given (D22); block → Sem hora clears the time | payload | `agenda.test.tsx:1549` `{…, scheduled_time:'15:15', estimate_minutes:60}`; `:1595` `scheduled_time: null` | ✅ |
| `Desfazer` restores the day, the time and the estimate | payload | `agenda.test.tsx:1554-1557` `toHaveBeenLastCalledWith('u', { scheduled_on:'2026-11-05', scheduled_time:null, estimate_minutes:null })` | ✅ |
| A window after now opens `Novo agendamento` (D10) | heading, window text | `agenda.test.tsx:1454-1456` | ✅ |
| D11: the window becomes the estimate only without one | payload | `fe/components/agenda/new-schedule-panel.test.tsx:117`; `agenda.test.tsx:1486` | ✅ |
| D32: the panel asks for the scope on a series | `scope: occurrence / series` | `new-schedule-panel.test.tsx:205`, `:215` | ✅ |
| Viewer: `Agendar` button disabled; a selection opens no panel | disabled | `agenda.test.tsx:1441` `toBeDisabled()`; `:1491` | ✅ |

### US-7. API / MCP contract

| Criterion | Spec outcome | Evidence | Result |
| --- | --- | --- | --- |
| `scheduled_on` / `scheduled_time` on POST and PATCH; read back | values | `be/routes/tasks-schedule.test.ts:37-41`; MCP `be/mcp/schedule-tools.test.ts:42` | ✅ |
| 422 for a time without a day, an invalid date, a time off the step | 422 and a message | `tasks-schedule.test.ts:71`, `:82`; MCP `schedule-tools.test.ts:73`, `:80` | ✅ |
| `recurrence` accepted; `get_board` / `get_task` answer the rule and `next_on` | `series:{id,rule,next_on}` | MCP `create_task`: `schedule-tools.test.ts:62` `next_on: date(27)`; `:144` (get_task), `:146` (get_board) `toEqual([objectContaining({ …, series })])` | ✅ |
| REST `POST /api/tasks` with `recurrence` | not defined: US-7 names `create_task` / `update_task` (MCP); scope item 7 says "API pública" | `createTaskRouteBody` (`backend-node/src/routes/tasks.ts:67-74`, `:89-91`) has no `recurrence`; probe: POST with a weekly rule answers 201 with `series: null` (field silently stripped). REST `PATCH` accepts it (`tasks-series.test.ts`). The app never sends it on POST. | ⚠️ Spec-precision gap (new) |
| `recurrence` without `scheduled_on` → 422 | `recurrence_needs_day` | `be/routes/tasks-series.test.ts:285`; MCP `schedule-tools.test.ts:66` | ✅ |
| D31: the API accepts a past day | 200, Hoje on the next read | `tasks-schedule.test.ts:87-91`; `be/services/schedule.test.ts:174-178` | ✅ |
| Idempotency hash includes the schedule and the rule (T40, T46) | replay vs 409 | `be/routes/tasks-intake.test.ts:243` | ✅ |

### US-9 / US-10 / US-12 series

| Criterion | Spec outcome | Evidence | Result |
| --- | --- | --- | --- |
| Repeat options built from the day; 29–31 "(ou no último dia)" | exact list | `fe/components/schedule/schedule-picker.test.tsx:79`, `:88`, `:99` | ✅ |
| Custom: interval, weekdays, end, summary | `A cada 2 semanas, ter e qui, 5 vezes` | `fe/components/schedule/custom-recurrence.test.tsx:32`, `fe/lib/schedule.test.ts:130` | ✅ |
| Saving a rule creates the series, links the task, `created_count = 1` | DB | `be/services/series.test.ts:69` | ✅ |
| `Parar de repetir` ends the series | `{recurrence:null}` / `ended_at` | `task-card-menu.test.tsx:104`; `series.test.ts:103` | ✅ |
| Completing creates the next one: after the occurrence day and after today (D17), same time, `+1` count | DB | `be/services/series-complete.test.ts:74-90`; `:117-120` (late); `:110-114` (early); `be/services/recurrence.test.ts:49-63` | ✅ |
| Copies title, notes, estimate, list, subtasks unchecked (D19); time stays on the done one | DB | `series-complete.test.ts:86` subtasks `done:false`; `:129-130` sessions stay | ✅ |
| `count` / `until` end the series | `ended_at` | `series-complete.test.ts:157`, `:164`; `recurrence.test.ts:66-78` | ✅ |
| Moving back out of Concluídas keeps the new one | one pending | `series-complete.test.ts:139-145` | ✅ |
| Monthly 31 clamps to the last day | `2027-02-28`, `2028-02-29` | `recurrence.test.ts:39-42` | ✅ |
| Completion by focus, route and MCP | next created | `series-complete.test.ts:167`; `be/routes/tasks-series.test.ts:73`, `:84` | ✅ |
| Asks `Só esta` / `Esta e as próximas` (D16); Cancel saves nothing | scope sent | `fe/pages/list-board.test.tsx:604`, `:616`; `fe/components/board/task-dialog.test.tsx:309`, `:319` | ✅ |
| D30: a new day keeps the series rule | `Every Thursday` checked; saves the rule unchanged | `schedule-picker.test.tsx:157-162`; `task-dialog.test.tsx:303-309` | ✅ |
| `Só esta` changes only the task (D27: `task_series.time` unchanged) | series time kept | `series-complete.test.ts:102-107`; `tasks-series.test.ts:213` | ✅ |
| `Esta e as próximas`: weekday or month day follows the new date | weekdays / month_day | `tasks-series.test.ts:202`, `:237`, `:244` | ✅ |
| Delete: only this one (creates the next) / end the series | DB | `tasks-series.test.ts:97`, `:113`; UI `task-dialog.test.tsx:326` | ✅ |
| Skip (D18, D28): next rule day, keeps time spent, column of the new day, `applied_at` cleared | DB | `be/services/series-skip.test.ts:45`, `:55`, `:63`, `:70` | ✅ |
| Removing the schedule ends the series (D29) | `series:null`, `ended_at` | `be/services/schedule.test.ts:223-224`; `tasks-series.test.ts:263` | ✅ |
| MCP `delete_task` on an open occurrence (round-1 Fix 3, decided and fixed by T51 `b386561`: same default as REST `DELETE` without a scope) | deletes only this occurrence, creates the next, series live | `backend-node/src/mcp/tools.ts:190` `deleteOccurrence(…, 'occurrence', …)`. `be/mcp/schedule-tools.test.ts:188` remaining tasks `toEqual([['Review', seriesId, date(21), '09:00:00']])`; `:191` `toMatchObject({ createdCount: 2, endedAt: null })`; `:198` a task outside a series: `stored()` `toEqual([])`. Probe: MCP delete of a weekly occurrence leaves the next one on the next rule day at 14:00, `created_count 2`, `ended_at null`; a stranger token gets `Task not found`. Sensor S5, S6 killed. The default lives in `tasks.md` T51 and the tool description, not in `spec.md`. | ✅ (⚠️ decision not yet recorded as a D in spec.md) |

### Mobile (D4)

| Criterion | Evidence | Result |
| --- | --- | --- |
| Reads the fields with or without them | `mobile/test/task_test.dart:9-12`, `:24-25` | ✅ |


**Status**: ✅ All ACs covered with spec-anchored assertions; ⚠️ 3 spec-precision gaps (2 from round 1, 1 new), none a behaviour failure.

---

## Cross-cutting constraints

| Constraint | Evidence | Result |
| --- | --- | --- |
| AD-007: `GET /api/agenda/scheduled` closed to tokens | `be/routes/scheduled.test.ts:119` `toBe(403)`, `:120` `'Route not available for tokens'`; `be/support/token-routes.ts:38` | ✅ |
| AD-009: REST board, home, focus, widget, Agenda | see US-4 (round-1 evidence, unchanged) | ✅ |
| AD-009: MCP `get_board`, MCP `get_task`, REST `GET /api/tasks/:id` | `backend-node/src/mcp/tools.ts:86`, `:99`; `backend-node/src/routes/tasks.ts:250`; tests `be/mcp/schedule-tools.test.ts:160`, `:172`; `be/routes/tasks-schedule.test.ts:106` | ✅ |
| Viewer: 403 on every write | `be/routes/tasks-schedule.test.ts:113`, `:162`; `be/routes/tasks-series.test.ts:138`, `:158`, `:314` | ✅ |
| MCP delete keeps workspace isolation | probe: a stranger's token gets `Task not found` (`deleteOccurrence` → `findTask` by workspace) | ✅ |
| D9 workspace-wide Agenda; D25 archived lists ignored | round-1 evidence, unchanged | ✅ |

### Payload/conjunction sweep (response schemas vs. what the frontend reads)

Every serializer that carries agendamento fields was compared field by field with the frontend type that reads it:

| Route schema | Frontend type | Result |
| --- | --- | --- |
| `routes/scheduled.ts:14-24` `scheduledTaskSchema` (`series: pick id, rule`) | `ScheduledTask` (`fe/types/index.ts:399`, `series: { id, rule }`) | ✅ match |
| `routes/scheduled.ts:26-35` `projectedSchema` | `ProjectedOccurrence` (`fe/types/index.ts:413`, `rule` required) | ✅ match (fixed) |
| `routes/board.ts:12-23` `taskCard` (`scheduled_on`, `scheduled_time`, `series` with `next_on`) | `TaskCardView` extends `TaskSchedule` | ✅ match |
| `routes/tasks.ts:43-58` `taskReadSchema` | `Task` extends `TaskSchedule` | ✅ match |

No other schema strips a field the frontend reads. Home, focus and widget responses carry no schedule fields and the frontend types for them read none.

---

## Discrimination Sensor

Sensor depth: **expanded** (≥5, at least one per fix). Run in a throwaway `git worktree --detach` of `b386561` under the scratchpad, `node_modules` symlinked. Each mutation was applied with `sed`, the covering tests run, and the file restored with `git checkout`. The worktree was then removed (`git worktree remove --force`, `git worktree prune`) and `git status --porcelain` on the real tree matched the pre-run baseline byte for byte.

| # | File:line | Mutation | Tests run | Killed? |
| - | --------- | -------- | --------- | ------- |
| S1 | `backend-node/src/routes/scheduled.ts:34` | drop `rule` from `projectedSchema` | `routes/scheduled.test.ts`, `services/scheduled.test.ts` | ✅ Killed (1 failed) |
| S2 | `backend-node/src/mcp/tools.ts:86` | drop `applyDueSchedules` from MCP `get_board` | `mcp/schedule-tools.test.ts` | ✅ Killed (1 failed) |
| S3 | `backend-node/src/mcp/tools.ts:99` | drop `applyDueSchedules` from MCP `get_task` | `mcp/schedule-tools.test.ts` | ✅ Killed (1 failed) |
| S4 | `backend-node/src/routes/tasks.ts:250` | drop `applyDueSchedules` from REST `GET /api/tasks/:id` | `routes/tasks-schedule.test.ts` | ✅ Killed (1 failed) |
| S5 | `backend-node/src/mcp/tools.ts:190` | MCP `delete_task` calls plain `deleteTask` | `mcp/schedule-tools.test.ts` | ✅ Killed (1 failed) |
| S6 | `backend-node/src/mcp/tools.ts:190` | MCP `delete_task` scope `'occurrence'` → `'series'` (ends the series) | `mcp/schedule-tools.test.ts` | ✅ Killed (1 failed) |

**Result (round 2, superseded by round 5)** - 6 injected, 6 killed, 0 survived - PASS ✅. Round-1 mutants M1–M14 target code untouched by `565b400..HEAD` and keep their round-1 result (15/17 killed, 2 equivalent survivors).

### Probes (scratch worktree, then deleted)

- Real route: a weekly series (Sunday, 14:00) created through REST; `GET /api/agenda/scheduled` answers two `projected[]` items, each with `rule: {"freq":"weekly","interval":1,"weekdays":[7],"month_day":null,"until":null,"count":null}`.
- Frontend: that JSON, unchanged, through `scheduledPieces` → `assignLanes` → `ScheduledBlock` renders; the tooltip contains `Repeats every Sunday`.
- MCP only: `create_task` with `scheduled_on` 3 days ago (stored in `this_week`, `schedule_applied_at` null), then `get_board` → the task is in `today`; another one via `get_task` answers `column: "today"`.
- MCP `delete_task` on the open occurrence → next occurrence on the next Sunday at 14:00, series `created_count 2`, `ended_at null`.
- Side finding: REST `POST /api/tasks` with `recurrence` answers 201 with `series: null` (field stripped by the request schema). See spec-precision gaps.

---

## Spec-precision gaps (not failures)

1. **US-1 viewer**: spec says `Agendar` "desabilitado"; the viewer has no `⋮` menu at all (`fe/pages/list-board.test.tsx:698`). Pre-existing behaviour, accepted in round 1.
2. **MCP `delete_task` default (US-12)**: now implemented as the REST default (occurrence only, next created). The decision lives in `tasks.md` T51 and the tool description; `spec.md` has no D for it. Recommend recording it as D33.
3. **REST `POST /api/tasks` + `recurrence` (US-7, new)**: the spec names MCP `create_task`/`update_task`; the REST create body has no `recurrence` and strips it silently (201, `series: null`) instead of accepting it or answering 422. The app never sends it (it creates then `PATCH`es). Recommend deciding: accept it on POST as MCP does, or reject the unknown field.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code / surgical changes / no scope creep (fix diff in `backend-node`: 6 files, +101/−14) | ✅ |
| Matches patterns (`applyDueSchedules` before the read, as `routes/board.ts`; `deleteOccurrence` as REST `DELETE`) | ✅ |
| Spec-anchored outcome check | ✅ |
| Per-layer coverage (route test now asserts the full projected payload; MCP read and delete paths covered directly) | ✅ |
| Every test maps to an AC, edge case or Done-when | ✅ |
| Guidelines: `CONTRIBUTING.md` | ✅ |

---

## Edge Cases

- [x] Timezone and day turnover, Mon–Sun week, Sunday boundary (round 1)
- [x] End of month, `until`, `count` (round 1)
- [x] Concurrent reads and completions (round 1)
- [x] A projection rendered from the real API payload (fixed; probe)
- [x] A due schedule read only through MCP (fixed; probe)
- [x] MCP delete of a series occurrence and of a plain task (fixed)

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| US-4 (AD-009 across every read, MCP included) | ❌ Needs Fix | ✅ Verified |
| US-5 / US-11 (projections over the real API) | ❌ Needs Fix | ✅ Verified |
| US-7 (MCP reads) | ⚠️ | ✅ Verified (⚠️ REST POST `recurrence` spec-precision gap) |
| US-12 (MCP delete of an occurrence) | ⚠️ | ✅ Verified (⚠️ default not recorded in spec.md) |
| US-1, US-2, US-3, US-6, US-8, US-9, US-10, US-14, D1–D32 | ✅ Verified | ✅ Verified |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: all ACs matched the spec outcome; 3 spec-precision gaps flagged (viewer `⋮` hidden; MCP delete default not in spec.md; REST POST strips `recurrence`)
**Sensor**: 6/6 killed this round (one or more per fix)
**Gate**: backend 973 passed / 9 skipped (Redis), frontend 1714 passed, mobile 4 passed; lint, typecheck and both builds exit 0

**What works**: everything verified in round 1, plus the Agenda projection contract end to end, AD-009 on MCP `get_board`/`get_task` and REST `GET /api/tasks/:id`, and MCP `delete_task` on a series occurrence.

**Next steps**: optionally record D33 (MCP delete default) and decide REST POST `recurrence`; then the browser walk-through.
