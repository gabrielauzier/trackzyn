# Agenda Validation

**Date**: 2026-11-04
**Round**: 2 - scoped
**Spec**: `.specs/features/agenda/spec.md`
**Diff range**: `d11f9e2..HEAD` (HEAD = `41c138f`, branch `feat/agenda`)
**Fix range**: `5daf2c3..HEAD` (1 planning commit `d1d2066` + 10 fix commits T20-T29)
**Previous round**: round 1 at `5daf2c3`, FAIL (9 ranked gaps, 4 surviving mutants: M6, F4, F6, F1)
**Verifier**: independent sub-agent, fresh for round 2 (author ≠ verifier)

**Verdict**: PASS ✅

Scope of this round: the fix diff `5daf2c3..HEAD` and every verdict that was not a plain PASS in round 1 (AGENDA-06, 10, 14, 16, 17, 18, 19, 20, 30, 34, 35, plus the duplicate-error and `pg-columns.json` items). It also covers the new route `GET /api/sessions/tasks`. Every other verdict is carried from round 1 unchanged and marked `carried from 5daf2c3`. The full gate was re-run at HEAD, so carried verdicts are still backed by green tests.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1-T19 | ✅ Done | carried from 5daf2c3 |
| T20-T29 | ✅ Done | verified at 41c138f: one commit each in `5daf2c3..HEAD`, every Done-when box checked in `tasks.md`, each claim re-checked below |

---

## Spec-Anchored Acceptance Criteria

Paths: `B/` = `backend-node/test/`, `F/` = `frontend/src/`. Tests assert the English copy. The pt-BR copy was matched against the spec in round 1. This round changed no locale file.

### Re-checked this round (verified at 41c138f)

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| AGENDA-06 | Overlapping sessions side by side, no block covering another | `F/lib/agenda/layout.test.ts:76` chain A 600-660, B 630-690, C 690-750 `toEqual({a:{lane:0,lanes:2},b:{lane:1,lanes:2},c:{lane:0,lanes:1}})`; still `:69`, `F/components/agenda/week-grid.test.tsx:94-95` | ✅ PASS (F1 now killed) |
| AGENDA-10 | Only the logged-in user's sessions in the current workspace | Reads: `B/services/sessions.test.ts:147` (carried). Writes: `B/services/sessions.test.ts:479-504` the same user's session in another workspace, `updateSession`/`deleteSession` → `toEqual({status:404,detail:'Session not found',code:undefined})` (`:492-497`), row unchanged `[workspaceId, startedAt, endedAt]` (`:499-503`); `B/routes/sessions.test.ts:274-292` PATCH/DELETE via `x-workspace-id` A → 404 `{detail:'Session not found'}` (`:285,288`), session still read in B (`:291`) | ✅ PASS (M6 now killed) |
| AGENDA-14 | Drag draws a draft snapped to 15 min; the panel opens with the date and both times | `F/pages/agenda.test.tsx:245-253` drag 17:32→18:41 on Tuesday: heading `New session`, `Date` `toHaveValue('2026-11-03')` (`:249`), `Start` `'17:30'`, `End` `'18:45'`, `[data-draft]` `'17:30 – 18:45'`; units carried | ✅ PASS |
| AGENDA-16 | Task or Interval; tasks of the active lists grouped by list, Done of any date included; interval list | Backend: `B/services/sessions.test.ts:507-537` every column + task done 10 days ago `toEqual([...{id:old,...,column:'done'}...])` (`:524`), archived list and other workspace left out `toEqual([kept])` (`:536`); `B/routes/sessions.test.ts:113-135` owner and viewer 200, full `toEqual` with the done task (`:123`), workspace-scoped `toEqual([taskId])` (`:134`). Panel: `F/components/agenda/session-panel.test.tsx:130-137` a done task only the route returns, in group `Work` (`:135`), `lists.board` `not.toHaveBeenCalled()` (`:136`); `:121-128` grouping; break list `:139+` | ✅ PASS. The SPEC_DEVIATION marker is gone (`grep SPEC_DEVIATION frontend/src` finds none for the agenda) |
| AGENDA-17 | Changing start/end in the panel moves the matching draft edge and updates the duration | `F/pages/agenda.test.tsx:255-266` End 19:00 → draft `'17:30 – 19:00'` (`:259`); Start 17:00 → draft `'17:00 – 19:00'`, `style.top` `y(17)px`, `style.height` `y(2)px`, duration `'2hr'` | ✅ PASS |
| AGENDA-18 | Pulling the draft's top or bottom edge changes start/end in 15-min steps and updates the panel fields | `F/pages/agenda.test.tsx:268-278` bottom handle 18:45→19:22 → `End` `'19:15'` (`:273`); top handle 17:30→17:08 → `Start` `'17:15'` (`:275`), draft `'17:15 – 19:15'` | ✅ PASS |
| AGENDA-19 | `Sobrepõe <título> (<HH:MM> – <HH:MM>). ...` against **another session of the user**, Save still enabled | `F/pages/agenda.test.tsx:105-126` filter `Work`, the Home session hidden from the grid, then New session → status `'Overlaps Fix the sink (13:50 – 14:03). The time in common counts in both.'` (`:125`); Save enabled is carried from `F/components/agenda/session-panel.test.tsx:153+` | ✅ PASS (new mutant N5 killed) |
| AGENDA-20 | Saved with `origin = manual`; block on the grid in the list color, without the draft handles | Backend carried (`B/services/sessions.test.ts:194-220`). UI: `F/pages/agenda.test.tsx:280-304` `create` called with the exact body, block `'Write the report, 17:30 – 18:45'`, `borderLeftColor 'var(--chart-3)'` (`:300`), no `[data-draft]` (`:301`), no `[data-handle]` on the block, panel closed | ✅ PASS |
| AGENDA-30 | Moving the whole ended block to another time **or day** saves the new start and end with the same length, snapped to 15 min | `F/lib/agenda/use-grid-drag.test.tsx:82-90` `onCommit` `toHaveBeenCalledWith({mode:'move',day:'2026-11-04',start:at(9,0),end:at(10,0),sessionId:'s1'})` (`:88`); a day that has not begun → `not.toHaveBeenCalled()` (`:97`); `F/pages/agenda.test.tsx:346-359` mocked column geometry, block moved Tuesday→Monday → `sessions.update('s2',{started_at:'2026-11-02T17:00:00.000Z',ended_at:'2026-11-02T18:00:00.000Z'})` | ✅ PASS (F4 now killed by 3 tests) |
| AGENDA-34 | 404 `Session not found` for a missing session or another user's session | Carried assertions plus the same user's other-workspace session (see AGENDA-10): `B/services/sessions.test.ts:492-497`, `B/routes/sessions.test.ts:285,288` | ✅ PASS |
| AGENDA-35 | A failed adjustment puts the block back at its previous time and shows a toast with the API message | `F/lib/agenda/use-agenda.test.tsx:76-92`: every later `sessions.list` rejects (offline), so only the snapshot can restore the cache. `toast.error('Session not found')` (`:90`), cache back to `started_at/ended_at` of 18:00 (`:91`). Grid path: `F/pages/agenda.test.tsx:369` toast `'Session not found'` after the block returns | ✅ PASS (F6 now killed) |

### New route `GET /api/sessions/tasks` (verified at 41c138f)

| Check | Evidence | Result |
| ----- | -------- | ------ |
| Happy path, payload by value | `B/routes/sessions.test.ts:116-125` `toEqual({tasks:[{id,title,list_id,list_name,list_color:3,column:'today'},{…column:'done'}]})` | ✅ |
| Scoped to the workspace | `B/routes/sessions.test.ts:128-135` stranger's task absent; `B/services/sessions.test.ts:536`; mutant N2 killed | ✅ |
| Active lists only | `B/services/sessions.test.ts:529-537`; mutant N1 killed | ✅ |
| Done of any date | `B/services/sessions.test.ts:520,524` (`completedAt` 10 days ago) | ✅ |
| Viewer reads | `B/routes/sessions.test.ts:116` loop over `[owner.token, viewer.token]` → 200; mutant N3 (`writing` guard) killed | ✅ |
| Closed to tokens (AD-007) | `B/support/token-routes.ts:31` in `CLOSED_AGENDA_ROUTES`; `B/routes/token-scopes.test.ts:93,96-100` → 403 `Route not available for tokens`; mutant N4 (declare `tokenScope`) killed | ✅ |
| Used by the panel | `F/components/agenda/session-panel.tsx` `useQuery(['lists','session-tasks'], sessionsApi.tasks)` grouped by `list_id`; `F/lib/api.ts` `sessions.tasks` → `GET /sessions/tasks`; panel test above; mutant N9 (no grouping filter) killed | ✅ |
| Route order | `GET /api/sessions/tasks` and `PATCH/DELETE /api/sessions/:id` use different methods, so they do not collide | ✅ |
| Design Surface | `design.md:167` row added | ✅ |

### Carried from 5daf2c3 (PASS in round 1, tests re-run green at 41c138f)

AGENDA-01, 02, 03, 04, 05, 07, 08, 09, 11, 12, 13, 15, 21, 22, 23, 24, 25, 26, 27, 28, 29, 31, 32, 33, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47. The evidence citations are in the round-1 table at `5daf2c3`. None of the cited assertions was removed or loosened in the fix range (see Test Integrity). One fixture moved: `session-panel.test.tsx` now mocks `sessions.tasks` instead of `lists.board`. The AGENDA-16 grouping test at `:121-128` keeps its three `toHaveTextContent` assertions.

**Spec-precision gaps (carried from 5daf2c3, flagged, not blocking)**:
- AGENDA-15 at :00-:04: the start becomes the previous full hour.
- AGENDA-43: the `+` is hidden on future days.
- The day view (<768 px) has no drag, handles or move; those ACs work through the panel fields there.

Each is an implementation choice inside the spec's text, not a contradiction of it. Lessons L-032/L-033 already cover the first two.

**Status**: ✅ All 47 ACs covered and matching the spec outcome. ⚠️ 3 spec-precision gaps flagged (carried).

**Payload/conjunction rule**: The new route payload is checked with a whole `toEqual`. The new 404 bodies are checked on `status` + `detail` (+ `code`). Row state after a refused write is checked by value.

---

## Round-1 Gap Closure (verified at 41c138f)

| # | Round-1 gap | Fix | Finding |
| - | ----------- | --- | ------- |
| 1 | AGENDA-30 cross-day move (F4) | T20 `1bebe28` | Closed. F4 killed by 3 tests (hook + page) |
| 2 | Edit/delete workspace scoping (M6) | T21 `30629fb` | Closed. M6 killed by a service test and a route test |
| 3 | AGENDA-35 rollback (F6) | T22 `1ab9474` | Closed. F6 killed with the refetch failing |
| 4 | AGENDA-16 SPEC_DEVIATION | T23 `68b8139`, T24 `42f906b` | Closed. New route, panel reads it, marker removed |
| 5 | AGENDA-19 overlap under a filter | T25 `edc447a` | Closed. `pages/agenda.tsx` reads an unfiltered query (`agendaKey({…listId:null})`) for `overlapping`; N5 killed |
| 6 | AGENDA-14/17/18/20 UI halves | T26 `5124e3c` | Closed. 4 page tests (see table) |
| 7 | AGENDA-06 chained lanes (F1) | T27 `0d90cd2` | Closed. F1 killed |
| 8 | Duplicate error on a failed panel edit | T28 `c807f4a` | Closed. `use-agenda.ts` `quiet` skips the toast; the page passes `quiet: true` only from the edit panel; `F/pages/agenda.test.tsx:215-216` alert `'Task not found'` + `toast.error` `not.toHaveBeenCalled()`; the grid path still toasts (`:369`); `F/lib/agenda/use-agenda.test.tsx:106-107` quiet → no toast, cache restored; N6/N7/N8 killed |
| 9 | `pg-columns.json` origin row | T29 `41c138f` | Accepted on the fixer's report, not re-run (read-only, no database started). `41c138f` changes only the comment at `B/db/pglite.test.ts:31-34` and `tasks.md`. The fixture `B/fixtures/pg-columns.json` has no change in the fix range, which is consistent with "the bytes matched". The comment now names PostgreSQL 16.15, 2026-11-04, through 0005. It replaces the old 0004 SPEC_DEVIATION note (read on 14.18) and claims every table re-read on 16. I can't verify that claim from the repo. It is test-infrastructure provenance, not an AC |

---

## Test Integrity (fix range `5daf2c3..HEAD`)

- `git diff 5daf2c3..HEAD` over every test file: **no removed or loosened `expect`**. The only removed lines are:
  - The old `pglite.test.ts` comment.
  - Import lists.
  - The `board()`/`TaskCardView` fixture and the `lists.board` mock in `session-panel.test.tsx`, replaced by `sessions.tasks`.
  - The 3-argument `drag()` helper in `use-grid-drag.test.tsx`, now `toX = 0`, which behaves the same for old callers.
  - The `sessions` mock object in `pages/agenda.test.tsx`, which gained `tasks`.
- `it(` counts: B routes/sessions 18→21, B services/sessions 25→28, F session-panel 25→26, F layout 8→9, F use-agenda 5→7, F use-grid-drag 9→11, F pages/agenda 18→25, pglite 3→3. No test was deleted.

---

## Discrimination Sensor (verified at 41c138f)

Isolated scratch: `git worktree add --detach <scratchpad>/wt2 HEAD`, with symlinked `node_modules`. Each mutation was applied by exact single-occurrence replacement, run, then reverted with `git checkout -- <file>`. The worktree was removed with `git worktree remove --force` and pruned. The real tree's `git status --porcelain` matched the recorded baseline before and after:
- modified: `.specs/LESSONS.md`, `.specs/lessons.json`
- untracked: `.checks/05-lote-foco-14-15-16.verified.md`, `.claude/launch.json`, `.specs/features/agenda/validation.md`, `trackzyn-dev.sql`

| Mutation | File | Description | Tests run | Killed? |
| -------- | ---- | ----------- | --------- | ------- |
| F4 (r1 survivor) | `frontend/src/lib/agenda/use-grid-drag.ts:105` | Move ignores `dayAt` (`const day = target.day`) | use-grid-drag, week-grid, pages/agenda | ✅ Killed (3 failed) |
| M6 (r1 survivor) | `backend-node/src/services/sessions.ts:190` | Dropped `workspaceId` from the edit/delete lookup | services, routes, token-scopes | ✅ Killed (2 failed) |
| F6 (r1 survivor) | `frontend/src/lib/agenda/use-agenda.ts:101` | Removed `restore(client, snapshot)` on a failed update | use-agenda, pages/agenda | ✅ Killed (1 failed) |
| F1 (r1 survivor) | `frontend/src/lib/agenda/layout.ts:122` | Group close `>=` → `>` | layout, week-grid | ✅ Killed (1 failed) |
| N1 | `backend-node/src/services/sessions.ts` `listSessionTasks` | Dropped `AND NOT l.is_archived` | services, routes, token-scopes | ✅ Killed |
| N2 | same | Dropped the `l.workspace_id` filter | same | ✅ Killed (3 failed) |
| N3 | `backend-node/src/routes/sessions.ts:78` | Tasks route guard `reading` → `writing` (viewer refused) | same | ✅ Killed |
| N4 | same | Tasks route declares `tokenScope: 'lists:read'` (opened to tokens) | same | ✅ Killed (2 failed) |
| N5 | `frontend/src/pages/agenda.tsx:84` | Overlap source = the list-filtered `sessions` | pages/agenda, session-panel | ✅ Killed |
| N6 | `frontend/src/lib/agenda/use-agenda.ts:102` | `quiet` ignored (always toast) | use-agenda, pages/agenda | ✅ Killed (2 failed) |
| N7 | `frontend/src/pages/agenda.tsx:274` | The edit panel no longer passes `quiet: true` | pages/agenda | ✅ Killed |
| N8 | `frontend/src/lib/agenda/use-agenda.ts:102` | `quiet` inverted | use-agenda, pages/agenda | ✅ Killed (6 failed) |
| N9 | `frontend/src/components/agenda/session-panel.tsx` | Task groups not filtered by `list_id` | session-panel | ✅ Killed (5 failed) |

Round-1 mutants M1-M5, M7-M9, F2, F3, F5, F7-F10 were killed at 5daf2c3 (carried). Their code is untouched by the fix range except `use-agenda.ts` `update.onError`, which N6/N8/F6 re-exercise.

**Sensor depth**: expanded (4 re-injected survivors + 9 new mutations on the fix surface)
**Result**: 13/13 killed - PASS ✅

---

## Code Quality (verified at 41c138f for the fix diff)

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ (one service function, one route, one query, one flag) |
| Surgical changes | ✅ (18 files, all on the gaps; no unrelated edits) |
| No scope creep | ✅ |
| Matches patterns | ✅ (`reading` guard, zod response schema, raw `sql` like `selectSessions`, query keys under `['lists']` so writes invalidate them) |
| Spec-anchored outcome check | ✅ |
| Per-layer Coverage Expectation met | ✅ (new route: happy, scoping, archived, viewer, token closure) |
| Every test maps to a spec requirement | ✅ |
| Documented guidelines followed: none found beyond spec/design; strong defaults applied | ✅ |

Not tested and outside the ACs (carried note): the spec assumption that a manual session moves the AD-002 `lastChange` cutoff still has no test.

---

## Edge Cases

- [x] AGENDA-44 viewer: carried. The new route is readable by a viewer (`B/routes/sessions.test.ts:116`)
- [x] AGENDA-45, 46, 47: carried from 5daf2c3
- [ ] Day view without drag: spec-precision gap, carried (see above)

---

## Gate Check (verified at 41c138f)

- **Gate command**: `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test` and `npm --prefix frontend run lint && npm --prefix frontend run typecheck && npm --prefix frontend test && npm --prefix frontend run build`
- **Result**:
  - Backend exit 0: 759 passed, 0 failed, 9 skipped (52 files passed, 1 skipped).
  - Frontend exit 0: 1197 passed, 0 failed (133 files). Lint and typecheck clean. Build ✓ (`index-*.js` 538.83 kB, the existing chunk-size note only).
- **Test count at 5daf2c3**: backend 753 + 9 skipped; frontend 1184
- **Test count at 41c138f**: backend 759 + 9 skipped; frontend 1197
- **Delta**: +6 backend, +13 frontend
- **Skipped tests**: the same 9 Redis-gated tests (`describe.runIf(process.env.REDIS_URL)`), older than the feature
- **Failures**: none

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| AGENDA-01..47 | Implementing | ✅ Verified |

`spec.md` traceability rows were set to `Verified`.

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 47/47 ACs matched the spec outcome. 3 spec-precision gaps flagged (carried, not blocking).
**Sensor**: 13/13 killed this round (the 4 round-1 survivors included)
**Gate**: backend 759 passed / 0 failed / 9 skipped; frontend 1197 passed / 0 failed; lint, typecheck and build clean

**What works**: All 9 round-1 gaps are closed with discriminating tests. The new `GET /api/sessions/tasks` is scoped, readable by a viewer, closed to tokens, and used by the panel.

**Residual notes (non-blocking)**:
- The `pg-columns.json` provenance comment is accepted on the fixer's report.
- The AD-002 `lastChange` assumption has no test.
- The 3 spec-precision gaps.

**Next steps**: None required for the gate.
