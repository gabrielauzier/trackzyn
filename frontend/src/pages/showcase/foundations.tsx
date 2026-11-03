import { useTranslation } from 'react-i18next'
import { ICON_REGISTRY } from '@/lib/icon-registry'
import { ShellLogo } from '@/components/shell-logo'
import { Caption, ShowcaseSection, Specimen, SpecimenGrid } from './layout'

const THEME_TOKENS = [
  'background', 'foreground', 'card', 'primary', 'secondary', 'muted',
  'accent', 'destructive', 'border', 'ring', 'sidebar', 'sidebar-accent',
]
const CHART_TOKENS = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5', 'chart-6', 'chart-7', 'chart-8']
const STATUS_TOKENS = ['status-good', 'status-warning', 'status-serious', 'status-critical']

function Swatch({ token }: { token: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        className="h-9 w-9 shrink-0 rounded-lg border border-border/60"
        style={{ backgroundColor: `var(--${token})` }}
      />
      <code className="truncate font-mono text-[11px] text-muted-foreground">--{token}</code>
    </div>
  )
}

export function FoundationsSection() {
  const { t } = useTranslation()
  return (
    <ShowcaseSection id="foundations" title={t('showcase.foundations.title')} description={t('showcase.foundations.description')}>
      <SpecimenGrid>
        <Specimen name="Theme tokens" importFrom="src/index.css" wide>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {THEME_TOKENS.map((token) => <Swatch key={token} token={token} />)}
          </div>
        </Specimen>
        <Specimen name="Chart series (fixed order)" importFrom="var(--chart-1…8)">
          <div className="grid grid-cols-2 gap-3">
            {CHART_TOKENS.map((token) => <Swatch key={token} token={token} />)}
          </div>
        </Specimen>
        <Specimen name="Status (reserved, never a series)" importFrom="var(--status-*)">
          <div className="grid grid-cols-2 gap-3">
            {STATUS_TOKENS.map((token) => <Swatch key={token} token={token} />)}
          </div>
        </Specimen>
        <Specimen name="Typography">
          <div className="space-y-2">
            <p className="text-2xl font-semibold tracking-tight">Heading 2xl / semibold</p>
            <p className="text-lg font-semibold">Heading lg / semibold</p>
            <p className="text-sm">Body sm — the default reading size for dense UIs.</p>
            <p className="text-xs text-muted-foreground">Caption xs / muted-foreground</p>
            <p className="font-mono text-xs">font-mono · 0123456789</p>
            <p className="text-sm tabular-nums">tabular-nums · 1,234.56 / 9,876.10</p>
          </div>
        </Specimen>
        <Specimen name="Radius & elevation">
          <Caption>rounded-sm · md · lg · xl · 2xl</Caption>
          <div className="flex flex-wrap items-end gap-3">
            {['rounded-sm', 'rounded-md', 'rounded-lg', 'rounded-xl', 'rounded-2xl'].map((r) => (
              <div key={r} className={`h-12 w-12 border border-border bg-muted ${r}`} />
            ))}
          </div>
          <Caption>shadow-sm · md · lg</Caption>
          <div className="flex gap-3">
            {['shadow-sm', 'shadow-md', 'shadow-lg'].map((s) => (
              <div key={s} className={`h-12 w-16 rounded-lg bg-card ${s}`} />
            ))}
          </div>
        </Specimen>
        <Specimen name="Logo" importFrom="@/components/shell-logo">
          <div className="flex items-end gap-4 text-primary">
            <ShellLogo size={16} />
            <ShellLogo size={24} />
            <ShellLogo size={40} />
            <ShellLogo size={64} />
            <span className="text-foreground"><ShellLogo size={40} /></span>
          </div>
        </Specimen>
        <Specimen name="Icon registry" importFrom="@/lib/icon-registry" wide>
          <div className="grid grid-cols-6 gap-2 sm:grid-cols-10 lg:grid-cols-13">
            {ICON_REGISTRY.map(({ name, icon: Icon, label }) => (
              <span
                key={name}
                title={`${name} — ${label}`}
                className="flex h-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Icon size={17} />
              </span>
            ))}
          </div>
        </Specimen>
      </SpecimenGrid>
    </ShowcaseSection>
  )
}
