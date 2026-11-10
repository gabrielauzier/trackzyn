# Validation: Planejamento diário - PASS ✅ (round 6)

**Date**: 2026-11-10
**Spec**: `.specs/features/planejamento-diario/spec.md` (plus `agenda-adjustments/spec.md` ADJ-26 and `agendamento/spec.md` D35 for the merged `drop` fix)
**Diff range**: `47e43f1..8a5af42` (67c180a tests, ffe95fd specs, 8a5af42 merge of `feat/agendamento` bringing f661873 and 2efa8a9)
**Verifier**: independent sub-agent, round 6 (author ≠ verifier)

**Verdict**: PASS ✅ (round 6). The three round-5 gaps are closed by tests that assert the spec outcome, the stale spec text is fixed, both gates are green, and the sensor killed 6/6, including the two round-5 survivors (B1, F10). The merged `drop` fix fits this branch: tsc is clean and its D35 test passes here. Older rounds follow below; the round-5 FAIL is superseded.

---

## Round 6: `47e43f1..8a5af42`

### Round-5 gaps → resolution

| # | Gap (round 5) | Evidence on HEAD 8a5af42 | Result |
| --- | --- | --- | --- |
| 1 | PLAN-49, a break that is not the user's (B1) | `backend-node/test/routes/plans.test.ts:317-337` - an `editor` member saves `Café`; the owner posts `/api/focus/break` with that id → `reply.statusCode` `toBe(422)`, `toMatchObject({ code: 'plan_break_unknown' })`, `GET /api/focus` `session` `toBeNull()`, editor's `GET /api/plans/<day>` block `toMatchObject({ id, started_at: null })`, editor's Agenda read still `['Café']`. The old test (`:302`) is renamed to what it really sends (a task block) | ✅ Closed (B1 killed) |
| 2 | ADJ-26, projected occurrences (F10) | `frontend/src/pages/agenda.test.tsx:1797-1836` - test named `ADJ-26 …`; the mock has a projected `Weekly review` (`series-1`, 2026-11-05 11:00); `:1818` shown before, `:1828` `queryByRole('button', { name: /^Weekly review/ })` `toBeNull()` after `Show schedules` off | ✅ Closed (F10 killed). After reopening, the test still checks only `Fix the widget` (the same `hideScheduled` flag drives all four kinds) - not a gap |
| 3 | PLAN-48, past day sees no card | `frontend/src/pages/plan.test.tsx:238-239` in the PLAN-34 past-day test - `queryByRole('button', { name: 'Arrastar nova tarefa para a grade' })` `toBeNull()` | ✅ Closed (P48 killed) |
| 4 | PLAN-02, focus on a drag (cosmetic) | unchanged: native mousedown focus on a `tabIndex=-1` `li` (`use-plan-drag.ts` does not `preventDefault`); jsdom cannot drive it | ⚠️ Noted, not blocking |

### Stale spec text (round 5) → resolution

| Item | Now | Result |
| --- | --- | --- |
| Out of Scope "`Encaixar` automático … fora da primeira entrega" | row removed (`planejamento-diario/spec.md:27-33`) | ✅ |
| PLAN-D6 "`Encaixar` vêm depois" | `spec.md:285` "… e o `Encaixar`, que entrou já nesta entrega; pausas fixas vêm depois" | ✅ |
| Assumptions "abrindo em amanhã" | `spec.md:47` "abrindo em hoje … revista em 2026-11-10" | ✅ |
| PLAN-30 Independent Test | `spec.md:165` "chegar ao plano de hoje; `Planejar amanhã` chega ao de amanhã" | ✅ |
| Coverage line 45 | `spec.md:257` "50 total … PLAN-46 a PLAN-50 … checked in rounds 5 and 6" | ✅ |
| P1 criteria order 7, 9, 8 | `spec.md:146-148` now 7 (PLAN-46), 8 (PLAN-47), 9 (PLAN-49) | ✅ |
| ADJ-26 coverage / test id | `agenda-adjustments/spec.md:174` "26 total … ADJ-26 … checked in that feature's `validation.md`"; test now named `ADJ-26` | ✅ (the ADJ-26 row at `:172` still reads `Implementing`, task `—`; see traceability below) |

### Merged `drop` fix (f661873 via 8a5af42)

`frontend/src/pages/agenda.tsx:307-325`: a block still pending confirmation and dragged again reads the task, the undo and the `Sem hora` check from `confirming` (`:309`, `:312`, `:314`). `confirming` (`:172`) has the same shape here (`id, change, undo, task, schedule`), the plan/agenda code of this branch does not touch `drop`, `tsc -b` is clean, and `agenda.test.tsx:1665-1687` (D35, struck-through `Thu, Nov 5 · 10:00 – 11:30` as `DEL`, save `2026-11-06 12:00`, `Desfazer` back to `2026-11-05 10:00`) passes on this branch. 2efa8a9 only adds `frontend/src/lib/agenda/layout.test.ts:58-67` (one session in two timezones), green.

### Gates (round 6)

| Gate | Result |
| --- | --- |
| `cd frontend && npx tsc -b --noEmit` | ✅ exit 0 |
| `cd frontend && npx vitest run` | ✅ 176 files, 1935 passed (round 5: 1933 → +2: D35 re-drag, two-timezone layout), exit 0 |
| `cd backend-node && npx vitest run` | ✅ 77 files passed, 1 skipped; 1037 passed, 9 skipped (round 5: 1036 → +1, the other member's break), exit 0, first run |

No test deleted; one test title narrowed to what it sends (`plans.test.ts:302`).

### Discrimination sensor (round 6)

Scratch: temporary `git worktree --detach` at `8a5af42` under the scratchpad (`r6/wt`), `node_modules` symlinked. One literal replacement per mutant, the listed file run, then `git checkout` of the file in the scratch. No `git stash`. Worktree removed with `git worktree remove --force`; the real tree's `git status --porcelain` equals the baseline taken first.

| # | File (HEAD) | Mutation | Tests run | Result |
| --- | --- | --- | --- | --- |
| B1 | `backend-node/src/services/focus.ts:340` | owner clause → `sql\`true\`` | `test/routes/plans.test.ts` | ✅ Killed (`… break of another member …`; survived in round 5) |
| B1b | `focus.ts:340` | drop only `user_id = …` (any plan of the workspace) | same | ✅ Killed (same test) |
| F10 | `frontend/src/pages/agenda.tsx:201` | `Exibir agendamentos` off keeps `projected` | `src/pages/agenda.test.tsx` | ✅ Killed (`ADJ-26 …`; survived in round 5) |
| P48 | `frontend/src/pages/plan.tsx:240` | card hidden only for a viewer (`readOnly` → `!canWrite`), so a past day shows it | `src/pages/plan.test.tsx` | ✅ Killed (`PLAN-34 a past day …`) |
| D1 | `agenda.tsx:309` | `prior` always null (pre-f661873) | `agenda.test.tsx` | ✅ Killed (`D35 a pending block dragged again …`) |
| D2 | `agenda.tsx:314` | undo back to `from` (the preview) instead of the saved place | `agenda.test.tsx` | ✅ Killed (same test, `Desfazer`) |

**Sensor depth**: targeted re-run of the round-5 survivors plus the new tests and the merged fix. **Result** (round 6): 6/6 killed - PASS ✅

### Requirement traceability (round 6)

| Requirement | New status |
| --- | --- |
| PLAN-48, PLAN-49 | ✅ Verified |
| ADJ-26 | ✅ Verified (the `agenda-adjustments/spec.md:172` row still says `Implementing`; the author may flip it) |
| PLAN-01..PLAN-50 rows in `planejamento-diario/spec.md:206-255` | the Traceability table still says `Implementing` for every row; verified across rounds 1-6, the author may flip them |
| everything verified in round 5 | unchanged ✅ |

### Summary (round 6)

**Overall**: ✅ Ready. Spec-anchored check: the 3 open criteria now assert the spec outcome (422 `plan_break_unknown`, no session, break still pending; projected occurrence gone; no card on a past day). Sensor 6/6. Gates: frontend 1935 passed, backend 1037 passed. Remaining notes, non-blocking: PLAN-02 drag focus (cosmetic), traceability rows still `Implementing`.

---

## Round 5 header (kept)

**Date**: 2026-11-10
**Spec**: `.specs/features/planejamento-diario/spec.md` (plus `agenda-view-menu/spec.md` DAYS-07/13, `agenda-adjustments/spec.md` ADJ-21..26, `agenda/spec.md` AGENDA-02/04, `agendamento/spec.md` US-5/US-8/US-14 for the Agenda commits)
**Diff range**: `c9145e0..47e43f1` (24 commits after the round-4 PASS, 034c2dc..47e43f1; frontend plus one backend change, 83db1bd, with `backend-node/drizzle/0015_planned_break_started.sql`)
**Verifier**: independent sub-agent, round 5 (author ≠ verifier)

**Verdict**: FAIL ❌ (round 5). Every gate is green and every requirement in the range behaves as the spec says on HEAD, but the sensor found 2 surviving mutants out of 26, both test-only gaps: the owner check of a planned break started from the focus (PLAN-49, B1) and the projected occurrences under `Exibir agendamentos` off (ADJ-26, F10). Nothing in the code needs to change; two assertions are missing. See *Round 5* below.

---

## Round 5: `c9145e0..47e43f1`

### Commits → requirements

| Commit | Requirement(s) |
| --- | --- |
| 01feb10, 2c27633, 9bba3af, 7146741, 6f53614 | PLAN-24, PLAN-26, PLAN-28, PLAN-39 (tooltip), PLAN-46, PLAN-47, PLAN-15 |
| 71b4bad, 3af5b35 | AGENDA-04, PLAN-24, US-5 (dashed edge everywhere) |
| f3a3dda | PLAN-39 (done task leaves the Agenda; backend `pendingOnly`) |
| b748b74, c689abc | PLAN-03 (no sessions on the plan), PLAN-32 (timed task to its own window) |
| 436161c, 274f812 | PLAN-48 |
| 1ab7fa1, 1bc76b3, be9dd62 | PLAN-03 (edges, page scroll, pinned header and list) |
| 9e533a1 | PLAN-30, PLAN-D5 (opens today) |
| 1d8ac5c, 585568b, 5472ed0 | AGENDA-02, US-14 (grid fitted to the window, `Sem hora` only when needed) |
| 78710ed | US-8 (a new schedule's window moved or pulled keeps the schedule rule) |
| 83db1bd | PLAN-49 (backend + migration 0015) |
| ddbd668 | ADJ-21..26 |
| 1202ebb | DAYS-07, DAYS-13 |
| c1622bc | PLAN-50 |
| 47e43f1 | PLAN-02 (focus edge) |

### Spec-anchored acceptance criteria (requirements touched in the range)

| Req | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| PLAN-02 | A list task clicked, dragged or with its box marked takes the primary edge while in focus | `frontend/src/components/plan/plan-sidebar.test.tsx:144-154` - `toHaveAttribute('tabindex','-1')`, `toHaveClass('focus:border-primary','focus-within:border-primary')`, `toHaveFocus()` after a click, checkbox focus inside the `li` | ✅ PASS (drag path relies on the native mousedown focus, `use-plan-drag.ts:100-107` does not `preventDefault`; not driven by a test - minor, gap 4) |
| PLAN-03 | Whole day, no own scroll; page opens at workday start under the pinned header; header and list sticky; no sessions on the plan; 2px dashed edges | `plan-grid.test.tsx:49-57` - height `1440px`, no `overflow-y-auto`, `scrollTo({top:540})`; `:59-64` `scrollTo({top:450})` with inset 90; `:66-70` no scroll stacked; `pages/plan.test.tsx:395-403` sticky classes; `pages/plan.test.tsx:253-289` - `queryByLabelText(/^Answer the mail/)` null, `sessions.list` not called; `plan-block.test.tsx:33`, `:47` edges | ✅ PASS |
| PLAN-15 | Break block and side chips: gray hatched, 2px dashed | `plan-block.test.tsx:47`; `plan-sidebar.test.tsx:318-325` - `toHaveClass('border-2','border-dashed','border-muted-foreground/60')`, exact hatch gradient | ✅ PASS |
| PLAN-24 | Planned task: no text, list colour, dashed, plan icon; break: no text, hatched, dashed | `components/agenda/planned-block.test.tsx:41`, `:91`, `:108` | ✅ PASS |
| PLAN-26 | `Começar` on the focus opens an Intervalo of the break length in its list | `pages/focus.test.tsx:1172-1180` - `toMatchObject({ type:'break', minutes:15, list_id:LIST, plan_block_id:'p-coffee' })` | ✅ PASS |
| PLAN-27 | With a task counting, Start still sends the break (server closes the session) | `pages/focus.test.tsx:1192-1200` - `{ type:'break', minutes:60, list_id:LIST }` | ✅ PASS (server side unchanged, covered in earlier rounds) |
| PLAN-28 | `Começar` only on the focus, section `Pausas do plano de hoje`, breaks of today in this list not ended, not during an Intervalo; Agenda has none, its panel leads to the focus | `pages/focus.test.tsx:1164-1170` - exact item texts `['Café10:30 – 10:45 · 15minStart','Almoço12:00 – 13:00 · 1hrStart']` (excludes the 08:00 break, the other list, tomorrow, the task); `:1202-1214`, `:1216-1223`, `:1225-1232`; `pages/agenda.test.tsx:1721`, `:1732`, `:1743`; `planned-block.test.tsx:32` | ✅ PASS |
| PLAN-30 / PLAN-D5 | `Planejar` and `/planejar` open today in the workspace timezone; `Planejar amanhã` still tomorrow | `pages/plan.test.tsx:132-138` - path `/planejar/2026-11-08` at 23:30 São Paulo (UTC Monday); `app-layout.test.tsx:227-232` href `/planejar`; `pages/agenda.test.tsx` PLAN-01 test still `/planejar/2026-11-05` | ✅ PASS |
| PLAN-32 | Encaixar in marked order; a marked timed task goes to its own time for its estimate, even outside the workday; sessions take no time | `pages/plan.test.tsx:253-289` (`10:00 – 11:00` over a session), `:291-311` (`09:00 – 10:30` and `10:30 – 11:30`), `:313-328` (`20:00 – 20:30`) | ✅ PASS |
| PLAN-39 | Done task: crossed out on the plan, leaves the Agenda, comes back when reopened | `backend-node/test/routes/plans.test.ts:226-249` - `kinds()` `['task','break']` → `['break']` → back; plan of the day keeps `['task', true]`; `pages/agenda.test.tsx:1760-1771` re-read under `['lists']` | ✅ PASS |
| PLAN-46 | Tooltips of planned task and break with the exact lines | `planned-block.test.tsx:57`, `:66`, `:84`, `:99`; `pages/agenda.test.tsx:1753` | ✅ PASS |
| PLAN-47 | Dashed edge solid on hover and block on top, for blocks that open or move | `planned-block.test.tsx:73`; `plan-block.test.tsx:97` (a fixed block does not change) | ✅ PASS |
| PLAN-48 | Card above breaks; `Sem estimativa: 1h` / `Ocupa <duração>`; refused estimate drags nothing; drop opens the Agenda form on the filtered/first list with the card estimate, no Concluídas notice; Hoje for today, Esta semana otherwise; block where it fell; cancel creates nothing; viewer and past day see no card | `new-task-card.test.tsx:20-59`; `plan-sidebar.test.tsx:299-316` (order, filtered list `home`, none without drag); `pages/plan.test.tsx:339-359` (`column:'this_week'`, `10:00 – 11:30`), `:361-373` (`column:'today'`, `23:00 – 00:00`), `:375-386`, `:388-393` (viewer); `new-session-task-dialog.test.tsx:162` | ✅ PASS except the past-day half, which has no test (gap 3) |
| PLAN-49 | Start marks the break in the same write; it leaves the Agenda and the focus list; stays on the plan; saving again keeps the mark; a break that is not the user's → `plan_break_unknown`, no Intervalo | `backend-node/test/routes/plans.test.ts:259-300` - `started_at` null → string, `names()` `['Almoço']`, saved again with id → `toMatchObject({ id, start:'10:15', started_at })`; `:302-315` - 422 `plan_break_unknown`, `session` null, **but only for a task block of the same user**; `frontend/src/lib/plan/draft.test.ts:137-148`; `pages/focus.test.tsx:1182-1190` | ❌ GAP on "não é do usuário": no test sends another user's break id (B1 survived, gap 1) |
| PLAN-50 | Group box marks the shown tasks in list order after the marks made; mixed when partial; all marked → unmarks only that group | `plan-sidebar.test.tsx:243-255` (`['review@540','widget@630','later@750']`), `:257-275` (`indeterminate` true/false, `Fit (1)`), `:277-286` (search) | ✅ PASS |
| AGENDA-02 / US-14 | One-line header, no legend, grid fitted to the window; `Sem hora` only when needed | `pages/agenda.test.tsx:104-120`; `app-layout.test.tsx:219`; `week-grid.test.tsx:512` | ✅ PASS |
| AGENDA-04 / US-5 | Dashed edge on breaks and scheduled blocks | `session-block.test.tsx:112`; `scheduled-block.test.tsx:70` | ✅ PASS |
| US-8 (78710ed) | A new schedule's window moved/pulled: from the first quarter after now to midnight | `frontend/src/lib/agenda/use-grid-drag.test.tsx:454-481` - exact `start/end` (`18:00-19:00`, `11:00-12:00`, `14:15-15:15`, `23:00-24:00`, bottom `19:00`, top `14:15`) | ✅ PASS |
| DAYS-07 | One row of pills Seg..Dom, full names read, pressed when shown, primary vs gray outline | `components/agenda/view-menu.test.tsx:44-61` | ✅ PASS |
| DAYS-13 | Only day shown → its pill disabled | `view-menu.test.tsx:87-92` | ✅ PASS |
| ADJ-21/22/24/25 | `Exibir intervalos`, on by default, hint, position; off hides breaks and planned breaks; dot; remembered (stored value keeps its meaning) | `view-menu.test.tsx:148-171`, `:190-196`, `:198-205`; `pages/agenda.test.tsx:300`, `:312`, `:1804-1812`; `lib/agenda/hide-breaks.test.ts:10-26` | ✅ PASS |
| ADJ-26 | `Exibir agendamentos` on by default, under `Exibir intervalos`; off hides timed, `Sem hora`, **projected** and planned tasks, keeps sessions and planned breaks; remembered | `view-menu.test.tsx:174-188`; `pages/agenda.test.tsx:1773-1802` - timed, planned task and `[data-untimed-row]` gone, `Coffee` kept, `localStorage 'agenda.hideScheduled'` `'true'`, reopened still hidden | ❌ GAP on the projected occurrences: the test mocks `projected: []` (F10 survived, gap 2). Tests do not cite `ADJ-26` by id. |

### Gates (round 5)

| Gate | Result |
| --- | --- |
| `cd frontend && npx vitest run` | ✅ 176 files, 1933 passed (round 4: 175 / 1884 → +49), exit 0 |
| `cd frontend && npx tsc -b --noEmit` | ✅ exit 0 |
| `cd backend-node && npx vitest run` | ✅ 77 files passed, 1 skipped; 1036 passed, 9 skipped, exit 0 (idle re-run). The first run, alongside the sensor, had 4 failures in `test/routes/oidc.test.ts` (`expected 500 to be 307`, ~8 s each): load timeouts in a file this range does not touch; alone it passes 8/8, and the idle full re-run is green. |

No test was deleted; the backend changes only extend expected objects with `started_at: null` (`plans-read.test.ts:136`, `:251`, `plans-save.test.ts:98`, `plans.test.ts:218`).

### Discrimination sensor (round 5)

Scratch: a temporary `git worktree` at `47e43f1` under the scratchpad (`verifier-r5/wt`), `node_modules` symlinked from the main checkout. Each mutant is one literal replacement (`mut.py`), then the listed test files, then `git checkout` of that file in the scratch. No `git stash`. The worktree was removed with `git worktree remove --force`; `git status --porcelain` of the real tree equals the baseline taken first (`diff` empty).

| # | File (HEAD) | Mutation | Tests run | Result |
| --- | --- | --- | --- | --- |
| B1 | `backend-node/src/services/focus.ts:340` | Drop the owner clause (`planId IN (SELECT id FROM day_plans WHERE user_id = … AND workspace_id = …)` → `true`) | `test/routes/plans.test.ts` | ❌ **Survived** (21/21) |
| B2 | `backend-node/src/services/focus.ts:339` | Drop `eq(dayPlanBlocks.kind, 'break')` | `plans.test.ts` | ✅ Killed (`answers 422 plan_break_unknown …`) |
| B3 | `backend-node/src/services/plans.ts:276` | Saved again, `startedAt: null` always | `plans.test.ts`, `plans-save.test.ts` | ✅ Killed |
| B4 | `backend-node/src/services/plans.ts:120` | Agenda read keeps started breaks | `plans.test.ts`, `plans-read.test.ts` | ✅ Killed |
| B5 | `backend-node/src/services/plans.ts:119` | Agenda read keeps done tasks | same | ✅ Killed (PLAN-39) |
| B6 | `backend-node/src/services/focus.ts:344` | Never throw `plan_break_unknown` | `plans.test.ts` | ✅ Killed |
| B7 | `backend-node/src/routes/plans.ts:94` | `pendingOnly: false` | `plans.test.ts` | ✅ Killed (2 tests) |
| F1 | `frontend/src/lib/plan/draft.ts:145` | A saved break goes back without its id | `draft.test.ts`, `use-plan.test.tsx`, `plan.test.tsx` | ✅ Killed |
| F2 | `frontend/src/components/plan/plan-sidebar.tsx:87` | Group marks go before the marks made | `plan-sidebar.test.tsx` | ✅ Killed |
| F3 | `plan-sidebar.tsx:281` | `indeterminate` always false | same | ✅ Killed |
| F4 | `plan-sidebar.tsx:87` | Unmarking a group clears every mark | same | ✅ Killed |
| F5 | `frontend/src/pages/plan.tsx:176` | No own window for a marked timed task | `plan.test.tsx` | ✅ Killed (2 tests) |
| F6 | `plan.tsx:120` | New task always to `this_week` | `plan.test.tsx` | ✅ Killed |
| F7 | `plan.tsx:126` | New task block at 00:00, not where the card fell | `plan.test.tsx` | ✅ Killed (2 tests) |
| F8 | `frontend/src/pages/agenda.tsx:224` | `Exibir intervalos` off keeps planned breaks | `agenda.test.tsx` | ✅ Killed |
| F9 | `agenda.tsx:201` | `Exibir agendamentos` off keeps the `Sem hora` tasks | `agenda.test.tsx` | ✅ Killed |
| F10 | `agenda.tsx:201` | `Exibir agendamentos` off keeps the projected occurrences | `agenda.test.tsx` | ❌ **Survived** (106/106) |
| F11 | `frontend/src/lib/agenda/hide-breaks.ts:28` | `readHideScheduled` ignores storage | `agenda.test.tsx`, `view-menu.test.tsx` | ✅ Killed |
| F12 | `frontend/src/components/agenda/view-menu.tsx:124` | Last shown day's pill not disabled | `view-menu.test.tsx`, `agenda.test.tsx` | ✅ Killed (DAYS-13) |
| F13 | `view-menu.tsx:84` | Dot ignores `hideScheduled` | same | ✅ Killed (2 tests) |
| F14 | `frontend/src/lib/agenda/use-grid-drag.ts:277` | A moved/pulled schedule window is not `future` (pre-78710ed) | `use-grid-drag.test.tsx`, `agenda.test.tsx` | ✅ Killed (3 tests) |
| F15 | `use-grid-drag.ts:228` | Moved window may start before now (`Math.max(0, …)`) | `use-grid-drag.test.tsx` | ✅ Killed |
| F16 | `frontend/src/pages/focus.tsx:137` | A started break stays in the list until the re-read | `focus.test.tsx` | ✅ Killed |
| F17 | `frontend/src/components/focus/planned-breaks.tsx:31` | Ended breaks still listed | `focus.test.tsx` | ✅ Killed (2 tests) |
| F18 | `focus.tsx:137` | Breaks of other lists listed | `focus.test.tsx` | ✅ Killed (2 tests) |
| F19 | `plan-sidebar.tsx:234` | List task loses `tabIndex={-1}` | `plan-sidebar.test.tsx` | ✅ Killed |

**Sensor depth**: expanded (PLAN-49 touches data integrity across users). **Result (round 5, superseded by round 6)**: 24/26 killed, 2 survived - FAIL ❌.

### Ranked gaps (round 5)

1. **PLAN-49, owner check not tested (B1, Major).** `backend-node/src/services/focus.ts:340` limits the update to the actor's own plans in the workspace, which is correct on HEAD, but `backend-node/test/routes/plans.test.ts:302-315` only sends the id of the same user's *task* block, although its title says "a break of another user". Failing scenario with the clause removed: user B (same workspace) saves a plan with `Café`; user A posts `POST /api/focus/break` with `plan_block_id` = B's break id → 200, A's Intervalo opens and B's break gets `started_at` and vanishes from B's Agenda. Fix task: in that test (or a new one), save a break as a second member and send its id as the owner; expect 422 `plan_break_unknown`, `GET /api/focus` session null, and B's `GET /api/plans/<day>` break `started_at` still null.
2. **ADJ-26, projected occurrences not tested (F10, Minor).** `frontend/src/pages/agenda.tsx:201` empties `projected` under `Exibir agendamentos` off, as the spec asks, but `pages/agenda.test.tsx:1773-1802` mocks `projected: []`. Failing scenario with the mutant: a series' next occurrence keeps showing on the grid with the switch off. Fix task: add a projected occurrence to that test's mock and assert it is gone after the click and after reopening; name the test `ADJ-26 …`.
3. **PLAN-48, past day not tested (Minor, evidence-or-zero).** The spec says "Um `viewer` e um dia passado SHALL não ver o card"; only the viewer is tested (`pages/plan.test.tsx:388-393`). The past day shares `readOnly` (`pages/plan.tsx:71`, `:240`), so HEAD is right. Fix task: in the PLAN-34 test (`pages/plan.test.tsx:228`) assert `queryByRole('button', { name: 'Arrastar nova tarefa para a grade' })` is null.
4. **PLAN-02, the drag path (Cosmetic).** Focus on a drag comes from the browser's mousedown on a `tabIndex=-1` `li`; jsdom `pointerDown` does not focus, so only the click and the checkbox are tested. Acceptable; noted only.

### Stale or imprecise spec text (do not block, for the author)

- `planejamento-diario/spec.md:30` (Out of Scope): "`Encaixar` automático … fora da primeira entrega" - PLAN-32, PLAN-33, PLAN-50 are implemented.
- `spec.md:286` (PLAN-D6): "pausas fixas e `Encaixar` vêm depois" - same.
- `spec.md:48` (Assumptions table): "Qualquer dia de hoje em diante, abrindo em amanhã" - PLAN-D5 was revised to open on today.
- `spec.md:166` (Independent Test of PLAN-30): "chegar ao plano de amanhã" - now today.
- `spec.md:258` Coverage: "45 total, 45 mapped (T1 a T25)" - PLAN-46..PLAN-50 make 50, and their rows say only "Tasks".
- `spec.md` P1 *Ver o plano na Agenda*: the criteria read 7, 9, 8 (PLAN-49 sits before PLAN-47).
- `agenda-adjustments/spec.md`: ADJ-26 is `Implementing` with no task, and the Coverage line still says 25 total; no test names `ADJ-26`.

### Requirement traceability (round 5)

| Requirement | New status |
| --- | --- |
| PLAN-02, PLAN-03, PLAN-15, PLAN-24, PLAN-26, PLAN-27, PLAN-28, PLAN-30, PLAN-32, PLAN-39, PLAN-46, PLAN-47, PLAN-50; DAYS-07, DAYS-13; ADJ-21..25; AGENDA-02, AGENDA-04 | ✅ Verified |
| PLAN-49 | ❌ Needs Fix (test: another user's break) |
| PLAN-48 | ⚠️ Needs Fix (test: past day) |
| ADJ-26 | ❌ Needs Fix (test: projected occurrences) |

---

## Round 4 header (kept)

**Date**: 2026-11-08
**Spec**: `.specs/features/planejamento-diario/spec.md`
**Diff range**: `143c7b1..c9145e0` (33 commits; round-4 delta `51fbf0e..c9145e0`: 907d397, c9145e0, 4 files, +76/-8; round-3 delta `6f03642..51fbf0e`)
**Verifier**: independent sub-agent, round 4 (author ≠ verifier; the user allowed one more round after round 3)

**Verdict**: PASS ✅ (round 4). The round-3 gap is closed: c9145e0 tests both logo exits with a draft, and E1/E2 are now killed. The full frontend suite is green (175 files, 1884 tests). See *Round 4* below.

**Round-3 verdict (superseded)**: FAIL ❌. Every gate is green. Both round-2 gaps are closed: the workspace menu now asks on every exit, and M15 is killed. The fresh sweep of every exit from `/planejar/:day` found one test-only gap on PLAN-36: the two logo links in the shell ask correctly on HEAD, but no test clicks them with a draft. Removing the guard from either logo (E1, E2) survives the suite. This is the last allowed round, so the gap goes to the user.

---

## Round 4: round-3 gap → resolution

| Round-3 gap | Fix | Round-4 result |
| --- | --- | --- |
| PLAN-36: the two logo links (`app-layout.tsx:134-136` header, `:183-186` sidebar, each `onClick={guarded('/')}`) had no test with a draft (E1/E2 survived) | c9145e0: `it.each` over `['the mobile header','header']` and `['the sidebar','aside']` in `frontend/src/components/app-layout.test.tsx:267-312` | ✅ Closed. E1 and E2 are killed. |

**The test asserts the spec outcome (PLAN-36), not the implementation.** It renders `AppLayout` under `DraftGuardProvider` on `/planejar/2026-11-09` with a page that sets a draft day, and reads the router path through `useLocation()`:
- `:295-298`: both links named `t('app.name')` exist (`toHaveLength(2)`); the one inside `header` or `aside` is picked, `href '/'`.
- `:300-302`: a click opens `dialog` named `Descartar o rascunho?`; the path is still `/planejar/2026-11-09`.
- `:303-304`: `Continuar planejando` keeps the path at `/planejar/2026-11-09`.
- `:306-308`: a second click, then `Descartar`, and the path becomes exactly `/` (`/^\/$/`).
No assertion touches `guarded`, `confirmLeave` or any mock; it checks the dialog text, the button names and the route, all from the spec.

**Sensor (round 4).** Scratch: `app-layout.tsx` copied to the scratchpad, mutated in place with `sed` on one line, restored from the copy after each run. No `git stash`. `npx vitest run src/components/app-layout.test.tsx`:

| # | File:line | Mutation | Result |
| --- | --- | --- | --- |
| E2 | `frontend/src/components/app-layout.tsx:136` | Header logo loses `onClick={guarded('/')}` | ✅ Killed: `PLAN-36 the logo of the mobile header ...` (1 failed, 29 passed) |
| E1 | `frontend/src/components/app-layout.tsx:186` | Sidebar logo loses `onClick={guarded('/')}` | ✅ Killed: `PLAN-36 the logo of the sidebar ...` (1 failed, 29 passed) |

Each mutant fails only its own row, so each call site is discriminated on its own. After restoring, `git diff --quiet frontend/src/components/app-layout.tsx` is clean and `git status --porcelain` equals the pre-sensor baseline (`diff` empty).

**Full frontend suite (round 4)**: `cd frontend && npx vitest run` → Test Files 175 passed (175), Tests 1884 passed (1884), first run, no rerun needed. Frontend count 1881 → 1884 (+2 from the logo `it.each`, +1 in `week-grid.test.tsx` from 907d397). None deleted. Lint, typecheck, build and the backend suite were not re-run this round; the round-4 delta touches only frontend files and `spec.md`.

**Also in the delta (not part of the round-3 gap):** 907d397 (`week-grid.tsx`, `week-grid.test.tsx`, a one-line PLAN-25 amendment in `spec.md`) shows a planned task once when it also sits in the no-time row. It is covered by the green suite; it was not mutation-tested in this round.

---

## Round 2 gaps → resolution

| Round-2 gap | Fix | Round-3 result |
| --- | --- | --- |
| PLAN-36: workspace menu leaves an unsaved plan without asking (`workspace-switcher.tsx` settings, admin, switch, create-then-navigate, logout) | 2ded495: each item goes through `confirmLeave` (`workspace-switcher.tsx:127-130, 190, 213, 232, 319`); the active workspace no longer asks (`:190` `!isActive &&`). Tests `workspace-switcher.test.tsx:125-221` | ✅ Closed. W1-W7 all killed, one test per exit. |
| PLAN-36: M15 survived (`onPop` not re-pushing the sentinel) | 51fbf0e: after `Continuar planejando`, a second Back must reopen the dialog and stay on `/planejar/2026-11-09` (`draft-guard.test.tsx:162-165`) | ✅ Closed. M15 re-run is killed by `with a draft, Back asks ... and stays on the plan`. |

Behaviour notes on the fix (checked, not gaps):
- Switching workspace after `Descartar`: `switchWorkspace` runs `queryClient.resetQueries()` (`contexts/workspace-provider.tsx:71`). The plan query loses its data, `PlanScreen` falls back to the skeleton (`pages/plan.tsx:311`), and `PlanDay` unmounts. The discarded draft cannot stay on screen unguarded.
- Creating a workspace and then choosing `Continuar planejando` keeps the user on the plan. The new workspace still exists, but the app does not switch to it. That matches "nothing leaves until `Descartar`".

---

## PLAN-36 exit sweep (fresh, round 3)

Every way out of `/planejar/:day` in the shell (`App.tsx:79` mounts `DraftGuardProvider` around `AppLayout`):

| Exit | Code | Guarded on HEAD | Test (with a draft) | Discriminated |
| --- | --- | --- | --- | --- |
| Sidebar nav links | `app-layout.tsx:276-279` `guarded(item.path)` | ✅ | `app-layout.test.tsx:226` | ✅ M14 (round 2) |
| Header logo (mobile bar) | `app-layout.tsx:134-136` `guarded('/')` | ✅ | `app-layout.test.tsx:267-312` (`header` row), round 4 | ✅ E2 killed (round 4) |
| Sidebar logo | `app-layout.tsx:183-186` `guarded('/')` | ✅ | `app-layout.test.tsx:267-312` (`aside` row), round 4 | ✅ E1 killed (round 4) |
| Day arrows | `pages/plan.tsx:162` `goTo` → `confirmLeave` | ✅ | `pages/plan.test.tsx:324` | ✅ (round 1) |
| Header calendar | `pages/plan.tsx:180` `onPick={goTo}` | ✅ | `pages/plan.test.tsx:310-321` | ✅ M18 (round 2) |
| Command palette (nav, quick actions, recents) | `command-palette.tsx:149` `go`, the only navigate call (`:223`) | ✅ | `command-palette.test.tsx:74` | ✅ M17 (round 2) |
| Browser Back (repeated) | `lib/plan/draft-guard.tsx:42-58` | ✅ | `draft-guard.test.tsx:146-198` | ✅ M15, M16, M19 |
| Tab close / reload | `draft-guard.tsx:31-40` `beforeunload` (listener at `:38`) | ✅ | `draft-guard.test.tsx:89-93` | (round 1) |
| Workspace menu: settings, admin, switch, create, logout | `workspace-switcher.tsx:127-130, 190, 213, 232, 319` | ✅ | `workspace-switcher.test.tsx:142-208` | ✅ W1-W5, W7 |
| Workspace menu: active workspace | `workspace-switcher.tsx:190` | no exit, no dialog | `workspace-switcher.test.tsx:173` | ✅ W6 |
| Menu dialogs (password, 2FA, passkeys, tokens), language, theme, privacy, palette toggle | open dialogs or toggle in place | not exits | - | - |
| Desktop `Install update` (`update-available-banner.tsx:27`) | relaunches the app; covered by the same `beforeunload` path as closing the window | out of scope (desktop only) | - | - |

Other `useNavigate` users (`grep`): `lib/api.ts` (redirect on an expired session, not a user's attempt to leave) and other pages that are not mounted while the plan is shown.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1–T25 | ✅ Done | Unchanged since round 1. |
| Round-1 fixes | ✅ Committed | 9cdf204, fee356c, bf96cb3, 6f03642 |
| Round-2 fixes | ✅ Committed | 2ded495, 51fbf0e |
| Round-3 fix | ✅ Committed | c9145e0 (plus 907d397, PLAN-25) |

---

## Spec-Anchored Acceptance Criteria

Paths are relative to `backend-node/test/` (BE) and `frontend/src/` (FE). In `6f03642..HEAD` only `workspace-switcher.*`, `draft-guard.tsx` (a one-line comment), `draft-guard.test.tsx` (+4 lines after line 157) and `design.md` changed, so the other round-2 citations hold. Spot-checked again on HEAD: `pages/plan.test.tsx` PLAN-07/08 (round 2 cited `:160-168`, the lines are `:156-164`, corrected below), `app-layout.test.tsx:226`, `command-palette.test.tsx:74`, `draft-guard.test.tsx:89-93`, `capacity-bar.test.tsx:63-66`, BE `services/plans-save.test.ts:136-142`, BE `routes/plans.test.ts:288-289`. All match.

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| PLAN-01 | `Planejar amanhã` (Agenda and Hoje) opens `/planejar/<tomorrow>` in the workspace timezone | FE `pages/agenda.test.tsx:1752` - `expect(where).toHaveTextContent('/planejar/2026-11-05')`; FE `pages/home.test.tsx:331` - `toHaveTextContent('/planejar/2026-11-09')`; FE `pages/plan.test.tsx:131` - redirects `/planejar` to `/planejar/2026-11-09` (UTC is already Monday; São Paulo is still Sunday 23:30) | ✅ |
| PLAN-02 | Groups `Agendadas para o dia`/`Hoje`/`Esta semana`/`Backlog`, title search, list filter | FE `components/plan/plan-sidebar.test.tsx:73` - `expect(groups()).toEqual({'Agendadas para o dia': [...], ...})`; `:92` search ignoring accents; `:106` list filter; BE `services/plans-read.test.ts:201` - order `[ofTheDay, today, week, backlog]`; BE `routes/plans.test.ts:191` - full candidate payload | ✅ |
| PLAN-03 | 00:00–24:00 grid scrolled to the workday start; timed tasks and sessions are fixed and cannot be dragged | FE `components/plan/plan-grid.test.tsx:53-54` - `height '1440px'`, `scrollTop 540`; `:61-63` - fixed blocks have no handle or `cursor-grab`; `:73` - `onMove` not called for a fixed block | ✅ (component level; the page only wires the queries) |
| PLAN-04 | Drop places a draft block on the 15-min step; length is the estimate, or 1h without one | FE `lib/plan/use-plan-drag.test.tsx:62` - `onDrop(taskItem, at(10,30))` for a release at 10:37; FE `lib/plan/draft.test.ts:28` - `{start: at(10,30), minutes: 60}`; `:34` - `minutes: 25` | ✅ |
| PLAN-05 | Move on 15-min steps; bottom-edge resize from 5 min to 24 h without touching the estimate | FE `lib/plan/draft.test.ts:54` - `start: at(10,45)`; `:60-61` - `minutes: 135`, `estimate_minutes: 90`; `:66` - `minutes: 1440` | ✅ |
| PLAN-06 | Edit start and length in HH:MM fields; remove the block; the length field stops at `23:59` and 24 h is reached by the edge (spec amended in 9cdf204) | FE `components/plan/block-editor.test.tsx:61` - `toMatchObject({start: 840, minutes: 135, task: {estimate_minutes: 90}})`; `:83` - remaining keys `['b2']`; 24 h by edge: FE `lib/plan/draft.test.ts:66` - `minutes: 1440` | ✅ (re-checked; the `23:59` cap is the reused `schedule-picker` input, marked SPEC_DEVIATION at `block-editor.tsx:86` and now in the spec) |
| PLAN-07 | `Rascunho — ainda não salvo`, `Descartar` and `Confirmar plano`; nothing saved | FE `pages/plan.test.tsx:156` - footer text; `:159` - `expect(plans.save).not.toHaveBeenCalled()` | ✅ (re-checked; line numbers corrected from round 2) |
| PLAN-08 | One write replaces the day, then `Plano salvo` | FE `pages/plan.test.tsx:163-164` - status `Plano salvo` and `toHaveBeenCalledExactlyOnceWith(DAY, {base_version: 3, blocks: [...]})`; BE `services/plans-save.test.ts:115-124` - replaced, version 2→3, one header, two blocks | ✅ (re-checked; line numbers corrected from round 2) |
| PLAN-09 | A task without a day gets the plan's day, no time, D3 column | BE `services/plans-save.test.ts:209` - `{column:'this_week', scheduledOn: TOMORROW, scheduledTime: null}`; `:215` today→`today`; `:221` next week stays `backlog`; BE `routes/plans.test.ts:91` | ✅ |
| PLAN-10 | No change to `scheduled_time` or `estimate_minutes` | BE `services/plans-save.test.ts:260-261` - before/after equal; `:240` | ✅ |
| PLAN-11 | A saved plan shows its blocks; a change makes it a draft again | FE `pages/plan.test.tsx:179-185`; FE `lib/plan/draft.test.ts:108-134` (isDirty); BE `services/plans-read.test.ts:124` | ✅ |
| PLAN-12 | Only the logged user's plan in the current workspace | BE `services/plans-read.test.ts:150`, `:265`; BE `routes/plans.test.ts:182` (editor sees `version 0`), `:297` (404 for another workspace) | ✅ |
| PLAN-13 | Arrows or the header calendar open that day | FE `pages/plan.test.tsx:287-298` - arrows → `plans.get('2026-11-10')` and back; FE `pages/plan.test.tsx:300-322` - `Escolher dia` → `12`: heading `Quinta-feira, 12 de novembro`, where `/planejar/2026-11-12`, `expect(plans.get).toHaveBeenCalledWith('2026-11-12')` | ✅ (re-checked; killed M18) |
| PLAN-14 | `Café` (`15min`), `Almoço` (`1h`), `Nova pausa`, in the app's `formatDuration` format (spec amended in 9cdf204) | FE `components/plan/plan-sidebar.test.tsx:148-150` - buttons `'Café 15min'`, `'Almoço 1h'`, `'Nova pausa'` | ✅ (re-checked; the round-1 precision gap is settled by the spec) |
| PLAN-15 | A break block in gray hatch, unlike a task | FE `components/plan/plan-block.test.tsx:49-51` - `repeating-linear-gradient(...)`, no `border-l-4`; FE `lib/plan/draft.test.ts:39` | ✅ |
| PLAN-16 | `Nova pausa` asks for name (1–40) and length; empty or >40 → `O nome vai de 1 a 40 caracteres`, nothing created (spec amended in 9cdf204) | FE `components/plan/break-dialog.test.tsx:26` - `onCreate({kind:'break', name:'Walk', minutes:20, list: work})`; `:43-44` - not called, alert `'The name takes 1 to 40 characters'`; `:51,54` 41 refused, 40 accepted; the same key `nameRange` is `O nome vai de 1 a 40 caracteres` in `locales/pt-BR.json:1023` | ✅ (re-checked; the test asserts the English rendering of the key whose pt-BR value is the spec text, see note) |
| PLAN-17 | Outside 5–120 → `A pausa vai de 5 min a 2h`, previous length kept | FE `components/plan/block-editor.test.tsx:123-125` - alert text, `minutes 60` kept; FE `components/plan/break-dialog.test.tsx:69`; FE `lib/plan/draft.test.ts:73-74` | ✅ |
| PLAN-18 | A break keeps the Intervalo list: first active list by default, editable | FE `components/plan/break-dialog.test.tsx:22`; FE `components/plan/block-editor.test.tsx:141` - `list: home`; FE `components/plan/plan-sidebar.test.tsx:159` | ✅ |
| PLAN-19 | `<p> planejadas de <l> livres · <b> em pausas[ · <a> agendadas]` | FE `components/plan/capacity-bar.test.tsx:40` - `'4h planejadas de 8h livres · 1h em pausas'`; `:49` - `'... · 1h agendadas'`; FE `lib/plan/capacity.test.ts:20,25` - exact numbers from the spec examples | ✅ |
| PLAN-20 | Red with `<excesso> além do expediente` | FE `components/plan/capacity-bar.test.tsx:63-66` - `'9h planejadas de 8h livres · 1h em pausas'`, `text-destructive`, `'1h além do expediente'`; `:73-74` - `'9h ... de 7h livres · 1h em pausas · 1h agendadas'`, `'2h além do expediente'` | ✅ (both Independent Test numbers match exactly) |
| PLAN-21 | Workday start and end marked; hours outside it shaded | FE `components/plan/plan-grid.test.tsx:122-128` - edges at 540px/1080px, `bg-muted/60` | ✅ |
| PLAN-22 | Changing the workday saves it to preferences and recomputes the bar | FE `components/plan/workday-editor.test.tsx:79-80` - `setWorkday({start:'08:00', end:'12:00'})`, bar `4hr of 4hr`; BE `services/workday.test.ts:38` - other keys kept; BE `routes/plans.test.ts:240-244` | ✅ |
| PLAN-23 | End not after start → `O fim precisa ser depois do início` | FE `components/plan/workday-editor.test.tsx:115-116`; BE `services/workday.test.ts:63-64` - 422 `workday_end_before_start`; BE `routes/plans.test.ts:254-255` | ✅ |
| PLAN-24 | Agenda shows saved blocks: task dashed in the list colour, break hatched, not covering sessions | FE `components/agenda/week-grid.test.tsx:744-751` - lanes `['0%','50%','50%','50%']`; FE `components/agenda/planned-block.test.tsx:54,60-61`; FE `pages/agenda.test.tsx:1699-1702`; BE `routes/plans.test.ts:218` | ✅ |
| PLAN-25 | Task with a block and `scheduled_time` the same day → only the plan block | FE `components/agenda/week-grid.test.tsx:762-764` - one button, `data-plan-block='p-a'` | ✅ (killed M8) |
| PLAN-26 | `Começar` → Intervalo of the break length, in its list, via `POST /api/focus/break` | FE `pages/agenda.test.tsx:1711` - `action toMatchObject({type:'break', minutes:15, list_id: WORK})`; BE `routes/focus.test.ts:314` - `planned_seconds: 300` for 5 min | ✅ |
| PLAN-27 | An open task session is closed with reason `break` first | Same server path: `docs/focus-transitions.json:981` (`end_reason: "break"`) run by BE `services/focus-transitions.test.ts:226-238` - `expect(await sessionsNow(keys)).toEqual(...)`; FE `pages/agenda.test.tsx:1711` proves the same action is sent | ✅ (by reuse; no new code) |
| PLAN-28 | `Começar` only on today's plan | FE `components/agenda/planned-block.test.tsx:49` - `queryByRole('button',{name:'Começar'})).toBeNull()` for another day; FE `pages/agenda.test.tsx:1743` (viewer) | ✅ (killed M9) |
| PLAN-29 | Click on a planned task → the plan of its day | FE `pages/agenda.test.tsx:1749` - `'/planejar/2026-11-05'` | ✅ |
| PLAN-30 | `Planejar` in the sidebar → the plan of tomorrow | FE `components/app-layout.test.tsx:219` - `href '/planejar'`, plus FE `pages/plan.test.tsx:132` (redirect to tomorrow) | ✅ |
| PLAN-31 | `Planejar dia` in a day header → the plan of that day | FE `components/agenda/week-grid.test.tsx:772` - `onPlanDay('2026-11-06')` | ✅ |
| PLAN-32 | `Encaixar`: in the order marked, first free slot, no overlap with blocks, sessions or timed tasks | FE `lib/plan/fit.test.ts:13,30,56`; FE `components/plan/plan-sidebar.test.tsx:203` - `['widget@540','review@660','resume@750']`; FE `pages/plan.test.tsx:251-285` - timed task 09:00–10:00 and session 10:00–10:30 São Paulo, `expect(blocks()[0]).toHaveAccessibleName(/^Write the spec, 10:30 – 11:30/)` | ✅ (re-checked; killed M13, M21, M22, M23) |
| PLAN-33 | Leftovers stay; `<n> tarefas não couberam` | FE `components/plan/plan-sidebar.test.tsx:220-222` | ✅ |
| PLAN-34 | Past day: read only, no drag, no `Confirmar`, no `Começar` | FE `pages/plan.test.tsx:229-236`; BE `services/plans-read.test.ts:160`; BE `services/plans-save.test.ts:157-158` - 422 `plan_day_past`; BE `routes/plans.test.ts:114-115` | ✅ |
| PLAN-35 | 409 `plan_changed`; `O plano mudou em outro lugar` + `Recarregar`; nothing written | BE `services/plans-save.test.ts:136-142`; BE `routes/plans.test.ts:106-108`; FE `pages/plan.test.tsx:197-206`; FE `lib/plan/use-plan.test.tsx:123-124` | ✅ (killed M1, M12) |
| PLAN-36 | Any attempt to leave the screen with an unsaved draft asks `Descartar o rascunho?` (`Continuar planejando` / `Descartar`) | Day arrows FE `pages/plan.test.tsx:324-340`; header calendar `:310-321`; sidebar nav links FE `components/app-layout.test.tsx:226-265`; palette FE `components/command-palette.test.tsx:74-95`; browser Back incl. a second Back after `Continuar planejando` FE `lib/plan/draft-guard.test.tsx:146-197` (`:162-165` - dialog `Descartar o rascunho?`, `where()` and `window.location.pathname` still `/planejar/2026-11-09`); tab close `draft-guard.test.tsx:89-93`; workspace menu FE `components/workspace-switcher.test.tsx:142-220` (settings, admin, switch, active workspace, logout, create-then-switch, no-draft) ; logo links FE `components/app-layout.test.tsx:267-312` (header and sidebar: dialog, stays on `Continuar planejando`, `/` only on `Descartar`) | ✅ (round 4; E1/E2 killed. Round 3 had no logo test.) |
| PLAN-37 | Save fails → draft kept, `Não foi possível salvar o plano.` + `Tentar de novo` | FE `pages/plan.test.tsx:215-223` | ✅ |
| PLAN-38 | `Agendada para <dia>`; save keeps the task's day | FE `components/plan/plan-block.test.tsx:71` - `'Agendada para qua, 11 nov'`; BE `services/plans-save.test.ts:240-241` | ✅ (killed M3) |
| PLAN-39 | Done task crossed out in the plan and the Agenda | FE `components/plan/plan-block.test.tsx:58-59` - `line-through`; the Agenda draws the same `PlanBlock` (`planned-block.tsx:46`); BE `services/plans-read.test.ts:169` - `done: true` | ✅ |
| PLAN-40 | Deleted task or archived list → the block leaves | BE `db/day-plans-schema.test.ts:97-102` (cascade); BE `services/plans-read.test.ts:183`, `:278` | ✅ (killed M11) |
| PLAN-41 | Viewer → 403 `Read-only role` on plan save and on workday | BE `routes/plans.test.ts:168-171`, `:265-267` | ✅ |
| PLAN-42 | `tkz_` token → 403 on every plan route | BE `routes/plans.test.ts:288-289` - all 5 routes give `'Route not available for tokens'` | ✅ |
| PLAN-43 | Bad HH:MM, duration out of range, foreign task or list, nameless break → 422, nothing written | BE `routes/plans.test.ts:129-141`, `:155-158`; BE `services/plans-save.test.ts:191-201` | ✅ |
| PLAN-44 | A block past 24:00 is cut at 24:00, saved length kept | FE `components/plan/plan-grid.test.tsx:110-111` - `['1380px','60px']`, name `... · 2hr` | ✅ |
| PLAN-45 | Starting while an Intervalo is open answers as `/api/focus/break` does; no second Intervalo | BE `routes/focus.test.ts:317-319` - 409 `invalid_transition`; FE `pages/agenda.test.tsx:1734-1735` - toast with the server detail, one call | ✅ |

**Status**: ✅ 45 of 45 match the spec outcome (round 4). In round 3, 44 of 45 did: the logo exits had no test.

### Spec-precision gaps

None open.

**Note (PLAN-16, carried over, not counted):** the break-name test asserts the English string of the key whose pt-BR value is the spec text (`locales/pt-BR.json:1023`). A wrong pt-BR translation would not be caught.

---

## Discrimination Sensor

Scratch: `git worktree add --detach <scratchpad>/wt HEAD` with `frontend/node_modules` and `backend-node/node_modules` symlinked. Each mutant was applied by an exact single-match replace (a script asserts the match count is 1), run with `npx vitest run <files>`, and reverted with `git checkout`. The worktree is removed (`git worktree remove --force`, `git worktree prune`). The real tree's `git status --porcelain` equals the pre-sensor baseline exactly (`diff` empty). The real `node_modules` are intact.

| # | File:line | Mutation | Tests run | Result |
| --- | --- | --- | --- | --- |
| M15 (re-run) | `frontend/src/lib/plan/draft-guard.tsx:48` | Back's `onPop` no longer re-pushes the sentinel | lib/plan, app-layout, palette, workspace-switcher, plan page (105) | ✅ Killed: `with a draft, Back asks ... and stays on the plan; Descartar goes back` |
| W1 | `frontend/src/components/workspace-switcher.tsx:213` | Workspace settings → `navigate` without `confirmLeave` | workspace-switcher, app-layout, lib/plan (91) | ✅ Killed |
| W2 | `workspace-switcher.tsx:232` | Admin → `navigate` without `confirmLeave` | same (91) | ✅ Killed |
| W3 | `workspace-switcher.tsx:190` | Switching to another workspace without `confirmLeave` | same (91) | ✅ Killed |
| W4 | `workspace-switcher.tsx:319` | Logout without `confirmLeave` | same (91) | ✅ Killed |
| W5 | `workspace-switcher.tsx:127-130` | After create, switch and navigate without `confirmLeave` | same (91) | ✅ Killed |
| W6 | `workspace-switcher.tsx:190` | Drop `!isActive &&`: the active workspace asks | workspace-switcher (9) | ✅ Killed |
| W7 | `workspace-switcher.tsx:128` | After create + `Descartar`, navigate without switching to the new workspace | workspace-switcher (9) | ✅ Killed |
| E1 | `frontend/src/components/app-layout.tsx:186` | Sidebar logo loses `onClick={guarded('/')}` (plain `Link to="/"`) | app-layout, lib/plan, palette, workspace-switcher, plan page (105) | ❌ **Survived** |
| E2 | `app-layout.tsx:136` | Header logo loses `onClick={guarded('/')}` | same (105) | ❌ **Survived** |
| E3 | `frontend/src/lib/plan/capacity.ts:54` | A timed task with a block is also counted as scheduled (PLAN-D7 filter removed) | lib/plan, components/plan, plan page (125) | ✅ Killed: `counts a timed task that has a block only by the block` |
| E4 | `backend-node/src/services/plans.ts:213` | Today's plan treated as past (`day < today` → `day <= today`) | BE plans-save, plans-read, routes/plans (44) | ✅ Killed: `takes a Backlog task planned for today to Today (D3)` |

**E1/E2 confirmation probe (scratch only, deleted with the worktree):** a test that holds a draft on `/planejar/2026-11-09`, clicks each `link` named `trackzyn` (2 found), and expects `Descartar o rascunho?` with the router still on the plan. It passes on HEAD. It fails under E1 (sidebar logo) and under E2 (header logo). The mutants are not equivalent: without the guard the logo goes to `/` and the draft is lost silently.

**Sensor depth**: expanded (12 mutants: M15 re-run, 7 on the workspace-menu fix, 2 on the logo exits, 2 elsewhere: capacity and backend past-day check)
**Result**: round 3: 10 killed, 2 survived (E1, E2). Round 4: E1 and E2 re-run, both killed. 12/12 killed - PASS ✅

---

## Payload / Conjunction Rule

The new workspace-menu tests assert value and state, not just that a call happened. `switchWorkspace` is called exactly once with `'ws-2'` / `'ws-new'`, `logout` once, and the router path is checked before and after `Descartar` (`/workspace/settings`, `/admin`). `create` is called once while nothing has switched yet.

---

## Reviewed deviations

| # | Deviation | Judgement |
| --- | --- | --- |
| (a), (b) | 23:59 length field; `1h 30min` durations | Resolved in the spec (round 2). |
| (c) | Guard misses ways out | **Resolved in code.** Every exit in the shell asks; the logo exits lack a test (gap above). `design.md` and the `draft-guard.tsx` doc comment now list the workspace menu. |
| (d) | Viewer cannot change their workday | Matches the spec. |
| (e) | Tests edited | Legitimate. In `6f03642..HEAD` the only removed test line is the merged `findByRole('dialog')` click in `draft-guard.test.tsx:162`, replaced by stronger assertions. The old mocks in `workspace-switcher.test.tsx` were moved into a hoisted `state`; the passkeys tests are unchanged. |

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code / no scope creep | ✅ 17 lines in `workspace-switcher.tsx`, a comment in `draft-guard.tsx` |
| Surgical changes | ✅ |
| Matches patterns | ✅ Same `confirmLeave` path as the sidebar, palette and arrows |
| Spec-anchored outcome check | ✅ PLAN-36 logo exits tested (round 4) |
| Every test maps to a requirement | ✅ New tests carry PLAN-36 |
| Guidelines followed | ✅ `CONTRIBUTING.md` |

---

## Edge Cases

- [x] PLAN-34, PLAN-35, PLAN-37 to PLAN-45 (unchanged)
- [x] PLAN-36 workspace menu, repeated Back
- [x] PLAN-36 logo exits: guarded and tested (round 4)

---

## Gate Check

- **Backend**: `npm --prefix backend-node run lint && npm --prefix backend-node run typecheck && npm --prefix backend-node test` exited 0. Test Files 77 passed and 1 skipped (78). Tests 1033 passed, 9 skipped, 0 failed. The 9 skips are the Redis-gated suites (`describe.runIf(process.env.REDIS_URL)`), unchanged.
- **Frontend**: `npm --prefix frontend run lint && npm --prefix frontend run typecheck && npm --prefix frontend test && npm --prefix frontend run build` exited 0. Test Files 175 passed. Tests 1881 passed, 0 failed. The build succeeded.
  - The first frontend run, made while the backend suite ran in parallel, had one timeout in `pages/showcase/showcase.test.tsx` (5 s, a 6 s run; the file is outside the diff). The re-run alone was fully green. This is load flakiness, not a regression.
- **Test count**: frontend 1874 → 1881 (+7 in `workspace-switcher.test.tsx`: 2 from `it.each`, 5 `it`). Backend unchanged (1033). None deleted.

---

## Fix Plans

### Fix 1: The logo exits are not tested (PLAN-36, E1/E2) - Minor (test-only) - ✅ Done in c9145e0 (round 4)
- **Root cause**: `app-layout.test.tsx:226` covers the guard only through a sidebar nav link. The two logo `Link`s (`app-layout.tsx:134-136`, `:183-186`) share `guarded('/')`, but each `onClick` is a separate call site that no test exercises.
- **Fix task**: in `app-layout.test.tsx`, with a draft on `/planejar/2026-11-09`, click each `link` named `t('app.name')` (both of `getAllByRole`). Expect `Descartar o rascunho?` with the path still `/planejar/2026-11-09`, then reach `/` only after `Descartar`. The scratch probe above shows this kills E1 and E2.
- **Escalation**: this is round 3 of 3, so the gap goes to the user. They can accept it, since the behaviour is correct on HEAD and only the regression test is missing, or allow one more fix and re-verify.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| PLAN-01–35, 37–45 | ✅ Verified | ✅ Verified |
| PLAN-36 | ❌ Needs Fix | ✅ Verified (round 4: logo exits tested, E1/E2 killed) |

The statuses in `spec.md` were not edited; that is left to the orchestrator.

---

## Summary

**Overall**: ✅ Ready (round 4). Round 3 was ❌ Not Ready with one test-only gap, now closed.

**Spec-anchored check**: 45/45 matched; 0 spec-precision gaps
**Sensor**: 12/12 mutants killed (E1, E2 killed in round 4)
**Gate**: frontend 1884 passed / 0 failed (round 4, `npx vitest run`); backend 1033 passed / 9 skipped / 0 failed, lint, typecheck and build OK (round 3)

**What works**: both round-2 gaps are closed. The workspace menu asks on every exit, with one discriminating test per exit (W1-W7), and a repeated Back stays blocked (M15 killed). Every shell exit, the two logos included (round 4), has a test that fails if its guard is removed.

**Next steps**: none for validation. The `spec.md` statuses are left to the orchestrator.
