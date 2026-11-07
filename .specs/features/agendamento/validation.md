# Agendamento de tarefas Validation (round 2)

**Date**: 2026-11-07
**Spec**: `.specs/features/agendamento/spec.md` (US-1 to US-14, D1 to D32)
**Diff range**: feature `origin/main..feat/agendamento` = `95c9583..b386561`; fixes of this round `565b400..b386561` (T49 `f52772a`, T50 `9346ca5`, T51 `b386561`; 6 backend source/test files)
**Verifier**: independent sub-agent (author ≠ verifier), round 2 of 3

## Validation: agendamento - PASS ✅

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

**Result**: 6 injected, 6 killed, 0 survived - PASS ✅. Round-1 mutants M1–M14 target code untouched by `565b400..HEAD` and keep their round-1 result (15/17 killed, 2 equivalent survivors).

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
