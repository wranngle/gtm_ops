# Generated Research Cache

Runtime cache for LLM-assisted integration research. `lib/proactive-research.ts`
writes here (and reads from here) when the sibling n8n research library
(`N8N_RESEARCH_LIBRARY_PATH`) is not present.

The committed entries are machine-generated summaries kept so the pipeline,
demos, and tests can resolve integration research without LLM keys. Treat them
as regenerable cache, not canonical evidence: when research runs with
`GEMINI_API_KEY`/`GROQ_API_KEY` (and optionally `EXA_API_KEY`/`TAVILY_API_KEY`)
configured, stale entries are refreshed from live source-backed research.
