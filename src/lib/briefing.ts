import { newKey, runAi } from './ai'
import { progressOf } from './buildLayout'
import {
  loadBriefing, loadDashboard, loadSettings, saveBriefing,
  type Briefing, type BriefingContent, type DashboardData, type Settings,
} from './db'
import { isDesktop } from './platform'

export const BRIEFING_EVENT = 'briefing:changed'

export const BRIEFING_SCHEMA = {
  type: 'object',
  required: ['headline', 'focus', 'notes'],
  properties: {
    headline: { type: 'string' },
    focus: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'why', 'item_id'],
        properties: { title: { type: 'string' }, why: { type: 'string' }, item_id: { type: 'string' } },
      },
    },
    notes: { type: 'array', items: { type: 'string' } },
  },
}

const DAY = 86_400_000
const daysAgo = (iso: string | null) => (iso ? Math.round((Date.now() - new Date(iso).getTime()) / DAY) : null)

/** Everything the AI needs to choose a focus, and nothing it doesn't (no notes, no files). */
export function summarise(d: DashboardData) {
  const live = new Set(d.roadmaps.map((r) => r.id))
  const roadmapTitle = new Map(d.roadmaps.map((r) => [r.id, r.title]))
  const stagePos = new Map(d.stages.map((s) => [s.id, s.position]))
  const topics = d.topics.filter((t) => live.has(t.roadmap_id) && !t.archived_at)
  const resources = d.resources.filter((r) => live.has(r.roadmap_id) && !r.archived_at)
  const topicById = new Map(topics.map((t) => [t.id, t]))
  const resourceById = new Map(resources.map((r) => [r.id, r]))
  const recent = (iso: string | null) => iso !== null && Date.now() - new Date(iso).getTime() <= 30 * DAY
  const mainResource = (topicId: string) => {
    const l = d.links.filter((x) => x.topic_id === topicId).sort((a, b) => Number(b.is_primary) - Number(a.is_primary))[0]
    return l ? resourceById.get(l.resource_id)?.title : undefined
  }

  // "Which courses carry the most in-progress or completed work": judged by the topics each one covers.
  const load = resources.map((r) => {
    const covered = d.links.filter((l) => l.resource_id === r.id).map((l) => topicById.get(l.topic_id)).filter(Boolean)
    return {
      id: r.id, title: r.title, kind: r.kind, status: r.status, roadmap: roadmapTitle.get(r.roadmap_id),
      topics_in_progress: covered.filter((t) => t!.status === 'in_progress').length,
      topics_done: covered.filter((t) => t!.status === 'done').length,
      topics_total: covered.length,
    }
  })

  return {
    today: new Date().toDateString(),
    roadmaps: d.roadmaps.map((r) => {
      const p = progressOf(topics.filter((t) => t.roadmap_id === r.id))
      return { title: r.title, topics_done: p.done, topics_in_progress: p.inProgress, topics_total: p.counted, percent: p.pct }
    }),
    in_progress_topics: topics.filter((t) => t.status === 'in_progress').map((t) => ({
      id: t.id, title: t.title, roadmap: roadmapTitle.get(t.roadmap_id), started_days_ago: daysAgo(t.status_changed_at), main_resource: mainResource(t.id),
    })),
    in_progress_resources: resources.filter((r) => r.status === 'in_progress').map((r) => ({
      id: r.id, title: r.title, kind: r.kind, roadmap: roadmapTitle.get(r.roadmap_id), started_days_ago: daysAgo(r.status_changed_at),
    })),
    finished_last_30_days: [...topics, ...resources]
      .filter((i) => i.status === 'done' && recent(i.status_changed_at))
      .map((i) => ({ title: i.title, roadmap: roadmapTitle.get(i.roadmap_id), days_ago: daysAgo(i.status_changed_at) })),
    resources_with_most_in_progress: [...load].filter((r) => r.topics_in_progress > 0).sort((a, b) => b.topics_in_progress - a.topics_in_progress).slice(0, 5),
    resources_with_most_completed: [...load].filter((r) => r.topics_done > 0).sort((a, b) => b.topics_done - a.topics_done).slice(0, 5),
    next_up: d.roadmaps.map((r) => ({
      roadmap: r.title,
      topics: topics
        .filter((t) => t.roadmap_id === r.id && t.status === 'todo' && t.importance === 'rec')
        .sort((a, b) => (stagePos.get(a.stage_id) ?? 0) - (stagePos.get(b.stage_id) ?? 0) || a.position - b.position)
        .slice(0, 3)
        .map((t) => ({ id: t.id, title: t.title, main_resource: mainResource(t.id) })),
    })),
  }
}

export function briefingPrompt(summary: ReturnType<typeof summarise>): string {
  return `You are helping a busy person decide what to study this week. They have more
in progress than they have time for. Your job is to cut, not to add.

Here is the state of their learning roadmaps as JSON:

${JSON.stringify(summary)}

Choose what they should do this week: a single thing if one item clearly matters
most or they are spread thin, otherwise at most three. Judge by:
- Finishing beats starting. Prefer something already in progress, especially if
  it is close to done, has stalled for a long time, or unblocks other topics.
- Momentum: what they finished in the last 30 days shows where their energy is.
- Leverage: a resource that covers several of their in-progress topics is worth
  more than one that covers a single topic.
- Only suggest something from "next_up" if little or nothing is in progress.

Reply with:
- headline: one plain sentence summing up the week's focus.
- focus: 1 to 3 items. "title" names the thing to do, starting with a verb. "why"
  is one sentence grounded in the data above. "item_id" is the id of the topic
  or resource it refers to, copied exactly, or "" if it refers to none.
- notes: 0 to 3 short bullet points. Use them for what to deliberately leave
  alone this week, or a pattern worth noticing. No generic study advice.

Write to them directly and plainly. Do not invent items that are not in the data.`
}

let running = false

/** Generates and stores a new briefing. Desktop only, since it runs the local CLI. */
export async function generateBriefing(settings?: Settings): Promise<Briefing | null> {
  if (!isDesktop || running) return null
  running = true
  window.dispatchEvent(new CustomEvent(BRIEFING_EVENT, { detail: 'started' }))
  try {
    const s = settings ?? (await loadSettings())
    const data = await loadDashboard()
    if (!data.roadmaps.length) return null
    const known = new Set([...data.topics, ...data.resources].map((i) => i.id))
    const raw = await runAi<BriefingContent>(newKey('brief'), briefingPrompt(summarise(data)), BRIEFING_SCHEMA, { provider: s.ai_provider, model: s.ai_model, maxTurns: 4, web: false })
    const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
    const content: BriefingContent = {
      headline: text(raw?.headline),
      focus: (Array.isArray(raw?.focus) ? raw.focus : []).slice(0, 3).map((f) => ({
        title: text(f?.title), why: text(f?.why), item_id: known.has(text(f?.item_id)) ? text(f?.item_id) : '',
      })).filter((f) => f.title),
      notes: (Array.isArray(raw?.notes) ? raw.notes : []).map(text).filter(Boolean).slice(0, 3),
    }
    if (!content.focus.length) throw new Error('The AI returned an empty briefing.')
    await saveBriefing(content, s.ai_provider, s.ai_model)
    return await loadBriefing()
  } finally {
    running = false
    window.dispatchEvent(new CustomEvent(BRIEFING_EVENT, { detail: 'finished' }))
  }
}

export const isGenerating = () => running

/** Due when today's scheduled time has passed and the stored briefing predates it. */
export function isDue(settings: Settings, last: Briefing | null, now = new Date()): boolean {
  if (!settings.briefing_enabled) return false
  const [h, m] = settings.briefing_time.split(':').map(Number)
  const slot = new Date(now)
  slot.setHours(h, m, 0, 0)
  if (now < slot) return false
  return !last || new Date(last.generated_at) < slot
}

/**
 * The daily refresh. There is no server to run a cron job on, so the desktop
 * app checks when it opens and every few minutes while it stays open: the first
 * check after the scheduled time regenerates. If the Mac was off at 8, you get
 * it when you next open the app.
 */
export async function refreshIfDue(): Promise<void> {
  if (!isDesktop || running) return
  try {
    const [settings, last] = await Promise.all([loadSettings(), loadBriefing()])
    if (isDue(settings, last)) await generateBriefing(settings)
  } catch {
    /* a failed background refresh is silent; the button on the card reports errors */
  }
}
