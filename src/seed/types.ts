export type ItemType = 'rec' | 'alt' | 'opt'
export type Status = 'todo' | 'in_progress' | 'done' | 'skipped'
export type View = 'topics' | 'courses'

/** One block of items branching off the spine: a 1-column list or a 2-column grid. */
export interface Block {
  group?: string
  cols: 1 | 2
  items: string[]
}

export interface Stage {
  id: string
  title: string
  pace: string
  desc: string
  analogy?: string
  /** Milestone note shown in the gap AFTER this stage. */
  note?: string
  layout: { above: Block[]; below: Block[] }
}

export interface Topic {
  id: string
  stageId: string
  title: string
  type: ItemType
  desc: string
  capstoneOnly?: boolean
}

export type Cost = 'Free' | 'Free to audit' | 'Free tier' | 'Paid' | 'Paid exam'

export interface Course {
  id: string
  stageId: string
  title: string
  type: ItemType
  desc: string
  provider: string
  cost: Cost
  duration: string
  lang: string
  url?: string
  /** Topic ids this course teaches. The only link stored; "learn it with" is its reverse. */
  covers: string[]
}

export const STATUS_ORDER: Status[] = ['todo', 'in_progress', 'done', 'skipped']

export const STATUS_LABEL: Record<Status, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
  skipped: 'Skipped',
}

export const TYPE_LABEL: Record<ItemType, { topic: string; course: string }> = {
  rec: { topic: 'Recommended', course: 'Start here' },
  alt: { topic: 'Alternative', course: 'Alternative' },
  opt: { topic: 'Optional', course: 'Bonus' },
}
