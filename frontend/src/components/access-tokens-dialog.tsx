import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Copy, KeyRound, Plus, TriangleAlert } from 'lucide-react'
import { useWorkspace } from '@/contexts/workspace-context'
import { accessTokens, externalApiUrl } from '@/lib/api'
import { extractApiError } from '@/lib/api-errors'
import { DeleteConfirmationDialog } from '@/components/delete-confirmation-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { AccessToken, AccessTokenScope, CreatedAccessToken } from '@/types'

interface AccessTokensDialogProps {
  open: boolean
  onClose: () => void
}

const STATUS_KEYS: Record<AccessToken['status'], string> = {
  active: 'accessTokens.statusActive',
  expired: 'accessTokens.statusExpired',
  revoked: 'accessTokens.statusRevoked',
}

const SCOPE_KEYS: Record<AccessTokenScope, string> = {
  'lists:read': 'accessTokens.scopeListsRead',
  'tasks:read': 'accessTokens.scopeTasksRead',
  'tasks:create': 'accessTokens.scopeTasksCreate',
  'tasks:write': 'accessTokens.scopeTasksWrite',
  'tasks:delete': 'accessTokens.scopeTasksDelete',
  'inbox:create': 'accessTokens.scopeInboxCreate',
}
const SCOPES = Object.keys(SCOPE_KEYS) as AccessTokenScope[]
const DEFAULT_SCOPES: AccessTokenScope[] = ['lists:read', 'tasks:create']
const VALIDITIES = [30, 90, 365] as const
type Validity = (typeof VALIDITIES)[number]

/** The API answers in English; these are the refusals the form expects, in the interface language. */
const SERVER_ERROR_KEYS: Record<string, string> = {
  'Token name already in use': 'accessTokens.errorNameInUse',
  'Token limit reached': 'accessTokens.errorLimit',
  'Read-only role': 'accessTokens.errorReadOnly',
  'Workspace not found': 'accessTokens.errorWorkspace',
}

export function AccessTokensDialog({ open, onClose }: AccessTokensDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('accessTokens.title')}</DialogTitle>
          <DialogDescription>{t('accessTokens.description')}</DialogDescription>
        </DialogHeader>
        <AccessTokensPanel onClose={onClose} />
      </DialogContent>
    </Dialog>
  )
}

function AccessTokensPanel({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const [tokens, setTokens] = useState<AccessToken[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<AccessToken | null>(null)
  const [revokePending, setRevokePending] = useState(false)
  const [revokeError, setRevokeError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  // The only place the full value lives (TOKEN-06): it dies with this panel when the dialog closes,
  // and creating it goes around TanStack Query so that no cache ever holds it.
  const [created, setCreated] = useState<CreatedAccessToken | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      setTokens(await accessTokens.list())
    } catch (err) {
      setLoadError(extractApiError(err, t('accessTokens.loadError')))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))

  const handleRevoke = async () => {
    if (!revoking) return
    setRevokePending(true)
    setRevokeError(null)
    try {
      await accessTokens.revoke(revoking.id)
      const revokedAt = new Date().toISOString()
      setTokens((current) =>
        current.map((token) => (token.id === revoking.id ? { ...token, status: 'revoked', revoked_at: revokedAt } : token)),
      )
    } catch (err) {
      setRevokeError(extractApiError(err, t('accessTokens.revokeError')))
    } finally {
      setRevokePending(false)
      setRevoking(null)
    }
  }

  if (created) {
    return (
      <CreatedTokenView
        created={created}
        onDone={() => {
          setCreated(null)
          void load()
        }}
      />
    )
  }

  if (generating) {
    return (
      <GenerateTokenForm
        onCancel={() => setGenerating(false)}
        onCreated={(token) => {
          setGenerating(false)
          setCreated(token)
        }}
      />
    )
  }

  return (
    <div className="space-y-4">
      {loading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : loadError ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 p-3">
          <p role="alert" className="text-sm text-destructive">
            {loadError}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : tokens.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-3 py-6 text-center">
          <KeyRound size={20} className="text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t('accessTokens.empty')}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {tokens.map((token) => (
            <li key={token.id} className="flex items-start gap-3 rounded-lg border p-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium" title={token.name}>
                    {token.name}
                  </p>
                  <Badge variant={token.status === 'active' ? 'secondary' : 'outline'}>{t(STATUS_KEYS[token.status])}</Badge>
                </div>
                <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                  <span className="font-mono">{token.display_hint}</span>
                  <span className="min-w-0 truncate">{token.workspace_name}</span>
                </p>
                <p className="flex flex-wrap gap-1">
                  {token.scopes.map((scope) => (
                    <code key={scope} className="rounded bg-muted px-1 py-0.5 text-[11px]">
                      {scope}
                    </code>
                  ))}
                </p>
                <p className="text-xs text-muted-foreground">{t('accessTokens.expires', { date: formatDate(token.expires_at) })}</p>
                <p className="text-xs text-muted-foreground">
                  {t('accessTokens.lastUsed', {
                    date: token.last_used_at ? formatDate(token.last_used_at) : t('accessTokens.neverUsed'),
                  })}
                </p>
              </div>
              {token.status === 'active' && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={t('accessTokens.revokeNamed', { name: token.name })}
                  onClick={() => setRevoking(token)}
                >
                  {t('accessTokens.revoke')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {revokeError && (
        <p role="alert" className="text-sm text-destructive">
          {revokeError}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {t('common.close')}
        </Button>
        <Button type="button" onClick={() => setGenerating(true)}>
          <Plus size={14} /> {t('accessTokens.generate')}
        </Button>
      </DialogFooter>

      <DeleteConfirmationDialog
        open={!!revoking}
        title={t('accessTokens.revokeTitle')}
        description={t('accessTokens.revokeDescription', { name: revoking?.name ?? '' })}
        isPending={revokePending}
        confirmLabel={t('accessTokens.revoke')}
        onClose={() => setRevoking(null)}
        onConfirm={() => void handleRevoke()}
      />
    </div>
  )
}

function GenerateTokenForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (token: CreatedAccessToken) => void }) {
  const { t } = useTranslation()
  const { current, workspaces } = useWorkspace()
  const [name, setName] = useState('')
  const [workspaceId, setWorkspaceId] = useState(current?.id ?? '')
  const [scopes, setScopes] = useState<AccessTokenScope[]>(DEFAULT_SCOPES)
  const [validity, setValidity] = useState<Validity>(90)
  const [saving, setSaving] = useState(false)
  // The raw answer, not its translation: the message follows the language if it changes.
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const token = await accessTokens.create({
        name: name.trim(),
        workspace_id: workspaceId,
        // In the order of the checkboxes, whatever order they were ticked in.
        scopes: SCOPES.filter((scope) => scopes.includes(scope)),
        expires_in_days: validity,
      })
      onCreated(token)
    } catch (err) {
      setError(extractApiError(err, t('accessTokens.createError')))
    } finally {
      setSaving(false)
    }
  }

  const toggleScope = (scope: AccessTokenScope, checked: boolean) =>
    setScopes((selected) => (checked ? [...selected, scope] : selected.filter((item) => item !== scope)))

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="access-token-name">{t('common.name')}</Label>
        <Input id="access-token-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} autoFocus />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="access-token-workspace">{t('accessTokens.workspace')}</Label>
          <Select value={workspaceId} onValueChange={setWorkspaceId}>
            <SelectTrigger id="access-token-workspace" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {workspaces.map((workspace) => (
                <SelectItem key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="access-token-validity">{t('accessTokens.validity')}</Label>
          <Select value={String(validity)} onValueChange={(value) => setValidity(Number(value) as Validity)}>
            <SelectTrigger id="access-token-validity" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VALIDITIES.map((days) => (
                <SelectItem key={days} value={String(days)}>
                  {t('accessTokens.days', { days })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t('accessTokens.scopes')}</legend>
        {SCOPES.map((scope) => (
          <div key={scope} className="flex items-start gap-2">
            <Checkbox
              id={`access-token-scope-${scope}`}
              className="mt-0.5"
              checked={scopes.includes(scope)}
              onCheckedChange={(checked) => toggleScope(scope, checked === true)}
            />
            <Label htmlFor={`access-token-scope-${scope}`} className="block font-normal">
              <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{scope}</code> {t(SCOPE_KEYS[scope])}
            </Label>
          </div>
        ))}
      </fieldset>

      <p className="text-xs text-muted-foreground">{t('accessTokens.nameVisible')}</p>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {SERVER_ERROR_KEYS[error] ? t(SERVER_ERROR_KEYS[error]) : error}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={saving || !name.trim() || scopes.length === 0}>
          {t('accessTokens.submit')}
        </Button>
      </DialogFooter>
    </form>
  )
}

function CreatedTokenView({ created, onDone }: { created: CreatedAccessToken; onDone: () => void }) {
  const { t } = useTranslation()
  const [apiUrl, setApiUrl] = useState<string | null>(null)

  useEffect(() => {
    void externalApiUrl().then(setApiUrl)
  }, [])

  const header = `Authorization: Bearer ${created.token}`
  const mcpUrl = `${apiUrl}/mcp`
  const mcpConfig = JSON.stringify(
    { mcpServers: { trackzyn: { type: 'http', url: mcpUrl, headers: { Authorization: `Bearer ${created.token}` } } } },
    null,
    2,
  )
  const curl = [
    `# ${t('accessTokens.curlFindList')}`,
    `curl ${apiUrl}/lists -H "${header}"`,
    '',
    `# ${t('accessTokens.curlCreateTask')}`,
    `curl -X POST ${apiUrl}/tasks \\`,
    `  -H "${header}" \\`,
    '  -H "Content-Type: application/json" \\',
    `  -d '${JSON.stringify({ list_id: 'LIST_ID', title: t('accessTokens.curlTaskTitle') })}'`,
  ].join('\n')

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex items-start gap-2.5 rounded-lg bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-300">
        <TriangleAlert size={16} className="mt-0.5 shrink-0" />
        <p>{t('accessTokens.copyNow')}</p>
      </div>

      <CopyBlock label={t('accessTokens.tokenLabel')} copyLabel={t('accessTokens.copyToken')} value={created.token} />

      {apiUrl && (
        <>
          <CopyBlock label={t('accessTokens.curlLabel')} copyLabel={t('accessTokens.copyCurl')} value={curl} testId="access-token-curl" />
          <CopyBlock label={t('accessTokens.mcpUrlLabel')} copyLabel={t('accessTokens.copyMcpUrl')} value={mcpUrl} />
          <CopyBlock
            label={t('accessTokens.mcpConfigLabel')}
            copyLabel={t('accessTokens.copyMcpConfig')}
            value={mcpConfig}
            testId="access-token-mcp-config"
          />
        </>
      )}

      <DialogFooter>
        <Button type="button" onClick={onDone}>
          {t('accessTokens.done')}
        </Button>
      </DialogFooter>
    </div>
  )
}

function CopyBlock({ label, copyLabel, value, testId }: { label: string; copyLabel: string; value: string; testId?: string }) {
  const { t } = useTranslation()

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(t('accessTokens.copied'))
    } catch {
      toast.error(t('accessTokens.copyFailed'))
    }
  }

  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{label}</p>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={copyLabel} title={copyLabel} onClick={() => void handleCopy()}>
          <Copy size={14} />
        </Button>
      </div>
      <pre data-testid={testId} className="rounded-lg bg-muted px-3 py-2 font-mono text-xs break-all whitespace-pre-wrap">
        {value}
      </pre>
    </div>
  )
}
