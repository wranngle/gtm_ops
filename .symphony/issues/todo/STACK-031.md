---
id: STACK-031
priority: 2
labels: stack,symphony-elixir,token-accounting,rate-limits,spec-section-13
blocked_by: STACK-010
---
# Implement token accounting and rate-limit tracking (spec section 13.5)

Spec §13.5 defines token accounting and rate-limit tracking that the daemon
should aggregate from coding-agent stream events. The Bash adapter cannot
do this — it shells out to a one-shot LLM command and discards the
intermediate stream. This belongs in the Elixir daemon once the JSON-RPC
adapter (STACK-010) lands.

## Token accounting rules (from §13.5)

- Prefer absolute thread totals (`thread/tokenUsage/updated`,
  `total_token_usage` within token-count wrapper events).
- Ignore delta-style `last_token_usage` for dashboard/API totals.
- Extract input/output/total token counts leniently from common field names
  in the selected payload.
- For absolute totals, track deltas relative to last reported totals to
  avoid double-counting.
- Do NOT treat generic `usage` maps as cumulative totals unless the event
  type defines them that way.
- Accumulate aggregate totals in orchestrator state.

## Runtime accounting

- Report runtime as a live aggregate at snapshot/render time (see
  STACK-030).
- Maintain a cumulative counter for ended sessions plus active-session
  elapsed time derived from `running.started_at`.
- Add run duration seconds to the cumulative ended-session runtime when a
  session ends (normal exit or cancellation/termination).
- Continuous background ticking of runtime totals is NOT required.

## Rate-limit tracking

- Track the latest rate-limit payload seen in any agent update.
- Any human-readable presentation is implementation-defined.

## Acceptance criteria

- `LiveSession` struct (from STACK-016) gains `codex_input_tokens`,
  `codex_output_tokens`, `codex_total_tokens`, and the
  `last_reported_*` mirrors per spec §4.1.6.
- `OrchestratorRuntimeState` accumulates `codex_totals` (delta-aware) and
  `codex_rate_limits` per spec §4.1.8.
- Tests cover: absolute total handling, delta double-count avoidance, and
  ignoring of unsupported `usage` payloads.

Dependencies: STACK-010 (need the real Codex JSON-RPC stream to extract
token events from).
