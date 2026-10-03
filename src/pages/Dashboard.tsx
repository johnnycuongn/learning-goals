import { useEffect, useMemo, useState } from 'react'
import { loadDashboard, saveDraft, type DashboardData } from '../lib/db'
import { progressOf } from '../lib/buildLayout'
import { canEdit, openExternal } from '../lib/platform'
import { go } from '../lib/router'
import { KIND_LABEL } from '../lib/types'
import { BriefingCard } from '../components/BriefingCard'

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
    const roadmapById = new Map(data.roadmaps.map((r) => [r.id, r]))
    const newest = (a: { status_changed_at: string | null }, b: { status_changed_at: string | null }) =>
      (b.status_changed_at ?? '').localeCompare(a.status_changed_at ?? '')
    const inProgressTopics = topics
      .filter((t) => t.status === 'in_progress' && !t.archived_at)
      .sort(newest)
      .map((t) => ({
        topic: t,
        roadmap: roadmapById.get(t.roadmap_id)!,
        refs: data.links
          .filter((l) => l.topic_id === t.id)
          .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
          .map((l) => ({ ...l, resource: resourceById.get(l.resource_id) }))
          .filter((l) => l.resource && !l.resource.archived_at),
      }))
    const inProgressResources = data.resources
      .filter((r) => live.has(r.roadmap_id) && r.status === 'in_progress' && !r.archived_at)
      .sort(newest)
      .map((r) => ({ resource: r, roadmap: roadmapById.get(r.roadmap_id)! }))
    const where = new Map<string, { roadmap: string; view: 'topics' | 'resources' }>()
    for (const t of topics) where.set(t.id, { roadmap: t.roadmap_id, view: 'topics' })
    for (const r of data.resources) if (live.has(r.roadmap_id)) where.set(r.id, { roadmap: r.roadmap_id, view: 'resources' })
    return { cards, inProgressTopics, inProgressResources, where, overall: progressOf(topics) }
  }, [data])

  return (
    <div className="page">
      <header className="pagehead">
        <h1>Learning Goals</h1>
        {canEdit && <button type="button" className="btn" onClick={() => go({ page: 'new' })}>+ New roadmap</button>}
      </header>
      <main className="page__body">
        {!view && <p className="empty">Loading…</p>}
        {view && (
          <>
            <BriefingCard
              hasRoadmaps={view.cards.length > 0}
              onError={onError}
              locate={(itemId) => {
                const w = view.where.get(itemId)
                return w ? () => go({ page: 'roadmap', id: w.roadmap, view: w.view, target: itemId }) : null
              }}
            />

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

            {(view.inProgressTopics.length > 0 || view.inProgressResources.length > 0) && (
              <section>
                <h2 className="h2">In progress ({view.inProgressTopics.length + view.inProgressResources.length})</h2>
                <ul className="recent">
                  {view.inProgressTopics.map(({ topic, roadmap, refs }) => (
                    <li key={topic.id} className="card">
                      <button type="button" className="recent__topic" onClick={() => go({ page: 'roadmap', id: roadmap.id, view: 'topics', target: topic.id })}>
                        <strong>{topic.title}</strong>
                        <span className="linklist__sub">Topic · {roadmap.title}{started(topic.status_changed_at)}</span>
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
                  {view.inProgressResources.map(({ resource, roadmap }) => (
                    <li key={resource.id} className="card">
                      <button type="button" className="recent__topic" onClick={() => go({ page: 'roadmap', id: roadmap.id, view: 'resources', target: resource.id })}>
                        <strong>{resource.title}</strong>
                        <span className="linklist__sub">{KIND_LABEL[resource.kind]}{resource.provider ? ` · ${resource.provider}` : ''} · {roadmap.title}{started(resource.status_changed_at)}</span>
                      </button>
                      {resource.url && (
                        <div className="recent__refs">
                          <button type="button" className="chip" onClick={() => void openExternal(resource.url!)}>Open<span className="chip__kind">↗</span></button>
                        </div>
                      )}
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

const started = (iso: string | null) => (iso ? ` · started ${new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' })}` : '')

function Stat({ n, label, tone }: { n: number | string; label: string; tone?: 'prog' | 'done' }) {
  return <div className="stat" data-tone={tone}><span className="stat__n">{n}</span><span className="stat__l">{label}</span></div>
}
