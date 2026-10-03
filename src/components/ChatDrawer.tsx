import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import * as api from '../lib/db'
import { applyChanges } from '../lib/applyChanges'
import { cancelAi, chatAi, newKey, runChat, type AiProgress } from '../lib/ai'
import {
  CHAT_SCHEMA, chatPrompt, confirmAsk, preview, toggle, validate, visible,
  type Ask, type Change, type ChatMessage, type Checked, type PlanState, type Preview,
} from '../lib/chat'
import { IMPORTANCE_LABEL, KIND_LABEL, type Bundle } from '../lib/types'

/** A proposal waiting for the person: what is ticked, what they answered, what already landed. */
interface Pending {
  messageId: string
  checked: Checked[]
  asks: Ask[]
  dropped: string[]
  ticked: Set<number>
  answers: Map<number, 'yes' | 'no'>
  applied: Set<number>
  skipped: Set<number>
  note: string | null
}

interface Props {
  bundle: Bundle
  /** The roadmap as it would be after the ticked changes, for the canvas; null when nothing is proposed. */
  onPreview: (p: Preview | null) => void
  /** Scroll the canvas to a node; `switchView` lets it flip between Topics and Resources. */
  onLocate: (id: string, switchView: boolean) => void
  onApplied: () => Promise<void>
  onClose: () => void
  onError: (m: string) => void
}

const EXAMPLES = [
  'Expand stage 2 with more depth on the fundamentals.',
  'Find free alternatives to the paid resources.',
  'Add a stage on deploying what I have built.',
]
const SYMBOL: Record<Change['op'], string> = {
  update_roadmap: '~', add_stage: '+', update_stage: '~', move_stage: '→', add_topic: '+', add_resource: '+',
  update_item: '~', move_item: '→', archive_item: '−', restore_item: '↺', link: '~', unlink: '~',
}
const TONE: Record<Change['op'], 'add' | 'upd' | 'del'> = {
  update_roadmap: 'upd', add_stage: 'add', update_stage: 'upd', move_stage: 'upd', add_topic: 'add', add_resource: 'add',
  update_item: 'upd', move_item: 'upd', archive_item: 'del', restore_item: 'add', link: 'upd', unlink: 'upd',
}
const STATE_ICON: Record<PlanState, string> = { applied: '✓', declined: '✕', pending: '…', failed: '!' }
const now = () => new Date().toISOString()
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** What a checklist row points at on the canvas. */
function locateId(c: Change): string | null {
  switch (c.op) {
    case 'update_roadmap': return null
    case 'link':
    case 'unlink': return c.resource
    default: return c.id
  }
}

function detail(c: Change): string {
  switch (c.op) {
    case 'add_topic': return `Topic · ${IMPORTANCE_LABEL[c.row.importance]}`
    case 'add_resource': return ['Resource', KIND_LABEL[c.row.kind], c.row.provider, c.row.cost].filter(Boolean).join(' · ')
    case 'archive_item': return 'Hidden, with its notes, files and status kept. You can restore it.'
    case 'restore_item': return 'Back on the roadmap.'
    default: return ''
  }
}

/** A plan still pending when the app last closed was never applied. */
function settle(m: ChatMessage): ChatMessage {
  if (!m.plan?.changes.some((c) => c.state === 'pending')) return m
  return { ...m, plan: { ...m.plan, changes: m.plan.changes.map((c) => (c.state === 'pending' ? { ...c, state: 'declined' as const } : c)) } }
}

export function ChatDrawer({ bundle, onPreview, onLocate, onApplied, onClose, onError }: Props) {
  const roadmapId = bundle.roadmap.id
  const [messages, setMessages] = useState<ChatMessage[] | null>(null)
  const history = useRef<ChatMessage[]>([])
  const [ai, setAi] = useState<{ name: string; problem: string | null } | null>(null)
  const [text, setText] = useState('')
  const [run, setRun] = useState<{ job: string; log: AiProgress[]; started: number } | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [failure, setFailure] = useState<{ message: string; before: ChatMessage[]; error: string } | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [applying, setApplying] = useState(false)
  const [notice, setNotice] = useState<{ text: string; details?: string[] } | null>(null)
  const [unsaved, setUnsaved] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [peek, setPeek] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const name = ai?.name ?? 'Claude'
  const started = run?.started

  useEffect(() => { chatAi().then(setAi).catch(() => setAi({ name: 'Claude', problem: null })) }, [])
  useEffect(() => {
    let alive = true
    api.loadChat(roadmapId).then(
      (m) => { if (alive) { history.current = m.map(settle); setMessages(history.current) } },
      (e) => { if (alive) { setMessages([]); onError(e instanceof Error ? e.message : String(e)) } },
    )
    return () => { alive = false }
  }, [roadmapId, onError])
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, pending, run, failure, notice])
  useEffect(() => {
    if (!started) return
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(t)
  }, [started])

  // The canvas shows the roadmap as the still-open, ticked changes would leave it.
  const shown = useMemo(() => {
    if (!pending) return null
    const plan = pending.checked.filter((c) => pending.ticked.has(c.n) && !pending.applied.has(c.n) && !pending.skipped.has(c.n))
    return preview(bundle, plan, pending.asks.filter((a) => !pending.answers.has(a.n)))
  }, [bundle, pending])
  useEffect(() => { onPreview(shown) }, [shown, onPreview])
  useEffect(() => () => onPreview(null), [onPreview])

  const persist = (next: ChatMessage[]) => {
    history.current = next
    setMessages(next)
    api.saveChat(roadmapId, next).then(() => setUnsaved(false), () => setUnsaved(true))
  }

  /** Writes how a plan ended into its message, so Claude sees it next time. */
  const record = (p: Pending, state: (c: Checked) => PlanState) => {
    persist(history.current.map((m) => (m.id !== p.messageId ? m : {
      ...m,
      plan: {
        changes: visible(p.checked).map((c) => ({ summary: c.summary, op: c.change.op, state: state(c) })),
        questions: p.asks.map((a) => ({ text: `Remove "${a.title}"? ${a.text}`, answer: p.answers.get(a.n) })),
      },
    })))
  }

  const ask = async (message: string, before: ChatMessage[]) => {
    const job = newKey('job')
    setFailure(null)
    setNotice(null)
    setElapsed(0)
    setRun({ job, log: [], started: Date.now() })
    try {
      const { prompt, refs } = chatPrompt(bundle, before, message)
      const raw = await runChat(job, prompt, CHAT_SCHEMA, (p) =>
        setRun((r) => (r && r.job === job ? { ...r, log: [...r.log.slice(-30), p] } : r)))
      const v = validate(raw, bundle, message, refs)
      const reply = raw && typeof raw === 'object' && typeof (raw as { reply?: unknown }).reply === 'string' ? (raw as { reply: string }).reply.trim() : ''
      const hasPlan = v.checked.length > 0 || v.asks.length > 0
      const id = newKey('m')
      persist([...history.current, {
        id, role: 'assistant', at: now(),
        text: reply || (hasPlan ? 'Here is what I would change.' : 'I could not find anything to change.'),
        ...(hasPlan ? {
          plan: {
            changes: visible(v.checked).map((c) => ({ summary: c.summary, op: c.change.op, state: 'pending' as const })),
            questions: v.asks.map((a) => ({ text: `Remove "${a.title}"? ${a.text}` })),
          },
        } : {}),
      }])
      if (hasPlan) {
        setPending({ messageId: id, ...v, ticked: new Set(v.checked.map((c) => c.n)), answers: new Map(), applied: new Set(), skipped: new Set(), note: null })
      } else {
        setNotice({ text: 'No changes to apply.', details: v.dropped })
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      if (error === 'cancelled') {
        // Forget the unanswered message and give the words back to edit.
        persist(before)
        setText(message)
        setNotice({ text: 'Cancelled.' })
      } else {
        setFailure({ message, before, error })
      }
    } finally {
      setRun(null)
    }
  }

  const send = () => {
    const message = text.trim()
    if (!message || run || pending || !ai || ai.problem) return
    const before = history.current
    persist([...before, { id: newKey('m'), role: 'user', text: message, at: now() }])
    setText('')
    void ask(message, before)
  }

  const flip = (n: number) => setPending((p) => (p ? { ...p, ticked: toggle(p.checked, p.ticked, n) } : p))

  const answer = (a: Ask, yes: boolean) => setPending((p) => {
    if (!p) return p
    const answers = new Map(p.answers).set(a.n, yes ? 'yes' : 'no')
    if (!yes) return { ...p, answers }
    const n = Math.max(0, ...p.checked.map((c) => c.n), ...p.asks.map((x) => x.n)) + 1
    return { ...p, answers, checked: [...p.checked, confirmAsk(a, n)], ticked: new Set(p.ticked).add(n) }
  })

  const discard = () => {
    if (pending) record(pending, (c) => (pending.applied.has(c.n) ? 'applied' : 'declined'))
    setPending(null)
  }

  const apply = async () => {
    if (!pending) return
    const p = pending
    const plan = p.checked.filter((c) => p.ticked.has(c.n) && !p.applied.has(c.n) && !p.skipped.has(c.n))
    if (!plan.length) return
    setApplying(true)
    try {
      // Re-read first: anything removed since the proposal is skipped, not written.
      const fresh = await api.loadBundle(roadmapId)
      if (!fresh) throw new Error('This roadmap no longer exists.')
      const res = await applyChanges(plan, preview(fresh, plan).bundle, fresh, api)
      const applied = new Set([...p.applied, ...res.applied])
      const skipped = new Set([...p.skipped, ...res.skipped])
      await onApplied()
      if (res.failed) {
        const failedN = res.failed.n
        const next: Pending = { ...p, applied, skipped, note: `Stopped after ${plural(res.applied.length, 'change')}: ${res.failed.error}. Press Retry to try the rest.` }
        setPending(next)
        record(next, (c) => (applied.has(c.n) ? 'applied' : c.n === failedN ? 'failed' : 'pending'))
      } else {
        record({ ...p, applied }, (c) => (applied.has(c.n) ? 'applied' : 'declined'))
        setPending(null)
        const count = visible(p.checked).filter((c) => applied.has(c.n)).length
        const gone = visible(p.checked).filter((c) => res.skipped.includes(c.n)).length
        setNotice({ text: `Applied ${plural(count, 'change')}.${gone ? ` ${plural(gone, 'change')} no longer applied, because what they changed was removed in the meantime.` : ''}` })
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
    } finally {
      setApplying(false)
    }
  }

  const clear = () => {
    api.clearChat(roadmapId).then(() => {
      history.current = []
      setMessages([])
      setPending(null)
      setNotice(null)
      setFailure(null)
      setConfirmClear(false)
    }, (e) => onError(e instanceof Error ? e.message : String(e)))
  }

  const close = () => {
    if (run) void cancelAi(run.job)
    discard()
    onClose()
  }

  const busy = Boolean(run) || applying
  const locked = busy || Boolean(pending)

  return (
    <aside className="chat" data-peek={peek || undefined} aria-label={`Ask ${name} to change this roadmap`}>
      <div className="chat__head">
        <strong className="chat__title">✦ Ask {name}</strong>
        {messages && messages.length > 0 && (confirmClear ? (
          <>
            <button type="button" className="mini mini--danger" onClick={clear}>Clear chat</button>
            <button type="button" className="mini" onClick={() => setConfirmClear(false)}>Keep</button>
          </>
        ) : (
          <button type="button" className="mini" disabled={busy} onClick={() => setConfirmClear(true)}>New conversation</button>
        ))}
        <button type="button" className="mini chat__peek" onClick={() => setPeek((v) => !v)}>{peek ? 'Show chat' : 'Show roadmap'}</button>
        <button type="button" className="iconbtn" onClick={close} aria-label="Close chat">✕</button>
      </div>

      <div className="chat__list" ref={listRef} aria-live="polite">
        {messages === null && <p className="empty">Loading…</p>}
        {messages?.length === 0 && !run && (
          <div className="chat__intro">
            <p>Tell {name} what to change: add, expand, update or remove topics and resources. You'll see every change on the roadmap first, and nothing is saved until you press Apply.</p>
            {EXAMPLES.map((e) => <button key={e} type="button" className="chat__example" onClick={() => setText(e)}>{e}</button>)}
          </div>
        )}
        {messages?.map((m) => (
          <Fragment key={m.id}>
            <Bubble m={m} live={pending?.messageId === m.id} />
            {pending?.messageId === m.id && (
              <PlanCard p={pending} busy={busy} onFlip={flip} onAnswer={answer} onLocate={onLocate} onApply={() => void apply()} onDiscard={discard} />
            )}
          </Fragment>
        ))}
        {run && (
          <div className="chat__run">
            <p><span className="spin" aria-hidden="true">◌</span> {name} is working… <strong>{clock(elapsed)}</strong></p>
            {run.log.length > 0 && (
              <ol className="log">
                {run.log.map((p, i) => <li key={i}><span className="pill">{p.kind === 'search' ? 'Search' : 'Read'}</span> {p.text}</li>)}
              </ol>
            )}
            <p className="empty">Small edits take seconds. Finding new resources on the web takes a minute or three.</p>
            <button type="button" className="btn btn--ghost" onClick={() => void cancelAi(run.job)}>Cancel</button>
          </div>
        )}
        {failure && (
          <div className="chat__error" role="alert">
            <p>{failure.error}</p>
            <button type="button" className="btn" disabled={busy} onClick={() => void ask(failure.message, failure.before)}>Retry</button>
          </div>
        )}
        {notice && (
          <div className="chat__notice">
            <p>{notice.text}</p>
            {notice.details && notice.details.length > 0 && (
              <details>
                <summary>{plural(notice.details.length, 'suggestion')} couldn't be used</summary>
                <ul>{notice.details.map((d, i) => <li key={i}>{d}</li>)}</ul>
              </details>
            )}
          </div>
        )}
      </div>

      {unsaved && <p className="chat__unsaved">This conversation couldn't be saved. Your roadmap changes are not affected.</p>}
      {ai?.problem ? <p className="notice notice--warn chat__problem">{ai.problem}</p> : (
        <form className="chat__composer" onSubmit={(e) => { e.preventDefault(); send() }}>
          <textarea className="input input--area" rows={2} value={text} disabled={locked} aria-label={`Message to ${name}`}
            placeholder={pending ? 'Apply or discard the changes above first.' : 'Ask for a change…'}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
          <button type="submit" className="btn" disabled={locked || !text.trim() || !ai}>Send</button>
        </form>
      )}
    </aside>
  )
}

function Bubble({ m, live }: { m: ChatMessage; live: boolean }) {
  return (
    <div className={`chat__msg chat__msg--${m.role}`}>
      <p>{m.text}</p>
      {!live && m.plan && (
        <ul className="chat__past">
          {m.plan.changes.map((c, i) => (
            <li key={i} data-state={c.state} aria-label={`${c.state}: ${c.summary}`}><span aria-hidden="true">{STATE_ICON[c.state]}</span> {c.summary}</li>
          ))}
          {m.plan.questions.map((q, i) => (
            <li key={`q${i}`} data-state={q.answer === 'yes' ? 'applied' : 'declined'}>
              <span aria-hidden="true">?</span> {q.text}{q.answer ? (q.answer === 'yes' ? ' Yes.' : ' Kept.') : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function PlanCard({ p, busy, onFlip, onAnswer, onLocate, onApply, onDiscard }: {
  p: Pending; busy: boolean; onFlip: (n: number) => void; onAnswer: (a: Ask, yes: boolean) => void
  onLocate: (id: string, switchView: boolean) => void; onApply: () => void; onDiscard: () => void
}) {
  const rows = visible(p.checked)
  const open = rows.filter((c) => !p.applied.has(c.n) && !p.skipped.has(c.n))
  const count = open.filter((c) => p.ticked.has(c.n)).length
  return (
    <div className="plan">
      {rows.length > 0 && (
        <>
          <div className="plan__head"><strong>{plural(rows.length, 'change')}</strong><span>Hover a row to find it</span></div>
          <ul className="plan__rows">
            {rows.map((c) => {
              const at = locateId(c.change)
              const done = p.applied.has(c.n)
              const gone = p.skipped.has(c.n)
              const sub = gone ? 'No longer applies: what it changed was removed.' : detail(c.change)
              return (
                <li key={c.n} data-tone={TONE[c.change.op]} data-done={done || undefined} data-gone={gone || undefined}
                  onMouseEnter={() => { if (at) onLocate(at, false) }}>
                  <label className="plan__row">
                    <input type="checkbox" checked={done || (!gone && p.ticked.has(c.n))} disabled={busy || done || gone}
                      onChange={() => onFlip(c.n)} onFocus={() => { if (at) onLocate(at, false) }} />
                    <span className="plan__sym" aria-hidden="true">{done ? '✓' : SYMBOL[c.change.op]}</span>
                    <span className="plan__text">{c.summary}{sub && <small>{sub}</small>}</span>
                  </label>
                  {at && <button type="button" className="mini" onClick={() => onLocate(at, true)} aria-label={`Show on the roadmap: ${c.summary}`}>Show</button>}
                </li>
              )
            })}
          </ul>
        </>
      )}
      {p.asks.map((a) => {
        const said = p.answers.get(a.n)
        return (
          <div key={a.n} className="plan__ask" data-answered={said} onMouseEnter={() => onLocate(a.id, false)}>
            <p><strong>Should I remove "{a.title}"?</strong> {a.text}</p>
            {said ? <p className="plan__said">{said === 'yes' ? 'Added to the plan above.' : 'Kept.'}</p> : (
              <>
                <p className="plan__hint">You didn't ask for this, so it stays unless you say yes. Archiving keeps its notes and files.</p>
                <div className="rowactions">
                  <button type="button" className="mini mini--danger" disabled={busy} onClick={() => onAnswer(a, true)}>Yes, archive it</button>
                  <button type="button" className="mini" disabled={busy} onClick={() => onAnswer(a, false)}>Keep it</button>
                  <button type="button" className="mini" onClick={() => onLocate(a.id, true)}>Show</button>
                </div>
              </>
            )}
          </div>
        )
      })}
      {p.dropped.length > 0 && (
        <details className="plan__dropped">
          <summary>{plural(p.dropped.length, 'suggestion')} couldn't be used</summary>
          <ul>{p.dropped.map((d, i) => <li key={i}>{d}</li>)}</ul>
        </details>
      )}
      {p.note && <p className="notice notice--warn">{p.note}</p>}
      <div className="plan__bar">
        <span>{count} of {open.length} selected</span>
        <button type="button" className="btn btn--ghost" disabled={busy} onClick={onDiscard}>{p.applied.size ? 'Done' : 'Discard'}</button>
        <button type="button" className="btn" disabled={busy || count === 0} onClick={onApply}>{busy ? 'Applying…' : p.note ? 'Retry' : 'Apply changes'}</button>
      </div>
    </div>
  )
}
