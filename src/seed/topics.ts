import type { Topic } from './types'

/**
 * 77 topics, spec section 11. Titles, ids, types and stages are from the spec.
 * The one-line `desc` on each is written for this build; the spec lists titles only.
 */
export const TOPICS: Topic[] = [
  // Stage 1: Engineering foundations
  { id: 'T-found-01', stageId: 'found', title: 'Python for AI', type: 'rec', desc: 'Async, typing and FastAPI. Most AI libraries land in Python first, so you read it even if you ship TypeScript.' },
  { id: 'T-found-02', stageId: 'found', title: 'TypeScript for AI', type: 'alt', desc: 'The other half of the ecosystem. Strong types pay off most where model output is unpredictable.' },
  { id: 'T-found-03', stageId: 'found', title: 'HTTP streaming & SSE', type: 'rec', desc: 'Tokens arrive one at a time. Server-sent events are how they reach the browser without a page reload.' },
  { id: 'T-found-04', stageId: 'found', title: 'Schemas: Pydantic / Zod', type: 'rec', desc: 'Describe the shape you want, validate what you got. This is the backbone of structured output and tool calling.' },
  { id: 'T-found-05', stageId: 'found', title: 'Docker, env & secrets', type: 'rec', desc: 'Reproducible runs and API keys that never reach git. The unglamorous thing that causes the most incidents.' },
  { id: 'T-found-06', stageId: 'found', title: 'Math intuition', type: 'opt', desc: 'Vectors, dot products, gradients. Enough to reason about embeddings and cost, not enough to write a paper.' },

  // Stage 2: How LLMs work
  { id: 'T-llm-01', stageId: 'llm', title: 'Tokens & tokenization', type: 'rec', desc: 'Models read fragments, not words. Tokens are the unit you are billed in and the reason odd spellings break things.' },
  { id: 'T-llm-02', stageId: 'llm', title: 'Context window', type: 'rec', desc: 'The working memory of a request. Everything the model knows this turn has to fit inside it.' },
  { id: 'T-llm-03', stageId: 'llm', title: 'Sampling: temperature, top-p', type: 'rec', desc: 'The dials that trade consistency against variety. Low for extraction, higher for drafting.' },
  { id: 'T-llm-04', stageId: 'llm', title: 'Choosing a model', type: 'rec', desc: 'Cost, latency, context length and capability. There is rarely one right answer, only a right answer for this call.' },
  { id: 'T-llm-05', stageId: 'llm', title: 'Reasoning models', type: 'rec', desc: 'Models that think before answering. Better at hard problems, slower and dearer, so use them selectively.' },
  { id: 'T-llm-06', stageId: 'llm', title: 'Transformers & attention', type: 'opt', desc: 'What is actually happening inside. Optional, but it makes every failure mode above make sense.' },

  // Stage 3: Prompt & context engineering
  { id: 'T-prompt-01', stageId: 'prompt', title: 'System prompts', type: 'rec', desc: 'The standing brief: role, boundaries and tone. Set once per feature rather than repeated per message.' },
  { id: 'T-prompt-02', stageId: 'prompt', title: 'Few-shot examples', type: 'rec', desc: 'Showing beats telling. Two or three worked examples usually outperform a paragraph of instructions.' },
  { id: 'T-prompt-03', stageId: 'prompt', title: 'Structured outputs', type: 'rec', desc: 'Getting JSON you can rely on, by constraining the model to a schema instead of parsing prose.' },
  { id: 'T-prompt-04', stageId: 'prompt', title: 'Context engineering', type: 'rec', desc: 'Deciding what goes into the window and what stays out. Usually the highest-leverage change you can make.' },
  { id: 'T-prompt-05', stageId: 'prompt', title: 'Prompt caching', type: 'rec', desc: 'Reuse the unchanging prefix across calls. Cuts cost and latency sharply on long system prompts.' },
  { id: 'T-prompt-06', stageId: 'prompt', title: 'Prompt versioning', type: 'alt', desc: 'Prompts are code. Version them, diff them, and know which one produced a given result.' },

  // Stage 4: Building with LLM APIs
  { id: 'T-api-01', stageId: 'api', title: 'Provider SDKs', type: 'rec', desc: 'Messages, streaming, system prompts and token counts, as each provider actually exposes them.' },
  { id: 'T-api-02', stageId: 'api', title: 'Tool / function calling', type: 'rec', desc: 'Letting the model call your code. The single mechanism everything agentic is built on.' },
  { id: 'T-api-03', stageId: 'api', title: 'Retries, timeouts, rate limits', type: 'rec', desc: 'Model APIs fail more than you expect. Backoff, idempotency and sensible timeouts are not optional.' },
  { id: 'T-api-04', stageId: 'api', title: 'Vercel AI SDK', type: 'rec', desc: 'One TypeScript interface across providers, with streaming and tool calls wired to the UI.' },
  { id: 'T-api-05', stageId: 'api', title: 'LangChain / LlamaIndex', type: 'alt', desc: 'Batteries-included frameworks. Fast to start, worth understanding even if you end up writing it yourself.', capstoneOnly: true },
  { id: 'T-api-06', stageId: 'api', title: 'Batch APIs', type: 'opt', desc: 'Half price if you can wait. Good for backfills, evals and anything not in front of a user.' },

  // Stage 5: Embeddings & vector databases
  { id: 'T-vec-01', stageId: 'vec', title: 'Embedding models', type: 'rec', desc: 'Turning text into a vector whose position means something. Dimension and domain fit matter more than leaderboard rank.' },
  { id: 'T-vec-02', stageId: 'vec', title: 'Similarity metrics', type: 'rec', desc: 'Cosine, dot product, Euclidean. Pick the one your embedding model was trained for.' },
  { id: 'T-vec-03', stageId: 'vec', title: 'ANN indexes: HNSW, IVF', type: 'rec', desc: 'Approximate search that trades a little recall for a lot of speed. The knobs here decide your latency.' },
  { id: 'T-vec-04', stageId: 'vec', title: 'pgvector on Postgres', type: 'rec', desc: 'Vectors in the database you already run. Usually the right first answer, and it joins to your real tables.' },
  { id: 'T-vec-05', stageId: 'vec', title: 'Supabase / Neon', type: 'rec', desc: 'Managed Postgres with pgvector on the free tier. Fastest route from idea to working retrieval.' },
  { id: 'T-vec-06', stageId: 'vec', title: 'Qdrant / Pinecone / Weaviate', type: 'alt', desc: 'Purpose-built vector databases. Worth the extra vendor once scale or filtering outgrows Postgres.' },
  { id: 'T-vec-07', stageId: 'vec', title: 'MongoDB Atlas Vector Search', type: 'alt', desc: 'Vector search beside your documents, if Mongo is already where your data lives.' },
  { id: 'T-vec-08', stageId: 'vec', title: 'Metadata filtering', type: 'rec', desc: 'Search within a tenant, a date range or a permission set. The feature that makes retrieval safe in production.' },

  // Stage 6: Retrieval-augmented generation
  { id: 'T-rag-01', stageId: 'rag', title: 'Ingestion & parsing', type: 'rec', desc: 'PDFs, HTML and tables into clean text. Unglamorous, and where most RAG quality is won or lost.' },
  { id: 'T-rag-02', stageId: 'rag', title: 'Chunking strategies', type: 'rec', desc: 'How you cut documents decides what can be retrieved. Respect structure rather than counting characters.' },
  { id: 'T-rag-03', stageId: 'rag', title: 'Hybrid search', type: 'rec', desc: 'Keyword and vector search together. Catches exact terms that embeddings miss, like error codes and names.' },
  { id: 'T-rag-04', stageId: 'rag', title: 'Reranking', type: 'rec', desc: 'A second, smarter pass over the top results. Often the cheapest large quality win available.' },
  { id: 'T-rag-05', stageId: 'rag', title: 'Citations & grounding', type: 'rec', desc: 'Every claim traceable to a source. This is what makes an answer checkable instead of merely plausible.' },
  { id: 'T-rag-06', stageId: 'rag', title: 'Agentic RAG', type: 'rec', desc: 'Let the model decide when and what to retrieve, and search again if the first attempt was thin.' },
  { id: 'T-rag-07', stageId: 'rag', title: 'Query rewriting', type: 'alt', desc: 'Turning a vague question into good search terms before retrieval runs.' },
  { id: 'T-rag-08', stageId: 'rag', title: 'GraphRAG', type: 'opt', desc: 'Retrieval over a knowledge graph. Strong on questions that need connections, not just passages.', capstoneOnly: true },

  // Stage 7: AI agents
  { id: 'T-agents-01', stageId: 'agents', title: 'The agent loop', type: 'rec', desc: 'Think, call a tool, read the result, repeat until done. Everything else is a variation on this.' },
  { id: 'T-agents-02', stageId: 'agents', title: 'Design patterns', type: 'rec', desc: 'Reflection, planning, tool use and routing. Named shapes that save you from reinventing them badly.' },
  { id: 'T-agents-03', stageId: 'agents', title: 'Memory', type: 'rec', desc: 'What an agent carries between turns and between sessions, and what it should deliberately forget.' },
  { id: 'T-agents-04', stageId: 'agents', title: 'MCP', type: 'rec', desc: 'A standard way to hand tools and data to a model, so an integration works across clients.' },
  { id: 'T-agents-05', stageId: 'agents', title: 'Human-in-the-loop', type: 'rec', desc: 'Pausing for approval before anything expensive or irreversible. The main thing that makes agents shippable.' },
  { id: 'T-agents-06', stageId: 'agents', title: 'LangGraph', type: 'rec', desc: 'Agents as an explicit graph of steps, with state, branching and resumable runs.' },
  { id: 'T-agents-07', stageId: 'agents', title: 'Multi-agent orchestration', type: 'alt', desc: 'Several specialised agents with a coordinator. Powerful, and a fast way to multiply your token bill.' },
  { id: 'T-agents-08', stageId: 'agents', title: 'A2A protocol', type: 'opt', desc: 'An emerging standard for agents built by different teams to talk to one another.' },

  // Stage 8: Evaluation
  { id: 'T-evals-01', stageId: 'evals', title: 'Error analysis first', type: 'rec', desc: 'Read a hundred real failures and label them before you write a single metric. Skipping this wastes the rest.' },
  { id: 'T-evals-02', stageId: 'evals', title: 'Golden datasets', type: 'rec', desc: 'A small, curated set of cases with known-good answers. Your regression suite for fuzzy output.' },
  { id: 'T-evals-03', stageId: 'evals', title: 'LLM-as-judge', type: 'rec', desc: 'Using a model to grade output against a rubric. Cheap and scalable, and needs checking against humans.' },
  { id: 'T-evals-04', stageId: 'evals', title: 'RAG metrics', type: 'rec', desc: 'Faithfulness, relevance, recall. Separates "retrieval found nothing" from "the model ignored it".' },
  { id: 'T-evals-05', stageId: 'evals', title: 'Evals in CI', type: 'rec', desc: 'Run the suite on every pull request, so a prompt tweak cannot quietly make things worse.' },
  { id: 'T-evals-06', stageId: 'evals', title: 'Synthetic test data', type: 'alt', desc: 'Generating edge cases you do not have real examples of yet, to get a suite started.' },

  // Stage 9: Observability & LLMOps
  { id: 'T-ops-01', stageId: 'ops', title: 'Tracing with OpenTelemetry', type: 'rec', desc: 'One vendor-neutral trace per request, spanning every model and tool call inside it.' },
  { id: 'T-ops-02', stageId: 'ops', title: 'Langfuse', type: 'rec', desc: 'Open-source LLM tracing you can self-host. Prompts, costs and scores in one place.' },
  { id: 'T-ops-03', stageId: 'ops', title: 'LangSmith', type: 'alt', desc: 'The hosted equivalent from LangChain. Slicker if you are already in that ecosystem.' },
  { id: 'T-ops-04', stageId: 'ops', title: 'Cost & token tracking', type: 'rec', desc: 'Cost per request, per user and per feature. Without it, the bill is a monthly surprise.' },
  { id: 'T-ops-05', stageId: 'ops', title: 'Caching', type: 'alt', desc: 'Response and semantic caching for repeated questions. Cuts both latency and spend.' },
  { id: 'T-ops-06', stageId: 'ops', title: 'Monitoring & feedback', type: 'rec', desc: 'Thumbs up and down wired to traces, so production tells you what to fix next.' },

  // Stage 10: Security & guardrails
  { id: 'T-sec-01', stageId: 'sec', title: 'Prompt injection', type: 'rec', desc: 'Instructions hidden in retrieved content or user input. There is no complete fix, only containment.' },
  { id: 'T-sec-02', stageId: 'sec', title: 'Least-privilege tools', type: 'rec', desc: 'Give an agent the narrowest tool that does the job. Assume it will be tricked into using everything it has.' },
  { id: 'T-sec-03', stageId: 'sec', title: 'PII & data residency', type: 'rec', desc: 'What leaves your boundary, where it is processed and what the provider retains.' },
  { id: 'T-sec-04', stageId: 'sec', title: 'Output validation', type: 'rec', desc: 'Validate model output before it touches a database, an API or a screen. Treat it as untrusted input.' },
  { id: 'T-sec-05', stageId: 'sec', title: 'OWASP LLM Top 10', type: 'rec', desc: 'The industry checklist of LLM-specific risks. A short read that reframes how you design.' },
  { id: 'T-sec-06', stageId: 'sec', title: 'Content safety filters', type: 'alt', desc: 'Moderation on the way in and out, and deciding what your product refuses to do.' },

  // Stage 11: Deployment
  { id: 'T-deploy-01', stageId: 'deploy', title: 'API layer', type: 'rec', desc: 'Streaming endpoints, auth and back-pressure. The seam between your model calls and everything else.' },
  { id: 'T-deploy-02', stageId: 'deploy', title: 'Containers', type: 'rec', desc: 'Packaging the runtime so it behaves the same on your laptop and in production.' },
  { id: 'T-deploy-03', stageId: 'deploy', title: 'Serverless & edge', type: 'rec', desc: 'Scale to zero and start near the user. Watch execution limits on long agent runs.' },
  { id: 'T-deploy-04', stageId: 'deploy', title: 'Background jobs & queues', type: 'rec', desc: 'Anything slower than a few seconds belongs off the request path, with a way to poll for the result.' },
  { id: 'T-deploy-05', stageId: 'deploy', title: 'Scaling & cost control', type: 'rec', desc: 'Rate limits, spend caps and per-user budgets, set before the traffic arrives rather than after.' },
  { id: 'T-deploy-06', stageId: 'deploy', title: 'Cloud AI platforms', type: 'alt', desc: 'Bedrock, Vertex and Foundry. The route in when compliance decides where models may run.' },

  // Stage 12: Going further
  { id: 'T-beyond-01', stageId: 'beyond', title: 'Fine-tuning & LoRA', type: 'opt', desc: 'Teaching a model a format or a style. Reach for it after prompting and retrieval have run out.' },
  { id: 'T-beyond-02', stageId: 'beyond', title: 'Local models', type: 'opt', desc: 'Running open-weight models on your own hardware, for privacy, cost or offline use.' },
  { id: 'T-beyond-03', stageId: 'beyond', title: 'Multimodal', type: 'opt', desc: 'Images, audio and video in and out. Where a lot of the interesting product surface now is.' },
  { id: 'T-beyond-04', stageId: 'beyond', title: 'Voice agents', type: 'opt', desc: 'Speech in, speech out, with latency budgets tight enough to feel like a conversation.', capstoneOnly: true },
  { id: 'T-beyond-05', stageId: 'beyond', title: 'Cloud AI certification', type: 'alt', desc: 'A credential for the CV. Useful where procurement or an employer asks for one.' },
]
