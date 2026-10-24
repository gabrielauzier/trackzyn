# Backend scripts

| Script | What it does |
|---|---|
| `lock.sh` | Regenerates `uv.lock` after a dependency change in `pyproject.toml`. Commit the result — CI fails if it drifts. |
| `check_migration_chain.py` | Fails when the Alembic revision chain is not a single straight line (two branches that picked the same next revision number). Runs in CI before any dependency is installed. |
| `export_openapi.py` | Writes the frozen HTTP contract to `contracts/openapi.json` (`--check` exits 1 when the committed file drifted, `--output` picks another path). CI runs `--check` in the `contract-drift` job. |
