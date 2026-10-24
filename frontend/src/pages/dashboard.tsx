import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Component, FolderOpen, Settings, Shield, Users } from 'lucide-react'
import { workspaces as workspacesApi } from '@/lib/api'
import { useAuth } from '@/contexts/auth-context'
import { useWorkspace } from '@/contexts/workspace-context'
import { PageHeader } from '@/components/page-header'
import { StatTile } from '@/components/charts'
import { IconBadge } from '@/components/icon-badge'

/**
 * Landing page after sign-in. A starting point: replace the cards below
 * with your product's own overview.
 */
export default function DashboardPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { current } = useWorkspace()

  const { data: stats } = useQuery({
    queryKey: ['workspace-stats', current?.id],
    queryFn: () => workspacesApi.stats(current!.id),
    enabled: !!current,
  })

  const name = user?.preferences?.display_name || user?.email?.split('@')[0] || ''
  const links = [
    { to: '/files', icon: FolderOpen, title: t('nav.files'), description: t('dashboard.filesHint') },
    { to: '/components', icon: Component, title: t('nav.components'), description: t('dashboard.componentsHint') },
    { to: '/workspace/settings', icon: Settings, title: t('workspace.settingsMenu'), description: t('dashboard.workspaceHint') },
    ...(user?.is_superuser
      ? [{ to: '/admin', icon: Shield, title: t('nav.groupAdmin'), description: t('dashboard.adminHint') }]
      : []),
  ]

  return (
    <div>
      <PageHeader section={current?.name ?? ''} title={t('dashboard.greeting', { name })} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label={t('workspace.members')} value={stats?.members ?? '—'} icon={<Users size={15} />} />
        <StatTile label={t('workspace.statFiles')} value={stats?.files ?? '—'} icon={<FolderOpen size={15} />} />
      </div>

      <h2 className="mt-8 mb-3 text-sm font-semibold">{t('dashboard.getStarted')}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {links.map(({ to, icon: Icon, title, description }) => (
          <Link
            key={to}
            to={to}
            className="group flex items-center gap-4 rounded-xl border border-border/60 bg-card p-4 transition-colors hover:border-primary/40 hover:bg-primary/[0.03]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{title}</span>
              <span className="block truncate text-xs text-muted-foreground">{description}</span>
            </span>
            <ArrowRight size={16} className="text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>

      {current && (
        <div className="mt-8 flex items-center gap-3 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          <IconBadge icon={current.icon ?? 'briefcase'} color={current.color ?? '#6366F1'} size="sm" />
          <span>{t('dashboard.buildHint')}</span>
        </div>
      )}
    </div>
  )
}
