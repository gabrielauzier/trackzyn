import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getDesktopApi } from '@/lib/platform'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { ShellLogo } from '@/components/shell-logo'

function ModeCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background px-4">
      <Card className="w-full max-w-[380px] shadow-sm">
        <div className="flex flex-col items-center pt-8 pb-2 px-8">
          <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
            <ShellLogo size={22} className="text-primary" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-center">{title}</h1>
          {description && <p className="text-sm text-muted-foreground mt-1 text-center">{description}</p>}
        </div>
        {children}
      </Card>
    </div>
  )
}

/** Shown while the local backend starts. */
export function LocalStarting() {
  const { t } = useTranslation()
  return (
    <ModeCard title={t('desktop.mode.starting')}>
      <CardContent className="px-8 pb-8 pt-4">
        <div role="progressbar" aria-label={t('desktop.mode.starting')} className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
        </div>
      </CardContent>
    </ModeCard>
  )
}

/** Shown when the local backend did not start: the data is untouched, the logs say why. */
export function LocalFailed({ onRetry, reason }: { onRetry: () => void; reason?: 'import-journal' }) {
  const { t } = useTranslation()
  return (
    <ModeCard title={t('desktop.mode.failedTitle')} description={t('desktop.mode.failedDescription')}>
      {reason === 'import-journal' && (
        <p role="alert" className="px-8 text-sm text-muted-foreground">
          {t('desktop.mode.journalUnreadable')}
        </p>
      )}
      <CardFooter className="flex flex-col gap-3 px-8 pb-8 pt-4">
        <Button className="w-full" onClick={onRetry}>
          {t('desktop.mode.retry')}
        </Button>
        <Button variant="outline" className="w-full" onClick={() => void getDesktopApi().openLogs()}>
          {t('desktop.mode.openLogs')}
        </Button>
      </CardFooter>
    </ModeCard>
  )
}

interface ModeSelectPageProps {
  /** Called once the local backend listens, before navigating on to /setup. */
  onLocalReady?: () => void
}

export default function ModeSelectPage({ onLocalReady }: ModeSelectPageProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [phase, setPhase] = useState<'choice' | 'starting' | 'failed'>('choice')
  const [reason, setReason] = useState<'import-journal' | undefined>(undefined)

  const chooseThisComputer = async () => {
    setPhase('starting')
    let ok = false
    setReason(undefined)
    try {
      const result = await getDesktopApi().startLocal()
      ok = result.ok
      setReason(result.reason)
    } catch {
      ok = false
    }
    if (!ok) {
      setPhase('failed')
      return
    }
    onLocalReady?.()
    navigate('/setup', { replace: true })
  }

  if (phase === 'starting') return <LocalStarting />
  if (phase === 'failed') return <LocalFailed onRetry={() => void chooseThisComputer()} reason={reason} />

  return (
    <ModeCard title={t('desktop.mode.title')} description={t('desktop.mode.description')}>
      <CardFooter className="flex flex-col gap-3 px-8 pb-8 pt-4">
        <Button className="w-full" variant="outline" onClick={() => navigate('/connect')}>
          {t('desktop.mode.connect')}
        </Button>
        <Button className="w-full" onClick={() => void chooseThisComputer()}>
          {t('desktop.mode.local')}
        </Button>
      </CardFooter>
    </ModeCard>
  )
}
