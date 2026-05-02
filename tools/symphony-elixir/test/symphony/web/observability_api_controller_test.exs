defmodule Symphony.Web.ObservabilityApiControllerTest do
  @moduledoc """
  Spec § 13.3: GET /api/snapshot returns the current orchestrator
  snapshot as JSON, with `running`, `retrying`, `codex_totals`, and
  `rate_limits`. Error modes: 503 unavailable, 504 timeout.
  """

  use Symphony.WebCase, async: false

  setup do
    # Each test that needs a real snapshot can start its own stub via
    # `Symphony.WebCase.start_stub_snapshot!/1`. We tear down between
    # tests so they don't pollute each other. Tolerant of the orchestrator
    # name being missing or the process having already died.
    on_exit(fn ->
      Symphony.WebCase.terminate_existing_orchestrator!()
    end)

    :ok
  end

  describe "GET /api/snapshot" do
    test "returns 200 + JSON shape with the spec § 13.3 fields" do
      Symphony.WebCase.start_stub_snapshot!(%{
        running: [],
        retrying: [],
        codex_totals: %{input_tokens: 0, output_tokens: 0, total_tokens: 0, seconds_running: 0},
        rate_limits: nil,
        workflow_loaded: true,
        tracker_kind: :local_markdown,
        last_tick_at: nil
      })

      conn = build_conn(:get, "/api/snapshot")
      conn = Symphony.Web.Endpoint.call(conn, Symphony.Web.Endpoint.init([]))

      assert conn.status == 200
      assert {"content-type", "application/json; charset=utf-8"} in conn.resp_headers
      body = Jason.decode!(conn.resp_body)
      assert body["counts"] == %{"running" => 0, "retrying" => 0}
      assert body["running"] == []
      assert body["retrying"] == []
      assert is_map(body["codex_totals"])
      assert Map.has_key?(body["codex_totals"], "total_tokens")
    end

    test "returns 503 + unavailable when orchestrator is down" do
      conn = build_conn(:get, "/api/snapshot")
      conn = Symphony.Web.Endpoint.call(conn, Symphony.Web.Endpoint.init([]))

      assert conn.status == 503
      body = Jason.decode!(conn.resp_body)
      assert body["error"]["code"] == "snapshot_unavailable"
    end

    test "running list contains the spec § 13.3 + § 13.5 fields per row" do
      Symphony.WebCase.start_stub_snapshot!(%{
        running: [
          %{
            issue_id: "id-1",
            identifier: "WGTE-001",
            state: "in_progress",
            phase: :running,
            status: :running,
            workspace_path: "/tmp/x",
            session_id: "thread-x-turn-y",
            thread_id: "thread-x",
            turn_id: "turn-y",
            codex_app_server_pid: nil,
            last_codex_event: :session_started,
            last_codex_timestamp: DateTime.utc_now(),
            last_codex_message: %{"session_id" => "thread-x-turn-y"},
            codex_input_tokens: 7,
            codex_output_tokens: 8,
            codex_total_tokens: 15,
            last_reported_input_tokens: 0,
            last_reported_output_tokens: 0,
            last_reported_total_tokens: 0,
            turn_count: 3,
            started_at: DateTime.utc_now(),
            runtime_seconds: 0
          }
        ],
        retrying: [],
        codex_totals: %{input_tokens: 7, output_tokens: 8, total_tokens: 15, seconds_running: 0},
        rate_limits: %{"primary" => %{"usedPercent" => 12, "windowDurationMins" => 60}},
        workflow_loaded: true,
        tracker_kind: :local_markdown,
        last_tick_at: nil
      })

      conn = build_conn(:get, "/api/snapshot")
      conn = Symphony.Web.Endpoint.call(conn, Symphony.Web.Endpoint.init([]))

      assert conn.status == 200
      body = Jason.decode!(conn.resp_body)
      assert body["counts"] == %{"running" => 1, "retrying" => 0}
      [row] = body["running"]
      assert row["issue_identifier"] == "WGTE-001"
      assert row["session_id"] == "thread-x-turn-y"
      assert row["turn_count"] == 3
      assert row["tokens"]["total_tokens"] == 15
      assert row["last_event"] == "session_started"
      assert is_binary(row["last_message"])
      assert body["rate_limits"]["primary"]["usedPercent"] == 12
    end
  end

  describe "GET /api/v1/state (legacy alias)" do
    test "responds with the same payload shape" do
      Symphony.WebCase.start_stub_snapshot!(%{
        running: [],
        retrying: [],
        codex_totals: %{input_tokens: 0, output_tokens: 0, total_tokens: 0, seconds_running: 0},
        rate_limits: nil,
        workflow_loaded: true,
        tracker_kind: :local_markdown,
        last_tick_at: nil
      })

      conn = build_conn(:get, "/api/v1/state")
      conn = Symphony.Web.Endpoint.call(conn, Symphony.Web.Endpoint.init([]))

      assert conn.status == 200
      assert Jason.decode!(conn.resp_body)["counts"] == %{"running" => 0, "retrying" => 0}
    end
  end

  describe "405 method not allowed" do
    test "POST /api/snapshot rejects with 405" do
      conn = build_conn(:post, "/api/snapshot")
      conn = Symphony.Web.Endpoint.call(conn, Symphony.Web.Endpoint.init([]))

      assert conn.status == 405
      body = Jason.decode!(conn.resp_body)
      assert body["error"]["code"] == "method_not_allowed"
    end

    test "POST /api/v1/state rejects with 405 (matches upstream extensions_test)" do
      conn = build_conn(:post, "/api/v1/state")
      conn = Symphony.Web.Endpoint.call(conn, Symphony.Web.Endpoint.init([]))

      assert conn.status == 405

      assert Jason.decode!(conn.resp_body) ==
               %{"error" => %{"code" => "method_not_allowed", "message" => "Method not allowed"}}
    end

    test "GET /api/v1/refresh rejects with 405 (refresh is POST-only)" do
      conn = build_conn(:get, "/api/v1/refresh")
      conn = Symphony.Web.Endpoint.call(conn, Symphony.Web.Endpoint.init([]))

      assert conn.status == 405
      assert Jason.decode!(conn.resp_body)["error"]["code"] == "method_not_allowed"
    end

    test "POST / (root) rejects with 405 — LiveView dashboard handles GET only" do
      conn = build_conn(:post, "/")
      conn = Symphony.Web.Endpoint.call(conn, Symphony.Web.Endpoint.init([]))

      assert conn.status == 405
      assert Jason.decode!(conn.resp_body)["error"]["code"] == "method_not_allowed"
    end

    test "POST /api/v1/MT-1 (per-issue path with non-GET) rejects with 405" do
      conn = build_conn(:post, "/api/v1/MT-1")
      conn = Symphony.Web.Endpoint.call(conn, Symphony.Web.Endpoint.init([]))

      assert conn.status == 405
      assert Jason.decode!(conn.resp_body)["error"]["code"] == "method_not_allowed"
    end
  end

  describe "GET /api/v1/:issue_identifier" do
    test "returns 200 + per-issue payload when the issue is running" do
      now = DateTime.utc_now()

      Symphony.WebCase.start_stub_snapshot!(%{
        running: [
          %{
            issue_id: "id-1",
            identifier: "WGTE-007",
            state: "in_progress",
            phase: :running,
            status: :running,
            session_id: "sess",
            last_codex_event: :session_started,
            last_codex_timestamp: now,
            last_codex_message: nil,
            codex_input_tokens: 0,
            codex_output_tokens: 0,
            codex_total_tokens: 0,
            turn_count: 1,
            started_at: now
          }
        ],
        retrying: [],
        codex_totals: %{input_tokens: 0, output_tokens: 0, total_tokens: 0, seconds_running: 0},
        rate_limits: nil,
        workflow_loaded: true,
        tracker_kind: :local_markdown,
        last_tick_at: nil
      })

      conn = build_conn(:get, "/api/v1/WGTE-007")
      conn = Symphony.Web.Endpoint.call(conn, Symphony.Web.Endpoint.init([]))

      assert conn.status == 200
      body = Jason.decode!(conn.resp_body)
      assert body["identifier"] == "WGTE-007"
      assert body["status"] == "running"
    end

    test "returns 404 + issue_not_found when the issue is not in the snapshot" do
      Symphony.WebCase.start_stub_snapshot!(%{
        running: [],
        retrying: [],
        codex_totals: %{input_tokens: 0, output_tokens: 0, total_tokens: 0, seconds_running: 0},
        rate_limits: nil,
        workflow_loaded: true,
        tracker_kind: :local_markdown,
        last_tick_at: nil
      })

      conn = build_conn(:get, "/api/v1/MT-MISSING")
      conn = Symphony.Web.Endpoint.call(conn, Symphony.Web.Endpoint.init([]))

      assert conn.status == 404

      assert Jason.decode!(conn.resp_body) ==
               %{"error" => %{"code" => "issue_not_found", "message" => "Issue not found"}}
    end
  end

  describe "POST /api/v1/refresh" do
    test "returns 503 + orchestrator_unavailable when orchestrator isn't running" do
      conn = build_conn(:post, "/api/v1/refresh")
      conn = Symphony.Web.Endpoint.call(conn, Symphony.Web.Endpoint.init([]))

      assert conn.status == 503
      body = Jason.decode!(conn.resp_body)
      assert body["error"]["code"] == "orchestrator_unavailable"
    end
  end
end
