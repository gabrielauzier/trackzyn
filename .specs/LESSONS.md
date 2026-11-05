# LESSONS - auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Specify/Design)

Corroborated across multiple features. Safe to apply as guidance.

_none_

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

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
