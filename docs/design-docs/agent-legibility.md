# Agent Legibility

Status: Active
Owner: wranngle
Last reviewed: 2026-04-30

Agent legibility means the repository exposes enough structure, context, and feedback for agents to reason about the system without relying on human memory.

## What Must Be Legible

- Product intent: what the system is for and what it is not for.
- Architecture: package boundaries and dependency direction.
- Data shapes: fixtures, schemas, SQL models, and boundary parsers.
- Verification: tests, validators, screenshots, logs, and eventually metrics.
- Plans: active work, completed decisions, and known debt.
- Security posture: what must never be public and how to verify release safety.

## Feedback Loops To Build

1. Knowledge-base validation.
2. Agent eval contract tests.
3. Python/SQL reconciliation tests.
4. Ops-console UI snapshots once the UI exists.
5. Local observability once runtime services exist.

The goal is not to maximize documentation volume. The goal is to make the next correct action discoverable.

