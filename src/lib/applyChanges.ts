import type { Change, Checked, Table } from './chat'
import type { Bundle, Resource, Roadmap, StageRow, Topic } from './types'

/** The writes applying a plan needs. Both projects' db.ts modules provide these. */
export interface ChatDb {
  updateRoadmap(id: string, patch: Partial<Pick<Roadmap, 'title' | 'description'>>): Promise<void>
  insertStage(row: StageRow): Promise<void>
  updateStage(id: string, patch: Partial<Pick<StageRow, 'title' | 'pace' | 'description' | 'milestone' | 'position'>>): Promise<void>
  insertTopic(row: Topic): Promise<void>
  insertResource(row: Resource): Promise<void>
  updateItem(table: Table, id: string, patch: Record<string, unknown>): Promise<void>
  setArchived(table: Table, id: string, archived: boolean): Promise<void>
  linkTopicResource(topic_id: string, resource_id: string): Promise<void>
  unlinkTopicResource(topic_id: string, resource_id: string): Promise<void>
  setPrimary(topic_id: string, resource_id: string | null): Promise<void>
}

export interface ApplyResult {
  applied: number[]
  /** Pointed at something that no longer exists, or needed a change that was skipped. */
  skipped: number[]
  /** The first write that failed; nothing after it was tried. */
  failed: { n: number; error: string } | null
}

/** Archives go last, so a failure never leaves things archived with their replacements missing. */
const PHASE: Record<Change['op'], number> = {
  update_roadmap: 0, add_stage: 1, update_stage: 2, move_stage: 2, add_topic: 3, add_resource: 4,
  update_item: 5, move_item: 5, link: 6, unlink: 6, restore_item: 7, archive_item: 8,
}

/** The existing rows a change touches. */
function targets(c: Change): string[] {
  switch (c.op) {
    case 'update_roadmap':
    case 'add_stage': return []
    case 'add_topic':
    case 'add_resource': return [c.stage]
    case 'move_item': return [c.id, c.stage]
    case 'link':
    case 'unlink': return [c.topic, c.resource]
    default: return [c.id]
  }
}

async function write(c: Change, b: Bundle, db: ChatDb) {
  const item = (t: Table, id: string) => (t === 'topics' ? b.topics : b.resources).find((x) => x.id === id)!
  const stage = (id: string) => b.stages.find((s) => s.id === id)!
  switch (c.op) {
    case 'update_roadmap': return db.updateRoadmap(b.roadmap.id, c.patch)
    case 'add_stage': return db.insertStage(stage(c.id))
    case 'update_stage': {
      const { milestone, ...rest } = c.patch
      return db.updateStage(c.id, milestone === undefined ? rest : { ...rest, milestone: milestone || null })
    }
    case 'move_stage': return db.updateStage(c.id, { position: stage(c.id).position })
    case 'add_topic': return db.insertTopic(item('topics', c.id) as Topic)
    case 'add_resource': return db.insertResource(item('resources', c.id) as Resource)
    case 'update_item': return db.updateItem(c.table, c.id, c.patch)
    case 'move_item': {
      const x = item(c.table, c.id)
      return db.updateItem(c.table, c.id, { stage_id: x.stage_id, position: x.position })
    }
    case 'archive_item': return db.setArchived(c.table, c.id, true)
    case 'restore_item': return db.setArchived(c.table, c.id, false)
    case 'link':
      await db.linkTopicResource(c.topic, c.resource)
      if (c.primary) await db.setPrimary(c.topic, c.resource)
      return
    case 'unlink': return db.unlinkTopicResource(c.topic, c.resource)
  }
}

/**
 * Writes `plan` one change at a time in a safe order. `target` is the preview
 * of `fresh` with this plan, and is where new rows and positions come from.
 */
export async function applyChanges(plan: Checked[], target: Bundle, fresh: Bundle, db: ChatDb): Promise<ApplyResult> {
  const exists = new Set([...fresh.stages, ...fresh.topics, ...fresh.resources].map((x) => x.id))
  const created = new Set(plan.flatMap((p) => (p.change.op.startsWith('add_') && 'id' in p.change ? [p.change.id] : [])))
  const result: ApplyResult = { applied: [], skipped: [], failed: null }
  const order = [...plan].sort((a, b) => PHASE[a.change.op] - PHASE[b.change.op])
  for (const p of order) {
    const gone = targets(p.change).some((id) => !exists.has(id) && !created.has(id))
    if (gone || p.dependsOn.some((d) => result.skipped.includes(d))) {
      result.skipped.push(p.n)
      if (p.change.op.startsWith('add_') && 'id' in p.change) created.delete(p.change.id)
      continue
    }
    try {
      await write(p.change, target, db)
      result.applied.push(p.n)
    } catch (e) {
      result.failed = { n: p.n, error: e instanceof Error ? e.message : String(e) }
      break
    }
  }
  return result
}
