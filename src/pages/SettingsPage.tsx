import { useEffect, useState } from 'react'
import { aiStatus, CLI_LABEL, type AiStatus } from '../lib/ai'
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Provider, type Settings } from '../lib/db'
import { go } from '../lib/router'
import { AiBadge } from './NewRoadmap'

/** Suggested models per CLI. "" means whatever that CLI is configured to use. */
const MODELS: Record<Provider, { value: string; label: string }[]> = {
  claude: [
    { value: '', label: 'Your Claude Code default' },
    { value: 'haiku', label: 'Haiku (fastest, lightest on your allowance)' },
    { value: 'sonnet', label: 'Sonnet (a good balance)' },
    { value: 'opus', label: 'Opus (most thorough)' },
  ],
  codex: [
    { value: '', label: 'The Codex default for your plan' },
  ],
}

export function SettingsPage({ onError }: { onError: (m: string) => void }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [dataDir, setDataDir] = useState('')
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    loadSettings().then((s) => { setSettings(s); setLoaded(true) }).catch((e) => onError(e.message))
    aiStatus().then(setStatus).catch(() => undefined)
    import('@tauri-apps/api/core').then(({ invoke }) => invoke<string>('data_dir_path')).then(setDataDir).catch(() => undefined)
  }, [onError])

  // Settings save as you change them; there is no separate Save button to forget.
  const change = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    saveSettings(next).then(() => setNote('Saved.')).catch((e) => onError(e.message))
  }

  const models = MODELS[settings.ai_provider]
  const custom = !models.some((m) => m.value === settings.ai_model)

  return (
    <div className="page">
      <header className="pagehead">
        <button type="button" className="iconbtn" onClick={() => go({ page: 'home' })}>← Roadmaps</button>
        <h1>Settings</h1>
      </header>
      <main className="page__body page__body--narrow">
        {note && <p className="notice notice--ok" role="status">{note}</p>}

        <section className="card">
          <h2 className="h2">AI</h2>
          <p className="lede">Research and the weekly focus run through an AI command-line tool you are already signed into, on your subscription. Pick which one.</p>
          <fieldset className="choice" disabled={!loaded}>
            <legend className="sr-only">AI provider</legend>
            {(['claude', 'codex'] as Provider[]).map((p) => (
              <label key={p} className="choice__opt">
                <input type="radio" name="provider" value={p} checked={settings.ai_provider === p}
                  onChange={() => change({ ai_provider: p, ai_model: '' })} />
                <span>{CLI_LABEL[p]}</span>
              </label>
            ))}
          </fieldset>
          <AiBadge status={status} provider={settings.ai_provider} />
          <label className="field">
            <span>Model, for research and the weekly focus</span>
            <select className="input" value={custom ? '__custom' : settings.ai_model} disabled={!loaded}
              onChange={(e) => change({ ai_model: e.target.value === '__custom' ? (settings.ai_model || ' ') : e.target.value })}>
              {models.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              <option value="__custom">Another model, by name…</option>
            </select>
          </label>
          {custom && (
            <label className="field">
              <span>Model name, exactly as {CLI_LABEL[settings.ai_provider]} spells it</span>
              <input className="input" defaultValue={settings.ai_model.trim()} placeholder={settings.ai_provider === 'codex' ? 'e.g. gpt-5.5' : 'e.g. claude-opus-5-5'}
                onBlur={(e) => change({ ai_model: e.target.value.trim() })} />
            </label>
          )}
        </section>

        <section className="card">
          <h2 className="h2">This week's focus</h2>
          <label className="check">
            <input type="checkbox" checked={settings.briefing_enabled} disabled={!loaded} onChange={(e) => change({ briefing_enabled: e.target.checked })} />
            <span><strong>Refresh it every day.</strong> Your AI rereads your progress and rewrites the focus card on the dashboard.</span>
          </label>
          <label className="field">
            <span>At what time</span>
            <input className="input" type="time" step={300} value={settings.briefing_time} disabled={!loaded || !settings.briefing_enabled}
              onChange={(e) => { if (/^\d\d:\d\d$/.test(e.target.value)) change({ briefing_time: e.target.value }) }} />
          </label>
          <p className="empty" style={{ fontSize: 13 }}>
            It happens at this time if the app is open, or the next time you open it after this time. It uses a little of your plan's allowance each day. The Regenerate button on the card works any time.
          </p>
        </section>

        <section className="card">
          <h2 className="h2">Your data</h2>
          <p className="lede">Everything stays on this Mac: one database file, <code>learning-goals.db</code>, and a <code>files</code> folder for attachments. No account, no cloud. To back up, copy the folder; to move to a new Mac, copy it back while the app is closed.</p>
          {dataDir && <p className="empty" style={{ fontSize: 13, wordBreak: 'break-all' }}>{dataDir}</p>}
          <div className="dialog__actions">
            <button type="button" className="btn btn--ghost" onClick={() => {
              import('@tauri-apps/api/core').then(({ invoke }) => invoke('data_dir_reveal')).catch((e) => onError(String(e)))
            }}>Show in Finder</button>
          </div>
        </section>
      </main>
    </div>
  )
}
