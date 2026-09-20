export type Importance = 'rec' | 'alt' | 'opt'
export type Status = 'todo' | 'in_progress' | 'done' | 'skipped'
export type View = 'topics' | 'resources'
export type ResourceKind = 'course' | 'doc' | 'blog' | 'video' | 'book' | 'project' | 'other'

export const STATUS_ORDER: Status[] = ['todo', 'in_progress', 'done', 'skipped']
export const STATUS_LABEL: Record<Status, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
  skipped: 'Skipped',
}
export const IMPORTANCE_LABEL: Record<Importance, string> = {
  rec: 'Recommended',
  alt: 'Alternative',
  opt: 'Optional',
}
export const KIND_LABEL: Record<ResourceKind, string> = {
  course: 'Course',
  doc: 'Docs',
  blog: 'Blog post',
  video: 'Video',
  book: 'Book',
  project: 'Project',
  other: 'Other',
}
export const KINDS = Object.keys(KIND_LABEL) as ResourceKind[]

/* ---- rows, as stored ---------------------------------------------------- */

export interface Roadmap {
  id: string
  title: string
  description: string
  state: 'draft' | 'active' | 'archived'
  created_at: string
  updated_at: string
}
export interface StageRow {
  id: string
  roadmap_id: string
  title: string
  pace: string
  description: string
  milestone: string | null
  position: number
}
interface ItemBase {
  id: string
  roadmap_id: string
  stage_id: string
  title: string
  description: string
  importance: Importance
  status: Status
  status_changed_at: string | null
  archived_at: string | null
  notes_md: string
  position: number
}
export type Topic = ItemBase
export interface Resource extends ItemBase {
  kind: ResourceKind
  provider: string
  url: string | null
  cost: string
  duration: string
}
export interface TopicResource {
  topic_id: string
  resource_id: string
  is_primary: boolean
}
export interface ItemLink {
  id: string
  topic_id: string | null
  resource_id: string | null
  url: string
  label: string
}
export interface ItemFile {
  id: string
  topic_id: string | null
  resource_id: string | null
  path: string
  name: string
  size_bytes: number
  mime: string
}
export interface Bundle {
  roadmap: Roadmap
  stages: StageRow[]
  topics: Topic[]
  resources: Resource[]
  links: TopicResource[]
}

/* ---- a roadmap before it is saved: what research returns ---------------- */

export interface DraftTopic {
  key: string
  title: string
  description: string
  importance: Importance
}
export interface DraftResource {
  key: string
  kind: ResourceKind
  title: string
  provider: string
  url: string
  cost: string
  duration: string
  description: string
  importance: Importance
  /** Topic keys this teaches. */
  covers: string[]
  /** The subset of `covers` for which this is the main thing to learn from. */
  primary_for: string[]
}
export interface DraftStage {
  key: string
  title: string
  pace: string
  description: string
  milestone: string
  topics: DraftTopic[]
  resources: DraftResource[]
}
export interface Draft {
  title: string
  description: string
  stages: DraftStage[]
}

/* ---- layout engine inputs ----------------------------------------------- */

export interface Block {
  group?: string
  cols: 1 | 2
  items: string[]
}
export interface LayoutStage {
  id: string
  title: string
  pace: string
  desc: string
  note?: string
  layout: { above: Block[]; below: Block[] }
}
