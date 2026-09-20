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

export default function App() {
  const route = useRoute()
  const { theme, toggle } = useTheme()
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [account, setAccount] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [note, setNote] = useState<string | null>(null)

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

  // The web build is a viewer; creating lives in the desktop app.
  useEffect(() => { if (route.page === 'new' && !canEdit) go({ page: 'home' }, true) }, [route.page])

  if (session === undefined) return <div className="authwrap"><p className="empty">Loading…</p></div>
  if (!session) return <AuthScreen />

  return (
    <>
      {route.page === 'home' && <Dashboard onError={onError} />}
      {route.page === 'new' && canEdit && <NewRoadmap onError={onError} />}
      {route.page === 'roadmap' && <RoadmapPage id={route.id} view={route.view} target={route.target} onError={onError} />}

      <div className="corner">
        {!isDesktop && <span className="pill" title="Create and edit in the desktop app">View only</span>}
        <button type="button" className="iconbtn" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>{theme === 'dark' ? '☀' : '☾'}</button>
        <button type="button" className="iconbtn" onClick={() => { setAccount(true); setNote(null) }} aria-label="Account">☺</button>
      </div>

      {account && (
        <>
          <button className="scrim" aria-label="Close" onClick={() => setAccount(false)} tabIndex={-1} />
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Account">
            <h2>Account</h2>
            <p>Signed in as <strong>{session.user.email}</strong>.</p>
            {note && <p className="notice notice--ok">{note}</p>}
            <form onSubmit={async (e) => {
              e.preventDefault()
              const { error: err } = await supabase!.auth.updateUser({ password: newPassword })
              if (err) onError(err.message)
              else { setNote('Password set. You can sign in with it anywhere now.'); setNewPassword('') }
            }}>
              <label className="field"><span>Set or change password</span>
                <input className="input" type="password" minLength={8} required autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </label>
              <div className="dialog__actions">
                <button type="submit" className="btn btn--ghost">Save password</button>
                <button type="button" className="btn btn--ghost" onClick={() => void supabase!.auth.signOut().then(() => setAccount(false))}>Sign out</button>
                <button type="button" className="btn" onClick={() => setAccount(false)}>Done</button>
              </div>
            </form>
          </div>
        </>
      )}

      {error && (
        <div className="toast" role="alert">
          <span>{error}</span>
          <button type="button" className="iconbtn" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
    </>
  )
}
