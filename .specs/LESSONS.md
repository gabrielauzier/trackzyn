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

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
