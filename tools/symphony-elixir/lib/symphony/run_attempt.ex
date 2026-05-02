defmodule Symphony.RunAttempt do
  @moduledoc """
  Domain struct for one execution attempt against one issue, per spec
  section 4.1.5.

  The 11-phase lifecycle (§7.2) is captured in `phase/0`. Real workers
  walk through these phases and report status back to the orchestrator,
  which converts them into explicit state transitions per §7.3. The log-
  only dispatch path that ships today does not yet build this struct,
  but the type contract is in place so the worker spawn slice can plug in
  without redesign.
  """

  @type phase ::
          :preparing_workspace
          | :building_prompt
          | :launching_agent_process
          | :initializing_session
          | :streaming_turn
          | :finishing
          | :succeeded
          | :failed
          | :timed_out
          | :stalled
          | :canceled_by_reconciliation

  @phases [
    :preparing_workspace,
    :building_prompt,
    :launching_agent_process,
    :initializing_session,
    :streaming_turn,
    :finishing,
    :succeeded,
    :failed,
    :timed_out,
    :stalled,
    :canceled_by_reconciliation
  ]

  @type t :: %__MODULE__{
          issue_id: binary(),
          issue_identifier: binary(),
          attempt: pos_integer() | nil,
          workspace_path: binary() | nil,
          started_at: DateTime.t() | nil,
          phase: phase(),
          status: :ok | :error | :unknown,
          error: term() | nil
        }

  defstruct issue_id: "",
            issue_identifier: "",
            attempt: nil,
            workspace_path: nil,
            started_at: nil,
            phase: :preparing_workspace,
            status: :unknown,
            error: nil

  @doc "Return the canonical 11-phase lifecycle list per spec § 7.2."
  @spec phases() :: [phase()]
  def phases, do: @phases
end
