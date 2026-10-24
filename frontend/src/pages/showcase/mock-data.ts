/**
 * Sample data for the component showcase. Deterministic (no Math.random) so
 * screenshots and visual diffs stay stable between renders.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Smooth pseudo-noise in [-1, 1] from an integer seed. */
function wave(i: number, seed: number) {
  return Math.sin(i * 0.9 + seed) * 0.6 + Math.sin(i * 0.37 + seed * 2) * 0.4
}

export const monthlyRevenue = MONTHS.map((month, i) => ({
  month,
  revenue: Math.round(42000 + i * 3100 + wave(i, 1) * 4200),
  costs: Math.round(30000 + i * 1200 + wave(i, 4) * 2600),
}))

export const revenueVsTarget = MONTHS.slice(0, 8).map((month, i) => ({
  month,
  actual: Math.round(38 + i * 4.2 + wave(i, 2) * 6),
  target: 40 + i * 4,
}))

export const usersByRegion = Array.from({ length: 30 }, (_, i) => {
  const day = new Date(2026, 8, i + 1)
  return {
    date: day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    americas: Math.round(1200 + i * 22 + wave(i, 3) * 140),
    europe: Math.round(900 + i * 15 + wave(i, 5) * 110),
    asia: Math.round(520 + i * 19 + wave(i, 7) * 90),
  }
})

export const latency = Array.from({ length: 24 }, (_, hour) => ({
  hour: `${String(hour).padStart(2, '0')}:00`,
  p50: Math.round(118 + wave(hour, 1) * 18 + (hour > 8 && hour < 19 ? 24 : 0)),
  p95: Math.round(260 + wave(hour, 6) * 45 + (hour > 8 && hour < 19 ? 70 : 0)),
}))

export const signupsByChannel = ['Q1', 'Q2', 'Q3', 'Q4'].map((quarter, i) => ({
  quarter,
  organic: 1800 + i * 320 + Math.round(wave(i, 1) * 120),
  paid: 1100 + i * 210 + Math.round(wave(i, 2) * 90),
  referral: 600 + i * 140 + Math.round(wave(i, 3) * 70),
}))

export const topPages = [
  { page: '/pricing', views: 18420 },
  { page: '/docs/getting-started', views: 15310 },
  { page: '/blog/launch', views: 11980 },
  { page: '/features', views: 9440 },
  { page: '/changelog', views: 6120 },
  { page: '/about', views: 3870 },
]

export const planMix = [
  { key: 'free', label: 'Free', value: 4820 },
  { key: 'starter', label: 'Starter', value: 2140 },
  { key: 'pro', label: 'Pro', value: 1310 },
  { key: 'enterprise', label: 'Enterprise', value: 290 },
]

export const funnelNodes = [
  { id: 'organic', label: 'Organic search' },
  { id: 'paid', label: 'Paid ads' },
  { id: 'referral', label: 'Referrals' },
  { id: 'visit', label: 'Visited site' },
  { id: 'signup', label: 'Signed up' },
  { id: 'bounce', label: 'Bounced' },
  { id: 'trial', label: 'Started trial' },
  { id: 'inactive', label: 'Never activated' },
]

export const funnelLinks = [
  { source: 'organic', target: 'visit', value: 5200 },
  { source: 'paid', target: 'visit', value: 3100 },
  { source: 'referral', target: 'visit', value: 1700 },
  { source: 'visit', target: 'signup', value: 3400 },
  { source: 'visit', target: 'bounce', value: 6600 },
  { source: 'signup', target: 'trial', value: 2100 },
  { source: 'signup', target: 'inactive', value: 1300 },
]

export const kpis = [
  { label: 'Monthly revenue', value: 78420, delta: 0.124, trend: monthlyRevenue.map((m) => m.revenue) },
  { label: 'Active users', value: 8560, delta: 0.042, trend: usersByRegion.map((d) => d.americas + d.europe + d.asia) },
  { label: 'Churn rate', value: 0.031, delta: -0.08, higherIsBetter: false, trend: [3.8, 3.6, 3.7, 3.4, 3.3, 3.2, 3.1] },
  { label: 'p95 latency', value: 312, delta: 0.06, higherIsBetter: false, trend: latency.map((l) => l.p95) },
]

export const sampleRows = [
  { id: 'INV-1042', customer: 'Acme Corp', status: 'paid', amount: 1280, date: '2026-09-28' },
  { id: 'INV-1041', customer: 'Globex', status: 'pending', amount: 640, date: '2026-09-26' },
  { id: 'INV-1040', customer: 'Initech', status: 'overdue', amount: 2310, date: '2026-09-14' },
  { id: 'INV-1039', customer: 'Umbrella', status: 'paid', amount: 990, date: '2026-09-10' },
  { id: 'INV-1038', customer: 'Hooli', status: 'draft', amount: 4200, date: '2026-09-02' },
] as const
