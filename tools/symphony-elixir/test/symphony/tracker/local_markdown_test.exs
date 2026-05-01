defmodule Symphony.Tracker.LocalMarkdownTest do
  use ExUnit.Case, async: false

  alias Symphony.{Config, WorkflowLoader}
  alias Symphony.Tracker.{Issue, LocalMarkdown}

  setup do
    tmp = Path.join(System.tmp_dir!(), "symphony-lm-#{System.unique_integer([:positive])}")
    File.mkdir_p!(tmp)
    on_exit(fn -> File.rm_rf!(tmp) end)
    {:ok, tmp: tmp}
  end

  defp config_with_issues(tmp, structure) do
    issues_root = Path.join(tmp, "issues")

    Enum.each(structure, fn {state, files} ->
      File.mkdir_p!(Path.join(issues_root, state))

      Enum.each(files, fn {name, contents} ->
        File.write!(Path.join([issues_root, state, name]), contents)
      end)
    end)

    workflow_path = Path.join(tmp, "WORKFLOW.md")

    File.write!(workflow_path, """
    ---
    tracker:
      kind: local_markdown
      issues_root: #{issues_root}
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

  test "fetch_candidate_issues returns active-state issues with parsed front matter", %{tmp: tmp} do
    config =
      config_with_issues(tmp, %{
        "todo" => [
          {"WGTE-001.md",
           """
           ---
           priority: 2
           labels: [a, b]
           ---
           # Build agent-evals skeleton

           Description goes here.

           Multi-line body.
           """}
        ],
        "in_progress" => [
          {"WGTE-002.md",
           """
           ---
           priority: 1
           ---
           # Mid-flight task
           """}
        ],
        "done" => [
          {"WGTE-099.md", "# Should not appear"}
        ]
      })

    {:ok, issues} = LocalMarkdown.fetch_candidate_issues(config)
    by_id = Map.new(issues, &{&1.identifier, &1})

    assert Map.keys(by_id) |> Enum.sort() == ["WGTE-001", "WGTE-002"]

    assert %Issue{
             title: "Build agent-evals skeleton",
             priority: 2,
             state: "todo",
             labels: ["a", "b"]
           } = by_id["WGTE-001"]

    assert by_id["WGTE-001"].description =~ "Description goes here."
    assert by_id["WGTE-002"].state == "in_progress"
    assert by_id["WGTE-002"].priority == 1
  end

  test "fetch_issues_by_states honors arbitrary state names", %{tmp: tmp} do
    config =
      config_with_issues(tmp, %{
        "human_review" => [{"WGTE-010.md", "# In review"}],
        "done" => [{"WGTE-011.md", "# Closed"}]
      })

    {:ok, only_review} = LocalMarkdown.fetch_issues_by_states(config, ["human_review"])
    assert length(only_review) == 1
    assert hd(only_review).identifier == "WGTE-010"

    {:ok, both} =
      LocalMarkdown.fetch_issues_by_states(config, ["human_review", "done"])

    assert length(both) == 2
  end

  test "blocked_by accepts CSV string and YAML list", %{tmp: tmp} do
    config =
      config_with_issues(tmp, %{
        "todo" => [
          {"BLK-1.md",
           """
           ---
           blocked_by: WGTE-100, WGTE-101
           ---
           # csv form
           """},
          {"BLK-2.md",
           """
           ---
           blocked_by:
             - WGTE-200
             - WGTE-201
           ---
           # list form
           """}
        ]
      })

    {:ok, issues} = LocalMarkdown.fetch_candidate_issues(config)
    by_id = Map.new(issues, &{&1.identifier, &1})

    assert Enum.map(by_id["BLK-1"].blocked_by, & &1.id) == ["WGTE-100", "WGTE-101"]
    assert Enum.map(by_id["BLK-2"].blocked_by, & &1.id) == ["WGTE-200", "WGTE-201"]
  end

  test "fetch_issue_states_by_ids returns terminal states too", %{tmp: tmp} do
    config =
      config_with_issues(tmp, %{
        "todo" => [{"A.md", "# A"}],
        "done" => [{"B.md", "# B"}]
      })

    {:ok, states} = LocalMarkdown.fetch_issue_states_by_ids(config, ["A", "B", "missing"])
    assert states["A"] == "todo"
    assert states["B"] == "done"
    refute Map.has_key?(states, "missing")
  end

  test "ignores .gitkeep and unrelated files", %{tmp: tmp} do
    config =
      config_with_issues(tmp, %{
        "todo" => [
          {".gitkeep", ""},
          {"README.txt", "ignored"},
          {"REAL.md", "# real one"}
        ]
      })

    {:ok, issues} = LocalMarkdown.fetch_candidate_issues(config)
    assert Enum.map(issues, & &1.identifier) == ["REAL"]
  end
end
