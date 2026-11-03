# trackzyn frontend

React 19 + TypeScript + Vite, styled with Tailwind CSS 4 and shadcn/Radix components. Data fetching runs through TanStack Query, and translations through i18next (en, pt-BR).

```bash
npm install
npm run dev        # http://localhost:5173, proxies /api to BACKEND_URL (default http://localhost:8000)
npm run lint
npm run typecheck
npm test
npm run build
```

## Layout

| Path | What lives there |
|---|---|
| `src/App.tsx` | Routes. Public routes (setup, login, register, OIDC callback) sit outside `ProtectedRoute`; everything else renders inside `AppLayout`. |
| `src/components/ui/` | shadcn/Radix primitives (button, dialog, select, table, …). |
| `src/components/charts/` | Chart library on Recharts and d3-sankey, with a colour-blind-safe palette. |
| `src/components/` | App-level components: layout, workspace switcher, command palette, auth dialogs, file dropzone, icon picker. |
| `src/pages/` | One file per route. `pages/showcase/` is the `/components` catalogue. |
| `src/contexts/` | Auth, workspace and sidebar state. |
| `src/lib/api.ts` | Axios client. It adds the bearer token and the `X-Workspace-Id` header to every request. |
| `src/lib/nav-items.ts` | Sidebar entries (optionally gated by a server feature flag). |
| `src/locales/` | `en.json` and `pt-BR.json`. A test keeps their keys and placeholders in sync. |
| `src/index.css` | Theme tokens (light and dark), including `--chart-1…8` and `--status-*`. |

## Adding a page

1. Create `src/pages/my-page.tsx` with a default export.
2. Register it in `src/App.tsx` with `lazy(() => import('@/pages/my-page'))`, inside the `AppLayout` route.
3. Add a sidebar entry in `src/lib/nav-items.ts` (`key` becomes the `nav.<key>` translation).
4. Add the strings to `src/locales/en.json` **and** `pt-BR.json`.
5. Add the API calls to `src/lib/api.ts` and the types to `src/types/index.ts`.

Open `/components` to see every available component and chart, rendered with sample data and the live theme.

## Charts

```tsx
import { AreaChart, BarChart, DonutChart, SankeyChart, StatTile } from '@/components/charts'

<BarChart
  data={rows}
  xKey="month"
  series={[{ key: 'signups', label: 'Signups' }, { key: 'churn', label: 'Churn' }]}
  stacked
/>
```

Series take `--chart-1..8` in a fixed order (pass `color` to pin an entity to its slot). Status colours are reserved for state, and charts never use a second y-axis. These rules keep every chart readable for colour-blind users and consistent between light and dark themes.
