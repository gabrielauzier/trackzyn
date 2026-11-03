import { useEffect, useMemo, useRef, useState, useCallback, useSyncExternalStore } from 'react'
import { Command } from 'cmdk'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Search,
  CornerDownLeft,
  History,
  ArrowUpRight,
  Zap,
  Compass,
  Flame,
  Upload,
  Settings,
  Shield,
} from 'lucide-react'

import { useAuth } from '@/contexts/auth-context'
import { useFeatureFlags } from '@/hooks/use-feature-flags'
import { navItems } from '@/lib/nav-items'
import { ShellLogo } from '@/components/shell-logo'
import { cn, normalizeText } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Static actions & navigation registry
// ---------------------------------------------------------------------------

type StaticItem = {
  id: string
  labelKey: string
  icon: React.ElementType
  path?: string
  onSelect?: (nav: (to: string) => void) => void
  keywords?: string[]
}

/** Sidebar links (minus feature-flagged ones that are off) plus the
 *  settings surfaces that live in the account menu. */
function buildNavItems(isEnabled: (flag: string) => boolean, isAdmin: boolean): StaticItem[] {
  const fromSidebar: StaticItem[] = navItems.flatMap((item) =>
    item.type === 'link' && (item.feature === undefined || isEnabled(item.feature))
      ? [{ id: `nav-${item.key}`, labelKey: `nav.${item.key}`, icon: item.icon, path: item.path }]
      : [],
  )
  const settings: StaticItem[] = [
    { id: 'nav-workspace-settings', labelKey: 'workspace.settingsMenu', icon: Settings, path: '/workspace/settings', keywords: ['members', 'membros', 'workspace'] },
  ]
  if (isAdmin) {
    settings.push({ id: 'nav-admin', labelKey: 'nav.groupAdmin', icon: Shield, path: '/admin', keywords: ['users', 'usuarios', 'usuários', 'admin'] })
  }
  return [...fromSidebar, ...settings]
}

const QUICK_ACTIONS: StaticItem[] = [
  {
    id: 'action-upload-file',
    labelKey: 'cmdk.actions.uploadFile',
    icon: Upload,
    onSelect: (nav) => nav('/files'),
    keywords: ['upload', 'file', 'arquivo', 'enviar'],
  },
]

// ---------------------------------------------------------------------------
// Recent items (localStorage)
// ---------------------------------------------------------------------------

type RecentItem = {
  id: string
  label: string
  path: string
  icon: string // lucide name, stored as string; resolved via fallback icon
  sublabel?: string | null
}

const RECENT_KEY = 'app.cmdk.recent'
const RECENT_MAX = 5

function loadRecents(): RecentItem[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.slice(0, RECENT_MAX)
  } catch {
    return []
  }
}

// Tiny external store so we can read `localStorage` recents through
// useSyncExternalStore and avoid setState-in-effect lint warnings.
type Listener = () => void
const recentListeners = new Set<Listener>()
let recentSnapshot: RecentItem[] = loadRecents()

function subscribeRecents(listener: Listener) {
  recentListeners.add(listener)
  return () => {
    recentListeners.delete(listener)
  }
}

function getRecentSnapshot(): RecentItem[] {
  return recentSnapshot
}

function saveRecent(item: RecentItem) {
  const existing = recentSnapshot.filter((r) => r.id !== item.id)
  const next = [item, ...existing].slice(0, RECENT_MAX)
  recentSnapshot = next
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
  recentListeners.forEach((l) => l())
}

function matchesQuery(query: string, haystacks: Array<string | undefined>): boolean {
  const q = normalizeText(query.trim())
  if (!q) return true
  return haystacks.some((h) => (h ? normalizeText(h).includes(q) : false))
}

// ---------------------------------------------------------------------------
// The palette
// ---------------------------------------------------------------------------

export interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { isEnabled } = useFeatureFlags()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const recents = useSyncExternalStore(subscribeRecents, getRecentSnapshot, getRecentSnapshot)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus the input whenever the palette opens. The cmdk Command is re-keyed
  // on `open` so results and selection reset automatically. We reset our own
  // query/debounced state in the close handler instead of here to avoid
  // calling setState inside an effect.
  useEffect(() => {
    if (open) {
      const id = setTimeout(() => inputRef.current?.focus(), 10)
      return () => clearTimeout(id)
    }
  }, [open])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setQuery('')
        setDebounced('')
      }
      onOpenChange(next)
    },
    [onOpenChange]
  )

  // Debounce query → debounced (150ms)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), 150)
    return () => clearTimeout(id)
  }, [query])

  // Client-side filtering: typing "files" or "membros" narrows the
  // in-app destinations and actions. Add a backend search group here when
  // the app has entities worth finding.
  const filteredNavItems = useMemo(() => {
    const available = buildNavItems(isEnabled, !!user?.is_superuser)
    if (debounced.trim().length === 0) return available
    return available.filter((n) =>
      matchesQuery(debounced, [t(n.labelKey), n.path, ...(n.keywords ?? [])])
    )
  }, [debounced, t, isEnabled, user?.is_superuser])

  const filteredQuickActions = useMemo(() => {
    if (debounced.trim().length === 0) return QUICK_ACTIONS
    return QUICK_ACTIONS.filter((a) =>
      matchesQuery(debounced, [t(a.labelKey), ...(a.keywords ?? [])])
    )
  }, [debounced, t])

  const runAndClose = useCallback(
    (item: { id: string; label: string; path: string; iconName: string; sublabel?: string | null }) => {
      saveRecent({
        id: item.id,
        label: item.label,
        path: item.path,
        icon: item.iconName,
        sublabel: item.sublabel,
      })
      handleOpenChange(false)
      // Slight delay so dialog closes before navigation animation
      setTimeout(() => navigate(item.path), 0)
    },
    [navigate, handleOpenChange]
  )

  const showEmptyHome = debounced.trim().length === 0
  const hasAnyLocalMatch =
    filteredNavItems.length > 0 || filteredQuickActions.length > 0
  const showEmptyState = !showEmptyHome && !hasAnyLocalMatch

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 backdrop-blur-[3px] bg-background/40',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0'
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-[22%] z-50 w-[92vw] max-w-[640px] -translate-x-1/2',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
            'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
            'data-[state=open]:slide-in-from-top-4 data-[state=closed]:slide-out-to-top-4',
            'duration-150 outline-none'
          )}
        >
          <DialogPrimitive.Title className="sr-only">{t('cmdk.title')}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">{t('cmdk.description')}</DialogPrimitive.Description>

          <Command
            key={open ? 'open' : 'closed'}
            shouldFilter={false}
            className={cn(
              'relative overflow-hidden rounded-2xl border border-border/80 bg-card',
              'shadow-[0_30px_80px_-20px_rgba(15,23,42,0.35)] dark:shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]',
              'ring-1 ring-black/[0.02] dark:ring-white/[0.04]'
            )}
          >
            {/* Decorative gradient rim */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"
            />

            {/* Input row */}
            <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3.5">
              <Search size={17} className="shrink-0 text-muted-foreground" />
              <Command.Input
                ref={inputRef}
                value={query}
                onValueChange={setQuery}
                placeholder={t('cmdk.placeholder')}
                className={cn(
                  'flex-1 bg-transparent text-[14.5px] text-foreground outline-none',
                  'placeholder:text-muted-foreground/70',
                  'caret-primary'
                )}
              />
              <kbd className="hidden sm:inline-flex h-5 items-center rounded border border-border/80 bg-muted/60 px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                ESC
              </kbd>
            </div>

            {/* Scrollable results area */}
            <Command.List
              className={cn(
                'max-h-[min(480px,60vh)] overflow-y-auto overscroll-contain px-2 py-2',
                'scrollbar-thin'
              )}
            >
              {/* HOME (no query): recents → quick actions → navigation */}
              {showEmptyHome ? (
                <>
                  {recents.length > 0 && (
                    <Group
                      icon={<History size={11} />}
                      labelKey="cmdk.groups.recent"
                    >
                      {recents.map((r) => (
                        <Command.Item
                          key={`recent-${r.id}`}
                          value={`recent ${r.label}`}
                          onSelect={() =>
                            runAndClose({
                              id: r.id,
                              label: r.label,
                              path: r.path,
                              iconName: r.icon,
                              sublabel: r.sublabel,
                            })
                          }
                          className={itemClasses()}
                        >
                          <ItemIcon tintClass="text-muted-foreground" bgClass="bg-muted/60">
                            <Compass size={14} />
                          </ItemIcon>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[13.5px] text-foreground">{r.label}</div>
                            {r.sublabel && (
                              <div className="truncate text-[11.5px] text-muted-foreground">{r.sublabel}</div>
                            )}
                          </div>
                          <ArrowUpRight size={13} className="text-muted-foreground/50 group-data-[selected=true]:text-primary" />
                        </Command.Item>
                      ))}
                    </Group>
                  )}

                  {filteredQuickActions.length > 0 && (
                    <Group icon={<Zap size={11} />} labelKey="cmdk.groups.quickActions">
                      {filteredQuickActions.map((a) => {
                        const Icon = a.icon
                        return (
                          <Command.Item
                            key={a.id}
                            value={`action ${t(a.labelKey)} ${(a.keywords ?? []).join(' ')}`}
                            onSelect={() => {
                              if (a.onSelect) {
                                handleOpenChange(false)
                                setTimeout(() => a.onSelect!(navigate), 0)
                              }
                            }}
                            className={itemClasses()}
                          >
                            <ItemIcon tintClass="text-primary" bgClass="bg-primary/10">
                              <Icon size={14} />
                            </ItemIcon>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[13.5px] text-foreground">{t(a.labelKey)}</div>
                            </div>
                            <CornerDownLeft size={12} className="text-muted-foreground/40 group-data-[selected=true]:text-primary" />
                          </Command.Item>
                        )
                      })}
                    </Group>
                  )}

                  {filteredNavItems.length > 0 && (
                    <Group icon={<Compass size={11} />} labelKey="cmdk.groups.navigation">
                      {filteredNavItems.map((n) => {
                        const Icon = n.icon
                        return (
                          <Command.Item
                            key={n.id}
                            value={`nav ${t(n.labelKey)} ${(n.keywords ?? []).join(' ')}`}
                            onSelect={() =>
                              runAndClose({
                                id: n.id,
                                label: t(n.labelKey),
                                path: n.path!,
                                iconName: 'compass',
                              })
                            }
                            className={itemClasses()}
                          >
                            <ItemIcon tintClass="text-muted-foreground" bgClass="bg-muted/60">
                              <Icon size={14} />
                            </ItemIcon>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[13.5px] text-foreground">{t(n.labelKey)}</div>
                              <div className="truncate text-[11px] text-muted-foreground/80">{n.path}</div>
                            </div>
                          </Command.Item>
                        )
                      })}
                    </Group>
                  )}
                </>
              ) : (
                /* SEARCH (query active): actions, then nav */
                <>
                  {showEmptyState && (
                    <Command.Empty className="px-3 py-10 text-center">
                      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted/60">
                        <Flame size={15} className="text-muted-foreground" />
                      </div>
                      <p className="text-[13px] font-medium text-foreground">
                        {t('cmdk.empty.title', { query: debounced })}
                      </p>
                      <p className="mt-1 text-[12px] text-muted-foreground">{t('cmdk.empty.hint')}</p>
                    </Command.Empty>
                  )}

                  {/* Quick actions — lower priority fallback while searching */}
                  {filteredQuickActions.length > 0 && (
                    <Group icon={<Zap size={11} />} labelKey="cmdk.groups.quickActions">
                      {filteredQuickActions.map((a) => {
                        const Icon = a.icon
                        return (
                          <Command.Item
                            key={a.id}
                            value={`action ${t(a.labelKey)} ${(a.keywords ?? []).join(' ')}`}
                            onSelect={() => {
                              if (a.onSelect) {
                                handleOpenChange(false)
                                setTimeout(() => a.onSelect!(navigate), 0)
                              }
                            }}
                            className={itemClasses()}
                          >
                            <ItemIcon tintClass="text-primary" bgClass="bg-primary/10">
                              <Icon size={14} />
                            </ItemIcon>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[13.5px] text-foreground">{t(a.labelKey)}</div>
                            </div>
                            <CornerDownLeft size={12} className="text-muted-foreground/40 group-data-[selected=true]:text-primary" />
                          </Command.Item>
                        )
                      })}
                    </Group>
                  )}

                  {/* Navigation — lowest priority fallback while searching */}
                  {filteredNavItems.length > 0 && (
                    <Group icon={<Compass size={11} />} labelKey="cmdk.groups.navigation">
                      {filteredNavItems.map((n) => {
                        const Icon = n.icon
                        return (
                          <Command.Item
                            key={n.id}
                            value={`nav ${t(n.labelKey)} ${(n.keywords ?? []).join(' ')}`}
                            onSelect={() =>
                              runAndClose({
                                id: n.id,
                                label: t(n.labelKey),
                                path: n.path!,
                                iconName: 'compass',
                              })
                            }
                            className={itemClasses()}
                          >
                            <ItemIcon tintClass="text-muted-foreground" bgClass="bg-muted/60">
                              <Icon size={14} />
                            </ItemIcon>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[13.5px] text-foreground">{t(n.labelKey)}</div>
                              <div className="truncate text-[11px] text-muted-foreground/80">{n.path}</div>
                            </div>
                          </Command.Item>
                        )
                      })}
                    </Group>
                  )}
                </>
              )}
            </Command.List>

            {/* Footer */}
            <div className="flex items-center justify-between gap-4 border-t border-border/60 bg-muted/30 px-4 py-2">
              <div className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                <ShellLogo size={11} className="text-primary" />
                <span className="font-semibold tracking-tight text-foreground/90">{t('app.name')}</span>
                <span className="text-muted-foreground/50">/</span>
                <span>{t('cmdk.footer.tagline')}</span>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <KbdHint>
                  <Kbd>↑</Kbd>
                  <Kbd>↓</Kbd>
                  <span>{t('cmdk.footer.navigate')}</span>
                </KbdHint>
                <KbdHint>
                  <Kbd>
                    <CornerDownLeft size={9} />
                  </Kbd>
                  <span>{t('cmdk.footer.open')}</span>
                </KbdHint>
                <KbdHint>
                  <Kbd>esc</Kbd>
                  <span>{t('cmdk.footer.close')}</span>
                </KbdHint>
              </div>
            </div>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function Group({
  icon,
  labelKey,
  children,
}: {
  icon: React.ReactNode
  labelKey: string
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  return (
    <Command.Group
      heading={
        <div className="flex items-center gap-1.5 px-3 pt-3 pb-1.5">
          <span className="text-muted-foreground/60">{icon}</span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
            {t(labelKey)}
          </span>
        </div>
      }
      className="mb-1"
    >
      {children}
    </Command.Group>
  )
}

function itemClasses() {
  return cn(
    'group flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm',
    'transition-colors',
    'data-[selected=true]:bg-primary/[0.08] data-[selected=true]:text-foreground',
    'data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
    'hover:bg-muted/40'
  )
}

function ItemIcon({
  tintClass,
  bgClass,
  style,
  children,
}: {
  tintClass: string
  bgClass: string
  style?: React.CSSProperties
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
        bgClass,
        tintClass
      )}
      style={style}
    >
      {children}
    </div>
  )
}

function KbdHint({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-1">{children}</div>
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-[17px] min-w-[17px] items-center justify-center rounded border border-border/80',
        'bg-background px-1 font-mono text-[9.5px] font-medium text-muted-foreground/90',
        'shadow-[0_1px_0_rgba(0,0,0,0.05)]'
      )}
    >
      {children}
    </kbd>
  )
}

