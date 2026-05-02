defmodule Symphony.StatusDashboardTest do
  @moduledoc """
  Spec § 13.6: humanized agent event summaries are observability-only;
  the orchestrator must not depend on these strings. We verify the
  shape and a representative set of mappings without coupling tests to
  exact wording.
  """

  use ExUnit.Case, async: true

  alias Symphony.StatusDashboard

  describe "humanize_codex_message/1" do
    test "nil yields a stable placeholder" do
      assert StatusDashboard.humanize_codex_message(nil) == "no codex message yet"
    end

    test "session_started extracts session id when present" do
      result =
        StatusDashboard.humanize_codex_message(%{
          event: :session_started,
          message: %{"session_id" => "abc-123"}
        })

      assert result =~ "session started"
      assert result =~ "abc-123"
    end

    test "turn_input_required has a deterministic phrase" do
      assert StatusDashboard.humanize_codex_message(%{
               event: :turn_input_required,
               message: %{}
             }) == "turn blocked: waiting for user input"
    end

    test "turn/completed surfaces the status and token usage" do
      result =
        StatusDashboard.humanize_codex_message(%{
          event: :turn_completed,
          message: %{
            "method" => "turn/completed",
            "params" => %{
              "turn" => %{"status" => "succeeded"},
              "usage" => %{"input_tokens" => 12, "output_tokens" => 34, "total_tokens" => 46}
            }
          }
        })

      assert result =~ "turn completed"
      assert result =~ "succeeded"
      assert result =~ "in 12"
      assert result =~ "out 34"
      assert result =~ "total 46"
    end

    test "atom-keyed payloads work via the alternate-key fallback" do
      result =
        StatusDashboard.humanize_codex_message(%{
          event: :turn_started,
          message: %{method: "turn/started", params: %{turn: %{id: "t-77"}}}
        })

      assert result =~ "turn started"
      assert result =~ "t-77"
    end

    test "unknown events fall back to inspect-style payload preview" do
      result =
        StatusDashboard.humanize_codex_message(%{
          event: :nonexistent_event_xyz,
          message: %{"some" => "payload"}
        })

      assert is_binary(result)
      assert byte_size(result) > 0
    end

    test "result is always truncated to 140 chars" do
      huge_message = String.duplicate("x", 1_000)

      result =
        StatusDashboard.humanize_codex_message(%{
          event: :unknown,
          message: huge_message
        })

      assert byte_size(result) <= 143
    end

    test "binary message is sanitized of control bytes and ANSI escapes" do
      result =
        StatusDashboard.humanize_codex_message(%{
          event: :unknown,
          message: "hello\x1B[31mworld\x00"
        })

      assert result =~ "hello"
      assert result =~ "world"
      refute result =~ "\x1B"
      refute result =~ "\x00"
    end
  end

  describe "humanize_event/2" do
    test "delegates to humanize_codex_message with the right shape" do
      assert StatusDashboard.humanize_event(:session_started, %{"session_id" => "x"}) =~
               "session started"
    end
  end

  describe "recent_events/2" do
    test "extracts events from a snapshot's running rows" do
      now = DateTime.utc_now()
      earlier = DateTime.add(now, -10, :second)

      snapshot = %{
        running: [
          %{
            identifier: "WGTE-001",
            issue_id: "x",
            last_codex_event: :session_started,
            last_codex_message: %{"session_id" => "abc"},
            last_codex_timestamp: earlier
          },
          %{
            identifier: "WGTE-002",
            issue_id: "y",
            last_codex_event: :turn_input_required,
            last_codex_message: %{},
            last_codex_timestamp: now
          }
        ]
      }

      events = StatusDashboard.recent_events(snapshot, limit: 10)

      assert is_list(events)
      assert length(events) == 2
      # Most recent (now) should sort first
      assert hd(events).identifier == "WGTE-002"
      assert hd(events).summary =~ "turn blocked"
    end

    test "skips entries without a last_codex_event" do
      snapshot = %{
        running: [
          %{
            identifier: "X",
            last_codex_event: nil,
            last_codex_message: nil,
            last_codex_timestamp: nil
          }
        ]
      }

      assert StatusDashboard.recent_events(snapshot) == []
    end

    test "tolerates missing :running key" do
      assert StatusDashboard.recent_events(%{}) == []
    end
  end

  describe "notify_update/0" do
    test "no-ops gracefully when pubsub server isn't running" do
      # In :test env Symphony.PubSub is not started; should NOT raise.
      assert StatusDashboard.notify_update() == :ok
    end
  end

  describe "spec § 13.6 invariant — observability only" do
    test "humanized helpers stay pure (orchestrator must not depend on them)" do
      # Originally this asserted that `StatusDashboard` was a pure-helpers
      # module (no `start_link/1`). After we ported upstream's status
      # dashboard wholesale, `StatusDashboard` is now a GenServer that
      # owns terminal rendering, token sampling, and throttled re-renders.
      # The spec § 13.6 invariant we still uphold: the orchestrator must
      # never depend on humanized strings. Enforced as a static check
      # against `lib/symphony/orchestrator.ex` source.
      orchestrator_source = File.read!("lib/symphony/orchestrator.ex")
      refute orchestrator_source =~ "StatusDashboard.humanize"
      refute orchestrator_source =~ "StatusDashboard.recent_events"
      refute orchestrator_source =~ "StatusDashboard.format_snapshot_content"
    end
  end
end
