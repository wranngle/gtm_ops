defmodule Symphony.Web.Live.DashboardLiveTest do
  @moduledoc """
  Spec § 13.3 dashboard smoke: mount, render, assert running/retrying/
  codex_totals fields appear in the rendered HTML.
  """

  use Symphony.WebCase, async: false

  setup do
    on_exit(fn ->
      Symphony.WebCase.terminate_existing_orchestrator!()
    end)

    :ok
  end

  test "mounts and renders the dashboard with snapshot fields" do
    Symphony.WebCase.start_stub_snapshot!(%{
      running: [
        %{
          issue_id: "x",
          identifier: "WGTE-001",
          state: "in_progress",
          phase: :running,
          status: :running,
          workspace_path: "/tmp/x",
          session_id: "thread-1-turn-2",
          thread_id: "thread-1",
          turn_id: "turn-2",
          codex_app_server_pid: nil,
          last_codex_event: :turn_started,
          last_codex_timestamp: DateTime.utc_now(),
          last_codex_message: %{
            "method" => "turn/started",
            "params" => %{"turn" => %{"id" => "turn-2"}}
          },
          codex_input_tokens: 1_234,
          codex_output_tokens: 5_678,
          codex_total_tokens: 6_912,
          last_reported_input_tokens: 0,
          last_reported_output_tokens: 0,
          last_reported_total_tokens: 0,
          turn_count: 1,
          started_at: DateTime.utc_now(),
          runtime_seconds: 0
        }
      ],
      retrying: [
        %{
          issue_id: "y",
          identifier: "WGTE-002",
          attempt: 2,
          due_in_ms: 30_000,
          reason: :failure,
          error: "simulated error"
        }
      ],
      codex_totals: %{
        input_tokens: 1_234,
        output_tokens: 5_678,
        total_tokens: 6_912,
        seconds_running: 12
      },
      rate_limits: nil,
      workflow_loaded: true,
      tracker_kind: :local_markdown,
      last_tick_at: nil,
      polling: %{poll_interval_ms: 60_000, next_poll_in_ms: 0, checking?: true}
    })

    conn = build_conn(:get, "/")
    {:ok, _view, html} = live(conn, "/")

    # Spec § 13.3 fields surface in the rendered HTML.
    assert html =~ "Operations Dashboard"
    assert html =~ "Running"
    assert html =~ "Retrying"
    assert html =~ "WGTE-001"
    assert html =~ "WGTE-002"
    assert html =~ "thread-1-tur"
    # Token total formatted with thousands separators
    assert html =~ "6,912"
    assert html =~ "Total tokens"
    assert html =~ "Polling"
    assert html =~ "Checking now"
    assert html =~ "Recent events"
  end

  test "renders the error state when snapshot is unavailable" do
    # No stub orchestrator — snapshot returns {:error, :unavailable}
    conn = build_conn(:get, "/")
    {:ok, _view, html} = live(conn, "/")

    assert html =~ "Snapshot unavailable"
    assert html =~ "snapshot_unavailable"
  end
end
