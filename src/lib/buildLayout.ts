import type { Block, Bundle, LayoutStage, Status, View } from './types'

export const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position

/** First half of a stage's items above the spine, second half below. */
function split(ids: string[]): { above: Block[]; below: Block[] } {
  const half = Math.ceil(ids.length / 2)
  const block = (items: string[]): Block[] =>
    items.length ? [{ cols: items.length > 3 ? 2 : 1, items }] : []
  return { above: block(ids.slice(0, half)), below: block(ids.slice(half)) }
}

export function buildLayout(bundle: Bundle, view: View, showArchived: boolean): LayoutStage[] {
  const items = view === 'topics' ? bundle.topics : bundle.resources
  return [...bundle.stages].sort(byPosition).map((s) => ({
    id: s.id,
    title: s.title,
    pace: s.pace,
    desc: s.description,
    note: s.milestone || undefined,
    layout: split(
      items
        .filter((i) => i.stage_id === s.id && (showArchived || !i.archived_at))
        .sort(byPosition)
        .map((i) => i.id),
    ),
  }))
}

export interface Progress {
  status: Status
  done: number
  inProgress: number
  total: number
  /** Total minus skipped. Archived items never count. */
  counted: number
  pct: number
}

export function progressOf(items: { status: Status; archived_at: string | null }[]): Progress {
  let done = 0, inProgress = 0, skipped = 0, total = 0
  for (const i of items) {
    if (i.archived_at) continue
    total++
    if (i.status === 'done') done++
    else if (i.status === 'in_progress') inProgress++
    else if (i.status === 'skipped') skipped++
  }
  const counted = total - skipped
  let status: Status = 'todo'
  if (total > 0 && done + skipped === total && done > 0) status = 'done'
  else if (inProgress > 0 || done > 0) status = 'in_progress'
  return { status, done, inProgress, total, counted, pct: counted ? Math.round((done / counted) * 100) : 0 }
}
