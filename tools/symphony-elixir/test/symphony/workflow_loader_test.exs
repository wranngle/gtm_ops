defmodule Symphony.WorkflowLoaderTest do
  use ExUnit.Case, async: true

  alias Symphony.WorkflowLoader

  setup do
    tmp = Path.join(System.tmp_dir!(), "symphony-loader-#{System.unique_integer([:positive])}")
    File.mkdir_p!(tmp)
    on_exit(fn -> File.rm_rf!(tmp) end)
    {:ok, tmp: tmp}
  end

  test "parses a spec-shaped workflow", %{tmp: tmp} do
    path = Path.join(tmp, "WORKFLOW.md")

    File.write!(path, """
    ---
    workflow_name: example
    tracker:
      kind: local_markdown
      issues_root: .symphony/issues
      active_states: todo,in_progress
    polling:
      interval_ms: 30000
    workspace:
      root: .symphony/workspaces
    agent:
      command: scripts/bin/llm.sh
      max_concurrent_agents: 1
    ---
    # Body

    Per-issue prompt body lives here.
    """)

    assert {:ok, workflow} = WorkflowLoader.load(path)
    assert workflow.config["workflow_name"] == "example"
    assert workflow.config["tracker"]["kind"] == "local_markdown"
    assert WorkflowLoader.fetch(workflow, "tracker.kind") == "local_markdown"
    assert WorkflowLoader.fetch(workflow, "polling.interval_ms") == 30_000
    assert WorkflowLoader.fetch(workflow, "agent.command") == "scripts/bin/llm.sh"
    assert WorkflowLoader.fetch(workflow, "missing.path", :default) == :default
    assert workflow.prompt_template =~ "Per-issue prompt body lives here."
  end

  test "treats body-only files as no-front-matter", %{tmp: tmp} do
    path = Path.join(tmp, "WORKFLOW.md")
    File.write!(path, "Just a body.\nNo front matter.\n")

    assert {:ok, workflow} = WorkflowLoader.load(path)
    assert workflow.config == %{}
    assert workflow.prompt_template =~ "Just a body."
  end

  test "fails on missing file" do
    assert {:error, {:missing_workflow_file, _path, _reason}} =
             WorkflowLoader.load("/nonexistent/path/to/WORKFLOW.md")
  end

  test "fails on non-map front matter", %{tmp: tmp} do
    path = Path.join(tmp, "WORKFLOW.md")
    File.write!(path, "---\n- only\n- a list\n---\nbody\n")

    assert {:error, :workflow_front_matter_not_a_map} = WorkflowLoader.load(path)
  end

  test "unterminated front matter is reported as workflow_parse_error", %{tmp: tmp} do
    path = Path.join(tmp, "WORKFLOW.md")
    File.write!(path, "---\nkey: value\nno closing fence\n")

    assert {:error, {:workflow_parse_error, :unterminated_front_matter}} =
             WorkflowLoader.load(path)
  end
end
