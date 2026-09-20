import { useCallback, useEffect, useState } from 'react'
import { BRIEFING_EVENT, generateBriefing, isGenerating } from '../lib/briefing'
import { loadBriefing, type Briefing } from '../lib/db'
import { isDesktop } from '../lib/platform'

interface Props {
  /** Where a focus item lives, so its title can link to it. */
  locate: (itemId: string) => (() => void) | null
  hasRoadmaps: boolean
  onError: (m: string) => void
}

function when(iso: string): string {
  const d = new Date(iso)
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return d.toDateString() === new Date().toDateString() ? `today at ${time}` : `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} at ${time}`
}

/** "This week": a short, AI-written answer to "I'm busy, what actually matters?" */
export function BriefingCard({ locate, hasRoadmaps, onError }: Props) {
  const [briefing, setBriefing] = useState<Briefing | null | undefined>(undefined)
  const [busy, setBusy] = useState(isGenerating())

  const load = useCallback(() => loadBriefing().then(setBriefing).catch(() => setBriefing(null)), [])
  useEffect(() => {
    void load()
    // The scheduled refresh runs outside this component; follow along with it.
    const on = (e: Event) => {
      const started = (e as CustomEvent).detail === 'started'
      setBusy(started)
      if (!started) void load()
    }
    window.addEventListener(BRIEFING_EVENT, on)
    return () => window.removeEventListener(BRIEFING_EVENT, on)
  }, [load])

  const regenerate = () => {
    generateBriefing().catch((e) => onError(e instanceof Error ? e.message : String(e)))
  }

  if (!hasRoadmaps || briefing === undefined) return null
  const c = briefing?.content

  return (
    <section className="briefing" aria-labelledby="briefing-title" aria-busy={busy}>
      <div className="briefing__head">
        <div>
          <h2 id="briefing-title" className="briefing__title">This week</h2>
          <p className="briefing__when">
            {busy ? 'Claude is reading your progress…' : briefing ? `Written by Claude ${when(briefing.generated_at)}` : 'Not written yet'}
          </p>
        </div>
        {isDesktop && (
          <button type="button" className="iconbtn" onClick={regenerate} disabled={busy}>
            <span aria-hidden="true" className={busy ? 'spin' : undefined}>↻</span> {busy ? 'Working' : briefing ? 'Regenerate' : 'Generate'}
          </button>
        )}
      </div>

      {c ? (
        <>
          {c.headline && <p className="briefing__headline">{c.headline}</p>}
          <ul className="briefing__focus">
            {c.focus.map((f, i) => {
              const open = f.item_id ? locate(f.item_id) : null
              return (
                <li key={i}>
                  {open ? <button type="button" className="briefing__link" onClick={open}>{f.title}</button> : <strong>{f.title}</strong>}
                  {f.why && <span className="briefing__why">{f.why}</span>}
                </li>
              )
            })}
          </ul>
          {c.notes.length > 0 && <ul className="briefing__notes">{c.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
        </>
      ) : (
        <p className="empty">
          {isDesktop
            ? 'Too much on and not enough week? Claude will look at what you have finished lately and what is in progress, and pick one to three things to focus on.'
            : 'The desktop app writes this each morning. Nothing has been generated yet.'}
        </p>
      )}
    </section>
  )
}
