# Esconder sessões curtas Validation

**Date**: 2026-11-04
**Spec**: `.specs/features/hide-short-sessions/spec.md`
**Diff range**: `7f28241..HEAD` (180e30d, 2d5b426, 0be6342, 0264756, 4f753f8, 74bc9a9, 89aa93b, 68422d4)
**Verifier**: independent sub-agent (author ≠ verifier)
**Verdict**: FAIL

One discrimination-sensor mutant survived (F10: the Agenda page stops passing `hidden` to `DayTimeline`, so the
day view on a phone draws every short session, and no test fails). Every AC has located evidence and both full gates
are green; the FAIL is the surviving mutant, which validate.md routes to a fix task.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 Coluna `min_session_minutes` | ✅ Done | 180e30d |
| T2 Ler e gravar o mínimo | ✅ Done | 2d5b426 |
| T3 Filtro da aba Sessões | ✅ Done | 0be6342 |
| T4 Regra `isHiddenSession` | ✅ Done | 0264756 |
| T5 Semana | ✅ Done | 4f753f8 |
| T6 Dia | ✅ Done | 74bc9a9 |
| T7 Página da Agenda | ⚠️ Done, weak proof | 89aa93b - the day-view wiring (`frontend/src/pages/agenda.tsx:274` `hidden={hidden}`) has no page-level test (mutant F10 survived) |
| T8 Tela de configurações | ✅ Done | 68422d4 |

---

## Spec-Anchored Acceptance Criteria

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| HIDE-01 | Column per workspace, off (null) by default, 1..60 | `backend-node/test/db/workspace-min-session-schema.test.ts:42` - `expect(await minOf()).toBeNull()` (row written before 0007); `:53`/`:54` - `rejects.toThrow(/ck_workspaces_min_session_minutes/)` for 0 and 61; 1 and 60 accepted just above | ✅ PASS |
| HIDE-02 | `min_session_minutes` returned, `null` when off, to every member | `backend-node/test/routes/workspaces.test.ts:71` - `toHaveProperty('min_session_minutes', null)` on `/current`; `:73` same on the list; loop over owner, editor, viewer | ✅ PASS |
| HIDE-03 | Owner PATCH with 1..60 or null saves and returns it | `backend-node/test/routes/workspaces.test.ts:83` - `.toBe(5)`; `:87` - `toMatchObject({ name: 'Renamed', min_session_minutes: 5 })` (absent keeps); `:90` - `.toBe(edge)` for 1 and 60; `:95` - `toBeNull()` | ✅ PASS |
| HIDE-04 | 422 below 1, above 60, not whole; value kept | `backend-node/test/routes/workspaces.test.ts:106` - `expect(refused.statusCode).toBe(422)` for 0, 61, 1.5, "5"; `:108` - `minOf(...)).toBe(10)` | ✅ PASS |
| HIDE-05 | 403 to non-owner; value kept (manager counts as owner) | `backend-node/test/routes/workspaces.test.ts:118` - `.toBe(403)` editor and viewer; `:120` - `.toBe(10)`; `:125` - `toMatchObject({ role: 'manager', min_session_minutes: 3 })` | ✅ PASS |
| HIDE-06 | Below timezone: switch `Esconder sessões curtas`, field `Menos de` only while on | `frontend/src/pages/workspace-settings.test.tsx:66` - `compareDocumentPosition(...) & DOCUMENT_POSITION_FOLLOWING`; `:68` - `minutesField()).toBeNull()` while off; `:80` - `toHaveValue(15)` stored; `:135` - switch named `Esconder sessões curtas`; `:136` - `getByLabelText('Menos de')).toHaveValue(5)` | ✅ PASS |
| HIDE-07 | Turning on from off fills 1 | `frontend/src/pages/workspace-settings.test.tsx:86` - `expect(minutesField()).toHaveValue(1)` | ✅ PASS |
| HIDE-08 | Saving with switch off sends `min_session_minutes: null` | `frontend/src/pages/workspace-settings.test.tsx:100` - `mock.calls[1]).toEqual(['ws', objectContaining({ min_session_minutes: null })])`; `:95` the on case sends 5 | ✅ PASS |
| HIDE-09 | Out of 1..60 or not whole: message `Entre 1 e 60 minutos.`, nothing sent | `frontend/src/pages/workspace-settings.test.tsx:108` - `getByText('Between 1 and 60 minutes.')` for 0, 61, 1.5; `:112` - `update).not.toHaveBeenCalled()`. The pt-BR wording is only in `frontend/src/locales/pt-BR.json:470` and not asserted (gap 3) | ✅ PASS (minor gap) |
| HIDE-10 | Non-owner sees switch and field disabled with stored value | `frontend/src/pages/workspace-settings.test.tsx:124` - `toggle).toBeDisabled()`; `:126` - `minutesField()).toBeDisabled()`; `:127` - `toHaveValue(10)` | ✅ PASS |
| HIDE-11 | Closed session < X×60 s not drawn, week **or day** view | `frontend/src/lib/agenda/hide.test.ts:32` - 4 min 59 s `.toBe(true)`; `:41` break `.toBe(true)`; `frontend/src/components/agenda/week-grid.test.tsx:103` - `[data-session-id="short"]).toBeNull()`; `frontend/src/components/agenda/day-timeline.test.tsx:126` - `[data-session-id="b"]).toBeNull()`; page, week view only: `frontend/src/pages/agenda.test.tsx:189` - `queryByRole('button', { name: '... 10:30 – 10:32' })).toBeNull()` | ⚠️ PASS with gap - the page's day view is not proven (F10 survived, gap 1) |
| HIDE-12 | Exactly X×60 s or more is drawn | `frontend/src/lib/agenda/hide.test.ts:36` - exactly 5 min `.toBe(false)`; `:37` 6 min `.toBe(false)`; `frontend/src/components/agenda/week-grid.test.tsx:104` - long block `.not.toBeNull()` | ✅ PASS |
| HIDE-13 | Open session always drawn | `frontend/src/lib/agenda/hide.test.ts:28` - `isHiddenSession(session(null), 5)).toBe(false)` | ✅ PASS |
| HIDE-14 | Hidden sessions count in day total (week header, day view) | `frontend/src/components/agenda/week-grid.test.tsx:109` - header `toHaveTextContent('1hr 2min')`; `frontend/src/components/agenda/day-timeline.test.tsx:128` - heading `'Tuesday, November 3, 2026 · 1hr 2min'` | ✅ PASS |
| HIDE-15 | Hidden out of overlap warning and side-by-side layout (full width) | `frontend/src/components/agenda/week-grid.test.tsx:114` - `style.width).toBe('100%')`; `frontend/src/components/agenda/day-timeline.test.tsx:133` - `.toBe('100%')`; `frontend/src/pages/agenda.test.tsx:204` - `queryByRole('status')).toBeNull()`; control `:212` - warning shown with the minimum off | ✅ PASS |
| HIDE-16 | Minimum off: every session drawn | `frontend/src/lib/agenda/hide.test.ts:23`/`:24` - `.toBe(false)` with null; `frontend/src/components/agenda/week-grid.test.tsx:120` - `style.width).toBe('50%')`; `frontend/src/pages/agenda.test.tsx:194` - 10:30 – 10:32 `toBeInTheDocument()` | ✅ PASS |
| HIDE-17 | Saved below X: block leaves the grid, panel closes | `frontend/src/pages/agenda.test.tsx:228` - `queryByRole('button', { name: /^Write the report, 10:00/ })).toBeNull()`; `:230` - `queryByRole('heading', { name: 'Write the report' })).toBeNull()` | ✅ PASS |
| HIDE-18 | New minimum applied on next workspace read, no reload | `frontend/src/pages/agenda.test.tsx:241` - short block `toBeNull()` after the context changes; `:244` - `sessions.list).toHaveBeenCalledTimes(loads)` | ✅ PASS |
| HIDE-19 | Report leaves out every piece of closed session < X×60 s | `backend-node/test/services/reports-sessions.test.ts:216` - `ids(report)).toEqual([['2026-10-21', [longer, exact]]])` (4:59 out); `:224` break - `report.days).toEqual([])`; route: `backend-node/test/routes/reports.test.ts:138` - `expect(after).not.toContain(short)`, `:137` keeps long | ✅ PASS |
| HIDE-20 | Session crossing midnight ≥ X kept on both days even with a short piece | `backend-node/test/services/reports-sessions.test.ts:234` - `['2026-10-22', [late]]` + 21st; `:237` - seconds `[2 * M, 178 * M]`; inverse `:244` - 4 min crossing hidden on both | ✅ PASS |
| HIDE-21 | Open session kept whatever length | `backend-node/test/services/reports-sessions.test.ts:254` - `objectContaining({ id: open, ended_at: null, seconds: M })` | ✅ PASS |
| HIDE-22 | Day with all hidden is left out | `backend-node/test/services/reports-sessions.test.ts:266` - `ids(report)).toEqual([['2026-10-21', [kept]]])` | ✅ PASS |
| HIDE-23 | Overview counts hidden sessions as today | `backend-node/test/services/reports-sessions.test.ts:278` - `expect(on).toEqual(off)`; `:279` - `task_seconds: 62 * M, break_seconds: 3 * M` | ✅ PASS |
| HIDE-24 | Minimum off returns every session | `backend-node/test/services/reports-sessions.test.ts:286` - `[['2026-10-21', [tiny]]]` (30 s) | ✅ PASS |

**Status**: 24/24 ACs have located, spec-matching assertions; HIDE-11 is only half-proven at the page level (day view). No spec-precision gaps: every AC names a concrete value or state.

---

## Edge Cases

- [x] Exactly X minutes is shown - `frontend/src/lib/agenda/hide.test.ts:36`, `backend-node/test/services/reports-sessions.test.ts:216` (`exact` kept)
- [x] Every session of a day hidden in the Agenda: total shown, no blocks, no AGENDA-42 empty message - `frontend/src/components/agenda/day-timeline.test.tsx:138` - `toHaveLength(0)`; `:140` - empty message `toBeNull()`
- [~] Workspace changes: minimum of the current workspace - by construction (`frontend/src/pages/agenda.tsx` reads `current?.min_session_minutes`; `backend-node/src/routes/reports.ts:106` passes `request.workspace.workspace`, resolved per request). Indirect evidence: `frontend/src/pages/agenda.test.tsx:241` (context change redraws) and `backend-node/test/routes/reports.test.ts:138` (route uses the request's workspace). No test switches between two workspaces with different minimums (gap 2, low)

---

## Discrimination Sensor

Run in a detached `git worktree` under the scratchpad with `node_modules` symlinked; each mutant applied alone, tested, reverted with `git checkout`. Sensor depth: expanded (29 mutants).

| # | File | Mutation | Killed by | Result |
| - | ---- | -------- | --------- | ------ |
| M1 | `backend-node/src/services/reports-sessions.ts:40` | SQL `>=` → `>` at the X boundary | HIDE-19 4:59/5:00/6:00 | ✅ Killed |
| M2 | `backend-node/src/services/reports-sessions.ts:40` | hide the open session (`IS NULL OR` → `IS NOT NULL AND`) | HIDE-21 | ✅ Killed |
| M3 | `backend-node/src/services/reports-sessions.ts:40` | piece length `p.pz - p.pa` instead of whole session | HIDE-20 | ✅ Killed |
| M4 | `backend-node/src/services/reports-sessions.ts:38` | ignore the minimum (always null) | 5 tests incl. route HIDE-19 | ✅ Killed |
| M5 | `backend-node/src/routes/workspaces.ts:118` | PATCH ignores `null` (`!== undefined` → `!= null`) | HIDE-03 | ✅ Killed |
| M6 | `backend-node/src/routes/workspaces.ts:46` | zod `.int().min(1).max(60)` removed | HIDE-04 | ✅ Killed |
| M6b | `backend-node/src/routes/workspaces.ts:46` | zod `.int()` removed only | HIDE-04 (1.5) | ✅ Killed |
| M7 | `backend-node/src/routes/schemas.ts:45` | read always returns `null` | HIDE-03/04/05 | ✅ Killed |
| M8 | `backend-node/src/routes/reports.ts:106` | route passes `minSessionMinutes: null` to `sessionsReport` | route HIDE-19 | ✅ Killed |
| M9 | `backend-node/src/services/reports-sessions.ts:40` | `make_interval(mins =>` → `secs =>` | 4 tests | ✅ Killed |
| M10 | `backend-node/drizzle/0007_workspace_min_session.sql:3` | CHECK widened to `BETWEEN 0 AND 61` | HIDE-01 bounds | ✅ Killed |
| F1 | `frontend/src/lib/agenda/hide.ts:10` | `<` → `<=` | HIDE-12 | ✅ Killed |
| F2 | `frontend/src/lib/agenda/hide.ts:9` | open session hidden | HIDE-13 | ✅ Killed |
| F3 | `frontend/src/components/agenda/week-grid.tsx:90` | filter before `dayPieces`, header total drops | HIDE-14 week | ✅ Killed |
| F4 | `frontend/src/components/agenda/day-timeline.tsx:66` | filter before `dayTotal` | HIDE-14 day + all-hidden edge | ✅ Killed |
| F5 | `frontend/src/pages/agenda.tsx:97` | overlap warning keeps hidden sessions | HIDE-15 page | ✅ Killed |
| F6 | `frontend/src/pages/agenda.tsx:103` | `selected` does not check `hidden` | HIDE-17 | ✅ Killed |
| F7 | `frontend/src/components/agenda/week-grid.tsx:134` | week does not filter blocks | 5 tests | ✅ Killed |
| F8 | `frontend/src/components/agenda/day-timeline.tsx:65` | day does not filter blocks | 3 tests | ✅ Killed |
| F9 | `frontend/src/pages/agenda.tsx:67` | page ignores the workspace minimum | 4 tests | ✅ Killed |
| **F10** | `frontend/src/pages/agenda.tsx:274` | **`hidden={hidden}` removed from `<DayTimeline>`** | none (33/33 agenda page tests pass) | ❌ **Survived** |
| F11 | `frontend/src/pages/workspace-settings.tsx:129` | turn-on does not fill 1 | HIDE-07 | ✅ Killed |
| F12 | `frontend/src/pages/workspace-settings.tsx:322` | save not blocked on invalid value | HIDE-09 | ✅ Killed |
| F13 | `frontend/src/pages/workspace-settings.tsx:438` | switch not disabled without `canManage` | HIDE-10 | ✅ Killed |
| F14 | `frontend/src/pages/workspace-settings.tsx:460` | field not disabled without `canManage` | HIDE-10 | ✅ Killed |
| F15 | `frontend/src/pages/workspace-settings.tsx:159` | switch off still sends the number | HIDE-08 | ✅ Killed |
| F16 | `frontend/src/pages/workspace-settings.tsx:125` | whole-number regex dropped (1.5 accepted) | HIDE-09 | ✅ Killed |
| F17 | `frontend/src/pages/workspace-settings.tsx:466` | error message never rendered | HIDE-09 | ✅ Killed |
| F18 | `frontend/src/pages/workspace-settings.tsx:120` | stored minimum ignored on load | HIDE-06/10 + pt-BR | ✅ Killed |

**Sensor depth**: expanded (29 mutants)
**Result**: 28/29 killed - FAIL ❌ (F10 survived)

**Isolation**: baseline `git status --porcelain` before the sensor = `?? .checks/05-lote-foco-14-15-16.verified.md`, `?? .claude/launch.json`, `?? trackzyn-dev.sql`. After `git worktree remove --force` + `git worktree prune`: identical. Real `node_modules` intact (symlinks only were removed).

---

## Test Integrity

Removed lines in test files across the range (`git diff 7f28241..HEAD -- '*.test.*' | grep '^-'`): 7, all reviewed.

- `backend-node/test/db/baseline.test.ts:59-74`: `expect(columnsAfter).toEqual(columnsBefore)` became "everything except `workspaces.min_session_minutes` equals before" plus an exact `toEqual` of that one column's full signature (`smallint`, nullable, no default, `ordinal_position: 11`). Any other added, removed or altered column still fails the first assertion, and the added column is pinned on every field. Strictness kept.
- `backend-node/test/fixtures/pg-columns.json`: only appends the `min_session_minutes` entry (`smallint`, nullable, `maxLength: null`) after `created_at`; no existing entry changed. `backend-node/test/db/pglite.test.ts` changed only its provenance comment. Strictness kept.
- `frontend/src/components/agenda/week-grid.test.tsx`, `frontend/src/pages/agenda.test.tsx`: the removed lines are the test harness/mocks widened with an optional `hidden` prop and `min_session_minutes` (reset to `null` in `beforeEach`); no assertion removed or loosened.

No existing test deleted; no new skips.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ |
| Surgical changes | ✅ (`schema.ts` reformatted only to add the table-level `check`) |
| No scope creep | ✅ |
| Matches patterns | ✅ (same PATCH/zod/`canManage` pattern as timezone) |
| Spec-anchored outcome check | ✅ |
| Per-layer Coverage Expectation | ⚠️ page-level day view not covered (F10) |
| Every test maps to a spec requirement | ✅ (unlabelled tests map to the all-hidden edge case, the drag Done-when of T5 and the pt-BR labels of HIDE-06) |
| Documented guidelines followed: none - strong defaults applied | ✅ |

---

## Gate Check

- **Gate command**: `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test` and `npm --prefix frontend run lint && npm --prefix frontend run typecheck && npm --prefix frontend test` (real tree, read-only)
- **Backend**: exit 0 - lint and typecheck clean; 55 files passed, 1 skipped; 777 tests passed, 9 skipped (786)
- **Frontend**: exit 0 - lint and typecheck clean; 137 files passed; 1235 tests passed
- **Skipped tests**: 9 backend tests behind `describe.runIf(process.env.REDIS_URL)` (`backend-node/test/worker.test.ts:9`, `backend-node/test/ports/key-value-store.test.ts:94`), not in the diff range
- **Delta**: +15 backend tests (2 schema, 4 workspaces route, 1 reports route, 8 service), +26 frontend tests (5 hide, 3 day, 5 week, 6 agenda page, 7 settings); none removed
- **Failures**: none
- `npm --prefix frontend run build` (Build level) not run by the Verifier

---

## Fix Plans

### Fix 1: The Agenda page's day view has no test that it hides short sessions (F10 survived) - Major

- **Root cause**: every HIDE page test in `frontend/src/pages/agenda.test.tsx:182-245` runs at the default (week) width. `DayTimeline` is proven with an explicit `hidden` prop (`frontend/src/components/agenda/day-timeline.test.tsx:126`), but nothing proves the page passes it (`frontend/src/pages/agenda.tsx:274`). HIDE-11 says "in the week or the day view".
- **Fix task**: in `frontend/src/pages/agenda.test.tsx`, add a HIDE-11 test with `setWidth(390)` (the helper the AGENDA-37/41 tests use), `workspace.minSessionMinutes = 5`, sessions `[monday, blip]`, on Monday 2 November: assert the 10:00 – 11:00 button is present and the 10:30 – 10:32 button is absent, and the day heading still totals both.
- **Done when**: removing `hidden={hidden}` from `<DayTimeline>` in `frontend/src/pages/agenda.tsx` fails that test.

### Fix 2: No test switches between two workspaces with different minimums - Minor

- **Fix task**: optional. In `backend-node/test/routes/reports.test.ts`, query `/api/reports/sessions` for the same user under two workspaces, one with `min_session_minutes: 5` and one null, and assert the short session is listed only in the second.

### Fix 3: The Portuguese error text `Entre 1 e 60 minutos.` is not asserted - Cosmetic

- **Fix task**: extend the pt-BR test in `frontend/src/pages/workspace-settings.test.tsx:130` to type `0` and assert `getByText('Entre 1 e 60 minutos.')`.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| HIDE-01..HIDE-10 | In Tasks | ✅ Verified |
| HIDE-11 | In Tasks | ❌ Needs Fix (page day view, Fix 1) |
| HIDE-12..HIDE-24 | In Tasks | ✅ Verified |

---

## Summary

**Overall**: ❌ Not Ready (one surviving mutant)

**Spec-anchored check**: 24/24 ACs with located evidence; 0 spec-precision gaps
**Sensor**: 28/29 mutations killed (F10 survived)
**Gate**: backend 777 passed / 9 skipped, frontend 1235 passed, 0 failed

**What works**: backend storage, read, PATCH validation and roles; report filter by whole-session length with open-session and midnight handling; overview unchanged; week grid and day timeline hide blocks while keeping totals and full-width layout; overlap warning and panel close; settings switch, default 1, null on off, validation, disabled for non-owners.

**Issues found**: Fix 1 (Major), Fix 2 (Minor), Fix 3 (Cosmetic).

**Next steps**: implement Fix 1, then re-verify.
