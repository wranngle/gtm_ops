---
id: STACK-018
priority: 3
labels: stack,symphony-elixir,observability,humanized-events,spec-section-13
blocked_by: STACK-010
---
# Optional: humanized agent event summaries for the status surface (spec 13.6)

Spec section 13.6 lists "humanized summaries of raw agent protocol events" as optional but recommended. Today the orchestrator only emits structured ECS-jsonl events; a human watching `tail -f .symphony/logs/symphony-elixir.jsonl` sees JSON only, not `"agent started turn 3 on WGTE-009"`-style sentences.

After STACK-010 (Codex adapter) is in place, add a `Symphony.Logging.humanize/1` that takes a streaming Codex event and returns a one-line human summary, then emit that as a separate ECS-jsonl record alongside the raw event (or as a `summary` field on the existing record).

This is observability-only - per spec 13.6 "Do not make orchestrator logic depend on humanized strings."

Acceptance criteria:

- A pure function that maps each `Symphony.AgentRunner.CodexAppServer` event type to a one-line summary.
- An opt-in flag (`:symphony, :humanize_events?`, defaulting to true in dev/prod, false in test).
- Snapshot/dashboard surfaces the latest summary if implemented.
