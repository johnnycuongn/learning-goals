import type { Stage } from './types'

/** Stage order, descriptions and analogies are from spec section 11. */
const meta = [
  {
    id: 'found',
    title: 'Engineering foundations',
    pace: 'Week 0',
    desc: 'The plumbing every AI app sits on. You already have most of it, so treat this as gap-filling.',
    analogy: 'Like learning a new cuisine: the knives and the stove stay the same, only the recipes change.',
  },
  {
    id: 'llm',
    title: 'How LLMs work',
    pace: 'Week 1',
    desc: 'Not the research math: the mental model that explains cost, latency and the ways models fail.',
    analogy: 'A very well-read autocomplete. It predicts the next word from everything it has read, so it can be fluent and still confidently wrong.',
  },
  {
    id: 'prompt',
    title: 'Prompt & context engineering',
    pace: 'Week 1',
    desc: 'Getting reliable behaviour by controlling exactly what the model sees and how it is asked.',
    analogy: 'Briefing a smart new contractor. A clear brief with examples and boundaries gets better work than a vague one-liner.',
  },
  {
    id: 'api',
    title: 'Building with LLM APIs',
    pace: 'Week 2',
    desc: 'Calling models from real code: streaming, tools, failure handling and a framework that fits your stack.',
    analogy: "Ordering by phone from a busy restaurant. You stream the order, handle 'we're full right now', and call back politely.",
    note: 'Milestone: you can ship a streaming chat feature.',
  },
  {
    id: 'vec',
    title: 'Embeddings & vector databases',
    pace: 'Week 3',
    desc: 'Turning text into numbers that capture meaning, and storing them so you can search by similarity.',
    analogy: 'Embeddings are GPS coordinates for meaning. A vector database is the map that finds what is nearby.',
  },
  {
    id: 'rag',
    title: 'Retrieval-augmented generation',
    pace: 'Weeks 4 to 5',
    desc: 'Grounding answers in your own data by retrieving relevant chunks before the model responds.',
    analogy: 'An open-book exam. Instead of memorising, the model looks up the right pages before answering.',
    note: 'Milestone: answers from your own documents, with citations.',
  },
  {
    id: 'agents',
    title: 'AI agents',
    pace: 'Weeks 6 to 7',
    desc: 'Models that plan, call tools in a loop and act, with you deciding where the guardrails go.',
    analogy: 'An intern with a toolbox and a checklist. It plans, uses tools, checks its work and asks before doing anything risky.',
    note: 'Milestone: something that plans and acts, not just answers.',
  },
  {
    id: 'evals',
    title: 'Evaluation',
    pace: 'Week 8',
    desc: 'Knowing whether a change made your app better or worse, with evidence instead of vibes.',
    analogy: 'Unit tests for fuzzy outputs. You cannot assert an exact string, so you grade against a rubric.',
    note: 'Milestone: you can prove a change made it better.',
  },
  {
    id: 'ops',
    title: 'Observability & LLMOps',
    pace: 'Week 9',
    desc: 'Seeing what your app does in production: every prompt, tool call, cost and failure.',
    analogy: 'A flight recorder for every request. When something goes wrong you replay exactly what the model saw.',
  },
  {
    id: 'sec',
    title: 'Security & guardrails',
    pace: 'Week 9',
    desc: 'LLMs introduce new attack surfaces. Design so a misbehaving model cannot do real damage.',
    analogy: 'Treat model output like input from a stranger: validate it before it touches anything important.',
  },
  {
    id: 'deploy',
    title: 'Deployment',
    pace: 'Week 10 onwards',
    desc: 'Shipping it: an API, a runtime, background work for long tasks and a budget that holds.',
    analogy: 'Moving from a home kitchen to a restaurant. Same recipes, but now you need queues, timers and a budget.',
    note: 'Milestone: portfolio-ready. Ship the capstone.',
  },
  {
    id: 'beyond',
    title: 'Going further',
    pace: 'Later',
    desc: 'Specialist skills worth picking up once you have shipped the core.',
    analogy: 'Specialist tools in a workshop. Great once you know which job needs them.',
  },
  {
    id: 'capstone',
    title: 'Capstone project',
    pace: 'Throughout',
    desc: 'Build one of these as you go. It is the thing that actually gets you hired.',
  },
] as const

/** Which items branch above and below the spine, per view. */
const topicLayout: Record<string, Stage['layout']> = {
  found: {
    above: [{ cols: 1, items: ['T-found-01', 'T-found-02', 'T-found-03'] }],
    below: [{ cols: 1, items: ['T-found-04', 'T-found-05', 'T-found-06'] }],
  },
  llm: {
    above: [{ cols: 1, items: ['T-llm-01', 'T-llm-02', 'T-llm-03'] }],
    below: [{ cols: 1, items: ['T-llm-04', 'T-llm-05', 'T-llm-06'] }],
  },
  prompt: {
    above: [{ cols: 1, items: ['T-prompt-01', 'T-prompt-02', 'T-prompt-03'] }],
    below: [{ cols: 1, items: ['T-prompt-04', 'T-prompt-05', 'T-prompt-06'] }],
  },
  api: {
    above: [{ cols: 1, items: ['T-api-01', 'T-api-02', 'T-api-03'] }],
    below: [{ cols: 1, items: ['T-api-04', 'T-api-05', 'T-api-06'] }],
  },
  vec: {
    above: [{ group: 'Vector stores', cols: 2, items: ['T-vec-04', 'T-vec-05', 'T-vec-06', 'T-vec-07'] }],
    below: [{ cols: 2, items: ['T-vec-01', 'T-vec-02', 'T-vec-03', 'T-vec-08'] }],
  },
  rag: {
    above: [{ cols: 2, items: ['T-rag-01', 'T-rag-02', 'T-rag-03', 'T-rag-04'] }],
    below: [{ cols: 2, items: ['T-rag-05', 'T-rag-06', 'T-rag-07', 'T-rag-08'] }],
  },
  agents: {
    above: [{ cols: 2, items: ['T-agents-01', 'T-agents-02', 'T-agents-03', 'T-agents-04'] }],
    below: [{ cols: 2, items: ['T-agents-05', 'T-agents-06', 'T-agents-07', 'T-agents-08'] }],
  },
  evals: {
    above: [{ cols: 1, items: ['T-evals-01', 'T-evals-02', 'T-evals-03'] }],
    below: [{ cols: 1, items: ['T-evals-04', 'T-evals-05', 'T-evals-06'] }],
  },
  ops: {
    above: [{ group: 'Tracing', cols: 1, items: ['T-ops-01', 'T-ops-02', 'T-ops-03'] }],
    below: [{ cols: 1, items: ['T-ops-04', 'T-ops-05', 'T-ops-06'] }],
  },
  sec: {
    above: [{ cols: 1, items: ['T-sec-01', 'T-sec-02', 'T-sec-03'] }],
    below: [{ cols: 1, items: ['T-sec-04', 'T-sec-05', 'T-sec-06'] }],
  },
  deploy: {
    above: [{ cols: 1, items: ['T-deploy-01', 'T-deploy-02', 'T-deploy-03'] }],
    below: [{ cols: 1, items: ['T-deploy-04', 'T-deploy-05', 'T-deploy-06'] }],
  },
  beyond: {
    above: [{ cols: 1, items: ['T-beyond-01', 'T-beyond-02', 'T-beyond-03'] }],
    below: [{ cols: 1, items: ['T-beyond-04', 'T-beyond-05'] }],
  },
}

const courseLayout: Record<string, Stage['layout']> = {
  found: {
    above: [{ cols: 1, items: ['C-found-01', 'C-found-02'] }],
    below: [{ cols: 1, items: ['C-found-03', 'C-found-04'] }],
  },
  llm: {
    above: [{ cols: 1, items: ['C-llm-01'] }],
    below: [{ cols: 1, items: ['C-llm-02'] }],
  },
  prompt: {
    above: [{ cols: 1, items: ['C-prompt-01'] }],
    below: [{ cols: 1, items: ['C-prompt-02'] }],
  },
  api: {
    above: [{ cols: 1, items: ['C-api-01', 'C-api-02'] }],
    below: [{ cols: 1, items: ['C-api-03', 'C-api-04'] }],
  },
  vec: {
    above: [{ cols: 1, items: ['C-vec-01', 'C-vec-02'] }],
    below: [{ cols: 1, items: ['C-vec-03', 'C-vec-04'] }],
  },
  rag: {
    above: [{ cols: 1, items: ['C-rag-01', 'C-rag-02'] }],
    below: [{ cols: 1, items: ['C-rag-03'] }],
  },
  agents: {
    above: [{ cols: 1, items: ['C-agents-01', 'C-agents-02', 'C-agents-03', 'C-agents-04'] }],
    below: [{ cols: 1, items: ['C-agents-05', 'C-agents-06', 'C-agents-07'] }],
  },
  evals: {
    above: [{ cols: 1, items: ['C-evals-01'] }],
    below: [{ cols: 1, items: ['C-evals-02'] }],
  },
  ops: {
    above: [{ cols: 1, items: ['C-ops-01', 'C-ops-02'] }],
    below: [{ cols: 1, items: ['C-ops-03'] }],
  },
  sec: {
    above: [{ cols: 1, items: ['C-sec-01'] }],
    below: [{ cols: 1, items: ['C-sec-02'] }],
  },
  deploy: {
    above: [{ cols: 1, items: ['C-deploy-01', 'C-deploy-02'] }],
    below: [{ cols: 1, items: ['C-deploy-03', 'C-deploy-04'] }],
  },
  beyond: {
    above: [{ cols: 1, items: ['C-beyond-01', 'C-beyond-02'] }],
    below: [{ group: 'Certifications', cols: 1, items: ['C-beyond-03', 'C-beyond-04'] }],
  },
  capstone: {
    above: [{ cols: 1, items: ['C-capstone-01', 'C-capstone-02'] }],
    below: [{ cols: 1, items: ['C-capstone-03'] }],
  },
}

function build(layouts: Record<string, Stage['layout']>): Stage[] {
  return meta
    .filter((m) => layouts[m.id])
    .map((m) => ({
      id: m.id,
      title: m.title,
      pace: m.pace,
      desc: m.desc,
      analogy: 'analogy' in m ? m.analogy : undefined,
      note: 'note' in m ? m.note : undefined,
      layout: layouts[m.id],
    }))
}

/** 12 stages: the capstone is a courses-only stage (spec section 3). */
export const TOPIC_STAGES: Stage[] = build(topicLayout)
/** 13 stages: the 12 above plus the capstone. */
export const COURSE_STAGES: Stage[] = build(courseLayout)
