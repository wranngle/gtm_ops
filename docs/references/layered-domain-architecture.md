# Layered Domain Architecture

This rule binds every business domain in this repo. It is enforced mechanically by `scripts/lint-layered-architecture.sh` and is the agent-legibility prerequisite for any domain that wants to grow beyond a single file.

## Source

The rule comes from OpenAI's *Harness Engineering: leveraging Codex in an agent-first world* (Lopopolo, 2026). The original diagram shows seven layers:

- **Types** — parsed shapes and public contracts
- **Config** — environment-driven runtime config
- **Repo** — storage / fixture-backed state
- **Providers** — explicit cross-cutting boundaries (clock, logger, secrets, external APIs)
- **Service** — business rules
- **Runtime** — wires services to CLIs, webhooks, jobs, servers
- **UI** — operator-facing rendering, **must not bypass services**

`Utils` exists outside any business domain and must not import any of these layers.

## Allowed Imports

A layer may only import from layers it is allowed to consume. The full table:

| From → To | types | config | repo | providers | service | runtime | ui |
|---|---|---|---|---|---|---|---|
| **types**     | — | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **config**    | ✓ | — | ✗ | ✗ | ✗ | ✗ | ✗ |
| **repo**      | ✓ | ✓ | — | ✗ | ✗ | ✗ | ✗ |
| **providers** | ✓ | ✗ | ✗ | — | ✗ | ✗ | ✗ |
| **service**   | ✓ | ✓ | ✓ | ✓ | — | ✗ | ✗ |
| **runtime**   | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| **ui**        | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | — |

Same-layer imports are always allowed.

## Why these constraints

- **Forward-only flow** keeps any domain reasonable to read top-to-bottom.
- **Providers as the only cross-cutting interface** stops creeping integrations from threading their way through the business logic. New external dependencies enter through one place.
- **UI must go through Service** prevents view code from coupling to storage shapes, which would freeze refactors of the data layer behind a UI redesign.
- **Runtime can invoke UI** because runtime is the CLI/server/job entry layer and naturally needs to render output. The forbidden direction here is `ui → runtime`; the renderer must not reach back into wiring.
- **Mechanically enforced** because rules that aren't enforced rot. The lint runs on every PR.

## Layout per package

```
packages/<domain>/
  src/
    types/        no imports from other layers
    config/       imports types
    repo/         imports types, config
    providers/    imports types
    service/      imports types, config, repo, providers
    runtime/      imports anything earlier
    ui/           imports types, service
  fixtures/       synthetic data
  tests/          per-layer unit tests
```

Each layer directory contains an `index.ts` that re-exports its public surface. Internal modules within a layer can import freely from each other.

## Lint contract

`scripts/lint-layered-architecture.sh`:

- Walks every `packages/*/src/**.ts(x)` file.
- Determines the file's layer from its path: `packages/<domain>/src/<layer>/...`.
- Extracts every `import` statement and resolves the target to its layer.
- Flags any import whose target layer is not in the allowed set for the source layer.
- Emits a remediation hint with each violation so the agent can act on the message directly.

External imports (npm packages, Node built-ins) are always allowed. Cross-domain imports (e.g., `packages/agent-evals` importing from `packages/data-reconciliation`) are not yet permitted; once they are, the lint will need a domain-boundary extension.

## What the lint will not catch

- Type-only side channels via `declare module` augmentation.
- Dynamic `import()` whose target is a runtime-computed string.
- Re-exports that launder a forbidden import through an allowed one.

The lint is a fast first-line check, not a security boundary. For deeper guarantees, add structural tests inside the package.

## When to break the rule

Don't. If a layer needs something it can't reach, the right move is one of:

1. Promote the dependency into a layer it is allowed to consume.
2. Wrap the dependency behind a `providers/` interface.
3. Refactor the offending call into the `service/` layer.

If those genuinely don't fit, write up the case in `docs/exec-plans/active/` and update this document — but the default answer is "no, restructure."
