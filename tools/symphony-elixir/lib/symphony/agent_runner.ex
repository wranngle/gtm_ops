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

  Adapters planned:

    * `Symphony.AgentRunner.CodexAppServer` — JSON-RPC over stdio per spec
      section 10. Pending T-8.

  An attempt resolves to `{:ok, %{output_path, exit_code, duration_ms}}`
  or `{:error, reason}`. Adapters must keep the workspace dirty on failure
  so a human can post-mortem.
  """

  alias Symphony.{Config, Tracker, WorkspaceManager}

  @type attempt_result :: %{
          required(:output_path) => binary(),
          required(:exit_code) => integer(),
          required(:duration_ms) => non_neg_integer(),
          optional(:rendered_prompt_path) => binary()
        }

  @callback run(Config.t(), Tracker.Issue.t(), WorkspaceManager.workspace(), keyword()) ::
              {:ok, attempt_result()} | {:error, term()}

  @doc """
  Resolve the adapter module from config. Currently always
  `Symphony.AgentRunner.LocalShell`; future kinds (`codex_app_server`)
  branch here.
  """
  @spec adapter_for(Config.t()) :: {:ok, module()} | {:error, term()}
  def adapter_for(_config) do
    # Future: read agent.runner_kind from config and dispatch.
    # For now, the local shell adapter is the only implementation.
    {:ok, Symphony.AgentRunner.LocalShell}
  end
end
