import { describe, expect, it } from 'vitest'
import { applyChanges, type ChatDb } from './applyChanges'
import { preview, roadmapForPrompt, validate } from './chat'
import { answer, raw, testBundle } from './__fixtures__/bundle'
import type { Bundle } from './types'

function fakeDb(failOn?: string) {
  const calls: unknown[][] = []
  const rec = (name: string) => async (...args: unknown[]) => {
    if (name === failOn) throw new Error(`${name} failed`)
    calls.push([name, ...args])
  }
  const db: ChatDb = {
    updateRoadmap: rec('updateRoadmap'), insertStage: rec('insertStage'), updateStage: rec('updateStage'),
    insertTopic: rec('insertTopic'), insertResource: rec('insertResource'), updateItem: rec('updateItem'),
    setArchived: rec('setArchived'), linkTopicResource: rec('linkTopicResource'),
    unlinkTopicResource: rec('unlinkTopicResource'), setPrimary: rec('setPrimary'),
  }
  return { db, calls }
}

function plan(changes: unknown[], message = 'go') {
  const bundle = testBundle()
  const { refs } = roadmapForPrompt(bundle)
  let i = 0
  return validate(answer(changes), bundle, message, refs, () => `new${++i}`).checked
}
const run = (checked: ReturnType<typeof plan>, fresh: Bundle = testBundle(), failOn?: string) => {
  const { db, calls } = fakeDb(failOn)
  return applyChanges(checked, preview(fresh, checked).bundle, fresh, db).then((result) => ({ result, calls }))
}

describe('applyChanges', () => {
  it('writes in a safe order whatever order Claude used, archives last', async () => {
    const checked = plan([
      raw({ op: 'archive_item', ref: 'r2', requested_by_user: true, quote: 'remove the paid RAG bootcamp' }),
      raw({ op: 'add_resource', key: 'new-r1', stage: 'new-s1', title: 'Vector course', covers: ['t1'] }),
      raw({ op: 'add_stage', key: 'new-s1', after: 's1', title: 'Vector DBs' }),
      raw({ op: 'update_roadmap', title: 'AI Engineering 2' }),
    ], 'Remove the paid RAG bootcamp and add a vector DB stage')
    const { result, calls } = await run(checked)
    expect(calls.map((c) => c[0])).toEqual(['updateRoadmap', 'insertStage', 'insertResource', 'linkTopicResource', 'setArchived'])
    expect(result.failed).toBeNull()
    expect(result.applied).toHaveLength(5)
  })

  it('takes rows and positions from the preview', async () => {
    const { calls } = await run(plan([
      raw({ op: 'add_stage', key: 'new-s1', after: 's1', title: 'Vector DBs', pace: 'Week 2' }),
      raw({ op: 'move_item', ref: 't2', stage: 's2', after: 'start' }),
    ]))
    expect(calls[0]).toEqual(['insertStage', { id: 'new1', roadmap_id: 'rm', title: 'Vector DBs', pace: 'Week 2', description: '', milestone: null, position: 0.5 }])
    expect(calls[1]).toEqual(['updateItem', 'topics', 'Tb', { stage_id: 'S2', position: -1 }])
  })

  it('links, then makes it the main resource', async () => {
    const { calls } = await run(plan([raw({ op: 'link', topic: 't2', resource: 'r2', primary: true })]))
    expect(calls).toEqual([['linkTopicResource', 'Tb', 'Ry'], ['setPrimary', 'Tb', 'Ry']])
  })

  it('stops at the first failure and says what was applied', async () => {
    const checked = plan([
      raw({ op: 'add_stage', key: 'new-s1', title: 'Vector DBs' }),
      raw({ op: 'add_resource', key: 'new-r1', stage: 'new-s1', title: 'Vector course' }),
      raw({ op: 'archive_item', ref: 'r2', requested_by_user: true, quote: 'remove the bootcamp' }),
    ], 'remove the bootcamp')
    const { result, calls } = await run(checked, testBundle(), 'insertResource')
    expect(result.applied).toEqual([checked[0].n])
    expect(result.failed).toEqual({ n: checked[1].n, error: 'insertResource failed' })
    expect(calls.map((c) => c[0])).toEqual(['insertStage'])
  })

  it('vanished targets: skips changes whose stage or item is gone, and what depends on them', async () => {
    const checked = plan([
      raw({ op: 'update_item', ref: 'r2', cost: 'Free' }),
      raw({ op: 'add_topic', key: 'new-t1', stage: 's2', title: 'Re-ranking' }),
      raw({ op: 'add_resource', key: 'new-r1', stage: 's1', title: 'Search course', covers: ['new-t1', 't1'] }),
    ])
    const fresh = testBundle()
    fresh.stages = fresh.stages.filter((s) => s.id !== 'S2')
    fresh.topics = fresh.topics.filter((t) => t.stage_id !== 'S2')
    fresh.resources = fresh.resources.filter((r) => r.stage_id !== 'S2')
    const { result, calls } = await run(checked, fresh)
    const [update, topic, res, linkNew, linkOld] = checked
    expect(result.skipped.sort()).toEqual([update.n, topic.n, linkNew.n].sort())
    expect(result.applied.sort()).toEqual([res.n, linkOld.n].sort())
    expect(calls.map((c) => c[0])).toEqual(['insertResource', 'linkTopicResource'])
  })
})
