# Esconder sessões curtas Validation

**Date**: 2026-11-04
**Spec**: `.specs/features/hide-short-sessions/spec.md`
**Diff range**: whole feature `7f28241..HEAD` (180e30d, 2d5b426, 0be6342, 0264756, 4f753f8, 74bc9a9, 89aa93b, 68422d4, c4f9933, 85672be, 7232db2, edf510c); fix round `c4f9933..HEAD` (85672be, 7232db2, edf510c)
**Verifier**: independent sub-agent (author ≠ verifier), round 2
**Verdict**: PASS

## Round 1 → round 2

Round 1 (same date) was **FAIL**: mutant F10 (removing `hidden={hidden}` from `<DayTimeline>` in
`frontend/src/pages/agenda.tsx`) survived, 28/29 killed. Minor gaps: no test across two workspaces with different
minimums; the Portuguese text `Entre 1 e 60 minutos.` never asserted.

The fix round closed all three, touching only test files:

- T9 (85672be): page-level day-view test at 390 px - `frontend/src/pages/agenda.test.tsx:534-546`. F10 is now killed.
- T10 (7232db2): route test with two workspaces of the same owner, minimum 5 vs off - `backend-node/test/routes/reports.test.ts:141-163`.
- T11 (edf510c): pt-BR test now types 0 and asserts `Entre 1 e 60 minutos.` - `frontend/src/pages/workspace-settings.test.tsx:138-139`.

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
| T7 Página da Agenda | ✅ Done | 89aa93b, day-view wiring now proven by T9 |
| T8 Tela de configurações | ✅ Done | 68422d4 |
| T9 Dia na página da Agenda | ✅ Done | 85672be - F10 killed (re-run below) |
| T10 Mínimo de cada workspace | ✅ Done | 7232db2 |
| T11 Mensagem em português | ✅ Done | edf510c |

---

## Spec-Anchored Acceptance Criteria

Every cited line was re-read at HEAD. The fix round changed only three test files; for the other files the lines are
unchanged from round 1 and were re-checked, not copied.

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| HIDE-01 | Per workspace, off (null) by default, whole minutes 1..60 | `backend-node/test/db/workspace-min-session-schema.test.ts:42` - `expect(await minOf()).toBeNull()` (row from before 0007); `:53`/`:54` - `rejects.toThrow(/ck_workspaces_min_session_minutes/)` for 0 and 61 | ✅ PASS |
| HIDE-02 | `min_session_minutes`, `null` when off, to every member | `backend-node/test/routes/workspaces.test.ts:71` - `toHaveProperty('min_session_minutes', null)` on `/current`; `:73` same on the list (looped over owner, editor, viewer) | ✅ PASS |
| HIDE-03 | Owner PATCH 1..60 or null saves and returns | `backend-node/test/routes/workspaces.test.ts:83` - `.toBe(5)`; `:87` - `toMatchObject({ name: 'Renamed', min_session_minutes: 5 })`; `:90` - `.toBe(edge)` (1, 60); `:95` - `toBeNull()` | ✅ PASS |
| HIDE-04 | 422 below 1, above 60, not whole; value kept | `backend-node/test/routes/workspaces.test.ts:106` - `expect(refused.statusCode).toBe(422)`; `:108` - `minOf(...)).toBe(10)` | ✅ PASS |
| HIDE-05 | 403 for a non-owner; value kept (manager counts as owner) | `backend-node/test/routes/workspaces.test.ts:118` - `.toBe(403)`; `:120` - `.toBe(10)`; `:125` - `toMatchObject({ role: 'manager', min_session_minutes: 3 })` | ✅ PASS |
| HIDE-06 | Below timezone: switch `Esconder sessões curtas`, field `Menos de` only while on | `frontend/src/pages/workspace-settings.test.tsx:66` - `compareDocumentPosition(hideSwitch()) & DOCUMENT_POSITION_FOLLOWING`; `:68` - `minutesField()).toBeNull()`; `:80` - `toHaveValue(15)`; `:135` - `findByRole('switch', { name: 'Esconder sessões curtas' })`; `:136` - `getByLabelText('Menos de')).toHaveValue(5)` | ✅ PASS |
| HIDE-07 | Turning on from off fills 1 | `frontend/src/pages/workspace-settings.test.tsx:86` - `expect(minutesField()).toHaveValue(1)` | ✅ PASS |
| HIDE-08 | Save with switch off sends `min_session_minutes: null` | `frontend/src/pages/workspace-settings.test.tsx:100` - `mock.calls[1]).toEqual(['ws', objectContaining({ min_session_minutes: null })])` (`:95` the on case sends 5) | ✅ PASS |
| HIDE-09 | Out of 1..60 or not whole: `Entre 1 e 60 minutos.` under the field, nothing sent | `frontend/src/pages/workspace-settings.test.tsx:108` - `getByText('Between 1 and 60 minutes.')` for 0, 61, 1.5; `:112` - `update).not.toHaveBeenCalled()`; **new** `:139` - `getByText('Entre 1 e 60 minutos.')).toBeInTheDocument()` after typing 0 in pt-BR | ✅ PASS (round 1 minor gap closed) |
| HIDE-10 | Non-owner: switch and field disabled, stored value | `frontend/src/pages/workspace-settings.test.tsx:124` - `toggle).toBeDisabled()`; `:126` - `minutesField()).toBeDisabled()`; `:127` - `toHaveValue(10)` | ✅ PASS |
| HIDE-11 | Closed session < X×60 s not drawn, week **or day** view | `frontend/src/lib/agenda/hide.test.ts:32` - 4 min 59 s `.toBe(true)`; `:41` break `.toBe(true)`; `frontend/src/components/agenda/week-grid.test.tsx:103` - `[data-session-id="short"]).toBeNull()`; `frontend/src/components/agenda/day-timeline.test.tsx:126` - `[data-session-id="b"]).toBeNull()`; page, week: `frontend/src/pages/agenda.test.tsx:189` - `queryByRole('button', { name: 'Write the report, 10:30 – 10:32' })).toBeNull()`; **page, day view (390 px)**: `frontend/src/pages/agenda.test.tsx:544` - same `toBeNull()`, with `:543` the 10:00 – 11:00 block `toBeInTheDocument()` | ✅ PASS (round 1 gap closed) |
| HIDE-12 | Exactly X×60 s or more is drawn | `frontend/src/lib/agenda/hide.test.ts:36` - exactly 5 min `.toBe(false)`; `:37` - 6 min `.toBe(false)`; `frontend/src/components/agenda/week-grid.test.tsx:104` - long block `.not.toBeNull()` | ✅ PASS |
| HIDE-13 | Open session always drawn | `frontend/src/lib/agenda/hide.test.ts:28` - `isHiddenSession(session(null), 5)).toBe(false)` | ✅ PASS |
| HIDE-14 | Hidden sessions count in the day total (week header, day view) | `frontend/src/components/agenda/week-grid.test.tsx:109` - `toHaveTextContent('1hr 2min')`; `frontend/src/components/agenda/day-timeline.test.tsx:128` - `'Tuesday, November 3, 2026 · 1hr 2min'`; **new** page level `frontend/src/pages/agenda.test.tsx:545` - `heading level 2).toHaveTextContent('Wednesday, November 4, 2026 · 1hr 2min')` | ✅ PASS |
| HIDE-15 | Hidden out of overlap warning and side-by-side layout | `frontend/src/components/agenda/week-grid.test.tsx:114` - `style.width).toBe('100%')`; `frontend/src/components/agenda/day-timeline.test.tsx:133` - `.toBe('100%')`; `frontend/src/pages/agenda.test.tsx:204` - `queryByRole('status')).toBeNull()`; control `:212` - warning text with minimum off | ✅ PASS |
| HIDE-16 | Minimum off: every session drawn | `frontend/src/lib/agenda/hide.test.ts:23`/`:24` - `.toBe(false)` with null; `frontend/src/components/agenda/week-grid.test.tsx:120` - `.toBe('50%')`; `frontend/src/pages/agenda.test.tsx:194` - 10:30 – 10:32 `toBeInTheDocument()` | ✅ PASS |
| HIDE-17 | Saved below X: block leaves grid, panel closes | `frontend/src/pages/agenda.test.tsx:228` - `queryByRole('button', { name: /^Write the report, 10:00/ })).toBeNull()`; `:230` - `queryByRole('heading', { name: 'Write the report' })).toBeNull()` | ✅ PASS |
| HIDE-18 | New minimum applied on next workspace read, no reload | `frontend/src/pages/agenda.test.tsx:241` - short block `toBeNull()` after the context change; `:244` - `sessions.list).toHaveBeenCalledTimes(loads)` | ✅ PASS |
| HIDE-19 | Report leaves out every piece of a closed session < X×60 s | `backend-node/test/services/reports-sessions.test.ts:216` - `ids(report)).toEqual([['2026-10-21', [longer, exact]]])`; `:224` break - `report.days).toEqual([])`; route `backend-node/test/routes/reports.test.ts:138` - `not.toContain(short)` (`:137` keeps long); **new** per-workspace `backend-node/test/routes/reports.test.ts:161` - `expect(await listed(workspaceId)).not.toContain(hiddenOne)` | ✅ PASS |
| HIDE-20 | Session crossing midnight ≥ X kept on both days | `backend-node/test/services/reports-sessions.test.ts:234` - `['2026-10-22', [late]]` with the 21st; `:237` - seconds `[2 * M, 178 * M]`; inverse `:244` - 4 min crossing `toEqual([])` | ✅ PASS |
| HIDE-21 | Open session kept whatever its length | `backend-node/test/services/reports-sessions.test.ts:254` - `objectContaining({ id: open, ended_at: null, seconds: M })` | ✅ PASS |
| HIDE-22 | Day with every session hidden is left out | `backend-node/test/services/reports-sessions.test.ts:266` - `ids(report)).toEqual([['2026-10-21', [kept]]])` | ✅ PASS |
| HIDE-23 | Overview counts hidden sessions as today | `backend-node/test/services/reports-sessions.test.ts:278` - `expect(on).toEqual(off)`; `:279` - `task_seconds: 62 * M, break_seconds: 3 * M` | ✅ PASS |
| HIDE-24 | Minimum off returns every session | `backend-node/test/services/reports-sessions.test.ts:286` - `[['2026-10-21', [tiny]]]` (30 s); **new** route `backend-node/test/routes/reports.test.ts:162` - `expect(await listed(other)).toEqual([shownOne])` (2 min session, workspace with minimum off) | ✅ PASS |

**Status**: ✅ 24/24 ACs covered with spec-matching assertions; 0 spec-precision gaps.

---

## Edge Cases

- [x] Exactly X minutes is shown - `frontend/src/lib/agenda/hide.test.ts:36`; `backend-node/test/services/reports-sessions.test.ts:216` (`exact` kept)
- [x] Every session of a day hidden in the Agenda: total, no blocks, no AGENDA-42 message - `frontend/src/components/agenda/day-timeline.test.tsx:138` - `toHaveLength(0)`; `:140` - empty-day message `toBeNull()`
- [x] Workspace changes: the minimum of the current workspace is used - Reports: `backend-node/test/routes/reports.test.ts:161`/`:162` (same owner, two workspaces, 5 vs off; mutants B-otherws and B-anyws killed). Agenda: `frontend/src/pages/agenda.test.tsx:241` (the current workspace's minimum changes in context and the grid redraws). Round 1's gap 2 closed.

---

## Discrimination Sensor

Detached `git worktree` at HEAD under the session scratchpad, `node_modules` symlinked from the real
`backend-node` and `frontend`. Each mutant applied alone by exact string replacement, the related suites run
(backend: `test/routes/reports.test.ts`, `test/services/reports-sessions.test.ts`, `test/routes/workspaces.test.ts`;
frontend: `src/pages/agenda.test.tsx`, `src/pages/workspace-settings.test.tsx`, `src/lib/agenda/hide.test.ts`,
`src/components/agenda`), then the file restored. Baseline run of those suites at HEAD: 25 + 118 passed.

| # | File | Mutation | Killed by | Result |
| - | ---- | -------- | --------- | ------ |
| F10 | `frontend/src/pages/agenda.tsx:274` | `hidden={hidden}` removed from `<DayTimeline>` (round 1 survivor) | `agenda.test.tsx:534` HIDE-11 HIDE-14 day view | ✅ Killed |
| F-week | `frontend/src/pages/agenda.tsx:259` | `hidden={hidden}` removed from `<WeekGrid>` | HIDE-11/16, HIDE-17, HIDE-18 page tests | ✅ Killed |
| B-otherws | `backend-node/src/services/reports-sessions.ts:38` | minimum read from the user's first workspace (by `created_at`) instead of the one asked for | 6 tests incl. `reports.test.ts:141` | ✅ Killed |
| B-anyws | `backend-node/src/services/reports-sessions.ts:38` | minimum = largest minimum among the user's workspaces | 5 tests incl. `reports.test.ts:141` | ✅ Killed |
| B-route-null | `backend-node/src/routes/reports.ts:106` | route passes `minSessionMinutes: null` | `reports.test.ts` HIDE-19 (2 tests) | ✅ Killed |
| B-boundary | `backend-node/src/services/reports-sessions.ts:40` | SQL `>=` → `>` at X | HIDE-19 4:59/5:00/6:00 | ✅ Killed |
| B-open | `backend-node/src/services/reports-sessions.ts:40` | open session hidden (`IS NULL OR` → `IS NOT NULL AND`) | HIDE-21 | ✅ Killed |
| B-piece | `backend-node/src/services/reports-sessions.ts:40` | piece length `p.pz - p.pa` instead of whole session | HIDE-20 | ✅ Killed |
| F-pt-key | `frontend/src/locales/pt-BR.json:470` | `minSessionInvalid` → `Entre 1 e 59 minutos.` | `workspace-settings.test.tsx:130` | ✅ Killed |
| F-pt-en | `frontend/src/locales/pt-BR.json:470` | `minSessionInvalid` → the English string | `workspace-settings.test.tsx:130` | ✅ Killed |
| F-boundary | `frontend/src/lib/agenda/hide.ts:10` | `<` → `<=` | HIDE-12 | ✅ Killed |
| F-open | `frontend/src/lib/agenda/hide.ts:9` | open session hidden under a minimum | HIDE-13 | ✅ Killed |
| F-units | `frontend/src/lib/agenda/hide.ts:10` | `* 60_000` → `* 1_000` | 12 tests | ✅ Killed |
| F-daytotal | `frontend/src/components/agenda/day-timeline.tsx:66` | day total drops hidden sessions | 3 tests incl. new page test `agenda.test.tsx:534` | ✅ Killed |
| F-overlap | `frontend/src/pages/agenda.tsx:97` | overlap warning keeps hidden sessions | HIDE-15 page | ✅ Killed |
| F-weekwidth | `frontend/src/components/agenda/week-grid.tsx:134` | lanes assigned before filtering hidden (hidden still split the width) | HIDE-15 week | ✅ Killed |
| F-daywidth | `frontend/src/components/agenda/day-timeline.tsx:65` | lanes assigned before filtering hidden | HIDE-15 day | ✅ Killed |

One further attempt at F-weekwidth used the wrong property path (`l.piece.session`), crashed 41 tests and was
discarded as an invalid (non-compiling) mutant, then re-run in the corrected form above.

**Sensor depth**: expanded (17 valid mutants)
**Result**: 17/17 killed - PASS ✅

**Isolation**: baseline `git status --porcelain` before the sensor = `?? .checks/05-lote-foco-14-15-16.verified.md`,
`?? .claude/launch.json`, `?? trackzyn-dev.sql`. After removing the symlinks, `git worktree remove --force` and
`git worktree prune`: identical (`diff` empty), worktree no longer listed, real `node_modules` intact.

---

## Test Integrity (`c4f9933..HEAD`)

The fix round changed only `backend-node/test/routes/reports.test.ts` (+24), `frontend/src/pages/agenda.test.tsx`
(+14), `frontend/src/pages/workspace-settings.test.tsx` (+3/-1) and `tasks.md`. The single removed test line is
the old title of the pt-BR test (`workspace-settings.test.tsx:130`), renamed to add the AC ids; its assertions
are kept and two lines added. No test deleted, no assertion loosened, no new skips. Test count rose by 1 in each
package.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ |
| Surgical changes | ✅ (fix round touched tests only) |
| No scope creep | ✅ |
| Matches patterns | ✅ (`setWidth`, `call`/`setup` helpers reused) |
| Spec-anchored outcome check | ✅ |
| Per-layer Coverage Expectation (domain 1:1; routes/pages happy + edge + error) | ✅ (page day view now covered) |
| Every test maps to a spec requirement | ✅ (new tests labelled HIDE-11/14, HIDE-19/24, HIDE-06/09) |
| Documented guidelines followed: none - strong defaults applied | ✅ |

---

## Gate Check

- **Gate command**: `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test` and `npm --prefix frontend run lint && npm --prefix frontend run typecheck && npm --prefix frontend test && npm --prefix frontend run build` (real tree, read-only)
- **Backend**: exit 0 - lint and typecheck clean; 55 files passed, 1 skipped; 778 passed, 9 skipped (787)
- **Frontend**: exit 0 - lint and typecheck clean; 137 files passed; 1236 passed; build succeeded
- **Test count**: round 1 777 + 1235 → round 2 778 + 1236 (+1 each, the T10 and T9 tests; T11 extended an existing test)
- **Skipped tests**: 9 backend tests behind `describe.runIf(process.env.REDIS_URL)` (`backend-node/test/worker.test.ts:9`, `backend-node/test/ports/key-value-store.test.ts:94`), outside the diff range
- **Failures**: none

---

## Fix Plans

None. Round 1's Fix 1 (Major), Fix 2 (Minor) and Fix 3 (Cosmetic) are closed by T9, T10 and T11.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| HIDE-01..HIDE-10 | ✅ Verified (round 1) | ✅ Verified |
| HIDE-11 | ❌ Needs Fix (page day view) | ✅ Verified |
| HIDE-12..HIDE-24 | ✅ Verified (round 1) | ✅ Verified |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 24/24 ACs matched spec outcome; 0 spec-precision gaps
**Sensor**: 17/17 mutations killed (F10 now killed)
**Gate**: backend 778 passed / 9 skipped, frontend 1236 passed + build, 0 failed

**What works**: storage, read, PATCH validation and roles; report filter by whole-session length, per requested
workspace, with open-session and midnight handling; overview unchanged; week and day views (component and page level)
hide blocks while keeping totals and full width; overlap warning and panel close; settings switch, default 1, null
when off, validation in both languages, disabled for non-owners.

**Issues found**: none.

**Lessons**: clean PASS, nothing new recorded. Candidate L-034 (test each page behaviour in every viewport) stays a
candidate: the fix confirms it for this feature, but promotion needs a second distinct feature, which the script counts.

**Next steps**: none for verification.
