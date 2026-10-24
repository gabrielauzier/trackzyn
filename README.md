<p align="center">
  <img src="frontend/public/favicon.svg" width="96" alt="launchkit logo" />
</p>
<h1 align="center">launchkit</h1>

<p align="center">
A self-hosted full-stack starter: Fastify + PostgreSQL + BullMQ on the back, React + Tailwind + shadcn on the front, with authentication, workspaces, an admin panel and a component library already done.
</p>

## What's in the box

- **Auth:** email and password, first-run admin setup, TOTP two-factor, passkeys (WebAuthn), OIDC/SSO (Authentik, Pocket ID, …) with optional role sync, rate-limited login, and public registration that admins can switch off.
- **Workspaces:** every user gets a personal workspace. Additional workspaces have members with owner, editor and viewer roles, plus an optional external manager. Every request is scoped by the `X-Workspace-Id` header.
- **Admin panel:** user CRUD, registration toggle, brand colours, number and date formats, and the application timezone.
- **Files:** workspace-scoped uploads on a pluggable storage provider (local disk out of the box), with size and type limits.
- **Background jobs:** a BullMQ worker and scheduler on Redis, with an example job and schedule.
- **UI kit:** shadcn/Radix primitives, a light and a dark theme, a collapsible sidebar, a ⌘K command palette, privacy mode, i18n (en, pt-BR), and a chart library (area, line, bar, composed, donut, sankey, sparkline, stat tile) on a colour-blind-validated palette.
- **Component catalogue:** `/components` renders every component and chart with sample data.
- **Ops:** Docker Compose for development and production, a Helm chart, a curl-pipe installer, a Cloudflare Tunnel self-hosting guide (`deploy/public`), and CI (eslint, tsc, vitest, helm lint).

## Quick start

```bash
cp .env.example .env            # set SECRET_KEY
docker compose up --build
```

Open <http://localhost:3000>. The first visit runs the setup screen, which creates the admin account.

Without Docker:

```bash
# backend-node (Node 22+, PostgreSQL and Redis running locally)
cd backend-node && npm ci
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/launchkit npm run migrate
npm run dev

# frontend
cd frontend && npm install && npm run dev
```


## Project structure

```
backend-node/
  src/
    routes/       Fastify routes (auth, setup, admin, workspaces, files, ...)
    plugins/      auth, rate limit, workspace context, error handling
    services/     business logic called by the routes
    ports/        pluggable adapters (key-value store, job queue, file storage)
    db/           Drizzle schema and migration runner
  drizzle/        migrations (0000 is the whole platform schema)
  test/           vitest suite (PGlite; Redis when REDIS_URL is set)
```
```
frontend/         React app (see frontend/README.md)
charts/launchkit/ Helm chart
deploy/public/    self-hosting guide, release script, backups (Portuguese)
scripts/          dev helpers
```

## Adding a feature

1. **Schema:** add the table in `backend-node/src/db/schema.ts` with a `workspace_id` foreign key, then `cd backend-node && npx drizzle-kit generate` and review the migration in `drizzle/`.
2. **API:** add a service in `services/` and a route in `routes/`. Guard writes with `requireWrite` and reads with the workspace context. Register the route in `src/app.ts`.
3. **Tests:** see `backend-node/test` for the viewer, editor and owner pattern.
4. **UI:** add a page, a route, a nav item and translations (see `frontend/README.md`).

## Configuration

Everything is read from environment variables (`backend/app/core/config.py`); `.env.example` lists the common ones. `GET /api/info` exposes feature flags (`app/core/feature_flags.py`) that the frontend can use to hide optional modules.

## License

AGPL-3.0. launchkit is derived from [Securo](https://github.com/securo-finance/securo), which is AGPL-3.0 licensed, so projects built from this template inherit the same license obligations. See `LICENSE`.
