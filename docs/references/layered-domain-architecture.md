# Layered Domain Architecture

This rule binds every business domain in this repo. It is enforced mechanically by `scripts/lint-layered-architecture.sh` and is the agent-legibility prerequisite for any domain that wants to grow beyond a single file.

## Source

The rule comes from OpenAI's *Harness Engineering: leveraging Codex in an agent-first world* (Lopopolo, 2026), specifically the diagram **"Layered domain architecture with explicit cross-cutting boundaries"** (`docs/references/OAI_Harness_engineering_Layered_domain_architecture_with_explicit_cross-cutting_boundries_desktop-dark.png`). The post says:

> "code can only depend 'forward' through a fixed set of layers (Types → Config → Repo → Service → Runtime → UI). Cross-cutting concerns (auth, connectors, telemetry, feature flags) enter through a single explicit interface: Providers."

The original diagram shows seven layers inside the business-logic domain plus `Utils` outside:

- **Types** — parsed shapes and public contracts
- **Config** — environment-driven runtime config
- **Repo** — storage / fixture-backed state
- **Providers** — explicit cross-cutting boundaries (clock, logger, secrets, external APIs)
- **Service** — business rules
- **Runtime** — wires services to CLIs, webhooks, jobs, servers
- **UI** — operator-facing rendering, **must not bypass services**

`Utils` exists outside any business domain and must not import any of these layers.

The original diagram also has an **"App Wiring + UI"** box that depends on both `Providers` and `Runtime`. In our packaging, the `runtime/` directory plays the App-Wiring role: it is the composition root that loads config, builds providers/repo/service, and drives the UI render functions. Splitting App-Wiring into its own layer is overkill for one-CLI domains; we revisit this if a domain grows multiple entry points (CLI + HTTP + worker, for example).

## Reading the diagram

The diagram's arrows point **from a lower layer to a higher layer that depends on it** (i.e., `Types → Config` means "Config depends on Types"). The full chain is `Types → Config → Repo → Service → Runtime → UI`. A layer may import any layer that sits *behind* it in the chain, plus `Providers` once it is past the `Service` boundary.

There is one inversion worth calling out: in our agent-evals package, the `runtime/` layer (acting as App Wiring) imports `ui/` because `ui/` is a small library of pure render functions and `runtime/` is the composition root that calls them. This matches the post's note that "Runtime can invoke UI"; the forbidden direction here is `ui → runtime`.

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

Same-layer imports are always allowed. Cross-domain imports (one package's `src/` reaching into another package's `src/`) are flagged — see "Cross-domain imports" below.

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
- Strips `//` and `/* */` comments before extraction so commented-out code does not register.
- Extracts every module-edge statement (single- or multi-line) and resolves the target to its layer:
  - `import "x"`, `import x from "x"`, `import { a } from "x"`, `import type { T } from "x"`
  - `export { a } from "x"`, `export * from "x"`, `export type { T } from "x"` (re-exports cannot launder a forbidden import through an allowed surface)
  - `import("x")` dynamic imports with literal string paths
- Flags any import whose target layer is not in the allowed set for the source layer.
- Flags **cross-domain imports** — relative paths that escape the importer's `src/` and land inside a sibling package's `src/`, plus `@wranngle/<other-package>` workspace imports.
- Emits a remediation hint with each violation so the agent can act on the message directly.

External imports (npm packages, Node built-ins) are always allowed. Imports that escape the package entirely without landing in another package's `src/` (e.g., into `tests/` or out of `packages/`) are silently ignored.

## Cross-domain imports

The lint currently rejects every cross-domain import. There is no allow-list — once a second domain needs to consume something from another, the right move is one of:

1. **Promote the shared piece to a `packages/shared` (or similar) package** that both domains depend on through their normal dependency graph.
2. **Wrap the other domain behind a `providers/` adapter** in the consumer, so the integration is explicit and replaceable in tests.
3. **Define the inter-domain contract here first**, then extend the lint with an allowed-edges table keyed on `(from-package, from-layer) → (to-package, to-layer)` before the import is permitted.

This keeps multi-domain growth intentional rather than emergent. See `packages/agent-evals/tests/lint-coverage.test.ts` for the negative-case coverage that pins this rule in place.

## What the lint will not catch

- Type-only side channels via `declare module` augmentation.
- Dynamic `import()` whose target is a runtime-computed string (literal-string `import("x")` IS caught).
- A package that uses a non-relative, non-`@wranngle` workspace name to reach into another internal package (rename the package or extend the cross-domain detector).

The lint is a fast first-line check, not a security boundary. For deeper guarantees, add structural tests inside the package — see `packages/agent-evals/tests/structure.test.ts` and `packages/agent-evals/tests/lint-coverage.test.ts`.

## When to break the rule

Don't. If a layer needs something it can't reach, the right move is one of:

1. Promote the dependency into a layer it is allowed to consume.
2. Wrap the dependency behind a `providers/` interface.
3. Refactor the offending call into the `service/` layer.

If those genuinely don't fit, write up the case in `docs/exec-plans/active/` and update this document — but the default answer is "no, restructure."
