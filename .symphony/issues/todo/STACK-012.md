---
id: STACK-012
priority: 2
labels: stack,symphony-elixir,prompt-renderer,liquid,spec-section-12
blocked_by:
---
# Replace `{{ var }}` substitution with a Liquid-compatible prompt engine

`tools/symphony-elixir/lib/symphony/prompt_renderer.ex` implements a flat `{{ issue.field }}` regex substitution with strict unknown-variable rejection. Spec section 12.2 requires "a strict template engine (Liquid-compatible semantics are sufficient)" with strict variable AND filter checking; the current renderer cannot do filters (`{{ name | upcase }}`), control flow (`{% if %}`, `{% for %}`), or nested map/list iteration (which spec section 12.2 explicitly calls out: "Preserve nested arrays/maps (labels, blockers) so templates can iterate.").

Decide between:

- Adopt an existing Elixir Liquid library (`solid` is the most-maintained option and is BSD-licensed).
- Or extend the in-house renderer to add the missing constructs (loops over `issue.labels` and `issue.blocked_by`, the standard Liquid filters used by the OpenAI Symphony reference such as `default`, `escape`, `upcase`, `downcase`).

Acceptance criteria:

- Templates can iterate `{% for label in issue.labels %}{{ label }}{% endfor %}`.
- Templates can iterate `{% for blocker in issue.blocked_by %}{{ blocker.identifier }}{% endfor %}`.
- Unknown variables and unknown filters both fail with `{:error, {:template_render_error, _}}` (already half-implemented for variables; filters are absent).
- Existing `Symphony.PromptRendererTest` cases continue to pass.
- New tests cover loops and at least one common filter (`default`).
- Spec section 5.5 error classes `template_parse_error` and `template_render_error` are surfaced distinctly.
