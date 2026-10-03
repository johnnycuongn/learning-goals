import { useEffect, useMemo, useRef, useState } from 'react'
import { aiStatus, cancelAi, CLI_LABEL, createPrompt, newKey, PROVIDER_LABEL, revisePrompt, runResearch, type AiProgress, type AiStatus } from '../lib/ai'
import { loadSettings, saveDraft, type Provider } from '../lib/db'
import { go } from '../lib/router'
import { IMPORTANCE_LABEL, KIND_LABEL, type Draft, type DraftStage } from '../lib/types'
import { openExternal } from '../lib/platform'

const DRAFT_KEY = 'learning-goals:draft'
const readDraft = (): Draft | null => {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null') } catch { return null }
}

export function NewRoadmap({ onError }: { onError: (m: string) => void }) {
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [draft, setDraftState] = useState<Draft | null>(readDraft)
  const [goal, setGoal] = useState('')
  const [background, setBackground] = useState('')
  const [deep, setDeep] = useState(false)
  const [model, setModel] = useState('')
  const [provider, setProvider] = useState<Provider>('claude')
  useEffect(() => { loadSettings().then((x) => { setModel(x.ai_model); setProvider(x.ai_provider) }).catch(() => undefined) }, [])
  const ai = PROVIDER_LABEL[provider]
  const [job, setJob] = useState<string | null>(null)
  const [log, setLog] = useState<AiProgress[]>([])
  const [ask, setAsk] = useState('')
  const [saving, setSaving] = useState(false)
  const started = useRef(0)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => { aiStatus().then(setStatus).catch(() => setStatus(null)) }, [])
  useEffect(() => {
    if (!job) return
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started.current) / 1000)), 1000)
    return () => clearInterval(t)
  }, [job])

  const setDraft = (d: Draft | null) => {
    setDraftState(d)
    try { d ? localStorage.setItem(DRAFT_KEY, JSON.stringify(d)) : localStorage.removeItem(DRAFT_KEY) } catch { /* fine */ }
  }

  const research = async (prompt: string) => {
    const id = newKey('job')
    started.current = Date.now()
    setElapsed(0); setLog([]); setJob(id)
    try {
      setDraft(await runResearch(id, prompt, { deep, provider, model }, (p) => setLog((l) => [...l.slice(-40), p])))
      setAsk('')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg !== 'cancelled') onError(msg)
    } finally {
      setJob(null)
    }
  }

  const uncovered = useMemo(() => {
    if (!draft) return []
    const covered = new Set(draft.stages.flatMap((s) => s.resources.flatMap((r) => r.covers)))
    return draft.stages.flatMap((s) => s.topics.filter((t) => t.importance === 'rec' && !covered.has(t.key)).map((t) => t.title))
  }, [draft])

  /* ---------------------------------------------------------- running -- */
  if (job) {
    return (
      <Page title={draft ? 'Revising…' : 'Researching…'}>
        <div className="card">
          <p className="lede">{ai} is searching the web on this Mac. {deep ? 'Deep research usually takes 5 to 15 minutes.' : 'This usually takes 2 to 5 minutes.'} <strong>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</strong></p>
          <ol className="log" aria-live="polite">
            {log.length === 0 && <li className="empty">Planning the roadmap…</li>}
            {log.map((p, i) => <li key={i}><span className="pill">{p.kind === 'search' ? 'Search' : 'Read'}</span> {p.text}</li>)}
          </ol>
          <button type="button" className="btn btn--ghost" onClick={() => void cancelAi(job)}>Cancel</button>
        </div>
      </Page>
    )
  }

  /* ------------------------------------------------------------ brief -- */
  if (!draft) {
    const cli = status?.[provider]
    const ready = cli?.installed && cli.logged_in !== false
    return (
      <Page title="New roadmap">
        <form className="card" onSubmit={(e) => { e.preventDefault(); if (goal.trim()) void research(createPrompt(goal.trim(), background.trim(), deep)) }}>
          <label className="field">
            <span>What do you want to learn?</span>
            <textarea className="input input--area" rows={3} required value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. Become a staff-level data engineer on the modern data stack" />
          </label>
          <label className="field">
            <span>Where are you starting from? (optional)</span>
            <textarea className="input input--area" rows={2} value={background} onChange={(e) => setBackground(e.target.value)} placeholder="e.g. 4 years backend in TypeScript, comfortable with SQL, ~6 hours a week" />
          </label>
          <label className="check">
            <input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} />
            <span><strong>Deep research.</strong> Compares more candidates and opens them to check they're current. Slower, and uses more of your {ai} plan's allowance.</span>
          </label>
          <p className="empty" style={{ marginBottom: 12 }}>Using <strong>{CLI_LABEL[provider]}</strong>, model <strong>{model || 'its default'}</strong>. <button type="button" className="linkish" style={{ display: 'inline', minHeight: 0 }} onClick={() => go({ page: 'settings' })}>Change in Settings</button></p>
          <AiBadge status={status} provider={provider} />
          <div className="dialog__actions">
            <button type="submit" className="btn" disabled={!ready}>Research it</button>
            <button type="button" className="btn btn--ghost" onClick={() => setDraft({ title: 'Untitled roadmap', description: '', stages: [blankStage()] })}>Start blank instead</button>
          </div>
        </form>
      </Page>
    )
  }

  /* ----------------------------------------------------------- review -- */
  const patchStage = (si: number, fn: (s: DraftStage) => DraftStage) =>
    setDraft({ ...draft, stages: draft.stages.map((s, i) => (i === si ? fn(s) : s)) })
  const moveStage = (si: number, dir: -1 | 1) => {
    const stages = [...draft.stages]
    const [s] = stages.splice(si, 1)
    stages.splice(si + dir, 0, s)
    setDraft({ ...draft, stages })
  }
  type ListKey = 'topics' | 'resources'
  const moveWithin = (si: number, list: ListKey, i: number, dir: -1 | 1) =>
    patchStage(si, (s) => {
      const arr = [...s[list]] as DraftStage[ListKey]
      const [x] = arr.splice(i, 1)
      arr.splice(i + dir, 0, x as never)
      return { ...s, [list]: arr }
    })
  const moveToStage = (si: number, list: ListKey, i: number, to: number) => {
    const moving = draft.stages[si][list][i]
    setDraft({
      ...draft,
      stages: draft.stages.map((s, idx) =>
        idx === si ? { ...s, [list]: s[list].filter((_, j) => j !== i) }
        : idx === to ? { ...s, [list]: [...s[list], moving] }
        : s),
    })
  }
  const removeTopic = (si: number, i: number) => {
    const key = draft.stages[si].topics[i].key
    setDraft({
      ...draft,
      stages: draft.stages.map((s, idx) => ({
        ...s,
        topics: idx === si ? s.topics.filter((_, j) => j !== i) : s.topics,
        resources: s.resources.map((r) => ({ ...r, covers: r.covers.filter((k) => k !== key), primary_for: r.primary_for.filter((k) => k !== key) })),
      })),
    })
  }
  const topicTitle = new Map(draft.stages.flatMap((s) => s.topics.map((t) => [t.key, t.title] as const)))
  const counts = { t: draft.stages.reduce((n, s) => n + s.topics.length, 0), r: draft.stages.reduce((n, s) => n + s.resources.length, 0) }
  const canAi = status?.[provider]?.installed && status[provider].logged_in !== false

  return (
    <Page title="Review your roadmap">
      <div className="card">
        <p className="lede">Nothing is saved yet. Remove, reorder or move anything, ask {ai} for changes, then save. <strong>{draft.stages.length} stages · {counts.t} topics · {counts.r} resources</strong></p>
        <label className="field"><span>Title</span><input className="input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
        <label className="field"><span>Description</span><textarea className="input input--area" rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
        {uncovered.length > 0 && (
          <p className="notice notice--warn">No resource covers: {uncovered.slice(0, 6).join(', ')}{uncovered.length > 6 ? ` and ${uncovered.length - 6} more` : ''}. You can save anyway, or ask {ai} to find resources for them.</p>
        )}
      </div>

      <form className="card" onSubmit={(e) => { e.preventDefault(); if (ask.trim()) void research(revisePrompt(draft, ask.trim())) }}>
        <label className="field">
          <span>Ask {ai} to change it</span>
          <textarea className="input input--area" rows={2} value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="e.g. Add a stage on streaming with Kafka. Swap paid courses for free ones where you can." />
        </label>
        <div className="dialog__actions">
          <button type="submit" className="btn" disabled={!canAi || !ask.trim()}>Revise</button>
          <button type="button" className="btn btn--ghost" disabled={!canAi} onClick={() => void research(revisePrompt(draft, 'Regenerate the whole roadmap from scratch for the same goal. Fix weak stage ordering, thin stages, outdated resources and any topic without a good resource. You may change keys.'))}>Regenerate everything</button>
        </div>
        {!canAi && <AiBadge status={status} provider={provider} />}
      </form>

      {draft.stages.map((s, si) => (
        <section className="card" key={s.key}>
          <div className="stagehead">
            <span className="pill">{si + 1}</span>
            <input className="input input--title" value={s.title} onChange={(e) => patchStage(si, (x) => ({ ...x, title: e.target.value }))} aria-label="Stage title" />
            <input className="input input--pace" value={s.pace} onChange={(e) => patchStage(si, (x) => ({ ...x, pace: e.target.value }))} aria-label="Pace" placeholder="Pace" />
          </div>
          {s.description && <p className="empty">{s.description}</p>}
          <div className="rowactions">
            <button type="button" className="mini" disabled={si === 0} onClick={() => moveStage(si, -1)}>↑ Stage</button>
            <button type="button" className="mini" disabled={si === draft.stages.length - 1} onClick={() => moveStage(si, 1)}>↓ Stage</button>
            <button type="button" className="mini" disabled={!canAi} onClick={() => setAsk(`Add 2 to 4 more topics to the stage "${s.title}", with resources that cover them.`)}>+ More topics (AI)</button>
            <button type="button" className="mini" disabled={!canAi} onClick={() => setAsk(`Regenerate only the stage "${s.title}": rethink its topics and find better resources. Leave every other stage as it is.`)}>Regenerate stage (AI)</button>
            <button type="button" className="mini" onClick={() => setDraft({ ...draft, stages: draft.stages.filter((_, i) => i !== si) })}>Delete stage</button>
          </div>

          <h4>Topics</h4>
          <ul className="draftlist">
            {s.topics.map((t, i) => (
              <li key={t.key} data-type={t.importance}>
                <div className="draftlist__main"><strong>{t.title}</strong><span className="linklist__sub">{IMPORTANCE_LABEL[t.importance]} · {t.description}</span></div>
                <RowTools stages={draft.stages} si={si} i={i} n={s.topics.length}
                  onMove={(d) => moveWithin(si, 'topics', i, d)} onStage={(to) => moveToStage(si, 'topics', i, to)} onDelete={() => removeTopic(si, i)} />
              </li>
            ))}
          </ul>
          <button type="button" className="mini" onClick={() => patchStage(si, (x) => ({ ...x, topics: [...x.topics, { key: newKey('t'), title: 'New topic', description: '', importance: 'rec' }] }))}>+ Topic</button>

          <h4>Resources</h4>
          <ul className="draftlist">
            {s.resources.map((r, i) => (
              <li key={r.key} data-type={r.importance}>
                <div className="draftlist__main">
                  <strong>{r.title}</strong>
                  <span className="linklist__sub">{[KIND_LABEL[r.kind], r.provider, r.cost, r.duration].filter(Boolean).join(' · ')}</span>
                  {r.covers.length > 0 && <span className="linklist__sub">Covers: {r.covers.map((k) => `${r.primary_for.includes(k) ? '★ ' : ''}${topicTitle.get(k) ?? k}`).join(', ')}</span>}
                  {r.url && <button type="button" className="linkish" onClick={() => void openExternal(r.url)}>{r.url}</button>}
                </div>
                <RowTools stages={draft.stages} si={si} i={i} n={s.resources.length}
                  onMove={(d) => moveWithin(si, 'resources', i, d)} onStage={(to) => moveToStage(si, 'resources', i, to)}
                  onDelete={() => patchStage(si, (x) => ({ ...x, resources: x.resources.filter((_, j) => j !== i) }))} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      <button type="button" className="btn btn--ghost" onClick={() => setDraft({ ...draft, stages: [...draft.stages, blankStage()] })}>+ Add a stage</button>

      <div className="savebar">
        <button type="button" className="btn btn--ghost" onClick={() => { setDraft(null); setGoal('') }}>Discard</button>
        <button type="button" className="btn" disabled={saving || !draft.stages.length} onClick={async () => {
          setSaving(true)
          try {
            const id = await saveDraft(draft)
            setDraft(null)
            go({ page: 'roadmap', id, view: 'topics', target: null })
          } catch (e) { onError(e instanceof Error ? e.message : String(e)) } finally { setSaving(false) }
        }}>{saving ? 'Saving…' : 'Save roadmap'}</button>
      </div>
    </Page>
  )
}

const blankStage = (): DraftStage => ({ key: newKey('s'), title: 'New stage', pace: '', description: '', milestone: '', topics: [], resources: [] })

function Page({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="page">
      <header className="pagehead">
        <button type="button" className="iconbtn" onClick={() => go({ page: 'home' })}>← Roadmaps</button>
        <h1>{title}</h1>
      </header>
      <main className="page__body page__body--narrow">{children}</main>
    </div>
  )
}

function RowTools({ stages, si, i, n, onMove, onStage, onDelete }: {
  stages: DraftStage[]; si: number; i: number; n: number
  onMove: (d: -1 | 1) => void; onStage: (to: number) => void; onDelete: () => void
}) {
  return (
    <div className="rowactions">
      <button type="button" className="mini" disabled={i === 0} onClick={() => onMove(-1)} aria-label="Move up">↑</button>
      <button type="button" className="mini" disabled={i === n - 1} onClick={() => onMove(1)} aria-label="Move down">↓</button>
      <select className="mini" value={si} onChange={(e) => onStage(Number(e.target.value))} aria-label="Move to stage">
        {stages.map((s, idx) => <option key={s.key} value={idx}>{idx + 1}. {s.title.slice(0, 28)}</option>)}
      </select>
      <button type="button" className="mini" onClick={onDelete} aria-label="Delete">✕</button>
    </div>
  )
}

export function AiBadge({ status, provider }: { status: AiStatus | null; provider: Provider }) {
  const name = CLI_LABEL[provider]
  const cli = status?.[provider]
  const signIn = provider === 'claude' ? 'claude' : 'codex login'
  if (!status || !cli) return <p className="notice notice--warn">Checking for {name}…</p>
  if (!cli.installed) return <p className="notice notice--warn">{name} isn't installed on this Mac, so research can't run. Install it, run <code>{signIn}</code> once to sign in, then reopen this screen. You can still build a roadmap by hand. See SETUP.md for the two-minute install.</p>
  if (cli.logged_in === false) return <p className="notice notice--warn">{name} is installed but signed out. Run <code>{signIn}</code> in a terminal and sign in with your {PROVIDER_LABEL[provider] === 'Codex' ? 'ChatGPT' : 'Claude'} account.</p>
  return <p className="notice notice--ok">Research runs through {name} on this Mac{cli.account ? ` (${cli.account})` : ''}. No API key, and nothing goes to a server of ours.</p>
}
