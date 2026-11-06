# Juntar sessões próximas Validation

**Date**: 2026-11-04
**Spec**: `.specs/features/merge-near-sessions/spec.md`
**Diff range**: `77b1b62..HEAD` (a899754, f85c920, 871979c, e10e5fe, f3a9007, e60bbd3, 5e5f6f1, 0e5c8ab, e6a97a5; HEAD = e6a97a5)
**Verifier**: independent sub-agent (author ≠ verifier)

**Verdict**: PASS

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 | ✅ Done | a899754: migration 0008, schema, fixture, baseline C38 |
| T2 | ✅ Done | f85c920: read + PATCH |
| T3 | ✅ Done | 871979c: `joinPieces` |
| T4 | ✅ Done | e10e5fe: joined `SessionBlock` |
| T5 | ✅ Done | f3a9007: week grid |
| T6 | ✅ Done | e60bbd3: day timeline |
| T7 | ✅ Done | 5e5f6f1: `SessionGroupList`, `SessionDetails.onBack` |
| T8 | ✅ Done | 0e5c8ab: Agenda page |
| T9 | ✅ Done | e6a97a5: workspace settings |

---

## Spec-Anchored Acceptance Criteria

### P1: Configurar a junção no workspace

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| MERGE-01 | Off by default; whole 1..60 | `backend-node/test/db/workspace-merge-gap-schema.test.ts:42` - `expect(await gapOf()).toBeNull()` (pre-existing row); `:50`/`:52` - `toBe(1)`/`toBe(60)`; `:53`/`:54` - `rejects.toThrow(/ck_workspaces_merge_gap_minutes/)` for 0 and 61 | ✅ PASS |
| MERGE-02 | `merge_gap_minutes`, `null` when off, every member | `backend-node/test/routes/workspaces.test.ts:138` - `toHaveProperty('merge_gap_minutes', null)` (current) and `:140` (list), looped over owner, editor, viewer | ✅ PASS |
| MERGE-03 | Owner saves 1..60 or null and gets it back | `workspaces.test.ts:150` - `merge_gap_minutes).toBe(5)`; `:151` viewer reads 5; `:154` absent field keeps 5; `:157` 1 and 60; `:162` - `toBeNull()`; `:163` re-read null | ✅ PASS |
| MERGE-04 | 422, value kept | `workspaces.test.ts:173` - `statusCode).toBe(422)` for 0, 61, 1.5, "5"; `:175` - `gapOf(...)).toBe(10)` | ✅ PASS |
| MERGE-05 | 403 for non-owner, value kept | `workspaces.test.ts:185` - `statusCode).toBe(403)` editor, viewer; `:187` - `toBe(10)`; `:192` manager allowed `toMatchObject({ role: 'manager', merge_gap_minutes: 3 })` | ✅ PASS (⚠️ wording, see gaps) |
| MERGE-06 | Switch right below `Esconder sessões curtas`; field `Até` only while on | `frontend/src/pages/workspace-settings.test.tsx:153` block - `switches.indexOf(joinSwitch())).toBe(switches.indexOf(hide) + 1)`, `gapField()).toBeNull()` while off, `toBeInTheDocument()` once on; `:168` stored 5 → `toHaveValue(5)`; PT `:243` - `'Juntar sessões próximas'`, `getByLabelText('Até')` | ✅ PASS |
| MERGE-07 | Turning on from off fills 1 | `workspace-settings.test.tsx:175` - `expect(gapField()).toHaveValue(1)` | ✅ PASS |
| MERGE-08 | Off sends `merge_gap_minutes: null` | `workspace-settings.test.tsx:181` block - `objectContaining({ merge_gap_minutes: 5, ... })` then `objectContaining({ merge_gap_minutes: null })` | ✅ PASS |
| MERGE-09 | `Entre 1 e 60 minutos.` under the field; nothing sent | `workspace-settings.test.tsx:195` block - `getAllByText('Between 1 and 60 minutes.')).toHaveLength(1)`, `aria-describedby` = error id, `save()).toBeDisabled()`, `update).not.toHaveBeenCalled()` for 0, 61, 1.5; `:217` other field's error does not mark the gap field; PT `:243` - `getByText('Entre 1 e 60 minutos.')` | ✅ PASS |
| MERGE-10 | Non-owner sees both disabled with stored value | `workspace-settings.test.tsx:229` block - `toggle).toBeDisabled()`, `aria-checked 'true'`, `gapField()).toBeDisabled()`, `toHaveValue(10)` for editor and viewer | ✅ PASS |

### P1: Juntar as sessões próximas na Agenda

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| MERGE-11 | Gap ≤ X×60 s joins, first start → last end | `frontend/src/lib/agenda/join.test.ts:37` - `toStrictEqual([{ start: minute('10:20'), end: minute('11:16'), seconds: (41+11)*60, members: [a, b] }])`; exactly 5 min `:52` - `ids(joined)).toEqual([['a','b']])`; week `week-grid.test.tsx:162` block - name `'Produto, 2 sessions, 10:20 – 11:16'`, height `56 * PX_PER_MINUTE`; day `day-timeline.test.tsx:159` block | ✅ PASS |
| MERGE-12 | X + 1 s keeps apart (seconds, not minutes) | `join.test.ts:58` - `joinPieces(pieces, 5, null)).toStrictEqual(pieces)` with 11:06:01 | ✅ PASS |
| MERGE-13 | Chain | `join.test.ts:67` - `ids(joined)).toEqual([['a','b','c']])`, `:68` span 10:00–11:00, seconds 54 min | ✅ PASS |
| MERGE-14 | Overlap joins; next gap from group max end | `join.test.ts:77` - `[['a','b','c']]`, `:78` end 11:10 | ✅ PASS |
| MERGE-15 | Other list apart, side by side | `join.test.ts:87` - `toEqual(['a', ['b','c']])`; `week-grid.test.tsx:162` block - `['0%','50%']` and `['50%','50%']`; `day-timeline.test.tsx:159` block - `'50%'` both | ✅ PASS |
| MERGE-16 | Task and break apart | `join.test.ts:95` - `toStrictEqual(pieces)` (gap 0) | ✅ PASS |
| MERGE-17 | Gap measured between tasks over a break | `join.test.ts:101` - `toEqual([['a','b'], 'p'])`; `:102` break piece unchanged | ✅ PASS |
| MERGE-18 | Open and midnight-crossing never join, on every day | `join.test.ts:115-116` running piece, `toStrictEqual(today)`; `:126-129` both days `toStrictEqual(first/second)` | ✅ PASS |
| MERGE-19 | Hidden neither shown in nor bridging a block | `week-grid.test.tsx:184` block - `querySelector('[data-joined]')).toBeNull()`, first and last `not.toHaveAttribute('data-joined')`, short absent; `day-timeline.test.tsx:175` block - same, `toHaveLength(2)` | ✅ PASS |
| MERGE-20 | Day total = sum of sessions, no gaps | `week-grid.test.tsx:179` block - `header(...)).toHaveTextContent('52min')`; `day-timeline.test.tsx:159` block - `'Tuesday, November 3, 2026 · 1hr 22min'`; page at 390 px `agenda.test.tsx:685` block - `'Wednesday, November 4, 2026 · 52min'` | ✅ PASS |
| MERGE-21 | One lane; alone = whole width | `week-grid.test.tsx:174` block - `style.width).toBe('100%')`; `day-timeline.test.tsx:170` block - `'100%'`; 50/50 beside another list (above) | ✅ PASS |
| MERGE-22 | Off → every session its own block | `join.test.ts:142` - `joinPieces(pieces, null, null)).toStrictEqual(pieces)`; `agenda.test.tsx:279` block - two named blocks, `queryByRole(... /2 sessions/)).toBeNull()` | ✅ PASS |
| MERGE-23 | Week and day view | `agenda.test.tsx:279` (week, default width) - `joined()` found, singles absent; `agenda.test.tsx:685` (day at 390 px, L-034) - `'Work, 2 sessions, 10:20 – 11:16'` and picking works | ✅ PASS |
| MERGE-24 | New value applied on next read, no reload | `agenda.test.tsx:363` block - rerender 5 → joined, 3 → apart, `sessions.list).toHaveBeenCalledTimes(loads)` | ✅ PASS |

### P1: Ver e escolher as sessões de um bloco unido

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| MERGE-25 | Named with list and `N sessões` | `session-block.test.tsx:125` block - name `'Produto, 3 sessions, 10:20 – 11:40'`; PT `:130` block - `'Produto, 3 sessões, 10:20 – 11:40'` | ✅ PASS |
| MERGE-26 | Tooltip: list, N, one line per session in start order (title or `Intervalo`, `HH:MM – HH:MM`), `Clique para escolher uma sessão`; hover and focus | `session-block.test.tsx:140` block - `toHaveTextContent('Produto · 3 sessions')`, `lines).toEqual(['Write the spec10:20 – 10:50','Review the design10:52 – 11:10','Write the spec11:14 – 11:40'])`, `'Click to pick a session'`; focus `:150` block (`userEvent.tab()`, `Break` lines); PT `:160` block - `'Intervalo10:20 – 10:50'`, `'Clique para escolher uma sessão'` | ✅ PASS |
| MERGE-27 | Click selects block, panel `<lista> · N sessões`, day + span, one button per session in start order with title, origin, time, duration | `week-grid.test.tsx:213` block - `onSelectGroup).toHaveBeenCalledWith([a, b])`, `aria-pressed 'true'`; `day-timeline.test.tsx:185` block; `session-group-list.test.tsx:56-58` - heading `'Produto · 3 sessions'`, `'Monday, November 2 · 10:20 – 11:40'`; `:64-73` - 3 buttons in start order with `'recorded by the focus'`, `'10:20 – 10:50 · 30min'`…; page `agenda.test.tsx:293` block - `aria-pressed 'true'`, `'Monday, November 2 · 10:20 – 11:16'`, `'11:05 – 11:16 · 11min'` | ✅ PASS |
| MERGE-28 | Chosen session's details with `Editar`/`Excluir` | `session-group-list.test.tsx:82` - `onPick).toHaveBeenCalledWith(members[1])`; `agenda.test.tsx:293` block - heading `'Review the notes'`, `'Monday, November 2 · 11:05 – 11:16 · 11min'`, `Edit` and `Delete` buttons | ✅ PASS |
| MERGE-29 | Chosen session alone with handles; rest redrawn without it | `agenda.test.tsx:308` block - `aria-pressed 'true'`, `[data-handle="top"]`/`bottom` not null, rest `'Write the report, 10:20 – 11:01'`, `[data-joined]` null; `week-grid.test.tsx:225` block - handles `['top','bottom']`, rest `'Produto, 2 sessions, 11:05 – 11:30'`; `join.test.ts:134-137` | ✅ PASS |
| MERGE-30 | Dragging a joined block moves/resizes nothing | `week-grid.test.tsx:198` block - `[data-handle]` null, pointer down/move/up then `onCommit).not.toHaveBeenCalled()`, `[data-draft]` null; day `day-timeline.test.tsx:185` block - `[data-handle]` null | ✅ PASS |
| MERGE-31 | Close, save, delete → rejoins | close `agenda.test.tsx:324` block - `joined()).toHaveAttribute('aria-pressed','false')`, single absent; save `:334` block - `'Work, 2 sessions, 10:20 – 11:20'`, no panel; delete `:349` block - `remove).toHaveBeenCalledWith('b')`, neighbour alone, no panel; Esc/Close of the list `session-group-list.test.tsx:89-91` | ✅ PASS |
| MERGE-32 | Badge with N top right, no other text | `session-block.test.tsx:115` block - `block.textContent).toBe('3')`, badge `toHaveClass('absolute','top-0','right-0')` | ✅ PASS |
| MERGE-33 | `‹ <lista> · N sessões` back to the list | `session-group-list.test.tsx:117-119` - click calls `onBack` once, not `onClose`; PT `:132`; absent without `onBack` `:140-141`; page `agenda.test.tsx:308` block - click `'‹ Work · 2 sessions'` → list shown, details gone | ✅ PASS |

**Status**: ✅ 33/33 ACs covered, asserted values match the spec outcomes. One wording-level spec-precision note (MERGE-05), not a coverage gap.

---

## Edge Cases

- [x] Exactly X joins, X + 1 s apart: `join.test.ts:52`, `:58` (seconds measured on `Date.parse`; minute-rounding mutant M08 killed).
- [x] Different tasks of one list each listed with own title: `session-block.test.tsx:140` block (`Write the spec` / `Review the design`).
- [x] Hiding leaves one session → common block: `week-grid.test.tsx:184` block (`first` alone, not joined).
- [x] Joined block alone in column → whole width: `week-grid.test.tsx:174`, `day-timeline.test.tsx:170`.

---

## Worker decisions judged against the spec

| Decision | Judgment |
| -------- | -------- |
| Block being dragged stays out of the join until released | Consistent with AGENDA-30 and MERGE-29; tested `week-grid.test.tsx:234`. Accepted. |
| `SessionDetails` gained `onBack`/`groupCount`, unchanged without them | Matches MERGE-33; `session-group-list.test.tsx:138` proves the default. Accepted. |
| Saving a picked session clears pick and group (MERGE-31); a normal session returns to details (AGENDA-31) | MERGE-31 says saved → rejoined; closing the panel is the only way to rejoin, since a chosen session is apart. Accepted. |
| Rest of the block not drawn selected while a session is picked | Spec silent; reasonable (one selection at a time). Accepted. |
| `SessionGroupList` Close button + Esc | Spec silent on how the list closes; MERGE-31 "closed" needs a way. Accepted. |
| Settings reuse `minSessionInvalid` key, no hint under the switch | Same text as MERGE-09 requires; spec asks for no hint. Accepted. |
| Fixture re-read from PG 16.15, C38 expects exactly the two added columns | Diff only appends `merge_gap_minutes` (smallint, nullable) after `min_session_minutes`; identical to the worker's scratch reading (`pg-columns.json`, raw reading contains the column). C38 still asserts every non-added column equals the pre-migration catalog and the added set by `toEqual` with full shape and ordinal 12. Not weakened. Not independently re-read (no DB access allowed). |

---

## Discrimination Sensor

Isolated `git worktree add --detach` under the scratchpad, `node_modules` symlinked; one mutant at a time, file restored after each; only the covering test files run.

| # | File | Description | Killed? |
| - | ---- | ----------- | ------- |
| M01 | `frontend/src/lib/agenda/join.ts:30` | `<= gapMs` → `< gapMs` | ✅ |
| M02 | `join.ts:32` | gap from previous piece end, not group max end | ✅ |
| M03 | `join.ts:28` | key ignores list | ✅ |
| M04 | `join.ts:28` | key ignores kind | ✅ |
| M05 | `join.ts:8-9` | open session may join | ✅ |
| M06 | `join.ts:9` | midnight-crossing may join | ✅ |
| M07 | `join.ts:8` | `apartId` ignored | ✅ |
| M08 | `join.ts:30` | gap rounded to minutes | ✅ |
| M09 | `join.ts:51` | joined `seconds` = span incl. gaps | ✅ |
| M10 | `join.ts:19` | null gap still joins | ✅ |
| M11 | `week-grid.tsx:151` | join before the hidden filter | ✅ |
| M12 | `week-grid.tsx:114` | day total from joined block spans | ✅ |
| M13 | `week-grid.tsx:179` | drag/handles allowed on joined block | ✅ |
| M14 | `week-grid.tsx:190` | `onSelectGroup` not wired | ✅ |
| M15 | `week-grid.tsx:181` | joined block never selected | ✅ |
| M16 | `week-grid.tsx:151` | no join at all | ✅ |
| M17 | `day-timeline.tsx:78` | join before the hidden filter | ✅ |
| M18 | `day-timeline.tsx:79` | day total from joined block spans | ✅ |
| M19 | `day-timeline.tsx:170` | `onSelectGroup` not wired | ✅ |
| M20 | `day-timeline.tsx:78` | `apartId` ignored | ✅ |
| M21 | `pages/agenda.tsx:301` | `joinGap={null}` to `DayTimeline` | ✅ |
| M22 | `agenda.tsx:181` | `apartId: null` | ✅ |
| M23 | `agenda.tsx:338` | group not cleared on save | ✅ |
| M24 | `agenda.tsx:360` | back button not wired | ✅ |
| M25 | `agenda.tsx:360` | back closes instead of returning to list | ✅ |
| M26 | `agenda.tsx:71` | gap value ignored (fixed 5) | ✅ |
| M27 | `session-block.tsx:90` | badge count off by one | ✅ |
| M28 | `session-block.tsx:103` | tooltip line times of first session | ✅ |
| M29 | `session-block.tsx:102` | tooltip line title of first session | ✅ |
| M30 | `session-block.tsx:107` | pick hint line removed | ✅ |
| M31 | `session-group-list.tsx:27` | sessions not sorted | ✅ |
| M32 | `session-group-list.tsx:32` | Esc does not close | ✅ |
| M33 | `session-group-list.tsx:65` | pick hands the first session | ✅ |
| M34 | `backend-node/src/routes/workspaces.ts:48` | zod without `.int()` | ✅ |
| M35 | `workspaces.ts:48` | zod bounds 0..61 | ✅ |
| M36 | `workspaces.ts:121` | `null` ignored (`!= null`) | ✅ |
| M37 | `drizzle/0008_workspace_merge_gap.sql:3` | CHECK widened to 0..61 | ✅ |
| M38 | `routes/schemas.ts:48` | read always `null` | ✅ |
| M39 | `pages/workspace-settings.tsx:142` | turning on does not fill 1 | ✅ |
| M40 | `workspace-settings.tsx:336` | save not blocked by invalid gap | ✅ |
| M41 | `workspace-settings.tsx:522` | short field error shows the gap error | ✅ |
| M42 | `workspace-settings.tsx:493-494` | switch not disabled without `canManage` | ✅ |
| M43 | `workspace-settings.tsx:173` | off still sends the value | ✅ |
| M44 | `workspace-settings.tsx:138` | fractional accepted | ✅ |
| M45 | `workspace-settings.tsx:138` | gap validity tied to the other switch | ✅ |

**Sensor depth**: expanded (45 manual behavior-level mutants)
**Result**: 45/45 killed - PASS ✅
**Isolation**: baseline `git status --porcelain` = `?? .checks/05-lote-foco-14-15-16.verified.md`, `?? .claude/launch.json`, `?? trackzyn-dev.sql`; after `git worktree remove --force` + `git worktree prune`, identical.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ |
| Surgical changes | ✅ |
| No scope creep | ✅ (Close/Esc on the list is the minimum to close it) |
| Matches patterns | ✅ (mirrors `min_session_minutes` #22 end to end) |
| Spec-anchored outcome check | ✅ |
| Per-layer Coverage Expectation met | ✅ (join 1:1 MERGE-11..18, 22; routes happy/null/absent/422/403/manager; components and page incl. 390 px) |
| Every test maps to a spec requirement | ✅ (`AGENDA-30` drag test at `week-grid.test.tsx:234` backs the worker decision) |
| Documented guidelines followed: `CONTRIBUTING.md`, `backend-node/vitest.config.ts`, `frontend/vitest.config.ts`, lesson L-034 | ✅ |

---

## Gate Check

- **Gate command**: `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test` and `npm --prefix frontend run lint && npm --prefix frontend run typecheck && npm --prefix frontend test && npm --prefix frontend run build` (real tree, read-only)
- **Result**: backend exit 0 - 784 passed, 9 skipped, 0 failed (56 files passed, 1 skipped); frontend exit 0 - 1292 passed, 0 failed (139 files); build ✓
- **Test count delta in range**: +6 backend, +55 frontend `it(` cases; 0 removed
- **Skipped tests**: 9 backend skips are pre-existing environment-gated suites (`test/worker.test.ts`, `test/ports/key-value-store.test.ts`), untouched by the range
- **Test integrity**: removed lines in test files are only the C38 single-column matcher (generalised to the two-column list, still `toEqual` on both partitions), a fixture comment, imports, and prop wiring of the test harness. No assertion weakened or deleted.

---

## Gaps / notes (non-blocking)

1. ⚠️ Spec wording, MERGE-05: the AC says "a member who is not the owner" gets 403, while the confirmed assumption lets the `manager` alter it too; the implementation and `workspaces.test.ts:192` follow the assumption. Fix implied: reword MERGE-05 to "neither the owner nor the manager".
2. Minor robustness (not in spec): `frontend/src/pages/agenda.tsx:354-356` clears `groupIds` before `remove.mutate` settles; if the delete fails, the details stay open without the back button. Fix implied: clear the group in the mutation's success path.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| MERGE-01 … MERGE-33 | In Tasks | ✅ Verified |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 33/33 ACs matched spec outcome; 1 wording note (MERGE-05)
**Sensor**: 45/45 mutations killed
**Gate**: backend 784 passed / 9 skipped; frontend 1292 passed; build ok

**What works**: exact-second boundary, chain, overlap, list/kind separation, break not blocking, open and midnight sessions apart, hidden sessions neither shown nor bridging, unchanged day totals, single lane, week + day (390 px page test), no drag on joined blocks, picked session apart with handles and rejoining after close/save/delete, tooltip, badge, back button, settings and backend contract.

**Next steps**: optional spec rewording for MERGE-05.
