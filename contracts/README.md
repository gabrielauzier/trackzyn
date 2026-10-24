# Contract suite

Black-box HTTP tests that pin the launchkit API contract. They run against either backend
(`backend/` in Python, `backend-node/` in Node) and know nothing about its internals.

`openapi.json` is the contract exported from the Python backend
(`python backend/scripts/export_openapi.py`); CI fails when it drifts.

## Running

```
cd contracts
npm ci
CONTRACT_STACK=python npx vitest run     # or node
```

The suite needs a PostgreSQL and a Redis it may wipe. Put them in `contracts/.env.local`:

```
CONTRACT_DATABASE_URL=postgresql://user:password@127.0.0.1:5432/launchkit_contract
CONTRACT_REDIS_URL=redis://127.0.0.1:6379/0
# optional: CONTRACT_PYTHON_BIN (default ../.venv/bin/python), CONTRACT_NODE_CMD (default `npx tsx src/server.ts`)
```

Without `API_URL`, the global setup resets the schema with Alembic and starts both stacks
on free ports over the same database: the one named by `CONTRACT_STACK` is the subject, the
other is the peer the cross-stack cases (shared password hashes, tokens, 2FA and passkey state) use.
With `API_URL` (and `PEER_API_URL`) it tests servers you started yourself; those must trust one
proxy hop (`TRUSTED_PROXY_HOPS=1`) because every case sends its own `X-Forwarded-For`.

Cases that depend on configuration (OIDC-only mode, proxy hops, token lifetime, Redis down)
start an extra instance of the subject stack with the settings they need.

Every case title starts with its check id (`C6 ...`), so one check runs with `-t "C6 "`.
No case may be skipped or conditioned on the stack (`tests/meta.test.ts` enforces it).

## Local cache gotcha

After a failing run, Vitest runs the previously failed file first. `99-logs.test.ts` needs the whole suite to have run before it (it scans the log for the secrets the other cases used), so it then fails with "expected 1 to be greater than 10" on every later run. Clear the cache and rerun:

```bash
rm -rf contracts/node_modules/.vite
```

CI has no such cache.
