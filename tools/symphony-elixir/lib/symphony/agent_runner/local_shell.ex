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
    shell_command = "#{command} < " <> shell_quote(prompt_path)

    task =
      Task.async(fn ->
        System.cmd("bash", ["-lc", shell_command],
          cd: workspace.path,
          stderr_to_stdout: true
        )
      end)

    case Task.yield(task, timeout_ms) || Task.shutdown(task, :brutal_kill) do
      {:ok, {output, exit_code}} ->
        File.write!(output_path, output)
        {:ok, output_path, exit_code}

      nil ->
        {:error, :agent_timeout}

      other ->
        {:error, {:agent_runner_unknown, other}}
    end
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
    Map.get(config.resolved, "codex.turn_timeout_ms", 3_600_000)
  end

  defp utc_stamp do
    {{y, m, d}, {hh, mm, ss}} = :calendar.universal_time()

    :io_lib.format("~4..0B~2..0B~2..0BT~2..0B~2..0B~2..0BZ", [y, m, d, hh, mm, ss])
    |> IO.iodata_to_binary()
  end

  defp ok_if_no_raise(:ok), do: :ok
end
