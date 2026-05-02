---
id: STACK-002
priority: 2
labels: stack,knowledge-base,validator
blocked_by:
---
# Promote stack-level docs to be project-name-agnostic

`docs/references/canonical-stack.md` calls out the discipline:

> Stack-level files must not contain `wranngle-gtm-engine`-specific paths or
> identifiers, `ElevenLabs`, `Wranngle GTM Engine`, or any ElevenLabs-domain
> identifiers.

But `WORKFLOW.md`, `ARCHITECTURE.md`, `docs/ORCHESTRATION.md`, and
`docs/SECURITY.md` still bake the project name and the ElevenLabs domain into
their prose. These files are listed under "Canonical stack artifacts" in
`canonical-stack.md`, so when the stack is extracted to `~/.dotfiles/` they
will need a one-shot rename pass that breaks every existing pointer.

## Acceptance criteria

- A one-pass rewrite that replaces project-specific identifiers in every file
  listed under "Canonical stack artifacts" with stack-neutral language
  (`<repo>`, "this repo", "the showcase package", etc.).
- A new check in `scripts/validate-knowledge-base.sh` that fails CI if any
  stack-level file (enumerated explicitly, the same list canonical-stack.md
  uses) contains the strings `wranngle-gtm-engine`, `ElevenLabs`, or
  `Wranngle GTM Engine`. The check should allow the matches in
  `canonical-stack.md` itself (since it discusses them) and in this issue
  file.
- `tools/symphony-elixir/README.md` and `tools/edge-mcp/README.md` audit pass
  too.

## Why deferred

Cross-cuts every stack-level file. Touching all of them in one PR is a
restructure that warrants a dedicated plan in `docs/exec-plans/active/`, not
an in-line edit during an audit pass.

## Completion note

Moved stack-facing prose to project-neutral language and added a
source-only portability scan to `scripts/validate-knowledge-base.sh` for
the orchestration/control-plane artifacts. Repository URLs and
`docs/references/canonical-stack.md` remain the explicit exceptions.
