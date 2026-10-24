import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { getDesktopApi, isDesktop } from '@/lib/platform'
import { ExportModal } from '@/components/export-modal'
import { LocalFailed, LocalStarting } from '@/pages/mode-select'

// Desktop only: on the web build the constants are false, so these chunks are never
// emitted and nothing here can reach `window.launchkit`.
const ConnectServerPage = __DESKTOP_BUILD__ ? lazy(() => import('@/pages/connect-server')) : null
const ModeSelectPage = __DESKTOP_BUILD__ ? lazy(() => import('@/pages/mode-select')) : null

type Mode = 'remote' | 'local' | null

function Spinner() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  )
}

/** Local mode: the backend has to listen before anything of the app may call it. */
function LocalGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<'starting' | 'ready' | 'failed'>('starting')
  const [reason, setReason] = useState<'import-journal' | undefined>(undefined)

  const run = useCallback(() => {
    getDesktopApi()
      .startLocal()
      .then((result) => {
        setReason(result.reason)
        setPhase(result.ok ? 'ready' : 'failed')
      })
      .catch(() => setPhase('failed'))
  }, [])

  useEffect(() => {
    run()
  }, [run])

  const retry = () => {
    setPhase('starting')
    run()
  }

  if (phase === 'starting') return <LocalStarting />
  if (phase === 'failed') return <LocalFailed onRetry={retry} reason={reason} />
  return (
    <>
      {children}
      <ExportModal />
    </>
  )
}

function ServerGate({ children }: { children: ReactNode }) {
  const location = useLocation()
  const queryClient = useQueryClient()
  // undefined: still asking the main process; null: no server configured.
  const [serverUrl, setServerUrl] = useState<string | null | undefined>(undefined)
  const [mode, setMode] = useState<Mode | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    const api = getDesktopApi()
    void Promise.all([api.getMode(), api.getServerUrl()]).then(([savedMode, url]) => {
      if (cancelled) return
      setMode(savedMode)
      setServerUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (serverUrl === undefined || mode === undefined) return <Spinner />

  // The connect screen wins over everything: it is how a server is chosen from the mode choice.
  if (location.pathname === '/connect') {
    if (!ConnectServerPage) return null
    return (
      <Suspense fallback={<Spinner />}>
        <ConnectServerPage
          onConnected={(url) => {
            // Everything cached came from the previous server (or from the local data).
            queryClient.clear()
            setServerUrl(url)
            setMode('remote')
          }}
        />
      </Suspense>
    )
  }

  if (mode === null || location.pathname === '/mode') {
    if (!ModeSelectPage) return null
    return (
      <Suspense fallback={<Spinner />}>
        <ModeSelectPage
          onLocalReady={() => {
            queryClient.clear()
            setMode('local')
          }}
        />
      </Suspense>
    )
  }

  if (mode === 'local') return <LocalGate>{children}</LocalGate>

  if (serverUrl === null) {
    if (!ConnectServerPage) return null
    return (
      <Suspense fallback={<Spinner />}>
        <ConnectServerPage
          onConnected={(url) => {
            queryClient.clear()
            setServerUrl(url)
          }}
        />
      </Suspense>
    )
  }

  return <>{children}</>
}

/**
 * On desktop, nothing renders (and no `/api` call leaves) until a mode is chosen: the choice
 * between a server and this computer comes first, `/connect` shows the connection screen and
 * `/mode` reopens the choice. In local mode the app waits for the local backend. On the web it
 * is a pass-through.
 */
export function DesktopGate({ children }: { children: ReactNode }) {
  if (!isDesktop()) return <>{children}</>
  return <ServerGate>{children}</ServerGate>
}
