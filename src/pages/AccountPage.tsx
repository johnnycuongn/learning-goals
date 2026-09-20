import { useEffect, useState } from 'react'
import { aiStatus, type AiStatus } from '../lib/ai'
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '../lib/db'
import { isDesktop } from '../lib/platform'
import { go } from '../lib/router'
import { supabase } from '../lib/supabase'
import { AiBadge } from './NewRoadmap'

export function AccountPage({ email, onError }: { email: string; onError: (m: string) => void }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [password, setPassword] = useState('')
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    loadSettings().then((s) => { setSettings(s); setLoaded(true) }).catch((e) => onError(e.message))
    aiStatus().then(setStatus).catch(() => undefined)
  }, [onError])

  // Settings save as you change them; there is no separate Save button to forget.
  const change = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    saveSettings(next).then(() => setNote('Saved.')).catch((e) => onError(e.message))
  }

  return (
    <div className="page">
      <header className="pagehead">
        <button type="button" className="iconbtn" onClick={() => go({ page: 'home' })}>← Roadmaps</button>
        <h1>Account</h1>
      </header>
      <main className="page__body page__body--narrow">
        {note && <p className="notice notice--ok" role="status">{note}</p>}

        <section className="card">
          <h2 className="h2">Claude</h2>
          {isDesktop ? <AiBadge status={status} /> : <p className="notice notice--warn">AI runs in the desktop app, through Claude Code on that Mac. These settings are shown here but only take effect there.</p>}
          <label className="field">
            <span>Model, for research and the weekly focus</span>
            <select className="input" value={settings.ai_model} disabled={!loaded || !isDesktop} onChange={(e) => change({ ai_model: e.target.value })}>
              <option value="">Your Claude Code default</option>
              <option value="haiku">Haiku (fastest, lightest on your allowance)</option>
              <option value="sonnet">Sonnet (a good balance)</option>
              <option value="opus">Opus (most thorough)</option>
            </select>
          </label>
        </section>

        <section className="card">
          <h2 className="h2">This week's focus</h2>
          <label className="check">
            <input type="checkbox" checked={settings.briefing_enabled} disabled={!loaded || !isDesktop} onChange={(e) => change({ briefing_enabled: e.target.checked })} />
            <span><strong>Refresh it every day.</strong> Claude rereads your progress and rewrites the focus card on the dashboard.</span>
          </label>
          <label className="field">
            <span>At what time</span>
            <input className="input" type="time" step={300} value={settings.briefing_time} disabled={!loaded || !isDesktop || !settings.briefing_enabled}
              onChange={(e) => { if (/^\d\d:\d\d$/.test(e.target.value)) change({ briefing_time: e.target.value }) }} />
          </label>
          <p className="empty" style={{ fontSize: 13 }}>
            The desktop app does the refreshing, so it happens at this time if the app is open, or the next time you open it after this time. It uses a little of your Claude plan's allowance each day. The Regenerate button on the card works any time.
          </p>
        </section>

        <section className="card">
          <h2 className="h2">Sign-in</h2>
          <p className="lede">Signed in as <strong>{email}</strong>.</p>
          <form onSubmit={async (e) => {
            e.preventDefault()
            const { error } = await supabase!.auth.updateUser({ password })
            if (error) onError(error.message)
            else { setNote('Password set. You can sign in with it anywhere now.'); setPassword('') }
          }}>
            <label className="field"><span>Set or change password</span>
              <input className="input" type="password" minLength={8} required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <div className="dialog__actions">
              <button type="submit" className="btn btn--ghost">Save password</button>
              <button type="button" className="btn btn--ghost" onClick={() => void supabase!.auth.signOut()}>Sign out</button>
            </div>
          </form>
        </section>
      </main>
    </div>
  )
}
