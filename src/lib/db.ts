import Database from '@tauri-apps/plugin-sql'
import type {
  Bundle, Draft, ItemFile, ItemLink, Resource, Roadmap, StageRow, Status, Topic, TopicResource,
} from './types'

export type ItemTable = 'topics' | 'resources'
export type Provider = 'claude' | 'codex'

/**
 * Everything lives in one SQLite file in the app's data folder. The Rust side
 * creates it and runs the migrations in src-tauri/migrations on first launch.
 */
let handle: Promise<Database> | null = null
function db(): Promise<Database> {
  if (!handle) {
    handle = Database.load('sqlite:learning-goals.db').then(async (d) => {
      await d.execute('PRAGMA foreign_keys = ON')
      return d
    })
    handle.catch(() => { handle = null })
  }
  return handle
}
/** Tauri rejects with plain strings; the screens expect Error objects. */
async function wrap<T>(p: Promise<T>): Promise<T> {
  try {
    return await p
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e))
  }
}
async function call<T>(cmd: string, args?: Record<string, unknown> | Uint8Array, headers?: Record<string, string>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return wrap(invoke<T>(cmd, args, headers ? { headers } : undefined))
}
async function all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return wrap(db().then((d) => d.select<T[]>(sql, params)))
}
async function one<T>(sql: string, params: unknown[] = []): Promise<T | null> {
  return (await all<T>(sql, params))[0] ?? null
}
async function run(sql: string, params: unknown[] = []) {
  await wrap(db().then((d) => d.execute(sql, params)))
}

const uuid = () => crypto.randomUUID()
const now = () => new Date().toISOString()
/** `$1, $2, …` for n parameters starting at `from`. */
const marks = (n: number, from = 1) => Array.from({ length: n }, (_, i) => `$${i + from}`).join(', ')

/** SQLite has no boolean: is_primary comes back as 0 or 1. */
const link = (l: { topic_id: string; resource_id: string; is_primary: number | boolean }): TopicResource =>
  ({ topic_id: l.topic_id, resource_id: l.resource_id, is_primary: Boolean(l.is_primary) })

/** Inserts many rows of one table, in chunks well under SQLite's parameter limit. */
async function insertMany(table: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return
  const cols = Object.keys(rows[0])
  const per = Math.max(1, Math.floor(900 / cols.length))
  for (let i = 0; i < rows.length; i += per) {
    const chunk = rows.slice(i, i + per)
    const values = chunk.map((_, r) => `(${marks(cols.length, r * cols.length + 1)})`).join(', ')
    await run(`INSERT INTO ${table} (${cols.join(', ')}) VALUES ${values}`, chunk.flatMap((row) => cols.map((c) => row[c] ?? null)))
  }
}

/* -------------------------------------------------------------- dashboard -- */

export interface DashboardData {
  roadmaps: Roadmap[]
  stages: Pick<StageRow, 'id' | 'roadmap_id' | 'position'>[]
  topics: Pick<Topic, 'id' | 'roadmap_id' | 'stage_id' | 'title' | 'importance' | 'status' | 'status_changed_at' | 'archived_at' | 'position'>[]
  resources: Pick<Resource, 'id' | 'roadmap_id' | 'title' | 'status' | 'status_changed_at' | 'archived_at' | 'url' | 'kind' | 'provider'>[]
  links: TopicResource[]
}

export async function loadDashboard(): Promise<DashboardData> {
  const [roadmaps, stages, topics, resources, links] = await Promise.all([
    all<Roadmap>(`SELECT * FROM roadmaps WHERE state <> 'archived' ORDER BY created_at DESC`),
    all<DashboardData['stages'][number]>('SELECT id, roadmap_id, position FROM stages'),
    all<DashboardData['topics'][number]>('SELECT id, roadmap_id, stage_id, title, importance, status, status_changed_at, archived_at, position FROM topics'),
    all<DashboardData['resources'][number]>('SELECT id, roadmap_id, title, status, status_changed_at, archived_at, url, kind, provider FROM resources'),
    all<{ topic_id: string; resource_id: string; is_primary: number }>('SELECT topic_id, resource_id, is_primary FROM topic_resources'),
  ])
  return { roadmaps, stages, topics, resources, links: links.map(link) }
}

/* --------------------------------------------------- settings, briefing -- */

export interface Settings {
  ai_provider: Provider
  ai_model: string
  briefing_enabled: boolean
  /** Local time, "HH:MM". */
  briefing_time: string
}
export const DEFAULT_SETTINGS: Settings = { ai_provider: 'claude', ai_model: '', briefing_enabled: true, briefing_time: '08:00' }

export async function loadSettings(): Promise<Settings> {
  const row = await one<Omit<Settings, 'briefing_enabled'> & { briefing_enabled: number }>(
    'SELECT ai_provider, ai_model, briefing_enabled, briefing_time FROM settings WHERE id = 1')
  return row ? { ...row, briefing_enabled: Boolean(row.briefing_enabled) } : DEFAULT_SETTINGS
}
export async function saveSettings(s: Settings) {
  await run(
    `INSERT INTO settings (id, ai_provider, ai_model, briefing_enabled, briefing_time, updated_at) VALUES (1, $1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET ai_provider = excluded.ai_provider, ai_model = excluded.ai_model,
       briefing_enabled = excluded.briefing_enabled, briefing_time = excluded.briefing_time, updated_at = excluded.updated_at`,
    [s.ai_provider, s.ai_model, s.briefing_enabled ? 1 : 0, s.briefing_time, now()])
}

export interface FocusItem { title: string; why: string; item_id: string }
export interface BriefingContent { headline: string; focus: FocusItem[]; notes: string[] }
export interface Briefing { content: BriefingContent; provider: Provider; model: string; generated_at: string }

export async function loadBriefing(): Promise<Briefing | null> {
  const row = await one<{ content: string; provider: Provider; model: string; generated_at: string }>(
    'SELECT content, provider, model, generated_at FROM briefings WHERE id = 1')
  if (!row) return null
  try {
    return { ...row, content: JSON.parse(row.content) as BriefingContent }
  } catch {
    return null
  }
}
export async function saveBriefing(content: BriefingContent, provider: Provider, model: string) {
  await run(
    `INSERT INTO briefings (id, content, provider, model, generated_at) VALUES (1, $1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET content = excluded.content, provider = excluded.provider, model = excluded.model, generated_at = excluded.generated_at`,
    [JSON.stringify(content), provider, model, now()])
}

/* ---------------------------------------------------------------- roadmap -- */

export async function loadBundle(id: string): Promise<Bundle | null> {
  const [roadmap, stages, topics, resources, links] = await Promise.all([
    one<Roadmap>('SELECT * FROM roadmaps WHERE id = $1', [id]),
    all<StageRow>('SELECT * FROM stages WHERE roadmap_id = $1', [id]),
    all<Topic>('SELECT * FROM topics WHERE roadmap_id = $1', [id]),
    all<Resource>('SELECT * FROM resources WHERE roadmap_id = $1', [id]),
    all<{ topic_id: string; resource_id: string; is_primary: number }>(
      'SELECT tr.topic_id, tr.resource_id, tr.is_primary FROM topic_resources tr JOIN resources r ON r.id = tr.resource_id WHERE r.roadmap_id = $1', [id]),
  ])
  if (!roadmap) return null
  return { roadmap, stages, topics, resources, links: links.map(link) }
}

export async function updateRoadmap(id: string, patch: Partial<Pick<Roadmap, 'title' | 'description' | 'state'>>) {
  const cols = Object.keys(patch)
  if (!cols.length) return
  await run(`UPDATE roadmaps SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')}, updated_at = $${cols.length + 1} WHERE id = $${cols.length + 2}`,
    [...Object.values(patch), now(), id])
}

/** Attachments are files on disk, so they are removed before their rows cascade away. */
async function removeFilesWhere(where: string, params: unknown[]) {
  const files = await all<{ path: string }>(`SELECT f.path FROM item_files f ${where}`, params)
  await Promise.all(files.map((f) => call('file_delete', { path: f.path }).catch(() => undefined)))
}

export async function deleteRoadmap(id: string) {
  await removeFilesWhere(
    `LEFT JOIN topics t ON t.id = f.topic_id LEFT JOIN resources r ON r.id = f.resource_id WHERE t.roadmap_id = $1 OR r.roadmap_id = $1`, [id])
  await run('DELETE FROM roadmaps WHERE id = $1', [id])
}

/* ------------------------------------------------------------------ items -- */

// Table and column names below come from this file, never from input.
const ITEM_COLUMNS = new Set(['title', 'description', 'importance', 'notes_md', 'position', 'stage_id', 'kind', 'provider', 'url', 'cost', 'duration', 'archived_at', 'status', 'status_changed_at'])

export async function setStatus(table: ItemTable, ids: string[], status: Status) {
  if (!ids.length) return
  await run(`UPDATE ${table} SET status = $1, status_changed_at = $2 WHERE id IN (${marks(ids.length, 3)})`, [status, now(), ...ids])
}
export async function updateItem(table: ItemTable, id: string, patch: Record<string, unknown>) {
  const cols = Object.keys(patch).filter((c) => ITEM_COLUMNS.has(c))
  if (!cols.length) return
  await run(`UPDATE ${table} SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')} WHERE id = $${cols.length + 1}`,
    [...cols.map((c) => patch[c] ?? null), id])
}
export async function setArchived(table: ItemTable, id: string, archived: boolean) {
  await updateItem(table, id, { archived_at: archived ? now() : null })
}
export async function deleteItem(table: ItemTable, id: string) {
  await removeFilesWhere(`WHERE f.${ownerCol(table)} = $1`, [id])
  await run(`DELETE FROM ${table} WHERE id = $1`, [id])
}
export async function addTopic(roadmap_id: string, stage_id: string, position: number, title: string): Promise<Topic> {
  const id = uuid()
  await run('INSERT INTO topics (id, roadmap_id, stage_id, position, title) VALUES ($1, $2, $3, $4, $5)', [id, roadmap_id, stage_id, position, title])
  return (await one<Topic>('SELECT * FROM topics WHERE id = $1', [id]))!
}
export async function addResource(roadmap_id: string, stage_id: string, position: number, title: string): Promise<Resource> {
  const id = uuid()
  await run('INSERT INTO resources (id, roadmap_id, stage_id, position, title) VALUES ($1, $2, $3, $4, $5)', [id, roadmap_id, stage_id, position, title])
  return (await one<Resource>('SELECT * FROM resources WHERE id = $1', [id]))!
}

export async function linkTopicResource(topic_id: string, resource_id: string) {
  await run('INSERT INTO topic_resources (topic_id, resource_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [topic_id, resource_id])
}
export async function unlinkTopicResource(topic_id: string, resource_id: string) {
  await run('DELETE FROM topic_resources WHERE topic_id = $1 AND resource_id = $2', [topic_id, resource_id])
}
/** One primary per topic: clear the others, then set this one. */
export async function setPrimary(topic_id: string, resource_id: string | null) {
  await run('UPDATE topic_resources SET is_primary = 0 WHERE topic_id = $1', [topic_id])
  if (resource_id) await run('UPDATE topic_resources SET is_primary = 1 WHERE topic_id = $1 AND resource_id = $2', [topic_id, resource_id])
}

/* ------------------------------------------------- extra links and files -- */

const ownerCol = (table: ItemTable) => (table === 'topics' ? 'topic_id' : 'resource_id')

export async function loadExtras(table: ItemTable, id: string): Promise<{ links: ItemLink[]; files: ItemFile[] }> {
  const [links, files] = await Promise.all([
    all<ItemLink>(`SELECT * FROM item_links WHERE ${ownerCol(table)} = $1 ORDER BY created_at`, [id]),
    all<ItemFile>(`SELECT * FROM item_files WHERE ${ownerCol(table)} = $1 ORDER BY created_at`, [id]),
  ])
  return { links, files }
}
export async function addLink(table: ItemTable, id: string, url: string, label: string) {
  await run(`INSERT INTO item_links (id, ${ownerCol(table)}, url, label) VALUES ($1, $2, $3, $4)`, [uuid(), id, url, label])
}
export async function removeLink(id: string) {
  await run('DELETE FROM item_links WHERE id = $1', [id])
}

/** Copies the file into the app's data folder, then records it. */
export async function uploadFile(table: ItemTable, id: string, file: File) {
  const safe = file.name.replace(/[^\w.\-]+/g, '_').replace(/^\.+/, '').slice(-80) || 'file'
  const path = `files/${id}/${uuid().slice(0, 8)}-${safe}`
  await call('file_save', new Uint8Array(await file.arrayBuffer()), { 'x-path': path })
  try {
    await run(`INSERT INTO item_files (id, ${ownerCol(table)}, path, name, size_bytes, mime) VALUES ($1, $2, $3, $4, $5, $6)`,
      [uuid(), id, path, file.name, file.size, file.type])
  } catch (e) {
    await call('file_delete', { path }).catch(() => undefined)
    throw e
  }
}
export async function removeFile(f: ItemFile) {
  await call('file_delete', { path: f.path })
  await run('DELETE FROM item_files WHERE id = $1', [f.id])
}
/** Opens the attachment in its default Mac app. */
export async function openFile(f: ItemFile) {
  await call('file_open', { path: f.path })
}

/* ------------------------------------------------------- saving a draft -- */

/**
 * Turns a reviewed draft into real rows. Ids are minted here, so the key -> id
 * mapping never depends on insert order.
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
      const seen = new Set<string>()
      for (const k of x.covers) {
        const tid = topicId.get(k)
        if (tid && !seen.has(tid)) {
          seen.add(tid)
          links.push({ topic_id: tid, resource_id: id, is_primary: x.primary_for.includes(k) ? 1 : 0 })
        }
      }
    })
  })

  const at = now()
  await run('INSERT INTO roadmaps (id, title, description, state, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $5)',
    [roadmapId, draft.title, draft.description, 'active', at])
  try {
    await insertMany('stages', stages)
    await insertMany('topics', topics)
    await insertMany('resources', resources)
    await insertMany('topic_resources', links)
  } catch (e) {
    // Half a roadmap is worse than none; the cascade removes whatever landed.
    await run('DELETE FROM roadmaps WHERE id = $1', [roadmapId]).catch(() => undefined)
    throw e
  }
  return roadmapId
}
