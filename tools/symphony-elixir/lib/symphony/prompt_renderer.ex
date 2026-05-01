defmodule Symphony.PromptRenderer do
  @moduledoc """
  Renders the per-attempt prompt from `workflow.prompt_template` and a
  `Symphony.Tracker.Issue`, per spec section 12.

  The spec section 12.2 requires a strict template engine (Liquid-compatible
  semantics). This module currently implements a minimal `{{ var }}` and
  `{{ issue.field }}` substitution with strict unknown-variable rejection
  so the contract matches the spec at the boundary; full Liquid features
  (filters, loops, conditionals) are deferred (TD-007 follow-up).
  """

  alias Symphony.Tracker

  @type render_input :: %{
          required(:template) => binary(),
          required(:issue) => Tracker.Issue.t(),
          optional(:attempt) => non_neg_integer() | nil
        }

  @spec render(render_input()) :: {:ok, binary()} | {:error, term()}
  def render(%{template: template, issue: %Tracker.Issue{} = issue} = input) do
    attempt = Map.get(input, :attempt)
    bindings = build_bindings(issue, attempt)

    do_render(template, bindings, [])
  end

  defp build_bindings(issue, attempt) do
    %{
      "issue.id" => issue.id,
      "issue.identifier" => issue.identifier,
      "issue.title" => issue.title,
      "issue.description" => issue.description || "",
      "issue.state" => issue.state,
      "issue.priority" => to_string(issue.priority || ""),
      "issue.url" => issue.url || "",
      "issue.branch_name" => issue.branch_name || "",
      "issue.labels" => Enum.join(issue.labels, ", "),
      "attempt" => attempt && to_string(attempt) || ""
    }
  end

  defp do_render(template, bindings, _opts) do
    pattern = ~r/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/

    try do
      result =
        Regex.replace(pattern, template, fn _whole, var ->
          case Map.fetch(bindings, var) do
            {:ok, value} -> value
            :error -> throw({:unknown_variable, var})
          end
        end)

      {:ok, result}
    catch
      {:unknown_variable, var} ->
        {:error, {:template_render_error, {:unknown_variable, var}}}
    end
  end
end
