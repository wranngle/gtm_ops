---
id: STACK-032
priority: 2
labels: stack,symphony-elixir,retry-queue,backoff,spec-section-8
blocked_by: STACK-011
---
# Implement the retry queue with exponential backoff (spec section 8.4)

Spec §8.4 specifies a retry queue with two distinct backoff policies. The
Bash adapter is one-shot and intentionally has no retry queue; this belongs
in the Elixir daemon. STACK-011 covers worker spawn but not the retry
scheduling and backoff math.

## Retry entry creation

- Cancel any existing retry timer for the same `issue_id`.
- Store `attempt`, `identifier`, `error`, `due_at_ms`, and a new timer
  handle in the `retry_attempts` map keyed by `issue_id`.

## Backoff formula

- Normal continuation retries after a clean worker exit: fixed `1000` ms
  delay.
- Failure-driven retries: `delay = min(10000 * 2^(attempt - 1), agent.max_retry_backoff_ms)`.
- The exponent is capped by `agent.max_retry_backoff_ms` (default `300000`
  / 5m).

## Retry handling behavior (§8.4 step list)

1. Re-fetch active candidate issues (NOT all issues).
2. Find the specific issue by `issue_id`.
3. If not found, release the claim.
4. If found and still candidate-eligible:
   - Dispatch if slots are available.
   - Otherwise requeue with error `no available orchestrator slots`.
5. If found but no longer active, release the claim.

## Acceptance criteria

- `RetryEntry` struct matches spec §4.1.7 fields.
- Backoff math has a unit test for: continuation (1s), failure attempt 1
  (10s), failure attempt 2 (20s), failure attempt N capped to
  `max_retry_backoff_ms`.
- Retry handler implements the 5-step §8.4 flow with tests for each
  branch.
- Cancelling a previous retry timer for the same `issue_id` is idempotent.
- The `retry_attempts` map clears the entry once a successful re-dispatch
  happens.

Dependencies: STACK-011 (running map and worker spawn).
