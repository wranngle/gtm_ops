---
id: STACK-015
priority: 2
labels: stack,symphony-elixir,tracker,linear,spec-section-11
blocked_by:
---
# Add the Linear tracker adapter (spec section 11)

`tools/symphony-elixir/lib/symphony/tracker.ex` declares `:linear` as a supported `tracker.kind` and `Symphony.Tracker.adapter_for/1` routes to `Symphony.Tracker.Linear`, but no such module exists. Boot fails with `:undef` if anyone configures `tracker.kind: linear`.

Build `Symphony.Tracker.Linear` per spec section 11.2:

- POST GraphQL queries to the configured `tracker.endpoint` (default `https://api.linear.app/graphql`).
- `Authorization` header carries `tracker.api_key` (resolved from `$LINEAR_API_KEY` per spec 5.3.1).
- Filter candidate issues using `project: { slugId: { eq: $projectSlug } }` and `state.name in tracker.active_states`.
- Issue-state refresh query uses GraphQL issue IDs with variable type `[ID!]`.
- Page candidate fetches at 50 per page (spec 11.2 default) until `endCursor` is exhausted; surface `linear_missing_end_cursor` per spec 11.4 if the cursor is absent mid-pagination.
- 30-second network timeout (spec 11.2).
- Normalize per spec 11.3: `labels` -> lowercase, `blocked_by` -> derived from inverse `blocks` relation, `priority` -> integer-only, `created_at` / `updated_at` -> ISO-8601.

Acceptance criteria:

- New module `Symphony.Tracker.Linear` implementing the `Symphony.Tracker` behaviour.
- Spec section 11.4 error categories surface as typed errors (`unsupported_tracker_kind`, `missing_tracker_api_key`, `missing_tracker_project_slug`, `linear_api_request`, `linear_api_status`, `linear_graphql_errors`, `linear_unknown_payload`, `linear_missing_end_cursor`).
- Unit tests exercise the GraphQL request shape and the normalization paths against fixture payloads (no live HTTP).
- A `:Bypass`- or `:Plug.Test`-based mock end-to-end test covers pagination and one error case.
- Transport: `Mint`, `Finch`, or `:httpc`; pick whichever keeps the dep tree small. (Probably `:httpc` since `:inets` ships with OTP.)

Note: tracker writes (ticket transitions, comments) remain out of scope per spec section 11.5 - those are agent-tool responsibilities.
