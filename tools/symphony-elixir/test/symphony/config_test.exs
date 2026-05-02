defmodule Symphony.ConfigTest do
  use ExUnit.Case, async: false

  alias Symphony.{Config, WorkflowLoader}

  setup do
    tmp = Path.join(System.tmp_dir!(), "symphony-config-#{System.unique_integer([:positive])}")
    File.mkdir_p!(tmp)
    on_exit(fn -> File.rm_rf!(tmp) end)
    {:ok, tmp: tmp}
  end

  defp write_workflow(tmp, body) do
    path = Path.join(tmp, "WORKFLOW.md")
    File.write!(path, body)
    {:ok, workflow} = WorkflowLoader.load(path)
    {:ok, config} = Config.from_workflow(workflow)
    config
  end

  test "applies defaults when keys are absent", %{tmp: tmp} do
    config =
      write_workflow(tmp, """
      ---
      workflow_name: minimal
      ---
      body
      """)

    assert Config.tracker_kind(config) == :local_markdown
    assert Config.polling_interval_ms(config) == 30_000
    assert Config.tracker_active_states(config) == ["todo", "in_progress"]
    assert Config.agent_command(config) == "codex app-server"
    assert Config.agent_max_concurrent_agents(config) == 10
  end

  test "honors explicit values over defaults", %{tmp: tmp} do
    config =
      write_workflow(tmp, """
      ---
      workflow_name: custom
      tracker:
        kind: github_issues
        repo: owner/repo
        active_states: todo,in_progress,human_review
      polling:
        interval_ms: 5000
      agent:
        command: scripts/bin/llm.sh
        max_concurrent_agents: 1
      ---
      body
      """)

    assert Config.tracker_kind(config) == :github_issues
    assert Config.tracker_repo(config) == "owner/repo"
    assert Config.tracker_active_states(config) == ["todo", "in_progress", "human_review"]
    assert Config.polling_interval_ms(config) == 5_000
    assert Config.agent_command(config) == "scripts/bin/llm.sh"
    assert Config.agent_max_concurrent_agents(config) == 1
  end

  test "resolves $VAR env indirection in env-resolvable string fields", %{tmp: tmp} do
    System.put_env("SYMPHONY_TEST_TOKEN", "secret-abc")

    config =
      write_workflow(tmp, """
      ---
      tracker:
        kind: linear
        api_key: $SYMPHONY_TEST_TOKEN
      ---
      """)

    assert Config.tracker_api_key(config) == "secret-abc"

    System.put_env("SYMPHONY_TEST_TOKEN", "")
    {:ok, workflow} = WorkflowLoader.load(Path.join(tmp, "WORKFLOW.md"))
    {:ok, config} = Config.from_workflow(workflow)
    assert Config.tracker_api_key(config) == nil

    System.delete_env("SYMPHONY_TEST_TOKEN")
  end

  test "rejects non-positive integer in pos_int! getters", %{tmp: tmp} do
    config =
      write_workflow(tmp, """
      ---
      polling:
        interval_ms: 0
      ---
      """)

    assert_raise ArgumentError, ~r/polling.interval_ms/, fn ->
      Config.polling_interval_ms(config)
    end
  end

  test "hooks_timeout_ms falls back to the default for non-positive values", %{tmp: tmp} do
    config =
      write_workflow(tmp, """
      ---
      hooks:
        timeout_ms: 0
      ---
      """)

    assert Config.hooks_timeout_ms(config) == 60_000
  end

  test "hook_script returns nil when absent and content when present", %{tmp: tmp} do
    config =
      write_workflow(tmp, """
      ---
      hooks:
        before_run: |
          echo "running"
      ---
      """)

    assert Config.hook_script(config, :before_run) =~ "running"
    assert Config.hook_script(config, :after_run) == nil
  end

  test "resolves relative tracker.issues_root against the workflow file's directory", %{tmp: tmp} do
    config =
      write_workflow(tmp, """
      ---
      tracker:
        kind: local_markdown
        issues_root: .symphony/issues
      ---
      body
      """)

    expected = Path.join(tmp, ".symphony/issues")
    assert Map.fetch!(config.resolved, "tracker.issues_root") == expected
  end

  test "resolves relative workspace.root against the workflow file's directory", %{tmp: tmp} do
    config =
      write_workflow(tmp, """
      ---
      workspace:
        root: .symphony/workspaces
      ---
      """)

    expected = Path.join(tmp, ".symphony/workspaces")
    assert Config.workspace_root(config) == expected
  end

  test "leaves absolute workspace.root paths untouched", %{tmp: tmp} do
    abs = Path.join(tmp, "abs-ws")

    config =
      write_workflow(tmp, """
      ---
      workspace:
        root: #{abs}
      ---
      """)

    assert Config.workspace_root(config) == abs
  end

  test "validate_dispatch_preflight passes for noop tracker with default commands", %{tmp: tmp} do
    config =
      write_workflow(tmp, """
      ---
      tracker:
        kind: noop
      ---
      """)

    assert Config.validate_dispatch_preflight(config) == :ok
  end

  test "validate_dispatch_preflight reports missing linear api_key/project_slug", %{tmp: tmp} do
    config =
      write_workflow(tmp, """
      ---
      tracker:
        kind: linear
      ---
      """)

    assert {:error, {:dispatch_preflight, reasons}} =
             Config.validate_dispatch_preflight(config)

    assert :missing_tracker_api_key in reasons
    assert :missing_tracker_project_slug in reasons
  end

  test "validate_dispatch_preflight reports missing github_issues repo", %{tmp: tmp} do
    config =
      write_workflow(tmp, """
      ---
      tracker:
        kind: github_issues
      ---
      """)

    assert {:error, {:dispatch_preflight, reasons}} =
             Config.validate_dispatch_preflight(config)

    assert :missing_tracker_repo in reasons
  end

  test "tracker_active_states accepts both CSV string and YAML list", %{tmp: tmp} do
    csv_config =
      write_workflow(tmp, """
      ---
      tracker:
        active_states: a,b,c
      ---
      """)

    assert Config.tracker_active_states(csv_config) == ["a", "b", "c"]

    list_path = Path.join(tmp, "WORKFLOW.md")

    File.write!(list_path, """
    ---
    tracker:
      active_states:
        - a
        - b
    ---
    body
    """)

    {:ok, workflow} = WorkflowLoader.load(list_path)
    {:ok, list_config} = Config.from_workflow(workflow)
    assert Config.tracker_active_states(list_config) == ["a", "b"]
  end

  describe "typed-track Schema (PR (a) of dual-track migration)" do
    test "Schema parses ours-only tracker.repo and tracker.issues_root", %{tmp: tmp} do
      path = Path.join(tmp, "WORKFLOW.md")

      File.write!(path, """
      ---
      tracker:
        kind: github_issues
        repo: owner/repo
        issues_root: .symphony/issues
      ---
      """)

      {:ok, workflow} = WorkflowLoader.load(path)
      {:ok, settings} = Symphony.Config.Schema.parse(workflow.config, Path.dirname(path))

      assert settings.tracker.repo == "owner/repo"
      assert settings.tracker.issues_root == Path.join(tmp, ".symphony/issues")
    end

    test "Schema parses ours-only agent.command", %{tmp: tmp} do
      path = Path.join(tmp, "WORKFLOW.md")

      File.write!(path, """
      ---
      agent:
        command: scripts/bin/llm.sh
      ---
      """)

      {:ok, workflow} = WorkflowLoader.load(path)
      {:ok, settings} = Symphony.Config.Schema.parse(workflow.config, Path.dirname(path))

      assert settings.agent.command == "scripts/bin/llm.sh"
    end

    test "agent.command defaults to codex app-server when unset", %{tmp: tmp} do
      path = Path.join(tmp, "WORKFLOW.md")
      File.write!(path, "---\n---\n")

      {:ok, workflow} = WorkflowLoader.load(path)
      {:ok, settings} = Symphony.Config.Schema.parse(workflow.config, Path.dirname(path))

      assert settings.agent.command == "codex app-server"
    end

    test "Schema anchors relative workspace.root to the workflow file's directory",
         %{tmp: tmp} do
      path = Path.join(tmp, "WORKFLOW.md")

      File.write!(path, """
      ---
      workspace:
        root: .symphony/workspaces
      ---
      """)

      {:ok, workflow} = WorkflowLoader.load(path)
      {:ok, settings} = Symphony.Config.Schema.parse(workflow.config, Path.dirname(path))

      assert settings.workspace.root == Path.join(tmp, ".symphony/workspaces")
    end

    test "Schema leaves absolute workspace.root unchanged", %{tmp: tmp} do
      path = Path.join(tmp, "WORKFLOW.md")
      abs = Path.join(tmp, "abs-ws")

      File.write!(path, """
      ---
      workspace:
        root: #{abs}
      ---
      """)

      {:ok, workflow} = WorkflowLoader.load(path)
      {:ok, settings} = Symphony.Config.Schema.parse(workflow.config, Path.dirname(path))

      assert settings.workspace.root == abs
    end

    test "Schema resolves $VAR in agent.command and tracker.repo", %{tmp: tmp} do
      System.put_env("SYMPHONY_TEST_CMD", "/usr/local/bin/llm")
      System.put_env("SYMPHONY_TEST_REPO", "ourorg/ourrepo")

      path = Path.join(tmp, "WORKFLOW.md")

      File.write!(path, """
      ---
      agent:
        command: $SYMPHONY_TEST_CMD
      tracker:
        kind: github_issues
        repo: $SYMPHONY_TEST_REPO
      ---
      """)

      {:ok, workflow} = WorkflowLoader.load(path)
      {:ok, settings} = Symphony.Config.Schema.parse(workflow.config, Path.dirname(path))

      assert settings.agent.command == "/usr/local/bin/llm"
      assert settings.tracker.repo == "ourorg/ourrepo"
    after
      System.delete_env("SYMPHONY_TEST_CMD")
      System.delete_env("SYMPHONY_TEST_REPO")
    end

    test "parse/1 with no anchor leaves relative paths unchanged" do
      raw = %{
        "tracker" => %{"kind" => "local_markdown", "issues_root" => ".symphony/issues"},
        "workspace" => %{"root" => ".symphony/workspaces"}
      }

      {:ok, settings} = Symphony.Config.Schema.parse(raw)

      assert settings.tracker.issues_root == ".symphony/issues"
      # workspace.root has its own default-fallback path; relative paths
      # without an anchor stay relative.
      assert settings.workspace.root == ".symphony/workspaces"
    end
  end
end
