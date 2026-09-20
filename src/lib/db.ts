import { supabase } from './supabase'
import type {
  Bundle, Draft, ItemFile, ItemLink, Resource, Roadmap, StageRow, Status, Topic, TopicResource,
} from './types'

export type ItemTable = 'topics' | 'resources'

function db() {
  if (!supabase) throw new Error('This build has no backend configured.')
  return supabase
}
function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}
const uuid = () => crypto.randomUUID()

/* -------------------------------------------------------------- dashboard -- */

export interface DashboardData {
  roadmaps: Roadmap[]
  topics: Pick<Topic, 'id' | 'roadmap_id' | 'title' | 'status' | 'status_changed_at' | 'archived_at'>[]
  resources: Pick<Resource, 'id' | 'roadmap_id' | 'title' | 'status' | 'archived_at' | 'url' | 'kind' | 'provider'>[]
  links: TopicResource[]
}

export async function loadDashboard(): Promise<DashboardData> {
  const [roadmaps, topics, resources, links] = await Promise.all([
    db().from('roadmaps').select('*').neq('state', 'archived').order('created_at', { ascending: false }),
    db().from('topics').select('id,roadmap_id,title,status,status_changed_at,archived_at'),
    db().from('resources').select('id,roadmap_id,title,status,archived_at,url,kind,provider'),
    db().from('topic_resources').select('topic_id,resource_id,is_primary'),
  ])
  return { roadmaps: must(roadmaps), topics: must(topics), resources: must(resources), links: must(links) }
}

/* ---------------------------------------------------------------- roadmap -- */

export async function loadBundle(id: string): Promise<Bundle | null> {
  const [roadmap, stages, topics, resources] = await Promise.all([
    db().from('roadmaps').select('*').eq('id', id).maybeSingle(),
    db().from('stages').select('*').eq('roadmap_id', id),
    db().from('topics').select('*').eq('roadmap_id', id),
    db().from('resources').select('*').eq('roadmap_id', id),
  ])
  const r = must(roadmap) as Roadmap | null
  if (!r) return null
  const res = must(resources) as Resource[]
  // topic_resources has no roadmap_id, so reach it through this roadmap's resources.
  const links = res.length
    ? (must(await db().from('topic_resources').select('topic_id,resource_id,is_primary').in('resource_id', res.map((x) => x.id))) as TopicResource[])
    : []
  return { roadmap: r, stages: must(stages) as StageRow[], topics: must(topics) as Topic[], resources: res, links }
}

export async function updateRoadmap(id: string, patch: Partial<Pick<Roadmap, 'title' | 'description' | 'state'>>) {
  must(await db().from('roadmaps').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select('id'))
}
export async function deleteRoadmap(id: string) {
  must(await db().from('roadmaps').delete().eq('id', id).select('id'))
}

/* ------------------------------------------------------------------ items -- */

export async function setStatus(table: ItemTable, ids: string[], status: Status) {
  if (!ids.length) return
  must(await db().from(table).update({ status, status_changed_at: new Date().toISOString() }).in('id', ids).select('id'))
}
export async function updateItem(table: ItemTable, id: string, patch: Record<string, unknown>) {
  must(await db().from(table).update(patch).eq('id', id).select('id'))
}
export async function setArchived(table: ItemTable, id: string, archived: boolean) {
  await updateItem(table, id, { archived_at: archived ? new Date().toISOString() : null })
}
export async function deleteItem(table: ItemTable, id: string) {
  must(await db().from(table).delete().eq('id', id).select('id'))
}
export async function addTopic(roadmap_id: string, stage_id: string, position: number, title: string): Promise<Topic> {
  return must(await db().from('topics').insert({ roadmap_id, stage_id, position, title }).select('*').single()) as Topic
}
export async function addResource(roadmap_id: string, stage_id: string, position: number, title: string): Promise<Resource> {
  return must(await db().from('resources').insert({ roadmap_id, stage_id, position, title }).select('*').single()) as Resource
}

export async function linkTopicResource(topic_id: string, resource_id: string) {
  must(await db().from('topic_resources').upsert({ topic_id, resource_id }).select('topic_id'))
}
export async function unlinkTopicResource(topic_id: string, resource_id: string) {
  must(await db().from('topic_resources').delete().eq('topic_id', topic_id).eq('resource_id', resource_id).select('topic_id'))
}
/** One primary per topic: clear the others, then set this one. */
export async function setPrimary(topic_id: string, resource_id: string | null) {
  must(await db().from('topic_resources').update({ is_primary: false }).eq('topic_id', topic_id).select('topic_id'))
  if (resource_id) {
    must(await db().from('topic_resources').update({ is_primary: true }).eq('topic_id', topic_id).eq('resource_id', resource_id).select('topic_id'))
  }
}

/* ------------------------------------------------- extra links and files -- */

const ownerCol = (table: ItemTable) => (table === 'topics' ? 'topic_id' : 'resource_id')

export async function loadExtras(table: ItemTable, id: string): Promise<{ links: ItemLink[]; files: ItemFile[] }> {
  const [links, files] = await Promise.all([
    db().from('item_links').select('*').eq(ownerCol(table), id).order('created_at'),
    db().from('item_files').select('*').eq(ownerCol(table), id).order('created_at'),
  ])
  return { links: must(links) as ItemLink[], files: must(files) as ItemFile[] }
}
export async function addLink(table: ItemTable, id: string, url: string, label: string) {
  must(await db().from('item_links').insert({ [ownerCol(table)]: id, url, label }).select('id'))
}
export async function removeLink(id: string) {
  must(await db().from('item_links').delete().eq('id', id).select('id'))
}

export async function uploadFile(table: ItemTable, id: string, file: File) {
  const { data } = await db().auth.getUser()
  const uid = data.user?.id
  if (!uid) throw new Error('Sign in first.')
  const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-80)
  const path = `${uid}/${id}/${uuid().slice(0, 8)}-${safe}`
  const up = await db().storage.from('attachments').upload(path, file, { contentType: file.type || undefined })
  if (up.error) throw new Error(up.error.message)
  must(await db().from('item_files').insert({
    [ownerCol(table)]: id, path, name: file.name, size_bytes: file.size, mime: file.type,
  }).select('id'))
}
export async function removeFile(f: ItemFile) {
  await db().storage.from('attachments').remove([f.path])
  must(await db().from('item_files').delete().eq('id', f.id).select('id'))
}
/** The bucket is private; this mints a link that works for five minutes. */
export async function fileUrl(f: ItemFile): Promise<string> {
  const res = await db().storage.from('attachments').createSignedUrl(f.path, 300)
  if (res.error) throw new Error(res.error.message)
  return res.data.signedUrl
}

/* ------------------------------------------------------- saving a draft -- */

/**
 * Turns a reviewed draft into real rows. Ids are minted here rather than read
 * back from the insert, so the key -> id mapping never depends on return order.
 */
export async function saveDraft(draft: Draft): Promise<string> {
  const roadmapId = uuid()
  const topicId = new Map<string, string>()
  const stages: Record<string, unknown>[] = []
  const topics: Record<string, unknown>[] = []
  const resources: Record<string, unknown>[] = []
  const links: Record<string, unknown>[] = []

  draft.stages.forEach((s, si) => {
    const stageId = uuid()
    stages.push({ id: stageId, roadmap_id: roadmapId, title: s.title, pace: s.pace, description: s.description, milestone: s.milestone || null, position: si })
    s.topics.forEach((t, ti) => {
      const id = uuid()
      topicId.set(t.key, id)
      topics.push({ id, roadmap_id: roadmapId, stage_id: stageId, title: t.title, description: t.description, importance: t.importance, position: ti })
    })
  })
  draft.stages.forEach((s, si) => {
    const stageId = stages[si].id
    s.resources.forEach((x, xi) => {
      const id = uuid()
      resources.push({
        id, roadmap_id: roadmapId, stage_id: stageId, kind: x.kind, title: x.title, provider: x.provider,
        url: x.url || null, cost: x.cost, duration: x.duration, description: x.description,
        importance: x.importance, position: xi,
      })
      for (const k of x.covers) {
        const tid = topicId.get(k)
        if (tid) links.push({ topic_id: tid, resource_id: id, is_primary: x.primary_for.includes(k) })
      }
    })
  })

  must(await db().from('roadmaps').insert({ id: roadmapId, title: draft.title, description: draft.description, state: 'active' }).select('id'))
  try {
    if (stages.length) must(await db().from('stages').insert(stages).select('id'))
    if (topics.length) must(await db().from('topics').insert(topics).select('id'))
    if (resources.length) must(await db().from('resources').insert(resources).select('id'))
    if (links.length) must(await db().from('topic_resources').insert(links).select('topic_id'))
  } catch (e) {
    // Half a roadmap is worse than none; the cascade removes whatever landed.
    await db().from('roadmaps').delete().eq('id', roadmapId)
    throw e
  }
  return roadmapId
}
