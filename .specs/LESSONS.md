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

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
