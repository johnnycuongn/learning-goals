import { describe, expect, it } from 'vitest'
import { buildLayout } from './buildLayout'
import { positionAfter, preview, roadmapForPrompt, START, validate, type Checked } from './chat'
import { answer, raw, testBundle } from './__fixtures__/bundle'

const NOW = '2026-10-03T10:00:00.000Z'
function plan(changes: unknown[], message = 'go', questions: unknown[] = []) {
  const bundle = testBundle()
  const { refs } = roadmapForPrompt(bundle)
  let i = 0
  return { bundle, ...validate(answer(changes, questions), bundle, message, refs, () => `new${++i}`) }
}

describe('positionAfter', () => {
  const xs = [{ id: 'b', position: 2 }, { id: 'a', position: 0 }, { id: 'c', position: 3 }]
  it('handles empty lists, start, end, middle and unknown anchors', () => {
    expect(positionAfter([], null)).toBe(0)
    expect(positionAfter(xs, START)).toBe(-1)
    expect(positionAfter(xs, null)).toBe(4)
    expect(positionAfter(xs, 'a')).toBe(1)
    expect(positionAfter(xs, 'c')).toBe(4)
    expect(positionAfter(xs, 'zzz')).toBe(4)
  })
})

describe('preview', () => {
  it('puts a new stage between s1 and s2, with a new topic inside, all marked new', () => {
    const { bundle, checked } = plan([
      raw({ op: 'add_stage', key: 'new-s1', after: 's1', title: 'Vector DBs' }),
      raw({ op: 'add_topic', key: 'new-t1', stage: 'new-s1', title: 'HNSW' }),
    ])
    const p = preview(bundle, checked, [], NOW)
    expect(p.bundle.stages.find((s) => s.id === 'new1')).toMatchObject({ title: 'Vector DBs', position: 0.5, milestone: null })
    expect(p.bundle.topics.find((t) => t.id === 'new2')).toMatchObject({ stage_id: 'new1', status: 'todo', position: 0, notes_md: '' })
    expect(p.marks.get('new1')).toBe('new')
    expect(p.marks.get('new2')).toBe('new')
  })

  it('archives, restores, updates and moves, with marks; asks are marked asked', () => {
    const { bundle, checked, asks } = plan([
      raw({ op: 'archive_item', ref: 'r2', requested_by_user: true, quote: 'remove the bootcamp' }),
      raw({ op: 'restore_item', ref: 't3' }),
      raw({ op: 'update_item', ref: 't1', title: 'Prompt engineering' }),
      raw({ op: 'move_item', ref: 't2', stage: 's2', after: 'start' }),
    ], 'remove the bootcamp', [{ ref: 'r1', text: 'Overlaps' }])
    const p = preview(bundle, checked, asks, NOW)
    expect(p.bundle.resources.find((r) => r.id === 'Ry')!.archived_at).toBe(NOW)
    expect(p.bundle.topics.find((t) => t.id === 'Tc')!.archived_at).toBeNull()
    expect(p.bundle.topics.find((t) => t.id === 'Ta')!.title).toBe('Prompt engineering')
    expect(p.bundle.topics.find((t) => t.id === 'Tb')).toMatchObject({ stage_id: 'S2', position: -1 })
    expect(Object.fromEntries(p.marks)).toEqual({ Ry: 'archived', Tc: 'updated', Ta: 'updated', Tb: 'updated', Rx: 'asked' })
  })

  it('a primary link becomes the only primary for its topic; unlink removes the link', () => {
    const { bundle, checked } = plan([
      raw({ op: 'link', topic: 't1', resource: 'r2', primary: true }),
      raw({ op: 'unlink', topic: 't2', resource: 'r1' }),
    ])
    const p = preview(bundle, checked, [], NOW)
    expect(p.bundle.links).toEqual([
      { topic_id: 'Ta', resource_id: 'Rx', is_primary: false },
      { topic_id: 'Ta', resource_id: 'Ry', is_primary: true },
    ])
    expect(p.marks.get('Ry')).toBe('updated')
  })

  it('never changes the bundle it was given', () => {
    const { bundle, checked } = plan([
      raw({ op: 'update_roadmap', title: 'New title' }),
      raw({ op: 'archive_item', ref: 'r2', requested_by_user: true, quote: 'drop the bootcamp' }),
      raw({ op: 'link', topic: 't1', resource: 'r2', primary: true }),
    ], 'drop the bootcamp')
    preview(bundle, checked, [], NOW)
    expect(bundle).toEqual(testBundle())
  })

  it('skips an item whose stage is not there', () => {
    const bundle = testBundle()
    const orphan: Checked = { n: 1, summary: 'x', dependsOn: [], change: { op: 'add_topic', id: 'T9', stage: 'gone', after: null, row: { title: 'x', description: '', importance: 'rec' } } }
    expect(preview(bundle, [orphan], [], NOW).bundle.topics).toHaveLength(3)
  })
})

describe('buildLayout alwaysShow', () => {
  it('shows an archived item listed in alwaysShow even when archived items are hidden', () => {
    const stage2 = (ids?: Set<string>) => buildLayout(testBundle(), 'topics', false, ids).find((s) => s.id === 'S2')!
    const items = (s: ReturnType<typeof stage2>) => [...s.layout.above, ...s.layout.below].flatMap((b) => b.items)
    expect(items(stage2())).toEqual([])
    expect(items(stage2(new Set(['Tc'])))).toEqual(['Tc'])
  })
})
