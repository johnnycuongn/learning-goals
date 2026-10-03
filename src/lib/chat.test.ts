import { describe, expect, it } from 'vitest'
import { CHAT_SCHEMA, chatPrompt, formatHistory, roadmapForPrompt, type ChatMessage } from './chat'
import { testBundle } from './__fixtures__/bundle'

describe('roadmapForPrompt', () => {
  it('numbers refs in display order and maps them back to ids', () => {
    const { refs } = roadmapForPrompt(testBundle())
    expect(refs.get('s1')).toEqual({ kind: 'stage', id: 'S1' })
    expect(refs.get('s2')).toEqual({ kind: 'stage', id: 'S2' })
    expect(refs.get('t1')).toEqual({ kind: 'topics', id: 'Ta' })
    expect(refs.get('t3')).toEqual({ kind: 'topics', id: 'Tc' })
    expect(refs.get('r1')).toEqual({ kind: 'resources', id: 'Rx' })
    expect(refs.get('r2')).toEqual({ kind: 'resources', id: 'Ry' })
  })

  it('shows covers and primary_for as refs, and flags archived items', () => {
    const data = roadmapForPrompt(testBundle()).data as { stages: { resources: { covers: string[]; primary_for: string[] }[]; topics: { archived: boolean }[] }[] }
    expect(data.stages[0].resources[0]).toMatchObject({ covers: ['t1', 't2'], primary_for: ['t1'] })
    expect(data.stages[1].topics[0].archived).toBe(true)
  })

  it('never includes notes', () => {
    expect(JSON.stringify(roadmapForPrompt(testBundle()).data)).not.toContain('SECRET NOTE')
  })
})

describe('CHAT_SCHEMA', () => {
  it('requires every property of every object, as Codex structured output needs', () => {
    const walk = (s: unknown): void => {
      if (!s || typeof s !== 'object') return
      const o = s as Record<string, unknown>
      if (o.type === 'object') {
        expect(o.additionalProperties).toBe(false)
        expect(o.required).toEqual(Object.keys(o.properties as object))
      }
      Object.values(o).forEach(walk)
    }
    walk(CHAT_SCHEMA)
  })
})

describe('chatPrompt', () => {
  const msg = (i: number, extra: Partial<ChatMessage> = {}): ChatMessage =>
    ({ id: `m${i}`, role: i % 2 ? 'assistant' : 'user', text: `message ${i}`, at: '', ...extra })

  it('includes the new message and only the last 20 earlier messages', () => {
    const history = Array.from({ length: 25 }, (_, i) => msg(i))
    const { prompt } = chatPrompt(testBundle(), history, 'Add a stage on Kafka')
    expect(prompt).toContain('Add a stage on Kafka')
    expect(prompt).toContain('message 24')
    expect(prompt).toContain('message 5')
    expect(prompt).not.toContain('message 4\n')
  })

  it('tells Claude what was applied, declined and answered', () => {
    const text = formatHistory([msg(1, {
      plan: {
        changes: [{ summary: 'Add stage "Kafka"', op: 'add_stage', state: 'applied' }, { summary: 'Archive "Old video"', op: 'archive_item', state: 'declined' }],
        questions: [{ text: 'Should I remove "Intro"?', answer: 'no' }],
      },
    })])
    expect(text).toContain('[applied] Add stage "Kafka"')
    expect(text).toContain('[declined] Archive "Old video"')
    expect(text).toContain('Should I remove "Intro"? -> no, keep it')
  })
})
