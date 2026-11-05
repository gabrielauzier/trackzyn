# Tarefa da nova sessão Validation

**Date**: 2026-11-04
**Spec**: `.specs/features/session-task-picker/spec.md`
**Diff range**: `4bdf1d3..HEAD` (T1 8cc9b22, T2 6d78ce9, T3 25eca0c, T4 bcfcee8, T5 118cbe4, T6 f829b22, T7 2b2417b, T8 935932f)
**Verifier**: independent sub-agent (author ≠ verifier)

**Verdict**: ❌ FAIL — 1 AC gap (PICK-12, title not prefilled from a search that has results) and 1 surviving mutant (Esc with the picker open). Everything else is covered with spec-anchored assertions; both fixes are small.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 | ✅ Done | migration, schema, fixture appends only the two `tasks` columns |
| T2 | ✅ Done | every write of PICK-01 sets `updated_at`; reorder does not |
| T3 | ✅ Done | `created_via` coalesce on the board and in `getTask` |
| T4 | ✅ Done | new `GET /api/sessions/tasks/search`; old route still answers every task |
| T5 | ✅ Done | `POST /api/sessions/tasks` |
| T6 | ⚠️ Partial | `Criar nova tarefa` hands `''` even when a search with results is typed (PICK-12) |
| T7 | ✅ Done | - |
| T8 | ✅ Done | Esc guard on an open picker untested (mutant 40) |

---

## Spec-Anchored Acceptance Criteria

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| PICK-01 last update kept | set on create, duplicate, title/notes/estimate change, column move, list move, subtask create/change/delete; reorder does NOT | `backend-node/test/services/task-updated.test.ts:42,44` create/duplicate `toBe(CREATED/LATER)`; `:51` empty PATCH keeps `CREATED`; `:55` each field `toBe(at)`; `:63-64` same-column reorder keeps both `CREATED`; `:67` column move `LATER`, `:68` neighbour unchanged; `:74` list move `LATER`; `:81,84,88` subtask create/update/delete; `:86` subtask reorder unchanged | ✅ PASS |
| PICK-02 backfill | `greatest(created_at, completed_at)` | `backend-node/test/db/task-updated-origin-schema.test.ts:56` open `toBe('2026-10-01T10:00:00.000Z')`; `:57` done `toBe('2026-10-05T18:30:00.000Z')` (migration run on pre-0009 data) | ✅ PASS |
| PICK-03 no `q` → 10 latest, non-archived, most recent first | exactly 10, DESC | `backend-node/test/routes/sessions.test.ts:159` `toEqual(ids.slice(0, 10))` over 12 tasks; `:160` DESC; `:203` archived `not.toContain(old)` | ✅ PASS |
| PICK-04 `q` → ≤50 latest, contains, ignore case, all lists, concluded too | 50, ILIKE, `%`/`_` literal | `sessions.test.ts:170` `?q=REVIS` `toEqual([pr, budget, contract])` (two lists, one done); `:177-178` `toHaveLength(50)` of 52 in order; `:185` `50%` → `[percent]` only; `:186` `a_b` → `[]`; `:204` archived `?q=old` → `[]`; `:209` 256 chars → 422 | ✅ PASS |
| PICK-05 blank `q` = no `q` | same answer | `sessions.test.ts:192-193` `?q=%20%20%20` equals no-q, first is latest; frontend `session-task-picker.tsx:55` trims before asking | ✅ PASS |
| PICK-06 popover: focused search, `As 10 atualizadas por último`, tasks, `Criar nova tarefa` after the list | exact copy, order | `frontend/src/components/agenda/session-task-picker.test.tsx:57` `toHaveFocus()`; `:58` caption; `:62` create follows last option; `:162-163` pt-BR `As 10 atualizadas por último`, `Criar nova tarefa`; panel `session-panel.test.tsx:323,325,329` picker for new, select for edit. "below it" only in code (`session-task-picker.tsx:99` `side="bottom"`) | ✅ PASS (visual position not asserted) |
| PICK-07 groups in list order, latest first, `Concluída` | order + mark | `session-task-picker.test.tsx:71` `toEqual(['Frete','ADSet'])` though API order is ADSet first; `:72` in-group order and `Done` suffix; pt-BR `Concluída` at `new-session-task-dialog.test.tsx:133` + `pt-BR.json` `picker.done`. List colour swatch (`session-task-picker.tsx:149`) not asserted | ✅ PASS / ⚠️ colour unasserted |
| PICK-08 300 ms debounce, count line, highlight | not before 300 ms, once, `N tarefas para “<texto>”, em todas as listas` | `session-task-picker.test.tsx:90,94` not called at 299 ms; `:98-99` called once with `'revis'` at 300 ms; `:103` `'2 tasks for “revis”, in every list'`; `:104` marks `['Revis','revis']`. pt-BR copy read in `pt-BR.json` (`results_other`), not asserted | ✅ PASS |
| PICK-09 clear → empty + recent | | `session-task-picker.test.tsx:116` `toHaveValue('')`; `:117-118` caption and recent option back | ✅ PASS |
| PICK-10 no match → `Nenhuma tarefa encontrada`, `Criar “<texto>”` | | `session-task-picker.test.tsx:128` `No task found`; `:129-130` `onCreate` `toHaveBeenCalledWith('zzz')`; panel `session-panel.test.tsx:340` | ✅ PASS |
| PICK-11 pick closes and shows | | `session-task-picker.test.tsx:144` `onChange` with f1; `:145` no dialog; `:147` field text; panel `session-panel.test.tsx:348` | ✅ PASS |
| PICK-12 modal: list filter else first, title = search text else empty, estimate, switch off, Cancelar/Adicionar | title is the search text **whenever there is one** | `new-session-task-dialog.test.tsx:43-49`; panel `session-panel.test.tsx:343-344` (title from empty-state, list `Home` from filter); `session-task-picker.test.tsx:137` empty title without search. **Gap**: `session-task-picker.tsx:183` `onCreate(empty ? settled : '')` hands `''` from `Criar nova tarefa` while a search with results is typed; no test covers it. "else the first list" fallback (`new-session-task-dialog.tsx:74`, `pages/agenda.tsx:310`) not asserted | ❌ GAP |
| PICK-13 notes editor while switch on | | `new-session-task-dialog.test.tsx:55` shown, `:57` hidden again | ✅ PASS |
| PICK-14 board messages, nothing created | `Use no máximo 255 caracteres`, `Use de 1 a 1440 minutos`, required title | frontend `new-session-task-dialog.test.tsx:63,68,69,70` (same `board.*` keys as the board form); backend `sessions.test.ts:250` 422 ×4, `:252` count unchanged | ✅ PASS |
| PICK-15 created in list, `done`, now, by user, origin `agenda`, estimate, notes only while on | | backend `sessions.test.ts:222-233` (`column:'done'`, `estimate_minutes:45`, `notes`, `created_via:'Agenda'`, `createdFrom:'agenda'`, `completedByUserId: owner.id`, `completedAt >= before`); frontend `new-session-task-dialog.test.tsx:82` exact payload with notes; `:96` exact payload without notes after switching off; `:104` chosen list | ✅ PASS |
| PICK-16 modal + popover close, field shows new task | | `session-panel.test.tsx:347` no dialog; `:348` field text; `:350` save sends `task_id: 't9'` | ✅ PASS |
| PICK-17 `via Agenda` on card and `Editar tarefa` | `created_via: 'Agenda'` rendered as `via {{name}}` | backend `tasks-origin.test.ts:123` task, `:128` board; frontend label already proven `task-card.test.tsx:25-27`, `task-dialog.test.tsx:46-50` (`via n8n flow`); pt-BR `via Agenda` at `new-session-task-dialog.test.tsx:134` | ✅ PASS (by composition) |
| PICK-18 failure keeps modal + input + API error | | `new-session-task-dialog.test.tsx:111` alert text; `:112` title kept; `:113-114` not closed | ✅ PASS |
| PICK-19 Cancel/Esc/close → nothing created, popover stays open | | `new-session-task-dialog.test.tsx:120,123,124`; panel `session-panel.test.tsx:362-365` picker back with `zzz`, no create, panel not cancelled; `:375-376` Esc closes modal only. Close (X) button not exercised separately (same `onOpenChange(false)` path) | ✅ PASS |
| PICK-20 non-writer → 403, nothing created | | `sessions.test.ts:256` `toBe(403)`; 409 `:259`, 404 `:261`; token closure `token-scopes.test.ts:93` via `CLOSED_AGENDA_ROUTES`. "creates nothing" not asserted for the viewer call | ✅ PASS / ⚠️ no-create unasserted |

**Status**: 19/20 ACs covered with spec-anchored assertions; ❌ PICK-12 gap; ⚠️ minor unasserted details (PICK-06 position, PICK-07 colour, PICK-12 first-list fallback, PICK-20 no-create, several pt-BR strings checked only in `pt-BR.json`).

---

## Edge Cases

- [x] Task created by the Agenda is the first of the 10 recent — `sessions.test.ts:267` `recent[0].id` equals created id.
- [x] Search of only spaces shows the 10 recent — backend `sessions.test.ts:192-193`; frontend trims (`session-task-picker.tsx:55`, `lib/api.ts` omits blank `q`).
- [x] No non-archived list → `Criar nova tarefa` disabled — `session-task-picker.test.tsx:153` `toBeDisabled()` (mutant 32 killed).

3/3.

---

## Discrimination Sensor

Isolated scratch: `git worktree add --detach` at `.../scratchpad/wt`, node_modules symlinked; each mutant applied alone, targeted test files run, file restored. Worktree removed (`git worktree remove --force`, `git worktree prune`).

| # | File | Mutation | Killed? |
| - | ---- | -------- | ------- |
| 1 | `drizzle/0009_task_updated_and_origin.sql:4` | backfill `created_at` only | ✅ |
| 2 | `src/services/tasks.ts` createTask | `updatedAt: now` removed | ✅ |
| 3 | `src/services/tasks.ts` duplicateTask | `updatedAt: now` removed | ✅ |
| 4 | `src/services/tasks.ts` updateTask | `updatedAt` not written | ✅ |
| 5 | `src/services/tasks.ts` moveTask | column change does not update | ✅ |
| 6 | `src/services/tasks.ts` moveTask | same-column reorder updates | ✅ |
| 7 | `src/services/tasks.ts` moveTaskToList | `updatedAt` removed | ✅ |
| 8 | `src/services/subtasks.ts` createSubtask | `touchTask` removed | ✅ |
| 9 | `src/services/subtasks.ts` updateSubtask | `touchTask` removed | ✅ |
| 10 | `src/services/subtasks.ts` deleteSubtask | `touchTask` removed | ✅ |
| 11 | `src/services/board.ts:112` | coalesce → `p.name` | ✅ |
| 12 | `src/services/tasks.ts` getTask | `createdVia(...)` → token name only | ✅ |
| 13 | `src/services/sessions.ts` | LIMIT 10↔50 swapped | ✅ |
| 14 | `src/services/sessions.ts` | ORDER BY `updated_at` dropped | ✅ |
| 15 | `src/services/sessions.ts` | ILIKE → LIKE | ✅ |
| 16 | `src/services/sessions.ts` | escaping removed | ✅ |
| 17 | `src/services/sessions.ts` | archived filter removed | ✅ |
| 18 | `src/services/sessions.ts` | trim removed | ✅ |
| 19 | `src/routes/sessions.ts` POST | column `today` | ✅ |
| 20 | `src/routes/sessions.ts` POST | `createdFrom` not set | ✅ |
| 21 | `src/routes/sessions.ts` POST | `rejectArchived` off | ✅ |
| 22 | `src/routes/sessions.ts` POST | `writing` → `reading` guard | ✅ |
| 23 | `src/routes/sessions.ts` search | `q` max 255 removed | ✅ |
| 24 | `session-task-picker.tsx:13` | debounce 300 → 0 | ✅ |
| 25 | `session-task-picker.tsx:13` | debounce 300 → 200 | ✅ |
| 26 | `session-task-picker.tsx:64-70` | groups not in list order | ✅ |
| 27 | `session-task-picker.tsx:167` | `Concluída` mark removed | ✅ |
| 28 | `session-task-picker.tsx:30` | highlight removed | ✅ |
| 29 | `session-task-picker.tsx:126` | clear does not reset text | ✅ |
| 30 | `session-task-picker.tsx:183` | empty-state create passes `''` | ✅ |
| 31 | `session-task-picker.tsx:76` | picking does not close | ✅ |
| 32 | `session-task-picker.tsx:178` | create enabled without lists | ✅ |
| 33 | `new-session-task-dialog.tsx:84` | notes sent while switch off | ✅ |
| 34 | `new-session-task-dialog.tsx:82` | chosen list ignored | ✅ |
| 35 | `new-session-task-dialog.tsx:92` | API error closes the modal | ✅ |
| 36 | `new-session-task-dialog.tsx:69` | title max 255 → 256 | ✅ |
| 37 | `session-panel.tsx:144` | new-session save ignores `picked` | ✅ |
| 38 | `session-panel.tsx:246` | Cancel does not reopen picker | ✅ |
| 39 | `session-panel.tsx:119` | Esc guard removed (modal) | ✅ |
| 40 | `session-panel.tsx:119` | Esc guard ignores an open picker (`!pickerOpen` dropped) | ❌ Survived |
| 41 | `session-panel.tsx:254` | created task not picked | ✅ |
| 42 | `session-panel.tsx:249` | Agenda list filter not passed to modal | ✅ |

**Sensor depth**: expanded (42 manual behaviour-level mutants)
**Result**: 41/42 killed — ❌ FAIL (mutant 40)

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ |
| Surgical changes | ⚠️ `backend-node/src/services/sessions.ts:253-256`: the JSDoc of `listSessionTasks` now sits orphaned above `RecentSessionTask` (new code inserted between the comment and its function) |
| No scope creep | ✅ |
| Matches patterns | ✅ (reuses `createTask`, `createTaskBody`, `toTaskRead`, board form keys, `NoteEditor`) |
| Spec-anchored outcome check | ⚠️ PICK-12 gap |
| Per-layer coverage | ✅ routes happy + 422/403/409/404; services 1:1 with PICK-01 list |
| Every test maps to a requirement | ✅ |
| Guidelines followed: `CONTRIBUTING.md`, vitest configs | ✅ |

Minor notes: `session-panel.test.tsx:92-102` `chooseTask` and `pickTask` are identical bodies; `session-panel.tsx:101` still fetches the full task list for a new session (only editing uses it); after `onCreated` the picker keeps its old search text internally (not spec'd).

---

## Points judged

- **Search route moved to `/api/sessions/tasks/search`**: sound; spec PICK-03/04 amended in bcfcee8. Old route unchanged in `routes/sessions.ts:79` and still answers every task: AGENDA-16 tests unchanged (`sessions.test.ts:115-138`, exact `toEqual`) plus `:211` `toHaveLength(12)` with 12 tasks (more than 10).
- **PICK-17 amendment** (card + `Editar tarefa`): the spec in range already reads that way; backend asserts both readings (`tasks-origin.test.ts:123,128`), and both components render `created_via` through `board.createdVia` (`task-card.tsx:136-138`, `task-dialog.tsx:52-54`). Accepted.
- **T8 submit for a new session uses `picked`** (`session-panel.tsx:144-148`): correct and needed. A just-created task is not in the cached full list, so the old lookup would silently drop the save; mutant 37 proves the test (`session-panel.test.tsx:350`) depends on it. Editing still uses the full list (`:149+`). Accepted.
- **Adapted panel/page tests**: removed lines are only the mock (`sessions.tasks` → also `searchTasks`) and `chooseTask` → `pickTask` (same steps). The assertions on grouping by list (`session-panel.test.tsx:131-134`), done task offered (`:142-143`, `lists.board` not called), saving the chosen task (AGENDA-20 payload), overlap and error messages are unchanged. Nothing weakened.
- **`role="combobox"` + `aria-haspopup="dialog"`** (`session-task-picker.tsx:89-90`): appropriate for a trigger that opens a popover with its own search; it also distinguishes new from edit in `session-panel.test.tsx:323,329`. Accepted.
- **`pg-columns.json`**: diff is 12 added lines inside `tasks`, after `created_via_token_id`: `updated_at` (timestamptz, not null) and `created_from` (character varying, nullable, 16). Nothing else changed. Accepted.

---

## Gate Check

- **Gate command**: `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test` and `npm --prefix frontend run lint && npm --prefix frontend run typecheck && npm --prefix frontend test && npm --prefix frontend run build` (real tree, read-only)
- **Result**: backend 804 passed, 0 failed, 9 skipped (58 files + 1 skipped); frontend 1347 passed, 0 failed (143 files); build ✓; lint and typecheck clean; both exit 0
- **Skipped tests**: 9 backend, `describe.runIf(process.env.REDIS_URL)` in `test/ports/key-value-store.test.ts:94` and `test/worker.test.ts:9` (no Redis here); pre-existing
- **Test declarations**: backend 611 → 631 (+20), frontend 1153 → 1175 (+22); none deleted, none weakened

---

## Fix Plans

### Fix 1: `Criar nova tarefa` ignores a search that has results (PICK-12) — Major

- **Root cause**: `frontend/src/components/agenda/session-task-picker.tsx:183` `onCreate(empty ? settled : '')`.
- **Fix task**: hand the trimmed search text whenever there is one (`onCreate(query)` or `settled`), keep `''` without a search; add a picker test: type `revis` (results shown), click `Create new task`, expect `onCreate` with `'revis'`.
- **Done when**: the new test passes and the existing PICK-10/PICK-12 tests still pass.

### Fix 2: Esc with only the picker open is untested (mutant 40) — Minor

- **Root cause**: no test presses Esc while the popover is open and the modal is closed; `session-panel.tsx:119` `!pickerOpen` can be removed unnoticed.
- **Fix task**: in `session-panel.test.tsx`, open the picker, press Esc, assert the popover closed and `onCancel` not called.
- **Done when**: mutant 40 is killed.

### Optional hardening

- `sessions.test.ts:256`: assert the task count is unchanged after the viewer's 403 (PICK-20 "creates nothing").
- Dialog test for the first-list fallback when `defaultListId` is not an active list (`new-session-task-dialog.tsx:74`).
- Move the orphaned JSDoc back onto `listSessionTasks` (`services/sessions.ts:253-256`).

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| PICK-01 … PICK-11 | In Tasks | ✅ Verified |
| PICK-12 | In Tasks | ❌ Needs Fix |
| PICK-13 … PICK-18 | In Tasks | ✅ Verified |
| PICK-19 | In Tasks | ✅ Verified (Esc on picker: test to add) |
| PICK-20 | In Tasks | ✅ Verified |

---

## Summary

**Overall**: ⚠️ Issues — FAIL until Fix 1 and Fix 2 land

**Spec-anchored check**: 19/20 ACs matched; 1 gap (PICK-12); edge cases 3/3
**Sensor**: 41/42 mutations killed (survivor: mutant 40)
**Gate**: backend 804 passed / 9 skipped, frontend 1347 passed, build ok

**What works**: `updated_at` upkeep and backfill, origin `agenda` and `via Agenda`, the search route (10/50, order, ILIKE, literal `%`/`_`, trim, archived out, 422), the create route (done, by user, origin, 403/409/404/422), the picker (debounce, grouping, mark, highlight, clear, empty state), the modal (notes switch, validation, error stays open, Cancel/Esc), the panel wiring.

**Next steps**: Fix 1 and Fix 2, then re-verify.
