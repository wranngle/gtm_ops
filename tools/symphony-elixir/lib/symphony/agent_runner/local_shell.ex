defmodule Symphony.AgentRunner.LocalShell do
  @moduledoc """
  Agent runner adapter that pipes a rendered prompt through `agent.command`
  via `bash -lc`. Produces both `rendered-prompt.md` (always) and
  `agent-output-<UTC-ts>.md` (the agent's stdout).

  Used by the surrounding repo's `scripts/bin/llm.sh` provider-fallback
  chain. Codex-independent.

  Lifecycle per attempt:

    1. Assert workspace safety invariants (section 9).
    2. Fire `before_run` hook; bail if non-zero.
    3. Render prompt via `Symphony.PromptRenderer`.
    4. Write `rendered-prompt.md` inside the workspace.
    5. Pipe the prompt to `agent.command` via stdin; capture stdout.
    6. Write stdout to `agent-output-<ts>.md`.
    7. Fire `after_run` hook (failure logged-and-ignored, per section 9).
    8. Return result.
  """

  @behaviour Symphony.AgentRunner

  alias Symphony.{Config, PromptRenderer, Tracker, WorkflowLoader, WorkspaceManager}

  require Logger

  @impl true
  def run(config, %Tracker.Issue{} = issue, workspace, opts \\ []) do
    started_at = System.monotonic_time(:millisecond)
    template = Keyword.get(opts, :template, default_template(config))
    attempt = Keyword.get(opts, :attempt)

    with :ok <-
           WorkspaceManager.assert_inside_root!(Config.workspace_root(config), workspace.path)
           |> ok_if_no_raise(),
         :ok <- run_before_hooks(config, workspace),
         {:ok, rendered} <-
           PromptRenderer.render(%{template: template, issue: issue, attempt: attempt}),
         {:ok, prompt_path} <- write_rendered_prompt(workspace, rendered),
         {:ok, output_path, exit_code} <- pipe_through_agent(config, workspace, rendered) do
      _ = WorkspaceManager.run_hook(config, workspace, :after_run)
      duration_ms = System.monotonic_time(:millisecond) - started_at

      Logger.info(
        "symphony.agent_attempt outcome=success identifier=#{issue.identifier} exit=#{exit_code} duration_ms=#{duration_ms}"
      )

      {:ok,
       %{
         output_path: output_path,
         rendered_prompt_path: prompt_path,
         exit_code: exit_code,
         duration_ms: duration_ms
       }}
    else
      {:error, reason} = err ->
        _ = WorkspaceManager.run_hook(config, workspace, :after_run)

        Logger.warning(
          "symphony.agent_attempt outcome=failure identifier=#{issue.identifier} reason=#{inspect(reason)}"
        )

        err
    end
  end

  # ============== Helpers ==============

  # Spec § 5.4 fallback: when the workflow body is empty the runtime may
  # use a minimal default prompt. Read/parse failures stay errors and are
  # surfaced via the calling pipeline rather than silently masked.
  @default_fallback_prompt "You are working on an issue from Linear."

  defp default_template(config) do
    case WorkflowLoader.load(config.source_path) do
      {:ok, %{prompt_template: ""}} -> @default_fallback_prompt
      {:ok, %{prompt_template: tpl}} -> tpl
      _ -> @default_fallback_prompt
    end
  end

  defp run_before_hooks(config, workspace) do
    case workspace.created_now do
      true ->
        case WorkspaceManager.run_hook(config, workspace, :after_create) do
          :ok ->
            WorkspaceManager.run_hook(config, workspace, :before_run)

          {:error, _reason} = error ->
            _ = WorkspaceManager.remove(config, workspace.workspace_key)
            error
        end

      false ->
        WorkspaceManager.run_hook(config, workspace, :before_run)
    end
  end

  defp write_rendered_prompt(workspace, rendered) do
    path = Path.join(workspace.path, "rendered-prompt.md")
    File.write!(path, rendered)
    {:ok, path}
  end

  defp pipe_through_agent(config, workspace, _rendered) do
    command = Config.agent_command(config) |> resolve_command_first_token(config)
    output_path = Path.join(workspace.path, "agent-output-#{utc_stamp()}.md")
    prompt_path = Path.join(workspace.path, "rendered-prompt.md")
    timeout_ms = pipe_timeout_ms(config)

    # `exec` so bash hands control to the agent command (no extra
    # shell layer between us and the worker). `setsid -w` (in
    # open_supervised_port/3 below) gives us a kill-the-whole-group
    # cleanup path on timeout/error; on graceful BEAM shutdown the
    # in-BEAM watchdog (also below) handles cleanup. SIGKILL on BEAM
    # leaks orphans — we accept that and rely on a startup-time scan
    # to reap stale workspace processes (TODO).
    shell_command = "exec #{command} < " <> shell_quote(prompt_path)

    spawn_executable = System.find_executable("setsid") || "/usr/bin/setsid"

    port_args = [:binary, :exit_status, :stderr_to_stdout, args: ["bash", "-lc", shell_command]]

    {:ok, port_state} = open_supervised_port(spawn_executable, port_args, workspace.path)

    case wait_for_port_exit(port_state, timeout_ms) do
      {:ok, {output, exit_code}} ->
        File.write!(output_path, output)
        {:ok, output_path, exit_code}

      :timeout ->
        kill_process_group!(port_state)
        {:error, :agent_timeout}

      {:error, reason} ->
        kill_process_group!(port_state)
        {:error, {:agent_runner_unknown, reason}}
    end
  end

  # When the worker exits cleanly via the port's :exit_status, the
  # subprocess is already dead so the watchdog doesn't need to act.
  # We let it stay linked — if the LocalShell caller dies after the
  # port reports exit but before this function returns, killing an
  # already-dead process group is a no-op anyway.

  defp open_supervised_port(executable, args, cwd) do
    # `setsid -w <bash> -lc <cmd>` makes the child its own session
    # leader (so we can SIGKILL the entire process group on timeout)
    # AND waits for the child to exit so the port's `:exit_status`
    # event reflects bash's exit, not `setsid`'s. Without `-w`, setsid
    # forks and exits 0 immediately and we'd misreport the worker's
    # exit code.
    runner_args = ["-w" | Keyword.get(args, :args)]

    port =
      Port.open({:spawn_executable, executable}, [
        :binary,
        :exit_status,
        :stderr_to_stdout,
        :hide,
        {:cd, String.to_charlist(cwd)},
        {:args, runner_args}
      ])

    state =
      case Port.info(port, :os_pid) do
        {:os_pid, os_pid} -> %{port: port, os_pid: os_pid}
        _ -> %{port: port, os_pid: nil}
      end

    # Spawn a linked watchdog. If the LocalShell caller (the worker
    # Task) dies for ANY reason — timeout, supervisor shutdown, BEAM
    # SIGTERM, parent crash — the watchdog receives an EXIT and SIGKILLs
    # the entire process group. This closes the orphan-llm.sh leak that
    # the previous System.cmd-based runner had: there, BEAM dying left
    # subprocesses running indefinitely. Now they die with their parent.
    parent = self()
    {:ok, _watchdog} = start_watchdog(parent, state)

    {:ok, state}
  end

  defp start_watchdog(parent, state) do
    {:ok,
     spawn_link(fn ->
       ref = Process.monitor(parent)
       Process.flag(:trap_exit, true)

       receive do
         {:DOWN, ^ref, :process, _, _reason} ->
           kill_process_group!(state)

         {:EXIT, _from, _reason} ->
           kill_process_group!(state)

         :watchdog_release ->
           :ok
       end
     end)}
  end

  defp wait_for_port_exit(%{port: port}, timeout_ms) do
    do_wait_for_port_exit(port, timeout_ms, [])
  end

  defp do_wait_for_port_exit(port, timeout_ms, acc) do
    receive do
      {^port, {:data, chunk}} ->
        do_wait_for_port_exit(port, timeout_ms, [acc, chunk])

      {^port, {:exit_status, code}} ->
        {:ok, {IO.iodata_to_binary(acc), code}}
    after
      timeout_ms ->
        :timeout
    end
  end

  defp kill_process_group!(%{os_pid: nil}), do: :ok

  defp kill_process_group!(%{os_pid: os_pid}) do
    # `setsid` made the child its own session+process-group leader, so
    # killing -<pid> nukes every descendant in one syscall.
    _ = System.cmd("kill", ["-KILL", "-#{os_pid}"], stderr_to_stdout: true)
    :ok
  end

  defp shell_quote(value) do
    "'" <> String.replace(value, "'", ~S('\'')) <> "'"
  end

  # Spec § 9.5 invariant 1 pins the worker's cwd to the per-issue
  # workspace dir. That breaks bare relative `agent.command` values
  # like `scripts/bin/llm.sh` (PATH lookup fails because the shell
  # doesn't see the repo's scripts/ subtree from the workspace cwd).
  # Resolve the first whitespace-delimited token of the command line
  # against the workflow file's directory so the operator can keep
  # writing repo-relative paths in WORKFLOW.md.
  defp resolve_command_first_token(command, config) do
    workflow_dir =
      case Map.get(config, :source_path) do
        path when is_binary(path) -> Path.dirname(path)
        _ -> nil
      end

    if is_nil(workflow_dir) do
      command
    else
      case String.split(command, " ", parts: 2) do
        [first | rest] ->
          resolved_first = resolve_one_token(first, workflow_dir)
          Enum.join([resolved_first | rest], " ")

        _ ->
          command
      end
    end
  end

  defp resolve_one_token(token, workflow_dir) do
    cond do
      # Absolute or shell-substitution-bearing tokens: leave alone.
      String.starts_with?(token, "/") or String.contains?(token, "$") ->
        token

      # Bare command (no slash): rely on PATH lookup; don't mangle.
      not String.contains?(token, "/") ->
        token

      # Relative path with at least one slash: resolve against
      # workflow_dir.
      true ->
        Path.expand(token, workflow_dir)
    end
  end

  defp pipe_timeout_ms(config) do
    # Reuse codex.turn_timeout_ms for the local-shell timeout — the
    # surrounding LLM chain enforces its own per-call timeout, so this
    # outer cap is mostly a safety net.
    Config.codex_turn_timeout_ms(config)
  end

  defp utc_stamp do
    {{y, m, d}, {hh, mm, ss}} = :calendar.universal_time()

    :io_lib.format("~4..0B~2..0B~2..0BT~2..0B~2..0B~2..0BZ", [y, m, d, hh, mm, ss])
    |> IO.iodata_to_binary()
  end

  defp ok_if_no_raise(:ok), do: :ok
end
