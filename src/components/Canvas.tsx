import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { computeLayout, type Layout, type PlacedNode } from '../lib/layout'
import type { Progress } from '../lib/buildLayout'
import type { LayoutStage, NodeInfo, View } from '../lib/types'
export type { NodeInfo }
import { STATUS_LABEL } from '../lib/types'
import { MARK_LABEL, type Mark } from '../lib/chat'

const MIN_ZOOM = 0.28
const MAX_ZOOM = 2.2

interface Props {
  view: View
  title: string
  subtitle: string
  stages: LayoutStage[]
  items: Map<string, NodeInfo>
  stageProgress: Map<string, Progress>
  highlightId: string | null
  onOpen: (id: string) => void
  /** False on a shared link whose owner kept their progress private. */
  showStatus?: boolean
  /** Absent where statuses should not be changed from the canvas. */
  onCycle?: (id: string) => void
  /** Reports the stage nearest the middle of the viewport, for the mini-map. */
  onVisibleStage: (stageId: string) => void
  scrollTarget: { id: string; nonce: number } | null
  /** The chat preview: what each changed node is about to become. */
  marks?: Map<string, Mark>
}

/** A height for a node we have not measured yet. Only visible for one frame. */
function estimate(title: string, width: number, hasMeta: boolean): number {
  const perLine = Math.max(8, Math.floor(width / 7.4))
  return 22 + Math.max(1, Math.ceil(title.length / perLine)) * 17 + (hasMeta ? 18 : 0)
}

export function Canvas({ view, title, subtitle, stages, items, stageProgress, highlightId, onOpen, onCycle, onVisibleStage, scrollTarget, marks, showStatus = true }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const nodeRefs = useRef(new Map<string, HTMLElement>())
  const heights = useRef(new Map<string, number>())
  const [measured, setMeasured] = useState(0)
  const [zoom, setZoom] = useState(1)
  const zoomRef = useRef(1)
  const fittedFor = useRef<string | null>(null)
  const userZoomed = useRef(false)

  zoomRef.current = zoom

  const registerRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) nodeRefs.current.set(id, el)
    else nodeRefs.current.delete(id)
  }, [])

  const layout: Layout = useMemo(
    () =>
      computeLayout(stages, view, (id, width) => {
        const info = items.get(id)
        const stage = info ? null : stages.find((x) => x.id === id)
        return heights.current.get(`${id}@${width}`) ?? estimate(info?.title ?? stage?.title ?? id, width, Boolean(info?.meta))
      }),
    // `measured` is the signal that the height map changed under us.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stages, view, measured, items],
  )

  // Measure real heights, then lay out again if anything moved.
  useLayoutEffect(() => {
    let changed = false
    for (const n of layout.nodes) {
      const el = nodeRefs.current.get(n.id)
      if (!el) continue
      const h = el.offsetHeight
      const key = `${n.id}@${n.w}`
      if (Math.abs((heights.current.get(key) ?? -1) - h) > 0.5) {
        heights.current.set(key, h)
        changed = true
      }
    }
    if (changed) setMeasured((v) => v + 1)
  })

  // Re-measure once the canvas font has loaded; it changes every node's height.
  useEffect(() => {
    let alive = true
    document.fonts?.ready.then(() => {
      if (!alive) return
      heights.current.clear()
      setMeasured((v) => v + 1)
    })
    return () => {
      alive = false
    }
  }, [])

  const fit = useCallback(() => {
    const vp = viewportRef.current
    if (!vp) return
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, (vp.clientHeight - 16) / layout.height))
    setZoom(z)
    return z
  }, [layout.height])

  // Fit to height when a view is first shown, and again once measurement has
  // settled (web fonts land after the first paint and change every height).
  // A manual zoom takes over from then on.
  useEffect(() => {
    if (measured === 0 || userZoomed.current) return
    const key = `${view}:${Math.round(layout.height)}`
    if (fittedFor.current === key) return
    const firstForView = !fittedFor.current?.startsWith(`${view}:`)
    fittedFor.current = key
    const z = fit()
    const vp = viewportRef.current
    if (vp && z) {
      if (firstForView) {
        // Desktop has room for the title block and stage 1 together. A phone
        // does not, and stage 1 is the useful half (spec 4.3).
        const first = layout.stageX[0]
        vp.scrollLeft =
          vp.clientWidth >= 900 || !first ? 0 : Math.max(0, first.left * z - 20)
      }
      vp.scrollTop = Math.max(0, layout.spineY * z - vp.clientHeight / 2)
    }
  }, [view, measured, fit, layout])

  const zoomAt = useCallback((factor: number, clientX?: number, clientY?: number) => {
    const vp = viewportRef.current
    if (!vp) return
    const prev = zoomRef.current
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev * factor))
    if (next === prev) return
    const rect = vp.getBoundingClientRect()
    const ax = (clientX ?? rect.left + rect.width / 2) - rect.left
    const ay = (clientY ?? rect.top + rect.height / 2) - rect.top
    const cx = (vp.scrollLeft + ax) / prev
    const cy = (vp.scrollTop + ay) / prev
    setZoom(next)
    requestAnimationFrame(() => {
      vp.scrollLeft = cx * next - ax
      vp.scrollTop = cy * next - ay
    })
  }, [])

  // Ctrl/Cmd + wheel zooms. Plain wheel scrolls; a vertical wheel on a canvas
  // that does not overflow vertically is nudged sideways instead.
  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        userZoomed.current = true
        zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY)
        return
      }
      const noVertical = vp.scrollHeight - vp.clientHeight < 2
      if (noVertical && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault()
        vp.scrollLeft += e.deltaY
      }
    }
    vp.addEventListener('wheel', onWheel, { passive: false })
    return () => vp.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  // Two-finger pinch to zoom (spec 4.3).
  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return
    let startDist = 0
    let startZoom = 1
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)

    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        startDist = dist(e.touches)
        startZoom = zoomRef.current
        userZoomed.current = true
      }
    }
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !startDist) return
      e.preventDefault()
      const ratio = dist(e.touches) / startDist
      const target = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, startZoom * ratio))
      const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2
      const my = (e.touches[0].clientY + e.touches[1].clientY) / 2
      zoomAt(target / zoomRef.current, mx, my)
    }
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) startDist = 0
    }
    vp.addEventListener('touchstart', onStart, { passive: true })
    vp.addEventListener('touchmove', onMove, { passive: false })
    vp.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      vp.removeEventListener('touchstart', onStart)
      vp.removeEventListener('touchmove', onMove)
      vp.removeEventListener('touchend', onEnd)
    }
  }, [zoomAt])

  // Scroll a linked node into the middle of the viewport.
  useEffect(() => {
    if (!scrollTarget) return
    const vp = viewportRef.current
    const place = layout.byId.get(scrollTarget.id)
    if (!vp || !place) return
    const z = zoomRef.current
    vp.scrollTo({
      left: Math.max(0, (place.x + place.w / 2) * z - vp.clientWidth / 2),
      top: Math.max(0, (place.y + place.h / 2) * z - vp.clientHeight / 2),
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    })
  }, [scrollTarget, layout])

  // Tell the mini-map which stage is in the middle of the viewport.
  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return
    let frame = 0
    const report = () => {
      frame = 0
      const mid = (vp.scrollLeft + vp.clientWidth / 2) / zoomRef.current
      let best = layout.stageX[0]
      for (const s of layout.stageX) {
        if (Math.abs(s.x - mid) < Math.abs(best.x - mid)) best = s
      }
      if (best) onVisibleStage(best.id)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(report)
    }
    vp.addEventListener('scroll', onScroll, { passive: true })
    report()
    return () => {
      vp.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [layout, onVisibleStage])

  useEffect(() => {
    const onResize = () => {
      if (!userZoomed.current) fit()
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [fit, view])

  const stageById = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages])

  return (
    <div className="viewport" ref={viewportRef} id="roadmap">
      <div style={{ width: layout.width * zoom, height: layout.height * zoom, position: 'relative' }}>
        <div
          className={`canvas${measured === 0 ? ' canvas--measuring' : ''}`}
          style={{
            width: layout.width,
            height: layout.height,
            transform: `scale(${zoom})`,
          }}
        >
          <svg
            className="canvas__svg"
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            width={layout.width}
            height={layout.height}
            aria-hidden="true"
            focusable="false"
          >
            <line
              className="spine"
              x1={layout.spineStart}
              y1={layout.spineY}
              x2={layout.spineEnd}
              y2={layout.spineY}
            />
            {layout.connectors.map((c) => (
              <path key={c.key} className="connector" d={c.d} />
            ))}
          </svg>

          <div
            className="canvas__title"
            style={{ left: 24, top: layout.spineY - 66 }}
          >
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>

          <div className="canvas__end" style={{ left: layout.spineEnd + 10, top: layout.spineY - 11 }}>
            Keep learning →
          </div>

          {layout.groups.map((g) => (
            <div
              key={g.key}
              className={`group${g.y + g.h < layout.spineY ? '' : ' group--below'}`}
              style={{ left: g.x, top: g.y, width: g.w, height: g.h }}
            >
              <span className="group__title">{g.title}</span>
            </div>
          ))}

          {layout.notes.map((n) => (
            <div key={n.key} className="note" style={{ left: n.x, top: n.y, width: n.w }}>
              {n.text}
            </div>
          ))}

          {layout.nodes.map((place) =>
            place.kind === 'stage' ? (
              <StageNode
                key={place.id}
                place={place}
                stage={stageById.get(place.id)!}
                index={stages.findIndex((x) => x.id === place.id)}
                prog={stageProgress.get(place.id)}
                showStatus={showStatus}
                highlighted={highlightId === place.id}
                mark={marks?.get(place.id)}
                onOpen={onOpen}
                registerRef={registerRef}
              />
            ) : (
              <ItemNode
                key={place.id}
                place={place}
                info={items.get(place.id)!}
                showStatus={showStatus}
                highlighted={highlightId === place.id}
                mark={marks?.get(place.id)}
                onOpen={onOpen}
                onCycle={onCycle}
                registerRef={registerRef}
              />
            ),
          )}
        </div>
      </div>

      <div className="zoom" role="group" aria-label="Zoom">
        <button
          type="button"
          onClick={() => {
            userZoomed.current = true
            zoomAt(1 / 1.2)
          }}
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          onClick={() => {
            userZoomed.current = false
            fit()
          }}
        >
          Fit
        </button>
        <button
          type="button"
          onClick={() => {
            userZoomed.current = true
            zoomAt(1.2)
          }}
          aria-label="Zoom in"
        >
          +
        </button>
      </div>
    </div>
  )
}

type Reg = (id: string, el: HTMLElement | null) => void

function StageNode({ place, stage, index, prog, showStatus, highlighted, mark, onOpen, registerRef }: {
  place: PlacedNode; stage: LayoutStage; index: number; prog?: Progress; showStatus: boolean
  highlighted: boolean; mark?: Mark; onOpen: (id: string) => void; registerRef: Reg
}) {
  const status = prog?.status ?? 'todo'
  return (
    <button
      ref={(el) => registerRef(stage.id, el)}
      type="button"
      className="node node--stage"
      data-status={status}
      data-highlight={highlighted || undefined}
      data-mark={mark}
      style={{ left: place.x, top: place.y, width: place.w }}
      aria-label={showStatus ? `Stage ${index + 1}: ${stage.title}. ${STATUS_LABEL[status]}, ${prog?.done ?? 0} of ${prog?.counted ?? 0} done.` : `Stage ${index + 1}: ${stage.title}.`}
      onClick={() => onOpen(stage.id)}
    >
      {mark && <span className="node__mark" data-mark={mark}>{MARK_LABEL[mark]}</span>}
      {showStatus && (
        <span className="tag node__tag" data-status={status}>
          {STATUS_LABEL[status]} {prog?.done ?? 0}/{prog?.counted ?? 0}
        </span>
      )}
      <span className="node__title">{index + 1}. {stage.title}</span>
      {stage.pace && <span className="node__pace">{stage.pace}</span>}
    </button>
  )
}

function ItemNode({ place, info, showStatus, highlighted, mark, onOpen, onCycle, registerRef }: {
  place: PlacedNode; info: NodeInfo; showStatus: boolean; highlighted: boolean; mark?: Mark
  onOpen: (id: string) => void; onCycle?: (id: string) => void; registerRef: Reg
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressed = useRef(false)
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  return (
    <button
      ref={(el) => registerRef(place.id, el)}
      type="button"
      className="node node--item"
      data-type={info.importance}
      data-status={info.status}
      data-archived={info.archived || undefined}
      data-highlight={highlighted || undefined}
      data-mark={mark}
      style={{ left: place.x, top: place.y, width: place.w }}
      aria-label={`${mark ? `${MARK_LABEL[mark]}: ` : ''}${showStatus ? `${info.title}. ${info.archived ? 'Archived. ' : ''}Status: ${STATUS_LABEL[info.status]}.` : info.title}`}
      onClick={() => {
        if (longPressed.current) {
          longPressed.current = false
          return
        }
        onOpen(place.id)
      }}
      onContextMenu={(e) => {
        if (!onCycle) return
        e.preventDefault()
        onCycle(place.id)
      }}
      onPointerDown={() => {
        if (!onCycle) return
        longPressed.current = false
        cancel()
        timer.current = setTimeout(() => {
          longPressed.current = true
          onCycle(place.id)
        }, 500)
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
    >
      {mark && <span className="node__mark" data-mark={mark}>{MARK_LABEL[mark]}</span>}
      {showStatus && (
        <span className="tag node__tag" data-status={info.archived ? 'skipped' : info.status}>
          {info.archived ? 'Archived' : STATUS_LABEL[info.status]}
        </span>
      )}
      <span className="node__title">{info.title}</span>
      {info.meta && <span className="node__meta">{info.meta}</span>}
      {info.badge && <span className="node__cost">{info.badge}</span>}
    </button>
  )
}
