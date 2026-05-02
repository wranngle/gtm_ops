---
id: STACK-017
priority: 3
labels: stack,symphony-elixir,workspace,sanitization,spec-section-9
blocked_by:
---
# Strengthen workspace key sanitization to match spec 9.5 invariant 3 exactly

`tools/symphony-elixir/lib/symphony/workspace_manager.ex` `sanitize_key/1` collapses any character not in `[A-Za-z0-9._-]` to a single `_` and trims leading/trailing underscores. Spec section 9.5 invariant 3 says: "Replace all other characters with `_`."  not "collapse runs to a single `_` and trim." The current behavior is more aggressive than spec.

The spec's strict-1:1 substitution would turn `"a/b/c"` into `"a_b_c"` (which matches today's output coincidentally) but `"foo bar / baz!"` into `"foo_bar___baz_"` instead of today's `"foo_bar_baz"`. This matters because the workspace path becomes the visible identifier in directory listings and logs.

Decide:

- Conform exactly to the spec (1:1 substitution, no trim, no collapse). This is the literal reading of section 9.5.
- Or document the deviation as an intentional ergonomic improvement and keep the current behavior.

If conforming:

- Change `sanitize_key/1` to a single `String.replace(~r/[^A-Za-z0-9._-]/, "_")` (no `+`, no `String.trim`).
- Update the existing tests that assert collapsed output (`workspace_manager_test.exs`).
- Document the choice in the module @moduledoc.

Acceptance criteria:

- A clear decision is made and documented.
- Tests reflect the chosen behavior and the rationale is captured in the module docs.
