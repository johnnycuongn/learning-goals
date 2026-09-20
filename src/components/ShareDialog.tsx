import { useEffect, useState } from 'react'
import { loadShare, regenerateShare, saveShare } from '../lib/db'
import { openExternal } from '../lib/platform'
import type { Share } from '../lib/types'

/** Where the public viewer lives. Public by design: it is just a web address. */
const WEB = (import.meta.env.VITE_PUBLIC_WEB_URL as string | undefined)?.replace(/\/+$/, '')

export function ShareDialog({ roadmapId, onClose, onError }: { roadmapId: string; onClose: () => void; onError: (m: string) => void }) {
  const [share, setShare] = useState<Share | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmRetire, setConfirmRetire] = useState(false)

  useEffect(() => { loadShare(roadmapId).then(setShare).catch((e) => { onError(e.message); setShare(null) }) }, [roadmapId, onError])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const run = async (fn: () => Promise<Share>) => {
    setBusy(true); setCopied(false)
    try { setShare(await fn()) } catch (e) { onError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  const on = Boolean(share?.enabled)
  const url = share && WEB ? `${WEB}/#/s/${share.token}` : null

  return (
    <>
      <button className="scrim" aria-label="Close" onClick={onClose} tabIndex={-1} />
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <h2 id="share-title">Share this roadmap</h2>
        {share === undefined ? <p>Loading…</p> : (
          <>
            <label className="check">
              <input type="checkbox" checked={on} disabled={busy} onChange={(e) => void run(() => saveShare(roadmapId, share, { enabled: e.target.checked }))} />
              <span><strong>Public link.</strong> Anyone with the link can view this roadmap, without signing in. They can't change anything.</span>
            </label>

            {on && share && (
              <>
                {url ? (
                  <div className="sharelink">
                    <input className="input" readOnly value={url} aria-label="Public link" onFocus={(e) => e.target.select()} />
                    <button type="button" className="btn" onClick={async () => {
                      try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2200) } catch { onError('Copy failed. Select the link and copy it by hand.') }
                    }}>{copied ? 'Copied' : 'Copy'}</button>
                    <button type="button" className="btn btn--ghost" onClick={() => void openExternal(url)}>Open ↗</button>
                  </div>
                ) : (
                  <p className="notice notice--warn">Sharing is on, but this build doesn't know the web viewer's address yet (VITE_PUBLIC_WEB_URL), so it can't show you the link.</p>
                )}

                <label className="check">
                  <input type="checkbox" checked={share.include_status} disabled={busy} onChange={(e) => void run(() => saveShare(roadmapId, share, { include_status: e.target.checked }))} />
                  <span><strong>Include my progress.</strong> Show what I've done, what's in progress and what I skipped. Off means they see the roadmap only.</span>
                </label>

                <div className="dialog__actions">
                  {confirmRetire ? (
                    <>
                      <button type="button" className="btn btn--danger" disabled={busy} onClick={() => { setConfirmRetire(false); void run(() => regenerateShare(roadmapId)) }}>Retire the old link</button>
                      <button type="button" className="btn btn--ghost" onClick={() => setConfirmRetire(false)}>Keep it</button>
                    </>
                  ) : (
                    <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setConfirmRetire(true)}>Retire this link and make a new one…</button>
                  )}
                </div>
                {confirmRetire && <p className="empty" style={{ fontSize: 13, marginTop: 8 }}>The current link stops working straight away, for everyone you sent it to. There's no undo.</p>}
              </>
            )}

            <p className="empty" style={{ fontSize: 13, marginTop: 14 }}>
              {on ? 'Never shared, whatever you choose: your notes, attached files, extra links and archived items.' : share ? 'Sharing is off. The link you had is paused and will work again if you turn this back on.' : 'Turn it on to get a link.'}
            </p>
            <div className="dialog__actions" style={{ marginTop: 12 }}><button type="button" className="btn" onClick={onClose}>Done</button></div>
          </>
        )}
      </div>
    </>
  )
}
