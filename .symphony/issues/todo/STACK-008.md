---
id: STACK-008
priority: 3
labels: stack,llm-chain,codex,agent-command
blocked_by:
---
# Replace the multi-provider LLM chain with a real Codex app-server adapter once available

The Symphony spec defines `codex.command` (default `codex app-server`) as a JSON-RPC-speaking subprocess. This repo currently aliases both `agent.command` and `codex.command` to `scripts/bin/llm.sh`, which speaks plain stdin/stdout against a fallback chain of Gemini, Claude, and `npx @openai/codex exec`. That works for one-shot prompts but does not satisfy the spec's streaming-events contract: Symphony cannot observe `last_codex_event`, `codex_input_tokens`, or `codex_total_tokens` because the chain returns one final blob.

Acceptance criteria:

- A new adapter under `scripts/bin/` (or `tools/codex-app-server/`) speaks the JSON-RPC-like protocol the spec describes (sections 4.1.6, 6.4 of `docs/references/openai_symphony_original_spec.txt`).
- `WORKFLOW.md` `codex.command` points at the new adapter; `agent.command` continues to point at `scripts/bin/llm.sh` for codex-independent uses.
- `scripts/symphony.sh` (Bash adapter) and `tools/symphony-elixir/lib/symphony/agent_runner/local_shell.ex` both consume the new event stream and update `Live Session` metadata.
- `scripts/validate-knowledge-base.sh` learns to assert that `codex.command != agent.command` once the new adapter exists, so we do not regress to "both point at llm.sh".
- The fallback chain stays available as a degraded-mode `agent.command` for environments where the codex binary is not installed.
