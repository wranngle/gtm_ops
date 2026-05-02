defmodule Symphony.Web.PresenterTest do
  use ExUnit.Case, async: true

  alias Symphony.Web.Presenter

  defp stub_snapshot(map), do: fn -> {:ok, map} end

  test "state_payload/1 builds counts/running/retrying/codex_totals/rate_limits" do
    snapshot = %{
      running: [
        %{
          issue_id: "id-1",
          identifier: "WGTE-001",
          state: "in_progress",
          phase: :running,
          status: :running,
          workspace_path: "/tmp/ws/WGTE-001",
          session_id: "sess-1",
          thread_id: nil,
          turn_id: nil,
          codex_app_server_pid: nil,
          last_codex_event: :turn_started,
          last_codex_timestamp: DateTime.utc_now(),
          last_codex_message: %{"method" => "turn/started"},
          codex_input_tokens: 100,
          codex_output_tokens: 200,
          codex_total_tokens: 300,
          last_reported_input_tokens: 0,
          last_reported_output_tokens: 0,
          last_reported_total_tokens: 0,
          turn_count: 2,
          started_at: DateTime.utc_now(),
          runtime_seconds: 0
        }
      ],
      retrying: [
        %{
          issue_id: "id-2",
          identifier: "WGTE-002",
          attempt: 1,
          due_in_ms: 5_000,
          reason: :failure,
          error: "stub error"
        }
      ],
      codex_totals: %{input_tokens: 100, output_tokens: 200, total_tokens: 300, seconds_running: 5},
      rate_limits: nil,
      workflow_loaded: true,
      tracker_kind: :local_markdown,
      last_tick_at: nil,
      polling: %{poll_interval_ms: 30_000, next_poll_in_ms: 12_500}
    }

    payload = Presenter.state_payload(stub_snapshot(snapshot))

    assert payload.counts == %{running: 1, retrying: 1}
    assert [running] = payload.running
    assert running.issue_identifier == "WGTE-001"
    assert running.session_id == "sess-1"
    assert running.tokens.total_tokens == 300
    assert running.last_event == :turn_started
    assert running.last_message =~ "turn started"

    assert [retry] = payload.retrying
    assert retry.identifier == "WGTE-002"
    assert retry.attempt == 1
    assert retry.due_at != nil

    assert payload.codex_totals.total_tokens == 300
    assert payload.rate_limits == nil
    assert is_list(payload.recent_events)

    # Spec § 13.5 + STACK-075: poll-loop visibility surfaces through
    # `polling: %{poll_interval_ms, next_poll_in_ms, checking?}`.
    assert payload.polling.poll_interval_ms == 30_000
    assert payload.polling.next_poll_in_ms == 12_500
    assert payload.polling.checking? == false
  end

  test "state_payload/1 tolerates snapshots without a :polling key" do
    snapshot = %{
      running: [],
      retrying: [],
      codex_totals: %{input_tokens: 0, output_tokens: 0, total_tokens: 0, seconds_running: 0},
      rate_limits: nil
    }

    payload = Presenter.state_payload(stub_snapshot(snapshot))

    assert payload.polling == %{
             poll_interval_ms: nil,
             next_poll_in_ms: nil,
             checking?: false
           }
  end

  test "state_payload/1 surfaces :timeout error mode" do
    payload = Presenter.state_payload(fn -> {:error, :timeout} end)

    assert payload.error.code == "snapshot_timeout"
    assert payload.error.message =~ "timed out"
    assert is_binary(payload.generated_at)
  end

  test "state_payload/1 surfaces :unavailable error mode" do
    payload = Presenter.state_payload(fn -> {:error, :unavailable} end)

    assert payload.error.code == "snapshot_unavailable"
    assert payload.error.message =~ "unavailable"
  end

  test "issue_payload/2 returns :issue_not_found when neither running nor retrying matches" do
    snapshot = %{running: [], retrying: [], codex_totals: %{}, rate_limits: nil}
    assert Presenter.issue_payload("UNKNOWN", stub_snapshot(snapshot)) == {:error, :issue_not_found}
  end

  test "issue_payload/2 returns the running entry when present" do
    running_entry = %{
      issue_id: "id",
      identifier: "WGTE-X",
      state: "in_progress",
      session_id: "s",
      last_codex_event: nil,
      last_codex_timestamp: nil,
      last_codex_message: nil,
      codex_input_tokens: 0,
      codex_output_tokens: 0,
      codex_total_tokens: 0,
      turn_count: 0,
      started_at: nil
    }

    snapshot = %{running: [running_entry], retrying: [], codex_totals: %{}, rate_limits: nil}

    assert {:ok, payload} = Presenter.issue_payload("WGTE-X", stub_snapshot(snapshot))
    assert payload.identifier == "WGTE-X"
    assert payload.status == "running"
    assert payload.running.session_id == "s"
  end
end
