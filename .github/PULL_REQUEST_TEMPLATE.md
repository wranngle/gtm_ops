## Summary

-

## Change Type

- [ ] Documentation / knowledge base
- [ ] Agent harness / repo tooling (scripts, validators, .github/)
- [ ] L0 dotfiles primitives (LICENSE, demo/, scripts/bin/llm.sh, scripts/hero.sh)
- [ ] Symphony orchestrator (scripts/symphony.sh, tools/symphony-elixir/)
- [ ] Product code (packages/, apps/)
- [ ] Tests / fixtures / validation
- [ ] Security / public-safety cleanup
- [ ] CI / workflows (.github/workflows/)

## Validation

Run the checks for the surfaces this PR touches; tick what passes locally.

- [ ] `bash -n scripts/*.sh scripts/bin/*.sh`
- [ ] `scripts/validate-knowledge-base.sh`
- [ ] `tests/symphony-completion-helpers.sh` (if Symphony completion helpers/workflow changed)
- [ ] `scripts/lint-layered-architecture.sh`
- [ ] `scripts/symphony.sh validate && scripts/symphony.sh once --dry-run --limit 1`
- [ ] `scripts/gardener.sh` reviewed (informational)
- [ ] `bun test` (in `packages/agent-evals/` if touched)
- [ ] `pytest apps/ops-console/tests -q` (if `apps/ops-console/` touched)
- [ ] `mix test` (in `tools/symphony-elixir/` if touched)
- [ ] `node tools/edge-mcp/smoke/smoke.mjs` (only if Edge MCP is set up locally)
- [ ] Public-safety scan: no secrets, customer identifiers, live URLs, or private repo history

## Knowledge Base

- [ ] Docs updated, or not needed (explain below if not)
- [ ] Exec plan under `docs/exec-plans/active/` updated, or not needed
- [ ] `AGENTS.md` is still <=120 lines and still a map (not a manual)
- [ ] No project-specific drift: agent-friendly conventions still hold (parse at boundaries, synthetic fixtures, layered architecture)

## Related Issue / Plan

Link the active exec plan and/or Symphony issue (`.symphony/issues/...` or `#NNN`) this PR resolves:

-

## Handoff

- Review packet path:
- Follow-up tasks filed:
- PR shepherding notes (reviewers, failed checks, reruns, merge policy):
