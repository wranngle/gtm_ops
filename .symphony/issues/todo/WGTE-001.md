---
id: WGTE-001
priority: 1
labels: symphony,scaffold,agent-evals
blocked_by:
---
# Create the first runnable agent-evals package skeleton

Create the initial `packages/agent-evals` package with synthetic fixtures and tests for ElevenLabs-style webhook contracts. The implementation must stay public-safe and fixture-backed.

Acceptance criteria:

- Package directory exists.
- Synthetic fixture names cannot be confused with real customer data.
- Tests can run locally without external services.
- Knowledge-base docs are updated if new commands or package boundaries are introduced.

