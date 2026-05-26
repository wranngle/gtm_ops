## Summary

-

## Change type

- [ ] Documentation / knowledge base
- [ ] Product code (`lib/`, `server.ts`, `cli.ts`, `apps/ops-console/`)
- [ ] PDF templates / brand tokens (`templates/`, `tokens/`, `DESIGN.md`)
- [ ] Cloudflare Pages Functions (`functions/api/`)
- [ ] ElevenLabs ConvAI integration (`apps/ops-console/console/el-widget.jsx`, `agents-registry.js`, `agents-page.jsx`)
- [ ] Tests / fixtures
- [ ] Security / sanitization
- [ ] CI / workflows (`.github/workflows/`)

## Validation

Tick what passes locally for the surfaces this PR touches.

- [ ] `bash -n scripts/*.sh`
- [ ] `bash scripts/validate-knowledge-base.sh`
- [ ] `bash scripts/lint-layered-architecture.sh`
- [ ] `bash scripts/gardener.sh` (doc staleness)
- [ ] `bun run typecheck`
- [ ] `bun run test:run` (vitest unit)
- [ ] `bun run test:console` (Playwright UI suite)
- [ ] Public-safety scan: no secrets, customer identifiers, live agent IDs, real phone numbers, or private repo history

## Knowledge base

- [ ] Docs updated, or not needed (explain below if not)
- [ ] `AGENTS.md` still ≤120 lines and still a map (not a manual)
- [ ] `ARCHITECTURE.md` still matches the runtime surface

## Related plan / issue

-
