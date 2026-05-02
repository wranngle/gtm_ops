defmodule Symphony.Tracker.Linear.Issue do
  @moduledoc """
  Normalization helpers that convert raw Linear GraphQL issue payloads
  into the canonical `Symphony.Tracker.Issue` struct (spec section 4.1.1).

  Per spec section 11.3 normalization rules:

    * `labels` -> lowercase strings
    * `blocked_by` -> derived from inverse relations where relation type
      is `blocks`
    * `priority` -> integer-only (non-integers become `nil`)
    * `created_at` / `updated_at` -> parsed ISO-8601 timestamps

  Lives in its own module so the GraphQL client stays focused on
  transport concerns and so normalization edge cases are unit-testable
  without round-tripping through the client.
  """

  alias Symphony.Tracker.Issue

  @doc """
  Convert a Linear GraphQL issue node into a `Symphony.Tracker.Issue`.

  Returns `nil` for non-map inputs so callers can `Enum.reject(&is_nil/1)`
  defensively when the payload omits an issue (e.g. permission scope).
  """
  @spec from_payload(map() | any()) :: Issue.t() | nil
  def from_payload(payload) when is_map(payload) do
    %Issue{
      id: payload["id"],
      identifier: payload["identifier"],
      title: payload["title"] || "",
      description: payload["description"],
      priority: parse_priority(payload["priority"]),
      state: get_in(payload, ["state", "name"]) || "",
      branch_name: payload["branchName"],
      url: payload["url"],
      labels: extract_labels(payload),
      blocked_by: extract_blockers(payload),
      created_at: parse_datetime(payload["createdAt"]),
      updated_at: parse_datetime(payload["updatedAt"])
    }
  end

  def from_payload(_), do: nil

  # ============== Private ==============

  defp parse_priority(p) when is_integer(p), do: p
  defp parse_priority(_), do: nil

  defp extract_labels(%{"labels" => %{"nodes" => labels}}) when is_list(labels) do
    labels
    |> Enum.map(& &1["name"])
    |> Enum.reject(&is_nil/1)
    |> Enum.map(&String.downcase/1)
  end

  defp extract_labels(_), do: []

  defp extract_blockers(%{"inverseRelations" => %{"nodes" => relations}})
       when is_list(relations) do
    Enum.flat_map(relations, fn
      %{"type" => relation_type, "issue" => blocker_issue}
      when is_binary(relation_type) and is_map(blocker_issue) ->
        if blocks_relation?(relation_type) do
          [
            %{
              id: blocker_issue["id"],
              identifier: blocker_issue["identifier"],
              state: get_in(blocker_issue, ["state", "name"])
            }
          ]
        else
          []
        end

      _ ->
        []
    end)
  end

  defp extract_blockers(_), do: []

  defp blocks_relation?(type) do
    type
    |> String.trim()
    |> String.downcase()
    |> Kernel.==("blocks")
  end

  defp parse_datetime(nil), do: nil

  defp parse_datetime(raw) when is_binary(raw) do
    case DateTime.from_iso8601(raw) do
      {:ok, dt, _offset} -> dt
      _ -> nil
    end
  end

  defp parse_datetime(_), do: nil
end
