defmodule Symphony.Tracker.Linear.IssueTest do
  use ExUnit.Case, async: true

  alias Symphony.Tracker.Issue
  alias Symphony.Tracker.Linear.Issue, as: Normalizer

  describe "from_payload/1 happy path" do
    test "maps a fully-populated GraphQL node into a normalized Issue" do
      payload = full_payload()

      assert %Issue{
               id: "uuid-1",
               identifier: "WGTE-1",
               title: "Implement spec section 11",
               description: "Body text.",
               priority: 2,
               state: "Todo",
               branch_name: "wgte/1-impl",
               url: "https://linear.app/example/issue/WGTE-1",
               labels: ["backend", "spec"],
               blocked_by: [%{id: "uuid-9", identifier: "WGTE-9", state: "Todo"}]
             } = Normalizer.from_payload(payload)
    end

    test "parses ISO-8601 timestamps into DateTime structs" do
      payload =
        full_payload()
        |> Map.put("createdAt", "2026-04-01T12:34:56Z")
        |> Map.put("updatedAt", "2026-04-02T08:00:00.123Z")

      issue = Normalizer.from_payload(payload)
      assert %DateTime{year: 2026, month: 4, day: 1} = issue.created_at
      assert %DateTime{year: 2026, month: 4, day: 2} = issue.updated_at
    end
  end

  describe "from_payload/1 normalization edge cases" do
    test "labels are lowercased per spec section 11.3" do
      payload =
        full_payload()
        |> put_labels(["Backend", "SPEC", "Linear-API"])

      issue = Normalizer.from_payload(payload)
      assert issue.labels == ["backend", "spec", "linear-api"]
    end

    test "label nodes with nil names are dropped" do
      payload = put_labels(full_payload(), [nil, "ok", nil])
      issue = Normalizer.from_payload(payload)
      assert issue.labels == ["ok"]
    end

    test "missing labels structure normalizes to []" do
      payload = full_payload() |> Map.delete("labels")
      issue = Normalizer.from_payload(payload)
      assert issue.labels == []
    end

    test "non-integer priority becomes nil" do
      assert Normalizer.from_payload(put_priority(full_payload(), "high")).priority == nil
      assert Normalizer.from_payload(put_priority(full_payload(), nil)).priority == nil
      assert Normalizer.from_payload(put_priority(full_payload(), 1.5)).priority == nil
      assert Normalizer.from_payload(put_priority(full_payload(), 3)).priority == 3
    end

    test "blocked_by only includes inverse relations of type blocks (case-insensitive)" do
      payload =
        full_payload()
        |> put_inverse_relations([
          %{
            "type" => "Blocks",
            "issue" => %{
              "id" => "uuid-A",
              "identifier" => "WGTE-A",
              "state" => %{"name" => "Done"}
            }
          },
          %{
            "type" => "duplicate",
            "issue" => %{
              "id" => "uuid-D",
              "identifier" => "WGTE-D",
              "state" => %{"name" => "Cancelled"}
            }
          },
          %{
            "type" => "  blocks ",
            "issue" => %{
              "id" => "uuid-B",
              "identifier" => "WGTE-B",
              "state" => %{"name" => "In Progress"}
            }
          }
        ])

      issue = Normalizer.from_payload(payload)

      assert Enum.map(issue.blocked_by, & &1.identifier) == ["WGTE-A", "WGTE-B"]
      refute Enum.any?(issue.blocked_by, fn b -> b.identifier == "WGTE-D" end)
    end

    test "missing inverseRelations normalizes to []" do
      payload = full_payload() |> Map.delete("inverseRelations")
      assert Normalizer.from_payload(payload).blocked_by == []
    end

    test "malformed timestamp becomes nil" do
      payload =
        full_payload()
        |> Map.put("createdAt", "not-a-date")
        |> Map.put("updatedAt", nil)

      issue = Normalizer.from_payload(payload)
      assert issue.created_at == nil
      assert issue.updated_at == nil
    end

    test "title falls back to empty string when missing" do
      payload = full_payload() |> Map.delete("title")
      assert Normalizer.from_payload(payload).title == ""
    end

    test "non-map input returns nil so callers can reject defensively" do
      assert Normalizer.from_payload(nil) == nil
      assert Normalizer.from_payload("string") == nil
    end
  end

  # ============== Fixture helpers ==============

  defp full_payload do
    %{
      "id" => "uuid-1",
      "identifier" => "WGTE-1",
      "title" => "Implement spec section 11",
      "description" => "Body text.",
      "priority" => 2,
      "state" => %{"name" => "Todo"},
      "branchName" => "wgte/1-impl",
      "url" => "https://linear.app/example/issue/WGTE-1",
      "labels" => %{"nodes" => [%{"name" => "backend"}, %{"name" => "spec"}]},
      "inverseRelations" => %{
        "nodes" => [
          %{
            "type" => "blocks",
            "issue" => %{
              "id" => "uuid-9",
              "identifier" => "WGTE-9",
              "state" => %{"name" => "Todo"}
            }
          }
        ]
      },
      "createdAt" => "2026-04-01T12:34:56Z",
      "updatedAt" => "2026-04-02T08:00:00Z"
    }
  end

  defp put_labels(payload, names) do
    Map.put(payload, "labels", %{"nodes" => Enum.map(names, &%{"name" => &1})})
  end

  defp put_priority(payload, p), do: Map.put(payload, "priority", p)

  defp put_inverse_relations(payload, relations) do
    Map.put(payload, "inverseRelations", %{"nodes" => relations})
  end
end
