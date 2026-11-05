# Tarefa da nova sessão Validation

**Date**: 2026-11-04
**Spec**: `.specs/features/session-task-picker/spec.md`
**Diff range**: whole feature `4bdf1d3..HEAD` (T1 8cc9b22 … T8 935932f); fix round `e6df445..HEAD` (T9 3a8b038, T10 1879062, T11 32cbc83)
**Verifier**: independent sub-agent, round 2 (author ≠ verifier)

**Verdict**: ✅ PASS. 20/20 ACs and 3/3 edge cases have spec-anchored evidence, 28/28 mutants were killed, and both gates are green.

### Round 1 and the fix round

Round 1 failed for two reasons. First, there was a PICK-12 defect: `Criar nova tarefa` handed `''` while a search with results was typed (`onCreate(empty ? settled : '')`). Second, mutant #40 survived: Esc with only the picker open was never tested. The fix round closed both, plus the optional hardening:

- **T9 (3a8b038)**: `session-task-picker.tsx:184` is now `onCreate(query)`, where `query` is the trimmed text from `:55`. New test `session-task-picker.test.tsx:140-150`.
- **T10 (1879062)**: new panel test `session-panel.test.tsx:362-371`. Esc with only the picker open closes the popover, and `onCancel` is not called.
- **T11 (32cbc83)**: the viewer 403 now asserts that nothing was created (`sessions.test.ts:256-259`). A new dialog test covers the first-list fallback (`new-session-task-dialog.test.tsx:52-56`). The JSDoc moved back onto `listSessionTasks` (`services/sessions.ts:277-280`). `pickTask` was merged into `chooseTask`.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1–T5 | ✅ Done | backend: columns and backfill, `updated_at` upkeep, `via Agenda`, search route, create route |
| T6 | ✅ Done | the round 1 partial is fixed by T9 |
| T7 | ✅ Done | - |
| T8 | ✅ Done | the Esc-on-picker test was added by T10 |
| T9 | ✅ Done | `onCreate(query)`; killed the restored defect (mutant 2) |
| T10 | ✅ Done | killed round 1 survivor #40 (mutant 1) |
| T11 | ✅ Done | killed the viewer guard mutant (5) and the fallback mutants (6, 7) |

---

## Spec-Anchored Acceptance Criteria

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| PICK-01 last update kept | set on create, title/notes/estimate, column, list, subtask create/change/delete; not on reorder | `backend-node/test/services/task-updated.test.ts:42` create `toBe(CREATED)`, `:44` duplicate `LATER`; `:51` empty PATCH keeps `CREATED`; `:55` each field `toBe(at)`; `:63-64` same-column reorder keeps `CREATED`; `:67` column move `LATER`; `:74` list move `LATER`; `:81,84,88` subtask create/update/delete; `:86` subtask reorder unchanged | ✅ PASS |
| PICK-02 backfill | later of creation and completion | `backend-node/test/db/task-updated-origin-schema.test.ts:56` open `toBe('2026-10-01T10:00:00.000Z')`; `:57` done `toBe('2026-10-05T18:30:00.000Z')` (migration applied on pre-0009 rows) | ✅ PASS |
| PICK-03 no `q`: 10 latest, non-archived, DESC | exactly 10, most recent first | `backend-node/test/routes/sessions.test.ts:159` `toEqual(ids.slice(0, 10))` (12 tasks); `:160` DESC; `:203` archived `not.toContain(old)` | ✅ PASS |
| PICK-04 `q`: up to 50, contains, ignore case, all lists, concluded too | ILIKE, 50 cap, literal `%`/`_` | `sessions.test.ts:170` `?q=REVIS` `toEqual([pr, budget, contract])` (two lists, one done); `:177-178` `toHaveLength(50)` of 52 in order; `:185` `50%` → `[percent]`; `:186` `a_b` → `[]`; `:204` archived `?q=old` → `[]`; `:209` 256 chars → 422 | ✅ PASS |
| PICK-05 blank `q` = no `q` | same answer | `sessions.test.ts:192` `?q=%20%20%20` equals no `q`; `:193` first is latest | ✅ PASS |
| PICK-06 popover: search focused, caption, tasks, `Criar nova tarefa` after them | exact copy and order | `frontend/src/components/agenda/session-task-picker.test.tsx:57` `toHaveFocus()`; `:58` caption; `:62` create follows the last option; pt-BR `:174-175`; panel `session-panel.test.tsx:317-319` (picker for new), `:323` (select for edit). Below the field only in code (`session-task-picker.tsx:99` `side="bottom"`) | ✅ PASS |
| PICK-07 list order, latest first, `Concluída` | group order and mark | `session-task-picker.test.tsx:71` `toEqual(['Frete','ADSet'])`; `:72` in-group order + `Done`; pt-BR `Concluída` `new-session-task-dialog.test.tsx:139` | ✅ PASS (colour swatch unasserted) |
| PICK-08 300 ms debounce, count line, highlight | not before 300 ms, once | `session-task-picker.test.tsx:90,94` not called at 299 ms; `:98-99` called once with `'revis'`; `:103` `'2 tasks for “revis”, in every list'`; `:104` marks `['Revis','revis']` | ✅ PASS |
| PICK-09 clear → empty + recent | | `session-task-picker.test.tsx:116` `toHaveValue('')`; `:117-118` caption and recent tasks back | ✅ PASS |
| PICK-10 no match | `Nenhuma tarefa encontrada`, `Criar “<texto>”` | `session-task-picker.test.tsx:128` `No task found`; `:129-130` `onCreate('zzz')`; panel `session-panel.test.tsx:334` | ✅ PASS |
| PICK-11 pick closes and shows | | `session-task-picker.test.tsx:156` `onChange` f1; `:157` no dialog; `:159` field text | ✅ PASS |
| PICK-12 modal: list filter else first, title = search text else empty, estimate, switch off, Cancelar/Adicionar | title is the search text whenever there is one | `session-task-picker.test.tsx:149` `onCreate('revis')` with results and a `' revis '` input (trimmed); `:137` `''` without a search; `new-session-task-dialog.test.tsx:43-49` list/title/estimate/switch/buttons; `:55` fallback `toHaveTextContent('Frete')` for a non-active `defaultListId`; panel `session-panel.test.tsx:337-338` title from the search, list `Home` from the filter | ✅ PASS (round 1 gap closed) |
| PICK-13 notes editor while on | | `new-session-task-dialog.test.tsx:61` shown; `:63` hidden again | ✅ PASS |
| PICK-14 board messages, nothing created | `Use no máximo 255 caracteres`, `Use de 1 a 1440 minutos`, required | `new-session-task-dialog.test.tsx:69,74,75,76` (`board.*` keys); backend `sessions.test.ts:250` 422 ×4, `:252` count unchanged | ✅ PASS |
| PICK-15 Done, now, by user, origin `agenda`, estimate, notes only while on | | `sessions.test.ts:222-233` (`column:'done'`, `estimate_minutes:45`, notes, `created_via:'Agenda'`, `createdFrom:'agenda'`, `completedByUserId: owner.id`, `completedAt >= before`); `new-session-task-dialog.test.tsx:88` exact payload with notes; `:102` exact payload without notes; `:110` chosen list | ✅ PASS |
| PICK-16 modal + popover close, field shows new task | | `session-panel.test.tsx:341` no dialog; `:342` field text; `:344` save `task_id: 't9'` | ✅ PASS |
| PICK-17 `via Agenda` on card and `Editar tarefa` | `created_via: 'Agenda'` | `backend-node/test/routes/tasks-origin.test.ts:123` task read, `:128` board card; label rendering `frontend/src/components/board/task-card.test.tsx:27`; pt-BR `via Agenda` `new-session-task-dialog.test.tsx:140` | ✅ PASS (by composition) |
| PICK-18 failure keeps modal + input + API error | | `new-session-task-dialog.test.tsx:117` alert; `:118` title kept; `:119-120` not closed | ✅ PASS |
| PICK-19 Cancel/Esc/close: nothing created, popover stays | | `new-session-task-dialog.test.tsx:126,129,130`; panel `session-panel.test.tsx:356-359` picker back with `zzz`, no create, no cancel; `:380-381` Esc closes only the modal; `:368-370` Esc closes only the picker (new) | ✅ PASS |
| PICK-20 non-writer → 403, nothing created | | `sessions.test.ts:258` `toBe(403)`; `:259` count `toBe(before)` (new); 409 `:262`, 404 `:264` | ✅ PASS |

**Status**: ✅ 20/20 ACs covered with spec-anchored assertions. Minor unasserted visuals: popover position, list colour swatch.

---

## Edge Cases

- [x] A task created by the Agenda is the first of the 10 recent: `sessions.test.ts:270` `recent[0].id` is the created id.
- [x] A search of only spaces shows the 10 recent: backend `sessions.test.ts:192-193`; frontend trims (`session-task-picker.tsx:55`).
- [x] No non-archived list disables `Criar nova tarefa`: `session-task-picker.test.tsx:165` `toBeDisabled()`.

3/3.

---

## Discrimination Sensor

**Setup**: an isolated `git worktree add --detach` at `…/scratchpad/wt2` (HEAD 32cbc83), with `node_modules` symlinked from the real tree. Before any mutation, the target tests passed there: backend 4 files / 50 tests, frontend 10 files / 190 tests.

**Procedure**: each mutant was applied alone, then the targeted tests were run: backend `sessions`, `task-updated`, `tasks-origin` and `task-updated-origin-schema`; frontend `src/components/agenda/` and `src/pages/agenda.test.tsx`. The file was restored with `git checkout` after each run.

**Cleanup**: removed the worktree (`git worktree remove --force`, `git worktree prune`). The real tree's `git status --porcelain` equals the baseline.

| # | File | Mutation | Killed by | Killed? |
| - | ---- | -------- | --------- | ------- |
| 1 | `session-panel.tsx:119` | round 1 #40: Esc guard drops `!pickerOpen` | PICK-19 closes only the picker on Esc | ✅ |
| 2 | `session-task-picker.tsx:184` | round 1 defect restored: `onCreate(empty ? settled : '')` | PICK-12 hands the search text … with results | ✅ |
| 3 | `session-task-picker.tsx:184` | `onCreate('')` always | PICK-10, PICK-12 | ✅ |
| 4 | `session-task-picker.tsx:184` | `onCreate(text)` (untrimmed) | PICK-12 with results | ✅ |
| 5 | `routes/sessions.ts:105` | POST guard `writing` → `reading` (viewer creates) | PICK-20 | ✅ |
| 6 | `new-session-task-dialog.tsx:74` | fallback ignored: `defaultListId ?? lists[0]` | PICK-12 first list | ✅ |
| 7 | `new-session-task-dialog.tsx:74` | fallback picks `lists[1]` | PICK-12 first list | ✅ |
| 8 | `services/tasks.ts` createTask | `updatedAt: now` removed | PICK-01 created/duplicated | ✅ |
| 9 | `services/tasks.ts` updateTask | `updatedAt` not written | PICK-01 title/notes/estimate | ✅ |
| 10 | `services/tasks.ts` moveTaskToList | `updatedAt` removed | PICK-01 list move | ✅ |
| 11 | `services/tasks.ts` moveTask | same-column reorder updates | PICK-01 reorder | ✅ |
| 12 | `services/subtasks.ts` createSubtask | `touchTask` removed | PICK-01 subtasks | ✅ |
| 13 | `services/subtasks.ts` deleteSubtask | `touchTask` removed | PICK-01 subtasks | ✅ |
| 14 | `services/sessions.ts:273` | LIMIT 50 → 51 | PICK-04 up to 50 | ✅ |
| 15 | `services/sessions.ts:273` | LIMIT 10 → 11 | PICK-03 | ✅ |
| 16 | `services/sessions.ts:259` | `%`/`_` escaping removed | PICK-04 plain characters | ✅ |
| 17 | `services/sessions.ts:267` | ILIKE → LIKE | PICK-04 ×2 | ✅ |
| 18 | `services/sessions.ts:271` | archived filter removed | PICK-03/04 archived | ✅ |
| 19 | `services/sessions.ts` | `query.trim()` removed | PICK-05 | ✅ |
| 20 | `routes/sessions.ts` POST | column `today` | PICK-15 ×2 | ✅ |
| 21 | `routes/sessions.ts` POST | `createdFrom: 'agenda'` dropped | PICK-15 | ✅ |
| 22 | `services/board.ts:112` | coalesce → `p.name` | PICK-17 | ✅ |
| 23 | `session-task-picker.tsx:13` | debounce 300 → 250 | PICK-08 | ✅ |
| 24 | `new-session-task-dialog.tsx:84` | notes sent while switch off | PICK-15 no notes | ✅ |
| 25 | `session-panel.tsx:246` | Cancel does not reopen picker | PICK-19 back to picker | ✅ |
| 26 | `session-panel.tsx:144` | new-session save ignores `picked` | PICK-12 PICK-16 | ✅ |
| 27 | `session-panel.tsx:254` | created task not picked | PICK-12 PICK-16 | ✅ |
| 28 | `session-panel.tsx:119` | Esc guard drops `newTaskTitle === null` | PICK-19 Esc closes only the modal | ✅ |

**Sensor depth**: expanded (28 manual behaviour-level mutants: the 2 round 1 failures, 5 fix-round mutants and 21 from the round 1 classes)
**Result**: 28/28 killed ✅ PASS

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ the fix is one expression (`onCreate(query)`) |
| Surgical changes | ✅ fix round touches only the picker, three test files and the JSDoc placement; the round 1 orphaned-JSDoc note is resolved (`services/sessions.ts:277-280`, wording now `Editar sessão`, which is accurate) |
| No scope creep | ✅ |
| Matches patterns | ✅ |
| Spec-anchored outcome check | ✅ |
| Per-layer coverage | ✅ routes happy + 422/403/409/404; services 1:1 with PICK-01 |
| Every test maps to a requirement | ✅ every new test is named for PICK-12, PICK-19 or PICK-20 |
| Guidelines followed: `CONTRIBUTING.md`, vitest configs | ✅ |

**Non-blocking observation**: in the empty state, the button label uses the debounced `settled` (`session-task-picker.tsx:187`), but the click hands the live `query` (`:184`). For the up to 300 ms after a keystroke, `Criar “abc”` can therefore open the modal titled `abcd`. The handed text is the current search text, which is what PICK-12 says, so this is no gap. It is only a label/value lag, and no change is required.

---

## Test Integrity (fix round `e6df445..HEAD`)

- Only test lines were removed, and only in `session-panel.test.tsx`: the `pickTask` helper and its 4 call sites, now `chooseTask`. The two helper bodies were identical. Both did `click(combobox 'Task')` then `click(findByRole('option', { name: title }))`, so the merge changes no step and no assertion. Accepted.
- Three tests were added: `session-task-picker.test.tsx:140`, `session-panel.test.tsx:362`, `new-session-task-dialog.test.tsx:52`. Two assertions were added to an existing backend test (`sessions.test.ts:256-259`). Nothing was weakened.

---

## Gate Check

- **Gate command**: `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test` and `npm --prefix frontend run lint && npm --prefix frontend run typecheck && npm --prefix frontend test && npm --prefix frontend run build` (real tree, read-only)
- **Result**: backend 804 passed, 0 failed, 9 skipped (58 files + 1 skipped); frontend 1350 passed, 0 failed (143 files); lint and typecheck clean; build ✓; both exit 0
- **Since round 1**: backend 804 → 804 (assertions added to an existing test); frontend 1347 → 1350 (+3)
- **Skipped tests**: 9 backend tests in `describe.runIf(process.env.REDIS_URL)` (`test/ports/key-value-store.test.ts`, `test/worker.test.ts`). There is no Redis here, and the skip is pre-existing.
- **Failures**: none. The known flaky `focus-widget.test.tsx` test passed in this run.

---

## Fix Plans

None.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| PICK-01 … PICK-11 | ✅ Verified (round 1) | ✅ Verified |
| PICK-12 | ❌ Needs Fix | ✅ Verified |
| PICK-13 … PICK-18 | ✅ Verified (round 1) | ✅ Verified |
| PICK-19 | ✅ Verified (Esc on picker: test to add) | ✅ Verified |
| PICK-20 | ✅ Verified | ✅ Verified (no-create now asserted) |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 20/20 ACs matched; edge cases 3/3
**Sensor**: 28/28 mutations killed
**Gate**: backend 804 passed / 9 skipped, frontend 1350 passed, build ok

**What works**: everything round 1 listed works. In addition, `Criar nova tarefa` now carries the trimmed search with or without results. Esc closes only the picker, or only the modal. A viewer's 403 creates nothing. The modal falls back to the first active list.

**Issues found**: none blocking.

**Next steps**: interactive UAT of the picker and modal flow, if the user wants it, then open the PR.
