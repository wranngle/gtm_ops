defmodule Symphony.AgentRunner.CodexAppServerTest do
  use ExUnit.Case, async: false

  alias Symphony.AgentRunner.CodexAppServer
  alias Symphony.{Config, Tracker, WorkflowLoader, WorkspaceManager}

  setup do
    tmp =
      Path.join(System.tmp_dir!(), "symphony-codex-runner-#{System.unique_integer([:positive])}")

    File.mkdir_p!(tmp)
    on_exit(fn -> File.rm_rf!(tmp) end)
    {:ok, tmp: tmp}
  end

  defp make_config(tmp, codex_command, extra \\ "") do
    workflow_path = Path.join(tmp, "WORKFLOW.md")
    workspace_root = Path.join(tmp, "ws")

    File.write!(workflow_path, """
    ---
    workspace:
      root: #{workspace_root}
    codex:
      command: #{codex_command}
      read_timeout_ms: 5000
      turn_timeout_ms: 5000
    #{extra}
    ---
    Echo template: {{ issue.identifier }}.
    """)

    {:ok, workflow} = WorkflowLoader.load(workflow_path)
    {:ok, config} = Config.from_workflow(workflow)
    config
  end

  defp make_issue do
    %Tracker.Issue{
      id: "WGTE-CD-001",
      identifier: "WGTE-CD-001",
      title: "Codex runner smoke",
      description: "smoke",
      state: "todo",
      priority: 1
    }
  end

  defp write_codex_script!(path, body) do
    File.write!(path, body)
    File.chmod!(path, 0o755)
  end

  defp happy_codex_script(thread_id, turn_id) do
    """
    #!/bin/sh
    count=0
    while IFS= read -r line; do
      count=$((count + 1))
      case "$count" in
        1) printf '%s\\n' '{"id":1,"result":{}}' ;;
        2) printf '%s\\n' '{"id":2,"result":{"thread":{"id":"#{thread_id}"}}}' ;;
        3) printf '%s\\n' '{"id":3,"result":{"turn":{"id":"#{turn_id}"}}}' ;;
        4) printf '%s\\n' '{"method":"turn/completed"}'
           exit 0 ;;
        *) exit 0 ;;
      esac
    done
    """
  end

  test "runs a single turn end-to-end and writes prompt + transcript artifacts", %{tmp: tmp} do
    codex_binary = Path.join(tmp, "fake-codex")
    write_codex_script!(codex_binary, happy_codex_script("thr_run", "turn_run"))

    config = make_config(tmp, codex_binary)
    issue = make_issue()
    {:ok, ws} = WorkspaceManager.ensure_exists(config, issue.identifier)

    # Stub the issue state fetcher so the continuation check resolves
    # without going through a real tracker adapter.
    fetcher = fn _config, [issue_id] -> {:ok, %{issue_id => "done"}} end

    assert {:ok, result} =
             CodexAppServer.run(config, issue, ws, max_turns: 1, issue_state_fetcher: fetcher)

    assert result.exit_code == 0
    assert is_integer(result.duration_ms) and result.duration_ms >= 0

    rendered = File.read!(result.rendered_prompt_path)
    assert rendered =~ "Echo template: WGTE-CD-001."

    # The transcript file exists and contains at least one event line.
    transcript = File.read!(result.output_path)
    assert transcript =~ "session_started"
    assert transcript =~ "turn_completed"
  end

  test "loops continuation turns up to agent.max_turns when the issue stays active", %{tmp: tmp} do
    codex_binary = Path.join(tmp, "fake-codex")

    # This script completes two turns; the runner should loop after
    # the first because the fetcher reports the issue is still active.
    # Each turn/start request reuses id=3 (the upstream protocol id is
    # constant across continuation turns), so the fake-codex emits the
    # same id=3 response shape on every turn/start it reads.
    write_codex_script!(codex_binary, """
    #!/bin/sh
    count=0
    while IFS= read -r line; do
      count=$((count + 1))
      case "$count" in
        1) printf '%s\\n' '{"id":1,"result":{}}' ;;
        2) printf '%s\\n' '{"id":2,"result":{"thread":{"id":"thr_x"}}}' ;;
        3) printf '%s\\n' '{"id":3,"result":{"turn":{"id":"turn_x_1"}}}' ;;
        4) printf '%s\\n' '{"method":"turn/completed"}'
           # Pre-emit the response for the second turn/start so that
           # when the runner sends turn/start again the response is
           # already buffered.
           printf '%s\\n' '{"id":3,"result":{"turn":{"id":"turn_x_2"}}}'
           ;;
        5) printf '%s\\n' '{"method":"turn/completed"}'
           exit 0 ;;
        *) exit 0 ;;
      esac
    done
    """)

    config = make_config(tmp, codex_binary)
    issue = make_issue()
    {:ok, ws} = WorkspaceManager.ensure_exists(config, issue.identifier)

    test_pid = self()

    fetcher = fn _config, [issue_id] ->
      send(test_pid, {:fetcher_called, issue_id})
      {:ok, %{issue_id => "in_progress"}}
    end

    assert {:ok, _} =
             CodexAppServer.run(config, issue, ws, max_turns: 2, issue_state_fetcher: fetcher)

    # Fetcher gets called after the first turn (to decide whether to
    # continue) and AT MOST after the second turn (where max_turns
    # halts the loop). We assert at least one call.
    assert_received {:fetcher_called, _}
  end

  test "halts the loop when the issue moves to a terminal state", %{tmp: tmp} do
    codex_binary = Path.join(tmp, "fake-codex")
    write_codex_script!(codex_binary, happy_codex_script("thr_t", "turn_t"))

    config = make_config(tmp, codex_binary)
    issue = make_issue()
    {:ok, ws} = WorkspaceManager.ensure_exists(config, issue.identifier)

    fetcher = fn _config, [issue_id] -> {:ok, %{issue_id => "done"}} end

    assert {:ok, _} =
             CodexAppServer.run(config, issue, ws, max_turns: 5, issue_state_fetcher: fetcher)
  end

  test "fails the attempt when codex demands user input (hard failure)", %{tmp: tmp} do
    codex_binary = Path.join(tmp, "fake-codex")

    write_codex_script!(codex_binary, """
    #!/bin/sh
    count=0
    while IFS= read -r line; do
      count=$((count + 1))
      case "$count" in
        1) printf '%s\\n' '{"id":1,"result":{}}' ;;
        2) printf '%s\\n' '{"id":2,"result":{"thread":{"id":"thr_in"}}}' ;;
        3) printf '%s\\n' '{"id":3,"result":{"turn":{"id":"turn_in"}}}'
           printf '%s\\n' '{"method":"turn/input_required","id":"resp","params":{"requiresInput":true}}'
           ;;
        *) exit 0 ;;
      esac
    done
    """)

    config = make_config(tmp, codex_binary)
    issue = make_issue()
    {:ok, ws} = WorkspaceManager.ensure_exists(config, issue.identifier)

    fetcher = fn _config, _ids -> {:ok, %{}} end

    assert {:error, {:turn_failed, {:turn_input_required, _payload}, 1}} =
             CodexAppServer.run(config, issue, ws, max_turns: 2, issue_state_fetcher: fetcher)
  end

  test "uses CodexAppServer when codex.command is non-default", %{tmp: tmp} do
    config = make_config(tmp, "/usr/local/bin/codex app-server")

    assert {:ok, Symphony.AgentRunner.CodexAppServer} =
             Symphony.AgentRunner.adapter_for(config)
  end

  test "falls back to LocalShell when codex.command points at scripts/bin/llm.sh", %{tmp: tmp} do
    config = make_config(tmp, "scripts/bin/llm.sh")

    assert {:ok, Symphony.AgentRunner.LocalShell} =
             Symphony.AgentRunner.adapter_for(config)
  end

  test "honours explicit agent.runner_kind override", %{tmp: tmp} do
    config =
      make_config(tmp, "/usr/local/bin/codex app-server", "agent:\n  runner_kind: local_shell")

    assert {:ok, Symphony.AgentRunner.LocalShell} =
             Symphony.AgentRunner.adapter_for(config)
  end
end
