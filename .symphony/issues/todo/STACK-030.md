---
id: STACK-030
priority: 2
labels: stack,symphony-elixir,snapshot,observability,spec-section-13
blocked_by: STACK-011
---
# Implement the runtime Snapshot interface (spec section 13.3)

The Symphony spec §13.3 defines an optional but recommended synchronous
runtime snapshot interface used by dashboards and monitoring. The Bash
adapter is one-shot and intentionally does not expose live state; the Elixir
daemon (`tools/symphony-elixir/`) is the only reasonable home for a live
snapshot.

The snapshot must include:

- `running` — list of running session rows; each row includes `turn_count`
- `retrying` — list of retry queue rows
- `codex_totals` with `input_tokens`, `output_tokens`, `total_tokens`,
  `seconds_running` (live aggregate including in-flight sessions)
- `rate_limits` — latest coding-agent rate limit payload, if available

Recommended snapshot error modes (return shape, not crash): `timeout`,
`unavailable`.

## Acceptance criteria

- A `Symphony.Snapshot.snapshot/0` (or equivalent) returns the documented
  map shape, with one regression test that asserts every field is present.
- `snapshot.seconds_running` is a live aggregate: ended-session counter +
  active-session elapsed time derived from `running.started_at`.
- Snapshot under timeout returns `{:error, :timeout}` (or the equivalent
  enum) without raising.
- Document the snapshot contract in
  `docs/references/symphony-orchestration.md` "Spec Coverage By Adapter".

Dependencies: STACK-011 (the orchestrator must own the live `running` map
before the snapshot can be assembled).

Out of scope:

- HTTP server / dashboard wiring (covered by spec §5.3 extension
  `server.port`, would be a separate issue).
- Token accounting itself (see STACK-031).
