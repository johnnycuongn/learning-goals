import { TOPICS } from './topics'
import { COURSES } from './courses'
import { COURSE_STAGES } from './stages'
import type { Draft, ResourceKind } from '../lib/types'

function kindOf(c: (typeof COURSES)[number]): ResourceKind {
  const url = c.url ?? ''
  if (c.provider === 'Your portfolio') return 'project'
  if (/\(book\)/i.test(c.title)) return 'book'
  if (/youtube\.com|3blue1brown/i.test(url)) return 'video'
  if (/hamel\.dev/i.test(url)) return 'blog'
  if (/doc|reference|guide|get started|tutorial$/i.test(`${c.title} ${c.duration}`) && !/course/i.test(c.title)) return 'doc'
  return 'course'
}

/** The original AI Engineer roadmap, as a draft that goes through the normal save path. */
export function aiEngineerDraft(): Draft {
  const primaryTaken = new Set<string>()
  return {
    title: 'AI Engineer',
    description: 'From engineering foundations to shipping evaluated, observable, secure LLM apps.',
    stages: COURSE_STAGES.map((s) => ({
      key: `s-${s.id}`,
      title: s.title,
      pace: s.pace,
      description: s.analogy ? `${s.desc} In everyday terms: ${s.analogy}` : s.desc,
      milestone: (s.note ?? '').replace(/^Milestone:\s*/i, ''),
      topics: TOPICS.filter((t) => t.stageId === s.id).map((t) => ({
        key: t.id, title: t.title, description: t.desc, importance: t.type,
      })),
      resources: COURSES.filter((c) => c.stageId === s.id).map((c) => ({
        key: c.id, kind: kindOf(c), title: c.title, provider: c.provider, url: c.url ?? '',
        cost: c.cost, duration: c.duration, description: c.desc, importance: c.type,
        covers: c.covers,
        // First resource to cover a topic becomes its main one.
        primary_for: c.covers.filter((k) => (primaryTaken.has(k) ? false : (primaryTaken.add(k), true))),
      })),
    })),
  }
}
