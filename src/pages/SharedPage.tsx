import { useEffect, useMemo, useState } from 'react'
import { buildLayout, nodeInfos, progressOf, stageProgressMap, type Progress } from '../lib/buildLayout'
import { loadShared, type SharedRoadmap } from '../lib/db'
import { go } from '../lib/router'
import { useTheme } from '../lib/useTheme'
import { STATUS_LABEL, type NodeInfo, type View } from '../lib/types'
import { Canvas } from '../components/Canvas'
import { ItemPanel } from '../components/ItemPanel'

/** The public, signed-out view of one roadmap. Read-only in every shell. */
export function SharedPage({ token, view, target }: { token: string; view: View; target: string | null }) {
  const [data, setData] = useState<SharedRoadmap | null | undefined>(undefined)
  const [currentStage, setCurrentStage] = useState<string | null>(null)
  const [scrollTarget, setScrollTarget] = useState<{ id: string; nonce: number } | null>(null)
  const { theme, toggle } = useTheme()

  useEffect(() => { setData(undefined); loadShared(token).then(setData).catch(() => setData(null)) }, [token])
  useEffect(() => { if (target) setScrollTarget({ id: target, nonce: Date.now() }) }, [target, view])
  useEffect(() => { if (data) document.title = `${data.bundle.roadmap.title} · My Roadmaps` }, [data])

  const bundle = data?.bundle
  const stages = useMemo(() => (bundle ? buildLayout(bundle, view, false) : []), [bundle, view])
  const items = useMemo(() => (bundle ? nodeInfos(bundle, view) : new Map<string, NodeInfo>()), [bundle, view])
  const stageProgress = useMemo(() => (bundle ? stageProgressMap(bundle, view) : new Map<string, Progress>()), [bundle, view])

  if (data === undefined) return <div className="authwrap"><p className="empty">Loading…</p></div>
  if (!data || !bundle) {
    return (
      <div className="authwrap">
        <div className="card authcard">
          <h1>This link isn't active</h1>
          <p className="lede">The roadmap's owner may have turned sharing off or replaced the link. Ask them for a new one.</p>
        </div>
      </div>
    )
  }

  const showStatus = data.includeStatus
  const overall = { topics: progressOf(bundle.topics), resources: progressOf(bundle.resources) }
  const open = (t: string | null, v: View = view) => go({ page: 'shared', token, view: v, target: t }, true)

  return (
    <div className="app">
      <header className="header">
        <div className="header__row">
          <div className="brand"><span className="brand__mark">{bundle.roadmap.title}</span></div>
          <span className="pill">Shared · view only</span>
          <button type="button" className="iconbtn" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>{theme === 'dark' ? '☀' : '☾'}</button>
        </div>
        <div className="tabs" role="tablist" aria-label="View">
          {(['topics', 'resources'] as View[]).map((v) => (
            <button key={v} type="button" role="tab" className="tab" aria-selected={view === v} onClick={() => open(null, v)}>
              {v === 'topics' ? 'Topics' : 'Resources'}{' '}
              <span className="tab__count">{showStatus ? `${overall[v].done}/${overall[v].counted}` : overall[v].total}</span>
            </button>
          ))}
          {showStatus && (
            <div className="progress">
              <div className="progress__bar" role="img" aria-label={`${overall[view].pct}% done`}><div className="progress__fill" style={{ width: `${overall[view].pct}%` }} /></div>
              <span>{overall[view].pct}%</span>
            </div>
          )}
        </div>
        <nav className="minimap" aria-label="Jump to stage">
          {stages.map((s, i) => {
            const p = stageProgress.get(s.id)
            return (
              <button key={s.id} type="button" className="minimap__dot" data-status={showStatus ? p?.status : undefined} aria-current={currentStage === s.id}
                title={`${i + 1}. ${s.title}`} aria-label={`Stage ${i + 1}, ${s.title}.${showStatus ? ` ${STATUS_LABEL[p?.status ?? 'todo']}.` : ''}`}
                onClick={() => setScrollTarget({ id: s.id, nonce: Date.now() })} />
            )
          })}
        </nav>
      </header>

      <Canvas key={`${token}:${view}`} view={view} title={bundle.roadmap.title}
        subtitle={bundle.roadmap.description || (view === 'topics' ? 'What to learn, in order.' : 'Where to learn it.')}
        stages={stages} items={items} stageProgress={stageProgress} highlightId={target} showStatus={showStatus}
        onOpen={(t) => open(t)} onVisibleStage={setCurrentStage} scrollTarget={scrollTarget} />

      {target && (
        <ItemPanel bundle={bundle} targetId={target} shared={{ showStatus }} onClose={() => open(null)}
          onChanged={async () => undefined} onError={() => undefined}
          onNavigate={(t) => open(t, bundle.resources.some((r) => r.id === t) ? 'resources' : bundle.topics.some((x) => x.id === t) ? 'topics' : view)} />
      )}
    </div>
  )
}
