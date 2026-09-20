import { useEffect, useRef, useState } from 'react'
import * as api from '../lib/db'
import type { ItemTable } from '../lib/db'
import { byPosition } from '../lib/buildLayout'
import { canEdit, openExternal } from '../lib/platform'
import {
  IMPORTANCE_LABEL, KINDS, KIND_LABEL, STATUS_LABEL, STATUS_ORDER,
  type Bundle, type Importance, type ItemFile, type ItemLink, type Resource, type ResourceKind, type Status, type Topic,
} from '../lib/types'
import { Markdown } from './Markdown'

interface Props {
  bundle: Bundle
  targetId: string
  onClose: () => void
  onNavigate: (id: string) => void
  /** Re-read the roadmap after a change. */
  onChanged: () => Promise<void>
  onError: (msg: string) => void
}

export function ItemPanel({ bundle, targetId, onClose, onNavigate, onChanged, onError }: Props) {
  const topic = bundle.topics.find((t) => t.id === targetId)
  const resource = bundle.resources.find((r) => r.id === targetId)
  const stage = bundle.stages.find((s) => s.id === targetId)
  const item: Topic | Resource | undefined = topic ?? resource
  const table: ItemTable = topic ? 'topics' : 'resources'

  const closeRef = useRef<HTMLButtonElement>(null)
  const [editing, setEditing] = useState(false)
  const [editNotes, setEditNotes] = useState(false)
  const [notes, setNotes] = useState('')
  const [extras, setExtras] = useState<{ links: ItemLink[]; files: ItemFile[] }>({ links: [], files: [] })
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [askCover, setAskCover] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    closeRef.current?.focus()
    setEditing(false); setEditNotes(false); setConfirmDelete(false); setAskCover(null)
    setNotes(item?.notes_md ?? '')
    setExtras({ links: [], files: [] })
    if (item) api.loadExtras(table, item.id).then(setExtras).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLTextAreaElement)) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const run = async (fn: () => Promise<unknown>, reloadExtras = false) => {
    setBusy(true)
    try {
      await fn()
      await onChanged()
      if (reloadExtras && item) setExtras(await api.loadExtras(table, item.id))
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!item && !stage) return null

  /* ------------------------------------------------------------- stage -- */
  if (stage) {
    const index = [...bundle.stages].sort(byPosition).findIndex((s) => s.id === stage.id)
    const rows = (list: (Topic | Resource)[]) =>
      list.filter((i) => i.stage_id === stage.id && !i.archived_at).sort(byPosition)
    return (
      <Shell kicker={`Stage ${index + 1}${stage.pace ? ` · ${stage.pace}` : ''}`} title={stage.title} onClose={onClose} closeRef={closeRef}>
        {stage.description && <p className="panel__desc">{stage.description}</p>}
        {stage.milestone && <p className="panel__analogy">Milestone: {stage.milestone}</p>}
        <Section title={`Topics (${rows(bundle.topics).length})`}>
          <RowList items={rows(bundle.topics)} onNavigate={onNavigate} />
        </Section>
        <Section title={`Resources (${rows(bundle.resources).length})`}>
          <RowList items={rows(bundle.resources)} onNavigate={onNavigate} />
        </Section>
      </Shell>
    )
  }

  /* -------------------------------------------------------------- item -- */
  const it = item!
  const linked = topic
    ? bundle.links.filter((l) => l.topic_id === it.id)
    : bundle.links.filter((l) => l.resource_id === it.id)
  const linkedItems = linked
    .map((l) => ({
      link: l,
      other: topic ? bundle.resources.find((r) => r.id === l.resource_id) : bundle.topics.find((t) => t.id === l.topic_id),
    }))
    .filter((x): x is { link: typeof linked[number]; other: Topic | Resource } => Boolean(x.other))
    .sort((a, b) => Number(b.link.is_primary) - Number(a.link.is_primary))
  const linkable = (topic ? bundle.resources : bundle.topics).filter(
    (o) => !o.archived_at && !linkedItems.some((x) => x.other.id === o.id),
  )
  const siblings = (topic ? bundle.topics : bundle.resources).filter((i) => i.stage_id === it.stage_id).sort(byPosition)
  const at = siblings.findIndex((i) => i.id === it.id)

  const changeStatus = (s: Status) => {
    void run(() => api.setStatus(table, [it.id], s))
    if (s === 'done' && resource) {
      const pending = linkedItems.filter((x) => x.other.status !== 'done').map((x) => x.other.id)
      setAskCover(pending.length ? pending : null)
    } else setAskCover(null)
  }
  const swap = (dir: -1 | 1) => {
    const other = siblings[at + dir]
    if (!other) return
    void run(async () => {
      await api.updateItem(table, it.id, { position: other.position })
      await api.updateItem(table, other.id, { position: it.position === other.position ? it.position - dir : it.position })
    })
  }

  return (
    <Shell
      kicker={`${resource ? `${KIND_LABEL[resource.kind]} · ` : ''}${IMPORTANCE_LABEL[it.importance]}${it.archived_at ? ' · Archived' : ''}`}
      title={it.title}
      onClose={onClose}
      closeRef={closeRef}
    >
      {resource && (
        <ul className="meta">
          {[resource.provider, resource.cost, resource.duration].filter(Boolean).map((m) => <li key={m}>{m}</li>)}
        </ul>
      )}
      {it.description && <p className="panel__desc">{it.description}</p>}
      {resource?.url && (
        <button type="button" className="btn btn--wide" onClick={() => void openExternal(resource.url!)}>
          Open {KIND_LABEL[resource.kind].toLowerCase()} ↗
        </button>
      )}

      <div style={{ height: 14 }} />
      {canEdit ? (
        <div className="segmented" role="group" aria-label="Status">
          {STATUS_ORDER.map((s) => (
            <button key={s} type="button" data-status={s} aria-pressed={it.status === s} disabled={busy} onClick={() => changeStatus(s)}>
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      ) : (
        <span className="tag" data-status={it.status}>{STATUS_LABEL[it.status]}</span>
      )}
      {askCover && (
        <div className="notice notice--warn" role="status">
          <p style={{ margin: '0 0 8px', color: 'inherit' }}>Mark the {askCover.length} topic{askCover.length > 1 ? 's' : ''} it covers as done too?</p>
          <div className="dialog__actions">
            <button type="button" className="btn" onClick={() => { void run(() => api.setStatus('topics', askCover, 'done')); setAskCover(null) }}>Yes</button>
            <button type="button" className="btn btn--ghost" onClick={() => setAskCover(null)}>No</button>
          </div>
        </div>
      )}

      <Section title={topic ? 'Learn it with' : 'Topics this covers'}>
        {linkedItems.length === 0 && <p className="empty">{topic ? 'Nothing linked yet.' : 'Not linked to any topic yet.'}</p>}
        <ul className="linklist">
          {linkedItems.map(({ link, other }) => (
            <li key={other.id} className="linkrow">
              <button type="button" onClick={() => onNavigate(other.id)}>
                <span className="linklist__title">
                  {link.is_primary && <span className="pill">Main</span>} {other.title}
                  {'provider' in other && <span className="linklist__sub">{KIND_LABEL[other.kind]}{other.provider ? ` · ${other.provider}` : ''}</span>}
                </span>
                <span className="tag" data-status={other.status}>{STATUS_LABEL[other.status]}</span>
              </button>
              {canEdit && (
                <span className="linkrow__actions">
                  {!link.is_primary && (
                    <button type="button" className="mini" title="Make this the main one" onClick={() => void run(() => api.setPrimary(link.topic_id, link.resource_id))}>★</button>
                  )}
                  <button type="button" className="mini" title="Unlink" onClick={() => void run(() => api.unlinkTopicResource(link.topic_id, link.resource_id))}>✕</button>
                </span>
              )}
            </li>
          ))}
        </ul>
        {canEdit && linkable.length > 0 && (
          <select
            className="input"
            value=""
            aria-label={topic ? 'Link a resource' : 'Link a topic'}
            onChange={(e) => {
              const id = e.target.value
              if (id) void run(() => (topic ? api.linkTopicResource(it.id, id) : api.linkTopicResource(id, it.id)))
            }}
          >
            <option value="">{topic ? '+ Link a resource…' : '+ Link a topic…'}</option>
            {linkable.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
          </select>
        )}
      </Section>

      <Section title="Links">
        <ul className="linklist">
          {extras.links.map((l) => (
            <li key={l.id} className="linkrow">
              <button type="button" onClick={() => void openExternal(l.url)}>
                <span className="linklist__title">{l.label || l.url}<span className="linklist__sub">{l.url}</span></span>↗
              </button>
              {canEdit && <span className="linkrow__actions"><button type="button" className="mini" title="Remove" onClick={() => void run(() => api.removeLink(l.id), true)}>✕</button></span>}
            </li>
          ))}
        </ul>
        {extras.links.length === 0 && !canEdit && <p className="empty">None.</p>}
        {canEdit && <AddLink onAdd={(url, label) => run(() => api.addLink(table, it.id, url, label), true)} />}
      </Section>

      <Section title="Notes">
        {editNotes ? (
          <>
            <textarea className="input input--area" rows={8} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Markdown works here." />
            <div className="dialog__actions">
              <button type="button" className="btn" disabled={busy} onClick={() => void run(() => api.updateItem(table, it.id, { notes_md: notes })).then(() => setEditNotes(false))}>Save notes</button>
              <button type="button" className="btn btn--ghost" onClick={() => { setNotes(it.notes_md); setEditNotes(false) }}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            {it.notes_md ? <Markdown source={it.notes_md} /> : <p className="empty">No notes yet.</p>}
            {canEdit && <button type="button" className="btn btn--ghost" onClick={() => setEditNotes(true)}>{it.notes_md ? 'Edit notes' : 'Add notes'}</button>}
          </>
        )}
      </Section>

      <Section title="Files">
        <ul className="linklist">
          {extras.files.map((f) => (
            <li key={f.id} className="linkrow">
              <button type="button" onClick={() => void api.fileUrl(f).then(openExternal).catch((e) => onError(String(e.message ?? e)))}>
                <span className="linklist__title">{f.name}<span className="linklist__sub">{(f.size_bytes / 1024).toFixed(0)} KB</span></span>↗
              </button>
              {canEdit && <span className="linkrow__actions"><button type="button" className="mini" title="Remove" onClick={() => void run(() => api.removeFile(f), true)}>✕</button></span>}
            </li>
          ))}
        </ul>
        {extras.files.length === 0 && <p className="empty">No files.</p>}
        {canEdit && (
          <label className="btn btn--ghost filebtn">
            Attach a file (10 MB max)
            <input
              type="file"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (!f) return
                if (f.size > 10 * 1024 * 1024) return onError('That file is over 10 MB.')
                void run(() => api.uploadFile(table, it.id, f), true)
              }}
            />
          </label>
        )}
      </Section>

      {canEdit && (
        <Section title="Organise">
          {editing ? (
            <EditForm item={it} isResource={Boolean(resource)} onCancel={() => setEditing(false)}
              onSave={(patch) => run(() => api.updateItem(table, it.id, patch)).then(() => setEditing(false))} />
          ) : (
            <>
              <label className="field">
                <span>Stage</span>
                <select className="input" value={it.stage_id} disabled={busy}
                  onChange={(e) => void run(() => api.updateItem(table, it.id, { stage_id: e.target.value, position: Date.now() / 1e6 }))}>
                  {[...bundle.stages].sort(byPosition).map((s, i) => <option key={s.id} value={s.id}>{i + 1}. {s.title}</option>)}
                </select>
              </label>
              <div className="dialog__actions">
                <button type="button" className="btn btn--ghost" disabled={busy || at <= 0} onClick={() => swap(-1)}>Move earlier</button>
                <button type="button" className="btn btn--ghost" disabled={busy || at >= siblings.length - 1} onClick={() => swap(1)}>Move later</button>
                <button type="button" className="btn btn--ghost" onClick={() => setEditing(true)}>Edit details</button>
                <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void run(() => api.setArchived(table, it.id, !it.archived_at))}>
                  {it.archived_at ? 'Unarchive' : 'Archive'}
                </button>
                {confirmDelete ? (
                  <>
                    <button type="button" className="btn btn--danger" disabled={busy} onClick={() => void run(() => api.deleteItem(table, it.id)).then(onClose)}>Really delete</button>
                    <button type="button" className="btn btn--ghost" onClick={() => setConfirmDelete(false)}>Keep</button>
                  </>
                ) : (
                  <button type="button" className="btn btn--ghost" onClick={() => setConfirmDelete(true)}>Delete…</button>
                )}
              </div>
              <p className="empty" style={{ marginTop: 8, fontSize: 12 }}>Archiving hides it and takes it out of your stats, but keeps your notes and files. Deleting is permanent.</p>
            </>
          )}
        </Section>
      )}
    </Shell>
  )
}

/* ------------------------------------------------------------------ bits -- */

function Shell({ kicker, title, onClose, closeRef, children }: {
  kicker: string; title: string; onClose: () => void; closeRef: React.RefObject<HTMLButtonElement>; children: React.ReactNode
}) {
  return (
    <>
      <button className="scrim" aria-label="Close details" onClick={onClose} tabIndex={-1} />
      <div className="panel" role="dialog" aria-modal="true" aria-label={title}>
        <div className="panel__head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="panel__kicker">{kicker}</div>
            <h2 className="panel__title">{title}</h2>
          </div>
          <button ref={closeRef} type="button" className="iconbtn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="panel__body">{children}</div>
      </div>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="panel__section"><h3>{title}</h3>{children}</section>
}

function RowList({ items, onNavigate }: { items: (Topic | Resource)[]; onNavigate: (id: string) => void }) {
  if (!items.length) return <p className="empty">None.</p>
  return (
    <ul className="linklist">
      {items.map((i) => (
        <li key={i.id}>
          <button type="button" onClick={() => onNavigate(i.id)}>
            <span className="linklist__title">{i.title}</span>
            <span className="tag" data-status={i.status}>{STATUS_LABEL[i.status]}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function AddLink({ onAdd }: { onAdd: (url: string, label: string) => Promise<unknown> }) {
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (!/^https?:\/\//i.test(url.trim())) return
        void onAdd(url.trim(), label.trim()).then(() => { setUrl(''); setLabel('') })
      }}
    >
      <input className="input" type="url" inputMode="url" required placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Link address" />
      <input className="input" placeholder="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Link label" />
      <button type="submit" className="btn btn--ghost">Add link</button>
    </form>
  )
}

function EditForm({ item, isResource, onSave, onCancel }: {
  item: Topic | Resource; isResource: boolean
  onSave: (patch: Record<string, unknown>) => Promise<unknown>; onCancel: () => void
}) {
  const r = item as Resource
  const [f, setF] = useState({
    title: item.title, description: item.description, importance: item.importance as Importance,
    kind: (r.kind ?? 'course') as ResourceKind, provider: r.provider ?? '', url: r.url ?? '', cost: r.cost ?? '', duration: r.duration ?? '',
  })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  return (
    <form onSubmit={(e) => {
      e.preventDefault()
      const base = { title: f.title.trim() || item.title, description: f.description, importance: f.importance }
      void onSave(isResource ? { ...base, kind: f.kind, provider: f.provider, url: f.url.trim() || null, cost: f.cost, duration: f.duration } : base)
    }}>
      <label className="field"><span>Title</span><input className="input" value={f.title} onChange={set('title')} required /></label>
      <label className="field"><span>Description</span><textarea className="input input--area" rows={3} value={f.description} onChange={set('description')} /></label>
      <label className="field"><span>Importance</span>
        <select className="input" value={f.importance} onChange={set('importance')}>
          {(Object.keys(IMPORTANCE_LABEL) as Importance[]).map((k) => <option key={k} value={k}>{IMPORTANCE_LABEL[k]}</option>)}
        </select>
      </label>
      {isResource && (
        <>
          <label className="field"><span>Kind</span>
            <select className="input" value={f.kind} onChange={set('kind')}>{KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select>
          </label>
          <label className="field"><span>Link</span><input className="input" type="url" inputMode="url" value={f.url} onChange={set('url')} placeholder="https://…" /></label>
          <label className="field"><span>Provider</span><input className="input" value={f.provider} onChange={set('provider')} /></label>
          <div className="two">
            <label className="field"><span>Cost</span><input className="input" value={f.cost} onChange={set('cost')} /></label>
            <label className="field"><span>Duration</span><input className="input" value={f.duration} onChange={set('duration')} /></label>
          </div>
        </>
      )}
      <div className="dialog__actions">
        <button type="submit" className="btn">Save</button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}
