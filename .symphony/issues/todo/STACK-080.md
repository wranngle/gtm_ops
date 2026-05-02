---
id: STACK-080
priority: 2
labels: stack,knowledge-base,validator,harness
blocked_by:
---
# Validate knowledge-base links, index coverage, and design-doc metadata

Harness Engineering says the repository knowledge base should be mechanically
validated for freshness, structure, and cross-links. This repo has a knowledge
base validator, AGENTS table-of-contents checks, a gardener, and CI wiring, but
`docs/QUALITY_SCORE.md` still lists link-resolution, index-coverage, and
design-doc-metadata checks as the next move. Those checks are not represented by
an active STACK issue.

This is a validator/documentation gap only. It should not change app behavior.

## Acceptance criteria

- Extend the knowledge-base validation contract so Markdown links under
  `AGENTS.md`, top-level docs, and owned `docs/**` pages resolve to existing
  files or allowed external URLs.
- Validate `docs/index.md` coverage for top-level docs and key subdirectories
  named in `AGENTS.md`, with explicit exclusions for generated files,
  authoritative `docs/references/openai_*.txt`, PNG diagrams, and ignored
  runtime directories.
- Validate design-doc metadata: each owned file in `docs/design-docs/` has a
  status and a last-reviewed date in the documented format.
- Error messages name the exact missing link, missing index entry, or missing
  metadata field and point to the relevant docs page for remediation.
- `scripts/validate-knowledge-base.sh` and `scripts/gardener.sh` both pass
  after the checks land, and the new checks are covered by fixture or negative
  tests where practical.

## References

- `docs/references/openai_harness_engineering_original_spec.txt` lines 65-135.
- `docs/QUALITY_SCORE.md` row "Repo knowledge base".
- `docs/references/doc-gardener.md`.

