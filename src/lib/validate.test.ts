import { describe, expect, it } from 'vitest'
import { confirmAsk, roadmapForPrompt, toggle, userAskedToRemove, validate, visible } from './chat'
import { answer, raw, testBundle } from './__fixtures__/bundle'

function run(changes: unknown[], message = 'make it better', questions: unknown[] = []) {
  const bundle = testBundle()
  const { refs } = roadmapForPrompt(bundle)
  let i = 0
  return validate(answer(changes, questions), bundle, message, refs, () => `new${++i}`)
}

describe('validate: adding', () => {
  it('adds a stage and a topic inside it; the topic depends on the stage', () => {
    const v = run([
      raw({ op: 'add_topic', key: 'new-t1', stage: 'new-s1', title: 'HNSW' }),
      raw({ op: 'add_stage', key: 'new-s1', after: 's1', title: 'Vector DBs' }),
    ])
    expect(v.dropped).toEqual([])
    const [topic, stage] = v.checked // Claude's order is kept
    expect(stage.change).toMatchObject({ op: 'add_stage', id: 'new1', after: 'S1', row: { title: 'Vector DBs' } })
    expect(topic.change).toMatchObject({ op: 'add_topic', id: 'new2', stage: 'new1', after: null, row: { title: 'HNSW', importance: 'rec' } })
    expect(topic.dependsOn).toEqual([stage.n])
  })

  it("folds a new resource's links into it as hidden rows, ignoring refs that are not topics", () => {
    const v = run([raw({
      op: 'add_resource', key: 'new-r1', stage: 's2', title: 'Free RAG course', kind: 'course',
      url: 'https://free.example.com/rag', covers: ['t3', 't99', 'r1'], primary_for: ['t3'],
    })])
    expect(v.checked).toHaveLength(2)
    const [res, link] = v.checked
    expect(link).toMatchObject({ hidden: true, dependsOn: [res.n], change: { op: 'link', topic: 'Tc', resource: 'new1', primary: true } })
    expect(visible(v.checked)).toEqual([res])
  })

  it('blanks a url that is not http(s) and defaults an unknown kind', () => {
    const v = run([raw({ op: 'add_resource', key: 'new-r1', stage: 's1', title: 'X', url: 'javascript:alert(1)', kind: 'podcast' })])
    expect(v.checked[0].change).toMatchObject({ row: { url: '', kind: 'other' } })
  })

  it('duplicate keys: drops a second add with the same key, and a key that is an existing ref', () => {
    const v = run([
      raw({ op: 'add_topic', key: 'new-t1', stage: 's1', title: 'First' }),
      raw({ op: 'add_topic', key: 'new-t1', stage: 's1', title: 'Second' }),
      raw({ op: 'add_topic', key: 't1', stage: 's1', title: 'Clash' }),
    ])
    expect(v.checked).toHaveLength(1)
    expect(v.checked[0].change).toMatchObject({ row: { title: 'First' } })
    expect(v.dropped).toHaveLength(2)
  })

  it('drops an add whose stage does not exist, or that has no title', () => {
    const v = run([
      raw({ op: 'add_topic', key: 'k1', stage: 's9', title: 'Lost' }),
      raw({ op: 'add_topic', key: 'k2', stage: 's1', title: '  ' }),
    ])
    expect(v.checked).toEqual([])
    expect(v.dropped).toHaveLength(2)
  })
})

describe('validate: updating and moving', () => {
  it('drops unknown refs and refs of the wrong kind', () => {
    const v = run([
      raw({ op: 'update_item', ref: 's1', title: 'A stage is not an item' }),
      raw({ op: 'update_stage', ref: 't1', title: 'A topic is not a stage' }),
      raw({ op: 'update_item', ref: 'x9', title: 'Nothing' }),
      raw({ op: 'teleport', ref: 't1' }),
    ])
    expect(v.checked).toEqual([])
    expect(v.dropped).toHaveLength(4)
  })

  it('keeps only fields that change, and ignores a bad url', () => {
    const v = run([raw({ op: 'update_item', ref: 'r2', title: 'Paid RAG bootcamp', cost: 'Free', url: 'ftp://x' })])
    expect(v.checked[0].change).toEqual({ op: 'update_item', table: 'resources', id: 'Ry', patch: { cost: 'Free' } })
  })

  it('drops updates that change nothing', () => {
    const v = run([
      raw({ op: 'update_item', ref: 't1', title: 'Prompting' }),
      raw({ op: 'update_stage', ref: 's1', pace: 'Week 1' }),
      raw({ op: 'update_roadmap', title: 'AI Engineering' }),
    ])
    expect(v.checked).toEqual([])
    expect(v.dropped).toHaveLength(3)
  })

  it('a move into a new stage depends on that stage', () => {
    const v = run([
      raw({ op: 'add_stage', key: 'new-s1', title: 'Later' }),
      raw({ op: 'move_item', ref: 't2', stage: 'new-s1', after: 'start' }),
    ])
    const [stage, move] = v.checked
    expect(move.change).toEqual({ op: 'move_item', table: 'topics', id: 'Tb', stage: 'new1', after: 'start' })
    expect(move.dependsOn).toEqual([stage.n])
  })

  it('restores only archived items', () => {
    const v = run([raw({ op: 'restore_item', ref: 't3' }), raw({ op: 'restore_item', ref: 't1' })])
    expect(v.checked.map((c) => c.change)).toEqual([{ op: 'restore_item', table: 'topics', id: 'Tc' }])
    expect(v.dropped).toHaveLength(1)
  })
})

describe('validate: links', () => {
  it('keeps one primary per topic: the last one wins', () => {
    const v = run([
      raw({ op: 'link', topic: 't2', resource: 'r2', primary: true }),
      raw({ op: 'link', topic: 't2', resource: 'r1', primary: true }),
    ])
    expect(v.checked.map((c) => c.change)).toEqual([
      { op: 'link', topic: 'Tb', resource: 'Ry', primary: false },
      { op: 'link', topic: 'Tb', resource: 'Rx', primary: true },
    ])
  })

  it('drops a link that already exists and an unlink of things not linked', () => {
    const v = run([
      raw({ op: 'link', topic: 't2', resource: 'r1' }),
      raw({ op: 'unlink', topic: 't3', resource: 'r1' }),
    ])
    expect(v.checked).toEqual([])
    expect(v.dropped).toHaveLength(2)
  })
})

describe('the removal rule', () => {
  const archive = (fields: Record<string, unknown>) => raw({ op: 'archive_item', ref: 'r2', reason: 'Paid and dated', ...fields })

  it('pre-ticks an archive the learner asked for, quoting their words', () => {
    const v = run([archive({ requested_by_user: true, quote: 'swap the paid RAG bootcamp' })], 'Swap the paid RAG bootcamp for a free course')
    expect(v.checked.map((c) => c.change)).toEqual([{ op: 'archive_item', table: 'resources', id: 'Ry' }])
    expect(v.asks).toEqual([])
  })

  it('asks instead when Claude says the learner did not ask', () => {
    const v = run([archive({ requested_by_user: false, quote: '' })], 'Add a stage on Kafka')
    expect(v.checked).toEqual([])
    expect(v.asks).toMatchObject([{ table: 'resources', id: 'Ry', title: 'Paid RAG bootcamp', text: 'Paid and dated' }])
  })

  it('asks when the quote is not in the message', () => {
    const v = run([archive({ requested_by_user: true, quote: 'remove the bootcamp' })], 'Add a stage on Kafka')
    expect(v.checked).toEqual([])
    expect(v.asks).toHaveLength(1)
  })

  it('asks when the quote has no removal word', () => {
    const v = run([archive({ requested_by_user: true, quote: 'the paid RAG bootcamp is old' })], 'the paid RAG bootcamp is old')
    expect(v.asks).toHaveLength(1)
  })

  it('negated request: "don\'t remove anything" never pre-ticks an archive', () => {
    const v = run([archive({ requested_by_user: true, quote: 'remove anything' })], "Don't remove anything, just add a stage on Kafka")
    expect(v.checked).toEqual([])
    expect(v.asks).toHaveLength(1)
  })

  it('drops an archive of something already archived', () => {
    const v = run([raw({ op: 'archive_item', ref: 't3', requested_by_user: true, quote: 'remove chunking' })], 'remove chunking')
    expect(v.checked).toEqual([])
    expect(v.dropped).toHaveLength(1)
  })

  it("turns Claude's questions into asks, once per item, ignoring stages and unknown refs", () => {
    const v = run([], 'tidy it', [
      { ref: 'r1', text: 'It overlaps the docs.' }, { ref: 'r1', text: 'Again.' }, { ref: 's1', text: 'x' }, { ref: 'zz', text: 'x' },
    ])
    expect(v.asks).toMatchObject([{ id: 'Rx', text: 'It overlaps the docs.' }])
  })

  it("normalises case, spacing and curly quotes", () => {
    expect(userAskedToRemove("REMOVE   the  ‘Intro’ video please", "remove the ‘intro’ video")).toBe(true)
    expect(userAskedToRemove('Please drop the intro video', 'drop the intro video')).toBe(true)
    expect(userAskedToRemove('Never remove the intro video', 'remove the intro video')).toBe(false)
    expect(userAskedToRemove('remove', 'rm')).toBe(false)
  })

  it("doesn’t pre-tick when negation appears in the same sentence", () => {
    expect(userAskedToRemove("Don’t remove the paid RAG bootcamp", 'remove the paid RAG bootcamp')).toBe(false)
    expect(userAskedToRemove("Don’t, under any circumstances, remove the paid bootcamp", 'remove the paid bootcamp')).toBe(false)
    expect(userAskedToRemove('Instead of removing the course, add a free one', 'removing the course')).toBe(false)
  })

  it('allows negation in a different sentence', () => {
    expect(userAskedToRemove("Remove the bootcamp. Don’t touch the docs.", 'Remove the bootcamp')).toBe(true)
    expect(userAskedToRemove('Add a Kafka stage; remove the YouTube playlist', 'remove the YouTube playlist')).toBe(true)
  })

  it('rejects archives with curly apostrophes in negation (validate level)', () => {
    const archive = raw({ op: 'archive_item', ref: 'r2', reason: 'Paid and dated', requested_by_user: true, quote: 'remove anything' })
    const v = run([archive], "Don’t remove anything, just add a stage on Kafka")
    expect(v.checked).toEqual([])
    expect(v.asks).toHaveLength(1)
  })
})

describe('validate: malformed answers', () => {
  it('never throws, and lists entries it could not use', () => {
    const bundle = testBundle()
    const { refs } = roadmapForPrompt(bundle)
    for (const bad of [null, 42, {}, { changes: 'x', questions: 'y' }]) {
      expect(validate(bad, bundle, 'hi', refs)).toEqual({ checked: [], asks: [], dropped: [] })
    }
    const v = validate({ changes: [null, 42, { op: 'add_topic' }] }, bundle, 'hi', refs)
    expect(v.checked).toEqual([])
    expect(v.dropped).toHaveLength(3)
  })
})

describe('toggle and confirmAsk', () => {
  const plan = () => run([
    raw({ op: 'add_stage', key: 'new-s1', title: 'Vector DBs' }),
    raw({ op: 'add_topic', key: 'new-t1', stage: 'new-s1', title: 'HNSW' }),
    raw({ op: 'add_resource', key: 'new-r1', stage: 's1', title: 'Vector course', covers: ['new-t1'] }),
  ]).checked

  it('unticking a new stage unticks its topic and the link to that topic', () => {
    const checked = plan()
    const [stage, , res] = checked
    const after = toggle(checked, new Set(checked.map((c) => c.n)), stage.n)
    expect([...after]).toEqual([res.n])
  })

  it('ticking the topic again brings back its stage and the hidden link', () => {
    const checked = plan()
    const [stage, topic] = checked
    const off = toggle(checked, new Set(checked.map((c) => c.n)), stage.n)
    const on = toggle(checked, off, topic.n)
    expect([...on].sort()).toEqual(checked.map((c) => c.n).sort())
  })

  it('confirmAsk turns a question into a ticked archive', () => {
    const c = confirmAsk({ n: 7, table: 'resources', id: 'Ry', title: 'Paid RAG bootcamp', text: 'old' }, 9)
    expect(c).toEqual({ n: 9, summary: 'Archive "Paid RAG bootcamp"', change: { op: 'archive_item', table: 'resources', id: 'Ry' }, dependsOn: [] })
  })
})
