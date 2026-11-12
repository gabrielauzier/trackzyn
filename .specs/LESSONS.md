# LESSONS - auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Specify/Design)

Corroborated across multiple features. Safe to apply as guidance.

### L-044 - Give every spec edge case its own test with the edge condition set up, not a nearby happy path
- signal: `ac_gap` · recurrence: 2 feature(s) · scope: `frontend-pages` · harmful: 0
- features: agenda-adjustments, planejamento-diario
- evidence: M22 week-grid.tsx:121 / edge case Sessao escondida (frontend-pages) (+1 more)
- last seen: 2026-11-10T18:27:14Z

### L-048 - When a criterion narrows a rule to 'its own' item, add a test acting on a different item in the same state to prove the narrowing.
- signal: `surviving_mutant` · recurrence: 2 feature(s) · scope: `frontend-pages` · harmful: 0
- features: agenda-adjustments, agendamento
- evidence: N2 frontend/src/pages/agenda.tsx:144 (ADJ-08) (frontend-pages) (+1 more)
- last seen: 2026-11-10T18:48:14Z

## Candidates (under observation - do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-001 - Test drag-and-drop reorders within the same column in both directions, not only moves between columns.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `frontend/drag-and-drop` · harmful: 0
- features: listas-e-quadro
- evidence: M21 frontend/src/pages/list-board.tsx (frontend/drag-and-drop)
- last seen: 2026-10-24T16:00:37Z

### L-002 - Keyboard drags in tests always land on a card, so extract the drop target math into a pure function and test drops on a column's empty area directly.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `frontend/drag-and-drop` · harmful: 0
- features: listas-e-quadro
- evidence: M27 frontend/src/pages/list-board.tsx:141 (frontend/drag-and-drop)
- last seen: 2026-10-24T16:00:37Z

### L-003 - pt-BR plural rules map 0 to one, so every count string needs a _zero key and a pt-BR test with 0.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `frontend/i18n` · harmful: 0
- features: listas-e-quadro
- evidence: LIST-03 frontend/src/locales/pt-BR.json (frontend/i18n)
- last seen: 2026-10-24T16:00:37Z

### L-004 - Guards that must hold while a state lasts (closing with a running task, crash recovery) belong at app level, not on one screen the user can leave.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `frontend/hooks` · harmful: 0
- features: foco-e-sons
- evidence: SYNC-08 frontend/src/pages/focus.tsx:70-71 (frontend/hooks)
- last seen: 2026-10-25T01:15:53Z

### L-005 - Tests of client time sent to the server must use a non-zero clock offset, or a local clock passes for the corrected one.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `frontend/time` · harmful: 0
- features: foco-e-sons
- evidence: M19 frontend/src/lib/focus/use-focus.tsx:95 (frontend/time)
- last seen: 2026-10-25T01:15:53Z

### L-006 - A periodic background request must not silently resolve a state the spec says the user decides.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `frontend/sync` · harmful: 0
- features: foco-e-sons
- evidence: SYNC-11 use-focus.tsx heartbeat (frontend/sync)
- last seen: 2026-10-25T01:15:53Z

### L-007 - Page tests that mock the API client never see the request it builds; test each client function's HTTP call (path, query, body) at least once.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `frontend/api` · harmful: 0
- features: foco-e-sons
- evidence: N12 frontend/src/lib/api.ts:377 (frontend/api)
- last seen: 2026-10-25T01:53:09Z

### L-008 - Queue tests need several entries to prove ordering, and default arguments such as the clock must be exercised without passing them by hand.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `frontend/queue` · harmful: 0
- features: foco-e-sons
- evidence: V1 frontend/src/lib/focus/queue.ts:61; V3 queue.ts:93 (frontend/queue)
- last seen: 2026-10-25T02:32:53Z

### L-009 - When a rule is enforced in several places (read, start, heartbeat, recover), add the exact boundary case for each place, not only the first one.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `boundaries` · harmful: 0
- features: foco-e-sons
- evidence: S2 backend-node/src/services/focus.ts:202; S5 optimistic.ts:158 (boundaries)
- last seen: 2026-10-25T02:32:53Z

### L-010 - An e2e that skips assertions on one platform does not prove the behavior there; run it under a real window manager or keep the claim to the platforms it ran on.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `desktop/e2e` · harmful: 0
- features: widget-desktop
- evidence: T12 desktop/e2e/widget.spec.ts:41,72,113,158 (desktop/e2e)
- last seen: 2026-10-25T12:29:17Z

### L-011 - Before writing a latency in a spec, trace which channel actually carries the change; a cross-device change follows the polling interval, not the in-app event.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `specs` · harmful: 0
- features: widget-desktop
- evidence: widget-desktop Edge Case title within 1 s (specs)
- last seen: 2026-10-25T12:29:17Z

### L-012 - jsdom ignores @media print, so assert the print classes on the hidden and print-only elements (or run a print-emulated e2e) for every print requirement.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `frontend/print` · harmful: 0
- features: relatorios
- evidence: M30 frontend/src/components/app-layout.tsx:152; M31 print-header.tsx:16 (frontend/print)
- last seen: 2026-10-25T14:23:31Z

### L-013 - When a metric counts only one kind of record, add a fixture where only the other kind exists on that day.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `backend/reports` · harmful: 0
- features: relatorios
- evidence: M16 backend-node/src/services/reports.ts:182 (backend/reports)
- last seen: 2026-10-25T14:23:32Z

### L-014 - Complementary rounded percentages need a half-way case (like 1 of 32) to prove which side is derived from the other.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `backend/reports` · harmful: 0
- features: relatorios
- evidence: M2 backend-node/src/services/reports.ts:237 (backend/reports)
- last seen: 2026-10-25T14:23:32Z

### L-015 - Tests that build data relative to now must pin the clock or derive expectations from the same day boundaries; prove them at 00:05 UTC with sub-second fake times.
- signal: `gate_fail` · recurrence: 1 feature(s) · scope: `tests/time` · harmful: 0
- features: relatorios
- evidence: backend-node/test/routes/reports.test.ts:55,:112 (tests/time)
- last seen: 2026-10-26T00:39:28Z

### L-016 - Floor each reported value once from the exact sum; summing already-floored parts drifts below the real total.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `backend/aggregation` · harmful: 0
- features: relatorios
- evidence: backend-node/src/services/reports.ts:148,177 (backend/aggregation)
- last seen: 2026-10-26T00:39:28Z

### L-017 - Count a rate limit per operation, not per HTTP request, when the protocol lets one request carry many operations.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `rate-limit` · harmful: 0
- features: tokens-de-acesso
- evidence: RATE-01 (rate-limit)
- last seen: 2026-11-03T00:52:31Z

### L-018 - State whether a denied request counts as use when a requirement updates a usage timestamp.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `specs` · harmful: 0
- features: tokens-de-acesso
- evidence: MANAGE-07 (specs)
- last seen: 2026-11-03T00:52:31Z

### L-019 - State the precedence between authentication, origin and method errors when one route can answer several of them.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `specs` · harmful: 0
- features: tokens-de-acesso
- evidence: MCP-09 (specs)
- last seen: 2026-11-03T00:52:32Z

### L-020 - Name every view of an entity that must carry a new field when several endpoints render that entity.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `specs` · harmful: 0
- features: tokens-de-acesso
- evidence: ORIGIN-03 (specs)
- last seen: 2026-11-03T00:52:32Z

### L-021 - Record a framework-owned route exempted from a deny-by-default rule in the spec, not only in a test comment.
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `routes` · harmful: 0
- features: tokens-de-acesso
- evidence: backend-node/test/routes/token-scopes.test.ts:85 (routes)
- last seen: 2026-11-03T00:52:32Z

### L-022 - Reject NUL characters in text fields at the schema, since PostgreSQL refuses them with a 500.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `validation` · harmful: 0
- features: tokens-de-acesso
- evidence: backend-node/src/routes/access-tokens.ts:53 (validation)
- last seen: 2026-11-03T00:52:32Z

### L-023 - Test a shared validation rule through every route and tool that reuses it, not only the first one.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `routes` · harmful: 0
- features: tokens-de-acesso
- evidence: N09, N10 (validation.md iteração 2) (routes)
- last seen: 2026-11-03T01:53:14Z

### L-024 - Test the single-item case when a request shape is rejected as a collection.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `routes` · harmful: 0
- features: tokens-de-acesso
- evidence: B2 (validation.md iteração 2) (routes)
- last seen: 2026-11-03T01:53:15Z

### L-025 - Assert the precedence between two refusals with one request that triggers both.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `routes` · harmful: 0
- features: tokens-de-acesso
- evidence: O3, O4 (validation.md iteração 2) (routes)
- last seen: 2026-11-03T01:53:15Z

### L-026 - Test every lookup of an owned record against the same user's record in another workspace, not only another user's.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `backend/scoping` · harmful: 0
- features: agenda
- evidence: M6 backend-node/src/services/sessions.ts:190 (backend/scoping)
- last seen: 2026-11-04T06:16:42Z

### L-027 - Inject the hit-testing callback a drag depends on in tests, since jsdom lays nothing out and an untested callback means the cross-target move is unproven.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `frontend/drag-and-drop` · harmful: 0
- features: agenda
- evidence: F4 frontend/src/lib/agenda/use-grid-drag.ts:105 (frontend/drag-and-drop)
- last seen: 2026-11-04T06:16:42Z

### L-028 - Prove an optimistic rollback with the refetch failing or pending, since a successful refetch restores the cache by itself.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `frontend/optimistic` · harmful: 0
- features: agenda
- evidence: F6 frontend/src/lib/agenda/use-agenda.ts:100 (frontend/optimistic)
- last seen: 2026-11-04T06:16:42Z

### L-029 - Test interval grouping with a chain where one item overlaps the next and that one only touches a third.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `frontend/layout` · harmful: 0
- features: agenda
- evidence: F1 frontend/src/lib/agenda/layout.ts:122 (frontend/layout)
- last seen: 2026-11-04T06:16:42Z

### L-030 - Check that the endpoint a picker reuses returns the whole set the spec names before building on it; board views are windowed.
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `frontend/data-sources` · harmful: 0
- features: agenda
- evidence: SPEC_DEVIATION frontend/src/components/agenda/session-panel.tsx:67 (AGENDA-16) (frontend/data-sources)
- last seen: 2026-11-04T06:16:43Z

### L-031 - A check the spec runs over all the user's records must not read the list-filtered query the view shows.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `frontend/filters` · harmful: 0
- features: agenda
- evidence: AGENDA-19 frontend/src/pages/agenda.tsx:241 (frontend/filters)
- last seen: 2026-11-04T06:16:43Z

### L-032 - State the result at the exact boundary when a default time is derived by rounding, such as now within the first minutes of an hour.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `specs` · harmful: 0
- features: agenda
- evidence: AGENDA-15 frontend/src/lib/agenda/layout.ts:150 (specs)
- last seen: 2026-11-04T06:16:43Z

### L-033 - Say per view which entry points stay available on days the action cannot apply to, such as future days.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `specs` · harmful: 0
- features: agenda
- evidence: AGENDA-43 frontend/src/components/agenda/day-timeline.tsx:160 (specs)
- last seen: 2026-11-04T06:16:43Z

### L-034 - When a page renders different components per viewport, test each feature behaviour at the page level in every viewport, not only on the component with the prop passed by hand
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `frontend/pages` · harmful: 0
- features: hide-short-sessions
- evidence: F10 frontend/src/pages/agenda.tsx:274 (frontend/pages)
- last seen: 2026-11-04T16:09:11Z

### L-035 - Name every role allowed to change a workspace setting in the acceptance criterion itself, not only in the assumptions table
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `workspace-settings` · harmful: 0
- features: merge-near-sessions
- evidence: MERGE-05 (validation.md, backend-node/test/routes/workspaces.test.ts:192) (workspace-settings)
- last seen: 2026-11-04T18:04:33Z

### L-036 - Assert where focus lands after every close path the spec names, not only after Esc
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `frontend-components` · harmful: 0
- features: agenda-view-menu
- evidence: DAYS-04 view-menu.test.tsx:38-39 (frontend-components)
- last seen: 2026-11-04T20:16:50Z

### L-037 - When a spec says hidden items still count, make the test depend on an item that is actually hidden
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `frontend-pages` · harmful: 0
- features: agenda-view-menu
- evidence: M26 M28 pages/agenda.test.tsx:195-203 (frontend-pages)
- last seen: 2026-11-04T20:16:50Z

### L-038 - Give every spec edge case its own test with the edge condition set up, not a nearby happy path
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `frontend-pages` · harmful: 0
- features: agenda-view-menu
- evidence: M29 edge case 2, pages/agenda.test.tsx:790 (frontend-pages)
- last seen: 2026-11-04T20:16:51Z

### L-039 - State in the criterion which views a state-driven indicator applies to when the feature behaves differently per view
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `spec` · harmful: 0
- features: agenda-view-menu
- evidence: DAYS-14 view-menu.tsx:36 (spec)
- last seen: 2026-11-04T20:16:51Z

### L-040 - When a spec says a value comes from the search text whenever there is one, test the entry point with a search that has results, not only the empty-result path.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `frontend` · harmful: 0
- features: session-task-picker
- evidence: PICK-12 frontend/src/components/agenda/session-task-picker.tsx:183 (frontend)
- last seen: 2026-11-05T02:02:02Z

### L-041 - Test Esc for every layered overlay state (popover open, modal open) and assert the underlying panel stays open in each.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `frontend` · harmful: 0
- features: session-task-picker
- evidence: mutant 40 frontend/src/components/agenda/session-panel.tsx:119 (frontend)
- last seen: 2026-11-05T02:02:02Z

### L-042 - When a check excludes the item itself, test it with the item's old range overlapping the new one, or the exclusion is never exercised.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `frontend-components` · harmful: 0
- features: agenda-adjustments
- evidence: M27 session-move-confirm.tsx:65 / session-move-confirm.test.tsx:91 (ADJ-07) (frontend-components)
- last seen: 2026-11-05T04:56:16Z

### L-043 - Test that the page control writes a remembered preference, not only that the page reads a seeded value.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `frontend-pages` · harmful: 0
- features: agenda-adjustments
- evidence: M14 agenda.tsx:77 / agenda.test.tsx:275 (ADJ-25) (frontend-pages)
- last seen: 2026-11-05T04:56:16Z

### L-045 - Assert a state scoped to one gesture mode is absent during the other modes, not only present during its own.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `frontend/drag-and-drop` · harmful: 0
- features: agenda-adjustments
- evidence: M24 week-grid.tsx:102 (ADJ-14) (frontend/drag-and-drop)
- last seen: 2026-11-05T04:56:16Z

### L-046 - Test discard paths through keyboard activation too, since pointer handlers may already clear the state the page should clear.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `frontend-pages` · harmful: 0
- features: agenda-adjustments
- evidence: M9 agenda.tsx:196 (ADJ-06) (frontend-pages)
- last seen: 2026-11-05T04:56:16Z

### L-047 - For a WHEN-released criterion, assert the outcome is absent mid-gesture (after pointermove, before pointerup), not only present after release.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `frontend-gestures` · harmful: 0
- features: agenda-adjustments
- evidence: N6 frontend/src/pages/agenda.tsx:169 (ADJ-01) (frontend-gestures)
- last seen: 2026-11-05T05:07:21Z

### L-049 - Assert API payloads through the HTTP route and its response schema, not only the service, so fields the serializer strips are caught
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `routes` · harmful: 0
- features: agendamento
- evidence: backend-node/src/routes/scheduled.ts:26 (US-11 projected[].rule stripped by response schema) (routes)
- last seen: 2026-11-07T08:41:46Z

### L-050 - When a rule must run on every read, list each read path including MCP tools and test the rule through each one
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `mcp` · harmful: 0
- features: agendamento
- evidence: backend-node/src/mcp/tools.ts:83 (AD-009 get_board without applyDueSchedules) (mcp)
- last seen: 2026-11-07T08:41:46Z

### L-051 - Define the default scope of token and MCP writes wherever the app asks the user to choose a scope
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `mcp` · harmful: 0
- features: agendamento
- evidence: validation.md US-12 MCP delete_task on an open occurrence (mcp)
- last seen: 2026-11-07T08:41:46Z

### L-052 - Give REST and MCP create bodies the same fields, or reject an unsupported field with 422, instead of stripping it silently
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `routes` · harmful: 0
- features: agendamento
- evidence: backend-node/src/routes/tasks.ts:67 (REST POST /api/tasks strips recurrence, 201 series null) (routes)
- last seen: 2026-11-07T09:00:49Z

### L-053 - When a component test drives a callback through a harness that re-implements the page wiring, also test the page's own wiring of that callback.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `frontend-pages` · harmful: 0
- features: planejamento-diario
- evidence: M13 frontend/src/pages/plan.tsx:155 (frontend-pages)
- last seen: 2026-11-07T23:01:44Z

### L-054 - Test every exit route a navigation guard intercepts at its call site, not only the guard provider.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `frontend-shell` · harmful: 0
- features: planejamento-diario
- evidence: M14 frontend/src/components/app-layout.tsx:85 (frontend-shell) (+1 more)
- last seen: 2026-11-07T23:40:33Z

### L-055 - A leave-with-unsaved-changes guard must cover browser back and every in-app navigation entry point, or the spec must say which exits are excluded.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `frontend-routing` · harmful: 0
- features: planejamento-diario
- evidence: PLAN-36 validation.md deviation (c) (frontend-routing) (+1 more)
- last seen: 2026-11-07T23:21:34Z

### L-056 - When an AC lists alternative triggers (A or B), test each trigger, not just one.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `frontend-pages` · harmful: 0
- features: planejamento-diario
- evidence: PLAN-13 frontend/src/pages/plan.tsx:180 (frontend-pages)
- last seen: 2026-11-07T23:01:45Z

### L-057 - Specify the display format of compound and sub-hour durations when an AC quotes duration text.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `spec` · harmful: 0
- features: planejamento-diario
- evidence: PLAN-14/PLAN-19 validation.md precision gap 1 (spec)
- last seen: 2026-11-07T23:01:45Z

### L-058 - Specify the user-facing message for every validation rule an AC states.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `spec` · harmful: 0
- features: planejamento-diario
- evidence: PLAN-16 break-dialog.test.tsx:44 (spec)
- last seen: 2026-11-07T23:01:45Z

### L-059 - When a range limit equals a day boundary (24:00), state whether HH:MM fields must accept it.
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `frontend-forms` · harmful: 0
- features: planejamento-diario
- evidence: frontend/src/components/plan/block-editor.tsx:86 (frontend-forms)
- last seen: 2026-11-07T23:01:45Z

### L-060 - When a guard must keep blocking after the user chooses to stay, repeat the attempt and assert it is still blocked before testing the discard.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `frontend-routing` · harmful: 0
- features: planejamento-diario
- evidence: M15 frontend/src/lib/plan/draft-guard.tsx:48 (frontend-routing)
- last seen: 2026-11-07T23:21:34Z

### L-061 - Test an owner check with another user's record of the right kind, not only with a record of the wrong kind.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `backend/scoping` · harmful: 0
- features: planejamento-diario
- evidence: validation.md round 5 B1 backend-node/src/services/focus.ts:340 (backend/scoping)
- last seen: 2026-11-10T18:27:14Z

### L-062 - When a switch hides several kinds of items, put one of each kind in the fixture and assert each is gone.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `frontend-pages` · harmful: 0
- features: planejamento-diario
- evidence: validation.md round 5 F10 frontend/src/pages/agenda.tsx:201 (frontend-pages)
- last seen: 2026-11-10T18:27:14Z

### L-063 - When a pending, unsaved change is previewed in place, take the saved original from the pending state, not from the previewed lists, and test acting on the preview a second time
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `frontend-pages` · harmful: 0
- features: agendamento
- evidence: frontend/src/pages/agenda.tsx:243 (validation.md round 3, Fix R3-1) (frontend-pages)
- last seen: 2026-11-10T18:28:05Z

### L-064 - A cache keyed by a parameter needs a test that uses two different keys in one run
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `frontend-lib` · harmful: 0
- features: agendamento
- evidence: M13 frontend/src/lib/agenda/layout.ts:47 (frontend-lib)
- last seen: 2026-11-10T18:28:05Z

### L-065 - When a decision changes a behaviour, update every criterion that states the old behaviour, not only the one the decision names
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `specs` · harmful: 0
- features: agendamento
- evidence: spec.md:169, spec.md:231-234 (validation.md round 3, Fix R3-3) (specs)
- last seen: 2026-11-10T18:28:06Z

### L-066 - When a fix changes the input several rules read, test each of those rules on the fixed path, not only the one the bug report named.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `frontend-pages` · harmful: 0
- features: agendamento
- evidence: frontend/src/pages/agenda.tsx:251 (round-4 S4) (frontend-pages)
- last seen: 2026-11-10T18:48:13Z

### L-067 - When a feature reuses an existing write path, list that path's side effects (series end, column moves) in the spec and test each one the new flow triggers
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `services` · harmful: 0
- features: dashboard-hoje
- evidence: HOJE-61; backend-node/src/services/schedule.ts:92-99 (services)
- last seen: 2026-11-12T02:07:33Z

### L-068 - Before specifying a UI message from the API, check that the data path keeps that message; the offline focus queue keeps only status and code
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `frontend-focus` · harmful: 0
- features: dashboard-hoje
- evidence: HOJE-22; frontend/src/components/today/now-card.tsx:319 (frontend-focus)
- last seen: 2026-11-12T02:07:34Z

### L-069 - Prove transaction atomicity with a failure injected after the first write, not with a validation that rejects before any write
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `services` · harmful: 0
- features: dashboard-hoje
- evidence: HOJE-65; backend-node/test/services/today.test.ts:838 (services)
- last seen: 2026-11-12T02:07:34Z

### L-070 - When two ACs govern the same element in one state, the spec must say which wins and a test must assert it
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · harmful: 0
- features: dashboard-hoje
- evidence: HOJE-17/HOJE-20; frontend/src/components/today/now-card.tsx:233
- last seen: 2026-11-12T02:07:34Z

### L-071 - When a number must match the reports exactly, test it with sessions that do not start or end on a whole minute
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · harmful: 0
- features: dashboard-hoje
- evidence: HOJE-49; backend-node/test/services/today.test.ts:567
- last seen: 2026-11-12T02:07:34Z

### L-072 - When a UI rule depends on a flag of a task, send that flag for every place the task appears, including the task in focus
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `frontend` · harmful: 0
- features: dashboard-hoje
- evidence: frontend/src/components/today/close-day-dialog.tsx:105 (HOJE-75, G6 round 2) (frontend)
- last seen: 2026-11-12T03:50:11Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
