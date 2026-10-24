import { useState, useEffect, useMemo } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useTheme } from 'next-themes'
import { Menu, ChevronLeft, ChevronRight, Eye, EyeOff, Sun, Moon, Search } from 'lucide-react'
import { useWorkspace } from '@/contexts/workspace-context'
import { useSidebarState } from '@/contexts/sidebar-state-context'
import { admin as adminApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { APP_VERSION } from '@/lib/build-info'
import { setThemeBasedOnSystem } from '@/lib/theme-utils'
import { isDesktop, getDesktopApi } from '@/lib/platform'
import { navItems, visibleNavItems, type NavItem } from '@/lib/nav-items'
import { ShellLogo } from '@/components/shell-logo'
import { UpdateAvailableBanner } from '@/components/update-available-banner'
import { UpdateAvailableDialog } from '@/components/update-available-dialog'
import { WorkspaceSwitcher } from '@/components/workspace-switcher'
import { ChangePasswordDialog } from '@/components/change-password-dialog'
import { TwoFactorSetup } from '@/components/two-factor-setup'
import { PasskeyManagementDialog } from '@/components/passkey-management-dialog'
import { CommandPalette } from '@/components/command-palette'
import { useCommandPaletteHotkey } from '@/hooks/use-command-palette-hotkey'
import { usePrivacyMode } from '@/hooks/use-privacy-mode'
import { useFeatureFlags } from '@/hooks/use-feature-flags'
import { useLocalAuthEnabled } from '@/hooks/use-local-auth'

/** Placeholder rows shown while the workspace list is in flight. */
function NavSkeleton() {
  return (
    <div className="flex flex-col gap-0.5" aria-hidden>
      {[2, 1].map((count, section) => (
        <div key={section} className={cn('flex flex-col gap-0.5', section > 0 && 'pt-3')}>
          <div className="px-3 pt-1 pb-1">
            <div className="h-2 w-16 rounded bg-sidebar-accent/60 animate-pulse" />
          </div>
          {Array.from({ length: count }).map((_, row) => (
            <div key={row} className="flex items-center gap-3 px-3 py-2">
              <div className="h-4 w-4 rounded bg-sidebar-accent/60 animate-pulse" />
              <div className="h-3 flex-1 max-w-[7rem] rounded bg-sidebar-accent/40 animate-pulse" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

const headerButton =
  'text-sidebar-muted hover:text-sidebar-foreground transition-colors p-1 rounded-md hover:bg-sidebar-accent'
const DRAG_REGION = '[-webkit-app-region:drag]'
const NO_DRAG_REGION = '[-webkit-app-region:no-drag]'
const collapsedHeaderButton =
  'lg:flex lg:h-9 lg:w-9 lg:items-center lg:justify-center lg:p-0 lg:[&>svg]:h-[18px] lg:[&>svg]:w-[18px]'

export function AppLayout() {
  const { t } = useTranslation()
  const { theme, setTheme, resolvedTheme } = useTheme()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { collapsed, toggleCollapsed } = useSidebarState()
  const { privacyMode, togglePrivacyMode } = usePrivacyMode()
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const [twoFactorOpen, setTwoFactorOpen] = useState(false)
  const [passkeysOpen, setPasskeysOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false)
  useCommandPaletteHotkey(setPaletteOpen)
  const { isLoading: workspaceLoading } = useWorkspace()
  const { isEnabled, updateCheckRepo } = useFeatureFlags()
  const localAuthEnabled = useLocalAuthEnabled()

  // React Router keeps the scroll offset across routes; start each page at
  // the top unless the URL targets an anchor.
  useEffect(() => {
    if (!location.hash) window.scrollTo(0, 0)
  }, [location.pathname, location.hash])

  // Admin-chosen brand colours override the primary token for everyone.
  useEffect(() => {
    adminApi.defaultColors().then(({ light, dark }) => {
      setThemeBasedOnSystem(light, dark, resolvedTheme)
    }).catch(() => {})
  }, [resolvedTheme])

  const finalNavItems: NavItem[] = useMemo(
    () => visibleNavItems(navItems, isEnabled),
    [isEnabled],
  )
  // macOS desktop hides the native title bar, so the header becomes the drag area.
  const dragHeader = isDesktop() && getDesktopApi().platform === 'darwin'
  const drag = dragHeader ? DRAG_REGION : undefined
  const noDrag = dragHeader ? NO_DRAG_REGION : undefined
  const isMac =
    typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPad|iPod/.test(navigator.platform)

  const resolvedThemeLocal = theme === 'system' ? undefined : theme
  const isDark = resolvedThemeLocal
    ? resolvedThemeLocal === 'dark'
    : typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches
  const toggleTheme = () => setTheme(isDark ? 'light' : 'dark')
  const themeLabel = isDark ? t('settings.themeLight') : t('settings.themeDark')
  const privacyLabel = privacyMode ? t('privacy.show') : t('privacy.hide')
  const openUpdateDialog = updateCheckRepo ? () => setUpdateDialogOpen(true) : undefined

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile header */}
      <header className={cn('sticky top-0 z-40 flex h-14 items-center gap-3 bg-sidebar border-b border-sidebar-border px-4 lg:hidden', drag, dragHeader && 'pl-20')}>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className={cn('text-sidebar-muted hover:text-sidebar-foreground transition-colors', noDrag)}
          aria-label={t('app.toggleMenu')}
        >
          <Menu size={20} />
        </button>
        <Link
          to="/"
          className={cn('flex items-center gap-2 -mx-1 px-1 py-1 rounded-md hover:bg-sidebar-accent transition-colors', noDrag)}
          aria-label={t('app.name')}
        >
          <ShellLogo size={22} className="text-primary shrink-0" />
          <span className="font-bold text-sidebar-foreground">{t('app.name')}</span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setPaletteOpen(true)} className={cn(headerButton, noDrag)} title={t('cmdk.triggerAria')} aria-label={t('cmdk.triggerAria')}>
            <Search size={18} />
          </button>
          <button onClick={togglePrivacyMode} className={cn(headerButton, noDrag)} title={privacyLabel} aria-label={privacyLabel}>
            {privacyMode ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
          <button onClick={toggleTheme} className={cn(headerButton, noDrag)} title={themeLabel} aria-label={themeLabel}>
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar overlay for mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <aside
          data-collapsed={collapsed}
          className={cn(
            'group/sidebar fixed inset-y-0 left-0 z-50 w-60 bg-sidebar border-r border-sidebar-border flex flex-col transform transition-[transform,width] duration-300 ease-in-out motion-reduce:transition-none lg:translate-x-0 shrink-0',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full',
            collapsed ? 'lg:w-16' : 'lg:w-60',
          )}
        >
          {dragHeader && <div aria-hidden className={cn('h-7 shrink-0', drag)} />}

          {/* Collapsed on desktop, the header becomes a column: logo on
              top, then the same buttons stacked, so nothing the expanded
              header offers goes missing in the rail. */}
          <div className={cn(
            'flex h-16 min-h-16 items-center justify-between px-5 border-b border-sidebar-border shrink-0',
            collapsed && 'lg:h-auto lg:min-h-0 lg:flex-col lg:justify-center lg:gap-2 lg:px-0 lg:py-3',
            drag,
          )}>
            <Link
              to="/"
              className={cn('flex items-center gap-2.5 -mx-1 px-1 py-1 rounded-md hover:bg-sidebar-accent transition-colors', noDrag)}
              onClick={() => setSidebarOpen(false)}
              aria-label={t('app.name')}
            >
              <ShellLogo size={24} className="text-primary shrink-0" />
              <span className={cn('font-bold text-lg text-sidebar-foreground tracking-tight', collapsed && 'lg:hidden')}>
                {t('app.name')}
              </span>
            </Link>
            <div className={cn('flex items-center gap-0.5', collapsed && 'lg:flex-col lg:gap-1')}>
              <button
                onClick={togglePrivacyMode}
                className={cn(headerButton, collapsed && collapsedHeaderButton, noDrag)}
                title={privacyLabel}
                aria-label={privacyLabel}
              >
                {privacyMode ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              <button
                onClick={toggleTheme}
                className={cn(headerButton, collapsed && collapsedHeaderButton, noDrag)}
                title={themeLabel}
                aria-label={themeLabel}
              >
                {isDark ? <Sun size={16} /> : <Moon size={16} />}
              </button>
            </div>
          </div>

          {/* The collapse handle sits on the sidebar's edge, halfway out,
              vertically centred in the viewport. Shown on hover and on
              keyboard focus so it never crowds the header. */}
          <button
            type="button"
            onClick={toggleCollapsed}
            className="hidden lg:flex absolute top-1/2 -right-3 -translate-y-1/2 h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/sidebar:opacity-100"
            title={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
            aria-label={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
            aria-expanded={!collapsed}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>

          {/* Command palette trigger */}
          <div className={cn('px-3 pt-3', collapsed && 'lg:px-2')}>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className={cn(
                'group flex w-full items-center gap-2 rounded-lg border border-sidebar-border/80 bg-sidebar-accent/40 px-3 py-2',
                'text-[12.5px] text-sidebar-muted transition-all',
                'hover:bg-sidebar-accent hover:text-sidebar-foreground hover:border-sidebar-border',
                collapsed && 'lg:justify-center lg:px-0',
              )}
              aria-label={t('cmdk.triggerAria')}
            >
              <Search size={13} className="shrink-0" />
              <span className={cn('flex-1 text-left', collapsed && 'lg:hidden')}>{t('cmdk.triggerLabel')}</span>
              <kbd className={cn('hidden lg:inline-flex h-[17px] items-center rounded border border-sidebar-border bg-sidebar px-1 font-mono text-[9.5px] font-semibold text-sidebar-muted/80', collapsed && 'lg:hidden')}>
                {isMac ? '⌘' : 'Ctrl'}&nbsp;K
              </kbd>
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            <nav className={cn('flex flex-col gap-0.5 px-3 pt-1 pb-3', collapsed && 'lg:items-center lg:gap-1 lg:px-0 lg:pt-3')}>
              {workspaceLoading && <NavSkeleton />}
              {!workspaceLoading && finalNavItems.map((item, idx) => {
                if (item.type === 'separator') {
                  return (
                    <div key={`sep-${idx}`} className={cn(
                      idx === 0 ? 'pt-1 pb-1 px-3' : 'pt-3 pb-1 px-3',
                      collapsed && 'lg:hidden',
                    )}>
                      <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-sidebar-muted/50">
                        {t(item.labelKey)}
                      </span>
                    </div>
                  )
                }

                const isActive =
                  item.path === '/'
                    ? location.pathname === '/'
                    : location.pathname.startsWith(item.path)
                const Icon = item.icon
                return (
                  <Link
                    key={item.key}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    title={t(`nav.${item.key}`)}
                    aria-label={t(`nav.${item.key}`)}
                    className={cn(
                      'flex items-center gap-3 text-[13px] font-medium transition-all rounded-lg px-3 py-2',
                      isActive
                        ? 'bg-primary/[0.08] text-primary border-l-[3px] border-primary pl-[9px]'
                        : 'text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground',
                      collapsed && 'lg:h-10 lg:w-10 lg:justify-center lg:border-l-0 lg:px-0 lg:pl-0',
                    )}
                  >
                    <Icon
                      size={17}
                      className={cn(
                        'shrink-0',
                        isActive ? 'text-primary' : 'text-sidebar-muted',
                        collapsed && 'lg:h-5 lg:w-5',
                      )}
                    />
                    <span className={cn(collapsed && 'lg:hidden')}>{t(`nav.${item.key}`)}</span>
                  </Link>
                )
              })}
            </nav>
          </div>

          {(openUpdateDialog || isDesktop()) && (
            <div className={cn(collapsed && 'lg:hidden')}>
              <UpdateAvailableBanner onOpen={openUpdateDialog ?? (() => {})} />
            </div>
          )}

          {/* One trigger at the bottom of the sidebar: the active workspace
              as the primary identity, the user email + role as the
              secondary line, with workspace switching and every account
              action in a single menu. */}
          <div className={cn('px-3 pt-1', collapsed && 'lg:px-2')}>
            <WorkspaceSwitcher
              onChangePassword={() => setChangePasswordOpen(true)}
              onTwoFactor={() => setTwoFactorOpen(true)}
              onPasskeys={() => setPasskeysOpen(true)}
              onUpdateAvailable={openUpdateDialog}
              localAuthEnabled={localAuthEnabled}
              collapsed={collapsed}
            />
          </div>

          <div className={cn('px-3 pb-3 pt-1', collapsed && 'lg:hidden')}>
            <div className="text-[11px] leading-4 text-sidebar-muted/70 text-center" role="note">
              <span className="sr-only">{t('app.versionAriaLabel', { version: APP_VERSION })}</span>
              <span aria-hidden="true" className="block break-all line-clamp-2">
                {t('app.versionLabel', { version: APP_VERSION })}
              </span>
            </div>
          </div>
        </aside>

        <main className={cn(
          'flex-1 min-h-screen min-w-0 overflow-x-clip transition-[margin] duration-300 ease-in-out motion-reduce:transition-none',
          collapsed ? 'lg:ml-16' : 'lg:ml-60',
        )}>
          <div className="p-4 sm:p-6 max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>

      {localAuthEnabled && (
        <ChangePasswordDialog
          open={changePasswordOpen}
          onClose={() => setChangePasswordOpen(false)}
        />
      )}
      <TwoFactorSetup
        open={twoFactorOpen}
        onClose={() => setTwoFactorOpen(false)}
        localAuthEnabled={localAuthEnabled}
      />
      <PasskeyManagementDialog
        open={passkeysOpen}
        onClose={() => setPasskeysOpen(false)}
        localAuthEnabled={localAuthEnabled}
      />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <UpdateAvailableDialog
        open={updateDialogOpen}
        onClose={() => setUpdateDialogOpen(false)}
      />
    </div>
  )
}
