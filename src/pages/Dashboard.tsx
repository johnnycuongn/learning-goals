import { useEffect, useMemo, useState } from 'react'
import { loadDashboard, saveDraft, type DashboardData } from '../lib/db'
import { progressOf } from '../lib/buildLayout'
import { canEdit, openExternal } from '../lib/platform'
import { go } from '../lib/router'
import { KIND_LABEL } from '../lib/types'

export function Dashboard({ onError }: { onError: (m: string) => void }) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [importing, setImporting] = useState(false)

  const load = () => loadDashboard().then(setData).catch((e) => onError(e.message))
  useEffect(() => { void load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  const view = useMemo(() => {
    if (!data) return null
    const live = new Set(data.roadmaps.map((r) => r.id))
    const topics = data.topics.filter((t) => live.has(t.roadmap_id))
    const cards = data.roadmaps.map((r) => ({
      roadmap: r,
      topics: progressOf(topics.filter((t) => t.roadmap_id === r.id)),
      resources: progressOf(data.resources.filter((x) => x.roadmap_id === r.id)),
    }))
    const resourceById = new Map(data.resources.map((r) => [r.id, r]))
    const recent = topics
      .filter((t) => t.status === 'in_progress' && !t.archived_at)
      .sort((a, b) => (b.status_changed_at ?? '').localeCompare(a.status_changed_at ?? ''))
      .slice(0, 8)
      .map((t) => ({
        topic: t,
        roadmap: data.roadmaps.find((r) => r.id === t.roadmap_id)!,
        refs: data.links
          .filter((l) => l.topic_id === t.id)
          .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
          .map((l) => ({ ...l, resource: resourceById.get(l.resource_id) }))
          .filter((l) => l.resource && !l.resource.archived_at),
      }))
    return { cards, recent, overall: progressOf(topics) }
  }, [data])

  return (
    <div className="page">
      <header className="pagehead">
        <h1>My roadmaps</h1>
        {canEdit && <button type="button" className="btn" onClick={() => go({ page: 'new' })}>+ New roadmap</button>}
      </header>
      <main className="page__body">
        {!view && <p className="empty">Loading…</p>}
        {view && (
          <>
            <div className="stats">
              <Stat n={view.cards.length} label="roadmaps" />
              <Stat n={`${view.overall.pct}%`} label="of all topics done" />
              <Stat n={view.overall.inProgress} label="in progress" tone="prog" />
              <Stat n={view.overall.done} label="done" tone="done" />
            </div>

            {view.cards.length === 0 && (
              <div className="card">
                <p className="lede">No roadmaps yet.</p>
                {canEdit ? (
                  <div className="dialog__actions">
                    <button type="button" className="btn" onClick={() => go({ page: 'new' })}>Research a new one</button>
                    <button type="button" className="btn btn--ghost" disabled={importing} onClick={async () => {
                      setImporting(true)
                      try {
                        const { aiEngineerDraft } = await import('../seed/asDraft')
                        await saveDraft(aiEngineerDraft())
                        await load()
                      } catch (e) { onError(e instanceof Error ? e.message : String(e)) } finally { setImporting(false) }
                    }}>{importing ? 'Importing…' : 'Import the AI Engineer roadmap'}</button>
                  </div>
                ) : <p className="empty">Create one in the desktop app and it will show up here.</p>}
              </div>
            )}

            <div className="grid">
              {view.cards.map(({ roadmap, topics, resources }) => (
                <button key={roadmap.id} type="button" className="card card--link" onClick={() => go({ page: 'roadmap', id: roadmap.id, view: 'topics', target: null })}>
                  <span className="card__title">{roadmap.title}</span>
                  {roadmap.description && <span className="card__desc">{roadmap.description}</span>}
                  <span className="bar" role="img" aria-label={`${topics.pct}% of topics done`}><span style={{ width: `${topics.pct}%` }} /></span>
                  <span className="card__meta">
                    <strong>{topics.pct}%</strong> · {topics.done}/{topics.counted} topics · {resources.done}/{resources.counted} resources
                    {topics.inProgress > 0 && <span className="tag" data-status="in_progress">{topics.inProgress} in progress</span>}
                  </span>
                </button>
              ))}
            </div>

            {view.recent.length > 0 && (
              <section>
                <h2 className="h2">Recently started</h2>
                <ul className="recent">
                  {view.recent.map(({ topic, roadmap, refs }) => (
                    <li key={topic.id} className="card">
                      <button type="button" className="recent__topic" onClick={() => go({ page: 'roadmap', id: roadmap.id, view: 'topics', target: topic.id })}>
                        <strong>{topic.title}</strong>
                        <span className="linklist__sub">{roadmap.title}{topic.status_changed_at ? ` · started ${new Date(topic.status_changed_at).toLocaleDateString()}` : ''}</span>
                      </button>
                      <div className="recent__refs">
                        {refs.length === 0 && <span className="empty">No resources linked.</span>}
                        {refs.map((l) => (
                          <button key={l.resource_id} type="button" className="chip"
                            onClick={() => (l.resource!.url ? void openExternal(l.resource!.url) : go({ page: 'roadmap', id: roadmap.id, view: 'resources', target: l.resource_id }))}>
                            {l.is_primary && '★ '}{l.resource!.title}<span className="chip__kind">{KIND_LABEL[l.resource!.kind]}{l.resource!.url ? ' ↗' : ''}</span>
                          </button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function Stat({ n, label, tone }: { n: number | string; label: string; tone?: 'prog' | 'done' }) {
  return <div className="stat" data-tone={tone}><span className="stat__n">{n}</span><span className="stat__l">{label}</span></div>
}
