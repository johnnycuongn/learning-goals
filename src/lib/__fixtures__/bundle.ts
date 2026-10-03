import type { Bundle } from '../types'

/**
 * Two stages listed out of order on purpose (refs follow position, not array
 * order). Display order: s1 = S1, s2 = S2; t1 = Ta, t2 = Tb, r1 = Rx (stage 1);
 * t3 = Tc (archived), r2 = Ry (stage 2).
 */
export function testBundle(): Bundle {
  const base = {
    roadmap_id: 'rm', status_changed_at: null, archived_at: null, notes_md: '', description: '',
    importance: 'rec' as const, status: 'todo' as const,
  }
  return {
    roadmap: { id: 'rm', title: 'AI Engineering', description: 'Learn it', state: 'active', created_at: '', updated_at: '' },
    stages: [
      { id: 'S2', roadmap_id: 'rm', title: 'RAG', pace: 'Week 3', description: '', milestone: null, position: 1 },
      { id: 'S1', roadmap_id: 'rm', title: 'Basics', pace: 'Week 1', description: '', milestone: 'Can prompt', position: 0 },
    ],
    topics: [
      { ...base, id: 'Ta', stage_id: 'S1', title: 'Prompting', position: 0, status: 'done' },
      { ...base, id: 'Tb', stage_id: 'S1', title: 'Function calling', position: 1, notes_md: 'SECRET NOTE' },
      { ...base, id: 'Tc', stage_id: 'S2', title: 'Chunking', position: 0, archived_at: '2026-09-01T00:00:00Z' },
    ],
    resources: [
      { ...base, id: 'Rx', stage_id: 'S1', title: 'Prompt guide', position: 0, kind: 'doc', provider: 'Anthropic', url: 'https://docs.example.com/prompting', cost: 'Free', duration: '1h' },
      { ...base, id: 'Ry', stage_id: 'S2', title: 'Paid RAG bootcamp', position: 0, kind: 'course', provider: 'Acme', url: null, cost: 'Paid', duration: '6 weeks' },
    ],
    links: [
      { topic_id: 'Ta', resource_id: 'Rx', is_primary: true },
      { topic_id: 'Tb', resource_id: 'Rx', is_primary: false },
    ],
  }
}

/** A change with every field present, as the schema requires. */
export function raw(fields: Record<string, unknown>) {
  return {
    op: '', summary: '', ref: '', key: '', stage: '', after: '', title: '', description: '', pace: '', milestone: '',
    importance: '', kind: '', provider: '', url: '', cost: '', duration: '', covers: [], primary_for: [],
    topic: '', resource: '', primary: false, requested_by_user: false, quote: '', reason: '',
    ...fields,
  }
}

export const answer = (changes: unknown[], questions: unknown[] = [], reply = 'ok') => ({ reply, changes, questions })
