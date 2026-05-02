defmodule Symphony.Tracker.LinearTest do
  use ExUnit.Case, async: false

  alias Symphony.{Config, Tracker, WorkflowLoader}
  alias Symphony.Tracker.Issue
  alias Symphony.Tracker.Linear, as: LinearAdapter
  alias Symphony.Tracker.Linear.Memory

  setup do
    tmp = Path.join(System.tmp_dir!(), "symphony-linear-#{System.unique_integer([:positive])}")
    File.mkdir_p!(tmp)

    on_exit(fn ->
      File.rm_rf!(tmp)
      Application.delete_env(:symphony, :linear_memory_issues)
      Application.delete_env(:symphony, :linear_memory_recipient)
    end)

    {:ok, tmp: tmp}
  end

  describe "behaviour conformance via Memory adapter" do
    test "Symphony.Tracker.Linear and Memory both implement the behaviour" do
      Code.ensure_loaded!(LinearAdapter)
      Code.ensure_loaded!(Memory)
      assert function_exported?(LinearAdapter, :fetch_candidate_issues, 1)
      assert function_exported?(LinearAdapter, :fetch_issues_by_states, 2)
      assert function_exported?(LinearAdapter, :fetch_issue_states_by_ids, 2)
      assert function_exported?(Memory, :fetch_candidate_issues, 1)
      assert function_exported?(Memory, :fetch_issues_by_states, 2)
      assert function_exported?(Memory, :fetch_issue_states_by_ids, 2)

      # Confirm both modules expose the Symphony.Tracker behaviour
      assert Symphony.Tracker in (LinearAdapter.module_info(:attributes)[:behaviour] || [])
      assert Symphony.Tracker in (Memory.module_info(:attributes)[:behaviour] || [])
    end

    test "fetch_candidate_issues returns active-state issues only", %{tmp: tmp} do
      Application.put_env(:symphony, :linear_memory_issues, [
        %Issue{id: "uuid-1", identifier: "WGTE-1", state: "todo"},
        %Issue{id: "uuid-2", identifier: "WGTE-2", state: "in_progress"},
        %Issue{id: "uuid-3", identifier: "WGTE-3", state: "done"}
      ])

      config = linear_memory_config(tmp)
      {:ok, issues} = Memory.fetch_candidate_issues(config)
      ids = issues |> Enum.map(& &1.identifier) |> Enum.sort()
      assert ids == ["WGTE-1", "WGTE-2"]
    end

    test "fetch_issues_by_states honors arbitrary state names case-insensitively", %{tmp: tmp} do
      Application.put_env(:symphony, :linear_memory_issues, [
        %Issue{id: "u1", identifier: "WGTE-1", state: "Human Review"},
        %Issue{id: "u2", identifier: "WGTE-2", state: "Done"},
        %Issue{id: "u3", identifier: "WGTE-3", state: "Cancelled"}
      ])

      config = linear_memory_config(tmp)

      {:ok, review_only} = Memory.fetch_issues_by_states(config, ["human review"])
      assert Enum.map(review_only, & &1.identifier) == ["WGTE-1"]

      {:ok, terminals} = Memory.fetch_issues_by_states(config, ["done", "cancelled"])
      assert Enum.map(terminals, & &1.identifier) |> Enum.sort() == ["WGTE-2", "WGTE-3"]
    end

    test "fetch_issue_states_by_ids returns id => state map and notifies recipient", %{tmp: tmp} do
      Application.put_env(:symphony, :linear_memory_issues, [
        %Issue{id: "u1", identifier: "WGTE-1", state: "todo"},
        %Issue{id: "u2", identifier: "WGTE-2", state: "done"}
      ])

      Application.put_env(:symphony, :linear_memory_recipient, self())

      config = linear_memory_config(tmp)
      {:ok, states} = Memory.fetch_issue_states_by_ids(config, ["u1", "u2", "missing"])

      assert states == %{"u1" => "todo", "u2" => "done"}
      assert_received {:linear_memory_state_lookup, ["u1", "u2", "missing"]}
    end

    test "Symphony.Tracker.adapter_for/1 resolves :linear and :linear_memory", %{tmp: tmp} do
      linear_config = linear_kind_config(tmp, "linear")
      assert {:ok, LinearAdapter} = Tracker.adapter_for(linear_config)

      memory_config = linear_kind_config(tmp, "linear_memory")
      assert {:ok, Memory} = Tracker.adapter_for(memory_config)
    end
  end

  describe "Symphony.Tracker.Linear delegation surface" do
    test "missing api_key surfaces :missing_tracker_api_key", %{tmp: tmp} do
      config = linear_real_config(tmp, api_key: nil, project_slug: "wgte")
      assert {:error, :missing_tracker_api_key} = LinearAdapter.fetch_candidate_issues(config)
    end

    test "missing project_slug surfaces :missing_tracker_project_slug", %{tmp: tmp} do
      config = linear_real_config(tmp, api_key: "lin_xxx", project_slug: nil)
      assert {:error, :missing_tracker_project_slug} = LinearAdapter.fetch_candidate_issues(config)
    end

    test "fetch_issue_states_by_ids with empty list short-circuits", %{tmp: tmp} do
      config = linear_real_config(tmp, api_key: "lin_xxx", project_slug: "wgte")
      assert {:ok, %{}} = LinearAdapter.fetch_issue_states_by_ids(config, [])
    end

    test "post_comment/4 delegates to the client and validates inputs", %{tmp: tmp} do
      config = linear_real_config(tmp, api_key: "lin_xxx", project_slug: "wgte")
      assert {:error, :linear_missing_issue_id} = LinearAdapter.post_comment(config, "", "hi")
      assert {:error, :linear_empty_comment_body} = LinearAdapter.post_comment(config, "u-1", "")
    end
  end

  # Live workspace test (spec section 11.5): exercises the real Linear
  # `commentCreate` mutation against the WRA team using
  # `LINEAR_API_KEY` from the environment. Tagged `:integration` so it
  # does NOT run on every `mix test`; opt in with
  # `mix test --include integration`.
  #
  # The issue ID is the live WRA-77 ("STACK-075: Orchestrator lacks
  # request_refresh API ...") which is in a stable Todo state and is the
  # canonical probe target for vector 2 LINEAR exploration. If the issue
  # is ever deleted, this test will surface a GraphQL error and need
  # the ID rotated.
  describe "live workspace (tag :integration)" do
    @tag :integration
    test "post_comment/4 leaves an audit-trail comment on a real issue", %{tmp: tmp} do
      api_key = System.get_env("LINEAR_API_KEY")

      if api_key in [nil, ""] do
        flunk(
          "LINEAR_API_KEY env var not set; integration test cannot run. " <>
            "source ~/.agents/.env first."
        )
      end

      config = linear_real_config(tmp, api_key: api_key, project_slug: "wgte")
      issue_id = "4c1b6e32-6dd2-4792-baef-48e8971fb4c2"

      body =
        "symphony.tracker.linear.live_test: post_comment/4 ok @ " <>
          DateTime.to_iso8601(DateTime.utc_now())

      assert {:ok, %{id: comment_id, url: comment_url}} =
               LinearAdapter.post_comment(config, issue_id, body)

      assert is_binary(comment_id) and byte_size(comment_id) > 0
      assert is_binary(comment_url) and String.contains?(comment_url, "linear.app")
    end
  end

  # ============== Fixtures ==============

  defp linear_memory_config(tmp), do: linear_kind_config(tmp, "linear_memory")

  defp linear_kind_config(tmp, kind) do
    workflow_path = Path.join(tmp, "WORKFLOW.md")

    File.write!(workflow_path, """
    ---
    tracker:
      kind: #{kind}
      active_states: todo,in_progress
      terminal_states: done,cancelled,duplicate
    agent:
      command: scripts/bin/llm.sh
    ---
    body
    """)

    {:ok, workflow} = WorkflowLoader.load(workflow_path)
    {:ok, config} = Config.from_workflow(workflow)
    config
  end

  defp linear_real_config(tmp, opts) do
    workflow_path = Path.join(tmp, "WORKFLOW.md")

    api_key_line =
      case Keyword.get(opts, :api_key) do
        nil -> ""
        v -> "  api_key: #{v}"
      end

    project_slug_line =
      case Keyword.get(opts, :project_slug) do
        nil -> ""
        v -> "  project_slug: #{v}"
      end

    File.write!(
      workflow_path,
      """
      ---
      tracker:
        kind: linear
        active_states: todo,in_progress
      #{api_key_line}
      #{project_slug_line}
      agent:
        command: scripts/bin/llm.sh
      ---
      body
      """
    )

    {:ok, workflow} = WorkflowLoader.load(workflow_path)
    {:ok, config} = Config.from_workflow(workflow)
    config
  end
end
