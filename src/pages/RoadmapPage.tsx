import { useCallback, useEffect, useMemo, useState } from 'react'
import * as api from '../lib/db'
import { buildLayout, byPosition, nodeInfos, progressOf, stageProgressMap, type Progress } from '../lib/buildLayout'
import { canEdit } from '../lib/platform'
import { go } from '../lib/router'
import { STATUS_LABEL, type Bundle, type NodeInfo, type Status, type View } from '../lib/types'
import { Canvas } from '../components/Canvas'
import { ItemPanel } from '../components/ItemPanel'

interface Props { id: string; view: View; target: string | null; onError: (m: string) => void }

const NEXT: Record<Status, Status> = { todo: 'in_progress', in_progress: 'done', done: 'todo', skipped: 'todo' }

export function RoadmapPage({ id, view, target, onError }: Props) {
  const [bundle, setBundle] = useState<Bundle | null | undefined>(undefined)
  const [showArchived, setShowArchived] = useState(false)
  const [currentStage, setCurrentStage] = useState<string | null>(null)
  const [scrollTarget, setScrollTarget] = useState<{ id: string; nonce: number } | null>(null)
  const [adding, setAdding] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const reload = useCallback(async () => {
    try { setBundle(await api.loadBundle(id)) } catch (e) { onError(e instanceof Error ? e.message : String(e)) }
  }, [id, onError])
  useEffect(() => { setBundle(undefined); void reload() }, [reload])
  useEffect(() => { if (target) setScrollTarget({ id: target, nonce: Date.now() }) }, [target, view])

  const stages = useMemo(() => (bundle ? buildLayout(bundle, view, showArchived) : []), [bundle, view, showArchived])
  const items = useMemo(() => (bundle ? nodeInfos(bundle, view) : new Map<string, NodeInfo>()), [bundle, view])
  const stageProgress = useMemo(() => (bundle ? stageProgressMap(bundle, view) : new Map<string, Progress>()), [bundle, view])

  if (bundle === undefined) return <div className="page"><p className="empty pad">Loading…</p></div>
  if (bundle === null) {
    return <div className="page"><div className="pad"><p className="empty">That roadmap doesn't exist, or isn't yours.</p><button type="button" className="btn" onClick={() => go({ page: 'home' })}>← Roadmaps</button></div></div>
  }

  const overall = { topics: progressOf(bundle.topics), resources: progressOf(bundle.resources) }
  const archivedCount = [...bundle.topics, ...bundle.resources].filter((i) => i.archived_at).length
  const table: api.ItemTable = view === 'topics' ? 'topics' : 'resources'
  const open = (t: string | null, v: View = view) => go({ page: 'roadmap', id, view: v, target: t }, true)

  const cycle = (itemId: string) => {
    const item = (view === 'topics' ? bundle.topics : bundle.resources).find((i) => i.id === itemId)
    if (!item || item.archived_at) return
    // Optimistic: the tag flips now, the write follows.
    const status = NEXT[item.status]
    setBundle({ ...bundle, [table]: (bundle[table] as typeof item[]).map((i) => (i.id === itemId ? { ...i, status } : i)) })
    api.setStatus(table, [itemId], status).catch((e) => { onError(e.message); void reload() })
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header__row">
          <button type="button" className="iconbtn" onClick={() => go({ page: 'home' })} aria-label="Back to all roadmaps">←</button>
          <div className="brand"><span className="brand__mark">{bundle.roadmap.title}</span></div>
          {archivedCount > 0 && (
            <label className="toggle"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Archived ({archivedCount})</label>
          )}
          {canEdit && <button type="button" className="iconbtn" onClick={() => setAdding(true)}>+ Add</button>}
          {canEdit && (confirmDelete ? (
            <>
              <button type="button" className="iconbtn iconbtn--danger" onClick={() => void api.deleteRoadmap(id).then(() => go({ page: 'home' })).catch((e) => onError(e.message))}>Really delete</button>
              <button type="button" className="iconbtn" onClick={() => setConfirmDelete(false)}>Keep</button>
            </>
          ) : <button type="button" className="iconbtn" onClick={() => setConfirmDelete(true)} aria-label="Delete roadmap">🗑</button>)}
        </div>
        <div className="tabs" role="tablist" aria-label="View">
          {(['topics', 'resources'] as View[]).map((v) => (
            <button key={v} type="button" role="tab" className="tab" aria-selected={view === v} onClick={() => open(null, v)}>
              {v === 'topics' ? 'Topics' : 'Resources'} <span className="tab__count">{overall[v].done}/{overall[v].counted}</span>
            </button>
          ))}
          <div className="progress">
            <div className="progress__bar" role="img" aria-label={`${overall[view].pct}% done`}><div className="progress__fill" style={{ width: `${overall[view].pct}%` }} /></div>
            <span>{overall[view].pct}%</span>
          </div>
        </div>
        <nav className="minimap" aria-label="Jump to stage">
          {stages.map((s, i) => {
            const p = stageProgress.get(s.id)
            return (
              <button key={s.id} type="button" className="minimap__dot" data-status={p?.status} aria-current={currentStage === s.id}
                title={`${i + 1}. ${s.title}`} aria-label={`Stage ${i + 1}, ${s.title}. ${STATUS_LABEL[p?.status ?? 'todo']}.`}
                onClick={() => setScrollTarget({ id: s.id, nonce: Date.now() })} />
            )
          })}
        </nav>
      </header>

      {stages.length === 0 ? <p className="empty pad">This roadmap has no stages yet.</p> : (
        <Canvas key={`${id}:${view}`} view={view} title={bundle.roadmap.title}
          subtitle={view === 'topics' ? 'What to learn, in order.' : 'Courses, docs, posts and projects for each stage.'}
          stages={stages} items={items} stageProgress={stageProgress} highlightId={target}
          onOpen={(t) => open(t)} onCycle={canEdit ? cycle : undefined} onVisibleStage={setCurrentStage} scrollTarget={scrollTarget} />
      )}

      {target && (
        <ItemPanel bundle={bundle} targetId={target} onClose={() => open(null)} onChanged={reload} onError={onError}
          onNavigate={(t) => open(t, bundle.resources.some((r) => r.id === t) ? 'resources' : bundle.topics.some((x) => x.id === t) ? 'topics' : view)} />
      )}


      {adding && (
        <AddDialog bundle={bundle} view={view} onClose={() => setAdding(false)} onError={onError}
          onAdded={async (newId) => { setAdding(false); await reload(); open(newId) }} />
      )}
    </div>
  )
}

function AddDialog({ bundle, view, onClose, onAdded, onError }: {
  bundle: Bundle; view: View; onClose: () => void; onAdded: (id: string) => Promise<void>; onError: (m: string) => void
}) {
  const stages = [...bundle.stages].sort(byPosition)
  const [title, setTitle] = useState('')
  const [stageId, setStageId] = useState(stages[0]?.id ?? '')
  const noun = view === 'topics' ? 'topic' : 'resource'
  return (
    <>
      <button className="scrim" aria-label="Close" onClick={onClose} tabIndex={-1} />
      <form className="dialog" role="dialog" aria-modal="true" aria-label={`Add a ${noun}`} onSubmit={async (e) => {
        e.preventDefault()
        const list = view === 'topics' ? bundle.topics : bundle.resources
        const position = Math.max(-1, ...list.filter((i) => i.stage_id === stageId).map((i) => i.position)) + 1
        try {
          const row = view === 'topics'
            ? await api.addTopic(bundle.roadmap.id, stageId, position, title.trim())
            : await api.addResource(bundle.roadmap.id, stageId, position, title.trim())
          await onAdded(row.id)
        } catch (err) { onError(err instanceof Error ? err.message : String(err)) }
      }}>
        <h2>Add a {noun}</h2>
        <label className="field"><span>Title</span><input className="input" autoFocus required value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="field"><span>Stage</span>
          <select className="input" value={stageId} onChange={(e) => setStageId(e.target.value)}>{stages.map((s, i) => <option key={s.id} value={s.id}>{i + 1}. {s.title}</option>)}</select>
        </label>
        <div className="dialog__actions"><button type="submit" className="btn">Add</button><button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button></div>
      </form>
    </>
  )
}
