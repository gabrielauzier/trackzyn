import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { setup, WORKSPACE_STORAGE_KEY } from '@/lib/api'
import { getDesktopApi } from '@/lib/platform'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { ShellLogo } from '@/components/shell-logo'

interface ConnectServerPageProps {
  /** Called with the saved URL once the server validated, before navigating on. */
  onConnected?: (url: string) => void
}

export default function ConnectServerPage({ onConnected }: ConnectServerPageProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // The desktop app lands here with ?sso=failed when a sign-in deep link arrived before a server was set.
  const ssoFailed = searchParams.get('sso') === 'failed'
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [insecureConfirmed, setInsecureConfirmed] = useState(false)
  const [isChecking, setIsChecking] = useState(false)

  const handleChange = (value: string) => {
    setUrl(value)
    setError('')
    setInsecureConfirmed(false)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setIsChecking(true)
    try {
      const result = await getDesktopApi().setServerUrl(url, { allowInsecure: insecureConfirmed })
      if (!result.ok) {
        if (result.reason === 'insecure') {
          setInsecureConfirmed(true)
          setError(t('desktop.connect.insecureWarning'))
        } else if (result.reason === 'invalid-url') {
          setError(t('desktop.connect.invalidUrl'))
        } else {
          setError(t('desktop.connect.unreachable'))
        }
        return
      }
      // The session belongs to the previous server. Drop it only now that the
      // new one validated, and before any call reaches it.
      localStorage.removeItem('token')
      localStorage.removeItem(WORKSPACE_STORAGE_KEY)
      let hasUsers = true
      try {
        hasUsers = (await setup.status()).has_users
      } catch {
        // The login page checks again and redirects to /setup when needed.
      }
      onConnected?.(result.url)
      navigate(hasUsers ? '/login' : '/setup', { replace: true })
    } finally {
      setIsChecking(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background px-4">
      <Card className="w-full max-w-[380px] shadow-sm">
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col items-center pt-8 pb-2 px-8">
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
              <ShellLogo size={22} className="text-primary" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">{t('desktop.connect.title')}</h1>
            <p className="text-sm text-muted-foreground mt-1 text-center">{t('desktop.connect.description')}</p>
          </div>
          <CardContent className="space-y-4 px-8 pt-4">
            {ssoFailed && !error && (
              <div role="alert" className="p-3 text-sm text-destructive bg-destructive/10 rounded-lg">
                {t('desktop.sso.incomplete')}
              </div>
            )}
            {error && (
              <div role="alert" className="p-3 text-sm text-destructive bg-destructive/10 rounded-lg">
                {error}
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="server-url" className="text-sm">
                {t('desktop.connect.urlLabel')}
              </Label>
              <Input
                id="server-url"
                type="text"
                inputMode="url"
                autoComplete="url"
                autoCapitalize="none"
                spellCheck={false}
                value={url}
                onChange={(event) => handleChange(event.target.value)}
                placeholder={t('desktop.connect.urlPlaceholder')}
                autoFocus
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4 px-8 pb-8 pt-2">
            <Button type="submit" className="w-full" disabled={isChecking || url.trim() === ''}>
              {isChecking ? t('desktop.connect.checking') : t('desktop.connect.confirm')}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
