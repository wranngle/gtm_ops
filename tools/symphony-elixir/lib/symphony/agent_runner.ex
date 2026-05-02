defmodule Symphony.AgentRunner do
  @moduledoc """
  Behaviour for one agent attempt against one issue.

  Per spec section 10.7, an agent runner wraps:

    1. Workspace lifecycle (delegated to `Symphony.WorkspaceManager`).
    2. Prompt rendering (delegated to `Symphony.PromptRenderer`).
    3. Agent invocation (each adapter's responsibility).

  Adapters today:

    * `Symphony.AgentRunner.LocalShell` — shells out to `agent.command`
      (default `scripts/bin/llm.sh`). Implements the codex-independent
      contract used by the surrounding repo.
    * `Symphony.AgentRunner.CodexAppServer` — JSON-RPC over stdio per
      spec section 10. Selected when `codex.command` resolves to
      anything other than the local shell fallback.

  An attempt resolves to `{:ok, %{output_path, exit_code, duration_ms}}`
  or `{:error, reason}`. Adapters must keep the workspace dirty on failure
  so a human can post-mortem.
  """

  alias Symphony.{Config, Tracker, WorkspaceManager}

  # Local fallback `agent.command` shipped with the repo. When the
  # resolved `codex.command` matches this exact path we keep the
  # LocalShell adapter so existing scripts (and the `tracker.kind ==
  # :local_markdown` happy path) keep working without spawning a real
  # Codex app-server.
  @local_shell_codex_marker "scripts/bin/llm.sh"

  @type attempt_result :: %{
          required(:output_path) => binary(),
          required(:exit_code) => integer(),
          required(:duration_ms) => non_neg_integer(),
          optional(:rendered_prompt_path) => binary()
        }

  @callback run(Config.t(), Tracker.Issue.t(), WorkspaceManager.workspace(), keyword()) ::
              {:ok, attempt_result()} | {:error, term()}

  @doc """
  Resolve the adapter module from config. Dispatches on
  `codex.command`:

    * If the resolved value is `scripts/bin/llm.sh` (or contains it as
      a token), pick `LocalShell` — that's the in-repo fallback chain.
    * If the operator explicitly opts in to `codex_app_server` via
      `agent.runner_kind`, pick the Codex JSON-RPC adapter.
    * Otherwise, default to `LocalShell` for backward compatibility
      with existing local-markdown workflows.
  """
  @spec adapter_for(Config.t()) :: {:ok, module()} | {:error, term()}
  def adapter_for(config) do
    runner_kind = read_runner_kind(config)
    codex_command = read_codex_command(config)

    cond do
      runner_kind == "codex_app_server" ->
        {:ok, Symphony.AgentRunner.CodexAppServer}

      runner_kind == "local_shell" ->
        {:ok, Symphony.AgentRunner.LocalShell}

      codex_command != "" and not String.contains?(codex_command, @local_shell_codex_marker) ->
        {:ok, Symphony.AgentRunner.CodexAppServer}

      true ->
        {:ok, Symphony.AgentRunner.LocalShell}
    end
  end

  defp read_runner_kind(config) do
    case Config.agent_runner_kind(config) do
      kind when is_atom(kind) and not is_nil(kind) -> Atom.to_string(kind) |> String.trim()
      _ -> ""
    end
  end

  defp read_codex_command(config) do
    Config.codex_command(config)
  rescue
    _ -> ""
  end
end
