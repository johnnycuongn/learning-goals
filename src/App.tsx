import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { canEdit, isDesktop } from './lib/platform'
import { go, useRoute } from './lib/router'
import { useTheme } from './lib/useTheme'
import { AuthScreen } from './pages/AuthScreen'
import { Dashboard } from './pages/Dashboard'
import { NewRoadmap } from './pages/NewRoadmap'
import { RoadmapPage } from './pages/RoadmapPage'
import { AccountPage } from './pages/AccountPage'
import { refreshIfDue } from './lib/briefing'

export default function App() {
  const route = useRoute()
  const { theme, toggle } = useTheme()
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return setSession(null)
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const onError = useCallback((m: string) => setError(m), [])
  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 9000)
    return () => clearTimeout(t)
  }, [error])

  // The daily "This week" refresh: on open, then every five minutes while open.
  const signedIn = Boolean(session)
  useEffect(() => {
    if (!isDesktop || !signedIn) return
    void refreshIfDue()
    const t = setInterval(() => void refreshIfDue(), 5 * 60_000)
    return () => clearInterval(t)
  }, [signedIn])

  // The web build is a viewer; creating lives in the desktop app.
  useEffect(() => { if (route.page === 'new' && !canEdit) go({ page: 'home' }, true) }, [route.page])

  if (session === undefined) return <div className="authwrap"><p className="empty">Loading…</p></div>
  if (!session) return <AuthScreen />

  return (
    <>
      {route.page === 'home' && <Dashboard onError={onError} />}
      {route.page === 'new' && canEdit && <NewRoadmap onError={onError} />}
      {route.page === 'account' && <AccountPage email={session.user.email ?? ''} onError={onError} />}
      {route.page === 'roadmap' && <RoadmapPage id={route.id} view={route.view} target={route.target} onError={onError} />}

      <div className="corner">
        {!isDesktop && <span className="pill" title="Create and edit in the desktop app">View only</span>}
        <button type="button" className="iconbtn" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>{theme === 'dark' ? '☀' : '☾'}</button>
        <button type="button" className="iconbtn" onClick={() => go({ page: 'account' })} aria-label="Account and settings">☺</button>
      </div>

      {error && (
        <div className="toast" role="alert">
          <span>{error}</span>
          <button type="button" className="iconbtn" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
    </>
  )
}
