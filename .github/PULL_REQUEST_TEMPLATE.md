## Summary

-

## Change type

- [ ] Documentation / knowledge base
- [ ] Product code (`lib/`, `server.js`, `cli.js`, `apps/ops-console/`)
- [ ] PDF templates / brand tokens (`templates/`, `tokens/`, `DESIGN.md`)
- [ ] n8n workflow samples (`workflows/`)
- [ ] Tests / fixtures
- [ ] Security / sanitization
- [ ] CI / workflows (`.github/workflows/`)

## Validation

Tick what passes locally for the surfaces this PR touches.

- [ ] `bash -n scripts/*.sh`
- [ ] `scripts/validate-knowledge-base.sh`
- [ ] `scripts/lint-layered-architecture.sh`
- [ ] `bun test`
- [ ] `bun run integration` (round-trip: synthetic input → branded PDF)
- [ ] Public-safety scan: no secrets, customer identifiers, live agent IDs, real phone numbers, or private repo history

## Knowledge base

- [ ] Docs updated, or not needed (explain below if not)
- [ ] `AGENTS.md` still ≤120 lines and still a map (not a manual)
- [ ] `ARCHITECTURE.md` still matches the runtime surface

## Related plan / issue

-
