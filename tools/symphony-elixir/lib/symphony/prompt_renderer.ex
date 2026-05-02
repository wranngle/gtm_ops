defmodule Symphony.PromptRenderer do
  @moduledoc """
  Renders the per-attempt prompt from `workflow.prompt_template` and a
  `Symphony.Tracker.Issue`, per spec section 12.

  Backed by the `Solid` Liquid template engine (Liquid-compatible
  semantics, BSD-licensed). Supports the full Liquid surface area:

    * `{{ variable }}` and `{{ object.field }}` with strict
      undefined-variable rejection.
    * Standard filters such as `{{ name | upcase }}`,
      `{{ priority | default: "n/a" }}` with strict undefined-filter
      rejection.
    * Control flow including
      `{% for label in issue.labels %}{{ label }}{% endfor %}` and
      `{% if attempt %}retry{% endif %}`.
    * Nested array/map preservation so templates can iterate
      `issue.blocked_by`, `issue.labels`, etc. (spec § 12.2).

  Failure modes (spec § 5.5):

    * `{:error, {:template_parse_error, reason}}` — the template itself
      fails to parse (bad `{% %}` braces, unterminated tag, etc.).
    * `{:error, {:template_render_error, {:unknown_variable, name}}}`
      — strict_variables rejected an unknown identifier.
    * `{:error, {:template_render_error, {:unknown_filter, name}}}`
      — strict_filters rejected an unknown filter.
    * `{:error, {:template_render_error, reason}}` — any other
      render-time failure (argument errors, filter arity, etc.).
  """

  alias Symphony.Tracker

  @render_opts [strict_variables: true, strict_filters: true]

  @type render_input :: %{
          required(:template) => binary(),
          required(:issue) => Tracker.Issue.t(),
          optional(:attempt) => non_neg_integer() | nil
        }

  @spec render(render_input()) :: {:ok, binary()} | {:error, term()}
  def render(%{template: template, issue: %Tracker.Issue{} = issue} = input) do
    attempt = Map.get(input, :attempt)

    with {:ok, parsed} <- parse_template(template) do
      do_render(parsed, issue, attempt)
    end
  end

  defp parse_template(template) when is_binary(template) do
    case Solid.parse(template) do
      {:ok, parsed} -> {:ok, parsed}
      {:error, %Solid.TemplateError{} = err} -> {:error, {:template_parse_error, Exception.message(err)}}
    end
  end

  defp do_render(parsed, issue, attempt) do
    bindings = build_bindings(issue, attempt)

    case Solid.render(parsed, bindings, @render_opts) do
      {:ok, iolist, _warnings} ->
        {:ok, IO.iodata_to_binary(iolist)}

      {:error, errors, _partial} ->
        {:error, {:template_render_error, classify_render_errors(errors)}}
    end
  rescue
    err -> {:error, {:template_render_error, Exception.message(err)}}
  end

  # Solid resolves dotted variables (`issue.title`) via nested-map lookup
  # against the bindings hash. We expose a single nested `issue` map plus
  # a top-level `attempt`. Lists/maps stay nested so templates can iterate
  # them with `{% for label in issue.labels %}` per spec § 12.2.
  defp build_bindings(%Tracker.Issue{} = issue, attempt) do
    %{
      "issue" => issue_to_solid(issue),
      "attempt" => attempt
    }
  end

  # Build a nested map keyed by string field names so Liquid templates can
  # use `{{ issue.title | upcase }}` and `{% for label in issue.labels %}`.
  # Solid resolves `issue.title` against this map first; the legacy flat
  # `"issue.title" => ...` keys above only kick in if Solid's variable
  # resolver does not find the nested path. Both paths must produce the
  # same scalar so existing templates keep working unchanged.
  defp issue_to_solid(%Tracker.Issue{} = issue) do
    %{
      "id" => issue.id,
      "identifier" => issue.identifier,
      "title" => issue.title,
      "description" => issue.description || "",
      "state" => issue.state,
      "priority" => issue.priority,
      "url" => issue.url || "",
      "branch_name" => issue.branch_name || "",
      "labels" => issue.labels || [],
      "blocked_by" => normalize_blocked_by(issue.blocked_by),
      "created_at" => datetime_to_iso(issue.created_at),
      "updated_at" => datetime_to_iso(issue.updated_at)
    }
  end

  defp normalize_blocked_by(nil), do: []

  defp normalize_blocked_by(list) when is_list(list) do
    Enum.map(list, fn entry ->
      entry
      |> Map.new(fn {k, v} -> {to_string(k), v} end)
    end)
  end

  defp datetime_to_iso(nil), do: nil
  defp datetime_to_iso(%DateTime{} = dt), do: DateTime.to_iso8601(dt)
  defp datetime_to_iso(%NaiveDateTime{} = dt), do: NaiveDateTime.to_iso8601(dt)
  defp datetime_to_iso(other), do: other

  # Surface the first interesting error in the same shape the historical
  # `{{ var }}` shim emitted. Callers (orchestrator + tests) pattern-match
  # on `{:unknown_variable, name}` and `{:unknown_filter, name}`; preserve
  # both. Anything else falls through as the raw exception list so the
  # operator can read it from logs.
  defp classify_render_errors(errors) when is_list(errors) do
    Enum.find_value(errors, fn
      %Solid.UndefinedVariableError{original_name: name} ->
        {:unknown_variable, to_string(name)}

      %Solid.UndefinedFilterError{filter: filter} ->
        {:unknown_filter, to_string(filter)}

      _ ->
        nil
    end) || errors
  end
end
