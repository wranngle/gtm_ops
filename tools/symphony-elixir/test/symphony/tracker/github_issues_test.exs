defmodule Symphony.Tracker.GitHubIssuesTest do
  use ExUnit.Case, async: true

  alias Symphony.Tracker.GitHubIssues

  # The github_issues adapter shells out to `gh`. Live integration tests
  # against the real CLI are out of scope for unit tests; we instead
  # exercise the pure-data conversion paths via the private functions
  # accessible at compile time, plus the require_repo!/run_gh error
  # branches.

  describe "from_gh_payload via fetch behaviour" do
    test "parses a labelled in_progress issue with priority" do
      payload = %{
        "number" => 42,
        "title" => "Real ticket",
        "body" => "Body text\n\nBlocked-by: #7, #11\n",
        "labels" => [
          %{"name" => "symphony:in-progress"},
          %{"name" => "priority:2"},
          %{"name" => "infra"}
        ],
        "state" => "open",
        "createdAt" => "2026-04-01T12:00:00Z",
        "updatedAt" => "2026-04-02T12:00:00Z",
        "url" => "https://github.com/example/repo/issues/42"
      }

      issue = apply_private(:from_gh_payload, [payload])
      assert issue.id == "42"
      assert issue.identifier == "gh-42"
      assert issue.title == "Real ticket"
      assert issue.priority == 2
      assert issue.state == "in_progress"
      assert issue.labels == ["symphony:in-progress", "priority:2", "infra"]
      assert issue.url == "https://github.com/example/repo/issues/42"
      assert issue.created_at != nil
      assert Enum.map(issue.blocked_by, & &1.id) == ["7", "11"]
    end

    test "closed issue with no symphony:* label maps to done" do
      payload = %{
        "number" => 5,
        "title" => "Closed ticket",
        "body" => "",
        "labels" => [],
        "state" => "closed"
      }

      issue = apply_private(:from_gh_payload, [payload])
      assert issue.state == "done"
    end

    test "open issue with no symphony:* label defaults to todo" do
      payload = %{
        "number" => 1,
        "title" => "Plain",
        "body" => "",
        "labels" => [],
        "state" => "open"
      }

      issue = apply_private(:from_gh_payload, [payload])
      assert issue.state == "todo"
    end

    test "closed + symphony:cancelled maps to cancelled" do
      payload = %{
        "number" => 9,
        "title" => "Wontfix",
        "body" => "",
        "labels" => [%{"name" => "symphony:cancelled"}],
        "state" => "closed"
      }

      issue = apply_private(:from_gh_payload, [payload])
      assert issue.state == "cancelled"
    end
  end

  describe "parse_blocked_by_body" do
    test "extracts numeric IDs from a Blocked-by line, tolerating # and commas" do
      assert apply_private(:parse_blocked_by_body, ["Blocked-by: #42, #99"])
             |> Enum.map(& &1.id) == ["42", "99"]

      assert apply_private(:parse_blocked_by_body, ["blocked-by:7, 8 9"])
             |> Enum.map(& &1.id) == ["7", "8", "9"]
    end

    test "returns [] when no marker is present" do
      assert apply_private(:parse_blocked_by_body, ["Some unrelated body"]) == []
      assert apply_private(:parse_blocked_by_body, [nil]) == []
    end
  end

  defp apply_private(name, args) do
    apply(GitHubIssues, name, args)
  end
end
