defmodule Symphony.RunAttemptTest do
  use ExUnit.Case, async: true

  alias Symphony.RunAttempt

  test "phases() returns the canonical 11-phase lifecycle per spec § 7.2" do
    phases = RunAttempt.phases()
    assert length(phases) == 11

    assert phases == [
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
  end

  test "default attempt struct starts in preparing_workspace with status :unknown" do
    a = %RunAttempt{}
    assert a.phase == :preparing_workspace
    assert a.status == :unknown
    assert a.attempt == nil
  end
end
