import { useState } from 'react'
import type { EmailOtpType } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { isDesktop } from '../lib/platform'

type Mode = 'signin' | 'signup' | 'link'

/**
 * Password sign-in works the same in the desktop app and on the web, with no
 * redirect to get wrong. The emailed-link route is kept for accounts that were
 * made without a password: a desktop app can't be the target of a web link, so
 * you paste the link here and the app redeems it directly.
 */
export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pasted, setPasted] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  if (!supabase) return <div className="authwrap"><div className="card"><p className="lede">This build has no backend configured.</p></div></div>
  const auth = supabase.auth

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      if (mode === 'signin') {
        const { error } = await auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
      } else if (mode === 'signup') {
        const { data, error } = await auth.signUp({ email: email.trim(), password })
        if (error) throw error
        if (!data.session) setMsg({ ok: true, text: 'Check your email and click the confirmation link. It may open a page that fails to load; that is fine, the confirmation still counts. Then sign in here.' })
      } else if (!sent) {
        const { error } = await auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false, emailRedirectTo: isDesktop ? undefined : window.location.origin + window.location.pathname } })
        if (error) throw error
        setSent(true)
      } else {
        const url = new URL(pasted.trim())
        const token = url.searchParams.get('token') ?? url.searchParams.get('token_hash')
        const type = (url.searchParams.get('type') ?? 'magiclink') as EmailOtpType
        if (!token) throw new Error("That doesn't look like the link from the email.")
        const { error } = await auth.verifyOtp({ token_hash: token, type })
        if (error) throw error
      }
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="authwrap">
      <form className="card authcard" onSubmit={submit}>
        <h1>My roadmaps</h1>
        <p className="lede">{isDesktop ? 'Sign in to sync your roadmaps between this app and the web viewer.' : 'Sign in to view your roadmaps. Creating and editing happens in the desktop app.'}</p>
        {msg && <p className={`notice ${msg.ok ? 'notice--ok' : 'notice--warn'}`} role="alert">{msg.text}</p>}
        <label className="field"><span>Email</span>
          <input className="input" type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {mode !== 'link' && (
          <label className="field"><span>Password</span>
            <input className="input" type="password" required minLength={8} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
        )}
        {mode === 'link' && sent && (
          <label className="field"><span>Paste the link from the email</span>
            <textarea className="input input--area" rows={3} required value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Right-click the button in the email, copy the link, paste it here. Don't click it." />
          </label>
        )}
        <button type="submit" className="btn btn--wide" disabled={busy}>
          {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : sent ? 'Sign in with this link' : 'Email me a link'}
        </button>
        <div className="authlinks">
          {mode !== 'signin' && <button type="button" className="linkish" onClick={() => { setMode('signin'); setMsg(null) }}>I have a password</button>}
          {mode !== 'signup' && <button type="button" className="linkish" onClick={() => { setMode('signup'); setMsg(null) }}>Create an account</button>}
          {mode !== 'link' && <button type="button" className="linkish" onClick={() => { setMode('link'); setSent(false); setMsg(null) }}>No password yet? Use an emailed link</button>}
        </div>
      </form>
    </div>
  )
}
