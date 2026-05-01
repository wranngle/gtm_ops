defmodule Symphony do
  @moduledoc """
  Spec-faithful Symphony orchestrator.

  Reads a repository-owned `WORKFLOW.md`, polls a configured tracker,
  dispatches one agent run per active issue into a per-issue workspace,
  reconciles every tick, and exposes a snapshot interface.

  Reference: `https://github.com/openai/symphony/blob/main/SPEC.md`.
  """

  alias Symphony.WorkflowLoader

  @doc """
  Top-level snapshot for operator dashboards. Aggregates orchestrator
  state, retry queue, codex totals, and the latest rate-limit payload.

  Returns `{:ok, map}` or `{:error, reason}`.
  """
  @spec snapshot() :: {:ok, map()} | {:error, term()}
  def snapshot do
    Symphony.Orchestrator.snapshot()
  end

  @doc "Reload the workflow from disk and re-apply config."
  @spec reload_workflow() :: :ok | {:error, term()}
  def reload_workflow do
    case WorkflowLoader.load() do
      {:ok, workflow} -> Symphony.Orchestrator.apply_workflow(workflow)
      {:error, _} = err -> err
    end
  end
end
